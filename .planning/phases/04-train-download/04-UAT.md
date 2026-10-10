---
status: testing
phase: 04-train-download
source: [04-VERIFICATION.md]
started: 2026-10-11T00:00:00Z
updated: 2026-10-11T00:00:00Z
---

## Current Test

number: 1
name: Полный цикл в реальном браузере (upload → annotate → split → train → download)
expected: |
  Весь путь upload -> annotate -> train -> download проходит без ручных обходов; кнопка 'Download .pt' отдаёт файл
awaiting: user response

## Tests

Подробные шаги — чек-лист из 13 пунктов в 04-11-SUMMARY.md ("Human Checklist for UAT"), после `docker compose up --build`, в Chrome/Edge и Firefox.

### 1. Полный цикл в реальном браузере: создать проект, загрузить изображения, добавить классы, разметить (включая background), назначить split, запустить обучение, скачать .pt
expected: Весь путь upload -> annotate -> train -> download проходит без ручных обходов; кнопка 'Download .pt' отдаёт файл
result: [pending]

### 2. Закрыть вкладку во время обучения, открыть заново; индикаторы в шапке и в редакторе; клик по индикатору из редактора сохраняет перед переходом
expected: Прогресс run сохраняется, индикатор 'Training: <project> / <run>, epoch N/M' виден, переход из редактора идёт через flush сохранения
result: [pending]

### 3. `docker compose restart api` и `docker compose restart worker` посреди обучения
expected: api-only рестарт не прерывает живой run; рестарт worker помечает run как interrupted, queued-run остаётся queued
result: [pending]

### 4. Скачанный .pt загружается в окружении downstream-проекта через `YOLO(path)` и делает predict
expected: task и names совпадают с проектом; predict отрабатывает на версии Ultralytics downstream-проекта (также `uv run python scripts/verify_model_download.py <file> --image <image>`)
result: [pending]

### 5. Очередь: два проекта, queue position, удаление queued-run; дообучение от модели, обученной в сервисе (+ заметка о несовпадении классов)
expected: Позиции в очереди пересчитываются; run от model-base стартует; заметка не блокирует Start
result: [pending]

### 6. Auto-split: preview, apply и 409 при изменении набора unassigned во второй вкладке; bulk/editor split не меняет индикатор сохранения
expected: Нужные тексты, сообщения и состояния без визуальных артефактов
result: [pending]

### 7. Offline-ошибка скачивания весов (сеть отключена, нет data/weights/yolo11s.pt) и переключатель 'Show log'; удаление проекта с queued-run
expected: Понятное сообщение 'Could not download ...'; лог сворачивается; диалог удаления заблокирован при активном run
result: [pending]

### 8. Вёрстка 1024 и 1440 px в en и ru: усечение длинных имён, перенос 5000-символьной строки лога, верхняя панель редактора помещается; EXIF orientation 6 в контейнере; README (en/ru) соответствует UI
expected: Нет горизонтального переполнения; панель редактора умещается, сжимается только имя файла; размеры EXIF-изображения в воркере совпадают с ориентированными
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
