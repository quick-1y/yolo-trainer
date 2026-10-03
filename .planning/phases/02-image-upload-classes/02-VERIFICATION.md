---
phase: 02-image-upload-classes
verified: 2026-10-03T00:00:00Z
status: human_needed
score: 4/4 roadmap success criteria verified by automated evidence (visual/runtime parts routed to human); 0 blocking gaps
covered_files:
  - .planning/REQUIREMENTS.md
  - backend/src/yolo_trainer_api/routers/classes.py
  - backend/src/yolo_trainer_api/routers/images.py
  - frontend/src/api/images.ts
  - frontend/src/features/classes/ClassesPage.tsx
  - frontend/src/features/images/ImageGrid.tsx
  - frontend/src/features/images/ImagesPage.tsx
  - frontend/src/features/images/UploadContext.tsx
covered_digest: "v1:sha256:6bcf0afacc1aa4aae6c7fd3b07b92504b8e53b23a1b341cc598c62e69540f2ac"
behavior_unverified: 2
behavior_unverified_items:
  - truth: "Сетка плавно скроллится на нескольких тысячах изображений (SC2)"
    test: "Заполнить проект через scripts/seed_images.py --count 5000, открыть Images в реальном браузере, быстро проскроллить сверху вниз и обратно"
    expected: "Нет подвисаний, число DOM-плиток ограничено окном просмотра, миниатюры подгружаются по мере скролла"
    why_human: "Плавность скролла и FPS не проверяются grep/jsdom; в jsdom Virtuoso не измеряет реальную геометрию"
  - truth: "Drop целой папки работает в браузере (SC1)"
    test: "Перетащить папку с вложенными подпапками, содержащую изображения и посторонние файлы, в окно браузера (Chrome, Firefox, Edge)"
    expected: "Файлы из вложенных папок загружены, посторонние файлы показаны в отчёте об отклонённых"
    why_human: "Рекурсивный обход папок делает react-dropzone/file-selector на реальном DataTransfer; jsdom его не воспроизводит"
overrides_applied: 0
warnings:
  - id: CR-01
    severity: warning
    summary: "Удаление всех загруженных плиток при наличии next_cursor показывает EmptyState и останавливает подгрузку"
  - id: WR-01
    severity: warning
    summary: "Удаление выделения > 1000 id даёт 422 (max_length=1000 на бэкенде, один запрос на клиенте)"
human_verification:
  - test: "SC2: 5000 изображений, плавность скролла"
    expected: "Скролл без подвисаний, DOM ограничен окном"
    why_human: "Субъективная/измеряемая в браузере производительность"
  - test: "SC1: drag-and-drop нескольких файлов и целой папки (Chrome/Firefox/Edge) + диалог выбора файлов и папки"
    expected: "Прогресс виден, итоговая сводка показывает added/duplicates/rejected с причинами"
    why_human: "Реальный DataTransfer и нативные диалоги"
  - test: "SC4: docker compose down/up, затем просмотр в браузере"
    expected: "Изображения, миниатюры и классы (с индексами и цветами) на месте"
    why_human: "Серверная часть покрыта тестами и smoke-скриптом, но браузерное отображение после рестарта не проверено автоматически"
  - test: "Визуальная сверка с 02-UI-SPEC (тёмная тема, плитки 184x208, обрезка длинных имён, цвета классов, переключение RU/EN)"
    expected: "Соответствует UI-SPEC"
    why_human: "Внешний вид"
  - test: "CR-01 вручную: загрузить > 100 изображений, Shift-выделить первые 100, удалить"
    expected: "После исправления: подгружается следующая страница; сейчас: показывается пустое состояние при счётчике > 0"
    why_human: "Решение владельца: исправлять сейчас или отложить"
---

# Phase 2: Image Upload & Classes. Отчёт о верификации

**Цель фазы:** Пользователь может наполнить проект изображениями из браузера, плавно просматривать их даже при тысячах и определить список классов проекта.
**Проверено:** 2026-10-03
**Статус:** human_needed
**Повторная верификация:** Нет, первичная.

## Замечание о режиме MVP

