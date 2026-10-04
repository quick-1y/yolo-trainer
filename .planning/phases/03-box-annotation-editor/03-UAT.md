---
status: testing
phase: 03-box-annotation-editor
source: [03-VERIFICATION.md]
started: 2026-10-04T17:10:00Z
updated: 2026-10-04T17:10:00Z
---

## Current Test

number: 1
name: Решение по WR-02 — запись реестра в состоянии conflict считается не-dirty и может быть вытеснена (MAX_ENTRIES = 30)
expected: |
  Решить: исправить в рамках фазы (dirty = true в ветке 409 saver-а плюс тест реестра на 31 запись) либо принять как известное ограничение
awaiting: user response

## Tests

### 1. Решение по WR-02 — conflict-запись реестра может быть вытеснена
expected: Решить: исправить в рамках фазы (dirty = true в ветке 409 saver-а плюс тест реестра на 31 запись) либо принять как известное ограничение
result: [pending]

### 2. Решение по WR-03 — 408/429 отбрасывают несохранённые правки через resync
expected: Решить: считать 408/429 повторяемыми (retry с backoff) либо принять
result: [pending]

### 3. Браузерный чек-лист, пункты 1-13 из 03-13-SUMMARY.md
expected: Каждый пункт ведёт себя как описано в чек-листе (Transformer при 100%/400%, отпускание мыши вне окна, русская раскладка, Space/средняя кнопка, EXIF JPEG/WebP, 8000x6000, длинное имя класса, две вкладки с конфликтом, docker compose stop/start api, сетка после правок и удаления класса, 1024 px на русском, LAN-origin, окно справки)
result: [pending]

### 4. Визуальные пункты human_judgment из SUMMARY 03-01..03-12
expected: Визуально соответствует 03-UI-SPEC.md (fit-to-window, halo и chip-подписи, панель инструментов, accent ring / hover / fill, переходы между изображениями, верхняя панель на 1280 и 1440 px, плашки на миниатюрах, баннеры конфликта/ориентации, индикатор retry в обеих локалях)
result: [pending]

### 5. Space при фокусе на кнопке (WR-04)
expected: Кнопки панели инструментов, Back, Prev/Next, строки классов активируются Space с клавиатуры (по ревью сейчас глобальный preventDefault на Space их блокирует)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
