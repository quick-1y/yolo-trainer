---
status: complete
phase: 01-runnable-skeleton-projects
source: [01-VERIFICATION.md]
started: 2026-09-29T05:46:42Z
updated: 2026-09-29T05:59:44Z
---

## Current Test

[testing complete]

## Tests

### 1. Полный пользовательский сценарий в реальном браузере
expected: Открыть http://127.0.0.1:8080 после `docker compose up --build`; создать проект detect и segment, переименовать, открыть, удалить (с вводом точного имени), переключить язык RU/EN, перезагрузить страницу. UI отрисовывается без визуальных дефектов, все действия работают в браузере (а не только в jsdom), выбор языка сохраняется после перезагрузки.
result: pass

### 2. docker compose up на Linux и macOS (CPU-only)
expected: Стек поднимается, проекты сохраняются между down/up (для Docker Desktop на macOS — проверить WAL-оговорку из README).
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
