---
phase: 03-box-annotation-editor
plan: 01
subsystem: annotation-editor
tags: [react-konva, konva, zustand, zundo, fastapi, sqlalchemy, alembic, optimistic-concurrency, vitest]

requires:
  - phase: 02-image-upload-classes
    provides: images table and original-file route, classes table (annotations reference classes.id), image grid, i18n and test harness
provides:
  - migration 0004 (annotations table, images.is_background / is_reviewed / annotation_version)
  - versioned whole-set replace save (PUT annotations) with compare-and-swap, 409 and idempotent retry
  - derived image status and box_count on every image response
  - lazy full-screen editor route /projects/:projectId/annotate/:imageId outside the app shell
  - per-image zundo store, module-level registry and serial coalescing saver
  - compose smoke test and jsdom canvas test covering draw -> save -> reload
affects: [03-02, 03-03, 03-04, 03-05, 03-06, 03-07, 03-08, 03-09, 03-10, 03-11, 03-12, 03-13, phase-06-polygons, phase-08-ai-annotation]

plan_head_before: a09105a9a53a54b8a12f3942a86bc2bcbc23359e

actuals:
  tokens: 24400
  tasks: 2
  commits: 1

tech-stack:
  added: [konva@10.7.0, react-konva@19.3.0, zustand@5.0.15, zundo@2.3.0, vitest-canvas-mock@1.2.0 (dev)]
  patterns:
    - "Whole-set replace save guarded by an UPDATE ... WHERE annotation_version = :base compare-and-swap as the first statement"
    - "Derived status/box_count via correlated column_property, never stored"
    - "One zustand+zundo store per image in a module-level registry; saver subscribed to doc changes"
    - "Konva drawing with pointer capture on stage.content, coordinates from getRelativePointerPosition"
    - "Lazy React.lazy route as a sibling of AppLayout so konva stays out of the main bundle"

key-files:
  created:
    - backend/src/yolo_trainer_api/migrations/versions/0004_create_annotations.py
    - backend/src/yolo_trainer_api/annotations.py
    - backend/src/yolo_trainer_api/routers/annotations.py
    - backend/tests/test_annotations_api.py
    - frontend/src/api/annotations.ts
    - frontend/src/features/editor/EditorPage.tsx
    - frontend/src/features/editor/EditorTopBar.tsx
    - frontend/src/features/editor/EditorPage.test.tsx
    - frontend/src/features/editor/canvas/AnnotationCanvas.tsx
    - frontend/src/features/editor/canvas/BoxShape.tsx
    - frontend/src/features/editor/canvas/useLoadedImage.ts
    - frontend/src/features/editor/store/annotationStore.ts
    - frontend/src/features/editor/store/annotationSaver.ts
    - frontend/src/features/editor/store/storeRegistry.ts
    - frontend/src/features/editor/lib/geometry.ts
    - frontend/src/features/editor/lib/ids.ts
    - frontend/src/features/editor/lib/urls.ts
    - frontend/src/i18n/locales/en/editor.json
    - frontend/src/i18n/locales/ru/editor.json
    - frontend/src/test/canvas.ts
    - frontend/src/test/editorApi.ts
  modified:
    - backend/src/yolo_trainer_api/models.py
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/main.py
    - backend/src/yolo_trainer_api/routers/images.py
    - backend/tests/test_images_api.py
    - scripts/compose_smoke_test.sh
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/src/api/images.ts
    - frontend/src/app/routes.tsx
    - frontend/src/test-setup.ts

key-decisions:
  - "Save contract (D-12): PUT replaces the image's whole box set; first statement is a compare-and-swap UPDATE of images.annotation_version; stale base returns 409, a content-equal retry returns 200 with the stored version"
  - "Status and box_count are derived (correlated count), never stored, so a class-delete cascade cannot desync them (D-13)"
  - "Box ids are client-generated UUID v4 built from getRandomValues (randomUUID is undefined on http LAN origins)"
  - "The server enforces structure only; demotion of reviewed/background on a box change (D-14, D-15) lives in the client store's createBox, in the same history entry"
  - "No task_type check anywhere: the box tool works in detect and segment projects alike (D-18)"
  - "Supply-chain gate T3-01-SC: all five new packages approved by the user and installed; lockfile committed"

