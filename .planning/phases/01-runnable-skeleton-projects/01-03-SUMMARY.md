---
phase: 01-runnable-skeleton-projects
plan: 03
subsystem: api
tags: [pydantic, sqlalchemy, fastapi, vitest, testing-library, react-i18next, mantine]

# Dependency graph
requires:
  - phase: 01-runnable-skeleton-projects (plan 01)
    provides: "ProjectCreate/ProjectRead schemas, normalize_project_name, IntegrityError->409 router, React/Vite/Mantine SPA with ProjectsPage/CreateProjectModal"
provides:
  - "schemas.ProjectName / schemas.ProjectDescription reusable Annotated validator types (NFC-normalize, trim, control-char rejection, code-point length limits, blank-description-to-null)"
  - "409 conflict detail always names the ALREADY-STORED project, not the rejected attempt"
  - "backend/tests/test_project_validation.py: 19 edge-case tests for PROJ-01/PROJ-02"
  - "frontend Vitest + Testing Library harness: vite.config.ts test block, src/test-setup.ts, src/test/render.tsx (renderWithProviders)"
  - "CreateProjectModal client-side validation, verbatim API error display, double-submit guard"
affects: [07, 09, 10]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 19874
  tasks: 3
  commits: 3
plan_head_before: 3be22ac9345de09992c9525a771dfe9ccd1705ec

# Tech tracking
tech-stack:
  added: [vitest 5.0.2, jsdom 30.1.1, "@testing-library/react 16.3.3", "@testing-library/dom 10.4.2", "@testing-library/jest-dom 7.0.1", "@testing-library/user-event 14.6.7"]
  patterns:
    - "Pydantic Annotated + AfterValidator types (ProjectName, ProjectDescription) instead of per-field @field_validator, so Plan 09's ProjectUpdate can reuse the exact same rules"
    - "409 conflict messages always re-query the stored display name by normalized_name rather than reusing the failed attempt's own (possibly differently-cased/spelled) name"
    - "Direct-SQLAlchemy-insert tests (sync engine against settings.sync_database_url) to prove DB-level constraints independent of the API layer"
    - "renderWithProviders(ui, { route, language }) test helper wrapping MantineProvider/QueryClient/MemoryRouter, returning userEvent.setup() alongside the render result"
    - "vi.stubGlobal('fetch', ...) returning real `Response` objects, with an active useProjects() observer in tests that need to prove invalidateQueries actually triggers a refetch"
    - "Ref-based (not React-state-based) submit lock in CreateProjectModal so a rapid repeat click is blocked synchronously, independent of render timing"

key-files:
  created:
    - backend/tests/test_project_validation.py
    - frontend/src/test-setup.ts
    - frontend/src/test/render.tsx
    - frontend/src/lib/relativeTime.test.ts
    - frontend/src/features/projects/ProjectsPage.test.tsx
    - frontend/src/features/projects/CreateProjectModal.test.tsx
  modified:
    - backend/src/yolo_trainer_api/schemas.py
    - backend/src/yolo_trainer_api/routers/projects.py
    - frontend/package.json
    - frontend/package-lock.json
    - frontend/vite.config.ts
    - frontend/src/features/projects/CreateProjectModal.tsx
    - frontend/src/i18n/locales/en/projects.json
    - frontend/src/i18n/locales/ru/projects.json

