---
phase: 04-train-download
reviewed: 2026-10-10T00:00:00Z
depth: standard
files_reviewed: 113
files_reviewed_list:
  - README.md
  - README.ru.md
  - backend/pyproject.toml
  - backend/src/yolo_trainer_api/main.py
  - backend/src/yolo_trainer_api/migrations/versions/0005_training.py
  - backend/src/yolo_trainer_api/models.py
  - backend/src/yolo_trainer_api/routers/annotations.py
  - backend/src/yolo_trainer_api/routers/models.py
  - backend/src/yolo_trainer_api/routers/projects.py
  - backend/src/yolo_trainer_api/routers/runs.py
  - backend/src/yolo_trainer_api/routers/splits.py
  - backend/src/yolo_trainer_api/schemas.py
  - backend/src/yolo_trainer_api/settings.py
  - backend/src/yolo_trainer_api/splits.py
  - backend/src/yolo_trainer_api/storage.py
  - backend/src/yolo_trainer_api/training/__init__.py
  - backend/src/yolo_trainer_api/training/catalog.py
  - backend/src/yolo_trainer_api/training/labels.py
  - backend/src/yolo_trainer_api/training/options.py
  - backend/src/yolo_trainer_api/training/reconcile.py
  - backend/src/yolo_trainer_api/training/service.py
  - backend/src/yolo_trainer_api/training/snapshot.py
  - backend/src/yolo_trainer_common/heartbeat.py
  - backend/src/yolo_trainer_common/layout.py
  - backend/src/yolo_trainer_common/progress.py
  - backend/src/yolo_trainer_common/quality.py
  - backend/src/yolo_trainer_worker/main.py
  - backend/src/yolo_trainer_worker/queue.py
  - backend/src/yolo_trainer_worker/supervisor.py
  - backend/src/yolo_trainer_worker/train_job.py
  - backend/tests/fake_train_job.py
  - backend/tests/test_annotations_status.py
  - backend/tests/test_images_api.py
  - backend/tests/test_migrations.py
  - backend/tests/test_models_download.py
  - backend/tests/test_progress.py
  - backend/tests/test_projects_api.py
  - backend/tests/test_quality.py
  - backend/tests/test_runs_api.py
  - backend/tests/test_runs_remove.py
  - backend/tests/test_splits_api.py
  - backend/tests/test_splits_auto.py
  - backend/tests/test_train_job.py
  - backend/tests/test_training_active.py
  - backend/tests/test_training_cleanup.py
  - backend/tests/test_training_labels.py
  - backend/tests/test_training_options.py
  - backend/tests/test_training_pipeline.py
  - backend/tests/test_training_reconcile.py
  - backend/tests/test_training_snapshot.py
  - backend/tests/test_verify_model_download.py
  - backend/tests/test_worker.py
  - backend/tests/test_worker_queue.py
  - backend/tests/test_worker_supervisor.py
  - backend/tests/training_helpers.py
  - docker-compose.yml
  - frontend/src/api/images.ts
  - frontend/src/api/projects.ts
  - frontend/src/api/splits.test.ts
  - frontend/src/api/splits.ts
  - frontend/src/api/training.ts
  - frontend/src/app/AppLayout.tsx
  - frontend/src/app/routes.tsx
  - frontend/src/features/editor/EditorPage.tsx
  - frontend/src/features/editor/EditorSplit.test.tsx
  - frontend/src/features/editor/EditorTopBar.tsx
  - frontend/src/features/editor/useEditorNavigation.ts
  - frontend/src/features/images/AnnotateNext.test.tsx
  - frontend/src/features/images/AutoSplitDialog.test.tsx
  - frontend/src/features/images/AutoSplitDialog.tsx
  - frontend/src/features/images/ImageTile.module.css
  - frontend/src/features/images/ImageTile.test.tsx
  - frontend/src/features/images/ImageTile.tsx
  - frontend/src/features/images/ImagesPage.tsx
  - frontend/src/features/images/ImagesSplit.test.tsx
  - frontend/src/features/images/SelectionBar.tsx
  - frontend/src/features/images/SplitMenu.tsx
  - frontend/src/features/images/StatusSummary.test.tsx
  - frontend/src/features/images/StatusSummary.tsx
  - frontend/src/features/project/DeleteProjectModal.test.tsx
  - frontend/src/features/project/DeleteProjectModal.tsx
  - frontend/src/features/project/ProjectLayout.tsx
  - frontend/src/features/project/ProjectOverviewPage.test.tsx
  - frontend/src/features/training/ActiveRunIndicator.test.tsx
  - frontend/src/features/training/ActiveRunIndicator.tsx
  - frontend/src/features/training/DatasetNotes.tsx
  - frontend/src/features/training/DatasetSummary.tsx
  - frontend/src/features/training/NewRunPage.test.tsx
  - frontend/src/features/training/NewRunPage.tsx
  - frontend/src/features/training/RemoveFromQueueModal.tsx
  - frontend/src/features/training/RunFailureLog.tsx
  - frontend/src/features/training/RunMetrics.tsx
  - frontend/src/features/training/RunPage.test.tsx
  - frontend/src/features/training/RunPage.tsx
  - frontend/src/features/training/RunSettingsCard.tsx
  - frontend/src/features/training/RunStatusBadge.tsx
  - frontend/src/features/training/TrainingPage.module.css
  - frontend/src/features/training/TrainingPage.test.tsx
  - frontend/src/features/training/TrainingPage.tsx
  - frontend/src/i18n/locales/en/images.json
  - frontend/src/i18n/locales/en/project.json
  - frontend/src/i18n/locales/en/training.json
  - frontend/src/i18n/locales/ru/images.json
  - frontend/src/i18n/locales/ru/project.json
  - frontend/src/i18n/locales/ru/training.json
  - frontend/src/test/editorApi.ts
  - frontend/src/test/fixtures.ts
  - frontend/src/test/render.tsx
  - frontend/src/test/stubImagesApi.ts
  - frontend/src/test/trainingApi.ts
  - scripts/compose_smoke_test.sh
  - scripts/run_full_suite.sh
  - scripts/verify_model_download.py
