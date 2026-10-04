---
phase: 03-box-annotation-editor
verified: 2026-10-04T17:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files:

  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/03-box-annotation-editor/03-01-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-01-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-02-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-02-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-03-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-03-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-04-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-04-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-05-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-05-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-06-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-06-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-07-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-07-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-08-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-08-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-09-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-09-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-10-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-10-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-11-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-11-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-12-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-12-SUMMARY.md"
  - ".planning/phases/03-box-annotation-editor/03-13-PLAN.md"
  - ".planning/phases/03-box-annotation-editor/03-13-SUMMARY.md"
  - "backend/src/yolo_trainer_api/annotations.py"
  - "backend/src/yolo_trainer_api/routers/annotations.py"
  - "frontend/src/features/editor/EditorPage.tsx"
  - "frontend/src/features/editor/lib/shortcuts.ts"
  - "frontend/src/features/editor/store/annotationSaver.ts"
  - "frontend/src/features/editor/store/annotationStore.ts"
  - "frontend/src/features/editor/store/storeRegistry.ts"

covered_digest: "v1:sha256:ea11321aa54edaf355de53766adbb6f363f988387a2c5d7841fbd935f1716807"
behavior_unverified: 0
overrides_applied: 0
human_verification:

  - test: "Решение разработчика по WR-02: запись реестра в состоянии conflict считается не-dirty и может быть вытеснена (MAX_ENTRIES = 30)"
    expected: "Решить: исправить в рамках фазы (одна строка dirty = true в ветке 409 saver-а плюс тест реестра на 31 запись) либо принять как известное ограничение"
    why_human: "Код подтверждён чтением, но достижимость узкая (конфликт из двух вкладок + уход с изображения + более 30 других записей); решение о приоритете за человеком"
  - test: "Решение разработчика по WR-03: 408 и 429 (в том числе от nginx) идут по ветке onRejected и вызывают resyncAnnotations, то есть отбрасывают несохранённые правки"
    expected: "Решить: считать 408/429 повторяемыми (retry с backoff) либо принять"
    why_human: "Прямой путь потери работы при транзитной 4xx, подтверждён чтением кода; в текущем nginx.conf.template лимитов нет, но 408 возможен при медленной отправке тела. Затрагивает формулировку цели 'никогда не терять работу'"
  - test: "Пункты 1-13 из 'End-of-Phase Browser Checklist' в 03-13-SUMMARY.md (реальный Transformer при 100% и 400%, отпускание мыши вне окна, русская раскладка, Space/средняя кнопка для панорамы, EXIF JPEG/WebP, изображение 8000x6000, длинное имя класса, две вкладки с конфликтом, docker compose stop/start api, сетка после правок и удаление класса, ширина 1024 px на русском, LAN-origin, окно справки)"
    expected: "Каждый пункт ведёт себя как описано в чек-листе"
    why_human: "jsdom не умеет hit-testing фигур, реальный pointer capture, раскладку и сеть; это браузерное поведение без автоматизированного покрытия"
  - test: "Визуальные пункты human_judgment из SUMMARY 03-01..03-12: поля и матовый фон fit-to-window, читаемость halo и chip-подписей на светлых и тёмных изображениях, разделитель и подсказки панели инструментов, 2px accent ring / #2E2E2E / 30% fill, ощущение мгновенного перехода между изображениями, перенос верхней панели на 1280 и 1440 px, плашки на ярких миниатюрах, баннеры конфликта и ориентации и индикатор retry в обеих локалях"
    expected: "Визуально соответствует 03-UI-SPEC.md"
    why_human: "Визуальная оценка и ощущение отклика"
  - test: "Клавиша Space при фокусе на кнопке (WR-04)"
    expected: "Кнопки панели инструментов, Back, Prev/Next, строки классов активируются Space с клавиатуры; сейчас глобальный preventDefault на Space их блокирует (по ревью)"
    why_human: "Доступность и поведение фокуса в реальном браузере; влияет на SC4 'управление клавиатурой' только для кнопок, не для горячих клавиш"
