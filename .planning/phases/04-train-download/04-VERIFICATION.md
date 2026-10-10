---
phase: 04-train-download
verified: 2026-10-10T21:30:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".planning/phases/04-train-download/04-01-PLAN.md"
  - ".planning/phases/04-train-download/04-01-SUMMARY.md"
  - ".planning/phases/04-train-download/04-02-PLAN.md"
  - ".planning/phases/04-train-download/04-02-SUMMARY.md"
  - ".planning/phases/04-train-download/04-03-PLAN.md"
  - ".planning/phases/04-train-download/04-03-SUMMARY.md"
  - ".planning/phases/04-train-download/04-04-PLAN.md"
  - ".planning/phases/04-train-download/04-04-SUMMARY.md"
  - ".planning/phases/04-train-download/04-05-PLAN.md"
  - ".planning/phases/04-train-download/04-05-SUMMARY.md"
  - ".planning/phases/04-train-download/04-06-PLAN.md"
  - ".planning/phases/04-train-download/04-06-SUMMARY.md"
  - ".planning/phases/04-train-download/04-07-PLAN.md"
  - ".planning/phases/04-train-download/04-07-SUMMARY.md"
  - ".planning/phases/04-train-download/04-08-PLAN.md"
  - ".planning/phases/04-train-download/04-08-SUMMARY.md"
  - ".planning/phases/04-train-download/04-09-PLAN.md"
  - ".planning/phases/04-train-download/04-09-SUMMARY.md"
  - ".planning/phases/04-train-download/04-10-PLAN.md"
  - ".planning/phases/04-train-download/04-10-SUMMARY.md"
  - ".planning/phases/04-train-download/04-11-PLAN.md"
  - ".planning/phases/04-train-download/04-11-SUMMARY.md"
  - "backend/src/yolo_trainer_api/routers/models.py"
  - "backend/src/yolo_trainer_api/routers/runs.py"
  - "backend/src/yolo_trainer_api/routers/splits.py"
  - "backend/src/yolo_trainer_api/training/options.py"
  - "backend/src/yolo_trainer_api/training/reconcile.py"
  - "backend/src/yolo_trainer_api/training/service.py"
  - "backend/src/yolo_trainer_api/training/snapshot.py"
  - "backend/src/yolo_trainer_worker/main.py"
  - "backend/src/yolo_trainer_worker/queue.py"
  - "backend/src/yolo_trainer_worker/supervisor.py"
  - "backend/src/yolo_trainer_worker/train_job.py"
  - "docker-compose.yml"
  - "frontend/src/features/images/AutoSplitDialog.tsx"
  - "frontend/src/features/training/NewRunPage.tsx"
  - "frontend/src/features/training/RunPage.tsx"
  - "scripts/verify_model_download.py"
covered_digest: "v3:sha256:8ab2a5ffc499ff166d067cc041d8bb53405acba0183911b64442f5c009335f3f"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Полный цикл в реальном браузере: создать проект, загрузить изображения, добавить классы, разметить (включая background), назначить split, запустить обучение, скачать .pt"
    expected: "Весь путь upload -> annotate -> train -> download проходит без ручных обходов; кнопка 'Download .pt' отдаёт файл"
    why_human: "Реальный UX браузера; автоматизация (vitest + pytest) покрывает компоненты и API по отдельности, но не сквозной браузерный сценарий"
  - test: "Закрыть вкладку во время обучения, открыть заново; смотреть индикаторы в шапке и в редакторе; клик по индикатору из редактора сохраняет перед переходом"
    expected: "Прогресс run сохраняется, индикатор 'Training: <project> / <run>, epoch N/M' виден, переход из редактора идёт через flush сохранения"
    why_human: "Живое обучение + браузер (SC3 в части 'закрытие браузера не останавливает run')"
  - test: "`docker compose restart api` и `docker compose restart worker` посреди обучения"
    expected: "api-only рестарт не прерывает живой run; рестарт worker помечает run как interrupted, queued-run остаётся queued"
    why_human: "Живые контейнеры (SC3 в части 'рестарт бэкенда'); логика покрыта pytest (reconcile, supervisor), но не реальный Docker-рестарт в этой проверке"
  - test: "Скачанный .pt загружается в окружении downstream-проекта через `YOLO(path)` и делает predict"
    expected: "task и names совпадают с проектом; predict отрабатывает на версии Ultralytics downstream-проекта"
    why_human: "Внешнее окружение; в этой проверке подтверждено только для того же окружения (3 реальных CPU-теста + scripts/verify_model_download.py)"
  - test: "Очередь: два проекта, queue position, удаление queued-run; дообучение от модели, обученной в сервисе (+ жёлтая заметка о несовпадении классов)"
    expected: "Позиции в очереди пересчитываются; run от model-base стартует; заметка не блокирует Start"
    why_human: "Два живых проекта и живое обучение"
  - test: "Auto-split: preview, apply, и 409 при изменении набора unassigned во второй вкладке; bulk/editor split не меняет индикатор сохранения"
    expected: "Нужные тексты, сообщения и состояния без визуальных артефактов"
    why_human: "Многовкладочная гонка и визуальное поведение"
  - test: "Offline-ошибка скачивания весов (cut network) и переключатель 'Show log'; удаление проекта с queued-run"
    expected: "Понятное сообщение 'Could not download ...'; лог сворачивается; диалог удаления заблокирован при активном run"
    why_human: "Отключение сети и визуальная проверка"
  - test: "Вёрстка при 1024 и 1440 px в en и ru: длинные имена усекаются, 5000-символьная строка лога переносится, верхняя панель редактора помещается; EXIF orientation 6 в контейнере; README (en/ru) соответствует UI"
    expected: "Нет горизонтального переполнения; панель редактора умещается, сжимается только имя файла"
    why_human: "Визуальная проверка (три backstop-тезиса UI) и оценка качества документации"
