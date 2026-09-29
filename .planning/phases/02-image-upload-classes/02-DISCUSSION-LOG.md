# Phase 2: Image Upload & Classes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-29
**Phase:** 2-image-upload-classes
**Areas discussed:** Upload rules, Image grid, Class model, File storage

---

## Upload rules

| Option | Description | Selected |
|--------|-------------|----------|
| JPG/PNG/WEBP/BMP | Formats Ultralytics reads natively and the browser displays; others rejected with reason | ✓ |
| JPG/PNG only | Minimal set | |
| Broad + conversion | Also TIFF/HEIC etc., converted server-side | |

| Option | Description | Selected |
|--------|-------------|----------|
| Skip by hash | SHA-256 content duplicate is skipped and reported; same name with different content allowed | ✓ |
| Skip by name | Existing filename rejected | |
| Allow all | Duplicates possible | |

| Option | Description | Selected |
|--------|-------------|----------|
| 50 MB per file | Configurable via .env | ✓ |
| No limit | Local single-user tool | |
| Pixel limit | e.g. 100 MP instead of bytes | |

| Option | Description | Selected |
|--------|-------------|----------|
| Overall progress panel | N of M + summary + expandable rejected list | ✓ |
| Per-file list | Row per file, Roboflow-like | |

**User's choice:** All recommended options.

---

## Image grid

| Option | Description | Selected |
|--------|-------------|----------|
| Viewer modal | Full-size view with ←/→, name, size; editor in Phase 3 | ✓ |
| Nothing yet | Click added in Phase 3 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-select delete | Checkboxes, Shift-click, confirmed delete | ✓ |
| One at a time | Delete from viewer | |
| Later | Defer deletion | |

| Option | Description | Selected |
|--------|-------------|----------|
| Thumb + name, newest first | Toggle to by-name; room for status badge | ✓ |
| Thumb only, by name | Minimal | |
| Thumb + name + resolution | Extra info on tile | |

| Option | Description | Selected |
|--------|-------------|----------|
| Simple search | Server-side filename search | ✓ |
| Later | Filters in later phases | |

**User's choice:** All recommended options.

---

## Class model

| Option | Description | Selected |
|--------|-------------|----------|
| Shift, no gaps | Contiguous 0..N-1; annotations reference class id | ✓ |
| Stable with gaps | Index fixed forever; renumber at export | |

| Option | Description | Selected |
|--------|-------------|----------|
| No reorder, creation order | Reorder deferred | ✓ |
| Drag & drop | With index-change warning | |

| Option | Description | Selected |
|--------|-------------|----------|
| Auto palette + change | Next unused contrast color, editable | ✓ |
| Always manual | Pick on create | |

| Option | Description | Selected |
|--------|-------------|----------|
| Delete with annotations + confirm | Dialog shows object count | ✓ |
| Forbid while annotated | Must clear first | |
| Reassign or delete | Merge into another class | |

**User's choice:** All recommended options.

---

## File storage

| Option | Description | Selected |
|--------|-------------|----------|
| As-is, EXIF-aware | Byte-for-byte original; dims/thumbs with EXIF orientation | ✓ |
| Rotate and re-save | Apply EXIF on upload (JPG quality loss) | |

| Option | Description | Selected |
|--------|-------------|----------|
| App ids, name in DB | data/projects/<id>/images/<image_id>.<ext> | ✓ |
| Original names | Suffixes on collision | |

| Option | Description | Selected |
|--------|-------------|----------|
| Delete from disk immediately | DB first, then files; orphan cleanup on start; project delete removes folder | ✓ |
| Trash | Move to data/trash | |

**User's choice:** All recommended options.

---

## Claude's Discretion

- Thumbnail size and format and when thumbnails are generated; palette values; upload batching and concurrency; API route shapes, cursor format and page size; image count on project card; empty states; sidebar order.
- D-05 (folder upload walks subfolders, and non-image files are reported as rejected) was filled in by Claude as a natural consequence of D-01 and D-04.

## Deferred Ideas

- Class reordering (Phase 9 / model phases).
- Grid filters by tag, status or split (later phases).
