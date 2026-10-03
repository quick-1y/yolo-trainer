---
phase: 02-image-upload-classes
reviewed: 2026-10-03T00:00:00Z
depth: standard
files_reviewed: 105
files_reviewed_list:
  - .env.example
  - README.md
  - README.ru.md
  - backend/pyproject.toml
  - backend/src/yolo_trainer_api/image_processing.py
  - backend/src/yolo_trainer_api/main.py
  - backend/src/yolo_trainer_api/migrate.py
  - backend/src/yolo_trainer_api/migrations/versions/0002_create_images.py
  - backend/src/yolo_trainer_api/migrations/versions/0003_create_classes.py
  - backend/src/yolo_trainer_api/models.py
  - backend/src/yolo_trainer_api/palette.py
  - backend/src/yolo_trainer_api/routers/classes.py
  - backend/src/yolo_trainer_api/routers/config.py
  - backend/src/yolo_trainer_api/routers/images.py
  - backend/src/yolo_trainer_api/routers/projects.py
  - backend/src/yolo_trainer_api/schemas.py
  - backend/src/yolo_trainer_api/security.py
  - backend/src/yolo_trainer_api/settings.py
  - backend/src/yolo_trainer_api/storage.py
  - backend/tests/imaging.py
  - backend/tests/test_classes_api.py
  - backend/tests/test_config_api.py
  - backend/tests/test_image_processing.py
  - backend/tests/test_images_api.py
  - backend/tests/test_images_delete_api.py
  - backend/tests/test_images_files_api.py
  - backend/tests/test_images_list_api.py
  - backend/tests/test_migrations.py
  - backend/tests/test_persistence.py
  - backend/tests/test_projects_api.py
  - backend/tests/test_seed_images.py
  - backend/tests/test_storage_cleanup.py
  - docker-compose.yml
  - docker/Dockerfile.backend
  - docker/Dockerfile.frontend
  - docker/nginx.conf.template
  - frontend/package.json
  - frontend/src/api/classes.ts
  - frontend/src/api/client.test.ts
  - frontend/src/api/client.ts
  - frontend/src/api/config.ts
  - frontend/src/api/images.ts
  - frontend/src/api/images.test.ts
  - frontend/src/api/projects.ts
  - frontend/src/app/routes.tsx
  - frontend/src/features/classes/AddClassForm.tsx
  - frontend/src/features/classes/ClassRow.test.tsx
  - frontend/src/features/classes/ClassRow.tsx
  - frontend/src/features/classes/ClassesPage.test.tsx
  - frontend/src/features/classes/ClassesPage.tsx
  - frontend/src/features/classes/DeleteClassModal.test.tsx
  - frontend/src/features/classes/DeleteClassModal.tsx
  - frontend/src/features/images/DeleteImagesModal.test.tsx
  - frontend/src/features/images/DeleteImagesModal.tsx
  - frontend/src/features/images/ImageGrid.module.css
  - frontend/src/features/images/ImageGrid.test.tsx
  - frontend/src/features/images/ImageGrid.tsx
  - frontend/src/features/images/ImageTile.module.css
  - frontend/src/features/images/ImageTile.tsx
  - frontend/src/features/images/ImageViewerModal.module.css
  - frontend/src/features/images/ImageViewerModal.test.tsx
  - frontend/src/features/images/ImageViewerModal.tsx
  - frontend/src/features/images/ImagesDeletePaging.test.tsx
  - frontend/src/features/images/ImagesPage.test.tsx
  - frontend/src/features/images/ImagesPage.tsx
  - frontend/src/features/images/ImagesSearch.test.tsx
  - frontend/src/features/images/ImagesSelection.test.tsx
  - frontend/src/features/images/ImagesToolbar.tsx
  - frontend/src/features/images/SelectionBar.tsx
  - frontend/src/features/images/UploadButtons.tsx
  - frontend/src/features/images/UploadContext.tsx
  - frontend/src/features/images/UploadDropzone.module.css
  - frontend/src/features/images/UploadDropzone.test.tsx
  - frontend/src/features/images/UploadDropzone.tsx
  - frontend/src/features/images/UploadFlow.test.tsx
  - frontend/src/features/images/UploadPanel.test.tsx
  - frontend/src/features/images/UploadPanel.tsx
  - frontend/src/features/project/ProjectLayout.tsx
  - frontend/src/features/project/ProjectOverviewPage.test.tsx
  - frontend/src/features/project/ProjectOverviewPage.tsx
  - frontend/src/features/projects/CreateProjectModal.test.tsx
  - frontend/src/features/projects/ProjectCard.tsx
  - frontend/src/features/projects/ProjectsPage.test.tsx
  - frontend/src/i18n/locales/en/classes.json
  - frontend/src/i18n/locales/en/common.json
  - frontend/src/i18n/locales/en/images.json
  - frontend/src/i18n/locales/en/project.json
  - frontend/src/i18n/locales/en/projects.json
  - frontend/src/i18n/locales/ru/classes.json
  - frontend/src/i18n/locales/ru/common.json
  - frontend/src/i18n/locales/ru/images.json
  - frontend/src/i18n/locales/ru/project.json
  - frontend/src/i18n/locales/ru/projects.json
  - frontend/src/lib/classPalette.ts
  - frontend/src/lib/imageFiles.test.ts
  - frontend/src/lib/imageFiles.ts
  - frontend/src/lib/uploadQueue.test.ts
  - frontend/src/lib/uploadQueue.ts
  - frontend/src/main.tsx
  - frontend/src/test-setup.ts
  - frontend/src/theme.ts
  - frontend/vite.config.ts
  - scripts/compose_smoke_test.sh
  - scripts/run_full_suite.sh
  - scripts/seed_images.py
