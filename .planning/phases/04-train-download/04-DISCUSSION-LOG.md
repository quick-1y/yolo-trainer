# Phase 4: Train & Download - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-04
**Phase:** 04-train-download
**Areas discussed:** Splits, Training form & base models, Queue & run status, Models / download / snapshot

---

## Splits

| Option | Description | Selected |
|--------|-------------|----------|
| Unassigned | New images not used until assigned (roadmap §6.3) | ✓ |
| train | Fewer clicks, valid must be carved out later | |

**Default split for new images:** Unassigned

| Option | Description | Selected |
|--------|-------------|----------|
| Grid + editor | Bulk action in SelectionBar + tile chip; split selector in editor top bar | ✓ |
| Grid only | Bulk assignment and tile chip only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Only unassigned, 80/10/10 | Manual assignments untouched; editable ratios; test may be 0; confirm dialog with counts | ✓ |
| Choice in dialog | "Reshuffle all" checkbox, 80/10/10 | |
| Only unassigned, 70/20/10 | Roboflow-like larger valid | |

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude with warning | Only annotated + background train; form shows excluded count | ✓ |
| Block start | Start blocked until all split images annotated or unassigned | |

| Option | Description | Selected |
|--------|-------------|----------|
| All unassigned | Split fixed up front, valid stays stable across runs | ✓ |
| Only annotated + background | Exact ratios on usable data, re-run after more annotation | |
| Choice in dialog | Toggle in the auto-split dialog | |

---

## Training form & base models

| Option | Description | Selected |
|--------|-------------|----------|
| YOLO26 + YOLO11, n/s/m/l/x | Two current generations, default yolo26n | ✓ |
| YOLO26 + YOLO11 + YOLOv8 | Adds v8 (current best.pt lineage) | |
| Only YOLO26 n/s/m/l/x | Minimal list | |

| Option | Description | Selected |
|--------|-------------|----------|
| Standard Ultralytics | epochs 100, imgsz 640, batch auto, device auto | ✓ |
| Repeat last run | Pre-fill from project's last run | |
| As in config.ini | epochs 120, imgsz 960, batch 16 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Any project, same task type | Cross-project fine-tuning; head re-init note on class mismatch | ✓ |
| Only this project | Simpler, no cross-project reuse | |

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-name, editable | Pre-filled `run-<n>`, also the model name | ✓ |
| Auto-number only | No name field | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated page | `/training/new` with dataset summary; room for Advanced (Phase 11) | ✓ |
| Modal on Training page | Compact, cramped once Advanced lands | |

---

## Queue & run status

| Option | Description | Selected |
|--------|-------------|----------|
| Enqueue (FIFO) | Starts automatically, shows queue position, removable from queue | ✓ |
| Reject with explanation | Start disabled while another run is active | |

| Option | Description | Selected |
|--------|-------------|----------|
| Status + epoch + result | Epoch X/Y progress, elapsed, last mAP50 via polling; final metrics, verdict, settings, download | ✓ |
| Status and result only | No per-epoch progress | |

| Option | Description | Selected |
|--------|-------------|----------|
| running → interrupted, queued wait | Queue survives restart and resumes automatically | ✓ |
| Everything → interrupted | Nothing starts after restart | |

| Option | Description | Selected |
|--------|-------------|----------|
| Header indicator | Visible everywhere incl. editor, links to run | ✓ |
| Training page only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| failed + log tail | Exception + last ~50 log lines, collapsible | ✓ |
| Status only | Use `docker compose logs worker` | |

---

## Models / download / snapshot

| Option | Description | Selected |
|--------|-------------|----------|
| best.pt; last.pt kept alongside | One model per run; last.pt for Phase 5 resume | ✓ |
| Both as models | | |

| Option | Description | Selected |
|--------|-------------|----------|
| `<project>_<run>_best.pt` | Sanitized, unambiguous in Downloads | ✓ |
| `best.pt` | Matches downstream path, collides in Downloads | |

| Option | Description | Selected |
|--------|-------------|----------|
| Run page + base picker | Models page in Phase 7 | ✓ |
| Models section now | Read-only list in sidebar | |

| Option | Description | Selected |
|--------|-------------|----------|
| YOLO folder, hard-linked images | labels + data.yaml + manifest; copy fallback; kept after training | ✓ |
| Manifest + labels only | Images not kept; irreproducible after image delete | |
| Full copy always | Simple, doubles disk usage | |

| Option | Description | Selected |
|--------|-------------|----------|
| At Start click | Run trains on what the form showed | ✓ |
| When worker picks it up | Freshest data, counts may drift from form | |

| Option | Description | Selected |
|--------|-------------|----------|
| Deleted with project | Warn counts; active/queued run blocks delete; derived models keep base name as text | ✓ |
| Models outlive project | Needs orphan-model UI (Phase 7 territory) | |

---

## Claude's Discretion

- Job hand-off between the api and worker containers (recommended: the worker polls the DB queue and spawns the subprocess itself).
- Recursive metric serialization; handling of the extra final `on_fit_epoch_end` event; disabling Ultralytics analytics.
- `workers` value, CPU batch fallback, polling interval, log-tail size, auto-name format, auto-split algorithm and seed.
- API route shapes, run status enum, weight cache layout, and offline download failure reporting.

## Deferred Ideas

- Models sidebar page → Phase 7.
- "Duplicate run / pre-fill from last run" → Phase 5/11.
- Cancel, resume, SSE charts, friendly failure messages → Phase 5.
- YOLOv8 base via upload → Phase 7.
