---
phase: 02-image-upload-classes
plan: 02
subsystem: api
tags: [fastapi, sqlalchemy, alembic, sqlite, react, mantine, react-query, i18n]

requires:
  - phase: 01-foundation
    provides: projects API, get_project_or_404, ProjectName, Alembic runner, i18n namespaces, ProjectLayout
  - phase: 02-image-upload-classes
    provides: migration 0002, migration_head(), per-section active links in ProjectLayout
provides:
  - classes table (migration 0003) and ProjectClass ORM model with AUTOINCREMENT ids
  - GET/POST /api/projects/{id}/classes with contiguous index, palette color, case-insensitive per-project names
  - ClassCreate / ClassUpdate / ClassRead schemas and get_class_or_404 (for Plan 02-05)
  - CLASS_PALETTE (17 colors) on server and client
  - Classes page (add form, list, empty/loading/error states) and sidebar entry
affects: [02-05, phase-03-annotation, phase-09-export]

plan_head_before: 3e2129b85f80629894f0fbd91ee7a34cd1ae2696

actuals:
  tokens: 12500
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "position assigned inside the INSERT via scalar subquery COALESCE(MAX(position), -1) + 1"
    - "409 reports the already-stored display name, looked up by (project_id, normalized_name)"
    - "client-side submit lock with useRef in addition to the mutation's isPending"
    - "extra=forbid on ClassCreate is the guard against a client-writable index (D-13, D-14)"

key-files:
  created:
    - backend/src/yolo_trainer_api/migrations/versions/0003_create_classes.py
    - backend/src/yolo_trainer_api/palette.py
    - backend/src/yolo_trainer_api/routers/classes.py
    - backend/tests/test_classes_api.py
    - frontend/src/api/classes.ts
    - frontend/src/lib/classPalette.ts
    - frontend/src/features/classes/ClassesPage.tsx
    - frontend/src/features/classes/AddClassForm.tsx
    - frontend/src/features/classes/ClassRow.tsx
    - frontend/src/features/classes/ClassesPage.test.tsx
    - frontend/src/i18n/locales/en/classes.json
    - frontend/src/i18n/locales/ru/classes.json
  modified:
    - backend/src/yolo_trainer_api/models.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/main.py
    - frontend/src/app/routes.tsx
    - frontend/src/features/project/ProjectLayout.tsx
    - frontend/src/features/project/ProjectOverviewPage.test.tsx
    - frontend/src/i18n/locales/en/project.json
    - frontend/src/i18n/locales/ru/project.json
    - frontend/src/i18n/locales/en/common.json
    - frontend/src/i18n/locales/ru/common.json

key-decisions:
  - "Class color is chosen from already-used colors before the INSERT (not inside it); two simultaneous creates may therefore get the same default color, which is cosmetic. The index, which matters, is computed atomically inside the INSERT."
  - "A failed create (409) does not consume an index, because the position is computed by the INSERT that fails; covered by a dedicated test."
  - "IntegrityError that is not a name collision (project deleted during the insert) is reported as 404 'Project not found.' instead of a misleading 409."

patterns-established:
  - "routers/classes.py::get_class_or_404 selects by id AND project_id so another project's class id never resolves through this project's URL"
  - "ClassRead maps the stored column position to the public field index via validation_alias"

requirements-completed: [PROJ-03]

coverage:
  - id: D1
    description: "POST/GET /api/projects/{id}/classes: 201 with {id, name, color, index, created_at}, index = next contiguous position, color = first unused palette color (cycling when exhausted), GET ordered by index"
    requirement: PROJ-03
    verification:
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_create_assigns_contiguous_index_and_palette_color"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_palette_cycles_when_exhausted"
        status: pass
    human_judgment: false
  - id: D2
    description: "Case- and spacing-insensitive per-project name uniqueness: 409 with the stored name, nothing stored, same name allowed in another project, DB-level unique index backstop"
    requirement: PROJ-03
    verification:
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_duplicate_name_is_case_and_spacing_insensitive_per_project"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_direct_insert_of_case_variant_name_violates_unique_index"
        status: pass
    human_judgment: false
  - id: D3
    description: "20 concurrent creates in one project yield indices exactly 0..19; classes keep index and color after an app restart on the same DATA_DIR; project delete cascades"
    requirement: PROJ-03
    verification:
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_twenty_concurrent_creates_yield_contiguous_indices"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_classes_survive_app_restart"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_deleting_project_cascades_to_classes"
        status: pass
    human_judgment: false
  - id: D4
    description: "No client-writable index and no reorder surface (D-13, D-14): extra index/position fields give 422 and store nothing; PATCH/PUT/DELETE on the collection give 405"
    requirement: PROJ-03
    verification:
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_client_cannot_supply_an_index"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_no_reorder_surface_exists"
        status: pass
    human_judgment: false
  - id: D5
    description: "Classes page: add via Enter or button (row shows index, name, color swatch; input clears and refocuses), validation without a request, 409 under the input with value kept, empty state, error Alert with Try again, sidebar order with only Classes active"
    requirement: PROJ-03
    verification:
      - kind: unit
        ref: "frontend/src/features/classes/ClassesPage.test.tsx (9 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual fit of the Classes page: 100-character name truncated with ellipsis in ru and en, 48px skeleton rows, double-submit protection while pending under real timing, swatch contrast on dark-6"
    requirement: PROJ-03
    verification:
      - kind: other
        ref: "npm --prefix frontend run build (type check) and component tests"
        status: pass
    human_judgment: true
    rationale: "jsdom does not lay out or measure text, so ellipsis truncation, row height and the skeleton look need a visual check in a browser (held-out backstop item from the plan)"