patterns-established:
  - "ORM-only statements in the save path (update(Image)..., rowcount) - no text() SQL, Postgres-portable"
  - "Test fixtures behind fetch stubs are untyped object literals so later additive response fields never break tsc"
  - "Canvas jsdom tests: stubImageDecoding + stubElementSize (also clientWidth/Height for Konva's content scale) + pointer-capture stubs"

requirements-completed: []

coverage:
  - id: D1
    description: "Editor route is full screen outside the app shell, shows the original on a #141414 canvas fitted to the window, top bar with Back, filename and save indicator"
    requirement: ANNO-02
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/EditorPage.test.tsx#renders outside the app shell: no project sidebar"
        status: pass
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (SPA deep link /projects/{p}/annotate/{i} returns 200 through nginx)"
        status: pass
    human_judgment: true
    rationale: "Fit-to-window margin, matte color and top bar layout are visual; the jsdom test cannot judge them (end-of-phase browser check)"
  - id: D2
    description: "A left-button drag draws a box with the active class, clipped to the image, saved with one PUT; tiny drags and no-class projects create nothing; release outside the canvas still commits"
    requirement: ANNO-03
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/EditorPage.test.tsx#draws a box, saves it with one PUT and shows Saved"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/EditorPage.test.tsx#creates nothing for a 2 pixel drag"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/EditorPage.test.tsx#commits a box whose pointerup lands outside the stage, clipped to the image"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/EditorPage.test.tsx#shows the hint and draws nothing when the project has no classes"
        status: pass
    human_judgment: true
    rationale: "Real pointer capture and drag feel in a browser cannot be exercised by jsdom's synthetic pointer events (end-of-phase browser check)"
  - id: D3
    description: "Boxes survive a page reload and a docker compose down/up"
    requirement: ANNO-07
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/EditorPage.test.tsx#shows the saved boxes again after a reload"
        status: pass
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (box listed after down/up with version 1)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Versioned replace-set save contract: 403 without header, version 1 and annotated, stale 409, idempotent retry, unknown/foreign class 422, foreign box id 422, payload validation, class-delete cascade"
    requirement: ANNO-07
    verification:
      - kind: integration
        ref: "backend/tests/test_annotations_api.py (9 tests)"
        status: pass
      - kind: e2e
        ref: "bash scripts/compose_smoke_test.sh (403, version 1, box_count 1, stale 409)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Derived status and box_count on image detail, list items and upload responses"
    requirement: ANNO-03
    verification:
      - kind: integration
        ref: "backend/tests/test_images_api.py#test_list_is_newest_first_with_total; backend/tests/test_annotations_api.py#test_status_is_derived_and_image_of_another_project_is_404"
        status: pass
    human_judgment: false
  - id: D6
    description: "Per-image zundo store (limit 100, only doc tracked, no history entry for meta) and serial coalescing saver (one request in flight, 409 stops sending, failure keeps the doc pending)"
    requirement: ANNO-07
    verification:
      - kind: unit
        ref: "frontend/src/features/editor/store/annotationStore.test.ts"
        status: pass
      - kind: unit
        ref: "frontend/src/features/editor/store/annotationSaver.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Konva is only in the lazy editor chunk and the nginx CSP is unchanged (no third-party origin)"
    verification:
      - kind: other
        ref: "grep -l konvajs-content frontend/dist/assets/*.js lists one non-index chunk; git diff --quiet -- docker/nginx.conf.template"
        status: pass
    human_judgment: false

duration: 20min (continuation; the earlier Task 1 session is not timed)
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 01: Draw a box and find it after a reload (tracer) Summary

**Full-screen react-konva editor on a lazy route, with a compare-and-swap versioned replace-set annotation API (migration 0004), per-image zundo store and serial saver, proven end to end through the compose stack and in jsdom.**

