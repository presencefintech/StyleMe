"""Opérations image. Implémentations LÉGÈRES (Pillow) pour que le pipeline tourne sans GPU.

Pour la qualité de production, remplacer le corps de chaque fonction (la signature ne change pas) :
  - upscale       -> Real-ESRGAN
  - restore_face  -> GFPGAN / CodeFormer
  - remove_bg     -> rembg (utilisé automatiquement s'il est installé : `pip install rembg`)
"""
import logging
from io import BytesIO

from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError

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


def remove_background(img: Image.Image) -> Image.Image:
    global _warned_no_rembg
    try:
        from rembg import remove  # type: ignore[import-not-found]
    except ImportError:
        if not _warned_no_rembg:
            log.warning("rembg non installé : le fond n'est PAS retiré (image renvoyée telle quelle).")
            _warned_no_rembg = True
        return img
    return remove(img)
