import logging
import uuid
from functools import lru_cache
from typing import Annotated, Callable

from fastapi import Depends, FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel, field_validator

from . import ops
from .config import Settings
from .storage import Storage, StorageError, SupabaseStorage

log = logging.getLogger("styleme.ai")

# Buckets que ce service a le droit de lire ; il n'écrit que dans "results".
READABLE_BUCKETS = {"sources", "results"}
RESULTS_BUCKET = "results"

app = FastAPI(title="StyleMe AI service", docs_url=None, redoc_url=None)


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
def apply_template(_: TemplateRequest) -> ImageRef:
    raise HTTPException(status_code=501, detail="templates are not implemented yet")


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