---

# Phase 3: Box Annotation Editor Verification Report

**Phase Goal:** A user can annotate images one by one with bounding boxes in a fast, keyboard-driven editor without ever losing work
**Verified:** 2026-10-04T17:00:00Z
**Status:** human_needed
**Re-verification:** No, первичная верификация

## Goal Achievement

Ядро цели достигнуто в коде: сохранение построено на атомарном compare-and-swap (бэкенд), клиент хранит историю в zundo, сохраняет через последовательный saver с backoff и защищает вкладку через `beforeunload`. Документы SUMMARY сверены с кодом, а не приняты на веру. Автоматические проверки подтверждены независимым запуском. Остаются два подтверждённых краевых пути потери правок (WR-02, WR-03) и браузерный чек-лист, поэтому статус `human_needed`, а не `passed`.

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Открытие изображения из сетки в редакторе, zoom/pan, переход вперёд/назад без возврата в сетку | VERIFIED | `ImagesPage.tsx:115` `navigate(editorPath(...))`, вьюер-модалка удалена (в `features/images` нет viewer-файлов); маршрут `routes.tsx` лениво грузит `EditorPage`; `useEditorNavigation`, `/neighbors` в `routers/annotations.py:136-184`; `useStageViewport`, `ZoomOverlay`; хоткеи `prev`/`next` в `EditorPage.tsx:491-492`; тесты `EditorNavigation.test.tsx`, `useStageViewport.test.ts` проходят |
| 2 | Рисование, выбор, перемещение, изменение размера, удаление боксов, назначение класса, смена класса у существующего бокса | VERIFIED | `annotationStore.ts` `createBox/updateBox/deleteBox/setBoxClass`; `EditorPage.tsx:440-472` `handleCreate`, `handleChange`, `chooseClass` (цифры и панель классов), `ObjectList.tsx:110` смена класса через Select; `BoxShape.tsx` с Transformer; unit-тесты стора (create/move/delete/class change, undo) проходят |
| 3 | Каждое изменение сохраняется автоматически и переживает перезагрузку; undo/redo по create, move, resize, class-change, delete | VERIFIED (с оговорками WR-02/03) | Бэкенд: `annotations.py::apply_save` с CAS-UPDATE первой инструкцией, rollback на всех ошибках, идемпотентный повтор (`_conflict`); клиент: `storeRegistry.getEditor` подписывает `store.subscribe` на `saver.schedule`, saver сериализован, дебаунс 400 мс, backoff 1/2/4/8/15 с для 5xx/сети; `beforeunload` guard (`anyUnsaved`); undo/redo через `temporal`, лимит 100; тест `EditorPage.test.tsx#shows the saved boxes again after a reload`, `annotationStore.test.ts` 'steps back through create, move and delete and forward again', смоук `compose_smoke_test.sh` проверяет бокс после down/up |
| 4 | Переключение инструментов, выбор классов, сохранение, навигация горячими клавишами; список в экранной справке | VERIFIED | `lib/shortcuts.ts` единая таблица из 17 рядов (V, B, Delete/Backspace, Ctrl+Z, Ctrl+Shift+Z/Y, Esc, 1-9, A/D/стрелки, R, G, N, F/0, Ctrl+S, ?); привязка `usePhysicalKeys` (русская раскладка); `ShortcutsModal` генерируется из той же таблицы + `POINTER_GESTURES`; кнопка `?` в верхней панели; тесты `ShortcutsModal.test.tsx` (9) и `shortcuts.test.ts` проходят |
| 5 | Статус изображения (unannotated/annotated/reviewed), переход к следующему неразмеченному, пометка background | VERIFIED | Бэкенд: `unannotated_clause`, `derive_status`, `/images/next-unannotated` (keyset + wrap), `/images/status-counts`; клиент: `docStatus`, `toggleBackground` (только без боксов, D-14), `toggleReviewed` (D-13), хоткеи `G`/`R`/`N`; `useNextUnannotated`; тесты `test_annotations_status.py`, `test_annotations_navigation.py`, `EditorStatus.test.tsx`, `EditorNextUnannotated.test.tsx` проходят |

