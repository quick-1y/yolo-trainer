---
phase: 02-image-upload-classes
plan: 05
subsystem: api
tags: [fastapi, sqlalchemy, react, mantine, react-query, i18n, tdd]

requires:
  - phase: 02-image-upload-classes
    provides: "plan 02-02: ProjectClass model, ClassUpdate, get_class_or_404, classKeys, CLASS_PALETTE, ClassRow"
provides:
  - PATCH /api/projects/{id}/classes/{class_id} (rename and recolor)
  - DELETE /api/projects/{id}/classes/{class_id} with an index shift in the same transaction
  - useUpdateClass, useDeleteClass, DeleteClassModal, inline rename and swatch recolor popover in ClassRow
affects: [phase-03-annotation, phase-09-export]

plan_head_before: b393b76a3e8a8213ee8d4bae3a244993f68d91f7

actuals:
  tokens: 21000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "PATCH captures the attempted normalized name before rollback and names the already-stored class in the 409"
    - "DELETE and the position shift (position - 1 for later classes) run in one transaction; position has no unique constraint"
    - "useUpdateClass writes the server answer into the cached list so a row does not flicker before the refetch"
    - "Two useUpdateClass instances per row (rename, recolor) keep pending state independent"
    - "finishedRef guards the follow-up blur after Enter or Esc so rename never saves twice or after cancel"

key-files:
  created:
    - frontend/src/features/classes/DeleteClassModal.tsx
    - frontend/src/features/classes/DeleteClassModal.test.tsx
    - frontend/src/features/classes/ClassRow.test.tsx
  modified:
    - backend/src/yolo_trainer_api/routers/classes.py
    - backend/tests/test_classes_api.py
    - frontend/src/api/classes.ts
    - frontend/src/features/classes/ClassRow.tsx
    - frontend/src/features/classes/ClassesPage.tsx
    - frontend/src/i18n/locales/en/classes.json
    - frontend/src/i18n/locales/ru/classes.json

key-decisions:
  - "Recolor sends PATCH only from ColorPicker onChangeEnd (verified in the installed Mantine 9.6.3 d.ts), so no popover-close fallback was needed; onChange only updates the local optimistic color."
  - "Blur does not resend a value the server already rejected with 409 (Enter does); an emptied input never saves, Enter keeps editing and blur cancels."
  - "ClassRow owns the DeleteClassModal open state; ClassesPage only passes hasLaterClasses = index < items.length - 1."

patterns-established:
  - "Class delete confirmation: modal without a typed name, Cancel carries data-autofocus, red confirm, useRef submit lock, 404 as success"

requirements-completed: [PROJ-03]

coverage:
  - id: D1
    description: "PATCH /classes/{id}: rename keeps the index, case-variant of own name allowed, 409 names the stored class and changes nothing, color uppercased, 422 for bad color / null / extra field, empty body is a no-op, repeat is idempotent, other project's class gives 404"
    requirement: PROJ-03
    verification:
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_patch_renames_class_and_keeps_index"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_patch_to_a_case_variant_of_another_class_returns_409_naming_the_stored_class"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_patch_rejects_invalid_bodies_with_422"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_patch_with_empty_body_is_a_noop_and_repeating_is_idempotent"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_patch_class_of_another_project_returns_404"
        status: pass
    human_judgment: false
  - id: D2
    description: "DELETE /classes/{id}: 204, later indices shift down by one in the same transaction, ids and colors unchanged, second delete 404, other projects untouched, fixed-seed sequence of 15 creates/deletes leaves indices exactly 0..N-1"
    requirement: PROJ-03
    verification:
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_delete_middle_class_shifts_later_indices_down"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_delete_in_one_project_leaves_another_projects_indices_alone"
        status: pass
      - kind: integration
        ref: "backend/tests/test_classes_api.py#test_random_create_delete_sequence_keeps_indices_contiguous"
        status: pass
    human_judgment: false
  - id: D3
    description: "Inline rename in ClassRow: focused input with the name selected, Enter saves, Esc restores without a request, empty or unchanged value does not save, 409 keeps the input open with the API message, input disabled while pending"
    requirement: PROJ-03
    verification:
      - kind: unit
        ref: "frontend/src/features/classes/ClassRow.test.tsx#ClassRow rename (5 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Recolor from the swatch popover: aria-label, one PATCH {color} per preset choice, optimistic swatch, revert plus red notification on failure, no request when the color is unchanged"
    requirement: PROJ-03
    verification:
      - kind: unit
        ref: "frontend/src/features/classes/ClassRow.test.tsx#ClassRow recolor (3 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Delete confirmation (prohibition D-16): no DELETE before the confirm button, Cancel and Esc close without a request, focus starts on Cancel, one DELETE then close and green notification and shifted list, shift sentence only when later classes exist, 404 treated as success, 500 shown in a red Alert with the dialog open"
    requirement: PROJ-03
    verification:
      - kind: unit
        ref: "frontend/src/features/classes/DeleteClassModal.test.tsx (7 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Visual fit in a real browser: 48px row with Rename and Delete not wrapping out of the row, ellipsis of a long name next to two buttons, ColorPicker popover look, real-timing double-click protection"
    requirement: PROJ-03
    verification:
      - kind: other
        ref: "npm --prefix frontend run build (type check) and component tests"
        status: pass
    human_judgment: true
    rationale: "jsdom does not lay out or measure; row height, ellipsis, popover placement and the swatch contrast on dark-6 need a visual check in a browser"

