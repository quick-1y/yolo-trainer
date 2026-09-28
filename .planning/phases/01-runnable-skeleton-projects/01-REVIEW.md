---
phase: 01-runnable-skeleton-projects
reviewed: 2026-09-28T00:00:00Z
depth: standard
files_reviewed: 94
files_reviewed_list:
  - .dockerignore
  - .env.example
  - .gitattributes
  - .gitignore
  - .python-version
  - README.md
  - README.ru.md
  - backend/alembic.ini
  - backend/pyproject.toml
  - backend/src/yolo_trainer_api/__init__.py
  - backend/src/yolo_trainer_api/db.py
  - backend/src/yolo_trainer_api/errors.py
  - backend/src/yolo_trainer_api/main.py
  - backend/src/yolo_trainer_api/migrate.py
  - backend/src/yolo_trainer_api/migrations/env.py
  - backend/src/yolo_trainer_api/migrations/script.py.mako
  - backend/src/yolo_trainer_api/migrations/versions/0001_create_projects.py
  - backend/src/yolo_trainer_api/models.py
  - backend/src/yolo_trainer_api/routers/__init__.py
  - backend/src/yolo_trainer_api/routers/projects.py
  - backend/src/yolo_trainer_api/schemas.py
  - backend/src/yolo_trainer_api/settings.py
  - backend/src/yolo_trainer_common/__init__.py
  - backend/src/yolo_trainer_common/device.py
  - backend/src/yolo_trainer_common/quality.py
  - backend/src/yolo_trainer_worker/__init__.py
  - backend/src/yolo_trainer_worker/main.py
  - backend/tests/__init__.py
  - backend/tests/conftest.py
  - backend/tests/test_device.py
  - backend/tests/test_migrations.py
  - backend/tests/test_persistence.py
  - backend/tests/test_project_validation.py
  - backend/tests/test_projects_api.py
  - backend/tests/test_quality.py
  - backend/tests/test_worker.py
  - docker-compose.yml
  - docker/Dockerfile.backend
  - docker/Dockerfile.frontend
  - docker/nginx.conf
  - docs/roadmap.md
  - finetune_yolo.py
  - frontend/.gitignore
  - frontend/index.html
  - frontend/package.json
  - frontend/postcss.config.cjs
  - frontend/src/api/client.ts
  - frontend/src/api/projects.ts
  - frontend/src/app/App.tsx
  - frontend/src/app/AppLayout.tsx
  - frontend/src/app/routes.tsx
  - frontend/src/components/LanguageSwitcher.test.tsx
  - frontend/src/components/LanguageSwitcher.tsx
  - frontend/src/features/NotFound.test.tsx
  - frontend/src/features/NotFoundPage.tsx
  - frontend/src/features/project/DeleteProjectModal.test.tsx
  - frontend/src/features/project/DeleteProjectModal.tsx
  - frontend/src/features/project/ProjectLayout.tsx
  - frontend/src/features/project/ProjectNotFound.tsx
  - frontend/src/features/project/ProjectOverviewPage.test.tsx
  - frontend/src/features/project/ProjectOverviewPage.tsx
  - frontend/src/features/project/ProjectSettingsPage.test.tsx
  - frontend/src/features/project/ProjectSettingsPage.tsx
  - frontend/src/features/projects/CreateProjectModal.test.tsx
  - frontend/src/features/projects/CreateProjectModal.tsx
  - frontend/src/features/projects/NewProjectCard.tsx
  - frontend/src/features/projects/ProjectCard.tsx
  - frontend/src/features/projects/ProjectsPage.test.tsx
  - frontend/src/features/projects/ProjectsPage.tsx
  - frontend/src/i18n/index.ts
  - frontend/src/i18n/language.test.ts
  - frontend/src/i18n/language.ts
  - frontend/src/i18n/locales.test.ts
  - frontend/src/i18n/locales/en/common.json
  - frontend/src/i18n/locales/en/project.json
  - frontend/src/i18n/locales/en/projects.json
  - frontend/src/i18n/locales/ru/common.json
  - frontend/src/i18n/locales/ru/project.json
  - frontend/src/i18n/locales/ru/projects.json
  - frontend/src/lib/relativeTime.test.ts
  - frontend/src/lib/relativeTime.ts
  - frontend/src/main.tsx
  - frontend/src/test-setup.ts
  - frontend/src/test/render.tsx
  - frontend/src/theme.ts
  - frontend/src/vite-env.d.ts
  - frontend/tsconfig.json
  - frontend/vite.config.ts
  - pyproject.toml
  - scripts/check_cli_run_git_clean.py
  - scripts/compose_smoke_test.sh
  - scripts/fresh_clone_check.sh
  - scripts/run_full_suite.sh
  - train_yolo.py
findings:
  critical: 0
  warning: 5
  info: 2
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-09-28T00:00:00Z
**Depth:** standard
**Files Reviewed:** 94
**Status:** issues_found

