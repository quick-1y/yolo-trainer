---
status: testing
phase: 02-image-upload-classes
source: [02-VERIFICATION.md]
started: 2026-10-03T15:30:00Z
updated: 2026-10-03T15:30:00Z
---

## Current Test

number: 1
name: SC2 — 5000 изображений, плавность скролла
expected: |
  `uv run python scripts/seed_images.py --count 5000 --project-id <id>`, затем страница Images в реальном браузере:
  скролл сверху вниз и обратно без подвисаний, `document.querySelectorAll("img").length` остаётся в пределах нескольких сотен.
awaiting: user response

## Tests

### 1. SC2 — 5000 изображений, плавность скролла
expected: Скролл без подвисаний, число DOM-плиток ограничено окном просмотра, миниатюры подгружаются по мере скролла
result: [pending]

### 2. SC1 — drag-and-drop нескольких файлов и целой папки (Chrome/Firefox/Edge) + диалоги выбора файлов и папки
expected: Файлы из вложенных папок загружены, прогресс виден, итоговая сводка показывает added/duplicates/rejected с причинами (посторонние файлы — в отклонённых)
result: [pending]

### 3. SC4 — `docker compose down` / `up`, затем просмотр в браузере
expected: Изображения, миниатюры и классы (с индексами и цветами) на месте
result: [pending]

### 4. Визуальная сверка с 02-UI-SPEC
expected: Тёмная тема, плитки 184x208, обрезка имени из 255 символов и имени класса из 100 символов (RU/EN), цвета классов, отчёт на 5000 отклонённых, переключение RU/EN
result: [pending]

### 5. CR-01 — загрузить > 100 изображений, Shift-выделить первые 100, удалить
expected: Подгружается следующая страница (сейчас: пустое состояние при счётчике > 0 — решение владельца, исправлять сейчас или отложить; см. также WR-01, удаление > 1000 выделенных даёт 422)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