---

# Phase 4: Train & Download Verification Report

**Phase Goal:** A user can turn an annotated project into a trained model from the browser and download a `.pt` the downstream project can load, completing the upload -> annotate -> train -> download loop
**Verified:** 2026-10-10T21:30:00Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Итог

Цель фазы достигнута на уровне кода: ни один must-have не провален. Все пять критериев успеха ROADMAP и 7 ID требований подтверждены кодом и повторно запущенными тестами. Статус `human_needed` (не `passed`) вызван тем, что остаются 13 пунктов UAT на браузере/Docker/внешнем окружении, которые автоматизация не может оценить (см. раздел Human Verification), и 5 открытых предупреждений code review (WR-01..WR-05), из которых WR-01 подтверждён по исходникам Ultralytics.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Ручное назначение train/valid/test либо авто-split по ratio, применяется только после подтверждения; run не стартует при пустом train/valid, UI объясняет причину | VERIFIED | `routers/splits.py`: `set_split` пишет только `Image.split` (не трогает annotation_version), `preview_auto_split` ничего не пишет, `apply_auto_split` отдаёт 409 при дрейфе `expected_unassigned` (`AUTO_SPLIT_DRIFT_DETAIL`), UPDATE защищены `split IS NULL`. `splits.py::auto_split` детерминирован (seed). `service.blocker_codes` + `create_run` отдают 422 с `NO_CLASSES/TRAIN_EMPTY/VALID_EMPTY_DETAIL`; `options.py::dataset_notes` использует то же правило, UI показывает блокеры (`NewRunPage`, `DatasetNotes`). `AutoSplitDialog` шлёт `expected_unassigned` из preview. Тесты: `test_splits_auto.py`, `test_splits_api.py`, `test_runs_api.py::test_a_run_is_refused_without_classes / test_train_and_valid_must_hold_annotated_images`; vitest (AutoSplitDialog, ImagesSplit, EditorSplit, NewRunPage) прошли. |
| 2 | Старт обучения из браузера: выбор базы и epochs/imgsz/batch/device; база - официальная Ultralytics-модель для task type проекта (автоскачивание) либо модель, обученная в сервисе | VERIFIED | `RunCreate` принимает `OfficialBase | ModelBase`; `service._resolve_base` проверяет allow-list (`catalog.is_official`) и task type, для model-base берёт только id из таблицы `models` и проверяет файл (`layout.model_file`). `train_job._resolve_weights` резолвит официальные веса в абсолютный `DATA_DIR/weights/<name>.pt` с `attempt_download_asset` (скачивание при первом использовании) и модель-базу по id. `NewRunPage` -> `useCreateRun` -> навигация на страницу run. Реальный CPU-тест использует `yolo26n`. |
| 3 | Обучение в фоновом воркере: UI отзывчив, закрытие браузера не останавливает run, переоткрытие показывает статус, рестарт бэкенда помечает run interrupted | VERIFIED (+ human для живых рестартов) | Отдельный сервис `worker` в `docker-compose.yml` (depends_on api healthy, `stop_grace_period: 20s`); `queue.claim_next` - один атомарный `UPDATE ... RETURNING` с проверкой "нет running"; `Supervisor` запускает `python -m yolo_trainer_worker.train_job` argument-list без shell, пишет прогресс в БД; `reconcile_on_start` (worker) переводит running -> interrupted, queued остаются; `reconcile_runs_on_startup` (api) учитывает свежесть heartbeat; SIGTERM -> `_terminate` + `mark_interrupted`. Статус хранится в БД, `RunPage` поллит каждые 3 с. Тесты: `test_training_reconcile.py`, `test_worker_supervisor.py`, `test_worker_queue.py`, `test_training_pipeline.py::test_reconcile_on_start_interrupts_running_runs_and_keeps_queued_ones`. Реальный Docker-рестарт - в human-списке. |
| 4 | По завершении модель регистрируется (метрики, классы, task type, source run); `.pt` скачивается и грузится через `YOLO(path)` в простом Python-скрипте | VERIFIED | `queue.register_model`: одна транзакция, строка `models` (имя, task_type, class_names, metrics, precision/recall/map50/map50_95, base_name, source_run_id, size, sha256) + `data/models/<id>.pt` (hard link/copy) с откатом файла при сбое; `last.pt` не регистрируется. `routers/models.py::download_model` отдаёт `FileResponse` `application/octet-stream`, путь только из id. `RunPage` - plain anchor с `download`. Я повторно запустил `uv run pytest backend/tests -m training`: 3 passed (32 с), включая реальный 2-эпохный CPU-run, который проверяет epoch=2/2 (final_validation отдельно), регистрацию и загрузку `YOLO(path)` в свежем процессе (task `detect`, names `['box']`, predict OK). `scripts/verify_model_download.py` повторяет downstream-использование. |
| 5 | Снапшот настроек и точного датасета (images, labels, splits, classes) на run; последующие правки аннотаций не меняют записанное | VERIFIED | `service.create_run`: INSERT run - первый write транзакции, `capture_snapshot` читает классы/изображения/боксы внутри той же транзакции; `materialize` строит `runs/<id>/dataset/{split}/{images,labels}` (hard link картинок, копия как fallback), `data.yaml`, `manifest.json` (counts, sha256, excluded), `job.json`; в БД сохраняются `settings`, `dataset_counts`, `class_names`. `test_training_snapshot.py` / `test_training_pipeline.py::test_the_snapshot_is_independent_of_later_edits` проверяют неизменность после правок аннотаций, классов, split и удаления изображений. |

