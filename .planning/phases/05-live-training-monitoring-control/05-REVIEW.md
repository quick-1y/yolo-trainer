---
phase: 05-live-training-monitoring-control
reviewed: 2026-10-12T00:00:00Z
depth: standard
files_reviewed: 77
files_reviewed_list:
  - README.md
  - README.ru.md
  - backend/src/yolo_trainer_api/migrations/versions/0006_failure_category.py
  - backend/src/yolo_trainer_api/migrations/versions/0007_cancel_request.py
  - backend/src/yolo_trainer_api/migrations/versions/0008_resume.py
  - backend/src/yolo_trainer_api/migrations/versions/0009_last_map50_95.py
  - backend/src/yolo_trainer_api/models.py
  - backend/src/yolo_trainer_api/routers/projects.py
  - backend/src/yolo_trainer_api/routers/runs.py
  - backend/src/yolo_trainer_api/schemas.py
  - backend/src/yolo_trainer_api/storage.py
  - backend/src/yolo_trainer_api/training/reconcile.py
  - backend/src/yolo_trainer_api/training/service.py
  - backend/src/yolo_trainer_api/training/stream.py
  - backend/src/yolo_trainer_common/failures.py
  - backend/src/yolo_trainer_common/layout.py
  - backend/src/yolo_trainer_common/progress.py
  - backend/src/yolo_trainer_worker/queue.py
  - backend/src/yolo_trainer_worker/supervisor.py
  - backend/src/yolo_trainer_worker/train_job.py
  - backend/tests/fake_train_job.py
  - backend/tests/test_failures.py
  - backend/tests/test_migrations.py
  - backend/tests/test_progress.py
  - backend/tests/test_quality.py
  - backend/tests/test_run_stream.py
  - backend/tests/test_runs_api.py
  - backend/tests/test_runs_cancel.py
  - backend/tests/test_runs_delete.py
  - backend/tests/test_runs_interim.py
  - backend/tests/test_runs_remove.py
  - backend/tests/test_runs_resume.py
  - backend/tests/test_train_job.py
  - backend/tests/test_training_cleanup.py
  - backend/tests/test_training_pipeline.py
  - backend/tests/test_training_reconcile.py
  - backend/tests/test_worker_queue.py
  - backend/tests/test_worker_supervisor.py
  - backend/tests/training_helpers.py
  - docker/Dockerfile.backend
  - frontend/package.json
  - frontend/src/api/training.ts
  - frontend/src/features/training/CancelResumeButton.tsx
  - frontend/src/features/training/CancelRunModal.tsx
  - frontend/src/features/training/DeleteRunModal.tsx
  - frontend/src/features/training/FailureAlert.tsx
  - frontend/src/features/training/FinalResultsCard.tsx
  - frontend/src/features/training/ResumeButton.tsx
  - frontend/src/features/training/ResumeInfo.tsx
  - frontend/src/features/training/RunFailureLog.tsx
  - frontend/src/features/training/RunPage.test.tsx
  - frontend/src/features/training/RunPage.tsx
  - frontend/src/features/training/RunSettingsCard.tsx
  - frontend/src/features/training/RunStatusBadge.tsx
  - frontend/src/features/training/TrainingPage.module.css
  - frontend/src/features/training/TrainingPage.test.tsx
  - frontend/src/features/training/TrainingPage.tsx
  - frontend/src/features/training/historyTable.test.ts
  - frontend/src/features/training/historyTable.ts
  - frontend/src/features/training/progress/BatchProgress.tsx
  - frontend/src/features/training/progress/ChartTooltip.tsx
  - frontend/src/features/training/progress/RunCharts.test.tsx
  - frontend/src/features/training/progress/RunCharts.tsx
  - frontend/src/features/training/progress/duration.test.ts
  - frontend/src/features/training/progress/duration.ts
  - frontend/src/features/training/progress/eta.test.ts
  - frontend/src/features/training/progress/eta.ts
  - frontend/src/features/training/progress/foldProgress.test.ts
  - frontend/src/features/training/progress/foldProgress.ts
  - frontend/src/features/training/progress/useRunStream.ts
  - frontend/src/i18n/locales/en/training.json
  - frontend/src/i18n/locales/ru/training.json
  - frontend/src/test-setup.ts
  - frontend/src/test/fakeEventSource.ts
  - frontend/src/test/rechartsSize.ts
  - frontend/src/test/trainingApi.ts
  - scripts/compose_smoke_test.sh
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Фаза 5: отчёт о код-ревью