## Summary

Просмотрен весь заявленный scope Phase 1 (runnable skeleton + projects CRUD): backend (FastAPI + SQLAlchemy/Alembic + SQLite WAL), worker-заглушка с heartbeat, common-модуль (device/quality, перенесённый из legacy CLI), Docker/Compose/nginx, скрипты приёмки и фронтенд (React + Vite + Mantine + i18next + TanStack Query).

Общее качество кода высокое: серверная валидация имён проектов (NFC/NFKC, control-chars, code-point-длина), обработка гонок уникальности через `IntegrityError`, WAL-checkpoint при остановке, `TrustedHostMiddleware` для локального unauthenticated-сервиса, `.dockerignore`/`.gitignore` без утечек секретов — всё сделано аккуратно и подкреплено тестами. Критичных (BLOCKER) находок, связанных с потерей данных, security-обходом или падением сервиса, не обнаружено — с поправкой на явно принятую в проекте модель угроз (single-operator, bind к 127.0.0.1 по умолчанию, D-14).

Найден ряд более мелких дефектов уровня WARNING: несогласованная строгость парсинга ID проекта между фронтендом и бэкендом, нарушение заявленного в `errors.py` инварианта "каждый ответ об ошибке — JSON `{"detail": ...}`", отсутствие видимой обратной связи при сетевых сбоях (не-`ApiError`) в трёх модалках, отсутствие клиентской валидации длины описания на странице настроек (есть только при создании) и retry-политика TanStack Query по умолчанию, которая повторяет запросы даже для детерминированных 4xx (например, 404 у удалённого проекта). Ниже — детали и предложения по исправлению.

## Warnings

### WR-01: Нестрогий парсинг `projectId` из URL допускает "мусор" после числа

**File:** `frontend/src/features/project/ProjectLayout.tsx:26-28`
**Issue:** Валидность id вычисляется через `Number.parseInt(params.projectId ?? "", 10)` и `Number.isFinite(parsedId) && parsedId > 0`. `Number.parseInt` разбирает строку "по префиксу": `parseInt("5abc", 10) === 5`, поэтому URL вида `/projects/5abc` считается валидным ID `5` и молча подгружает проект 5, вместо показа `ProjectNotFound`. Это расходится со строгой валидацией на бэкенде (`GET /api/projects/{project_id}` через FastAPI `int`-конвертер отклоняет `"5abc"` с 422). Специального теста на этот edge case нет (`ProjectLayout.tsx` — единственный файл в фиче `project/`, для которого в scope нет `*.test.tsx`).
**Fix:**
```ts
// Строгая проверка: вся строка должна состоять из цифр (без ведущих нулей/мусора).
const raw = params.projectId ?? "";
const isValidId = /^[1-9]\d*$/.test(raw);
const parsedId = isValidId ? Number(raw) : NaN;
const query = useProject(isValidId ? parsedId : null);
```

### WR-02: `errors.py` не гарантирует заявленный JSON-контракт для всех ошибок

**File:** `backend/src/yolo_trainer_api/errors.py:1`
**Issue:** Докстринг модуля утверждает: "Error handlers ensuring every error body is `{"detail": "<plain English>"}` (D-05)". Фактически зарегистрирован обработчик только для `RequestValidationError`. Обычные `HTTPException` (404/409/422 из роутера) действительно возвращают JSON `{"detail": ...}` благодаря дефолтному обработчику FastAPI — это ок. Но два реальных пути этот инвариант нарушают:
1. Отказ `TrustedHostMiddleware` (Host не в allow-list) возвращает `400` с **plain-text** телом ("Invalid host header."), не JSON — это подтверждается и тестом `test_disallowed_host_rejected` (`backend/tests/test_persistence.py:123-128`), который проверяет только `status_code`, не тело.
2. Любое непойманное исключение (баг в коде, ошибка БД) уйдёт в стандартный `ServerErrorMiddleware` Starlette и вернёт `500` с plain-text телом "Internal Server Error", а не `{"detail": ...}`.

Фронтенд (`frontend/src/api/client.ts:34-45`) на этот случай устойчив (ловит ошибку парсинга JSON и подставляет `response.statusText`), поэтому UI не ломается — но контракт, заявленный в D-05 и в самом модуле, по факту не выполняется целиком, и любой внешний потребитель API (curl/скрипт), который парсит тело как JSON, получит исключение при парсинге на 400/500.
**Fix:** Добавить обработчик `Exception`/`StarletteHTTPException`, приводящий любое тело к `{"detail": "..."}` (для 500 — с обобщённым текстом, чтобы не палить трассировку):
```python
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def _http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return JSONResponse(status_code=exc.status_code, content={"detail": detail})

@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})
```

### WR-03: Сетевые ошибки (не `ApiError`) не показываются пользователю в трёх формах