**Score:** 5/5 truths verified (0 behavior-unverified; поведенческие тезисы SC3/SC4 подтверждены запущенными тестами).

### Обязательные truths из PLAN (выборка по ключевым рискам)

| Truth | Status | Evidence |
|-------|--------|----------|
| Только неаннотированное исключается; unassigned не используется (prohibition, test-tier) | VERIFIED | `capture_snapshot` читает только `Image.split IS NOT NULL`, пропускает `not is_background and not boxes` и считает в `excluded_unannotated`; `test_start_snapshots_annotated_images_only_and_materializes_the_dataset` |
| Нет телеметрии Ultralytics (prohibition, test-tier) | VERIFIED | `train_job.configure_ultralytics` делает `sync: False` до создания модели, `YOLO_CONFIG_DIR` изолирован; `test_the_isolated_ultralytics_settings_file_has_analytics_off`, `test_train_job_disables_sync_first_and_tags_the_final_validation`; `check_font` отключён, исходящий доступ - только allow-list веса |
| Split не меняется без явного действия пользователя (prohibition, test-tier) | VERIFIED | Загрузки оставляют split null; preview не пишет (`test_the_preview_counts_the_unassigned_images_and_changes_nothing`); apply трогает только `split IS NULL` |
| Финальная валидация не выглядит как эпоха > epochs | VERIFIED | `train_job.on_fit_epoch_end` тегирует `final_validation`, `Supervisor._watch` пропускает такие события при `record_epoch`; реальный тест: `[False, False, True]`, epoch `[1, 2, 2]` |
| Один run одновременно; FIFO; удаление queued не гоняется с claim | VERIFIED | `claim_next` (exists-проверка running) и `remove_queued_run` (DELETE ... WHERE status='queued'); тесты `test_claim_is_fifo_and_only_one_run_is_running_at_a_time`, `test_runs_remove.py` |
| Ошибка -> failed с сообщением и cleaned tail лога | VERIFIED | `Supervisor._finish` + `_read_error_message` + `clean_log_tail`; `test_a_failing_trainer_keeps_its_message_and_a_clean_log_tail` |
| Скачивание: sanitized filename, 404 для неизвестного id/файла | VERIFIED | `model_download_name`, `download_model`; `test_models_download.py` |
| UI-backstop тезисы (усечение 100 символов, перенос 5000-символьной строки, 1024 px ru) | UNCERTAIN -> human | Помечены `verification: backstop` в PLAN; нужна визуальная проверка (пункт 8 human-списка) |

