---
status: testing
phase: 05-live-training-monitoring-control
source: [05-VERIFICATION.md]
started: 2026-10-12T08:11:08Z
updated: 2026-10-12T08:11:08Z
---

## Current Test

number: 1
name: Live charts on a real CPU run in a real browser (success criterion 1)
expected: |
  Start a CPU run with 6+ epochs. The mAP, loss and precision/recall charts grow after each epoch without a refresh. Reloading the page mid-run restores the whole curve and keeps updating. After the last epoch the card reads 'Final validation…' (never 'Epoch Y+1'), and a 'Final results (best.pt)' card then appears.
awaiting: user response

## Tests

### 1. Live charts on a real CPU run in a real browser (success criterion 1)
expected: Start a CPU run with 6+ epochs. The mAP, loss and precision/recall charts grow after each epoch without a refresh. Reloading the page mid-run restores the whole curve and keeps updating. After the last epoch the card reads 'Final validation…' (never 'Epoch Y+1'), and a 'Final results (best.pt)' card then appears.
result: [pending]

### 2. Held-out visual checks at 1024 and 1280 px in en and ru (six backstop statements from plans 05-02, 05-03, 05-04, 05-08)
expected: At 1200 px and wider the three chart panels fit the 960 column and stack below that, with no clipped axis labels or legend. The running headline (epoch on the left, time and ETA on the right) stays on one line with a 3-digit epoch count. The ru final-validation title and hint wrap inside the card. A 10,000-character error message and a 5,000-character log line wrap without widening the page. A 100-character run name and ru header labels (Длительность, Изображений, Базовая модель) fit the history table.
result: [pending]

### 3. Cancel from the UI during a real run, then start another run (success criterion 2)
expected: Press Cancel, confirm. The page shows 'Cancelling…' and then 'Cancelled' within seconds. No `yolo_trainer_worker.train_job` process is left (Docker: `docker compose exec worker ps`). A newly started run is claimed at once.
result: [pending]

### 4. Resume from the UI after cancel and after `kill -9` of the training process (success criteria 3 and 5)
expected: Resume the cancelled run: it is queued, then runs again as the same run with a 'Resumed' marker on the charts, and its first epoch is the checkpoint epoch + 1, not 1. After `kill -9` of the training process the run ends 'failed' with the 'Training process was killed' title and hint, the original message and the log tail, and Resume is offered.
result: [pending]

### 5. Run page for interim, delete and queued-resume states; history table in the browser
expected: A cancelled or failed run offers 'Download interim best.pt' with the 'incomplete' note, and the file is not in the model list. 'Delete run' names the model in bold. A queued resume shows 'Cancel resume' and no 'Remove from queue'. The history table sorts by every sortable column and filters by status, and the choice survives a reload (?sort, ?dir, ?status).
result: [pending]

### 6. Decision on code review WR-01 (project delete vs a base model used by an active run of another project)
expected: Decide: accept as a known limitation or fix before closing the phase. Deleting project A removes its models even when an active (queued or preparing) run of project B uses one as its base. The queued run then fails with the categorized 'The base model file is missing.' message instead of being protected.
result: [pending]

### 7. Re-run `bash scripts/compose_smoke_test.sh` once on the final tree
expected: 'SMOKE OK'. The Phase 5 stage covers cancel, no orphan, next run, resume and the SSE end frame through nginx.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