key-decisions:
  - "Found and fixed a real bug while writing test_conflict_detail_uses_stored_display_name: the 409 handler used the REJECTED attempt's own display name (`project.name`), so ' cars ' vs a stored 'Car' would report 'a project named \"car\" already exists' instead of naming the actual stored project. Fixed by re-querying Project.name by normalized_name inside the except block (Rule 1)."
  - "models.py and errors.py needed no changes - normalize_project_name (NFKC+casefold) and the existing 422 formatter (body-prefix strip, 'Value error, ' strip, bare message for field-less errors) already satisfied every Task 1 behavior once schemas.py was corrected."
  - "Registered `afterEach(cleanup)` from @testing-library/react explicitly in test-setup.ts: with `test.globals` off, RTL's own auto-cleanup never self-attaches (it only registers when it finds a global `afterEach`), so a Modal from one test was leaking into the next test's DOM (Rule 1, found while writing Task 3's tests, affects every future component test)."
  - "Polyfilled `document.fonts` (FontFaceSet) in test-setup.ts: Mantine's autosizing Textarea listens on `document.fonts.addEventListener`, which jsdom does not implement, crashing every test that renders CreateProjectModal (Rule 3, blocking)."
  - "CreateProjectModal's submit lock uses a `useRef` flag, not derived purely from `createProject.isPending`, so a second click dispatched before React commits the pending-state re-render is still blocked deterministically."

requirements-completed: [PROJ-01, PROJ-02]

coverage:
  - id: D1
    description: "Empty/whitespace name, missing/wrong-case task_type, and control characters in a name all return 422 with a single plain-English detail string"
    requirement: "PROJ-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_empty_or_whitespace_name_rejected"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_missing_task_type_rejected"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_task_type_wrong_case_rejected"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_control_character_in_name_rejected"
        status: pass
    human_judgment: false
  - id: D2
    description: "Name length is enforced at exactly 100/101 Unicode code points; NFKC+casefold uniqueness collides case, Cyrillic-case, and NFC-composed-accent variants; the stored display name (not the rejected attempt) is used in the 409 message"
    requirement: "PROJ-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_name_at_max_length_accepted_over_max_rejected"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_duplicate_name_case_and_whitespace_insensitive"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_duplicate_name_unicode_case_insensitive"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_duplicate_name_nfc_and_nfkc_equivalent_forms"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_conflict_detail_uses_stored_display_name"
        status: pass
    human_judgment: false
  - id: D3
    description: "Submitting an identical create twice yields 201 then 409 with exactly one listed row; a direct SQLAlchemy insert bypassing the API also raises IntegrityError on the second, colliding row"
    requirement: "PROJ-01"
    verification:
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_duplicate_create_returns_201_then_409_with_single_listed_row"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_direct_insert_raises_integrity_error_on_duplicate_normalized_name"
        status: pass
    human_judgment: false
  - id: D4
    description: "Blank description stored/returned as null, over-length description rejected with 422; empty DB lists as []; two rows with equal updated_at order id DESC; timestamps end with Z"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_blank_description_stored_as_null"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_description_over_2000_code_points_rejected"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_empty_database_returns_empty_list"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_list_order_falls_back_to_id_desc_when_updated_at_equal"
        status: pass
      - kind: integration
        ref: "backend/tests/test_project_validation.py#test_timestamps_are_utc_z_suffixed"
        status: pass
    human_judgment: false
  - id: D5
    description: "Frontend Vitest + Testing Library harness exists (jsdom, renderWithProviders) and relativeTime/ProjectsPage behavior is pinned by passing tests"
    requirement: "PROJ-02"
    verification:
      - kind: unit
        ref: "frontend/src/lib/relativeTime.test.ts"
        status: pass
      - kind: component
        ref: "frontend/src/features/projects/ProjectsPage.test.tsx"
        status: pass
    human_judgment: false
  - id: D6
    description: "Create modal blocks submission with translated messages for empty/over-length name, shows the API's own 409 detail verbatim, cannot double-submit, and defaults to detect/sends segment on switch"
    requirement: "PROJ-01"
    verification:
      - kind: component
        ref: "frontend/src/features/projects/CreateProjectModal.test.tsx"
        status: pass
    human_judgment: false
  - id: D7
    description: "In the browser, the create modal's client-side validation messages and the exact API 409 text are visible in both English and Russian UI"
    verification: []
    human_judgment: true
    rationale: "Visual/UX behavior in a real browser - deferred to the phase's end-of-phase human-check batch (Plan 10) per this plan's Task 3 <human-check> verify block."