duration: 5min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 02: Define Classes Summary

**Классы создаются и перечисляются через API (непрерывный индекс 0..N-1, считающийся прямо внутри INSERT, авто-цвет из 17-цветной палитры, уникальность имени без учёта регистра в рамках проекта) и показываются на новой странице Classes с формой добавления.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-03T08:07:40Z
- **Completed:** 2026-10-03T08:12:34Z
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments

- Миграция 0003 и модель `ProjectClass`: AUTOINCREMENT-идентификаторы (будущие аннотации ссылаются на `classes.id`, не на индекс, D-13), FK с каскадом, уникальный индекс `uq_classes_project_normalized_name`, неуникальный `ix_classes_project_position` (чтобы будущий сдвиг индексов при удалении не нарушал ограничение посреди UPDATE), CHECK на длину цвета.
- `routers/classes.py`: `GET` отсортирован по `position, id`; `POST` вычисляет `position` скалярным подзапросом `COALESCE(MAX(position), -1) + 1` внутри самого INSERT, поэтому 20 параллельных запросов дают ровно `{0..19}` (тест прогнан 5 раз подряд без нестабильности). 409 называет уже сохранённое имя (`A class named "car" already exists.`), неудачное создание не расходует индекс.
- Нет ни клиентского индекса, ни операции перестановки: `ClassCreate` с `extra="forbid"` отвечает 422 на `index` / `position`, а PATCH/PUT/DELETE на коллекцию возвращают 405 (D-13, D-14).
- Схемы `ClassCreate` / `ClassUpdate` / `ClassRead` (поле `index` — алиас столбца `position`, `Z`-формат времени) и `get_class_or_404` определены сейчас и ждут Plan 02-05; `palette.py` с `next_color` (первый неиспользованный цвет, иначе цикл по числу классов).
- Страница Classes: заголовок со счётчиком, подсказка про индекс, форма добавления (клиентские проверки пустого/слишком длинного имени без запроса, замок повторной отправки через `useRef`, ошибка 409 под полем со значением на месте, очистка и фокус после успеха), список в `Paper` с заголовком колонок и 48-пиксельными строками, 3 `Skeleton`, красный `Alert` с кнопкой «Повторить», `EmptyState`.
- Боковая панель: Overview, Images, Classes, Settings; активна только текущая секция. Локализации en/ru (`classes`, `project:nav.classes`, `common:retry`) с паритетом ключей.

## Task Commits

1. **Task 1 RED: контракт API классов** - `3b23415` (test)
2. **Task 1 GREEN: миграция, модель, схемы, палитра, роутер** - `6916dd0` (feat)
3. **Task 2 RED: поведение страницы Classes** - `72beee6` (test)
4. **Task 2 GREEN: страница, форма, строка, маршрут, i18n** - `72a7dc8` (feat)

**Plan metadata:** отдельный docs-коммит (SUMMARY, STATE, ROADMAP, REQUIREMENTS).

## Files Created/Modified