findings:
  critical: 0
  warning: 5
  info: 8
  total: 13
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-10-10
**Depth:** standard
**Files Reviewed:** 113
**Status:** issues_found

## Summary

Просмотрены все 59 исходных файлов (backend/src, frontend/src без тестов, scripts, docker-compose.yml) по строкам и более поверхностно тесты, i18n JSON, CSS и README.

Общая оценка: реализация аккуратная. Атомарный claim очереди (`claim_next`), защита `DELETE project` одним guarded-statement, регистрация модели в одной транзакции с откатом файла, allow-list базовых моделей, id-производные пути, `require_xhr` на всех мутациях, argv-список без shell для subprocess - сделаны корректно. Паритет ключей en/ru в `images.json`, `project.json`, `training.json` полный; все статические ключи `t(...)` в компонентах фазы существуют в en-локали. `ruff format --check` проходит (90 files already formatted). Критических (BLOCKER) дефектов не найдено.

Найдено 5 предупреждений (WARNING), главное из которых: жёсткие ссылки на изображения проекта позволяют Ultralytics перезаписать оригинал пользователя (проверено по коду установленного ultralytics), и несколько путей, ведущих к "зависшему" состоянию run (`preparing` навсегда, либо потеря живого прогона из-за умершего heartbeat-потока). Известные из 04-SECURITY.md race (sweep vs register_model) и naive-timestamp TypeError здесь не пересчитываются как новые; для второго ниже показано, что последствия шире описанных (WR-05).

Пробелы в тестах: нет тестов на смерть heartbeat-потока, на запись Ultralytics через hard link, на class names со спецсимволами YAML (U+0085/U+2028/U+2029). Тесты false-green паттернов (assert True, xfail, .only) не содержат; skip только для окружения (symlink, yolo26n.pt).

## Warnings

### WR-01: Hard link в датасет позволяет Ultralytics перезаписать оригинал изображения проекта

