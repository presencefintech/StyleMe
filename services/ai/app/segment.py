"""Sélection d'un objet par clic (SAM via rembg), pour la gomme magique.

rembg fusionne tous les masques candidats de SAM en un seul (union), ce qui sélectionne presque toute
l'image. On refait donc le décodage ici pour récupérer chaque masque avec son score et choisir le bon.

SAM se fait en deux temps, et c'est ce qui rend la gomme fluide :
  - encode()  : analyse la photo UNE fois (lent : plusieurs secondes sur CPU) ;
  - decode()  : trouve l'objet sous un clic à partir de cette analyse (rapide : une fraction de seconde).
Le service garde l'analyse en mémoire : seul le premier clic sur une photo est lent.
"""
import base64
import logging
import time
from io import BytesIO
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

log = logging.getLogger("styleme.ai")

MAX_SIDE = 2048          # taille max de travail (limite aussi le coût du modèle et de l'éditeur)
MAX_OBJECT_AREA = 0.6    # au-delà, un masque est probablement le fond ou toute la scène
HARD_MAX_AREA = 0.85     # seuil de repli : au-delà, on considère qu'il n'y a vraiment pas d'objet
_INPUT_SIZE = (684, 1024)


class NoObjectFound(ValueError):
    """Aucun objet exploitable à cet endroit."""


@dataclass(frozen=True)
class Candidate:
    mask: np.ndarray  # bool, taille de l'image
    score: float


@dataclass(frozen=True)
class Prepared:
    """Analyse d'une photo par l'encodeur SAM, réutilisable pour autant de clics que voulu."""

    embedding: np.ndarray
    original_size: tuple[int, int]  # (hauteur, largeur)
    transform: np.ndarray


_session = None


def _sam():
    global _session
    if _session is None:
        from rembg import new_session  # type: ignore[import-not-found]

        _session = new_session("sam")
    return _session


def warmup() -> float:
    """Charge le modèle SAM et fait passer une image factice dans l'encodeur ET le décodeur.

    Sans cela, la première vraie photo paie le chargement des modèles (plusieurs dizaines de secondes sur un petit CPU).
    Renvoie la durée en secondes.
    """
    started = time.perf_counter()
    dummy = Image.new("RGB", (256, 256), (128, 128, 128))
    decode(encode(dummy), 128, 128)
    return time.perf_counter() - started


def fit_max_side(img: Image.Image, max_side: int = MAX_SIDE) -> Image.Image:
    if max(img.size) <= max_side:
        return img
    scale = max_side / max(img.size)
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.Resampling.LANCZOS)


def encode(img: Image.Image) -> Prepared:
    """Étape lente : analyse la photo avec l'encodeur SAM."""
    from rembg.sessions.sam import warp_affine  # type: ignore[import-not-found]

    started = time.perf_counter()
    s = _sam()
    arr = np.array(img.convert("RGB"))
    scale = min(_INPUT_SIZE[1] / arr.shape[1], _INPUT_SIZE[0] / arr.shape[0])
    transform = np.array([[scale, 0, 0], [0, scale, 0], [0, 0, 1]])
    resized = warp_affine(arr, transform[:2], _INPUT_SIZE)
    embedding = s.encoder.run(None, {s.encoder.get_inputs()[0].name: resized.astype(np.float32)})[0]
    log.info("segment encode %dx%d en %.1fs", img.width, img.height, time.perf_counter() - started)
    return Prepared(embedding, arr.shape[:2], transform)


def decode(prepared: Prepared, x: int, y: int) -> list[Candidate]:
    """Étape rapide : masques candidats de SAM pour un clic en (x, y), en pixels de la photo."""
    from rembg.sessions.sam import apply_coords, transform_masks  # type: ignore[import-not-found]

    started = time.perf_counter()
    s = _sam()
    coords = np.concatenate([np.array([[x, y]]), np.array([[0.0, 0.0]])], axis=0)[None, :, :]
    labels = np.concatenate([np.array([1]), np.array([-1])], axis=0)[None, :].astype(np.float32)
    coords = apply_coords(coords, _INPUT_SIZE, 1024).astype(np.float32)
    coords = np.concatenate([coords, np.ones((1, coords.shape[1], 1), dtype=np.float32)], axis=2)
    coords = np.matmul(coords, prepared.transform.T)[:, :, :2].astype(np.float32)

    masks, scores, _ = s.decoder.run(
        None,
        {
            "image_embeddings": prepared.embedding,
            "point_coords": coords,
            "point_labels": labels,
            "mask_input": np.zeros((1, 1, 256, 256), dtype=np.float32),
            "has_mask_input": np.zeros(1, dtype=np.float32),
            "orig_im_size": np.array(_INPUT_SIZE, dtype=np.float32),
        },
    )
    masks = transform_masks(masks, prepared.original_size, np.linalg.inv(prepared.transform))
    log.info("segment decode en %.2fs", time.perf_counter() - started)
    return [Candidate(masks[0, i] > 0.0, float(scores[0, i])) for i in range(masks.shape[1])]