findings:
  critical: 0
  warning: 8
  info: 9
  total: 17
status: issues_found
---

# Phase 02: Отчёт о код-ревью

**Проверено:** 2026-10-03
**Глубина:** standard
**Файлов:** 105 (инкрементальный проход по плану 02-13 охватил 4 файла: `frontend/src/api/images.ts`, `frontend/src/api/images.test.ts`, `frontend/src/features/images/ImagesPage.tsx`, `frontend/src/features/images/ImagesDeletePaging.test.tsx`)
**Статус:** issues_found

## Резюме

Это повторная редакция отчёта. Основа отчёта прежняя (полная проверка фазы). Поверх неё выполнен инкрементальный проход по изменениям плана-закрытия пробелов 02-13 (diff от `cf29d56`). План целился в CR-01 и WR-01 предыдущего отчёта. Остальные находки перенесены без изменений по существу.

### Статус целей плана 02-13

**CR-01 (пустое состояние при удалении всех загруженных элементов): РЕШЕНО.**
- В `ImagesPage.tsx:146-164` добавлен эффект. Он вызывает `fetchNextPage()`, если `images.data !== undefined`, список пуст, есть следующая страница, нет активной выборки (`!images.isFetching`) и нет ошибки следующей страницы.
- Проверено по исходникам `react-virtuoso` 4.18.16 (`dist/index.mjs:3165-3176`): `endReached` в `VirtuosoGrid` фильтрует `items.length > 0`. При нуле элементов он действительно не срабатывает, и без нового эффекта страница оставалась бы пустой. Эффект закрывает ровно этот случай.
- `nothingLeft` (`ImagesPage.tsx:167`) учитывает `hasNextPage`, поэтому `EmptyState` не показывается, пока сервер ещё что-то отдаёт. `ImageGrid` остаётся смонтированным. Его `Footer` в `VirtuosoGrid` рендерится безусловно (`dist/index.mjs:3380`), поэтому индикатор загрузки и кнопка «Повторить» доступны даже при нуле плиток.
- Цикла запросов нет. После ошибки `isFetchNextPageError` блокирует эффект, дальше только ручной повтор из футера. Эффект не стреляет во время загрузки, а `fetchNextPage` из наблюдателя стабилен.
- Три теста в `ImagesDeletePaging.test.tsx` покрывают: догрузку страницы, отсутствие цикла при повторной ошибке с кнопкой повтора и поиск («Нет подходящих изображений» не показывается).
- Остаточный случай, когда осталось несколько плиток, описан в IN-08.

