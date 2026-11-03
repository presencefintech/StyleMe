import logging
import os
import threading
import time
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from functools import lru_cache
from io import BytesIO
from typing import Annotated, Callable

from fastapi import Depends, FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel, field_validator, model_validator

from . import ops, segment
from .config import Settings
from .storage import Storage, StorageError, SupabaseStorage

logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s %(message)s")
log = logging.getLogger("styleme.ai")

# Buckets que ce service a le droit de lire ; il n'écrit que dans "results".
READABLE_BUCKETS = {"sources", "results"}
RESULTS_BUCKET = "results"

def _init_sentry() -> None:
    """Suivi des erreurs, actif seulement si SENTRY_DSN est défini. Aucune donnée personnelle n'est envoyée."""
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return
    import sentry_sdk

    def scrub(event, _hint):
        event.pop("request", None)  # les corps de requête contiennent des clés "<userId>/..."
        event.pop("user", None)
        return event

    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("RAILWAY_ENVIRONMENT_NAME", "development"),
        send_default_pii=False,
        include_local_variables=False,
        traces_sample_rate=0,
        before_send=scrub,
    )
    log.info("Sentry activé")


_init_sentry()


def _warm_models() -> None:
    """Charge les modèles en tâche de fond au démarrage : le service répond tout de suite à /health,
    et la première vraie photo n'attend plus le chargement des modèles."""
    try:
        # Utile pour régler les threads ONNX (OMP_NUM_THREADS) : un conteneur voit souvent tous les cœurs de l'hôte.
        usable = len(os.sched_getaffinity(0)) if hasattr(os, "sched_getaffinity") else None
        log.info("CPU : os.cpu_count=%s, utilisables=%s, OMP_NUM_THREADS=%s", os.cpu_count(), usable, os.environ.get("OMP_NUM_THREADS"))
        with _sam_lock:
            log.info("préchauffage SAM : %.1fs", segment.warmup())
            log.info("préchauffage détourage : %.1fs", ops.warmup_cutout())
    except Exception:  # noqa: BLE001 - un échec de préchauffage ne doit jamais empêcher le service de tourner
        log.exception("préchauffage échoué (les modèles se chargeront à la première requête)")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Désactivé par défaut : sur Railway, charger SAM + u2net dès le démarrage dépasse la mémoire du conteneur (le processus
    # est tué en boucle et l'API perd la modération). À activer (AI_WARMUP=1) seulement si le service a assez de RAM.
    if os.environ.get("AI_WARMUP", "0") == "1":
        threading.Thread(target=_warm_models, name="warmup", daemon=True).start()
    yield


app = FastAPI(title="StyleMe AI service", docs_url=None, redoc_url=None, lifespan=lifespan)


# --- Dépendances (surchargées dans les tests) ---------------------------------------------------

@lru_cache
def get_settings() -> Settings:
    return Settings.from_env()


@lru_cache
def get_storage() -> Storage:
    s = get_settings()
    return SupabaseStorage(s.supabase_url, s.service_key)


SettingsDep = Annotated[Settings, Depends(get_settings)]
StorageDep = Annotated[Storage, Depends(get_storage)]


# --- Contrat avec l'API Node (voir apps/api/src/infrastructure/ai/local-ai.ts) ------------------

class ImageRef(BaseModel):
    bucket: str
    key: str

    @field_validator("bucket")
    @classmethod
    def _bucket(cls, v: str) -> str:
        if v not in READABLE_BUCKETS:
            raise ValueError("bucket not allowed")
        return v

    @field_validator("key")
    @classmethod
    def _key(cls, v: str) -> str:
        parts = v.split("/")
        if not v or len(v) > 512 or v.startswith("/") or any(p in ("", ".", "..") for p in parts):
            raise ValueError("invalid key")
        return v


class TemplateRequest(ImageRef):
    templateId: str


class ModerationRequest(ImageRef):
    stage: str


class Box(BaseModel):
    """Rectangle tracé par l'utilisateur, en coordonnées normalisées (0..1) de l'image affichée."""

    x0: float
    y0: float
    x1: float
    y1: float

    @model_validator(mode="after")
    def _valid(self) -> "Box":
        if not all(0.0 <= v <= 1.0 for v in (self.x0, self.y0, self.x1, self.y1)):
            raise ValueError("coordinates must be between 0 and 1")
        if self.x1 <= self.x0 or self.y1 <= self.y0:
            raise ValueError("box must have a positive size")
        return self


class SegmentRequest(ImageRef):
    # Un clic (x, y) OU un rectangle (box), en coordonnées normalisées (0..1) de l'image affichée.
    x: float | None = None
    y: float | None = None
    box: Box | None = None

    @model_validator(mode="after")
    def _target(self) -> "SegmentRequest":
        has_point = self.x is not None and self.y is not None
        if has_point == (self.box is not None):  # ni l'un ni l'autre, ou les deux
            raise ValueError("provide either x and y, or box")
        if has_point and not (0.0 <= self.x <= 1.0 and 0.0 <= self.y <= 1.0):  # type: ignore[operator]
            raise ValueError("coordinate must be between 0 and 1")
        return self


class SegmentResponse(BaseModel):
    selectionId: str  # à renvoyer à /commit pour confirmer cette sélection
    overlay: str      # aperçu (data URL JPEG) : photo assombrie, objet entouré de blanc


class CommitRequest(ImageRef):
    selectionId: str


class CommitResponse(BaseModel):
    image: ImageRef  # photo normalisée (orientation EXIF appliquée, 2048 px max) : la gomme travaille dessus
    mask: ImageRef   # masque PNG, blanc = objet à enlever, mêmes dimensions que l'image


class ModerationResponse(BaseModel):
    approved: bool
    nsfwScore: float
    minorRisk: bool
    faceCount: int


# --- Pipeline commun ----------------------------------------------------------------------------

def _run(ref: ImageRef, storage: Storage, transform: Callable[[Image.Image], Image.Image]) -> ImageRef:
    try:
        img = ops.load(storage.download(ref.bucket, ref.key))
        out = transform(img)
        owner = ref.key.split("/")[0]  # les clés sont "<userId>/<fichier>"
        out_ref = ImageRef(bucket=RESULTS_BUCKET, key=f"{owner}/{uuid.uuid4().hex}.png")
        storage.upload(out_ref.bucket, out_ref.key, ops.to_png(out), "image/png")
        return out_ref
    except ops.BadImage as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except StorageError as e:
        log.error("storage error: %s", e)
        raise HTTPException(status_code=502, detail="storage unavailable") from e


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/upscale")
def upscale(ref: ImageRef, storage: StorageDep, settings: SettingsDep) -> ImageRef:
    return _run(ref, storage, lambda img: ops.upscale(img, settings.upscale_factor))


@app.post("/restore-face")
def restore_face(ref: ImageRef, storage: StorageDep) -> ImageRef:
    return _run(ref, storage, ops.restore_face)


@app.post("/remove-bg")
def remove_bg(ref: ImageRef, storage: StorageDep) -> ImageRef:
    return _run(ref, storage, ops.remove_background)


@app.post("/apply-template")
def apply_template(req: TemplateRequest, storage: StorageDep) -> ImageRef:
    if req.templateId not in ops.TEMPLATE_BACKGROUNDS:
        raise HTTPException(status_code=422, detail="unknown template")
    return _run(req, storage, lambda img: ops.apply_template(img, req.templateId))


# --- Gomme magique : l'analyse SAM d'une photo est gardée en mémoire (seul le 1er clic est lent) ---------

class _Entry:
    """Photo normalisée + son analyse SAM + sa copie dans le storage (envoyée une seule fois)."""

    def __init__(self, base: Image.Image, prepared: segment.Prepared):
        self.base = base
        self.prepared = prepared
        self.base_ref: ImageRef | None = None


_CACHE_MAX = 6
_cache: "OrderedDict[tuple[str, str], _Entry]" = OrderedDict()
# SAM tourne sur CPU : on sérialise les calculs (et un clic arrivant pendant l'analyse de la même photo
# attend simplement la fin de cette analyse, au lieu de la refaire).
_sam_lock = threading.Lock()


def _entry(ref: ImageRef, storage: Storage) -> _Entry:
    """À appeler avec _sam_lock pris."""
    key = (ref.bucket, ref.key)
    entry = _cache.get(key)
    if entry is not None:
        _cache.move_to_end(key)
        return entry
    base = segment.fit_max_side(ops.load(storage.download(ref.bucket, ref.key))).convert("RGB")
    entry = _Entry(base, segment.encode(base))
    _cache[key] = entry
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)
    return entry


