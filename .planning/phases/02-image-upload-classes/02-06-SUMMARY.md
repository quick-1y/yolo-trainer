---
phase: 02-image-upload-classes
plan: 06
subsystem: ui
tags: [react, mantine, react-query, vitest, fastapi, upload-queue, i18n]

requires:
  - phase: 02-image-upload-classes
    provides: "02-01 uploadImageBatch / ImagesPage / ImageGrid, 02-02 ProjectLayout sections, 02-04 nginx per-route upload limit"
provides:
  - "GET /api/config {max_upload_mb, max_upload_bytes, accepted_extensions}"
  - "classifyFiles (extension / size pre-filter), planBatches / runUploadQueue (batches of 10, 3 in flight, abortable)"
  - "UploadProvider / useUpload above the project routes, UploadButtons (files + folder), UploadPanel"
  - "en/ru strings for progress, summary, reject reasons and busy notification"
affects: [02-07, 02-09, 02-10, 02-11]

plan_head_before: a21133e894d36dc898b09dcd170d348511fa426d

actuals:
  tokens: 33000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Pure queue (no React): N workers pull the next batch index; abort stops new batches and drops aborted in-flight results"
    - "Upload state hoisted into a provider above the Outlet; counters + rejected list only, one setState per finished batch"
    - "Limits read from the react-query cache in startUpload (buttons stay disabled until GET /config loaded), so non-Images sections never fetch them"
    - "Counts in i18n use {{count, number}} so the value stays numeric and is locale-formatted by i18next"

key-files:
  created:
    - backend/src/yolo_trainer_api/routers/config.py
    - backend/tests/test_config_api.py
    - frontend/src/api/config.ts
    - frontend/src/lib/imageFiles.ts
    - frontend/src/lib/imageFiles.test.ts
    - frontend/src/lib/uploadQueue.ts
    - frontend/src/lib/uploadQueue.test.ts
    - frontend/src/features/images/UploadContext.tsx
    - frontend/src/features/images/UploadButtons.tsx
    - frontend/src/features/images/UploadPanel.tsx
    - frontend/src/features/images/UploadPanel.test.tsx
    - frontend/src/features/images/UploadFlow.test.tsx
  modified:
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/main.py
    - frontend/src/features/images/ImagesPage.tsx
    - frontend/src/features/project/ProjectLayout.tsx
    - frontend/src/i18n/locales/en/images.json
    - frontend/src/i18n/locales/ru/images.json

key-decisions:
  - "cancelled = some batch was never reported because of the abort (reported < batches.length); aborting after the last batch finished still reports 'done'"
  - "UploadProvider is keyed by project id so switching projects aborts and resets the upload state"
  - "Provider reads limits via queryClient.getQueryData instead of useAppConfig: an eager config fetch consumed the mockResolvedValueOnce sequences of existing Phase 1 settings/delete tests and would add a needless request on every project section"
  - "Badge/toggle labels use the 'Label: N' form (Rejected: N) as the plan's truths and the plan i18n note require, over the UI-SPEC table's 'Rejected N'"

patterns-established:
  - "BatchOutcome {files, response?, error?}: failed batches are reported, never thrown, so every submitted file is counted"
  - "Client rejection reasons are translated by the caller from codes; server reasons are shown verbatim"

requirements-completed: [DATA-01]