**Проверено:** 2026-10-12
**Глубина:** standard
**Файлов:** 77
**Статус:** issues_found

## Резюме

Проверены backend (supervisor, queue, service, stream, reconcile, train_job, прогресс/сбои, миграции 0006-0009), frontend (страница запуска, SSE-хук, fold прогресса, ETA, длительность, история, модалки) и smoke-скрипт. Особое внимание: отмена/kill subprocess, guarded UPDATE/DELETE между api и worker, раздача interim best.pt, жизненный цикл SSE, учёт `active_seconds` при resume.

Общая оценка: ядро сделано аккуратно. Что проверено и подтверждено как корректное:
- Гонки cancel/resume/delete/claim закрыты одним guarded-запросом на каждую (`status`-предикат + `rowcount`). SQLite сериализует писателей, поэтому победитель ровно один. Исключение: delete проекта (WR-01).
- Пути строятся только из целочисленных id (`layout.run_dir`, `model_file`). Interim best.pt отдаётся по `(run_id, project_id)`, обхода каталогов нет. Удаление идёт через `_remove_direct_child` с запретом симлинков.
- `active_seconds` считается на `time.monotonic()` в supervisor, а не по настенным часам. Сегмент закрывается во всех терминальных записях. Сегмент resume корректно стартует с конца `progress.jsonl`.
- SSE: смещения кадров, partial-строки, `Last-Event-ID` (только цифры, не больше размера файла), конец потока по терминальному статусу, отдельная короткая сессия БД на каждое чтение. Всё в порядке.
- Паритет ключей i18n en/ru и использованные в компонентах ключи сверены скриптом: расхождений нет.

Блокирующих дефектов не найдено. Есть пять предупреждений: пробел в защите «база используется» при удалении проекта, отмена в окне записи чекпоинта, нестойкая финальная запись отмены, зачистка группы процессов, расчёт длительности по часам браузера.

Тесты читались выборочно: полностью `test_worker_supervisor.py` и `fake_train_job.py`, остальные по списку тестов и grep. Тесты `test_train_job.py` требуют `ultralytics` (`importorskip`) и в окружении без него пропускаются.

## Warnings

### WR-01: Удаление проекта не проверяет «модель — база активного запуска» другого проекта

**File:** `backend/src/yolo_trainer_api/routers/projects.py:154-170`
**Issue:** `delete_run` защищает от удаления модели, которая служит базой для запуска в `preparing/queued/running` (`service.py:386-401`, `RUN_MODEL_IN_USE_DETAIL`). `delete_project` проверяет только запуски того же проекта (`TrainingRun.project_id == project_id`). Но `_resolve_base` (`service.py:155-165`) допускает модель любого проекта с совпадающим `task_type`. Поэтому запуск в проекте B с базой из проекта A переживёт guard. После удаления A:
- FK `base_model_id` становится NULL (`ON DELETE SET NULL`).
- Файл `data/models/<id>.pt` удаляется в `remove_run_files`.
- queued-запуск проекта B падает с «The base model file is missing.».
- running-запуск уже загрузил веса и не страдает.

