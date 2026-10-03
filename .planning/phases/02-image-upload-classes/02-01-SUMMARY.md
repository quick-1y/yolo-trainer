---
phase: 02-image-upload-classes
plan: 01
subsystem: api
tags: [fastapi, pillow, python-multipart, sqlite, alembic, react-virtuoso, react-query, mantine]

requires:
  - phase: 01-foundation
    provides: projects API, Settings/DATA_DIR, Alembic runner, compose stack, i18n namespaces, ProjectLayout
provides:
  - images table (migration 0002) and Image ORM model with AUTOINCREMENT ids
  - POST /api/projects/{id}/images (multipart, CSRF header), GET keyset list, GET thumbnail
  - Pillow validation, EXIF-corrected size, WEBP thumbnails (torch-free api image)
  - id-keyed on-disk layout data/projects/<pid>/{images,thumbs}
  - Images page with virtualized grid, sidebar entry, per-section active links
affects: [02-02, 02-03, 02-04, 02-06, 02-07, 02-09, 02-10, 02-11, phase-03-annotation, phase-09-export]

plan_head_before: 386ad25990cec3d57fb37e45208323f79222a627

actuals:
  tokens: 19300
  tasks: 2
  commits: 3

tech-stack:
  added: [pillow (direct), python-multipart, react-virtuoso]
  patterns:
    - "stage -> hash -> dedup -> decode -> short DB transaction + os.replace"
    - "paths built only from integer ids and an allow-listed extension (D-18)"
    - "keyset cursor = unpadded URL-safe base64 of compact JSON {s,k,i}"
    - "require_xhr dependency as CSRF guard for multipart POSTs"
    - "resetQueries (not invalidate) on the infinite images query"

key-files:
  created:
    - backend/src/yolo_trainer_api/image_processing.py
    - backend/src/yolo_trainer_api/storage.py
    - backend/src/yolo_trainer_api/security.py
    - backend/src/yolo_trainer_api/routers/images.py
    - backend/src/yolo_trainer_api/migrations/versions/0002_create_images.py
    - backend/tests/test_images_api.py
    - frontend/src/api/images.ts
    - frontend/src/api/client.test.ts
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/features/images/ImageGrid.tsx
    - frontend/src/features/images/ImageTile.tsx
  modified:
    - backend/src/yolo_trainer_api/{settings,models,schemas,migrate,main}.py
    - backend/tests/test_migrations.py
    - backend/tests/test_persistence.py
    - backend/pyproject.toml
    - uv.lock
    - frontend/src/api/client.ts
    - frontend/src/app/routes.tsx
    - frontend/src/features/project/ProjectLayout.tsx
    - frontend/src/i18n/locales/{en,ru}/{images,project}.json
    - scripts/compose_smoke_test.sh
    - docker/Dockerfile.frontend

key-decisions:
  - "EXIF orientation is applied with an explicit Pillow transpose table (same mapping as ImageOps.exif_transpose) instead of exif_transpose, so it does not depend on im.info surviving convert/thumbnail"
  - "Stored size_bytes comes from the staged byte count, not UploadFile.size (which may be None)"
  - "GET list returns 404 'Project not found.' for an unknown project (plan was silent); cursor is validated first so a bad cursor is always 422"
  - "Dockerfile.frontend uses npm ci --maxsockets=1 because parallel registry connections are reset on Docker Desktop (Windows)"

patterns-established:
  - "Ingest pipeline in routers/images.py::ingest_one reused by later upload plans"
  - "build_page_query(...) is the single place Plan 02-09 extends for sort/search"

requirements-completed: [DATA-01, ANNO-01]

coverage:
  - id: D1
    description: "Upload via POST /api/projects/{id}/images: added / duplicate / rejected per file in request order, 403 without X-Requested-With, originals byte-identical, id-keyed layout"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_api.py (26 tests)"
        status: pass
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (403 / added / rejected / duplicate through nginx)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Keyset list (newest first, total, cursor, 422 on bad cursor) and immutable-cached WEBP thumbnails that survive restart and docker compose down/up"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/tests/test_images_api.py#test_list_pages_with_keyset_cursor"
        status: pass
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (total 1, thumbnail 200 image/webp, host files, persistence)"
        status: pass
    human_judgment: false
  - id: D3
    description: "apiRequest leaves multipart Content-Type to the browser and always sends X-Requested-With"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "frontend/src/api/client.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Images page: Upload images button, batches of at most 10, notification with counts, virtualized grid refreshed via resetQueries, sidebar highlights exactly the current section"
    requirement: ANNO-01
    verification:
      - kind: other
        ref: "npm --prefix frontend run build && run test (type check, locale parity, existing routing tests)"
        status: pass
    human_judgment: true
    rationale: "No component test drives the file picker or the Virtuoso grid in a real browser; layout (fixed 184x208 items, no scroll-away toolbar, 255-character filename truncation) needs a visual check"