def _put(storage: Storage, owner: str, uid: str, name: str, img: Image.Image, fmt: str, content_type: str) -> ImageRef:
    buf = BytesIO()
    img.save(buf, format=fmt, **({"quality": 90} if fmt == "JPEG" else {}))
    ref = ImageRef(bucket=RESULTS_BUCKET, key=f"{owner}/{uid}.{name}")
    storage.upload(ref.bucket, ref.key, buf.getvalue(), content_type)
    return ref


class PrepareResponse(BaseModel):
    ready: bool


@app.post("/prepare")
def prepare(ref: ImageRef, storage: StorageDep) -> PrepareResponse:
    """Prépare une photo (téléchargement + analyse SAM) pour que le premier clic soit rapide."""
    try:
        with _sam_lock:
            _entry(ref, storage)
        return PrepareResponse(ready=True)
    except ops.BadImage as e:
        raise HTTPException(status_code=415, detail=str(e)) from e
    except StorageError as e:
        log.error("storage error: %s", e)
        raise HTTPException(status_code=502, detail="storage unavailable") from e


# Sélections en attente : l'aperçu est instantané (rien n'est envoyé au stockage) ; le masque n'est envoyé
# qu'à la confirmation (/commit).
_SELECTIONS_MAX = 64
_selections: "OrderedDict[str, tuple[str, str, bytes]]" = OrderedDict()  # id -> (bucket, key, masque PNG)