- `backend/src/yolo_trainer_api/migrations/versions/0003_create_classes.py` - таблица `classes`, индексы, CHECK
- `backend/src/yolo_trainer_api/{models,schemas,main}.py` - `ProjectClass`, схемы классов, подключение роутера
- `backend/src/yolo_trainer_api/palette.py` - `CLASS_PALETTE`, `next_color`
- `backend/src/yolo_trainer_api/routers/classes.py` - `get_class_or_404`, GET/POST
- `backend/tests/test_classes_api.py` - 21 тест (16 функций, часть параметризована)
- `frontend/src/api/classes.ts`, `lib/classPalette.ts` - хуки и палитра
- `frontend/src/features/classes/*` - страница, форма, строка, 9 тестов
- `frontend/src/{app/routes.tsx,features/project/ProjectLayout.tsx}` - маршрут и пункт меню
- `frontend/src/i18n/locales/{en,ru}/*.json` - строки

## Decisions Made

См. `key-decisions` в frontmatter. Главное: индекс (важный для целостности) вычисляется атомарно внутри INSERT, а цвет по умолчанию выбирается до него (при одновременных созданиях цвета могут совпасть, что только косметика).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Существующий тест ProjectOverviewPage запрещал ссылку «Classes»**
- **Found during:** Task 2
- **Issue:** тест «no unbuilt-section links» проверял регулярным выражением `/classes|training|models/i`, т.е. считал Classes ещё не построенной секцией; после добавления пункта меню (по плану) он стал бы падать.
- **Fix:** регулярное выражение сужено до `/training|models/i`, комментарий обновлён (Classes теперь реальная секция, как Images и Settings).
- **Files modified:** frontend/src/features/project/ProjectOverviewPage.test.tsx
- **Verification:** `npm --prefix frontend run test -- --run` (65 passed)
- **Committed in:** 72a7dc8

**2. [Rule 2 - Missing Critical] Не-именная ошибка целостности при создании класса**
- **Found during:** Task 1 (router)
- **Issue:** `IntegrityError` при INSERT может означать не коллизию имени, а удаление проекта во время вставки; тогда ответ «A class named ... already exists» был бы неверным.
- **Fix:** если сохранённое имя не найдено, повторно вызывается `get_project_or_404` (даёт 404 «Project not found.»), иначе остаётся 409.
- **Files modified:** backend/src/yolo_trainer_api/routers/classes.py
- **Committed in:** 6916dd0

---

**Total deviations:** 2 auto-fixed (1 bug in existing test, 1 missing critical)
**Impact on plan:** обе правки необходимы для корректности; расширения области нет.

## TDD Gate Compliance

Обе задачи выполнены по циклу RED-GREEN с отдельными коммитами: `test(02-02)` `3b23415` (импорт `ProjectClass` падает с ImportError до реализации) и `72beee6` (импорт `ClassesPage`/маршрута отсутствует), затем `feat(02-02)` `6916dd0` и `72a7dc8`. REFACTOR-коммитов нет (рефакторинг не потребовался; `ruff format` применён до GREEN-коммита).

## Issues Encountered

- Одна ошибка в самом тесте (`client.delete(..., json=...)` не принимает `json`), исправлена через `client.request(...)` до коммита GREEN.
- Составная bash-команда с несколькими heredoc не разобралась оболочкой (то же, что в 02-01); файлы созданы инструментом Write, ничего не было записано частично.

## Known Stubs

None. (Строка класса пока без элементов переименования, смены цвета и удаления: они намеренно появятся в Plan 02-05 и не относятся к цели этого плана.)

## Threat Flags

None - новые поверхности (GET/POST /classes, цвет в inline-стиле) уже учтены в threat_model плана (T2-02-01..T2-02-05). Цвет попадает в `background` только после серверной проверки `^#[0-9A-Fa-f]{6}$` и DB CHECK; имя выводится как текст React с атрибутом `title`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Контракты для Plan 02-05 готовы: `ClassUpdate`, `get_class_or_404`, `classKeys`, `CLASS_PALETTE`, `ClassRow` (сюда добавятся переименование, смена цвета и удаление), неуникальный индекс по `position`.
- Нужна визуальная проверка страницы Classes (held-out, backstop): 100-символьное имя усекается с многоточием в ru и en, высота строк и скелетон.
- Compose smoke test для этого плана не запускался (план его не требует); миграция 0003 проверена pytest на реальной SQLite и через `migration_head()`.

## Self-Check: PASSED

Проверено: все созданные файлы существуют на диске, коммиты `3b23415`, `6916dd0`, `72beee6`, `72a7dc8` присутствуют в `git log`, `uv run pytest backend/tests` (138 passed), `ruff check` и `ruff format --check` чистые, `npm run build` и `npm run test -- --run` (65 passed) зелёные, все grep-критерии приёмки обеих задач выполнены.

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