duration: 19min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 01: Image Upload Tracer Summary

**Сквозной путь «выбрать файлы -> multipart POST через nginx -> Pillow-валидация -> оригинал + WEBP-миниатюра на диске и строка в SQLite -> keyset-список -> виртуализированная сетка» работает и подтверждён compose smoke test (`SMOKE OK`).**

## Performance

- **Duration:** 19 min
- **Started:** 2026-10-03T07:46:29Z
- **Completed:** 2026-10-03T08:05:09Z
- **Tasks:** 2
- **Files modified:** 33 (excluding the two lockfiles: 31)

## Accomplishments

- Миграция 0002 и модель `Image`: AUTOINCREMENT-идентификаторы (не переиспользуются, поэтому миниатюры можно кешировать как immutable), уникальность `(project_id, sha256)`, keyset-индексы, каскадное удаление через FK.
- Конвейер приёма файла (`ingest_one`): staging с SHA-256 и лимитом размера, дедупликация до декодирования, полный `load()` как проверка на повреждение, короткая транзакция вокруг INSERT + `os.replace`, откат с удалением файлов, обработка гонки дубликатов и удаления проекта во время загрузки.
- Pillow-only обработка (без numpy в api-образе): 16/32-бит и float режимы приводятся к 8 бит через `point()`, размеры с поправкой на EXIF-ориентацию (5-8 меняют ширину и высоту), оригинал не изменяется (D-17), имя файла клиента никогда не попадает в путь (D-18).
- CSRF-защита `require_xhr` (403 «Missing required request header.») для multipart POST; клиент `apiRequest` всегда шлёт `X-Requested-With` и не задаёт Content-Type для `FormData`.
- Страница Images: кнопка «Upload images» (пачки до 10 файлов последовательно), уведомление со счётчиками, `resetQueries` вместо `invalidate`, `VirtuosoGrid` с собственным скроллером и фиксированными плитками 184 x 208, резервный слот под значок статуса Phase 3.
- `ProjectLayout`: Overview / Images / Settings, подсвечивается ровно та секция, что соответствует URL.
- Smoke test расширен: 403 без заголовка, added / rejected / duplicate, total 1, миниатюра `200 image/webp`, файлы на хосте по D-18, повторная проверка после `down/up`.

## Task Commits

1. **Dependencies (pillow, python-multipart, react-virtuoso)** - `a13caab` (chore)
2. **Task 1: tracer, end-to-end upload and grid** - `89c5c3c` (feat)
3. **Task 2: contract tests + FormData client test** - `8088bf4` (test)

**Plan metadata:** отдельный docs-коммит (SUMMARY, STATE, ROADMAP, REQUIREMENTS).

## Files Created/Modified

- `backend/src/yolo_trainer_api/image_processing.py` - валидация, миниатюра, EXIF-размер, `clean_filename`
- `backend/src/yolo_trainer_api/storage.py` - пути только из целых чисел, staging + SHA-256, атомарный commit пары файлов
- `backend/src/yolo_trainer_api/security.py` - `require_xhr`
- `backend/src/yolo_trainer_api/routers/images.py` - POST upload, GET keyset-список, GET thumbnail, `build_page_query`
- `backend/src/yolo_trainer_api/migrations/versions/0002_create_images.py` - таблица `images`
- `backend/src/yolo_trainer_api/{settings,models,schemas,migrate,main}.py` - настройки `MAX_UPLOAD_MB` / `MAX_IMAGE_MEGAPIXELS`, модель, схемы, `migration_head()`, `app.state.settings`
- `backend/tests/test_images_api.py` - 26 контрактных тестов
- `frontend/src/api/{client,images}.ts`, `client.test.ts` - клиент и API-хуки
- `frontend/src/features/images/*` - страница, сетка, плитка
- `scripts/compose_smoke_test.sh` - расширенный smoke test
- `docker/Dockerfile.frontend` - `npm ci --maxsockets=1`

## Decisions Made