@app.post("/segment")
def segment_object(req: SegmentRequest, storage: StorageDep) -> SegmentResponse:
    """Gomme magique, étape 1 : trouve l'objet sous le clic ou le survol et renvoie un aperçu (data URL).

    Volontairement léger (analyse en cache + décodage ≈ 0,1 s) : le front l'appelle aussi au survol de la souris.
    """
    started = time.perf_counter()
    try:
        with _sam_lock:
            entry = _entry(req, storage)
            if req.box is not None:
                b = req.box
                mask = segment.box_mask(entry.base.size, (b.x0, b.y0, b.x1, b.y1))
            else:
                mask = segment.select_object(entry.base, entry.prepared, req.x, req.y)  # type: ignore[arg-type]
            preview = segment.overlay_data_url(entry.base, mask)
        buf = BytesIO()
        mask.save(buf, format="PNG")
        selection_id = uuid.uuid4().hex
        _selections[selection_id] = (req.bucket, req.key, buf.getvalue())
        while len(_selections) > _SELECTIONS_MAX:
            _selections.popitem(last=False)
        log.info("segment total %.2fs", time.perf_counter() - started)
        return SegmentResponse(selectionId=selection_id, overlay=preview)
    except segment.NoObjectFound as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except ops.BadImage as e:
        raise HTTPException(status_code=415, detail=str(e)) from e
    except StorageError as e:
        log.error("storage error: %s", e)
        raise HTTPException(status_code=502, detail="storage unavailable") from e


@app.post("/commit")
def commit_selection(req: CommitRequest, storage: StorageDep) -> CommitResponse:
    """Gomme magique, étape 2 : la sélection est confirmée, on envoie la photo normalisée et le masque."""
    sel = _selections.get(req.selectionId)
    if sel is None or (sel[0], sel[1]) != (req.bucket, req.key):
        raise HTTPException(status_code=404, detail="selection expired")
    try:
        owner = req.key.split("/")[0]
        with _sam_lock:
            entry = _entry(req, storage)
        uid = uuid.uuid4().hex
        # La photo normalisée n'est envoyée qu'une fois : les confirmations suivantes réutilisent la même copie.
        if entry.base_ref is None:
            entry.base_ref = _put(storage, owner, uid, "base.jpg", entry.base, "JPEG", "image/jpeg")
        mask_ref = ImageRef(bucket=RESULTS_BUCKET, key=f"{owner}/{uid}.mask.png")
        storage.upload(mask_ref.bucket, mask_ref.key, sel[2], "image/png")
        return CommitResponse(image=entry.base_ref, mask=mask_ref)
    except ops.BadImage as e:
        raise HTTPException(status_code=415, detail=str(e)) from e
    except StorageError as e:
        log.error("storage error: %s", e)
        raise HTTPException(status_code=502, detail="storage unavailable") from e


@app.post("/moderate")
def moderate(req: ModerationRequest, settings: SettingsDep) -> ModerationResponse:
    if settings.moderation_mode == "dev-permissive":
        log.warning("MODÉRATION DÉSACTIVÉE (dev-permissive) : image %s/%s approuvée sans analyse.", req.bucket, req.key)
        return ModerationResponse(approved=True, nsfwScore=0.0, minorRisk=False, faceCount=1)
    # Fail-closed : sans classifieur configuré, on refuse de répondre plutôt que d'approuver à l'aveugle.
    raise HTTPException(
        status_code=503,
        detail="moderation not configured (set AI_MODERATION_MODE, or use MODERATION_PROVIDER=sightengine on the API)",
    )
