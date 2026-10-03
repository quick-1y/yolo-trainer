---
phase: 02-image-upload-classes
verified: 2026-10-03T21:00:00Z
status: human_needed
score: 4/4 roadmap success criteria verified; 5/5 truths of gap-closure plan 02-13 verified by code and tests; 0 blocking gaps
covered_files:
  - .planning/REQUIREMENTS.md
  - backend/src/yolo_trainer_api/routers/classes.py
  - backend/src/yolo_trainer_api/routers/images.py
  - backend/src/yolo_trainer_api/schemas.py
  - frontend/src/api/images.test.ts
  - frontend/src/api/images.ts
  - frontend/src/features/classes/ClassesPage.tsx
  - frontend/src/features/images/ImageGrid.tsx
  - frontend/src/features/images/ImagesDeletePaging.test.tsx
  - frontend/src/features/images/ImagesPage.tsx
  - frontend/src/features/images/UploadContext.tsx
covered_digest: "v1:sha256:c50bcf050ff07048fa24cb45417e1a98cd5bbd76c289c277a83987963777f73c"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: "4/4 (2 аспекта behavior-unverified)"
  gaps_closed:
    - "G-02-5 / WR-01: удаление выделения > 1000 id давало 422"
    - "G-02-5 / CR-01: ложное пустое состояние после удаления всех загруженных плиток при наличии next_cursor"
    - "SC2 плавность скролла и SC1 drop папки: подтверждены человеком в 02-UAT.md (тесты 1, 2), результат pass"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "WR-09: после частичного отказа удаления (чанк N>=2) selected и снимок deleteIds содержат уже удалённые id; SelectionBar показывает прежнее число, повтор шлёт все чанки заново"
    category: other
    reason: "Данные не теряются, бэкенд идемпотентен; рассинхронизация только в UI после редкого сбоя сети/БД посреди большого удаления"
    evidence_status: "02-REVIEW.md (чтение кода), тест на UI-сценарий отсутствует"
  - finding: "IN-08: эффект автоподгрузки срабатывает только при нуле элементов; частичный случай (осталось несколько плиток, не заполняющих вьюпорт) зависит от endReached в VirtuosoGrid"
    category: other
    reason: "Не входит в G-02-5; предложенный запас: условие items.length < PAGE_SIZE"
    evidence_status: "нет воспроизведения, только анализ кода react-virtuoso"
  - finding: "IN-09: DELETE_BATCH_SIZE дублирует серверный max_length=1000 без контрактной проверки"
    category: other
    reason: "Несовпадение проявится 422 на первом чанке, без потери данных"
    evidence_status: "none provided"
human_verification:
  - test: "Повтор UAT-теста 5 (WR-01) на живом стеке: docker compose up --build; uv run python scripts/seed_images.py --count 1100 --project-id <id>; открыть Images, прокрутить до > 1000 загруженных плиток, отметить первую, Shift-кликнуть плитку за 1000 (например 1067), Delete, Delete permanently"
    expected: "Нет 422 в диалоге; тост «Удалено изображений: 1067» (RU) / «Deleted images: 1067» (EN); плитки исчезают, счётчик падает на 1067"
    why_human: "Большое выделение на реальном стеке и реальный бэкенд; jsdom-тесты используют заглушку fetch"
  - test: "CR-01 в Chrome: проект > 200 изображений, DevTools Network, Block request URL с шаблоном *cursor=*; прокрутить до последней плитки (футер показывает ошибку подгрузки), отметить первую и Shift-кликнуть последнюю загруженную, удалить; затем снять блокировку и нажать «Повторить»"
    expected: "Страница остаётся с inline-ошибкой и кнопкой повтора, не показывает «Изображений пока нет», счётчик > 0; после снятия блокировки и повтора остальные изображения появляются"
    why_human: "Блокировка запросов в DevTools и реальный VirtuosoGrid с измеряемой геометрией не воспроизводятся в jsdom"
---

# Phase 2: Image Upload & Classes. Отчёт о верификации

**Цель фазы:** Пользователь может наполнить проект изображениями из браузера, плавно просматривать их даже при тысячах и определить список классов проекта.
**Проверено:** 2026-10-03
**Статус:** human_needed
**Повторная верификация:** Да, после закрытия gap G-02-5 планом 02-13 (коммиты eb79200..9e7d5f6).

## Замечание о режиме MVP

В ROADMAP у фазы указан `Mode: mvp`, но формулировка цели не в формате User Story (`user-story.validate` вернул `valid: false` при первичной верификации). Оркестратор явно запросил верификацию, поэтому проверка выполнена goal-backward методом по Success Criteria SC1-SC4. Таблица User Flow Coverage не строилась. Замечание информационное.

