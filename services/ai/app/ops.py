"""Opérations image. Implémentations LÉGÈRES (Pillow) pour que le pipeline tourne sans GPU.

Pour la qualité de production, remplacer le corps de chaque fonction (la signature ne change pas) :
  - upscale       -> Real-ESRGAN
  - restore_face  -> GFPGAN / CodeFormer
  - remove_bg     -> rembg (utilisé automatiquement s'il est installé : `pip install rembg`)
"""
import logging
from io import BytesIO

from PIL import Image, ImageColor, ImageFilter, ImageOps, UnidentifiedImageError

log = logging.getLogger("styleme.ai")

MAX_INPUT_PIXELS = 40_000_000
MAX_OUTPUT_PIXELS = 64_000_000
Image.MAX_IMAGE_PIXELS = MAX_INPUT_PIXELS


class BadImage(ValueError):
    """Image illisible, corrompue ou trop grande."""


def load(data: bytes) -> Image.Image:
    try:
        img = Image.open(BytesIO(data))
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as e:
        raise BadImage(f"unreadable image: {e}") from e
    if img.width * img.height > MAX_INPUT_PIXELS:
        raise BadImage("image too large")
    img = ImageOps.exif_transpose(img)  # respecte l'orientation des photos de téléphone
    return img.convert("RGBA" if "A" in img.getbands() else "RGB")


def to_png(img: Image.Image) -> bytes:
    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def upscale(img: Image.Image, factor: int) -> Image.Image:
    if factor == 1:
        return img
    if img.width * img.height * factor * factor > MAX_OUTPUT_PIXELS:
        raise BadImage("image too large to upscale")
    return img.resize((img.width * factor, img.height * factor), Image.Resampling.LANCZOS)


def restore_face(img: Image.Image) -> Image.Image:
    # Stand-in : léger renforcement de netteté. À remplacer par GFPGAN pour une vraie restauration.
    return img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=3))


_warned_no_rembg = False
_rembg_session = None


def remove_background(img: Image.Image) -> Image.Image:
    """Détourage réel avec rembg (modèle u2net, CPU). Le modèle est chargé une seule fois."""
    global _warned_no_rembg, _rembg_session
    try:
        from rembg import new_session, remove  # type: ignore[import-not-found]
    except ImportError:
        if not _warned_no_rembg:
            log.warning("rembg non installé : le fond n'est PAS retiré (image renvoyée telle quelle).")
            _warned_no_rembg = True
        return img
    if _rembg_session is None:
        _rembg_session = new_session("u2net")
    return remove(img, session=_rembg_session)


# Fonds d'occasion : dégradé vertical (haut, bas). Les ids sont ceux de StyleTemplate (prisma/seed.ts).
TEMPLATE_BACKGROUNDS: dict[str, tuple[str, str]] = {
    "mariage": ("#FDF3F0", "#E8C4BC"),
    "anniversaire": ("#FFD36E", "#FF6B6B"),
    "bapteme": ("#E8F3FF", "#BFD9F2"),
    "diplome": ("#1F3A68", "#0E1B38"),
    "fetes": ("#0B3D2E", "#8B1E2D"),
    "saint-valentin": ("#FF9EB5", "#C2185B"),
    "pro-linkedin": ("#E9EEF5", "#AEB9CC"),
    "cv": ("#F5F5F5", "#D9D9D9"),
    "fond-studio": ("#CFCFCF", "#8F8F8F"),
}


class UnknownTemplate(ValueError):
    """Identifiant de style inconnu."""


def _gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    w, h = size
    c1, c2 = ImageColor.getrgb(top), ImageColor.getrgb(bottom)
    column = Image.new("RGB", (1, h))
    column.putdata([tuple(round(a + (b - a) * y / max(h - 1, 1)) for a, b in zip(c1, c2)) for y in range(h)])
    return column.resize((w, h))


def apply_template(img: Image.Image, template_id: str) -> Image.Image:
    """Pose le sujet détouré (RGBA) sur le fond de l'occasion."""
    colors = TEMPLATE_BACKGROUNDS.get(template_id)
    if colors is None:
        raise UnknownTemplate(f"unknown template: {template_id}")
    if "A" not in img.getbands():
        raise BadImage("subject must be cut out first (run remove-bg before apply-template)")
    bg = _gradient(img.size, *colors).convert("RGBA")
    return Image.alpha_composite(bg, img).convert("RGB")
