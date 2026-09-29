---
status: testing
phase: 01-runnable-skeleton-projects
source: [01-VERIFICATION.md]
started: 2026-09-29T05:46:42Z
updated: 2026-09-29T05:46:42Z
---

## Current Test

number: 1
name: Полный пользовательский сценарий в реальном браузере
expected: |
  Открыть http://127.0.0.1:8080 после `docker compose up --build`; создать проект detect и segment, переименовать, открыть, удалить (с вводом точного имени), переключить язык RU/EN, перезагрузить страницу. UI отрисовывается без визуальных дефектов, все действия работают в браузере, выбор языка сохраняется после перезагрузки.
awaiting: user response

## Tests

### 1. Полный пользовательский сценарий в реальном браузере
expected: Открыть http://127.0.0.1:8080 после `docker compose up --build`; создать проект detect и segment, переименовать, открыть, удалить (с вводом точного имени), переключить язык RU/EN, перезагрузить страницу. UI отрисовывается без визуальных дефектов, все действия работают в браузере (а не только в jsdom), выбор языка сохраняется после перезагрузки.
result: [pending]

### 2. docker compose up на Linux и macOS (CPU-only)
expected: Стек поднимается, проекты сохраняются между down/up (для Docker Desktop на macOS — проверить WAL-оговорку из README).
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
