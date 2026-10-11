# Phase 5: Live Training Monitoring & Control - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-11
**Phase:** 05-live-training-monitoring-control
**Areas discussed:** Live charts, Cancel, Resume, History & errors

---

## Live charts

| Question | Options | Selected |
|----------|---------|----------|
| Chart set | Ultralytics-like grid (8 charts) / Compact: 3 charts / One main + tabs | Compact: 3 charts |
| In-epoch progress | Batch bar + ETA / ETA only / Epochs only | Batch bar + ETA |
| Final validation | Separate "Final results (best.pt)" card / Special chart point | Separate card |
| Charts after run ends | Kept forever / Only while running | Kept forever |

---

## Cancel

| Question | Options | Selected |
|----------|---------|----------|
| Partial result of a cancelled run | Don't register, allow download / Register as model / Nothing | Don't register, allow download |
| Cancel UX | Button + confirm + "Cancelling…" / No confirm | Button + confirm + "Cancelling…" |
| Where cancel is available | Run page only / Also run list / Everywhere incl. header | Run page only |
| When it stops | Immediately / Choice: now or after epoch | Immediately |

---

## Resume

| Question | Options | Selected |
|----------|---------|----------|
| Same or new run | Same run / New run from checkpoint | Same run |
| Resumable statuses | interrupted + cancelled + failed (with last.pt) / interrupted + cancelled only | incl. failed with last.pt |
| Settings on resume | Strictly same / Allow device/batch change | Strictly same |
| Queue position | End of queue / Front of queue | End of queue |
| Auto-resume after worker restart | Manual only / Automatic | Manual only |

---

## History & errors

| Question | Options | Selected |
|----------|---------|----------|
| History columns | + duration, epochs, key settings, mAP50-95 (sort/filter) / Minimal: + duration, epochs | Full set with sort/filter |
| Delete individual runs | Yes except active (incl. model) / Yes, keep model / No | Yes except active, model deleted too |
| Failure display | Category + hint + log / Readable text + log | Category + hint + log |
| Pre-start checks | No, only clear failure / Yes, disk space check | No |

---

## Claude's Discretion

- SSE endpoint shape, reconnect strategy, whether polling remains for list/header
- Batch event throttle, ETA algorithm, loss component display
- Resume boundary representation in progress.jsonl
- "Cancelling" state modeling and api→worker cancel signaling via DB
- Exception→category matching, new Alembic columns, API shapes

## Deferred Ideas

- Pre-start checks (disk space, CPU batch warning)
- Graceful "cancel after epoch"
- Changing device/batch on resume
- Auto-resume after worker restart
- Cancel from header/list
- Full Ultralytics-style metric grid (maybe Phase 11)