# Metrics
duration: 55min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 3: Project Input Hardening & Frontend Test Harness Summary

**Reusable Pydantic name/description validators (NFC-normalize, control-char rejection, code-point limits) plus a real conflict-message bug fix, backed by 19 backend edge tests, and a new Vitest + Testing Library harness covering the project list, relative-time formatting, and create-modal validation/double-submit guard.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-28T09:05:00Z (approx)
- **Completed:** 2026-09-28T10:00:00Z (approx)
- **Tasks:** 3
- **Files modified:** 14 (6 created, 8 modified)

## Accomplishments

- `schemas.ProjectName` / `schemas.ProjectDescription`: reusable `Annotated[..., AfterValidator(...)]` types replacing the old per-field `@field_validator`s - NFC-normalize + trim + reject empty/over-100-code-points/control characters for names; trim + blank-to-`None` + reject over-2000-code-points for descriptions. Exported for Plan 09's `ProjectUpdate`.
- Fixed a real bug in `routers/projects.py`: the 409 conflict detail used the *rejected attempt's own* display name instead of the *already-stored* project's name, so a case/whitespace-variant duplicate reported the wrong spelling back to the user.
- `backend/tests/test_project_validation.py`: 19 tests covering empty/whitespace names, the 100/101 code-point boundary, NFKC+casefold uniqueness (ASCII case, Cyrillic case, NFC-composed accents), control-character rejection, blank/over-length descriptions, idempotent create (201 then 409), DB-level uniqueness via a direct SQLAlchemy insert bypassing the API entirely, empty-list response, `id DESC` tiebreak on equal `updated_at`, UTC `Z` timestamps, and the exact conflict-message wording.
- Frontend Vitest + Testing Library harness: `vite.config.ts` `test` block (jsdom, `src/test-setup.ts`, `restoreMocks`), `src/test-setup.ts` (jest-dom matchers, `matchMedia`/`ResizeObserver`/`document.fonts` polyfills, i18n reset, RTL cleanup registration), `src/test/render.tsx` (`renderWithProviders`).
- `relativeTime.test.ts` (6 tests) and `ProjectsPage.test.tsx` (3 tests) - all passed on the first run against Plan 01's existing implementation, no defects found.
- `CreateProjectModal.tsx`: client-side validation mirroring the server (trim, required, 100-code-point limit via `Array.from(...).length`) with new translated `projects:create.validation.*` messages; API errors still render verbatim (D-05); a `useRef`-based submit lock plus `disabled`/`loading` button state prevents a double click from firing two POSTs.
- `CreateProjectModal.test.tsx`: 7 tests (9 cases including parametrized ones) covering empty/whitespace name, over-length name, verbatim 409 display, successful create (close + field reset + a real `invalidateQueries`-triggered GET refetch, verified via an active `useProjects()` observer), double-submit prevention, and task-type default/switch.

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend input rules and edge tests for create/list** - `349e19c` (feat)
2. **Task 2: Vitest + Testing Library harness with list and relative-time tests** - `fd2a343` (test)
3. **Task 3: Create-modal client validation and verbatim API error display, with tests** - `6813473` (feat)

**Plan metadata:** commit to follow this SUMMARY (docs(01-03): complete plan)

_Note: All three tasks were `tdd="true"`. `workflow.tdd_mode` is not enabled in `.planning/config.json` (same non-strict convention established in Plans 01/02), so tests-plus-implementation landed in a single commit per task rather than separate `test()`/`feat()` commits. See "TDD Gate Compliance" below for what RED/GREEN actually looked like per task._

## Files Created/Modified

