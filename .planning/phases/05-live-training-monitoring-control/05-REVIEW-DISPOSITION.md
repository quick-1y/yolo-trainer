---
phase: 05
review: 05-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Удаление проекта не проверяет «модель — база активного запуска» другого проекта"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Отмена/остановка worker во время записи чекпоинта может уничтожить единственный `last.pt`"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Финальная запись `cancelled`/`interrupted` не защищена от `OperationalError`, отмена превращается в `failed`"
  - id: WR-04
    severity: warning
    disposition: open
    title: "`_terminate` не добивает группу процессов, если лидер вышел в период grace"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Длительность запущенного запуска считается по часам браузера и серверной метке"
  - id: IN-01
    severity: info
    disposition: open
    title: "После `_terminate` по отмене/остановке события не дочитываются"
  - id: IN-02
    severity: info
    disposition: open
    title: "Дублирование логики reconcile и списков статусов"
  - id: IN-03
    severity: info
    disposition: open
    title: "Кадр `status` не содержит `last_map50`, а при здоровом стриме опрос замедляется до 15 с"
  - id: IN-04
    severity: info
    disposition: open
    title: "Необработанная ошибка БД в цикле SSE обрывает поток"
  - id: IN-05
    severity: info
    disposition: open
    title: "Раздача interim `best.pt` не отвергает симлинк, в отличие от помощников удаления"
  - id: IN-06
    severity: info
    disposition: open
    title: "Мелкие несоответствия в клиенте и тестовой оснастке"
open: 11
total: 11
recorded: 2026-10-12T07:49:05.754Z
---

# Phase 05: Code Review Disposition

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

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
