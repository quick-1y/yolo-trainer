---
phase: 01-runnable-skeleton-projects
verified: 2026-09-29T09:00:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files:
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-01-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-01-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-02-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-02-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-03-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-03-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-04-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-04-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-05-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-05-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-06-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-06-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-07-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-07-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-08-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-08-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-09-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-09-SUMMARY.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-10-PLAN.md"
  - ".planning/phases/01-runnable-skeleton-projects/01-10-SUMMARY.md"
  - "backend/src/yolo_trainer_api/main.py"
  - "backend/src/yolo_trainer_api/routers/projects.py"
  - "backend/src/yolo_trainer_common/device.py"
  - "backend/src/yolo_trainer_common/quality.py"
  - "docker-compose.yml"
covered_digest: "v1:sha256:72f65e2082e3b127505a30b87b4f3295392d8d97c29e27f7887d6ff3c04d8dd6"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Открыть http://127.0.0.1:8080 в реальном браузере после `docker compose up --build`; создать проект detect и segment, переименовать, открыть, удалить (с вводом точного имени), переключить язык RU/EN, перезагрузить страницу"
    expected: "UI отрисовывается без визуальных дефектов, все действия работают в браузере (а не только в jsdom-тестах Vitest), выбор языка сохраняется после перезагрузки"
    why_human: "Визуальный вид и полный пользовательский сценарий в настоящем браузере нельзя проверить grep/curl/jsdom; автоматически проверены API через nginx (compose smoke) и компоненты в Vitest"
  - test: "Запустить `docker compose up` на Linux и macOS хосте (CPU-only)"
    expected: "Стек поднимается, проекты сохраняются между down/up (для Docker Desktop на macOS - проверить WAL-оговорку из README)"
    why_human: "DEPL-01 заявляет Windows/Linux/macOS; верификация выполнена только на Windows 11 + Docker Desktop (dev-машина)"
---

# Phase 1: Runnable Skeleton & Projects - отчёт о верификации

**Цель фазы:** пользователь одним `docker compose up` на CPU-машине запускает сервис, открывает его в браузере, создаёт и ведёт `detect`/`segment` проекты, которые сохраняются, поверх чистой, воспроизводимой и протестированной кодовой базы
**Проверено:** 2026-09-29
**Статус:** human_needed (все автоматические проверки пройдены; остались только визуальные/кросс-платформенные проверки)
**Повторная верификация:** нет - первичная

## Достижение цели

Позиция скептика: SUMMARY не считался доказательством. Каждый критерий проверен запуском реальных команд в этой сессии.

### Наблюдаемые истины (Success Criteria из ROADMAP)

| # | Истина | Статус | Доказательство |
|---|--------|--------|----------------|
| 1 | Fresh clone -> README -> Python 3.12 + torch 2.14.0 / ultralytics 8.4.159, `pytest` проходит | VERIFIED | `bash scripts/fresh_clone_check.sh` -> `FRESH CLONE OK` (клон HEAD во временный каталог, `uv sync --locked`, pytest, `npm ci`, Vitest 50/50). `uv run --locked python -c "import torch,ultralytics"` -> `2.14.0+cpu 8.4.159`. `uv run pytest backend/tests` -> 79 passed |
| 2 | parse_device/quality_assessment в одном тестируемом модуле; `train_yolo.py`/`finetune_yolo.py` импортируют его и работают | VERIFIED | `backend/src/yolo_trainer_common/{device,quality}.py`; оба скрипта содержат `from yolo_trainer_common.device import parse_device` / `...quality import quality_assessment`, локальных копий нет; `auto_batch` остался локальным в `train_yolo.py`. Тесты test_device (9) + test_quality (6). Реальный 1-epoch CPU-прогон `train_yolo.train()` выполнен и завершился успешно (см. п.3) |
| 3 | После CLI-прогона `git status` чист; бинарники не отслеживаются; `best.pt` остался на диске | VERIFIED | `uv run python scripts/check_cli_run_git_clean.py` -> `GIT CLEAN OK` (реальное обучение 12 с). `git ls-files` не содержит `*.pt`, `runs/`, `trained_models/`. `git check-ignore -v` подтверждает правила для `best.pt`, `runs/`, `data/`, `.smoke-data/`, `example_ready_dataset/train/`, `yolo26n.pt`; `data.yaml` не игнорируется. SHA-256 `best.pt`, `yolo26n.pt`, `yolov8n.pt` совпадают с замером до прогона. `git status` содержит только неотслеживаемые `.gsd/`, `.planning/milestone.lock`, `.planning/state.json` (артефакты GSD, не результат обучения) |
| 4 | Один `docker compose up` на CPU-машине, веб-UI, создание/список/открытие/переименование/удаление проектов | VERIFIED (автоматически; браузер - см. Human) | `bash scripts/compose_smoke_test.sh` -> `SMOKE OK`: сборка и старт api/worker/web (все healthy), SPA отдаётся (`id="root"`), `/api/health` через nginx, POST/GET проекта, `app.db` на bind mount. Код: `routers/projects.py` реализует GET list / GET id / POST / PATCH / DELETE с реальными SQLAlchemy-запросами (не заглушки); `frontend/src/api/projects.ts` подключён хуками к этим эндпоинтам; `routes.tsx` содержит `/projects`, `/projects/:projectId`, `settings`; Vitest 50/50 покрывает создание, список, переименование, удаление с подтверждением именем |
| 5 | Проекты переживают `down`/`up` и пересборку образов; миграции применяются автоматически | VERIFIED | Смоук: down/up -> проект на месте; 10 быстрых создания -> `up -d --build --force-recreate` -> все 10 на месте; `PRAGMA integrity_check` ok; `alembic_version` ровно одна строка. `main.py` lifespan вызывает `run_migrations` (`alembic upgrade head`) при старте; в коде нет `create_all`/`drop_all`/удаления файла БД. Миграция `0001_create_projects.py` есть, уникальный индекс `uq_projects_normalized_name` и CHECK на task_type |