### Required Artifacts

`gsd verify.artifacts` для всех 11 PLAN: все артефакты прошли (01: 7/7, 02: 5/5, 03: 3/3, 04: 2/2, 05: 3/3, 06: 2/2, 07: 4/4, 08: 3/3, 09: 2/2, 10: 2/2, 11: 2/2). Ключевые файлы прочитаны вручную и содержательны (не заглушки): `training/service.py`, `training/snapshot.py`, `training/options.py`, `training/reconcile.py`, `worker/queue.py`, `worker/supervisor.py`, `worker/train_job.py`, `worker/main.py`, `routers/{runs,models,splits}.py`, `scripts/verify_model_download.py`.

### Key Link Verification

`gsd verify.key-links`: 01: 5/5, 02: 4/4, 03: 3/3, 04: 1/2, 05: 3/3, 06: 2/2, 07: 2/2, 08: 3/3, 09: 2/2, 10: 4/4, 11: 1/1. Единственное "не верифицировано" (04: `test_migrations.py` -> `0005_training.py`, pattern `0004`) - артефакт самого инструмента (YAML разобрал `0004` как число); вручную подтверждено: `test_migrations.py` апгрейдит БД с 0004 (`_seed_0004`, `command.upgrade(config, "0004")`), проверяет `ck_images_split` (`bogus` отвергается) и сохранность `AUTOINCREMENT`. Дополнительно вручную: `main.py` подключает `runs_router`, `splits_router`, `models_router` и вызывает `reconcile_runs_on_startup`; `routes.tsx` содержит `training`, `training/new`, `training/:runId`; `RunPage` -> `modelDownloadUrl` + `download`; `NewRunPage` -> `useCreateRun` -> `navigate`.

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `RunPage` / `TrainingPage` | run, status, epoch, model | `GET /runs`, `/runs/{id}` -> `service.run_read` -> таблицы `training_runs`/`models`, обновляются `queue.record_epoch` из `progress.jsonl` | Да | FLOWING |
| `NewRunPage` | options/summary/blockers | `GET /training/options` -> `build_options` -> реальные SQL-агрегаты (`dataset_summary`) + heartbeat | Да | FLOWING |
| Скачивание `.pt` | файл | `data/models/<id>.pt`, созданный `register_model` из реального `best.pt` | Да | FLOWING |
| Индикатор активного run | active run | `GET /training/active` -> `training_runs.status='running'` | Да | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Весь backend-набор | `uv run pytest backend/tests -q` | 645 passed, 3 deselected | PASS |
| Реальное CPU-обучение + `YOLO(path)` в свежем процессе | `uv run pytest backend/tests -m training -q` | 3 passed, 645 deselected (32 с) | PASS |
| Frontend (Фаза-4 набор) | `npx vitest run src/features/training src/features/images/AutoSplitDialog.test.tsx src/features/images/ImagesSplit.test.tsx src/features/editor/EditorSplit.test.tsx` | 7 files, 142 passed | PASS |
| Полные frontend-набор / build / compose smoke | - (не перезапускались мной) | Принято по свидетельству оркестратора и 04-11 (`ALL CHECKS OK`, 731 тест, build OK, `SMOKE OK`) | SKIP (принято на веру, не переподтверждено; Docker-часть входит в human-проверки) |

### Probe Execution

Фаза не объявляет `probe-*.sh`; `scripts/*/tests/probe-*.sh` отсутствуют. Step 7c: не применимо.

### Requirements Coverage