duration: 6min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 05: Manage Classes Summary

**PATCH и DELETE классов (переименование без учёта регистра своего же имени, перекраска, удаление со сдвигом индексов в той же транзакции) плюс строка класса с inline-переименованием, поповером ColorPicker и диалогом подтверждения удаления.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-03T08:32:00Z
- **Completed:** 2026-10-03T08:38:00Z
- **Tasks:** 2 (оба TDD: RED и GREEN отдельными коммитами)
- **Files modified:** 10 (3 созданных, 7 изменённых)

## Accomplishments

- `PATCH /classes/{class_id}`: поля `name?`/`color?`, 409 называет уже сохранённый класс (имя берётся до rollback, как в Phase 1 Plan 09), цвет приводится к верхнему регистру, пустое тело - 200 без изменений, класс другого проекта - 404 `Class not found.`.
- `DELETE /classes/{class_id}` (204): удаление строки и `UPDATE ... position = position - 1 WHERE position > deleted` в одной транзакции; фиксированная последовательность из 15 случайных create/delete оставляет индексы ровно `0..N-1`; повторное удаление - 404, соседние проекты не затрагиваются.
- `ClassRow`: 24x24 кнопка-свотч с `aria-label`, поповер с `ColorPicker` (hex, палитра, 6 в ряд), PATCH только из `onChangeEnd`, оптимистичный цвет с откатом и красным уведомлением; кнопка Rename заменяет имя на `TextInput` (Enter и blur сохраняют, Esc отменяет, 409 остаётся в поле, поле disabled во время запроса); группа действий с `wrap="nowrap"`.
- `DeleteClassModal`: без ввода имени, фокус на Cancel, красная кнопка подтверждения, замок повторной отправки, зелёное уведомление, красный `Alert` при ошибке, предложение про сдвиг индексов только если есть классы после удаляемого; `useDeleteClass` считает 404 успехом.
- i18n en/ru с идентичными ключами: `row.rename`, `row.changeColor`, `row.delete`, `delete.{title,body,shiftNote,confirm,done}`.

## Task Commits

1. **Task 1 RED: контракт переименования и перекраски** - `ef80508` (test)
2. **Task 1 GREEN: PATCH, useUpdateClass, ClassRow rename/recolor** - `2dddbf0` (feat)
3. **Task 2 RED: удаление класса и подтверждение** - `324016f` (test)
4. **Task 2 GREEN: DELETE со сдвигом, DeleteClassModal, кнопка Delete** - `5f1d60d` (feat)

**Plan metadata:** отдельный docs-коммит (SUMMARY, STATE, ROADMAP, REQUIREMENTS).

## Files Created/Modified