## Performance

- **Duration:** about 20 min for the continuation session (Task 1 was a separate, earlier session)
- **Started:** 2026-10-04T07:04:44Z
- **Completed:** 2026-10-04T07:30Z (approx.)
- **Tasks:** 2 (Task 1 supply-chain gate, Task 2 tracer)
- **Files modified:** 35 in the tracer commit (3025 insertions)

## Accomplishments

- Opening `/projects/{p}/annotate/{i}` shows a full-screen editor outside the app shell (48px top bar with "← Images", filename and a fixed 120px save indicator, the stored original fitted on a `#141414` canvas, never above 400%).
- A drag with the first class draws a dashed draft, commits a box clipped to the image on release (pointer capture on the stage content, so a release outside the canvas still commits), and saves it with one PUT; clicks and drags under 4 screen px create nothing; with zero classes a hint is shown and nothing is drawn.
- `PUT .../annotations` is a whole-set replace guarded by a compare-and-swap `UPDATE images SET annotation_version = annotation_version + 1 WHERE ... annotation_version = :base` as the FIRST statement: stale base gives 409, a content-equal retry (lost response) gives 200 with the stored version, every failure path rolls back.
- Image status and `box_count` are derived (correlated count), reported on image detail, every list item and the upload response.
- The box survives a page reload and a `docker compose down` / `up` (smoke test).

## Task Commits

1. **Task 1: package-legitimacy gate (T3-01-SC)** - no commit (gate task, nothing installed before approval)
2. **Task 2: tracer, draw a box and find it after a reload** - `6aee402` (feat)

**Plan metadata:** recorded in the docs commit that follows this file.

## Task 1 evidence (supply-chain gate)

Read-only `npm view` output gathered before any install (no `install` / `preinstall` / `postinstall` script on any of the five; repositories and versions match the RESEARCH audit):

| Package | Version | Repository |
|---------|---------|------------|
| konva | 10.7.0 | konvajs/konva |
| react-konva | 19.3.0 | konvajs/react-konva |
| zustand | 5.0.15 | pmndrs/zustand |
| zundo | 2.3.0 | charkour/zundo |
| vitest-canvas-mock | 1.2.0 (dev) | wobsoriano/vitest-canvas-mock |

User response to the `blocking-human` checkpoint: `approved` - all five installed, none dropped. `git diff --quiet -- frontend/package.json frontend/package-lock.json` exited 0 before the install.

Resolved versions after `npm install` (read from `node_modules/*/package.json`): konva@10.7.0, react-konva@19.3.0, zustand@5.0.15, zundo@2.3.0, vitest-canvas-mock@1.2.0.

`node -p "Object.keys(require('react-konva')).join()"` (run in `frontend/`):
`Layer,FastLayer,Group,Label,Rect,Circle,Ellipse,Wedge,Line,Sprite,Image,Text,TextPath,Star,Ring,Arc,Tag,Path,RegularPolygon,Arrow,Shape,Transformer,version,KonvaRenderer,Stage,useStrictMode,useContextBridge`

## Files Created/Modified

- `backend/src/yolo_trainer_api/migrations/versions/0004_create_annotations.py` - annotations table (client UUID PK, FK cascades, `kind` check, two indexes) and the three `images` columns.
- `backend/src/yolo_trainer_api/annotations.py` - `apply_save` (compare-and-swap, class and foreign-id checks, diff-apply), `load_annotation_set`, `same_content`.
- `backend/src/yolo_trainer_api/routers/annotations.py` - `GET` image detail, `GET`/`PUT` annotation set (`require_xhr` on PUT).
- `backend/src/yolo_trainer_api/{models,schemas,main}.py`, `routers/images.py` - `Annotation` model, `Image.box_count` column_property, `derive_status`, request/response models, router registration, `session.refresh(image)` after the upload commit.
- `frontend/src/features/editor/**` - `EditorPage`, `EditorTopBar`, `AnnotationCanvas`, `BoxShape`, `useLoadedImage`, store, registry, saver, `geometry`, `ids`, `urls`, tests.
- `frontend/src/api/{annotations,images}.ts`, `app/routes.tsx`, `test-setup.ts`, `i18n/locales/{en,ru}/editor.json`, `test/{canvas,editorApi}.ts`.
- `scripts/compose_smoke_test.sh` - annotation section before the restart and a persistence check after it.

