---
phase: 01-runnable-skeleton-projects
plan: 08
subsystem: ui
tags: [fastapi, react-router, react-query, i18next, mantine, vitest]

# Dependency graph
requires:
  - phase: 01-03
    provides: "projects router (list/create), ProjectRead schema, get_session dependency, Vitest renderWithProviders helper, i18n auto-discovered namespaces"
provides:
  - "GET /api/projects/{project_id} with a shared get_project_or_404(session, project_id) helper"
  - "useProject(id) query hook and projectKeys.detail(id)"
  - "per-project shell: /projects/:projectId route -> ProjectLayout (back link + Overview-only nav) -> index ProjectOverviewPage"
  - "ProjectCard as a router Link into the project shell"
  - "translated not-found states: ProjectNotFound (invalid id / 404) and NotFoundPage (unknown route, registered as the * catch-all)"
  - "new project i18n namespace (en/ru): nav, overview, notFound, pageNotFound"
affects: ["01-09 (Settings, appends to ProjectLayout's SECTIONS array)", "Phase 2-5 (Images, Classes, Training, Models all extend the same sidebar shell)"]

actuals:
  tokens: 5124
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "ProjectLayout SECTIONS array of {key, to, labelKey} — later plans append entries instead of hardcoding nav links (D-11)"
    - "useProject(id: number | null) disabled-query pattern for a route param that may not be resolvable yet"
    - "ApiError.status branching in a route-level component to route 404 to a dedicated not-found view vs. a generic error alert (D-05)"

key-files:
  created:
    - backend/src/yolo_trainer_api/routers/projects.py (GET /{project_id} + get_project_or_404, modified not created)
    - frontend/src/features/project/ProjectLayout.tsx
    - frontend/src/features/project/ProjectOverviewPage.tsx
    - frontend/src/features/project/ProjectOverviewPage.test.tsx
    - frontend/src/features/project/ProjectNotFound.tsx
    - frontend/src/features/NotFoundPage.tsx
    - frontend/src/features/NotFound.test.tsx
    - frontend/src/i18n/locales/en/project.json
    - frontend/src/i18n/locales/ru/project.json
  modified:
    - backend/tests/test_projects_api.py
    - frontend/src/api/projects.ts
    - frontend/src/app/routes.tsx
    - frontend/src/features/projects/ProjectCard.tsx

key-decisions:
  - "pageNotFound.* keys were added to the project namespace (alongside notFound.*) specifically for the generic catch-all page, avoiding any edit to Plan 07's common namespace files per the plan's interface note."
  - "NotFoundPage and ProjectNotFound share the project:notFound.back link label instead of introducing a second near-duplicate key."

requirements-completed: [PROJ-02]

coverage:
  - id: D1
    description: "GET /api/projects/{project_id} returns 200 for an existing project, 404 with 'Project not found.' for an unknown id, 422 for a non-integer id"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "backend/tests/test_projects_api.py"
        status: pass
    human_judgment: false
  - id: D2
    description: "Clicking a project card opens /projects/:projectId showing the sidebar shell (back link + Overview only, D-11) and the Overview content (name, badge, description/no-description hint, formatted date, empty-state hint)"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "frontend/src/features/project/ProjectOverviewPage.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Missing/deleted project ids, invalid ids, and unknown routes all degrade to a translated not-found state with a link back to /projects; a non-404 failure shows the generic error state instead"
    requirement: "PROJ-02"
    verification:
      - kind: integration
        ref: "frontend/src/features/NotFound.test.tsx"
        status: pass
    human_judgment: false
  - id: D4
    description: "Reloading /projects/:id in the actual compose stack (nginx SPA fallback) works, and both languages render correctly end-to-end"
    human_judgment: true
    rationale: "Requires the running compose stack and visual inspection in both languages — deferred to the Plan 10 end-of-phase UAT batch per the plan's <human-check> note."

duration: 35min
completed: 2026-09-28
status: complete
---

# Phase 01 Plan 08: Open a Project Summary

**GET /api/projects/{project_id}, a per-project sidebar shell (back link + Overview-only nav) reachable from the card grid, and translated not-found states for missing projects and unknown routes.**

## Performance

- **Duration:** ~35 min (continuation agent; original executor completed Task 1 before being cut off)
- **Started:** 2026-09-28 (Task 1, prior session) / resumed same day for Tasks 2-3
- **Completed:** 2026-09-28
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- `GET /api/projects/{project_id}` returns the project (200), 404 with `"Project not found."` for unknown ids, and 422 for non-integer ids, via a shared `get_project_or_404` helper Plan 09's PATCH/DELETE will reuse
- A user can click any project card and land in a per-project shell: a left sidebar with a "← Projects" back link and a single active "Overview" entry (no links to unbuilt sections, D-11), and the Overview panel showing name, task-type badge, description (or a translated hint), an Intl-formatted created date, and an empty-state hint
- Stale links, deleted projects, invalid ids, and unknown routes all degrade to a clear, translated not-found screen with a way back to `/projects`, instead of a crash, infinite spinner, or blank page; a genuine 500 still shows the generic error state with the API's own detail text

