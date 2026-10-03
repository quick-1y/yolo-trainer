"""Pure image validation, thumbnail generation and filename hygiene (no DB, no disk layout).

The torch-free api image ships Pillow but no array library, so everything here
is Pillow-only.
"""

from __future__ import annotations

import io
import re
import unicodedata
from dataclasses import dataclass
from pathlib import PurePosixPath

from PIL import Image, ImageFile

# Pillow `im.format` -> stored file extension. "MPO" is a multi-picture JPEG.
FORMAT_EXT: dict[str, str] = {
    "JPEG": "jpg",
    "MPO": "jpg",
    "PNG": "png",
    "WEBP": "webp",
    "BMP": "bmp",
}
EXT_MEDIA: dict[str, str] = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "bmp": "image/bmp",
}
# Extensions the client may offer (case-insensitive); the *stored* extension
# always comes from the decoded format, never from the uploaded name.
ACCEPTED_EXTENSIONS: tuple[str, ...] = ("jpg", "jpeg", "png", "webp", "bmp")
# Ultralytics' check_image asserts both sides > 9.
MIN_SIDE = 10

_MAX_FILENAME_LENGTH = 255
_ORIENTATION_TAG = 0x0112
# EXIF orientation -> Pillow transpose op; identical to what
# `ImageOps.exif_transpose` applies, but independent of `im.info` surviving
# the convert/thumbnail steps (D-17).
_ORIENTATION_TRANSPOSE: dict[int, Image.Transpose] = {
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_270,
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_90,
}
_HIGH_BIT_DEPTH_MODES = ("I;16", "I;16L", "I;16B", "I;16N", "I", "F")
_CONTROL_CHARS = {chr(code_point) for code_point in range(0x20)} | {chr(0x7F)}
_ESCAPED_NEWLINES = re.compile(r"%0[DA]", re.IGNORECASE)
_ESCAPED_QUOTE = re.compile(r"%22")


class Rejected(Exception):  # noqa: N818 - domain name used across the plan's contracts
    """A file was refused; `reason` is plain English shown to the user (D-05)."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass
class Processed:
    ext: str
    width: int  # after EXIF orientation (D-17)
    height: int
    thumb: bytes  # WEBP


def _scale_to_8bit(im: Image.Image) -> Image.Image:
    """Linearly map a 16-bit / 32-bit integer or float image onto 0..255 as "RGB"."""
    if im.mode.startswith("I;16"):
        im = im.convert("I")
        hi = 65535.0
    else:
        extrema = im.getextrema()
        hi = max(float(extrema[1]), 1.0)  # type: ignore[index]
    scale = 255.0 / hi
    scaled = im.point(lambda value: value * scale)
    return scaled.convert("L").convert("RGB")


def _webp_ready(im: Image.Image) -> Image.Image:
    if im.mode in ("RGB", "RGBA"):
        return im
    if im.mode in _HIGH_BIT_DEPTH_MODES:
        return _scale_to_8bit(im)
    if im.mode in ("LA", "PA") or im.has_transparency_data:
        return im.convert("RGBA")
    return im.convert("RGB")


def _read_orientation(im: Image.Image) -> int:
    try:
        value = im.getexif().get(_ORIENTATION_TAG, 1)
    except Exception:  # noqa: BLE001 - a broken EXIF block must not reject the image
        return 1
    return value if isinstance(value, int) and 1 <= value <= 8 else 1


def process_image(source, *, thumb_size: int, max_pixels: int) -> Processed:  # noqa: ANN001
    """Validate and decode `source` (a path or binary file object) and build a thumbnail.

    Raises `Rejected` with a plain-English reason for anything unusable. The
    full `load()` is the corruption check: Pillow's header-only verification
    misses truncated files.
    """
    try:
        with Image.open(source) as im:
            fmt = im.format
            if fmt not in FORMAT_EXT:
                raise Rejected("Unsupported image format. Accepted: JPEG, PNG, WEBP, BMP.")
            width, height = im.size  # header only, nothing decoded yet
            if min(width, height) < MIN_SIDE:
                raise Rejected(f"The image is too small (minimum {MIN_SIDE}x{MIN_SIDE} pixels).")
            if width * height > max_pixels:
                raise Rejected(
                    f"The image has too many pixels (maximum {max_pixels // 1_000_000} megapixels)."
                )
            orientation = _read_orientation(im)
            if fmt in ("JPEG", "MPO"):
                # Decode at reduced size; truncation is still detected.
                im.draft("RGB", (2 * thumb_size, 2 * thumb_size))
            im.load()
            if getattr(im, "n_frames", 1) > 1:
                im.seek(0)  # animated / multi-picture: first frame
            thumb = _webp_ready(im)
            thumb.thumbnail((thumb_size, thumb_size), Image.Resampling.LANCZOS, reducing_gap=2.0)
            transpose = _ORIENTATION_TRANSPOSE.get(orientation)
            if transpose is not None:
                thumb = thumb.transpose(transpose)
            if orientation in (5, 6, 7, 8):
                width, height = height, width
            out = io.BytesIO()
            thumb.save(out, "WEBP", quality=80, method=4)
    except Rejected:
        raise
    except Image.DecompressionBombError as exc:
        raise Rejected(
            f"The image has too many pixels (maximum {max_pixels // 1_000_000} megapixels)."
        ) from exc
    except Exception as exc:  # noqa: BLE001 - Pillow raises OSError, SyntaxError, ValueError, ...
        raise Rejected("The file is not a valid image or is corrupt.") from exc
    return Processed(FORMAT_EXT[fmt], width, height, out.getvalue())


def clean_filename(raw: str) -> str:
    """Reduce a client-supplied name to a safe display name.

    Display/search data only - never part of a filesystem path (D-18), so this
    is hygiene rather than the traversal defence. Browsers percent-encode `"`,
    CR and LF in multipart filenames, so those sequences are undone/dropped.
    """
    name = _ESCAPED_QUOTE.sub('"', raw)
    name = _ESCAPED_NEWLINES.sub("", name)
    name = name.replace("\\", "/")
    name = PurePosixPath(name).name
    name = unicodedata.normalize("NFC", name)
    name = "".join(char for char in name if char not in _CONTROL_CHARS).strip()
    if name in ("", ".", ".."):
        return "unnamed"
    if len(name) > _MAX_FILENAME_LENGTH:
        suffix = PurePosixPath(name).suffix
        if suffix and len(suffix) < _MAX_FILENAME_LENGTH // 2:
            name = name[: _MAX_FILENAME_LENGTH - len(suffix)] + suffix
        else:
            name = name[:_MAX_FILENAME_LENGTH]
    return name


# Explicit guard: a truncated file must fail `load()` and be rejected, never be
# silently accepted with a grey bottom half.
ImageFile.LOAD_TRUNCATED_IMAGES = False