**WR-01 (выделение больше 1000 нельзя удалить): РЕШЕНО.**
- `useDeleteImages` (`images.ts:171-198`) режет `ids` на последовательные чанки по `DELETE_BATCH_SIZE = 1000` и суммирует `deleted`. Значение совпадает с `max_length=1000` в `schemas.py:188`.
- Бэкенд `delete_images` идемпотентен: чужие и несуществующие id игнорируются, коммит выполняется на каждый чанк. Поэтому «успешным считается префикс выделения» корректно, а повтор после частичного отказа безопасен.
- При ошибке на чанке N чанки до него вычищаются из кэша (`images.ts:187-191`), а ошибка пробрасывается дальше. Тесты `images.test.ts` проверяют границы 1000/1001, порядок, отсутствие параллельных запросов, сумму и частичный отказ.
- Новое побочное следствие частичного отказа (устаревшая выборка и модалка) описано в WR-09.

Новые проблемы из diff: WR-09, IN-08, IN-09. Критичных нет.

## Warnings

### WR-02: Просмотрщик исчезает и снова появляется на другом изображении после сброса списка

**Файл:** `frontend/src/features/images/ImageViewerModal.tsx:96-99`, `frontend/src/features/images/UploadContext.tsx:163`, `frontend/src/features/images/ImagesPage.tsx:278-296`

**Проблема:**
- Загрузка идёт в фоне, и просмотрщик можно открыть во время неё.
- По завершении `UploadProvider` вызывает `queryClient.resetQueries(...)`, `items` становится `[]`, и `image === undefined`.
- `ImageViewerModal` возвращает `null` (модальное окно пропадает), а `viewerIndex` в `ImagesPage` остаётся не `null`.
- Побочные эффекты stale-индекса:
  - Когда список перезагрузится (новые файлы первыми при `newest`), окно снова откроется на другом изображении по старому индексу.
  - Пока `viewerIndex !== null`, отключён обработчик Esc для сброса выделения.
- Тот же класс проблем возникает, если индекс выходит за пределы списка по любой другой причине.
- Замечание после 02-13: новый эффект автодогрузки (`ImagesPage.tsx:147-164`) этого не затрагивает, поскольку при открытом просмотрщике список не пуст. Проблема остаётся.

**Исправление:** в `ImagesPage` закрывать просмотрщик, когда индекс выходит за пределы списка:

```tsx
useEffect(() => {
  if (viewerIndex !== null && viewerIndex >= items.length && !images.isFetchingNextPage) {
    setViewerIndex(null);
    setAdvancePending(false);
  }
}, [viewerIndex, items.length, images.isFetchingNextPage]);
```

Либо привязывать просмотрщик к id изображения, а не к индексу.

### WR-03: `require_xhr` применён только к загрузке; остальные изменяющие маршруты полагаются на неявное поведение FastAPI

**Файл:** `backend/src/yolo_trainer_api/routers/images.py:342` (`delete_images`), `routers/classes.py:54`, `routers/projects.py:47`, `backend/src/yolo_trainer_api/security.py:8`

**Проблема:**
- Докстринг `security.py` объясняет, что «простой» CORS-запрос обходит preflight. Но защита навешена только на `POST /images`.
- `POST /images/delete` (необратимое удаление данных), `POST /projects` и `POST /classes` не проверяют заголовок.
- Сейчас их спасает только `strict_content_type=True` в FastAPI 0.141.1: JSON-тело требует `Content-Type: application/json`, а значит preflight.
- Это неявная, версионно-зависимая гарантия. Если `strict_content_type` когда-нибудь отключат или версия поменяется, API станет открыт для CSRF из любой вкладки браузера.
- Смоук-тест намеренно шлёт POST на `/api/projects` без заголовка, то есть контракт «заголовок нужен только для multipart» зафиксирован тестами.