**Score:** 5/5 истин подтверждено (0 present-but-behavior-unverified)

### Обязательные артефакты (выборочно, уровни 1-4)

| Артефакт | Ожидание | Статус | Детали |
|----------|----------|--------|--------|
| `backend/src/yolo_trainer_api/routers/projects.py` | CRUD проектов | VERIFIED | Реальные запросы, 409 на IntegrityError с rollback, PATCH без task_type, DELETE 204/404; подключён в `main.py` |
| `backend/src/yolo_trainer_api/migrations/versions/0001_create_projects.py` | Схема + уникальный индекс | VERIFIED | Применяется при старте (smoke) |
| `backend/src/yolo_trainer_common/{device,quality}.py` | Общие хелперы | VERIFIED | Импортируются обоими legacy-скриптами и тестами |
| `backend/src/yolo_trainer_worker/main.py` | Heartbeat-воркер | VERIFIED | Смоук: heartbeat.json с `cuda_available=false`, версии torch/ultralytics в worker; в api-образе torch отсутствует; api-образ меньше worker |
| `docker-compose.yml`, `docker/Dockerfile.{backend,frontend}`, `docker/nginx.conf` | Стек | VERIFIED | Собираются и работают (smoke); порт `127.0.0.1` по умолчанию, `./data` bind mount |
| `.gitignore` | Игнор артефактов | VERIFIED | См. п.3 |
| `README.md` / `README.ru.md` | Документация | VERIFIED | Обе run-пути, переменные `.env`, предупреждение об отсутствии аутентификации и pickle-`.pt`, WAL-оговорка; fresh-clone скрипт исполняет README-шаги |
| `scripts/run_full_suite.sh`, `scripts/fresh_clone_check.sh`, `scripts/check_cli_run_git_clean.py` | Приёмочные скрипты | VERIFIED | Составляющие выполнены индивидуально (см. ниже); `fresh_clone_check.sh` и `check_cli_run_git_clean.py` прогнаны целиком |

### Проверка ключевых связей

| От | К | Через | Статус |
|----|---|-------|--------|
| SPA (`api/client.ts`, `api/projects.ts`) | nginx `/api/` -> FastAPI | proxy_pass `http://api:8000` | WIRED (smoke: `/api/health` и CRUD через порт web) |
| `main.py` lifespan | Alembic | `run_migrations` | WIRED |
| `train_yolo.py` / `finetune_yolo.py` | `yolo_trainer_common` | import | WIRED |
| `docker-compose.yml` worker | Dockerfile target `worker` | `build.target` | WIRED |
| `ProjectsPage` -> `useProjects` -> GET /api/projects | реальная БД | select из `Project` | FLOWING (не статика) |

### Поведенческие проверки (выполнены в этой сессии)