## Task Commits

Each task was committed atomically:

1. **Task 1: GET /api/projects/{project_id} with 404 for unknown ids** - `9419dae` (feat)
2. **Task 2: Project shell (sidebar with back link + Overview) and Overview page** - `08d17b2` (feat)
3. **Task 3: Not-found states for missing/deleted projects and unknown routes** - `1279e6f` (feat)

**Plan metadata:** (this commit)

_Note: tasks carried `tdd="true"` (tests-first within the task), but this plan is `type: execute`, not `type: tdd` — each task lands as a single atomic commit containing its tests and implementation together, matching Task 1's precedent (`9419dae`), not the separate test()/feat() commit split used by dedicated `type: tdd` plans._

## Files Created/Modified
- `backend/src/yolo_trainer_api/routers/projects.py` - `GET /{project_id}` route + `get_project_or_404` helper
- `backend/tests/test_projects_api.py` - 3 new tests (found-by-id, 404, 422)
- `frontend/src/api/projects.ts` - `projectKeys.detail(id)`, `useProject(id)`
- `frontend/src/app/routes.tsx` - nested `/projects/:projectId` route, `*` catch-all route
- `frontend/src/features/projects/ProjectCard.tsx` - whole card is now a router `Link` to `/projects/:id`
- `frontend/src/features/project/ProjectLayout.tsx` - sidebar shell, id validation, 404 vs. generic-error branching
- `frontend/src/features/project/ProjectOverviewPage.tsx` - Overview section content
- `frontend/src/features/project/ProjectOverviewPage.test.tsx` - 4 tests
- `frontend/src/features/project/ProjectNotFound.tsx` - not-found view for invalid id / 404
- `frontend/src/features/NotFoundPage.tsx` - generic catch-all page
- `frontend/src/features/NotFound.test.tsx` - 4 tests
- `frontend/src/i18n/locales/en/project.json`, `frontend/src/i18n/locales/ru/project.json` - new `project` namespace

## Decisions Made
- Added `pageNotFound.*` keys to the `project` namespace (rather than `common`) so the generic 404 page's copy doesn't require touching Plan 07's `common` locale files, per the plan's interface note.
- `NotFoundPage` and `ProjectNotFound` both reuse `project:notFound.back` for their "back to projects" link label instead of adding a duplicate key.

## Deviations from Plan

None - plan executed exactly as written. The only notable point is documented above: tasks used single atomic commits (tests + implementation together) rather than a strict RED/GREEN commit split, consistent with how Task 1 was already committed before this continuation began, and correct for a `type: execute` plan (the stricter split is a `type: tdd` plan requirement).

## Issues Encountered

The prior executor session was cut off by an API usage limit mid-Task 2, leaving Task 2's files uncommitted and partially finished (a stray in-progress note about scoping a test's regex check). On resume, the uncommitted work was reviewed file-by-file against the plan:
- `frontend/src/api/projects.ts`, `frontend/src/app/routes.tsx`, `frontend/src/features/projects/ProjectCard.tsx`, `frontend/src/features/project/ProjectLayout.tsx`, `frontend/src/features/project/ProjectOverviewPage.tsx`, `frontend/src/features/project/ProjectOverviewPage.test.tsx`, and both `project.json` locale files were correct and complete for Task 2 (all 4 `ProjectOverviewPage.test.tsx` tests passed, all Task 2 acceptance criteria passed) and were committed as Task 2's commit.
- No Task 3 files existed yet (`ProjectNotFound.tsx`, `NotFoundPage.tsx`, `NotFound.test.tsx` were all absent), so Task 3 was implemented fresh: tests written first, implementation added, all 4 new tests pass, all Task 3 acceptance criteria pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `GET /api/projects/{project_id}`, `useProject`, and the `ProjectLayout` `SECTIONS` array are ready for Plan 09 (Settings) to extend with a new sidebar entry.
- End-of-phase UAT (Plan 10) should verify `/projects/:id` reload under the actual nginx SPA fallback and check both languages visually (D4 above).
- No blockers.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*

## Self-Check: PASSED

All key files found on disk; all 3 task commits (`9419dae`, `08d17b2`, `1279e6f`) found in git log; all task acceptance criteria re-verified passing; `uv run pytest backend/tests -x -q` (66 passed), `npm --prefix frontend run test -- --run` (40 passed), and `npm --prefix frontend run build` (exit 0) all green at SUMMARY time.