**Исправление:** защита в глубину. Подключить `require_xhr` ко всем изменяющим маршрутам одним решением, `APIRouter(dependencies=[Depends(require_xhr)])` либо глобально для методов не GET/HEAD. Клиент (`apiRequest`) уже отправляет заголовок во всех запросах. Смоук-тест обновить.

### WR-04: Фоновая ошибка обновления проекта разрушает `UploadProvider` и обрывает загрузку

**Файл:** `frontend/src/features/project/ProjectLayout.tsx:36-44`, `frontend/src/features/images/UploadContext.tsx:80-86`

**Проблема:**
- `ProjectLayout` выходит в ветку `query.isError` независимо от наличия `query.data`.
- В TanStack Query v5 неудачный фоновый рефетч (после 3 ретраев) переводит статус в `error`, хотя данные сохраняются.
- Сразу после загрузки `UploadContext` сам инвалидирует `projectKeys.detail(projectId)`, плюс идёт фокус-рефетч.
- Достаточно кратковременной сетевой ошибки, чтобы весь `Outlet` и `UploadProvider` были размонтированы.
- Размонтирование вызывает `controller.abort()` и обрывает оставшиеся батчи загрузки. Результаты и сводка пропадают.
- Замечание после 02-13: `useDeleteImages` теперь инвалидирует `projectKeys.detail(projectId)` и при частичном отказе (`images.ts:155-169`). Это ещё один триггер того же фонового рефетча.

**Исправление:** показывать ошибку только при отсутствии данных:

```tsx
if (query.isError && query.data === undefined) { /* ... */ }
```

Использовать `query.data` для рендера и в остальных случаях.

### WR-05: Реальные причины нестабильности тестов `ClassRow`

**Файл:** `frontend/src/features/classes/ClassRow.test.tsx:100-120, 183-198, 228`

**Проблема:**
- **Тест «restores the previous color…» (строки 183-198).** `await waitFor(() => expect(notifications.show).toHaveBeenCalledWith(...))` выполняется сразу после вызова `notifications.show`, а затем следует синхронная проверка `toHaveStyle({ background: "#E6194B" })`.
  - В `onError` компонента `setPendingColor(null)` вызывается из промисного коллбэка, вне `act`.
  - Рендер планируется планировщиком React и может ещё не быть зафиксирован к моменту проверки.
  - Под нагрузкой полного прогона `expect` видит старый цвет `#4363D8`.
  - Это и есть правдоподобная первопричина флейка.
  - Исправление: переместить проверку стиля внутрь `waitFor(...)`.
- **Тест «disables the input while the PATCH is pending» (строки 100-120).**
  - `release` по умолчанию `() => undefined` и перезаписывается только при вызове `fetch`.
  - Тест ждёт `toBeDisabled()`, то есть `isPending`, а не вызова `fetch`.
  - Между переходом мутации в `pending` и вызовом `mutationFn` проходит несколько микрозадач.
  - Если `release(...)` вызван раньше, он превращается в no-op, и промис не резолвится: таймаут теста.
  - Исправление: сначала `await waitFor(() => expect(patches).toHaveLength(1))`, потом `release`.
- Отрицательные проверки через `await new Promise((r) => setTimeout(r, 20))` (строка 228; также `UploadFlow.test.tsx:219`, 50 мс) не доказывают отсутствие запроса под нагрузкой. Они лишь делают тест зелёным.

### WR-06: `remove_project_dir` не распознаёт Windows-junction и содержит тавтологическую проверку

**Файл:** `backend/src/yolo_trainer_api/storage.py:119-132`