В ROADMAP у фазы указан `Mode: mvp`, но формулировка цели не в формате User Story. Проверка `user-story.validate` вернула `valid: false`. По правилам MVP-режима верификатор должен отказаться и попросить `/gsd mvp-phase`. Оркестратор явно запросил верификацию, поэтому проверка выполнена стандартным goal-backward методом по Success Criteria SC1-SC4. Таблица User Flow Coverage не строилась. Это замечание информационное, на статус не влияет.

## Достижение цели

### Наблюдаемые истины (ROADMAP Success Criteria)

| # | Истина | Статус | Доказательства |
|---|--------|--------|----------------|
| SC1 | Drag-and-drop файлов/папки или выбор в диалоге, прогресс, чёткий отчёт об отклонённых | VERIFIED (автоматически); браузерная часть, см. human | `UploadDropzone.tsx` (Dropzone.FullScreen без `accept`, `useFsAccessApi={false}`, onDrop вызывает `startUpload`). `UploadButtons.tsx` (FileButton `multiple` + input с `webkitdirectory`). `UploadContext.tsx`: клиентский pre-filter `classifyFiles`, батчи через `runUploadQueue` (concurrency 3), счётчики на каждый батч. `UploadPanel.tsx`: `Progress`, итог added/duplicates/rejected, сворачиваемый список с именем и причиной, кнопка Copy, лимит 100 строк. Сервер: `ingest_one` возвращает `added/duplicate/rejected` с причиной на каждый файл. |
| SC2 | Загруженные изображения в сетке миниатюр, плавный скролл на тысячах (seeded проект) | Структурно VERIFIED; плавность PRESENT_BEHAVIOR_UNVERIFIED | `ImageGrid.tsx` использует `VirtuosoGrid` со своим скроллером, keyset-пагинацию (`useImagesInfinite`, `getNextPageParam: last.next_cursor`, страница 100/макс. 500), индексы `ix_images_project_id_id` и `ix_images_project_filename_key` (миграция 0002), миниатюры WEBP с `Cache-Control: immutable`. `scripts/seed_images.py` заполняет проект через реальный upload API. Плавность на 5000 изображений требует реального браузера, см. human. |
| SC3 | Создание, переименование, перекраска, удаление классов; стабильный индекс и цвет | VERIFIED | `routers/classes.py`: POST (позиция считается внутри INSERT, а не count-then-insert), PATCH (name/color, 409 на дубликат), DELETE (сжимает позиции 0..N-1 в той же транзакции). `ClassesPage.tsx` и `ClassRow.tsx` показывают индекс и цвет, нет drag-reorder (D-14). Маршрут `classes` подключён в `routes.tsx`, пункт в сайдбаре `ProjectLayout.tsx`. `test_classes_api.py` проходит. |
| SC4 | Изображения и классы остаются после рестарта сервиса | VERIFIED (бэкенд); браузерное отображение, см. human | `test_images_and_thumbnails_survive_an_app_restart`, `test_classes_survive_app_restart`, `test_restart_removes_leftovers_and_keeps_real_files`. `scripts/compose_smoke_test.sh` (строки 206-246) делает `docker compose down/up` и проверяет список изображений, миниатюру HTTP 200 и класс `car` с индексом 0. Оркестратор сообщает SMOKE OK. Docker в этой сессии не запускался. |

**Счёт:** 4/4 критериев подтверждены автоматическими доказательствами. 2 аспекта (плавность скролла SC2, обход папок SC1) остаются PRESENT_BEHAVIOR_UNVERIFIED и не входят в verified-счёт этих аспектов.

### Дополнительные истины из PLAN (выборочно, ключевые)

