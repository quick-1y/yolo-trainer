---
phase: 04
review: 04-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Hard link в датасет позволяет Ultralytics перезаписать оригинал изображения проекта"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Падение после `add_task` или внутри `prepare_run_files` оставляет run в `preparing` навсегда, без пути восстановления"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Необработанное исключение в heartbeat-потоке молча убивает heartbeat, что приводит к потере живого прогона при рестарте api"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Имена классов с U+0085 / U+2028 / U+2029 портятся в `data.yaml`, и прогон падает только после завершения обучения"
  - id: WR-05
    severity: warning
    disposition: open
    title: "`is_heartbeat_fresh` бросает `TypeError` на naive-времени и считает \"свежим\" heartbeat из будущего; последствия шире, чем в 04-SECURITY.md"
  - id: IN-01
    severity: info
    disposition: open
    title: "Тестовый seam `_after_image_select` живёт в продакшн-коде"
  - id: IN-02
    severity: info
    disposition: open
    title: "Магическое число 60 в healthcheck дублирует `HEARTBEAT_MAX_AGE_SECONDS`"
  - id: IN-03
    severity: info
    disposition: open
    title: "Дублирование источников истины для `SPLITS` и списка официальных весов"
  - id: IN-04
    severity: info
    disposition: open
    title: "Воркер импортирует из пакета api и использует исключение с неподходящим смыслом"
  - id: IN-05
    severity: info
    disposition: open
    title: "Ветка `IntegrityError` в `create_run` неверно маркирует нарушение FK проекта как \"Unknown model\""
  - id: IN-06
    severity: info
    disposition: open
    title: "Сообщения об ошибках содержат пути файловой системы сервера"
  - id: IN-07
    severity: info
    disposition: open
    title: "Усечение имени скачиваемого файла считает символы, а не байты"
  - id: IN-08
    severity: info
    disposition: open
    title: "Smoke-тест не падает быстро при ошибке разбора статуса run"
open: 13
total: 13
recorded: 2026-10-10T20:55:07.526Z
---

# Phase 04: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