## Decisions Made

- Followed the plan's save contract exactly; the reasoning is recorded in `key-decisions` above.
- `refresh(image)` is placed AFTER the commit try-block (not inside it) so a failing refresh can never delete files of an already committed image.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing list test asserted the exact image field set**
- **Found during:** Task 2 (backend test run)
- **Issue:** `test_list_is_newest_first_with_total` compared the item keys to a fixed set; the planned additive `ImageRead` fields (`box_count`, `is_background`, `is_reviewed`, `status`) made it fail.
- **Fix:** Extended the expected key set and asserted `box_count == 0` and `status == "unannotated"` for a fresh upload (this also covers the upload-response requirement).
- **Files modified:** `backend/tests/test_images_api.py`
- **Verification:** `uv run pytest backend/tests -x -q` -> 323 passed
- **Committed in:** 6aee402

### Additions beyond the listed files (Rule 2 - test coverage for a costly-to-reverse contract)

The tracer contract is rated costly in CONTEXT, so tests that pin it were added next to the code: `backend/tests/test_annotations_api.py` (9 tests), `frontend/src/features/editor/store/annotationSaver.test.ts`, `annotationStore.test.ts` and `lib/geometry.test.ts`. Plan 03-02 deepens the backend contract tests; these do not overlap its migration or concurrency work. One extra i18n key, `canvas.loadFailed`, covers a failed original-image load (en and ru).

---

**Total deviations:** 1 auto-fixed (1 bug in a stale test), plus additive tests and one i18n key.
**Impact on plan:** no scope creep; the added tests protect the tracer contract.

## Issues Encountered

- A first shell command with several heredocs failed to parse and wrote nothing; the files were then created with the Write tool. No state was lost.
- `Konva` computes its content scale as `rect.width / clientWidth`; jsdom reports `clientWidth` 0, giving Infinity. `stubElementSize` therefore stubs `clientWidth`/`clientHeight` as well as `getBoundingClientRect`.

## Tracer feedback gate

Gate was not `blocking-human`, auto mode was off, and `human_verify_mode` is `end-of-phase` with an `<automated>`-only `<verify>`, so the verify block was re-run from the committed tree: smoke test `SMOKE OK`, backend 323 passed, ruff check and format clean, `EditorPage` tests green, `npm run build` and the full Vitest run (201 tests, 31 files) green. Tracer verified end-to-end; there were no expansion tasks left in this plan.

## Known Stubs

None. The left and right editor chrome regions (`#242424` panels) are intentionally empty placeholders filled by Plans 03-03 (tool bar) and 03-06 (class panel, object list); they carry no mock data and do not block this plan's goal.

## Threat Flags

None. All new surface (PUT annotations, GET image detail, new npm packages) is covered by the plan's threat model (T3-01-01 .. T3-01-06, T3-01-SC); the nginx CSP is unchanged (`git diff --quiet -- docker/nginx.conf.template` exits 0).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The save contract, store, registry, saver, geometry and URL helpers are in place for Plans 03-02 to 03-13; their names are the ones listed in the plan's interface section and must not be renamed.
- GPU-path and real-browser checks (large-image zoom, real pointer capture, Firefox/Safari) remain for the end-of-phase checklist in Plan 03-13.

## Self-Check: PASSED

All created files exist on disk, commit `6aee402` is present, `frontend/package.json` and `package-lock.json` are committed, and every acceptance criterion of Task 2 (greps, smoke test, backend tests, ruff, Vitest, build, single lazy konva chunk, unchanged CSP) was re-run and passed.

---
*Phase: 03-box-annotation-editor*
*Completed: 2026-10-04*