**Проблема:**
- Проверка `target.parent != settings.projects_dir` всегда ложна, так как путь строится как `projects_dir / str(int(id))`. Реальной защиты она не даёт.
- `target.is_symlink()` не ловит junction на Windows, хотя ниже определён `_is_link` (symlink или junction), который используется для очистки сирот.
- Пути удаления и очистки ведут себя непоследовательно: нативный запуск на Windows (как у владельца проекта) пропустит junction.
- `shutil.rmtree` в Python 3.12 junction не обходит. Но явный отказ с ошибкой должен быть единым.
- Смежная гонка (нетяжёлая): если проект удаляют во время загрузки, `stage_and_hash` через `mkdir(parents=True)` пересоздаёт `projects/<id>/.incoming`. До следующего старта остаётся пустая папка-сирота.

**Исправление:** вынести `_is_link` выше и использовать в обеих функциях:

```python
if _is_link(target):
    raise ValueError(f"Refusing to remove {target}: it is a link")
```

Тавтологическую проверку заменить на сравнение `target.resolve().parent` с `projects_dir.resolve()`, либо убрать.

### WR-07: Огромные целые id приводят к 500 вместо 422/404

**Файл:** `backend/src/yolo_trainer_api/schemas.py:188`, `routers/images.py:83` (`_decode_cursor`), все `project_id: int` / `image_id: int` в роутерах

**Проблема:**
- Python-int больше 2^63-1 не помещается в SQLite INTEGER, `sqlite3` бросает `OverflowError`, ответ 500.
- Примеры: `{"ids": [99999999999999999999]}`, курсор с `"i": 1e30`-подобным целым, `/api/projects/99999999999999999999/images`.
- В курсоре проверяется `image_id >= 1`, верхней границы нет. Отрицательные id в `ids` проходят валидацию, хотя бессмысленны.
- Замечание после 02-13: чанкование на клиенте делает этот сценарий чуть более заметным. Если невалидный id попадёт в чанк N, префикс из N-1 чанков будет удалён, а пользователь получит ошибку 500. На практике id берутся из загруженных элементов, поэтому риск низкий.

**Исправление:** ограничить диапазон.

```python
PositiveId = Annotated[int, Field(ge=1, le=2**63 - 1)]
ids: list[PositiveId] = Field(min_length=1, max_length=1000)
```

В `_decode_cursor` добавить `image_id > 2**63 - 1`. Для path-параметров использовать `Path(ge=1, le=2**63 - 1)`.

### WR-08: Загрузка молча игнорируется, пока не загрузилась конфигурация (или если она не загрузилась)

**Файл:** `frontend/src/features/images/UploadContext.tsx:90-93`, `frontend/src/features/images/UploadButtons.tsx:20`, `frontend/src/features/images/ImagesPage.tsx:61`

**Проблема:**
- `startUpload` при `limits === undefined` просто возвращается без уведомления.
- Dropzone на всю страницу (`UploadDropzone`) активен сразу, а лимиты приходят отдельным запросом.
- Файлы, брошенные в первые ~100 мс или при ошибке `/api/config`, теряются без сообщения.
- Кнопки при ошибке конфигурации остаются отключёнными навсегда, ошибка нигде не выводится.
- Это поведение трудно диагностировать: dropzone показывает оверлей, а загрузка не стартует.

**Исправление:** в `startUpload` при отсутствии лимитов показывать уведомление (например, `t("configNotReady")`). Либо отключать `Dropzone` (`disabled`) до загрузки конфигурации. Показывать ошибку и повтор при `config.isError`.

### WR-09: После частичного отказа удаления выделение и модальное окно остаются устаревшими (новое, от 02-13)

**Файл:** `frontend/src/api/images.ts:187-191`, `frontend/src/features/images/DeleteImagesModal.tsx:60-62`, `frontend/src/features/images/ImagesPage.tsx:196-199`

**Проблема:**
- При отказе на чанке N≥2 `useDeleteImages` вычищает из кэша первые N-1 чанков (корректно), но состояние страницы не синхронизируется.
- `selected` в `ImagesPage` и снимок `deleteIds` по-прежнему содержат уже удалённые id. `onDeleted` вызывается только при полном успехе.
- Следствия:
  - `SelectionBar` показывает прежнее число («2500 выбрано»), хотя выбранных видимых плиток меньше или их нет.
  - Текст модалки «Удалить 2500…» остаётся прежним, а ошибка показывает только сообщение API без указания, что часть уже удалена.
  - При отмене модалки «призрачные» id остаются в `selected`. Следующее удаление отправит их повторно. Это безопасно благодаря идемпотентному бэкенду, но счётчик «удалено» в тосте будет меньше числа в модалке.
  - Повтор «Delete permanently» отправит все чанки заново: вместо продолжения с места отказа будут лишние запросы.