README (раздел «Run history») обещает инвариант только для удаления запуска, но то же ожидание у пользователя и для проекта. Теста на этот случай нет: `test_runs_delete.py:273` проверяет только очистку файлов.
**Fix:** добавить в единый guarded `DELETE` проекта второе условие:
```python
dependent = aliased(TrainingRun)
base_in_use = exists().where(
    dependent.base_model_id.in_(select(TrainedModel.id).where(TrainedModel.project_id == project_id)),
    dependent.project_id != project_id,
    dependent.status.in_(ACTIVE_RUN_STATUSES),
)
delete(Project).where(Project.id == project_id, ~active_run, ~base_in_use)
```
При `rowcount == 0` различать 409 `PROJECT_HAS_ACTIVE_RUN_DETAIL` и 409 «модель проекта — база активного запуска». Добавить тест с двумя проектами.

### WR-02: Отмена/остановка worker во время записи чекпоинта может уничтожить единственный `last.pt`

**File:** `backend/src/yolo_trainer_worker/supervisor.py:482-504` (`_terminate`), `backend/src/yolo_trainer_worker/train_job.py:328-344`
**Issue:** SIGTERM уходит группе процессов мгновенно, а `train_job` не имеет обработчика SIGTERM и не знает о записи. Ultralytics пишет `last.pt` и `best.pt` через `torch.save` напрямую, не атомарно. Отмена в окне сохранения (на bind mount Docker Desktop окно заметно) оставляет усечённый файл. Последствия:
- Кнопка Resume остаётся активной (`can_resume`, потому что файл существует), хотя запуск потом падает с `not_resumable` навсегда (`_load_checkpoint` -> `CheckpointError`).
- Interim best.pt предлагается к скачиванию при любом `st_size > 0` (`service.interim_best_file`). Усечённый файл проходит проверку и отдаётся пользователю как «неполный», но на деле битый.
- README обещает «every finished epoch is kept».

Код признаёт риск комментариями, но не уменьшает его. Подтверждения «last.prev.pt не нужен» от пользователя касаются fallback при битом файле, не окна гонки.
**Fix:** варианты по возрастанию стоимости:
1. В `train_job` ставить `signal.signal(SIGTERM, ...)`, который только выставляет флаг. Колбэки `on_train_batch_end` и `on_model_save` при флаге делают `trainer.stop = True` и выходят после сохранения. Супервайзеру оставить SIGKILL по таймауту (10 с уже есть).
2. Либо `on_model_save` пишет маркер `out/.saving` до и после сохранения, а supervisor перед SIGTERM ждёт его исчезновения (ограниченно по времени).

Дополнительно проверять `last.pt` при отдаче/resume (например, `zipfile.is_zipfile`, это дёшево) и в этом случае честно показывать `not_resumable`/скрывать interim.

### WR-03: Финальная запись `cancelled`/`interrupted` не защищена от `OperationalError`, отмена превращается в `failed`

**File:** `backend/src/yolo_trainer_worker/supervisor.py:446-466` (`queue.mark_cancelled`, `queue.mark_interrupted`), `backend/src/yolo_trainer_worker/supervisor.py:224-237` (`serve`)
**Issue:** `_control` и `_record_checkpoint` ловят `OperationalError` («занятая БД не должна убивать обучение»), а две самые важные записи нет. Если после `_terminate` (потомок уже мёртв) `mark_cancelled` получает `database is locked` (busy_timeout исчерпан), исключение идёт через `_run` в `serve`. Там вызывается `mark_failed(... "The worker failed while supervising this run.")`. Итог: пользовательская отмена или штатная остановка worker становятся `failed` со сбивающим текстом и без категории. Тот же риск у `_finish` и `register_model`. Повторный `mark_failed` в `serve` в той же ситуации тоже может упасть, и тогда запуск навсегда остаётся `running` до рестарта.
**Fix:** обернуть терминальные записи в короткий retry:
```python
def _write_final(self, action, *args, attempts=5, **kwargs):
    for attempt in range(attempts):
        try:
            return action(self.engine, *args, **kwargs)
        except OperationalError:
            logger.warning("Final write retry %s", attempt + 1, exc_info=True)
            time.sleep(0.5 * (attempt + 1))
    raise
```
и использовать его для `mark_cancelled`, `mark_interrupted`, `mark_failed`, `register_model`. Тест: подменить `queue.mark_cancelled` на функцию, падающую первые два раза.