def pick_mask(candidates: list[Candidate], x: int, y: int, max_area: float = MAX_OBJECT_AREA) -> np.ndarray:
    """Meilleur masque contenant le clic.

    On préfère le mieux noté parmi les masques « de taille d'objet ». Si tous sont grands (gros objet, personne,
    meuble), on retombe sur le PLUS PETIT masque qui contient le clic, plutôt que de refuser : l'utilisateur voit la
    sélection et peut retoucher son clic. On ne refuse que si même celui-là couvre presque toute l'image.
    """
    containing = [c for c in candidates if c.mask[y, x]]
    usable = [c for c in containing if c.mask.mean() <= max_area]
    if usable:
        return max(usable, key=lambda c: c.score).mask
    fallback = [c for c in containing if c.mask.mean() <= HARD_MAX_AREA]
    if fallback:
        return min(fallback, key=lambda c: c.mask.mean()).mask
    raise NoObjectFound("no object found at that point")


def dilate(mask: Image.Image, px: int) -> Image.Image:
    """Agrandit légèrement la sélection : la gomme remplit mieux quand le masque déborde un peu de l'objet."""
    if px <= 0:
        return mask
    return mask.filter(ImageFilter.MaxFilter(2 * px + 1))


def select_object(img: Image.Image, prepared: Prepared, nx: float, ny: float) -> Image.Image:
    """Masque L (255 = objet à enlever) pour un clic en coordonnées normalisées (0..1)."""
    x = min(max(int(nx * img.width), 0), img.width - 1)
    y = min(max(int(ny * img.height), 0), img.height - 1)
    cands = decode(prepared, x, y)
    log.info(
        "segment click=(%d,%d) image=%dx%d candidates=%s",
        x, y, img.width, img.height,
        [(round(float(c.mask.mean()), 3), round(c.score, 3), bool(c.mask[y, x])) for c in cands],  # (aire, score, contient le clic)
    )
    mask = pick_mask(cands, x, y)
    out = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    return dilate(out, max(3, round(0.006 * max(img.size))))


def overlay(img: Image.Image, mask: Image.Image) -> Image.Image:
    """Aperçu lisible sur toutes les couleurs : le reste de la photo est assombri, l'objet garde ses couleurs
    et un contour blanc l'entoure (une teinte rouge serait invisible sur un objet rouge)."""
    base = img.convert("RGB")
    dimmed = ImageEnhance.Brightness(base).enhance(0.4)
    out = Image.composite(base, dimmed, mask)
    ring = max(2, round(0.004 * max(img.size)))
    edge = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(2 * ring + 1)), mask)
    out.paste((255, 255, 255), mask=edge)
    return out


PREVIEW_SIDE = 1024  # l'aperçu est réduit : léger à transmettre, rapide à afficher


def overlay_data_url(img: Image.Image, mask: Image.Image) -> str:
    """Aperçu de la sélection en data URL JPEG (aucun passage par le stockage : affichage instantané)."""
    small = fit_max_side(img.convert("RGB"), PREVIEW_SIDE)
    small_mask = mask if mask.size == small.size else mask.resize(small.size, Image.Resampling.BILINEAR)
    buf = BytesIO()
    overlay(small, small_mask).save(buf, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


MIN_BOX_AREA = 0.0004  # fraction de l'image : en dessous, ce n'est pas une sélection mais un clic raté


def box_mask(size: tuple[int, int], box: tuple[float, float, float, float]) -> Image.Image:
    """Masque L (255 = zone à enlever) pour un rectangle tracé à la main, en coordonnées normalisées (0..1).

    Comme un outil de capture d'écran : c'est exactement la zone tracée, ni plus ni moins.
    """
    w, h = size
    x0, y0, x1, y1 = box
    if (x1 - x0) * (y1 - y0) < MIN_BOX_AREA:
        raise NoObjectFound("selection too small")
    mask = Image.new("L", size, 0)
    mask.paste(255, (int(x0 * w), int(y0 * h), max(int(x1 * w), int(x0 * w) + 1), max(int(y1 * h), int(y0 * h) + 1)))
    return mask