**File:** `backend/src/yolo_trainer_api/training/snapshot.py:161-188`
**Issue:** `link_or_copy` по умолчанию делает `os.link(src, dst)`, то есть файл в `runs/<id>/dataset/<split>/images/` - тот же inode, что и оригинал в `data/projects/<pid>/images/`. В установленном Ultralytics (`ultralytics/data/utils.py:234-238`, `check_image`) для JPEG без маркера EOI (`\xff\xd9`) выполняется `ImageOps.exif_transpose(Image.open(im_file)).save(im_file, "JPEG", subsampling=0, quality=100)` - запись в тот же путь. PIL открывает файл на запись с усечением, поэтому изменяется inode, общий с проектом: оригинал пользователя тихо пересохраняется (перекодирование, quality=100, применённая EXIF-ориентация), его `size_bytes`/`sha256` в БД перестают соответствовать файлу, а README обещает "Originals are stored exactly as uploaded". Усечённые JPEG (недокачанные файлы) встречаются нередко, и загрузка их пропускает (Pillow читает такие файлы). Комментарий в `link_or_copy` учитывает только запись через уже существующий link в dst, но не запись обучающим процессом.
**Fix:** Для изображений не использовать hard link, либо монтировать датасет так, чтобы запись в него не доходила до оригинала. Минимально: для `ext == "jpg"` всегда `shutil.copy2`; или копировать, а не линковать, когда файл не оканчивается на `\xff\xd9`:
```python
def _ends_with_eoi(path: Path) -> bool:
    with path.open("rb") as handle:
        handle.seek(-2, os.SEEK_END)
        return handle.read() == b"\xff\xd9"

# в _materialize_image: для jpg без EOI - copy2 вместо link_or_copy
```
Добавить тест: усечённый JPEG в проекте остаётся побайтово неизменным после `check_image`.

### WR-02: Падение после `add_task` или внутри `prepare_run_files` оставляет run в `preparing` навсегда, без пути восстановления

**File:** `backend/src/yolo_trainer_api/routers/runs.py:41-48` и `backend/src/yolo_trainer_api/training/service.py:227-257`
**Issue:** В `start_run` фоновая задача добавляется ДО `await session.refresh(run)` и `service.run_read(...)`. В FastAPI background tasks присоединяются к response только после успешного возврата эндпоинта; если `refresh`/`run_read` бросит (например `OperationalError` при занятой БД, `RunSettings(**run.settings)`), клиент получает 500, а `prepare_run_files` никогда не запустится: строка уже закоммичена в `create_run` со статусом `preparing`. Аналогично в `prepare_run_files`: вторая сессия (`flip to queued`, строки 248-254) и сами `_set_failed`/`_remove_folder` в `except`-ветках находятся вне защитного try, любой их сбой завершает фоновую задачу исключением и оставляет run в `preparing`. Последствия: `remove_queued_run` отвечает 409 ("already started") на `preparing`, имя занято, проект нельзя удалить (`ACTIVE_RUN_STATUSES` включает `preparing`), и единственный выход - перезапуск api (`reconcile_runs_on_startup`).
**Fix:** Добавлять фоновую задачу последней строкой эндпоинта, после сборки ответа; в `prepare_run_files` обернуть всю тело в `try/except Exception`, где последняя попытка пометить run `failed` логируется отдельно:
```python
run_read_model = await service.run_read(session, run)
background_tasks.add_task(service.prepare_run_files, ...)
return run_read_model
```

### WR-03: Необработанное исключение в heartbeat-потоке молча убивает heartbeat, что приводит к потере живого прогона при рестарте api

**File:** `backend/src/yolo_trainer_worker/main.py:114-152, 203-214`
**Issue:** `run()` в цикле вызывает `write_heartbeat(...)` без try/except. Любой `OSError` (переполнение диска, сбой bind mount на Docker Desktop, `PermissionError`) завершает поток: он daemon, исключение лишь печатается в stderr, основной поток (supervisor) продолжает обучение. Файл heartbeat устаревает, и дальше: (а) `devices_from_heartbeat` считает воркер мёртвым ("workerStale", GPU пропадает из списка, `ensure_device_available` отказывает с 422 для `device="0"`); (б) при следующем старте api `reconcile_runs_on_startup` видит `worker_alive == False` и переводит `running` run в `interrupted`; (в) `Supervisor._watch` через `_still_running` видит статус != `running` и терминирует рабочий процесс обучения (`VANISHED`). То есть кратковременная ошибка записи файла превращается в потерю многочасового обучения. Тест `test_worker.py` проверяет только успешные записи.
**Fix:** Ловить `OSError` в цикле, логировать и продолжать, а `stop_event.wait` оставить вне try:
```python
while True:
    try:
        write_heartbeat(settings.heartbeat_path, build_heartbeat(...))
    except OSError:
        logger.warning("could not write the heartbeat; retrying", exc_info=True)
    if stop_event.wait(settings.heartbeat_interval_seconds):
        return
```
Добавить тест с `write_heartbeat`, бросающим `OSError` на первом вызове.

### WR-04: Имена классов с U+0085 / U+2028 / U+2029 портятся в `data.yaml`, и прогон падает только после завершения обучения