### WR-04: `_terminate` не добивает группу процессов, если лидер вышел в период grace

**File:** `backend/src/yolo_trainer_worker/supervisor.py:482-504`
**Issue:** SIGKILL группе посылается только по `TimeoutExpired`. Если лидер (`train_job`) завершился за 10 с, `process.wait` возвращается и остальные члены группы (DataLoader-воркеры на GPU-пути, `workers = min(8, cpu)`) считаются мёртвыми без проверки. Любой, кто игнорирует SIGTERM или завис в CUDA/IO, остаётся сиротой и держит GPU/память, что противоречит инварианту «no orphan» из цели фазы. Дополнительно после SIGKILL стоит `process.wait()` без таймаута: процесс в D-состоянии (зависший NFS/bind mount) блокирует весь поток supervisor и heartbeat не спасёт очередь. На Windows `process.terminate()` бьёт только лидера (README это явно документирует как известное ограничение).
**Fix:**
```python
# после process.wait(timeout=...)/SIGKILL, на posix:
try:
    os.killpg(process.pid, signal.SIGKILL)   # pgid == pid благодаря start_new_session
except (ProcessLookupError, PermissionError):
    pass
```
и `process.wait(timeout=TERMINATE_GRACE_SECONDS)` с логом и выходом, если процесс не умер. Пока лидер не reaped, его pid как pgid не переиспользуется, поэтому это безопасно. В smoke-проверку сирот добавить сценарий с `--workers > 0`.

### WR-05: Длительность запущенного запуска считается по часам браузера и серверной метке

**File:** `frontend/src/features/training/progress/duration.ts:22-25`
**Issue:** живая часть `active_seconds + (Date.now() - segment_started_at)` вычитает серверное время (`utcnow()` в контейнере) из часов браузера. Бэкенд специально считает на `time.monotonic()` (Pitfall 7), но фронтенд возвращает ту же зависимость от часов. Часы VM Docker Desktop заметно уплывают после сна хоста, поэтому «Elapsed» может быть смещён на минуты или даже уйти в 0 (через `Math.max(0, ...)`). То же касается колонки «Duration» и сортировки по ней в `TrainingPage` (`nowMs = runs.dataUpdatedAt`, это тоже часы браузера).
**Fix:** отдавать из API серверное «сейчас» (поле `server_time` в `RunRead`/`RunSummary` или заголовок `Date`). Клиент вычисляет смещение `offset = serverNow - Date.now()` один раз на ответ и применяет его в `runActiveSeconds`. Либо считать живую часть как `active_seconds + (nowServer - segment_started_at)`, где `nowServer` приходит с ответом.

## Info

### IN-01: После `_terminate` по отмене/остановке события не дочитываются

**File:** `backend/src/yolo_trainer_worker/supervisor.py:446-466`
**Issue:** на ветке выхода по exit-коду `poll()` вызывается до чтения событий, поэтому всё написанное до смерти потомка обрабатывается. На ветках cancel/stop `_terminate`, затем `mark_*` идут без финального `tail.read_new_events`. Событие `model_save`/`fit_epoch_end`, записанное между последним чтением и убийством, теряется для БД: `epoch`, `last_map50`, `last_map50_95`, `resume_epoch` отстают на эпоху. Resume не ломается (при `resume_epoch is None` состояние выводится из файла), но «Reached epoch N» и карточка истории показывают устаревшее значение.
**Fix:** после `_terminate` выполнить один проход обработки событий (вынести тело цикла в `_handle_events(tail, ...)`), затем `mark_cancelled`.

### IN-02: Дублирование логики reconcile и списков статусов