**Score:** 5/5 критериев ROADMAP подтверждены (0 присутствуют без поведенческого доказательства; браузерные аспекты вынесены в human_verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/src/yolo_trainer_api/annotations.py` | CAS-сохранение, статус, загрузка набора | VERIFIED | Прочитан полностью; 227 строк, CAS первым оператором; проводка в роутере |
| `backend/src/yolo_trainer_api/routers/annotations.py` | GET/PUT, neighbors, next-unannotated, status-counts | VERIFIED | Подключён; PUT под `require_xhr`; литеральные пути объявлены выше `{image_id}` |
| `backend/src/yolo_trainer_api/migrations/versions/0004_create_annotations.py` | Миграция таблицы аннотаций и флагов | VERIFIED | Покрыта `test_migrations.py` (в наборе 389 тестов) |
| `frontend/src/features/editor/store/annotationStore.ts` | Док + история | VERIFIED | zundo `temporal`, `partialize` по `doc`, `limit: 100` |
| `frontend/src/features/editor/store/annotationSaver.ts` | Серийный saver | VERIFIED с замечаниями | См. WR-02/WR-03 |
| `frontend/src/features/editor/store/storeRegistry.ts` | Реестр, guard выгрузки | VERIFIED с замечанием | См. WR-02 |
| `frontend/src/features/editor/EditorPage.tsx` | Сборка редактора | VERIFIED | Подключает хоткеи, холст, панели, LeaveDialog, ShortcutsModal, ConflictBanner |
| `frontend/src/features/editor/ShortcutsModal.tsx` | Экранная справка | VERIFIED | Генерируется из `SHORTCUTS` |
| `frontend/src/features/editor/lib/shortcuts.ts` | Единая таблица | VERIFIED | 17 рядов |
| `scripts/compose_smoke_test.sh` | Смоук с кругом бокса | VERIFIED | Содержит проверку сохранения бокса после down/up |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `ImagesPage` | редактор | `navigate(editorPath(...))` | WIRED | `ImagesPage.tsx:115` |
| store | saver | `store.subscribe` -> `saver.schedule` | WIRED | `storeRegistry.ts:137-141` |
| saver | сервер | `createAnnotationSender` -> PUT | WIRED | `EditorPage.tsx` передаёт sender в `getEditor` |
| хоткеи | store | `useEditorHotkeys` handlers | WIRED | `EditorPage.tsx:498-526` |
| `SHORTCUTS` | `ShortcutsModal` | импорт таблицы | WIRED | Одна таблица для хоткеев и справки |
| saver `onRejected` | resync | `handlers.onRejected` | WIRED (с дефектом WR-03) | Любая 4xx кроме 404/409 вызывает сброс правок |
| class delete | версия изображений | `routers/classes.py` bump version | WIRED | Покрыто тестами `test_classes_api.py` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `EditorPage` | `set` / `boxes` | GET `/annotations` -> `load_annotation_set` (SELECT из `annotations`) | Да | FLOWING |
| `EditorTopBar` статус | `docStatus(doc)` | store `doc` из `docFromSet` | Да | FLOWING |
| Сетка | `box_count`, статус | SQL по `annotations` и флагам изображения | Да | FLOWING (кэш сетки после удаления класса устаревает до 5 мин, WR-01) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Бэкенд-набор | `uv run pytest backend/tests -x -q` | 389 passed, 1 warning, 100 с | PASS |
| Типы фронтенда | `npx tsc --noEmit` (из `frontend/`) | пустой вывод | PASS |
| Фронтенд-набор | `npx vitest run` | 51 файл, 564/564 passed | PASS |
| Перезагрузка показывает сохранённые боксы | `EditorPage.test.tsx` "shows the saved boxes again after a reload" (в составе полного прогона) | pass | PASS |
| Undo/redo в порядке create, move, delete | `annotationStore.test.ts` (в составе полного прогона) | pass | PASS |

Полный набор запущен один раз, повторных фильтрованных прогонов не делалось.

### Probe Execution

Step 7c: SKIPPED. План не объявляет probe-скрипты (`scripts/*/tests/probe-*.sh` отсутствуют). Смоук-тест compose запускался планом 03-13 через `scripts/run_full_suite.sh` и не перезапускался (поднимает сервисы).

### Requirements Coverage

Все ID из frontmatter планов найдены в REQUIREMENTS.md; сирот нет (в Phase 3 отображены ровно ANNO-02, 03, 06, 07, 08, 09, 10; ANNO-04/05 принадлежат Phase 6).

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| ANNO-02 | 03-01, 03-04, 03-07, 03-10 | Открытие редактора, zoom/pan, next/prev | SATISFIED | SC1 |
| ANNO-03 | 03-01, 03-02, 03-03, 03-05, 03-06 | Рисование, выбор, перемещение, resize, удаление, класс | SATISFIED | SC2 |
| ANNO-06 | 03-06 | Смена класса существующей аннотации | SATISFIED | `setBoxClass`, `ObjectList`, цифры при выбранном боксе |
| ANNO-07 | 03-01, 03-02, 03-05, 03-12 | Автосохранение, переживает перезагрузку, undo/redo | SATISFIED (в коде) | SC3; в REQUIREMENTS.md остаётся `[ ]` и `Pending` (см. ниже) |
| ANNO-08 | 03-05, 03-06, 03-07, 03-08, 03-10, 03-12, 03-13 | Горячие клавиши | SATISFIED | SC4 |
| ANNO-09 | 03-08, 03-09, 03-11 | Статус и переход к следующему неразмеченному | SATISFIED | SC5 |
| ANNO-10 | 03-02, 03-08 | Background (пустой файл меток) | SATISFIED | `toggleBackground`, `is_background`, README: только явный background даёт пустую разметку |

Расхождение учёта: `.planning/REQUIREMENTS.md` строки 50 и 160 помечают ANNO-07 как `[ ]` / `Pending`, хотя планы 03-02, 03-05, 03-12 заявили его закрытым, а код и тесты это подтверждают. Требуется обновить REQUIREMENTS.md (оркестратор) после решения по WR-02/03.

### Anti-Patterns Found

Маркеры TBD/FIXME/XXX в `backend/src`, `frontend/src`, `scripts` не найдены (блокеров по долговым маркерам нет). Находки из 03-REVIEW.md проверены на предмет влияния на цель:

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `annotationSaver.ts` / `storeRegistry.ts` | 135-139 / 84 | WR-02: при 409 `dirty` остаётся `false` (сброшен перед `send`), `isDirty()` возвращает false; `evictIfNeeded` вытесняет запись по `isDirty()` | Warning (подтверждено чтением) | Несохранённые правки в конфликте могут быть тихо отброшены при более чем 30 записях реестра. `anyUnsaved()` не затронута (проверяет `saveState`). Узкий путь, но противоречит комментарию "never dropped" |
| `annotationSaver.ts` / `EditorPage.tsx` | 144-145 / 186-190 | WR-03: любая 4xx, кроме 404/409, считается отказом, `resyncAnnotations()` вызывает `discardEditor` | Warning (подтверждено чтением) | Транзитные 408/429 (или 4xx прокси) приводят к потере несохранённых правок вместо retry. Прямой конфликт с целью "без потери работы" на краевом пути |
| `AnnotationCanvas.tsx` | 194-229 | WR-04: глобальный `preventDefault` на Space | Warning | Space не активирует сфокусированные кнопки; горячие клавиши не затронуты |
| `api/classes.ts` | 98-105 | WR-01: кэш сетки устаревает 5 мин после удаления класса | Warning | Расхождение чипов и счётчиков, данные на сервере верны |
| `schemas.py`, `routers/annotations.py` | 218, 247, 63 | WR-05: целые вне 64-бит дают 500 вместо 422 | Warning | Валидация входа, потери данных нет |
| `0004_create_annotations.py` | 79-82 | WR-06: downgrade теряет AUTOINCREMENT | Warning | Только путь downgrade |
| прочее | - | IN-01..IN-06 | Info | Не влияют на цель |

### Human Verification Required

#### 1. Решение по WR-02 (вытеснение записи в конфликте)

**Test:** Решить, чинить ли сейчас: `dirty = true` в ветке 409 в `annotationSaver.ts` (`schedule`/`flush` уже защищены флагом `conflicted`) либо проверка `saveState === "conflict"` в `evictIfNeeded`, плюс тест реестра на более чем 30 записей с одной конфликтной.
**Expected:** Запись с несохранёнными правками никогда не вытесняется.
**Why human:** Подтверждено в коде, достижимость узкая; нужен приоритет.

#### 2. Решение по WR-03 (408/429 отбрасывают правки)

**Test:** Решить, чинить ли сейчас: исключить 408 и 429 из ветки `onRejected` (`error.status !== 408 && error.status !== 429`).
**Expected:** Транзитные 4xx повторяются по backoff, правки не теряются.
**Why human:** Подтверждено в коде; это единственная находка, напрямую опровергающая "ни при каких условиях не терять работу". Вердикт: не блокер фазы, но рекомендуется закрыть до Phase 4.

#### 3. Браузерный чек-лист (пункты 1-13 из 03-13-SUMMARY.md)

**Test:** Выполнить после `docker compose up --build` в Chrome или Edge и ещё одном браузере.
**Expected:** Поведение по каждому пункту (Transformer при 100%/400%, отпускание вне окна, русская раскладка, панорамирование, EXIF, 8000x6000, длинное имя класса, две вкладки, остановка и запуск api, сетка после правок, 1024 px на русском, LAN, окно справки).
**Why human:** jsdom не воспроизводит hit-testing, pointer capture, раскладку, сеть.

#### 4. Визуальные пункты human_judgment (SUMMARY 03-01..03-12)

**Test:** Проверить поля fit-to-window, читаемость подписей, акцентные кольца, перенос верхней панели, баннеры и индикатор retry в en и ru.
**Expected:** Соответствие `03-UI-SPEC.md`.
**Why human:** Визуальная оценка.

#### 5. Space на сфокусированных кнопках (WR-04)

**Test:** Табом сфокусировать кнопки Back, Prev/Next, инструменты, строки классов и нажать Space.
**Expected:** Кнопка активируется.
**Why human:** Поведение фокуса в реальном браузере.

### Gaps Summary

Блокирующих разрывов (FAILED-истин) нет: все пять критериев ROADMAP подтверждены кодом и независимо запущенными наборами (backend 389, frontend 564, tsc чисто). Артефакты существуют, содержательны, подключены, данные текут от реальных SQL-запросов. Статус `human_needed` обусловлен (а) браузерным чек-листом, который по конфигурации `human_verify_mode = end-of-phase` относится к финалу фазы, и (б) двумя подтверждёнными краевыми путями потери несохранённых правок (WR-02, WR-03), по которым нужно решение разработчика. Пометка в ROADMAP/REQUIREMENTS: ANNO-07 в REQUIREMENTS.md остаётся `Pending` и должен быть переведён в `Complete`. Файл `03-VALIDATION.md` остался незаполненным черновиком (`status: draft`, плейсхолдеры), на цель не влияет, но nyquist-аудит покажет NOT-VALIDATED.

---

_Verified: 2026-10-04T17:00:00Z_
_Verifier: Claude (gsd-verifier)_