**File:** `backend/src/yolo_trainer_api/training/labels.py:50-66` (источник: `backend/src/yolo_trainer_api/schemas.py:24-42`)
**Issue:** Валидатор `ClassName`/`ProjectName` отвергает только C0-управляющие и DEL. Символы U+0085, U+2028, U+2029 проходят, а `json.dumps(name, ensure_ascii=False)` пишет их в `data.yaml` как сырые символы. YAML (PyYAML) трактует их внутри двойных кавычек как разрыв строки и сворачивает в пробел/перевод строки, поэтому имена в `model.names` расходятся с `run.class_names`. Несоответствие выявляется лишь в `Supervisor._finish` (`CLASS_MISMATCH_MESSAGE`) после полного цикла обучения: пользователь теряет часы CPU-времени ради гарантированного отказа. Комментарий в `data_yaml` справедливо требует `ensure_ascii=False` для астральных символов, но не учитывает эти три символа.
**Fix:** Либо запретить эти символы в `_validate_project_name` (расширить `_CONTROL_CHARS` диапазоном U+0080-U+009F и U+2028/U+2029), либо экранировать их при записи:
```python
def _yaml_quoted(name: str) -> str:
    text = json.dumps(name, ensure_ascii=False)
    return "".join(f"\\u{ord(c):04x}" if c in "\x85  " else c for c in text)
```
Добавить тест на класс с `" "`.

### WR-05: `is_heartbeat_fresh` бросает `TypeError` на naive-времени и считает "свежим" heartbeat из будущего; последствия шире, чем в 04-SECURITY.md

**File:** `backend/src/yolo_trainer_common/heartbeat.py:37-45` (потребители: `backend/src/yolo_trainer_api/training/options.py:46-58`, `backend/src/yolo_trainer_api/training/reconcile.py:62-64`)
**Issue:** Известно (04-SECURITY.md), что `last_heartbeat` без смещения даёт `TypeError` при вычитании из aware `now`. Дополнительно: (1) `except (KeyError, ValueError)` не ловит `TypeError`, поэтому исключение распространяется в `devices_from_heartbeat`, а из неё во все вызовы `build_options` -> `GET /training/options` отвечает 500 и форма "New training" недоступна целиком (хотя docstring `options.py` обещает, что "malformed file ... never an error"); (2) в `reconcile_runs_on_startup` исключение происходит ПОСЛЕ `UPDATE preparing -> failed`, но до `commit`, внешний `except Exception` проглатывает его, транзакция откатывается и вся зачистка startup тихо не выполняется; (3) heartbeat с временем в будущем (скачок часов, рассинхрон часов контейнера и хоста) даёт отрицательный возраст, `age_seconds < max_age_seconds` истинно, и мёртвый воркер считается живым неопределённо долго, поэтому `running` run не переводится в `interrupted`.
**Fix:**
```python
last = datetime.fromisoformat(str(payload["last_heartbeat"]).replace("Z", "+00:00"))
if last.tzinfo is None:
    last = last.replace(tzinfo=UTC)
...
age = (now - last).total_seconds()
return 0 <= age < max_age_seconds  # будущее время - не "свежо"
```
и `except (KeyError, ValueError, TypeError)`. В `reconcile_runs_on_startup` коммитить `preparing`-часть до проверки heartbeat.

## Info

### IN-01: Тестовый seam `_after_image_select` живёт в продакшн-коде

**File:** `backend/src/yolo_trainer_api/training/snapshot.py:67-72, 110`
**Issue:** Пустая функция-ловушка вызывается в горячем пути `capture_snapshot` только ради теста консистентности. Это допустимо, но увеличивает связь прод-кода с тестом.
**Fix:** Оставить с комментарием (уже есть) либо заменить на `monkeypatch` обёртки вокруг `session.execute` в тесте.

### IN-02: Магическое число 60 в healthcheck дублирует `HEARTBEAT_MAX_AGE_SECONDS`

**File:** `backend/src/yolo_trainer_worker/main.py:175`
**Issue:** `is_heartbeat_fresh(settings.heartbeat_path, 60)` повторяет константу из `yolo_trainer_common.heartbeat`; при изменении константы healthcheck воркера и логика api разойдутся.
**Fix:** `is_heartbeat_fresh(settings.heartbeat_path, HEARTBEAT_MAX_AGE_SECONDS)`.