Все 7 ID из ROADMAP присутствуют в `requirements:` PLAN-файлов и в REQUIREMENTS.md; осиротевших требований нет.

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| DATA-05 | 01, 03, 06, 08 | Ручной split + подтверждаемый авто-split по ratio | SATISFIED | `routers/splits.py`, `splits.py`, `SplitMenu`, `AutoSplitDialog`, тесты split/auto-split |
| MODL-01 | 01, 02, 05, 08 | Официальная предобученная модель как база, автоскачивание | SATISFIED | `catalog.py`, `_resolve_base`, `train_job._resolve_weights`, реальный run на `yolo26n` |
| MODL-03 | 01, 05, 09 | Авторегистрация модели с метриками, классами, task type, source run | SATISFIED | `queue.register_model`, реальный CPU-тест |
| MODL-04 | 01, 02, 07, 11 | Скачивание `.pt` | SATISFIED | `routers/models.py`, `RunPage` download anchor, `verify_model_download.py` |
| TRAN-01 | 01, 02, 08, 11 | Старт обучения из браузера с базой и настройками | SATISFIED | `POST /runs`, `NewRunPage`, `options.py` |
| TRAN-03 | 01, 04, 07, 09 | Снапшот датасета и настроек | SATISFIED | `capture_snapshot` / `materialize` / `manifest.json`, `RunSettingsCard`, тесты иммутабельности |
| TRAN-04 | 01, 02, 05, 07, 10, 11 | Фоновое обучение, UI отзывчив, переживает закрытие браузера | SATISFIED (живой Docker-рестарт - human) | worker-сервис, `Supervisor`, `claim_next`, reconcile |

Заметка по трекингу: в `REQUIREMENTS.md` эти 7 ID пока отмечены `[ ]` / `Pending` - это переводится при `phase.complete`, а не дефект реализации.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/yolo_trainer_api/training/snapshot.py` | 161-188 | Hard link картинок проекта в датасет run (WR-01). Я проверил `.venv/.../ultralytics/data/utils.py:237-238`: для JPEG без маркера `\xff\xd9` Ultralytics пересохраняет файл по тому же пути - это перезапишет inode оригинала проекта (sha256/size в БД перестанут соответствовать, README обещает "stored exactly as uploaded") | Warning | Не ломает цикл и SC5 (датасет run остаётся согласованным), но может тихо изменить оригинал усечённого JPEG пользователя. Требует решения |
| `backend/src/yolo_trainer_api/routers/runs.py`, `training/service.py` | 41-48, 227-257 | Падение после `add_task` или внутри `prepare_run_files` оставляет run в `preparing` (WR-02) | Warning | Редкий путь; выход - перезапуск api (`reconcile_runs_on_startup`); блокирует имя и удаление проекта до тех пор |
| `backend/src/yolo_trainer_worker/main.py` | 114-152 | `write_heartbeat` без try/except в потоке (WR-03) | Warning | Ошибка записи может остановить heartbeat; при последующем рестарте api живой run будет помечен interrupted |
| `backend/src/yolo_trainer_api/training/labels.py` | 50-66 | U+0085/U+2028/U+2029 в именах классов портят `data.yaml` (WR-04) | Warning | Run упадёт после обучения на `CLASS_MISMATCH` |
| `backend/src/yolo_trainer_common/heartbeat.py` | 21-50 | Naive timestamp / heartbeat из будущего (WR-05) | Warning | Краевой случай свежести heartbeat |
| `routers/splits.py` | 100-128 | Дрейф auto-split сравнивает только количество unassigned (не набор id) | Info | Показанные счётчики остаются верными; запись защищена `split IS NULL` |

Маркеров `TBD/FIXME/XXX` в `backend/src`, `frontend/src`, `scripts`, `docker-compose.yml` не найдено. Все 13 findings из 04-REVIEW.md имеют disposition `open` (0 critical, 5 warning, 8 info); блокирующих (BLOCKER) для цели фазы нет.

### Human Verification Required

13 пунктов чек-листа 04-11 (04-VALIDATION.md, "Manual-Only Verifications") и поведенческие backstop-тезисы UI. Сгруппированы во frontmatter (`human_verification`): сквозной браузерный сценарий; закрытие вкладки и индикаторы; `docker compose restart api/worker` посреди обучения; загрузка `.pt` в окружении downstream-проекта; очередь и дообучение от модели; авто-split с гонкой вкладок; offline-ошибка скачивания и блокировка удаления проекта; вёрстка 1024/1440 px (en/ru), перенос длинного лога, EXIF orientation 6, соответствие README. Не покрыты на этой машине GPU-путь и macOS/native Linux (перенесено в Фазу 12).

### Gaps Summary

Gaps (FAILED must-haves) отсутствуют. Фаза достигла цели на уровне кода и автотестов: реальный CPU-run проходит весь путь split -> snapshot -> worker -> callbacks -> регистрация -> скачивание -> `YOLO(path)` в чистом процессе. Остаются (1) ручной UAT по 13 пунктам и (2) решение владельца по предупреждениям review, в первую очередь WR-01 (hard link и возможность перезаписи оригинала) и WR-02/WR-03 (зависание `preparing`, смерть heartbeat-потока). Их можно закрыть отдельным gap-closure планом или принять как известные риски.

---

_Verified: 2026-10-10T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