**File:** `frontend/src/features/projects/CreateProjectModal.tsx:33-34`, `frontend/src/features/project/ProjectSettingsPage.tsx:56-57`, `frontend/src/features/project/DeleteProjectModal.tsx:75-76`
**Issue:** Во всех трёх местах сообщение об ошибке вычисляется как `error instanceof ApiError ? error.message : null`. `apiRequest` бросает `ApiError` только для HTTP-ответов с `!response.ok`; настоящий сетевой сбой (offline, DNS, CORS, обрыв соединения) приводит к тому, что `fetch()` реджектится обычным `TypeError`, который `instanceof ApiError` не проходит. В результате `apiErrorMessage` остаётся `null`, алерт не рендерится, и пользователь видит только "разблокировавшуюся" кнопку без какого-либо объяснения, что действие (создание/сохранение/удаление проекта) не выполнилось.
**Fix:** Показывать сообщение для любой ошибки, а не только `ApiError`:
```ts
const apiErrorMessage = createProject.error
  ? createProject.error instanceof ApiError
    ? createProject.error.message
    : t("common:error.network") // добавить обобщённый ключ перевода
  : null;
```

### WR-04: На странице настроек проекта нет клиентской проверки длины описания

**File:** `frontend/src/features/project/ProjectSettingsPage.tsx:60-70`
**Issue:** `validate()` в `ProjectSettingsPage` проверяет только пустое/слишком длинное имя (`MAX_NAME_LENGTH`), но, в отличие от `CreateProjectModal.tsx:56-62` (где есть проверка `Array.from(description.trim()).length > MAX_DESCRIPTION_LENGTH`), здесь ограничение в 2000 code points для `description` не проверяется вовсе. Функционально данные всё равно защищены сервером (`schemas._validate_project_description`, 422), но поведение двух форм несогласовано: в одной форме пользователь получает мгновенную клиентскую подсказку, в другой — только после round-trip к серверу.
**Fix:** Добавить в `ProjectSettingsPage.validate()` ту же проверку, что и в `CreateProjectModal`, с общей константой `MAX_DESCRIPTION_LENGTH = 2000` (см. также IN-01 ниже про дублирование констант).

### WR-05: Дефолтная retry-политика TanStack Query ретраит детерминированные 4xx-ошибки

**File:** `frontend/src/app/App.tsx:12`, `frontend/src/api/projects.ts:32-45`
**Issue:** `new QueryClient()` создаётся без `defaultOptions`, поэтому действует дефолт TanStack Query v5 — `retry: 3` с экспоненциальной задержкой для любого брошенного исключения, включая `ApiError` с кодом 404/422. Например, при переходе на `/projects/:id` для уже удалённого проекта `useProject` (через `ProjectLayout`) получит 404 от `apiRequest`, но вместо немедленного показа `ProjectNotFound` React Query сначала выполнит до 3 повторных бесполезных запросов (404 никогда не станет 200) — заметная задержка перед показом корректного состояния и лишняя нагрузка на API.
**Fix:** Отключить retry для явно не-идемпотентных по повтору ошибок клиента:
```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failureCount < 3,
    },
  },
});
```

## Info

### IN-01: Константа `MAX_NAME_LENGTH` продублирована в двух файлах

**File:** `frontend/src/features/projects/CreateProjectModal.tsx:16`, `frontend/src/features/project/ProjectSettingsPage.tsx:30`
**Issue:** Оба файла независимо объявляют `const MAX_NAME_LENGTH = 100`, каждый со своим комментарием "mirrors the server-side limit". Изменение серверного лимита потребует синхронно править оба места вручную — источник рассинхронизации в будущем.
**Fix:** Вынести `MAX_NAME_LENGTH`/`MAX_DESCRIPTION_LENGTH` в `frontend/src/api/projects.ts` (рядом с `ProjectCreateInput`/`ProjectUpdateInput`) и импортировать оттуда в обеих формах.

### IN-02: `train_yolo.py` читает конфиг по пути с неверным регистром (уже задокументировано)

**File:** `train_yolo.py:132`
**Issue:** `conf.read("Config/Config.ini")` (заглавная `C`) не совпадает с реальным путём `config/config.ini` и с тем, что использует `finetune_yolo.py:141` (`"config/config.ini"`, строчная). На регистро-нечувствительной ФС (Windows/macOS) это работает случайно; на Linux `configparser.read()` молча проигнорирует отсутствующий файл, и `conf["Train"]` упадёт с `KeyError`. Дефект не внесён в рамках этого diff (истории строки нет изменений в этом diff_base..HEAD), и уже явно задокументирован в `README.md:135`/`README.ru.md:135` с обходным путём — фиксирую для полноты, отдельного действия не требуется сверх уже принятого решения задокументировать, а не чинить в Phase 1.

---

_Reviewed: 2026-09-28T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