### IN-03: Дублирование источников истины для `SPLITS` и списка официальных весов

**File:** `backend/src/yolo_trainer_api/splits.py:12`, `backend/src/yolo_trainer_api/training/labels.py:17`, `backend/src/yolo_trainer_api/training/catalog.py:11-12`, `backend/src/yolo_trainer_common/layout.py:19`
**Issue:** `SPLITS` определён дважды; допустимые имена официальных моделей заданы и кортежами в `catalog.py`, и регулярным выражением в `layout.py`. Расхождение (например, добавили `yolo12` в одном месте) даёт run, принятый API (`is_official`), но отвергнутый воркером (`weights_file` -> `ValueError`) уже в очереди. Тест `test_training_labels.py:225-235` частично это покрывает.
**Fix:** Один источник (например `catalog` строит регулярное выражение из `OFFICIAL_FAMILIES`/`OFFICIAL_SIZES`, либо `layout` экспортирует список), и один `SPLITS`.

### IN-04: Воркер импортирует из пакета api и использует исключение с неподходящим смыслом

**File:** `backend/src/yolo_trainer_worker/queue.py:20-23, 219`
**Issue:** `queue.py` тянет `yolo_trainer_api.db`, `models`, `training.reconcile`, `training.snapshot` (а через `snapshot` и `storage`/Pillow); `register_model` использует `link_or_copy`, который при пропавшем источнике бросает `SnapshotSourceMissing` - имя, относящееся к датасету, а не к весам модели. Зависимость worker -> api нарушает заявленное "WorkerSettings intentionally separate from api".
**Fix:** Вынести `link_or_copy` и общие модели в `yolo_trainer_common`, переименовать исключение в нейтральное `SourceMissing`.

### IN-05: Ветка `IntegrityError` в `create_run` неверно маркирует нарушение FK проекта как "Unknown model"

**File:** `backend/src/yolo_trainer_api/training/service.py:171-189`
**Issue:** Если `stored_name is None`, код считает причиной удаление выбранной модели. Однако тот же результат даёт FK-нарушение по `project_id` (проект удалён между `get_project_or_404` и `flush`) - пользователь увидит вводящее в заблуждение 422 "Unknown model." для official-модели.
**Fix:** Различать причину (`session.get(Project, project_id)` после rollback -> 404; иначе 422 для модели).

### IN-06: Сообщения об ошибках содержат пути файловой системы сервера

**File:** `backend/src/yolo_trainer_api/training/service.py:244`, `frontend/src/features/training/RunPage.tsx:196-213`
**Issue:** `f"Could not prepare the dataset: {exc}"` и `error.json["message"]` (сырой `str(exc)` из train_job) сохраняются в `error_message` и показываются в UI дословно (например `[Errno 2] No such file or directory: '/data/projects/3/images/17.jpg'`). Для локального однопользовательского сервиса это информационно, но не соответствует принципу "plain message" из docstring.
**Fix:** Сохранять короткую человекочитаемую фразу, а детали оставить в `log_tail`/логе.

### IN-07: Усечение имени скачиваемого файла считает символы, а не байты

**File:** `backend/src/yolo_trainer_api/training/service.py:301-311`
**Issue:** Лимит `_DOWNLOAD_NAME_MAX = 120` применяется к числу символов. Для CJK/кириллицы 120 символов - до ~360 байт UTF-8 и ~1080 символов после percent-encoding в `filename*` заголовка `Content-Disposition`; часть браузеров/прокси обрежет или отвергнет такой заголовок, расходясь с заявленной гарантией "stays within 120".
**Fix:** Усекать по `len(stem.encode("utf-8"))` либо документировать, что лимит в символах.

### IN-08: Smoke-тест не падает быстро при ошибке разбора статуса run

**File:** `scripts/compose_smoke_test.sh:386-399`
**Issue:** `RUN_STATE` извлекается `sed` по жёсткому порядку ключей JSON (`id`, `project_id`, `name`, `status`). Если порядок полей `RunRead` изменится или имя содержит `"`, `RUN_STATE` останется пустым, и цикл ждёт весь `SMOKE_TRAIN_TIMEOUT` (600 с) вместо немедленного отказа с понятным сообщением.
**Fix:** Парсить статус через `python -c "import json,sys; print(json.load(sys.stdin)['status'])"` (python в контейнере api доступен) и падать при пустом результате.

---

_Reviewed: 2026-10-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