## Достижение цели

### Наблюдаемые истины (ROADMAP Success Criteria)

| # | Истина | Статус | Доказательства |
|---|--------|--------|----------------|
| SC1 | Drag-and-drop файлов/папки или выбор в диалоге, прогресс, чёткий отчёт об отклонённых | VERIFIED | Код: `UploadDropzone`, `UploadButtons`, `UploadContext` (очередь батчей, concurrency 3), `UploadPanel`; сервер `ingest_one` возвращает added/duplicate/rejected с причиной. Человек: `02-UAT.md` тест 2 (drop нескольких файлов и папки, диалоги), result: pass |
| SC2 | Миниатюры в сетке, плавный скролл на тысячах (seeded проект) | VERIFIED | Код: `VirtuosoGrid` + keyset-пагинация + индексы + immutable-кэш миниатюр, `scripts/seed_images.py`. Человек: `02-UAT.md` тест 1 (5000 изображений, плавность), result: pass |
| SC3 | Создание, переименование, перекраска, удаление классов; стабильный индекс и цвет | VERIFIED | `routers/classes.py` (POST/PATCH/DELETE, перенумерация в транзакции), `ClassesPage`, `ClassRow`, тесты `test_classes_api.py` в зелёном бэкенд-прогоне |
| SC4 | Изображения и классы остаются после рестарта | VERIFIED | Тесты рестарта (`test_images_and_thumbnails_survive_an_app_restart`, `test_classes_survive_app_restart`), `compose_smoke_test.sh`. Человек: `02-UAT.md` тест 3 (`docker compose down/up`, просмотр в браузере), result: pass |

**Счёт:** 4/4 критериев. Два аспекта, ранее помеченных PRESENT_BEHAVIOR_UNVERIFIED (плавность SC2, drop папки SC1), закрыты ручной UAT-проверкой (тесты 1 и 2 pass), поэтому `behavior_unverified: 0`. Визуальная сверка с UI-SPEC (UAT тест 4) тоже pass.

### Истины плана 02-13 (gap closure G-02-5), проверены по коду, а не по SUMMARY

| # | Истина | Статус | Доказательства |
|---|--------|--------|----------------|
| 1 | Выделение > 1000 id удаляется последовательными чанками по `DELETE_BATCH_SIZE` (1000), один запрос в полёте, тост показывает сумму `deleted` | VERIFIED | `frontend/src/api/images.ts:147` `export const DELETE_BATCH_SIZE = 1000`; `mutationFn` (строки 174-194) идёт циклом `for ... start += DELETE_BATCH_SIZE`, каждый `await apiRequest`, суммирует `deleted`. Тест `images.test.ts` "splits 2500 ids ...": 3 запроса в порядке 1..1000/1001..2000/2001..2500, `maxInFlight === 1`, сумма 10+20+30 = 60. Запущен мной, зелёный |
| 2 | Выделение <= 1000 шлёт ровно один запрос с прежним телом | VERIFIED | Тесты "exactly 1000" (1 запрос) и "1001" (1000 затем 1); `DeleteImagesModal.test.tsx` без изменений и зелёный (запуск 3 файлов: 16 passed) |
| 3 | При сбое позднего чанка уже удалённый префикс убирается из сетки, счётчики обновляются, дальше запросы не идут, ошибка API пробрасывается (диалог остаётся) | VERIFIED | `images.ts:187-192`: в `catch` при `succeeded > 0` вызывается `syncDeleted(ids.slice(0, succeeded))`, затем `throw error`. Тест "when chunk 2 fails": `ApiError` с сообщением "Database is unavailable", 2 запроса (третьего нет), в кэше остаются id 1001..2500, total 1500; "first chunk fails": ничего не вычищено |
| 4 | После удаления всех загруженных при наличии next page страница сама подгружает следующую; "No images yet" и "No matching images" не показываются, пока next page есть | VERIFIED | `ImagesPage.tsx:146-164` эффект `fetchNextPage()` при `data !== undefined && items.length === 0 && hasNextPage && !isFetching && !isFetchNextPageError`; `nothingLeft = items.length === 0 && !hasNextPage` (строка 167) гейтит обе ветки `EmptyState` (строки 232, 244); при пустом списке и `hasNextPage` рендерится `ImageGrid` с футером. Интеграционные тесты `ImagesDeletePaging.test.tsx`: auto-load (img-4..6 появляются, "Images: 3", ровно 2 запроса "c1") и search-вариант (car-14, "Found: 3"). Запущены мной, зелёные |
| 5 | Автоподгрузка не зацикливается: не срабатывает при любом fetch и после упавшей подгрузки; при сбое футер с "Try again" виден без плиток | VERIFIED | Условия `!isFetching` и `!isFetchNextPageError` в эффекте. Тест "does not loop": после двух подряд 500 ровно 2 запроса "c1", видны "Could not load more images." и "Try again", "No images yet" отсутствует; клик по "Try again" даёт 3-й запрос и плитки img-4..6 |