- Данные не теряются, пользователь не вводится в заблуждение насчёт удаления. Но состояние UI рассинхронизировано, и сценарий новый (раньше частичного отказа не существовало).

**Исправление:** при ошибке снимать с выделения id, уже удалённые на сервере. Для этого мутация может бросать ошибку с полем `deletedIds`, либо `DeleteImagesModal` в `onError` вызывает колбэк `onPartiallyDeleted(ids)`, а страница убирает их из `selected` и `deleteIds`.

```ts
// images.ts
export class PartialDeleteError extends Error {
  constructor(readonly deletedIds: number[], readonly cause: unknown) { super("partial delete"); }
}
```

Либо при ошибке сразу делать `setSelected(prev => new Set([...prev].filter(id => !deletedSet.has(id))))`. Нужен тест на оба сценария («отмена после частичного отказа» и «повтор после частичного отказа»).

## Info

### IN-01: `Image.open` без ограничения списка форматов

**Файл:** `backend/src/yolo_trainer_api/image_processing.py:112`

Pillow при `Image.open(source)` перебирает все зарегистрированные плагины, включая редкие (TIFF, ICNS, PSD, EPS и др.), и только потом код отбрасывает формат по `FORMAT_EXT`. Для загрузки недоверенных файлов безопаснее ограничить поверхность атаки:

```python
Image.open(source, formats=["JPEG", "MPO", "PNG", "WEBP", "BMP"])
```

Неподдерживаемый формат тогда даст `UnidentifiedImageError`, то есть то же «не изображение». Следует сохранить отдельное сообщение «Unsupported image format» либо принять упрощение.

### IN-02: Рассогласование `max_image_megapixels` и защиты Pillow

**Файл:** `backend/src/yolo_trainer_api/image_processing.py:119, 141`, `backend/src/yolo_trainer_api/settings.py:39`

- Значение по умолчанию 100 Мп выше `Image.MAX_IMAGE_PIXELS` (~89,5 Мп). Для изображений 89,5–100 Мп Pillow выдаёт `DecompressionBombWarning` (предупреждение, не ошибка).
- При настройке выше ~179 Мп Pillow выбросит `DecompressionBombError` раньше собственной проверки, а сообщение будет называть настроенный, а не фактический предел.
- Лучше явно выставить `Image.MAX_IMAGE_PIXELS = settings.max_image_pixels` (или `None` при собственной проверке) при старте.

### IN-03: `ImageTile` не активируется клавишей Space

**Файл:** `frontend/src/features/images/ImageTile.tsx:41-50`

У `div role="button"` обработан только Enter. Для ARIA-роли `button` ожидается и Space. Добавить `event.key === " "` с `preventDefault`, ограничив `event.target === event.currentTarget`, как для Enter.

### IN-04: Состояние `failed` плитки миниатюры «залипает»

**Файл:** `frontend/src/features/images/ImageTile.tsx:35, 63-64`

Одна неудачная загрузка миниатюры (например, кратковременная сеть) навсегда подменяет её на «Нет превью» до размонтирования плитки. Плитки виртуализируются, так что размонтирование случается при скролле, но повторить загрузку явно нельзя. Допустимо оставить, но стоит учесть при появлении статус-бейджей.

### IN-05: `DeleteClassModal` не защищает закрытие во время запроса

**Файл:** `frontend/src/features/classes/DeleteClassModal.tsx:36-45`