coverage:
  - id: D1
    description: "GET /api/config returns server upload limits and accepted extensions (default and custom Settings)"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "backend/tests/test_config_api.py (2 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Files and whole folders upload in batches of at most 10 files / max_upload_bytes with at most 3 requests in flight; unsupported / oversize files pre-rejected; every submitted file counted"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "frontend/src/lib/uploadQueue.test.ts, frontend/src/lib/imageFiles.test.ts"
        status: pass
      - kind: integration
        ref: "frontend/src/features/images/UploadFlow.test.tsx#uploads a chosen folder through the hidden webkitdirectory input"
        status: pass
    human_judgment: false
  - id: D3
    description: "One progress panel (determinate bar, counters), summary with badges, capped rejected list (100 rows, held-out 5000 files) and Copy list; cancelled and failed-batch states"
    requirement: DATA-01
    verification:
      - kind: unit
        ref: "frontend/src/features/images/UploadPanel.test.tsx (10 tests)"
        status: pass
      - kind: integration
        ref: "frontend/src/features/images/UploadFlow.test.tsx#cancel starts no new batch / turns every file of a failed batch into a rejected entry"
        status: pass
    human_judgment: false
  - id: D4
    description: "Upload survives navigation between project sections (nav loader, busy notification, a single image-list refetch at the end); leaving the project aborts; beforeunload guard while running"
    requirement: DATA-01
    verification:
      - kind: integration
        ref: "frontend/src/features/images/UploadFlow.test.tsx#keeps progress across route changes / refreshes the image list once"
        status: pass
    human_judgment: true
    rationale: "beforeunload prompt, abort on leaving the project, real-browser webkitdirectory folder pick (Chrome/Firefox/Safari) and visual layout of the panel are not asserted by jsdom tests; covered by the end-of-phase manual browser check"

duration: 25min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 06: Bounded-concurrency upload, folder upload and progress panel Summary

**Загрузка тысяч файлов и целых папок идёт пачками по 10 (не более MAX_UPLOAD_MB на пачку) при 3 запросах одновременно, лимиты берутся из нового `GET /api/config`, а одна панель с прогрессом и списком отклонённых файлов живёт над маршрутами проекта и переживает навигацию между разделами.**

## Performance

- **Duration:** около 25 мин активной работы (перерыв из-за лимита API в длительность не включён)
- **Started:** 2026-10-03T08:41:01Z
- **Completed:** 2026-10-03T13:07Z
- **Tasks:** 2
- **Files modified:** 18 (12 создано, 6 изменено)

## Accomplishments

- `GET /api/config` отдаёт `max_upload_mb`, `max_upload_bytes` и `accepted_extensions` из `app.state.settings` и `image_processing.ACCEPTED_EXTENSIONS`; клиентский пре-фильтр использует именно их, поэтому лимиты клиента и сервера не расходятся.
- Чистые функции без React: `classifyFiles` (коды `unsupported` / `tooLarge`), `planBatches`, `runUploadQueue` (воркеры забирают следующий индекс пачки, abort останавливает новые пачки и молча отбрасывает прерванные запросы, упавшая пачка возвращается как `error`-исход, а не исключение).
- `UploadProvider` над `Outlet` в `ProjectLayout`: состояние только из счётчиков и списка отклонённых, один `setState` на пачку, один `resetQueries` в конце, `beforeunload` во время загрузки, abort при выходе из проекта, жёлтое уведомление при повторном старте.
- `UploadPanel`: идущая загрузка (заголовок, определённый `Progress` с `aria-valuenow`, счётчики, «Отмена»), итог в `role="status"` с бейджами только для ненулевых счётчиков, сворачиваемый список отклонённых (не более 100 строк в `ScrollArea` 240px, «…and N more», «Copy list» копирует все записи), подсказка о повторе при сбое запросов.
- `UploadButtons`: «Upload images» (FileButton) и «Upload folder» (скрытый `input` с `webkitdirectory`/`directory` через ref), оба отключены на время загрузки и до загрузки конфигурации; пункт «Images» в сайдбаре показывает `Loader`.

## Task Commits

1. **Task 1 RED:** `d7fc33e` (test) - падающие тесты `/api/config`, `classifyFiles`, очереди, ImagesPage
2. **Task 1 GREEN:** `d23828e` (feat) - `/api/config`, `imageFiles.ts`, `uploadQueue.ts`, `api/config.ts`, ImagesPage на очереди
3. **Task 2 RED:** `022a5d4` (test) - падающие тесты панели и потока загрузки
4. **Task 2 GREEN:** `47be19c` (feat) - UploadContext / UploadButtons / UploadPanel, ProjectLayout, i18n

**Plan metadata:** отдельный docs-коммит (SUMMARY, STATE, ROADMAP, REQUIREMENTS).

## Files Created/Modified

См. `key-files` во frontmatter.

## Decisions Made