| Поведение | Команда | Результат | Статус |
|-----------|---------|-----------|--------|
| Backend-тесты | `uv run --locked pytest backend/tests -q` | 79 passed | PASS |
| Frontend-тесты | `npm --prefix frontend run test -- --run` | 10 файлов, 50 тестов passed | PASS |
| Lint/format backend | `ruff check backend`, `ruff format --check backend` | All checks passed / 26 files formatted | PASS |
| Frontend build | `npm --prefix frontend run build` | built in 700ms | PASS |
| Compose smoke | `bash scripts/compose_smoke_test.sh` | `SMOKE OK` | PASS |
| CLI git-clean | `check_cli_run_git_clean.py` | `GIT CLEAN OK` | PASS |
| Fresh clone | `scripts/fresh_clone_check.sh` | `FRESH CLONE OK` | PASS |

Probe Execution: `scripts/*/tests/probe-*.sh` не объявлены в планах - пропущено.

### Покрытие требований

Все ID из frontmatter планов сопоставлены с REQUIREMENTS.md; orphaned-требований нет (в таблице трассировки на Phase 1 отображены ровно 7 ID).

| Требование | Планы | Статус | Доказательство |
|------------|-------|--------|----------------|
| FOUND-01 | 01-01, 01-04, 01-10 | SATISFIED | pinned `uv.lock`, `fresh_clone_check.sh` = OK, версии 2.14.0/8.4.159 |
| FOUND-02 | 01-04 | SATISFIED | общий модуль + 15 unit-тестов, legacy-скрипты импортируют |
| FOUND-03 | 01-05 | SATISFIED | `GIT CLEAN OK`, бинарники не tracked |
| DEPL-01 | 01-01, 01-02, 01-06, 01-10 | SATISFIED (Windows; Linux/macOS - см. Human) | `SMOKE OK` |
| DEPL-03 | 01-01, 01-02, 01-10 | SATISFIED | down/up, rebuild --force-recreate, integrity ok |
| PROJ-01 | 01-01, 01-03, 01-07 | SATISFIED | POST + валидация (16 тестов) + CHECK-констрейнт detect/segment |
| PROJ-02 | 01-01, 01-03, 01-07, 01-08, 01-09 | SATISFIED | GET/PATCH/DELETE + UI (Overview, Settings, DeleteProjectModal), тесты |

### Anti-паттерны

Маркеры `TBD|FIXME|XXX` как блокеры не найдены в проверенных артефактах фазы. `ruff check .` по всему репозиторию даёт 10 замечаний (I001, DTZ005, F401), но все они в legacy-скриптах и `spikes/`, вне заявленного scope линтера (`run_full_suite.sh` и план проверяют `backend`); при этом `train_yolo.py`/`finetune_yolo.py` намеренно не переформатировались (правило "unchanged apart from import block").

| Файл | Паттерн | Серьёзность | Влияние |
|------|---------|-------------|---------|
| `train_yolo.py:132` / `finetune_yolo.py:141` | `Config/Config.ini` vs `config/config.ini` | Info | Известное ограничение на case-sensitive ФС, задокументировано в README |
| `docker/nginx.conf` | `client_max_body_size 1m` | Info | Для Phase 1 достаточно; потребует увеличения в Phase 2 (загрузка изображений) |

Замечания из `01-REVIEW.md` (0 critical, 5 warning: нестрогий парсинг `projectId` (WR-01), не-JSON тело для 400 TrustedHost / 500 (WR-02), обратная связь при сетевых ошибках в модалках, клиентская валидация длины описания в Settings, retry TanStack Query на 4xx) - не блокируют цель фазы и не нарушают ни один Success Criterion; рекомендуется закрыть отдельным `/gsd-code-review` fix-проходом.

### Требуется проверка человеком

1. **Полный пользовательский сценарий в реальном браузере**
   **Проверка:** `docker compose up --build`, открыть http://127.0.0.1:8080, создать проекты detect/segment, переименовать, открыть, удалить (с вводом имени), переключить RU/EN, перезагрузить.
   **Ожидание:** корректная отрисовка и работа всех действий; язык сохраняется.
   **Почему человек:** визуальное качество и живой UX; автоматически покрыты API через nginx (smoke) и компоненты (Vitest/jsdom).

2. **Linux и macOS хосты (DEPL-01)**
   **Проверка:** `docker compose up` на CPU-only Linux и macOS (Docker Desktop).
   **Ожидание:** стек поднимается, данные сохраняются; на macOS учесть WAL-оговорку из README.
   **Почему человек:** верификация выполнена только на Windows 11 + Docker Desktop.

### Резюме по пробелам

Пробелов (gaps) нет. Все 5 Success Criteria и все 7 требований фазы подтверждены выполнением реальных команд, а не утверждениями SUMMARY. Статус `human_needed` обусловлен только двумя нередуцируемыми проверками (визуальный браузерный прогон, другие ОС).

---

_Verified: 2026-09-29_
_Verifier: Claude (gsd-verifier)_