**File:** `backend/src/yolo_trainer_worker/queue.py:86-127`, `backend/src/yolo_trainer_api/training/reconcile.py:89-122`, `backend/src/yolo_trainer_api/training/stream.py:28`, `backend/src/yolo_trainer_api/training/service.py:96-98`, `frontend/src/features/training/RunPage.tsx:46`
**Issue:** выбор `cancelled`/`interrupted` и расчёт `swept_active_seconds` написаны дважды (sync и async), терминальные статусы объявлены в трёх местах плюс клиент. Расхождение уже возможно: api-вариант делает `SELECT` затем `UPDATE` в цикле, worker-вариант в одной транзакции.
**Fix:** общая функция формирования `values` для «закончить running-строку» в `yolo_trainer_common`, а `TERMINAL_RUN_STATUSES` определить в `schemas.py` рядом с `ACTIVE_RUN_STATUSES` и импортировать.

### IN-03: Кадр `status` не содержит `last_map50`, а при здоровом стриме опрос замедляется до 15 с

**File:** `backend/src/yolo_trainer_api/training/stream.py:32-40`, `frontend/src/api/training.ts:252`, `frontend/src/features/training/RunPage.tsx:424-430`
**Issue:** карточка «Running» берёт mAP50 из `run.last_map50`, а `STATUS_COLUMNS` не включает `last_map50`/`last_map50_95`. Эпоха и прогресс-бар обновляются сразу (из `status`), а mAP50 отстаёт до 15 с (`RUN_SAFETY_POLL_INTERVAL_MS`). Значение уже есть в последней строке графика (`progress.rows.at(-1)?.map50`).
**Fix:** добавить `TrainingRun.last_map50` и `last_map50_95` в `STATUS_COLUMNS`/`status_payload`, либо брать значение из `progress.rows`.

### IN-04: Необработанная ошибка БД в цикле SSE обрывает поток

**File:** `backend/src/yolo_trainer_api/training/stream.py:148`
**Issue:** `await read_status()` не ловит `OperationalError` (`database is locked` под нагрузкой записи worker). Исключение внутри асинхронного генератора рвёт соединение посреди потока. Браузер переподключится по `Last-Event-ID`, поэтому ущерб мал, но в логах будет трейсбек и мигание «Reconnecting…».
**Fix:** при ошибке чтения статуса пропустить тик (`tick += 1; await asyncio.sleep(file_tick); continue`), а завершать поток только по `None` или терминальному статусу.

### IN-05: Раздача interim `best.pt` не отвергает симлинк, в отличие от помощников удаления

**File:** `backend/src/yolo_trainer_api/training/service.py:568-582`, `backend/src/yolo_trainer_api/routers/runs.py:209-218`
**Issue:** путь строится только из целого id, обхода каталогов нет, но `path.is_file()` следует симлинкам. Удаляющие функции (`_remove_direct_child`) симлинки явно запрещают. Файл создаёт только доверенный worker, поэтому риск теоретический; последовательность защит нарушена.
**Fix:** `path.is_file() and not path.is_symlink()` (и проверка `path.resolve().is_relative_to(runs_root)`).

### IN-06: Мелкие несоответствия в клиенте и тестовой оснастке

**File:** `frontend/src/features/training/TrainingPage.tsx:36`, `frontend/src/features/training/RunPage.tsx:299-324` и `FailureAlert.tsx:36-56`, `backend/tests/test_worker_supervisor.py:140-147`
**Issue:**
- `TrainingPage` импортирует `formatClock` из модуля страницы `RunPage`: общий форматтер живёт в компоненте страницы, и список тянет за собой весь модуль страницы запуска (recharts-зависимости).
- Блок «New training + Download interim best.pt + note» продублирован в `UnfinishedActions` и `FailureAlert`.
- `_ExitingProcess.pid = 0`: если регрессия приведёт к вызову `_terminate`, `os.getpgid(0)` вернёт группу самого теста, и `killpg` убьёт pytest. Заглушки `terminate/kill/wait` выбрасывают AssertionError, но до `killpg` на posix дело дойдёт раньше.
**Fix:** вынести `formatClock` в `progress/duration.ts` (или `lib/`), общий блок действий в один компонент, а у тестовой заглушки задать заведомо несуществующий `pid` (например, 2**22 + 1) вместо 0.

---

_Reviewed: 2026-10-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