См. `key-decisions` во frontmatter. Главное: провайдер читает лимиты из кеша react-query (не хуком), чтобы не добавлять запрос `/config` в каждый раздел проекта; формат подписей счётчиков - «Label: N».

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Eager GET /config в UploadProvider ломал существующие тесты Phase 1**
- **Found during:** Task 2 (после подключения провайдера в ProjectLayout)
- **Issue:** `useAppConfig()` в провайдере делал лишний запрос при открытии любого раздела проекта; он съедал очередные `mockResolvedValueOnce` в `DeleteProjectModal.test.tsx` и `ProjectSettingsPage.test.tsx` (3 теста упали), и это был бы лишний сетевой запрос на каждом разделе.
- **Fix:** `startUpload` берёт лимиты из `queryClient.getQueryData(configQueryKey)`; конфигурацию загружает `UploadButtons` на странице Images (кнопки отключены, пока она не загружена). Если лимитов в кеше нет, старт игнорируется.
- **Files modified:** `frontend/src/api/config.ts`, `frontend/src/features/images/UploadContext.tsx`
- **Verification:** весь набор `npm run test -- --run` (115 тестов) зелёный
- **Committed in:** 47be19c

**2. [Rule 3 - Blocking] Тесты потока (UploadFlow) переписаны в Task 2 вместо только Task 1**
- **Found during:** Task 2 (RED)
- **Issue:** тест ImagesPage из Task 1 использовал уведомление со счётчиками, которое Task 2 заменяет панелью; сохранить оба нельзя.
- **Fix:** Task 1 RED закоммитил первый вариант `UploadFlow.test.tsx`, Task 2 RED заменил его набором тестов на панель (тот же сценарий `[a.jpg, notes.txt]` проверяет «Added: 1» / «Rejected: 1» в панели).
- **Files modified:** `frontend/src/features/images/UploadFlow.test.tsx`
- **Committed in:** 022a5d4

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** оба изменения нужны для корректности и согласованности тестов; расширения области нет.

## Issues Encountered

- Первая запись трёх компонентов одним heredoc упала на разборе оболочкой (частично записанных файлов не осталось); файлы созданы инструментом Write.
- Выполнение прервалось на лимите API после коммита RED; восстановлено по указанию координатора: проверены незакоммиченные правки backend и продолжено без повторения закоммиченной работы.

## Known Stubs

None. Единственное допущение прошлого плана (пустой слот значка в `ImageTile`) не затронут.

## Threat Flags

None - добавлен только `GET /api/config` (T2-06-05, принят: отдаёт лимиты, которые UI и так показывает). Имена файлов и причины отклонения рендерятся как текст React с `title`; запросы идут через `apiRequest` (X-Requested-With).

## TDD Gate Compliance

Обе задачи прошли RED -> GREEN: `test(02-06)` коммиты `d7fc33e` и `022a5d4` предшествуют `feat(02-06)` коммитам `d23828e` и `47be19c`. RED подтверждён падением по назначению (404 на `/api/config`, отсутствие модулей и folder-input). REFACTOR-коммитов нет.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Готово для 02-07: `UploadButtons` пригоден для пустого состояния сетки; `UploadProvider` уже оборачивает все разделы проекта (Dropzone поверх страницы может вызвать `useUpload().startUpload`).
- Ручная проверка в браузере остаётся на конец фазы: выбор папки с вложенными каталогами (Chrome/Firefox/Safari), приглашение `beforeunload`, визуальный вид панели.

## Self-Check: PASSED

Проверено: все созданные файлы существуют, коммиты `d7fc33e`, `d23828e`, `022a5d4`, `47be19c` есть в `git log`; `uv run pytest backend/tests` (233 passed), `ruff check` и `ruff format --check` чистые; `npm run build` и `npm run test -- --run` (115 passed) зелёные; grep-критерии приёмки выполнены (`webkitdirectory` 2, `UploadProvider` 3, `beforeunload` 2, `resetQueries` 1, `retryHint` по 1 в en/ru, `config_router` 2, `planBatches` 1, `classifyFiles` 1).

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