Запреты плана 02-13:

| Запрет | Статус | Доказательства |
|--------|--------|----------------|
| Не менять серверный лимит 1000 id | VERIFIED (resolved) | `backend/src/yolo_trainer_api/schemas.py:188` `ids: list[int] = Field(min_length=1, max_length=1000)`; `git diff 6ad44b6..HEAD --stat -- backend frontend` не содержит backend-файлов; `test_images_delete_api.py` 13 passed (запущен мной) |
| Не повторять упавшую подгрузку автоматически | VERIFIED (resolved) | Условие `!isFetchNextPageError` в эффекте; тест "does not loop" фиксирует число запросов 2 до клика и 3 после |

### Прочие истины фазы (из первичной верификации, регрессионная проверка)

| Истина | Статус | Примечание |
|--------|--------|------------|
| POST /images, хранение под `<image_id>.<ext>`, оригинал не изменяется, список keyset, удаление строки-затем-файлы, id не переиспользуются | VERIFIED | Backend-код не менялся с первичной проверки (diff 02-13 затрагивает только 4 frontend-файла); полный бэкенд-прогон 314 passed (данные оркестратора) |
| Удаление из UI невозможно без диалога подтверждения | VERIFIED | `DeleteImagesModal` не менялся, тесты зелёные |
| Плитки исчезают без рефетча, счётчик падает (02-11) | VERIFIED | `syncDeleted` использует тот же `pruneDeletedImages`/`setQueriesData`, путь успеха прежний; тест "prunes every deleted id ... and lowers the totals" |
| Имя файла плитки: одна строка с многоточием (backstop) | VERIFIED человеком | `02-UAT.md` тест 4 pass (обрезка имени 255 символов) |

### Артефакты и связи

| Артефакт | Статус | Детали |
|----------|--------|--------|
| `frontend/src/api/images.ts` | VERIFIED | Существует, содержательный (`DELETE_BATCH_SIZE`, `syncDeleted`, chunked `mutationFn`), используется `DeleteImagesModal` |
| `frontend/src/api/images.test.ts` | VERIFIED | 6 тестов (>= 4 требуемых): порядок чанков и один в полёте, границы 1000/1001, прунинг, сбой на чанке 2, сбой на чанке 1 |
| `frontend/src/features/images/ImagesPage.tsx` | VERIFIED | Эффект и `nothingLeft` на месте, обе ветки EmptyState гейтятся |
| `frontend/src/features/images/ImagesDeletePaging.test.tsx` | VERIFIED | 3 интеграционных теста, реальный `AppRoutes` + `VirtuosoGridMockContext` |
| Ключевая связь `useDeleteImages` -> `POST /projects/{id}/images/delete` | WIRED | `apiRequest` на каждый срез |
| Ключевая связь `ImagesPage` эффект -> `useImagesInfinite.fetchNextPage` | WIRED | Деструктуризация `images.fetchNextPage`, вызов в эффекте |
| Ключевая связь `ImagesPage` -> `ImageGrid` футер при пустом списке и `hasNextPage` | WIRED | Fall-through в ветку `ImageGrid` с пустым `items`; footer-ошибка проверена тестом |
| Level 4 (поток данных) | FLOWING | Список из `GET /images` -> `useImagesInfinite` -> `items` -> `ImageGrid`; удаление идёт в реальный `POST /images/delete` |

### Поведенческие проверки

| Проверка | Команда | Результат | Статус |
|----------|---------|-----------|--------|
| Тесты 02-13 | `npx vitest run src/api/images.test.ts src/features/images/ImagesDeletePaging.test.tsx src/features/images/DeleteImagesModal.test.tsx` | 3 файла, 16 passed | PASS (запущено в этой сессии) |
| Бэкенд-контракт удаления | `uv run python -m pytest backend/tests/test_images_delete_api.py -q` | 13 passed | PASS (запущено в этой сессии) |
| Полный бэкенд | `uv run python -m pytest backend/tests` | 314 passed | PASS (данные оркестратора, HEAD 9e7d5f6) |
| Полный фронтенд | `npx vitest run` | 27 файлов, 176 тестов зелёные | PASS (оркестратор/исполнитель) |
| Сборка | `npm run build` | tsc + vite build без ошибок | PASS (исполнитель) |

Полный прогон набора в этой сессии намеренно не повторялся (данные оркестратора на том же HEAD). Корневой `pytest` падает только на легаси-скрипте `gpu_test.py` (нужна CUDA), это не тест проекта.

