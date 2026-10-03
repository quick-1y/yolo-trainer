---
phase: 02-image-upload-classes
plan: 03
subsystem: testing
tags: [pytest, pillow, opencv, exif, sqlite, concurrency, upload-validation]

requires:
  - phase: 02-image-upload-classes
    provides: "02-01: process_image, clean_filename, storage.stage_and_hash, POST /api/projects/{id}/images (ingest_one)"
provides:
  - "backend/tests/imaging.py: shared image generators (formats, pixel modes, EXIF orientation, animated WEBP, MPO, 16-bit PNG, truncation)"
  - "test_image_processing.py: decode/reject matrix, thumbnail bounds, EXIF-vs-OpenCV size check for orientations 1-8, clean_filename cases"
  - "test_images_api.py: size limit, empty file, names, in-request and concurrent duplicates, project deleted mid-upload"
affects: [02-04, 02-08, phase-03-annotation]

plan_head_before: af6f319007bf9f6a018cbac502bd251f5f894e76

actuals:
  tokens: 4600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "EXIF contract pinned against the real OpenCV decoder via pytest.importorskip (cv2 only in the dev venv, never in the api image)"
    - "race tests run through the real TestClient with ThreadPoolExecutor and assert on rows plus files on disk, not just responses"
    - "mid-request fault injection by monkeypatching routers.images.process_image with a wrapper that deletes the project row via stdlib sqlite3"

key-files:
  created:
    - backend/tests/imaging.py
    - backend/tests/test_image_processing.py
  modified:
    - backend/tests/test_images_api.py

key-decisions:
  - "No production code changed: every new case passed against the Plan 01 pipeline, so the plan's fix-where-it-fails clause was never triggered"
  - "Test strength was verified by mutation instead of a literal RED run, because the code under test already existed"

patterns-established:
  - "Characterization tests for an existing pipeline: prove they can fail by temporarily breaking the code, then restore it"

requirements-completed: [DATA-01]

coverage:
  - id: D1
    description: "Decode matrix: RGB/CMYK JPEG, L/P/LA/RGBA/16-bit PNG, 1-bit/RGB BMP, animated WEBP, MPO are accepted with a WEBP thumbnail <= 256 px, never upscaled"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "backend/tests/test_image_processing.py#test_supported_inputs_are_accepted_with_a_bounded_webp_thumbnail"
        status: pass
    human_judgment: false
  - id: D2
    description: "GIF, TIFF, garbage, empty, half-truncated JPEG/PNG, under 10x10 and over-pixel-cap inputs are rejected with plain-English reasons"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "backend/tests/test_image_processing.py#test_unsupported_formats_are_rejected_by_decoded_format"
        status: pass
      - kind: unit
        ref: "backend/tests/test_image_processing.py#test_file_truncated_to_half_is_rejected_as_corrupt"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reported width/height equal the OpenCV decoder shape for EXIF orientations 1-8 in JPEG, PNG and WEBP"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "backend/tests/test_image_processing.py#test_reported_size_matches_the_opencv_decoder_for_every_orientation"
        status: pass
    human_judgment: false
  - id: D4
    description: "16-bit PNG thumbnail keeps its tonal range (mid-gradient is mid-grey, not white)"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "backend/tests/test_image_processing.py#test_16bit_png_thumbnail_keeps_its_tonal_range"
        status: pass
    human_judgment: false
  - id: D5
    description: "File over MAX_UPLOAD_MB is rejected with 'The file is larger than N MB.' and leaves nothing in .incoming; stage_and_hash removes its partial file"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_api.py#test_valid_image_over_the_limit_is_rejected_and_leaves_no_staged_file"
        status: pass
      - kind: unit
        ref: "backend/tests/test_images_api.py#test_stage_and_hash_stops_at_the_cap_and_removes_its_partial_file"
        status: pass
    human_judgment: false
  - id: D6
    description: "Eight concurrent identical uploads store exactly one image (one 'added', seven 'duplicate', one row, one file, empty .incoming); in-request duplicate is reported duplicate"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_api.py#test_eight_concurrent_identical_uploads_store_exactly_one_image"
        status: pass
      - kind: integration
        ref: "backend/tests/test_images_api.py#test_same_bytes_twice_in_one_request_are_added_then_duplicate"
        status: pass
    human_judgment: false
  - id: D7
    description: "Filename hygiene: separators, %22/%0D/%0A, control characters, UTF-8 round-trip, 255-code-point cap with extension, empty -> 'unnamed'"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "backend/tests/test_image_processing.py#test_clean_filename_strips_paths_escapes_and_control_characters"
        status: pass
      - kind: integration
        ref: "backend/tests/test_images_api.py#test_utf8_filename_round_trips"
        status: pass
    human_judgment: false
  - id: D8
    description: "Project deleted while its upload is processed returns 404 'Project not found.' and leaves no files under images/, thumbs/ or .incoming"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_api.py#test_project_deleted_while_its_upload_is_processed_is_404_and_leaves_no_files"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 03: Upload validation and race tests Summary