| Истина | Статус | Доказательства |
|--------|--------|----------------|
| POST /images: 200 с результатом на файл в порядке запроса; без `X-Requested-With` 403 | VERIFIED | `upload_images` с `Depends(require_xhr)`, цикл по `files` сохраняет порядок; тесты в `test_images_api.py` |
| Файл хранится по `data/projects/<pid>/images/<image_id>.<ext>`, расширение из декодированного формата, пользовательское имя в пути не участвует (D-18) | VERIFIED | `ingest_one` передаёт `processed.ext` и `image.id` в `storage.commit_files`; имя только в БД (`clean_filename`) |
| Оригинал не изменяется (prohibition, test-tier) | VERIFIED | Копия через `stage_and_hash` -> rename, без перекодирования; GET `/file` отдаёт байты как есть; тест в `test_images_files_api.py` |
| GET list: `{items,next_cursor,total}`, newest first, битый cursor даёт 422 "Invalid cursor." | VERIFIED | `list_images`, `_decode_cursor` |
| Удаление: строки сначала с коммитом, потом файлы; чужие id игнорируются; id не переиспользуются | VERIFIED | `delete_images`; `test_image_ids_are_never_reused_after_a_delete` |
| После подтверждения удаления плитки исчезают без рефетча, счётчик падает (02-11) | VERIFIED для основного пути, дефект в крайнем случае | `pruneDeletedImages`, `setQueriesData`; крайний случай см. CR-01 |
| Удаление из UI невозможно без диалога подтверждения (prohibition, test-tier) | VERIFIED | `DeleteImagesModal`, тесты `DeleteImagesModal.test.tsx` и `ImagesSelection.test.tsx` проходят |
| Имя файла плитки: одна строка с многоточием, held-out визуальный тест (backstop) | UNCERTAIN (insufficient_spec) | Нужна визуальная проверка человеком, см. human |

### Артефакты и связи

| Артефакт | Статус | Детали |
|----------|--------|--------|
| `backend/.../routers/images.py` | VERIFIED | Реальные запросы к БД и диску, зарегистрирован в `main.py`, не заглушка |
| `backend/.../routers/classes.py` | VERIFIED | Полный CRUD, транзакционная перенумерация |
| `backend/.../image_processing.py`, `storage.py` | VERIFIED | Pillow-декодирование, EXIF-коррекция, миниатюра, очистка сирот при старте |
| `frontend/.../ImagesPage.tsx` -> `ImageGrid.tsx` -> `useImagesInfinite` -> `GET /images` | WIRED | Данные текут из API: Level 4 FLOWING |
| `UploadDropzone/UploadButtons` -> `UploadContext.startUpload` -> `uploadImageBatch` -> `POST /images` | WIRED | Провайдер над маршрутами проекта, `ProjectLayout` его монтирует |
| `ClassesPage` -> `useClasses` -> `GET /classes`; `ClassRow` -> PATCH/DELETE | WIRED | FLOWING |
| Счётчики изображений и классов на карточках и Overview | WIRED | инвалидация `projectKeys` в мутациях |

Знаковая особенность дизайна: новые миниатюры появляются в сетке после завершения всей загрузки (`resetQueries` в конце), а не по мере загрузки. Это зафиксированное решение D-04, критерию SC1/SC2 не противоречит.

### Поведенческие проверки (выполнены в этой сессии)

| Проверка | Команда | Результат | Статус |
|----------|---------|-----------|--------|
| Бэкенд-тесты | `uv run pytest tests -q` | 314 passed | PASS |
| Фронтенд-тесты | `npx vitest run` | 25 файлов, 167/167 passed | PASS |
| Сборка фронтенда | `npm run build` | built, только предупреждения Rolldown | PASS |
| Compose smoke / seed 5000 / браузер | не запускалось (нельзя поднимать сервисы) | см. human | SKIP |

Известная нестабильность: оркестратор сообщает, что тесты `ClassRow` изредка падают под нагрузкой. В этом прогоне зелёные. Причины описаны в WR-05.

### Покрытие требований

| Требование | Планы | Описание | Статус | Доказательства |
|-----------|-------|----------|--------|----------------|
| DATA-01 | 02-01, 03, 04, 06, 07, 08, 11, 12 | Загрузка изображений из браузера (файлы / папка, drag and drop) | SATISFIED (автоматически) | `ingest_one`, `UploadContext`, `UploadDropzone`, `UploadButtons`; обход папок в браузере требует human-проверки |
| ANNO-01 | 02-01, 07, 09, 10, 11, 12 | Виртуализированная сетка, отзывчивая при тысячах изображений | SATISFIED структурно; плавность, см. human | `VirtuosoGrid`, keyset-пагинация, индексы, immutable-кэш миниатюр, seed-скрипт |
| PROJ-03 | 02-02, 05, 08, 12 | Создание, переименование, перекраска, удаление классов | SATISFIED | `routers/classes.py`, `ClassesPage`, `ClassRow`, `DeleteClassModal` |

