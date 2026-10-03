# Phase 3: Box Annotation Editor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 03-box-annotation-editor
**Areas discussed:** Editor layout, Drawing & class assignment, Saving & undo, Status & navigation

---

## Editor layout

| Option | Description | Selected |
|--------|-------------|----------|
| Separate route | Full-screen `/projects/:id/annotate/:imageId`, reloadable URL | ✓ |
| Modal over grid | Like the current ImageViewerModal | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tools left, panel right | Left tool strip; right classes + object list; top bar with filename/status/prev-next/counter | ✓ |
| Everything in top toolbar | Tools and classes in a top toolbar; no object list | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same as grid | Same sort + search as the grid, carried in URL params | ✓ |
| Always by filename | Fixed order | |

| Option | Description | Selected |
|--------|-------------|----------|
| Wheel zoom to cursor, space/middle pan | Fit-to-window on open, reset-fit key | ✓ |
| Same + keep zoom between images | | |
| You decide | | |

## Drawing & class assignment

| Option | Description | Selected |
|--------|-------------|----------|
| Active class | Digits 1–9 switch; new box gets it immediately | ✓ |
| Popup after drawing | Roboflow-style class picker | |
| Active + optional popup | Toggle | |

| Option | Description | Selected |
|--------|-------------|----------|
| Select + digit/click | Changes the selected box's class; plus dropdown in object list | ✓ |
| Only via object list | Digits always change the active class only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Create class inline | Drawing disabled until a class exists | ✓ |
| Link to Classes page only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tool stays active + crosshair | Clamp to bounds, discard tiny boxes | ✓ |
| Auto-switch to select | | |
| You decide | | |

## Saving & undo

| Option | Description | Selected |
|--------|-------------|----------|
| Auto per gesture | Debounced; Saved/Saving/Error indicator; Ctrl+S flushes | ✓ |
| Manual + auto on navigate/timer | docs/roadmap §7.5 / CVAT style | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per image, session memory | ~100 steps, empty after reload | ✓ |
| Current image only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Retry + block leaving | Queue, backoff, navigation waits, beforeunload | ✓ |
| Same + localStorage draft | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Version + warning | 409 on stale tab, "changed elsewhere — reload" | ✓ |
| Last write wins | | |

## Status & navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic | ≥1 box or background → annotated; reviewed only explicit | ✓ |
| Manual "Done" | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Background = flag only with no boxes; reviewed demoted on edit | | ✓ |
| Background deletes boxes; reviewed sticky | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Next after current, wrap around | Grid order; "all annotated" message; also from grid | ✓ |
| Always first unannotated | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tile badge + counters above grid | Status filter stays in Phase 10 | ✓ |
| Tile badge only | | |
| Badge + status filter now | Pulls Phase 10 scope forward | |

## Claude's Discretion

- Shortcut map, box rendering details, save API shape and debounce/retry numbers, neighbor prefetch, min box size, Transformer use, react-konva lazy loading.

## Deferred Ideas

- Grid filters by status/class → Phase 10.
- Optional "ask class after drawing" popup.
- localStorage draft for unsaved changes.