**Pillow-only upload pipeline pinned by 12 accepted formats, EXIF orientations 1-8 cross-checked against OpenCV's decoder, and size-limit, filename, duplicate and project-deleted races proven on the real app with no stray files**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-03T08:14:25Z
- **Completed:** 2026-10-03T08:17:49Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 extended)

## Accomplishments

- `backend/tests/imaging.py`: генераторы тестовых изображений (`make_image_bytes`, `make_animated_webp`, `make_mpo`, `make_16bit_png`, `truncated`); бинарных фикстур в репозитории нет.
- `test_image_processing.py` (67 тестов): матрица декодирования (RGB/CMYK JPEG; L, P, LA, RGBA, 16-bit PNG; 1-bit и RGB BMP; анимированный WEBP; MPO), отказы с понятными причинами (GIF, TIFF, мусор, пустой файл, усечённые JPEG/PNG, меньше 10x10, превышение лимита пикселей), миниатюра не больше 256 px и без апскейла, ориентации EXIF 1-8 для JPEG/PNG/WEBP совпадают с формой, которую выдаёт `cv2.imdecode`.
- `test_images_api.py` (+8 тестов): лимит `MAX_UPLOAD_MB` на валидном BMP больше 1 MB, `stage_and_hash` без остаточных файлов, пустой файл, дубликат внутри одного запроса, UTF-8 и слишком длинные имена, 8 параллельных одинаковых загрузок (ровно один `added`), удаление проекта посреди загрузки (404 и нет файлов).
- Весь набор `backend/tests` зелёный (213 тестов), ruff check и format чистые.

## Task Commits

1. **Task 1: Decode matrix, EXIF orientation and filename-cleaning unit tests** - `333745a` (test)
2. **Task 2: Upload API edge cases** - `7dd16e6` (test)

**Plan metadata:** добавляется отдельным docs-коммитом.

## Files Created/Modified

- `backend/tests/imaging.py` - общие генераторы изображений для тестов
- `backend/tests/test_image_processing.py` - матрица декодирования, EXIF-сверка с OpenCV, `clean_filename`
- `backend/tests/test_images_api.py` - граничные случаи загрузки через настоящее приложение

## Decisions Made

- Продакшн-код не менялся: все новые случаи прошли на конвейере из плана 01, поэтому условие «чинить, если тест падает» не сработало, а список исправлений пуст.
- Сила тестов подтверждена мутациями вместо буквального RED-прогона, так как тестируемый код уже существовал (см. ниже).

## TDD Gate Compliance

План помечен `tdd="true"`, но тестируется уже готовый код плана 01, поэтому обычный цикл RED -> GREEN не применим: нет `feat(02-03)` коммитов, потому что нечего реализовывать. Это характеризационные тесты (коммиты `test(02-03)`), честный RED заменён проверкой на мутациях:

- убрана перестановка ширины и высоты для ориентаций 5-8: упало 12 тестов сверки с OpenCV;
- масштаб 16-bit сломан (`hi = 1.0`): упал `test_16bit_png_thumbnail_keeps_its_tonal_range` (первая версия проверки по экстремумам мутант пропускала, потому что наивное `convert("RGB")` тоже даёт диапазон 0..255, поэтому проверка ужесточена до яркости середины градиента);
- убран `storage.discard(thumb_tmp)` в ветке IntegrityError: упал тест удаления проекта посреди загрузки;
- проверка дубликата перед декодированием отключена (принудительно идёт ветка IntegrityError): тесты параллельных и внутризапросных дубликатов остались зелёными, значит ветка `UNIQUE(project_id, sha256)` работает сама по себе.

После каждой мутации исходник восстанавливался, `git status` по `backend/src` чист.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written. Production-код не менялся.

---

**Total deviations:** 0
**Impact on plan:** нет.

## Issues Encountered

Первая версия проверки 16-bit PNG не отличала сломанную конвертацию от правильной (см. мутацию выше), исправлено в рамках Task 1 до коммита.

## Known Stubs

None.

## Threat Flags

None - новых поверхностей нет, добавлены только тесты; митигации T2-03-01..T2-03-04 покрыты тестами (лимит пикселей, лимит байт, усечённые файлы, имена, гонки).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Загрузка закрыта тестами по всей матрице форматов, ориентаций EXIF и гонок. Готово к плану 02-04. Очистка остатков после аварийного прерывания загрузки остаётся за планом 02-08.

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*

## Self-Check: PASSED

- backend/tests/imaging.py, test_image_processing.py, test_images_api.py: FOUND
- Commits 333745a, 7dd16e6: FOUND
- `uv run pytest backend/tests` 213 passed; ruff check/format clean