В отличие от `DeleteImagesModal` (`closeOnEscape={!pending}` и т.п.), здесь `handleClose` сбрасывает `isSubmittingRef` и вызывает `deleteClass.reset()` посреди запроса. Это отсоединяет наблюдателя: тост «удалено» не покажется, а повторный клик по «Удалить» сможет отправить второй DELETE (он идемпотентен, 404 обрабатывается, так что данные не страдают). Привести поведение к `DeleteImagesModal`.

### IN-06: Мелкие замечания по скриптам и инфраструктуре

- `scripts/seed_images.py:107-115`: параметр `seed` функции `seed(...)` затеняет имя самой функции. Переименовать параметр, например `rng_seed`.
- `scripts/run_full_suite.sh:2-4`: комментарий всё ещё говорит о «Phase 1 verification suite», хотя набор уже покрывает фазу 2.
- `docker/Dockerfile.backend` не создаёт непривилегированного пользователя. Контейнер `api` пишет в bind-mount от root. Смоук-тест уже вынужден чистить такие файлы через контейнер.
- `docker/nginx.conf.template:15`: регулярное выражение location для загрузки также захватывает `GET /images` (список). Это безвредно, но лимит тела и `proxy_request_buffering off` применяются и к GET.

### IN-07: Мелкие замечания по покрытию тестами

- Тесты на сценарии CR-01 и WR-01 теперь есть (`ImagesDeletePaging.test.tsx`, `images.test.ts`). Остаётся без теста частичный случай CR-01 (см. IN-08) и частичный отказ с точки зрения UI (см. WR-09).
- Нет теста на 500 для огромных id (WR-07).
- В `ClassRow.test.tsx:197` `waitFor(() => expect(patches).toHaveLength(1))` после `release(...)` уже выполнено до вызова и ничего не ожидает (запрос не дожидается ответа).

### IN-08: Остаточный «частичный» случай CR-01 зависит от поведения Virtuoso и не покрыт тестом (новое, от 02-13)

**Файл:** `frontend/src/features/images/ImagesPage.tsx:146-164`, `frontend/src/features/images/ImagesDeletePaging.test.tsx`

- Новый эффект срабатывает только при нуле элементов. Когда после удаления остаётся несколько плиток, не заполняющих вьюпорт, подгрузка зависит от `endReached` в `VirtuosoGrid`.
- По коду `react-virtuoso` 4.18.16 (`dist/index.mjs:3165-3176`) `endReached` отдаёт `totalCount - 1` с `distinctUntilChanged`. После удаления `totalCount` обычно меняется, и событие, скорее всего, сработает. Но если новое значение случайно совпадёт с ранее выданным, событие подавится, и страница снова зависнет с непустым неполным списком и `hasNextPage === true`.
- Все три теста используют `VirtuosoGridMockContext` с фиксированными размерами вьюпорта и покрывают только случай «удалены все».
- Совет (необязательно): сделать условие эффекта не «пусто», а «осталось меньше одной страницы» (`items.length < PAGE_SIZE`). Это устраняет зависимость от Virtuoso. Побочно: при `items.length < PAGE_SIZE` и `hasNextPage` досрочная догрузка дешёвая (страница в 100 элементов). Либо добавить тест для частичного случая.

### IN-09: Константа `DELETE_BATCH_SIZE` дублирует серверный предел без контрактной проверки (новое, от 02-13)

**Файл:** `frontend/src/api/images.ts:145-147`, `backend/src/yolo_trainer_api/schemas.py:188`

- Комментарий предупреждает, что значение должно совпадать с `max_length`, но автоматической связи нет. Тест `images.test.ts:118` лишь фиксирует `1000` на клиенте.
- Если сервер уменьшит предел, клиент получит 422 на первом же чанке (без потери данных, но функциональность сломается).
- Предложение: отдавать предел через `GET /api/config` (там уже передаются `max_upload_mb` и `accepted_extensions`) либо добавить бэкенд-тест, который проверяет значение `ImageDeleteRequest.model_fields["ids"]` против константы, упомянутой в документации.

---

_Проверено: 2026-10-03_
_Ревьюер: Claude (gsd-code-reviewer)_
_Глубина: standard_