### Покрытие требований

| Требование | Планы | Описание | Статус | Доказательства |
|-----------|-------|----------|--------|----------------|
| DATA-01 | 02-01, 03, 04, 06, 07, 08, 11, 12 | Загрузка изображений из браузера (файлы / папка, drag and drop) | SATISFIED | Код `ingest_one`, `UploadContext`, `UploadDropzone`, `UploadButtons`; UAT тест 2 pass |
| ANNO-01 | 02-01, 07, 09, 10, 11, 12, 13 | Виртуализированная сетка, отзывчивая при тысячах изображений | SATISFIED | `VirtuosoGrid`, keyset-пагинация; UAT тест 1 pass; 02-13 закрывает удаление больших выделений и ложное пустое состояние в этой сетке |
| PROJ-03 | 02-02, 05, 08, 12 | Создание, переименование, перекраска, удаление классов | SATISFIED | `routers/classes.py`, `ClassesPage`, `ClassRow`, `DeleteClassModal` |

Все три ID из PLAN frontmatter (в том числе `requirements: [ANNO-01]` у 02-13) присутствуют в `REQUIREMENTS.md` (строки 28, 34, 44; трассировка строки 144, 147, 154: Phase 2, Complete). Других ID, отнесённых к Phase 2 и не заявленных ни одним планом, нет. ORPHANED нет.

### Анти-паттерны

| Файл | Паттерн | Серьёзность | Влияние |
|------|---------|-------------|---------|
| `backend/src`, `scripts`, `docker`, четыре файла 02-13 | Маркеры TBD/FIXME/XXX | - | Не найдены, debt-gate чист |
| Прочее | Заглушки, пустые реализации в изменённых файлах 02-13 | - | Не найдены |

Предупреждения кода-ревью (02-REVIEW.md: 0 critical, 8 warnings, 9 info) не блокируют цель. CR-01 и WR-01 подтверждены закрытыми (см. выше). Остаточные WR-02..WR-09 и IN-01..IN-09 относятся к крайним сценариям. Три из них (WR-09, IN-08, IN-09) касаются именно изменений 02-13 и вынесены в `advisory` выше: они не опровергают ни одну истину плана и не требуют закрывающего плана до Phase 3, но WR-09 и IN-08 стоит учесть при ближайшей правке UI удаления.

### Необходима проверка человеком

Эти два пункта остались из `02-VERIFICATION` и `02-UAT` теста 5, они требуют реального стека и браузера. Автоматическая часть (хук, интеграция, контракт бэкенда) подтверждена.

1. **Повтор UAT-теста 5: удаление 1067 выделенных изображений.**
   **Тест:** `docker compose up --build`; `uv run python scripts/seed_images.py --count 1100 --project-id <id>`; на странице Images прокрутить до > 1000 плиток, отметить первую, Shift-кликнуть плитку за 1000, Delete, Delete permanently.
   **Ожидается:** нет 422; тост «Удалено изображений: 1067» (RU) / «Deleted images: 1067» (EN); плитки исчезают, счётчик падает на 1067.
   **Почему человек:** реальный бэкенд с большим выделением; тесты используют заглушку fetch.

2. **CR-01 с заблокированным cursor в Chrome DevTools.**
   **Тест:** проект > 200 изображений; Network -> Block request URL `*cursor=*`; прокрутить до последней плитки (футер показывает ошибку); отметить первую плитку, Shift-кликнуть последнюю загруженную; Delete permanently; снять блокировку; нажать «Повторить».
   **Ожидается:** страница сохраняет inline-ошибку с кнопкой повтора, не показывает «Изображений пока нет», счётчик > 0; после повтора остальные изображения появляются.
   **Почему человек:** блокировка запросов в DevTools и реальная геометрия Virtuoso недоступны в jsdom.

### Итог

Цель фазы достигнута. Все четыре Success Criteria подтверждены: SC1, SC2 и SC4 имеют и кодовые, и ручные (UAT тесты 1-4 pass) доказательства, SC3 покрыт кодом и тестами. Gap G-02-5 закрыт на уровне кода: я прочитал реализацию `useDeleteImages` и `ImagesPage`, проверил, что бэкенд-лимит не тронут, и сам запустил целевые тесты (16 + 13 passed), SUMMARY.md подтверждается кодом. Блокирующих пробелов нет, debt-маркеров нет, все ID требований учтены. Статус `human_needed` только из-за повторного прогона UAT-теста 5 и CR-01-проверки на живом стеке; это подтверждение на реальном браузере, а не сомнение в реализации.

---

_Проверено: 2026-10-03_
_Верификатор: Claude (gsd-verifier)_
