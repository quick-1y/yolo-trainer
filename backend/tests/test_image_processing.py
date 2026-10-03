"""Unit tests for `process_image` and `clean_filename` (DATA-01, D-01, D-17).

`process_image` is called directly on in-memory files: the decode matrix of
real-world inputs (CMYK, palette, 16-bit, animated, multi-picture, rotated
phone photos), the rejection reasons, thumbnail bounds, and the EXIF-corrected
size that must agree with what OpenCV (and so Ultralytics) sees at training time.
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from yolo_trainer_api.image_processing import Processed, Rejected, clean_filename, process_image

from .imaging import (
    make_16bit_png,
    make_animated_webp,
    make_image_bytes,
    make_mpo,
    truncated,
)

THUMB_SIZE = 256
MAX_PIXELS = 100_000_000

CORRUPT = "The file is not a valid image or is corrupt."
TOO_SMALL = "The image is too small (minimum 10x10 pixels)."


def run(data: bytes, *, max_pixels: int = MAX_PIXELS) -> Processed:
    return process_image(io.BytesIO(data), thumb_size=THUMB_SIZE, max_pixels=max_pixels)


def rejection(data: bytes, *, max_pixels: int = MAX_PIXELS) -> str:
    with pytest.raises(Rejected) as caught:
        run(data, max_pixels=max_pixels)
    return caught.value.reason


def thumb_image(processed: Processed) -> Image.Image:
    image = Image.open(io.BytesIO(processed.thumb))
    image.load()
    return image


# --------------------------------------------------------------------------
# Decode matrix: accepted inputs
# --------------------------------------------------------------------------

ACCEPTED_CASES = [
    pytest.param(lambda: make_image_bytes("JPEG", mode="RGB"), "jpg", id="jpeg-rgb"),
    pytest.param(lambda: make_image_bytes("JPEG", mode="CMYK"), "jpg", id="jpeg-cmyk"),
    pytest.param(lambda: make_image_bytes("PNG", mode="L"), "png", id="png-l"),
    pytest.param(lambda: make_image_bytes("PNG", mode="P"), "png", id="png-p"),
    pytest.param(lambda: make_image_bytes("PNG", mode="LA"), "png", id="png-la"),
    pytest.param(lambda: make_image_bytes("PNG", mode="RGBA"), "png", id="png-rgba"),
    pytest.param(make_16bit_png, "png", id="png-16bit"),
    pytest.param(lambda: make_image_bytes("BMP", mode="1"), "bmp", id="bmp-1bit"),
    pytest.param(lambda: make_image_bytes("BMP", mode="RGB"), "bmp", id="bmp-rgb"),
    pytest.param(make_animated_webp, "webp", id="webp-animated"),
    pytest.param(lambda: make_image_bytes("WEBP"), "webp", id="webp-still"),
    pytest.param(make_mpo, "jpg", id="mpo"),
]


@pytest.mark.parametrize(("build", "ext"), ACCEPTED_CASES)
def test_supported_inputs_are_accepted_with_a_bounded_webp_thumbnail(build, ext: str) -> None:
    processed = run(build())

    assert processed.ext == ext
    assert (processed.width, processed.height) == (64, 48)
    with thumb_image(processed) as thumb:
        assert thumb.format == "WEBP"
        assert max(thumb.size) <= THUMB_SIZE


def test_thumbnail_is_bounded_to_the_long_side_for_a_large_image() -> None:
    processed = run(make_image_bytes("PNG", size=(1200, 400)))

    with thumb_image(processed) as thumb:
        assert max(thumb.size) == THUMB_SIZE
        assert thumb.size == (256, 85)
    assert (processed.width, processed.height) == (1200, 400)


def test_a_small_image_is_never_upscaled() -> None:
    processed = run(make_image_bytes("PNG", size=(64, 48)))

    with thumb_image(processed) as thumb:
        assert thumb.size == (64, 48)


def test_animated_webp_reports_the_first_frame_size() -> None:
    processed = run(make_animated_webp((80, 60), frames=3))

    assert (processed.width, processed.height) == (80, 60)


def test_16bit_png_thumbnail_keeps_its_tonal_range() -> None:
    processed = run(make_16bit_png(peak=59_800))

    with thumb_image(processed) as thumb:
        gray = thumb.convert("L")
        low, high = gray.getextrema()
        middle = gray.getpixel((gray.width // 2, gray.height // 2))
    assert high - low > 200
    assert 90 <= middle <= 165  # a clipped conversion would already be white at mid-gradient


# --------------------------------------------------------------------------
# Rejections (D-01)
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "build",
    [
        pytest.param(lambda: make_image_bytes("GIF", mode="P"), id="gif"),
        pytest.param(lambda: make_image_bytes("TIFF"), id="tiff"),
    ],
)
def test_unsupported_formats_are_rejected_by_decoded_format(build) -> None:
    assert rejection(build()).startswith("Unsupported image format.")


def test_image_under_ten_pixels_is_rejected() -> None:
    assert rejection(make_image_bytes("PNG", size=(5, 5))) == TOO_SMALL


def test_one_short_side_is_enough_to_reject() -> None:
    assert rejection(make_image_bytes("PNG", size=(200, 9))) == TOO_SMALL


@pytest.mark.parametrize(
    "data",
    [
        pytest.param(b"\x00\x01\x02random bytes that are not an image" * 4, id="random"),
        pytest.param(b"", id="empty"),
    ],
)
def test_garbage_is_rejected_as_not_an_image(data: bytes) -> None:
    assert rejection(data) == CORRUPT


@pytest.mark.parametrize("fmt", ["JPEG", "PNG"])
def test_file_truncated_to_half_is_rejected_as_corrupt(fmt: str) -> None:
    data = make_image_bytes(fmt, size=(640, 480))

    assert rejection(truncated(data)) == CORRUPT


def test_header_larger_than_the_pixel_cap_is_rejected_before_decoding() -> None:
    reason = rejection(make_image_bytes("PNG", size=(100, 100)), max_pixels=1000)

    assert reason.startswith("The image has too many pixels")


# --------------------------------------------------------------------------
# EXIF orientation (D-17): reported size == what OpenCV decodes
# --------------------------------------------------------------------------


@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
@pytest.mark.parametrize("orientation", range(1, 9))
def test_reported_size_matches_the_opencv_decoder_for_every_orientation(
    fmt: str, orientation: int
) -> None:
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    data = make_image_bytes(fmt, size=(300, 100), exif_orientation=orientation)

    processed = run(data)

    decoded = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    assert decoded is not None
    assert (processed.height, processed.width) == decoded.shape[:2]
    expected = (100, 300) if orientation >= 5 else (300, 100)
    assert (processed.width, processed.height) == expected


@pytest.mark.parametrize("orientation", [5, 6, 7, 8])
def test_rotated_orientations_produce_an_upright_portrait_thumbnail(orientation: int) -> None:
    processed = run(make_image_bytes("JPEG", size=(300, 100), exif_orientation=orientation))

    with thumb_image(processed) as thumb:
        assert thumb.height > thumb.width


# --------------------------------------------------------------------------
# clean_filename
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("a/b\\c.jpg", "c.jpg"),
        ("../../evil.png", "evil.png"),
        ("we%22ird.jpg", 'we"ird.jpg'),
        ("x%0D%0A.png", "x.png"),
        ("x%0d%0a.png", "x.png"),
        ("tab\there.jpg", "tabhere.jpg"),
        ("nul\x00byte.jpg", "nulbyte.jpg"),
        ("  spaced.png  ", "spaced.png"),
        ("", "unnamed"),
        ("/", "unnamed"),
        ("..", "unnamed"),
        ("файл 猫.jpg", "файл 猫.jpg"),
    ],
)
def test_clean_filename_strips_paths_escapes_and_control_characters(
    raw: str, expected: str
) -> None:
    assert clean_filename(raw) == expected


def test_long_names_are_capped_to_255_code_points_keeping_the_extension() -> None:
    cleaned = clean_filename("a" * 300 + ".jpeg")

    assert len(cleaned) == 255
    assert cleaned.endswith(".jpeg")


def test_long_name_without_an_extension_is_capped() -> None:
    assert len(clean_filename("b" * 400)) == 255