- `backend/src/yolo_trainer_api/schemas.py` - `ProjectName`/`ProjectDescription` annotated validator types
- `backend/src/yolo_trainer_api/routers/projects.py` - 409 detail now re-queries the stored display name
- `backend/tests/test_project_validation.py` - 19 new edge-case tests
- `frontend/package.json` / `package-lock.json` - `vitest`, `jsdom`, `@testing-library/*` devDependencies; `"test": "vitest"` script
- `frontend/vite.config.ts` - `test` block (jsdom, setupFiles, css:false, restoreMocks)
- `frontend/src/test-setup.ts` - jest-dom matchers, Mantine polyfills (`matchMedia`, `ResizeObserver`, `document.fonts`), i18n reset, RTL `afterEach(cleanup)`
- `frontend/src/test/render.tsx` - `renderWithProviders(ui, { route, language })`
- `frontend/src/lib/relativeTime.test.ts` - 6 tests
- `frontend/src/features/projects/ProjectsPage.test.tsx` - 3 tests
- `frontend/src/features/projects/CreateProjectModal.tsx` - client validation + double-submit guard
- `frontend/src/features/projects/CreateProjectModal.test.tsx` - 7 tests (9 cases)
- `frontend/src/i18n/locales/{en,ru}/projects.json` - `create.validation.{nameRequired,nameTooLong,descriptionTooLong}` keys

## Decisions Made