Все три ID из PLAN frontmatter присутствуют в REQUIREMENTS.md (строки 28, 34, 44; трассировка строки 144, 147, 154: Phase 2, Complete). Других требований, отнесённых к Phase 2 и не заявленных ни одним планом, нет. ORPHANED нет.

### Анти-паттерны

| Файл | Строка | Паттерн | Серьёзность | Влияние |
|------|--------|---------|-------------|---------|
| `frontend/src/features/images/ImagesPage.tsx` | 218-228 | `items.length === 0` без проверки `hasNextPage` даёт EmptyState (CR-01, подтверждён чтением кода) | Warning | Крайний случай удаления, восстановление перезагрузкой |
| `frontend/src/api/images.ts` | 145-152 | Один запрос на все id при `max_length=1000` на бэкенде (WR-01, подтверждён) | Warning | 422 при выделении > 1000 |
| Маркеры TBD/FIXME/XXX | - | Не найдены в `backend/src`, `frontend/src`, `scripts`, `docker` | - | Debt-gate чист |

### Суждение по CR-01 и WR-01

Явная позиция: ни CR-01, ни WR-01 не опровергают цель фазы и не нарушают ни один из SC1-SC4.

- Success Criteria касаются загрузки, просмотра сетки, классов и персистентности. Удаление изображений в них не входит (оно добавлено планом 02-11 как сопутствующая возможность).
- Оба дефекта подтверждены чтением кода и воспроизводимы, но не приводят к потере данных. CR-01 даёт неверное пустое состояние, выход: перезагрузка страницы. WR-01 даёт понятный отказ 422, выход: удалять порциями до 1000.
- Они частично нарушают плановую истину 02-11 ("плитки исчезают, счётчик падает") только в крайних случаях: все загруженные плитки удалены при остающихся страницах, либо выделение > 1000.

Однако CR-01 достижим естественным сценарием в самом целевом сценарии фазы (тысячи изображений): Shift-выделить первую страницу из 100 и удалить. Поэтому рекомендуется закрыть CR-01 (простой эффект `fetchNextPage` при пустом списке и `hasNextPage`, плюс тест) и WR-01 (чанки по 1000) до того, как Phase 3 начнёт опираться на сетку. Это решение владельца: заводить gap-closure или `/gsd-quick`. Если владелец сочтёт CR-01 блокирующим, статус нужно сменить на `gaps_found`. WR-02 (stale-индекс просмотрщика) и WR-04 (ошибка фонового рефетча размонтирует UploadProvider и обрывает загрузку) тоже пересекаются с SC1 в редких сетевых сценариях и стоят исправления, но на выполнение SC1 в штатном режиме не влияют.

### Необходима проверка человеком

1. **SC2: плавность на 5000 изображений.** Выполнить `uv run python scripts/seed_images.py --count 5000`, открыть Images, проскроллить. Ожидается: без подвисаний, DOM ограничен окном. Почему человек: производительность в реальном браузере.
2. **SC1: drop нескольких файлов и целой папки** в Chrome/Firefox/Edge, плюс диалоги выбора файлов и папки. Ожидается: прогресс, сводка с причинами отклонений.
3. **SC4: `docker compose down/up`, затем браузер.** Ожидается: изображения, миниатюры, классы с индексами и цветами на месте.
4. **Визуальная сверка с 02-UI-SPEC**, включая обрезку имени из 255 символов (backstop-истина) и переключение RU/EN.
5. **CR-01** (см. выше): решение владельца, исправлять сейчас или отложить.

### Итог

Автоматически проверяемая часть цели достигнута: загрузка, хранение, список с keyset-пагинацией, виртуализированная сетка, CRUD классов со стабильными индексами и персистентность реализованы, подключены и покрыты зелёными тестами (314 бэкенд, 167 фронтенд, сборка чистая). Блокирующих пробелов нет. Статус `human_needed` из-за обязательных проверок в реальном браузере и открытого вопроса по CR-01/WR-01.

---

_Проверено: 2026-10-03_
_Верификатор: Claude (gsd-verifier)_