См. `key-decisions` в frontmatter. Главное: ориентация применяется явной таблицей transpose (тот же результат, что `exif_transpose`, но без зависимости от `im.info` после `convert`/`thumbnail`); `size_bytes` берётся из реального числа записанных байт.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm ci` в Docker падал с ECONNRESET**
- **Found during:** Task 1 (запуск compose smoke test)
- **Issue:** сборка образа `web` не проходила: `npm ci` внутри Docker Desktop получал ECONNRESET при параллельных соединениях к реестру. Воспроизведено и на lockfile до моих изменений (коммит 386ad25), то есть причина окружения, а не новых зависимостей. `--fetch-retries=8` не помогал, `--maxsockets=1` помогал.
- **Fix:** в `docker/Dockerfile.frontend` команда заменена на `npm ci --maxsockets=1` с комментарием.
- **Files modified:** docker/Dockerfile.frontend
- **Verification:** `bash scripts/compose_smoke_test.sh` завершился `SMOKE OK`
- **Committed in:** 89c5c3c

**2. [Rule 2 - Missing Critical] GET list для несуществующего проекта**
- **Found during:** Task 1 (router)
- **Issue:** план не описывал поведение; пустой список скрывал бы ошибку адресации.
- **Fix:** `get_project_or_404` вызывается и в списке (cursor проверяется раньше, поэтому плохой cursor всегда даёт 422).
- **Files modified:** backend/src/yolo_trainer_api/routers/images.py
- **Committed in:** 89c5c3c

**3. [Rule 3 - Blocking] Размещение дополнительного файла `ImageTile.module.css`**
- **Found during:** Task 1
- **Issue:** план перечислил один `ImageGrid.module.css`, но стили плитки (фон dark-5, граница, слот значка) удобнее держать рядом с плиткой.
- **Fix:** добавлен `ImageTile.module.css`; `ImageGrid.module.css` содержит только стили списка и элемента.
- **Committed in:** 89c5c3c

---

**Total deviations:** 3 auto-fixed (1 blocking infra, 1 missing critical, 1 blocking/layout)
**Impact on plan:** все правки необходимы для работоспособности; расширения области нет.

## TDD Gate Compliance

Task 2 помечена `tdd="true"`, но по структуре плана реализация (tracer) была написана и закоммичена в Task 1, поэтому тесты Task 2 прошли с первого запуска и честного RED-коммита нет (`test(02-01)` идёт после `feat(02-01)`). Это то же ограничение, что в Phase 1: тесты закрепляют контракт уже существующего кода. Ошибок в коде Task 1 тесты не выявили (исправлений кода по их результатам не потребовалось).

## Issues Encountered

- Сеть Docker Desktop (ECONNRESET при параллельной загрузке npm), см. отклонение 1.
- Heredoc с несколькими файлами в одной команде Bash не разобрался оболочкой; файлы созданы инструментом Write. Заодно python-обёртка в одной из правок smoke-скрипта исказила `\1` и строку продолжения; исправлено до запуска теста.

## Known Stubs

- `frontend/src/features/images/ImageTile.tsx` (`data-testid="status-badge-slot"`): намеренно пустой слот 24 x 24 под значок статуса аннотации. Он зарезервирован по D-07 и заполняется в Phase 3; цель плана не затрагивает.

## Threat Flags

None - новые поверхности (multipart endpoint, запись в data/projects, имена файлов) уже учтены в threat_model плана (T2-01-01..T2-01-07, T2-01-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Контракты (`POST/GET images`, `ImageRead`, `storage.*`, `process_image`, `require_xhr`, `migration_head`, `imageKeys`, `thumbnailUrl`) готовы для планов 02-02..02-12.
- nginx по-прежнему ограничивает тело 1 MiB (поднимается в Plan 02-04); реальные фото больше 1 МиБ через compose пока не пройдут.
- Нужна визуальная проверка страницы Images (held-out: имя файла из 255 символов обрезается в одну строку) - помечено как backstop.

## Self-Check: PASSED

Проверено: все созданные файлы существуют на диске, коммиты `a13caab`, `89c5c3c`, `8088bf4` присутствуют в `git log`, `bash scripts/compose_smoke_test.sh` завершился `SMOKE OK`, `uv run pytest backend/tests` (117 passed), `ruff check` и `ruff format --check` чистые, `npm run build` и `npm run test -- --run` (55 passed) зелёные, все grep-критерии приёмки выполнены.

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