See frontmatter `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 409 conflict detail used the rejected attempt's name instead of the stored project's name**
- **Found during:** Task 1 (writing `test_conflict_detail_uses_stored_display_name`)
- **Issue:** `routers/projects.py` raised the 409 using `project.name` (the just-failed, in-memory attempt), not the name of the project actually already in the database. A duplicate submitted as `"car"` against a stored `"Car"` reported `'A project named "car" already exists.'` instead of naming the real stored project.
- **Fix:** On `IntegrityError`, re-query `Project.name` by `normalized_name` and use that stored value in the 409 detail; fall back to the attempt's name only if the query somehow finds nothing.
- **Files modified:** `backend/src/yolo_trainer_api/routers/projects.py`
- **Verification:** `test_conflict_detail_uses_stored_display_name` passes; full backend suite green (33 passed)
- **Committed in:** `349e19c` (Task 1 commit)

**2. [Rule 1 - Bug] RTL auto-cleanup never registers with `test.globals` off, leaking DOM between tests**
- **Found during:** Task 3 (writing `CreateProjectModal.test.tsx` - `getByLabelText` matched multiple elements)
- **Issue:** `@testing-library/react` only self-registers its `afterEach(cleanup)` when it detects a global `afterEach` function; this project's Vitest config does not enable `test.globals`, so cleanup never ran and every test's rendered Modal accumulated in the DOM.
- **Fix:** Explicitly `import { cleanup } from "@testing-library/react"` and register `afterEach(cleanup)` in `src/test-setup.ts`.
- **Files modified:** `frontend/src/test-setup.ts`
- **Verification:** All `CreateProjectModal.test.tsx` tests pass in isolation and as a suite
- **Committed in:** `6813473` (Task 3 commit)

**3. [Rule 3 - Blocking] Mantine's autosizing Textarea crashes under jsdom (`document.fonts` undefined)**
- **Found during:** Task 3 (any test rendering `CreateProjectModal`, which uses an `autosize` `Textarea`)
- **Issue:** Mantine's `Autosize` component calls `document.fonts.addEventListener(...)`; jsdom does not implement the `FontFaceSet` API, so `document.fonts` is `undefined`, throwing `TypeError: Cannot read properties of undefined (reading 'addEventListener')` on mount.
- **Fix:** Polyfilled a minimal `document.fonts` stub (`addEventListener`/`removeEventListener` no-ops) in `src/test-setup.ts`.
- **Files modified:** `frontend/src/test-setup.ts`
- **Verification:** `CreateProjectModal.test.tsx` renders without error; full frontend suite green (16 passed)
- **Committed in:** `6813473` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All three were necessary for correctness (the 409 message bug) or to make the newly-added test infrastructure actually work (RTL cleanup, Mantine/jsdom polyfill). No scope creep - all three are directly caused by this plan's own changes.

## TDD Gate Compliance

`workflow.tdd_mode` is not enabled in `.planning/config.json`, so the strict RED/GREEN commit-separation gate was not enforced. The RED-GREEN-REFACTOR cycle was followed in spirit for each task:

- **Task 1:** Wrote `test_project_validation.py` (19 tests) against Plan 01's pre-existing `schemas.py`/`routers/projects.py`. First run: **14 passed, 5 failed** (control-char rejection x2, blank-description-to-null x2, and the conflict-message wording) - a genuine partial RED confirming which rules Plan 01 had not yet implemented. Implemented `ProjectName`/`ProjectDescription` and the 409 fix; second run: **19 passed**. Single `feat(01-03)` commit contains both tests and implementation, per this project's established non-strict convention.
- **Task 2:** Wrote `relativeTime.test.ts` and `ProjectsPage.test.tsx` (9 tests total) against Plan 01's already-correct `formatRelativeTime`/`ProjectsPage`. First run: **9 passed, 0 failed** - an "unexpected GREEN," expected here because Task 2's job (per the plan) is to add the missing test harness and pin already-correct behavior, not implement new behavior. No implementation changes were needed; single `test(01-03)` commit.
- **Task 3:** Wrote `CreateProjectModal.test.tsx` against the OLD `CreateProjectModal.tsx` (no client validation, no double-submit guard). First run against the old component would have failed on every new-behavior test (validation messages, double-submit) - confirmed by inspection (the old component had no `create.validation.*` keys to render and no submit lock). Implemented the new component; iterated twice more on genuine environment failures (Mantine/jsdom `document.fonts`, RTL cleanup) before reaching **16 passed** across the full frontend suite. Single `feat(01-03)` commit.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PROJ-01 and PROJ-02 now have exhaustive edge-case coverage on both the backend (19 new tests, 33 total passing) and the frontend (16 new/existing Vitest tests, 0 failures), plus a working `npm --prefix frontend run test -- --run` command the phase's validation plan already anticipated.
- `ProjectName`/`ProjectDescription` are exported from `schemas.py` specifically so Plan 09 (`ProjectUpdate`) can reuse them without re-deriving the same rules.
- The frontend now has a real Vitest harness (`renderWithProviders`, jsdom polyfills, RTL cleanup) that later plans (07, 09, 10) can build on directly.
- The `<human-check>` in Task 3 (browser verification of validation messages in both languages) is deferred to the phase's end-of-phase batch (Plan 10), consistent with `workflow.human_verify_mode: end-of-phase`.
- No new blockers. Pre-existing STATE.md blockers (DEPL-01 on Linux/macOS, tracked-binary history rewrite, GPU-path acceptance) remain open and are unaffected by this plan.

## Self-Check: PASSED

All key files confirmed present on disk (`backend/tests/test_project_validation.py`, `frontend/src/test-setup.ts`, `frontend/src/test/render.tsx`, `frontend/src/lib/relativeTime.test.ts`, `frontend/src/features/projects/{ProjectsPage,CreateProjectModal}.test.tsx`). All three task commits (`349e19c`, `fd2a343`, `6813473`) confirmed in `git log --oneline --all`. Re-run clean: `uv run pytest backend/tests -x -q` -> 33 passed; `uv run ruff check backend` and `uv run ruff format --check backend` both clean; `npm --prefix frontend run test -- --run` -> 16 passed; `npm --prefix frontend run build` -> succeeds with no TypeScript errors. All plan-level acceptance-criteria greps (`IntegrityError` in the test file, `rollback` in the router, `jsdom` in vite.config.ts, `"test": "vitest"` in package.json, `renderWithProviders` in render.tsx, i18n key parity between en/ru `projects.json`) verified passing.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