- `backend/src/yolo_trainer_api/routers/classes.py` - `update_class`, `delete_class`
- `backend/tests/test_classes_api.py` - 18 новых тестов (14 функций PATCH/DELETE, часть параметризована): итого 39 в файле
- `frontend/src/api/classes.ts` - `useUpdateClass`, `useDeleteClass`
- `frontend/src/features/classes/ClassRow.tsx` - rename, recolor, кнопка Delete
- `frontend/src/features/classes/DeleteClassModal.tsx` - диалог подтверждения
- `frontend/src/features/classes/ClassesPage.tsx` - `projectId` и `hasLaterClasses` в строки
- `frontend/src/features/classes/ClassRow.test.tsx`, `DeleteClassModal.test.tsx` - 8 и 7 тестов
- `frontend/src/i18n/locales/{en,ru}/classes.json` - строки

## Decisions Made

См. `key-decisions` во frontmatter. Резервный вариант "отправка при закрытии поповера" не понадобился: `onChangeEnd` подтверждён в d.ts установленного Mantine 9.6.3 и работает в тестах.

## Deviations from Plan

None - plan executed exactly as written.

Мелочи реализации, не меняющие область: во время Task 2 `prettier --write` по каталогу случайно переформатировал `AddClassForm.tsx` и `ClassesPage.test.tsx`; эти изменения откатил до коммита, чтобы diff содержал только файлы плана.

## TDD Gate Compliance

Обе задачи прошли RED-GREEN отдельными коммитами. RED: `ef80508` (8 из 8 тестов ClassRow падали, бэкенд-тест PATCH падал на 405) и `324016f` (7 из 7 тестов DeleteClassModal и 7 тестов DELETE падали). GREEN: `2dddbf0` и `5f1d60d`. REFACTOR-коммитов нет, не потребовались.

## Issues Encountered

- Один тест написан неверно (в диалоге заголовок и кнопка подтверждения имеют одинаковый текст "Delete class", `getByText` находил два элемента); исправлено запросом по `role="heading"` до GREEN-коммита.
- В `package.json` нет скрипта `lint`; проверка стиля выполнена `prettier` для затронутых файлов и `ruff check/format` для бэкенда.

## Known Stubs

None.

## Threat Flags

None - новые поверхности (PATCH/DELETE по id) покрыты T2-05-01..T2-05-04: выборка всегда по `(project_id, class_id)` через `get_class_or_404` (тест на 404 для чужого проекта), DELETE и сдвиг в одной транзакции (тест последовательности), DELETE из UI только после нажатия кнопки подтверждения (тест "ни одного DELETE до confirm", фокус на Cancel), CSRF закрыт отсутствием CORS и JSON content type.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PROJ-03 закрыт целиком: классы создаются, переименовываются, перекрашиваются и удаляются, индексы всегда непрерывны.
- Phase 3 может добавить в `DeleteClassModal` строку "N объектов будет удалено" рядом с `shiftNote`; каскад аннотаций через `class_id` ... ON DELETE CASCADE.
- Нужна визуальная проверка в браузере (held-out, backstop): строка 48px с двумя кнопками справа, усечение длинного имени, вид поповера.
- Compose smoke test для этого плана не запускался (план его не требует).

## Self-Check: PASSED

Проверено: созданные файлы (`DeleteClassModal.tsx`, `DeleteClassModal.test.tsx`, `ClassRow.test.tsx`) существуют; коммиты `ef80508`, `2dddbf0`, `324016f`, `5f1d60d` в `git log`; `uv run pytest backend/tests` (231 passed), `ruff check` и `ruff format --check` чистые, `npm run test -- --run` (80 passed) и `npm run build` зелёные; grep-критерии: `@router.patch` = 1, `@router.delete` = 1, `position - 1` = 1, `client.patch(` = 10, `onChangeEnd` = 1, `useUpdateClass`/`useDeleteClass` в api/classes.ts, `shiftNote` в DeleteClassModal.tsx, `DELETE` в DeleteClassModal.test.tsx = 6.

---
*Phase: 02-image-upload-classes*
*Completed: 2026-10-03*
