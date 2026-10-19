# Phase 6: Polygons & Segmentation Projects - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-19
**Phase:** 06-polygons-segmentation-projects
**Areas discussed:** Polygon drawing & editing, Click-to-segment (SAM), Project task type rules, Segmentation metrics

---

## Polygon drawing & editing

| Option | Description | Selected |
|--------|-------------|----------|
| Click first point + Enter | First point highlights, Enter closes at ≥3 points, Esc cancels, Backspace removes last point | ✓ |
| Same + double-click | Double-click also closes; risk of accidental early close | |

| Option | Description | Selected |
|--------|-------------|----------|
| Midpoint handles on edges | Drag vertices; drag a midpoint to add; Alt/right-click deletes (min 3) | ✓ |
| Double-click on edge/vertex | Fewer handles, less discoverable | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Allow + warning | Saved as is, warning icon in object list | ✓ |
| Allow silently | | |
| Forbid | Block intersecting edges | |

| Option | Description | Selected |
|--------|-------------|----------|
| One polygon per object | Parts are separate polygons of the same class; no holes | ✓ |
| Multi-part instance | Several contours per instance, merged on export | |

**User's choice:** all recommended options.

---

## Click-to-segment (SAM)

| Option | Description | Selected |
|--------|-------------|----------|
| +/− points with preview | Enter accepts with active class, Esc cancels | ✓ |
| One click creates the object | Fix by hand afterwards | |
| +/− points and box prompt | Most precise, most complex | |

| Option | Description | Selected |
|--------|-------------|----------|
| CPU speed | One fixed lightweight model, no UI picker | ✓ |
| Accuracy | Larger SAM, slower on CPU | |
| Choice via env var | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Works during training, slower | Separate from the queue, UI warns | ✓ |
| Disabled during training | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Simplified + detail slider | ~20–60 pts, slider recomputes without rerunning SAM | ✓ |
| Fixed simplification | | |
| Maximum precision | Hundreds of points | |

---

## Project task type rules

| Option | Description | Selected |
|--------|-------------|----------|
| Migrate existing boxes to 4-point polygons | One-time Alembic migration | ✓ |
| Keep boxes, convert on edit | Both kinds live in the DB | |

| Option | Description | Selected |
|--------|-------------|----------|
| Box + click-to-segment → box | No polygon tool in detect | ✓ |
| Plus polygon → box | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Box tool stays, yields a polygon at once | 4-point editable polygon | ✓ |
| Hide box tool in segment | | |

---

## Segmentation metrics

| Option | Description | Selected |
|--------|-------------|----------|
| Masks solid, boxes dashed | Same three charts, seg_loss added | ✓ |
| Masks / Boxes toggle | | |
| Masks only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Masks primary, boxes second line | Verdict and history columns use (M) | ✓ |
| Boxes primary | | |

---

## Claude's Discretion

- Polygon storage schema, SAM hosting and request path in the worker, embedding caching, simplification algorithm, shortcut keys, warning wording, thumbnail rendering.

## Deferred Ideas

- SAM box prompts and a selectable larger SAM model.
- Multi-part instances and holes (out of scope by YOLO format).
