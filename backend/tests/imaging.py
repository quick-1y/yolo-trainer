"""Generators for in-test image files (formats, pixel modes, EXIF orientation, truncation).

Shared by the image-processing unit tests and the upload API tests. Everything
is drawn with Pillow so no binary fixtures live in the repository.
"""

from __future__ import annotations

import io

from PIL import Image, ImageDraw

_ORIENTATION_TAG = 0x0112


def _pattern(size: tuple[int, int]) -> Image.Image:
    """A non-uniform RGB picture so every encoder keeps distinct pixels."""
    width, height = size
    image = Image.new("RGB", size, (30, 60, 90))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, width // 2, height // 2), fill=(220, 40, 40))
    draw.rectangle((width // 2, height // 2, width - 1, height - 1), fill=(40, 200, 60))
    draw.line((0, height - 1, width - 1, 0), fill=(250, 250, 20), width=max(1, height // 20))
    return image


def make_image_bytes(
    fmt: str,
    size: tuple[int, int] = (64, 48),
    mode: str = "RGB",
    exif_orientation: int | None = None,
    **save_kwargs: object,
) -> bytes:
    """Encode a patterned picture as `fmt` ("JPEG", "PNG", "WEBP", "BMP", "GIF", "TIFF").

    `mode` is the pixel mode of the saved file (for example "L", "P", "LA",
    "RGBA", "CMYK", "1"). `exif_orientation` writes EXIF tag 0x0112 for the
    formats that carry EXIF (JPEG, PNG, WEBP).
    """
    image = _pattern(size)
    if mode != "RGB":
        image = image.convert(mode)
    if exif_orientation is not None:
        exif = Image.Exif()
        exif[_ORIENTATION_TAG] = exif_orientation
        save_kwargs["exif"] = exif
    buffer = io.BytesIO()
    image.save(buffer, fmt, **save_kwargs)
    return buffer.getvalue()


def make_animated_webp(size: tuple[int, int] = (64, 48), frames: int = 2) -> bytes:
    """A WEBP with `frames` distinct frames."""
    images = [_pattern(size)]
    for index in range(1, frames):
        frame = _pattern(size)
        ImageDraw.Draw(frame).rectangle((0, 0, size[0] // 4, size[1] // 4), fill=(index * 80, 0, 0))
        images.append(frame)
    buffer = io.BytesIO()
    images[0].save(buffer, "WEBP", save_all=True, append_images=images[1:], duration=100, loop=0)
    return buffer.getvalue()


def make_mpo(size: tuple[int, int] = (64, 48)) -> bytes:
    """A two-picture MPO (camera "multi-picture" JPEG)."""
    first = _pattern(size)
    second = _pattern(size).transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    buffer = io.BytesIO()
    first.save(buffer, "MPO", save_all=True, append_images=[second])
    return buffer.getvalue()


def make_16bit_png(size: tuple[int, int] = (64, 48), peak: int = 59_800) -> bytes:
    """A single-channel 16-bit PNG holding a horizontal gradient 0..`peak`."""
    width, height = size
    image = Image.new("I;16", size)
    row = [round(peak * x / (width - 1)) for x in range(width)]
    image.putdata(row * height)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def truncated(data: bytes) -> bytes:
    """The first half of `data` (a download that stopped midway)."""
    return data[: len(data) // 2]
