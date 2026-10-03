---
status: diagnosed
phase: 02-image-upload-classes
source: [02-VERIFICATION.md]
started: 2026-10-03T15:30:00Z
updated: 2026-10-03T17:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. SC2 — 5000 изображений, плавность скролла
expected: Скролл без подвисаний, число DOM-плиток ограничено окном просмотра, миниатюры подгружаются по мере скролла
result: pass

### 2. SC1 — drag-and-drop нескольких файлов и целой папки (Chrome/Firefox/Edge) + диалоги выбора файлов и папки
expected: Файлы из вложенных папок загружены, прогресс виден, итоговая сводка показывает added/duplicates/rejected с причинами (посторонние файлы — в отклонённых)
result: pass

### 3. SC4 — `docker compose down` / `up`, затем просмотр в браузере
expected: Изображения, миниатюры и классы (с индексами и цветами) на месте
result: pass

### 4. Визуальная сверка с 02-UI-SPEC
expected: Тёмная тема, плитки 184x208, обрезка имени из 255 символов и имени класса из 100 символов (RU/EN), цвета классов, отчёт на 5000 отклонённых, переключение RU/EN
result: pass

### 5. CR-01 — загрузить > 100 изображений, Shift-выделить первые 100, удалить
expected: Подгружается следующая страница (сейчас: пустое состояние при счётчике > 0 — решение владельца, исправлять сейчас или отложить; см. также WR-01, удаление > 1000 выделенных даёт 422)
result: issue
reported: "Ошибка ids: List should have at most 1000 items after validation, not 1067 — да, получил (WR-01 воспроизведён: Shift-выделение 1067 изображений и удаление). CR-01 вручную недостижим: при прокрутке до последней плитки подгружается следующая страница; дефект подтверждён код-ревью. Владелец согласен исправлять сейчас."
severity: major

## Summary

total: 5
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-02-5
  truth: "Удаление выделенных изображений работает при любом размере выделения (> 1000 id) и после удаления всех загруженных элементов подгружается следующая страница, а не пустое состояние при счётчике > 0"
  status: failed
  reason: "User reported: Ошибка ids: List should have at most 1000 items after validation, not 1067 (WR-01). CR-01 подтверждён код-ревью (02-REVIEW.md)."
  severity: major
  test: 5
  root_cause: "WR-01: useDeleteImages отправляет все выделенные id одним POST /images/delete, а схема бэкенда ограничивает ids до 1000 (max_length=1000) → 422 с сырым текстом в модалке. CR-01: pruneDeletedImages убирает id из кэшированных страниц, но не трогает next_cursor; при items.length === 0 и hasNextPage === true ImagesPage рендерит EmptyState, ImageGrid размонтирован, endReached не срабатывает, invalidateQueries(refetchType: 'none') рефетч не запускает."
  artifacts:
    - path: "frontend/src/api/images.ts"
      issue: "useDeleteImages шлёт все id одним запросом (стр. ~151); pruneDeletedImages не догружает страницы (стр. 131-147)"
    - path: "frontend/src/features/images/ImagesPage.tsx"
      issue: "ветка пустого состояния (стр. ~262) не учитывает hasNextPage; нет догрузки при пустом списке"
    - path: "backend/src/yolo_trainer_api/schemas.py"
      issue: "ids max_length=1000 (стр. 188) — лимит остаётся, клиент должен резать на чанки"
  missing:
    - "Резать ids на чанки по 1000 в useDeleteImages, отправлять последовательно, суммировать deleted"
    - "Эффект в ImagesPage: если данные загружены, items.length === 0, hasNextPage и не идёт/не упала загрузка — fetchNextPage(); не показывать EmptyState, пока есть следующая страница"
    - "Тесты: удаление > 1000 id (несколько запросов, суммарный deleted) и удаление всех загруженных при наличии next_cursor (подгрузка следующей страницы)"
  debug_session: ".planning/phases/02-image-upload-classes/02-REVIEW.md (CR-01, WR-01)"
