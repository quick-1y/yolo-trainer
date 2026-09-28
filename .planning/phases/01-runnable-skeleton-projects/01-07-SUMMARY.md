---
phase: 01-runnable-skeleton-projects
plan: 07
subsystem: ui
tags: [i18n, react-i18next, mantine, vitest, testing-library]

# Dependency graph
requires:
  - phase: 01-runnable-skeleton-projects (plan 01)
    provides: "i18n bootstrap (SUPPORTED_LANGUAGES, resolveInitialLanguage, index.ts loading locales via import.meta.glob), AppShell header"
  - phase: 01-runnable-skeleton-projects (plan 03)
    provides: "Vitest + Testing Library harness (renderWithProviders, test-setup.ts)"
provides:
  - "changeAppLanguage(lng) - persists manual choice, updates i18n, syncs document.documentElement.lang"
  - "getStoredLanguage() - try/catch guarded localStorage read, symmetric with the write guard"
  - "LanguageSwitcher component rendered in AppLayout's header"
  - "locales.test.ts - deep en/ru key-parity guard for every namespace, auto-discovers future namespaces via import.meta.glob"
affects: [08, 09, 10]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 3761
  tasks: 2
  commits: 3
plan_head_before: ea66a0f471cad49c3a1ffa94ff53412fa4b2424c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import (not static top-level) used inside changeAppLanguage to consume the i18n singleton from index.ts, avoiding a static circular dependency (index.ts imports resolveInitialLanguage/getStoredLanguage from language.ts at its own top level)"
    - "i18n.on('languageChanged', ...) subscription in index.ts keeps document.documentElement.lang in sync regardless of which code path changed the language, rather than relying solely on the caller to set it"
    - "Component tests that need Outlet-based routing (LanguageSwitcher inside AppLayout's header) render the full AppRoutes tree via renderWithProviders, not the bare layout component, so nested routes actually resolve"

key-files:
  created:
    - frontend/src/i18n/language.test.ts
    - frontend/src/i18n/locales.test.ts
    - frontend/src/components/LanguageSwitcher.tsx
    - frontend/src/components/LanguageSwitcher.test.tsx
  modified:
    - frontend/src/i18n/language.ts
    - frontend/src/i18n/index.ts
    - frontend/src/app/AppLayout.tsx
    - frontend/src/i18n/locales/en/common.json
    - frontend/src/i18n/locales/ru/common.json

key-decisions:
  - "changeAppLanguage imports './index' via a dynamic import inside the function body, not a static top-level import - language.ts and index.ts already have a mutual static dependency (index.ts imports resolveInitialLanguage/getStoredLanguage from language.ts), and adding a second static edge the other direction would create a real circular-init TDZ hazard whenever language.ts loads first in the module graph."
  - "index.ts subscribes to i18n's own 'languageChanged' event to sync document.documentElement.lang, instead of relying only on changeAppLanguage to set it - this keeps the invariant true (D-06) for any future language-change path, not just the header switcher."
  - "app.title stays the identical string 'YOLO Trainer' in both locale files (a brand name, not user-facing prose) - unchanged from Plan 01, confirmed intentional rather than a missed translation; the observable proof of a real language switch is the projects page title (Projects/Проекты), which does differ."
  - "LanguageSwitcher.test.tsx renders <AppRoutes /> (the full router tree), not <AppLayout /> directly - AppLayout's <Outlet /> only resolves when it is actually matched by a parent <Route>, so a bare-AppLayout render always leaves <main> empty regardless of the route string passed to MemoryRouter."

requirements-completed: [PROJ-01, PROJ-02]

coverage:
  - id: D1
    description: "On first visit with nothing stored, UI language is Russian when the browser's primary language starts with 'ru' and English otherwise (or when no language is reported)"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "frontend/src/i18n/language.test.ts#resolveInitialLanguage > falls back to the browser language when nothing is stored"
        status: pass
    human_judgment: false
  - id: D2
    description: "The header switcher changes every visible UI string immediately (no reload), stores the manual choice in localStorage under yolo-trainer.language, and the stored choice wins over browser language after reload"
    requirement: "PROJ-01"
    verification:
      - kind: component
        ref: "frontend/src/components/LanguageSwitcher.test.tsx#switching to Russian then English round-trips both header and page titles and persists each choice"
        status: pass
      - kind: unit
        ref: "frontend/src/i18n/language.test.ts#resolveInitialLanguage > prefers a stored manual choice over the browser language"
        status: pass
    human_judgment: false
  - id: D3
    description: "An unsupported stored value (e.g. 'de') is ignored and detection falls back to the browser rule"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "frontend/src/i18n/language.test.ts#resolveInitialLanguage > ignores an unsupported stored value and falls back to the browser rule"
        status: pass
    human_judgment: false
  - id: D4
    description: "Only a manual switch writes localStorage; automatic detection never persists a value"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "frontend/src/i18n/language.test.ts#initializing i18n without a stored choice > never writes to localStorage during detection"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every translation key (including nested keys) present in any en namespace file exists in the matching ru file and vice versa"
    requirement: "PROJ-02"
    verification:
      - kind: unit
        ref: "frontend/src/i18n/locales.test.ts#locale key parity (en vs ru) > namespace \"common\" has identical keys in en and ru"
        status: pass
      - kind: unit
        ref: "frontend/src/i18n/locales.test.ts#locale key parity (en vs ru) > namespace \"projects\" has identical keys in en and ru"
        status: pass
    human_judgment: false
  - id: D6
    description: "document.documentElement.lang always equals the active UI language"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "frontend/src/i18n/language.test.ts#changeAppLanguage > persists the manual choice, updates i18n, and syncs document.documentElement.lang"
        status: pass
    human_judgment: false
  - id: D7
    description: "localStorage access (read at init and write on manual switch) is resilient to a throwing storage backend - app still renders with the detected language"
    requirement: "PROJ-01"
    verification:
      - kind: unit
        ref: "frontend/src/i18n/language.test.ts#getStoredLanguage > returns null instead of throwing when localStorage access itself throws (T-07-02)"
        status: pass
      - kind: unit
        ref: "frontend/src/i18n/language.test.ts#changeAppLanguage > still changes the active language even if localStorage access throws"
        status: pass
    human_judgment: false
  - id: D8
    description: "In a real browser with the OS/browser language set to Russian, first load shows Russian; switching to English and reloading still shows English"
    verification: []
    human_judgment: true
    rationale: "Real-browser first-load language detection and reload persistence cannot be exercised in jsdom (navigator.languages and a real page reload). Deferred to the phase's end-of-phase human-check batch (Plan 10) per this plan's Task 2 <human-check> verify block and workflow.human_verify_mode: end-of-phase."

# Metrics
duration: 11min
completed: 2026-09-28
status: complete
---

# Phase 1 Plan 7: Bilingual Header Language Switcher Summary

**A header `LanguageSwitcher` that flips the whole UI between English and Russian instantly via `changeAppLanguage`, backed by a deep en/ru key-parity test and browser-language-detection tests, with both localStorage read and write paths made resilient to a throwing storage backend.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-28T11:03:52+03:00 (previous plan's completion commit)
- **Completed:** 2026-09-28T11:14:54+03:00
- **Tasks:** 2
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- `changeAppLanguage(lng)` in `language.ts`: writes `yolo-trainer.language` to localStorage (try/catch guarded), calls `i18n.changeLanguage(lng)`, and sets `document.documentElement.lang` - the single entry point the header switcher (and any future caller) uses to change language.
- `index.ts` now keeps `document.documentElement.lang` in sync on init and on every i18next `languageChanged` event, so the invariant holds regardless of which code path changed the language.
- `locales.test.ts`: deep-compares flattened dotted keys between every `en`/`ru` namespace pair, discovered via the same `import.meta.glob('./locales/*/*.json')` pattern `index.ts` already uses - so Plan 08's new `project` namespace is covered automatically with no test edits.
- `language.test.ts`: covers browser-language fallback (`ru*` -> Russian, else English, including no languages reported), stored-choice precedence, unsupported-stored-value fallback, detection never writing localStorage, and storage-disabled resilience for both the read and write paths.
- `LanguageSwitcher` (Mantine `SegmentedControl`, header, right of the app title): shows "English"/"Русский" autonyms (identical in both locale files by design), marks the active option, has an accessible label from `common:language.label`, and calls `changeAppLanguage` on selection.
- `AppLayout.tsx`: header restructured into a `Group` (title left, switcher right) inside the existing 60px header.
- New `common.json` keys (`language.label`, `language.en`, `language.ru`) added to both locale files, verified in parity by `locales.test.ts`.
- `LanguageSwitcher.test.tsx`: 4 tests proving both options render with active-state marking, switching languages updates the projects page title with no remount, both directions of the switch persist to localStorage, and the accessible label resolves correctly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Language resolution, persistence on manual change, html lang sync, and deep key-parity test** - `da31ffb` (feat)
2. **Task 2: Header LanguageSwitcher that switches the whole UI instantly** - `f3b82ae` (feat)

Plus one deviation fix committed separately:

3. **[Rule 2] Guard the initial localStorage read against throwing storage** - `3e6dff0` (fix)

**Plan metadata:** commit to follow this SUMMARY (docs(01-07): complete plan)

_Note: `workflow.tdd_mode` is not enabled in `.planning/config.json` (same non-strict convention established in Plans 01/03), so each task's failing tests and implementation landed in a single `feat()` commit rather than separate `test()`/`feat()` commits. See "TDD Gate Compliance" below for what RED/GREEN actually looked like per task._

## Files Created/Modified

- `frontend/src/i18n/language.ts` - `changeAppLanguage`, `getStoredLanguage`
- `frontend/src/i18n/language.test.ts` - 9 tests (browser detection, manual persistence, storage resilience)
- `frontend/src/i18n/index.ts` - `document.documentElement.lang` sync on init + `languageChanged`, uses `getStoredLanguage()`
- `frontend/src/i18n/locales.test.ts` - deep en/ru key-parity test for every namespace
- `frontend/src/components/LanguageSwitcher.tsx` - header language switcher
- `frontend/src/components/LanguageSwitcher.test.tsx` - 4 tests
- `frontend/src/app/AppLayout.tsx` - header now a `Group` with title + `LanguageSwitcher`
- `frontend/src/i18n/locales/{en,ru}/common.json` - `language.{label,en,ru}` keys

## Decisions Made

See frontmatter `key-decisions`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Initial localStorage read was not guarded against a throwing storage backend**
- **Found during:** Post-Task-2 review of the plan's own threat model (T-07-02: "try/catch around localStorage access; app still renders with detected language when storage is blocked")
- **Issue:** Only `changeAppLanguage`'s *write* to localStorage was wrapped in try/catch. `index.ts`'s initial-language resolution called `localStorage.getItem(...)` directly at module top level with no guard - a browser/embedding context that throws on ANY `localStorage` access (not just writes, e.g. some sandboxed iframes or strict private-browsing modes) would crash app initialization entirely, defeating the threat model's own stated mitigation.
- **Fix:** Added `getStoredLanguage()` in `language.ts` (try/catch around `getItem`, returns `null` on failure) and switched `index.ts` to use it instead of calling `localStorage.getItem` directly.
- **Files modified:** `frontend/src/i18n/language.ts`, `frontend/src/i18n/index.ts`, `frontend/src/i18n/language.test.ts`
- **Verification:** New tests `getStoredLanguage > returns the stored value when localStorage is readable` and `getStoredLanguage > returns null instead of throwing when localStorage access itself throws (T-07-02)` pass; full frontend suite green (31 passed); build green.
- **Committed in:** `3e6dff0`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary to actually satisfy the plan's own T-07-02 mitigation as written (it said "localStorage access" broadly, not just writes). No scope creep - directly caused by this plan's own new threat-model line item.

## TDD Gate Compliance

`workflow.tdd_mode` is not enabled in `.planning/config.json`, so the strict RED/GREEN commit-separation gate was not enforced. The RED-GREEN-REFACTOR cycle was followed in spirit for each task:

- **Task 1:** Wrote `language.test.ts` and `locales.test.ts` first. First run: **7 passed, 2 failed** - `changeAppLanguage` did not exist yet (`TypeError: changeAppLanguage is not a function`), a genuine RED on the two target tests; `locales.test.ts`'s parity test passed immediately (unexpected GREEN, expected - Plan 01's existing `common.json`/`projects.json` were already in parity, so the guard had nothing to catch yet). Implemented `changeAppLanguage` and the `document.documentElement.lang` sync in `index.ts`; second run: **9 passed**. Single `feat(01-07)` commit.
- **Task 2:** Wrote `LanguageSwitcher.test.tsx` against a not-yet-existing component and the old `AppLayout.tsx` (no switcher). First run against the initial test draft failed for the wrong reason (`<main>` stayed empty because the test rendered bare `<AppLayout />` instead of the routed `<AppRoutes />` tree) - caught and fixed by inspecting the rendered DOM before attributing it to a missing implementation, per the "unrelated tests break - stop and investigate" error-handling rule. After that test fix and implementing `LanguageSwitcher.tsx` + the `AppLayout.tsx` header change: **4 passed**. Single `feat(01-07)` commit.

## Issues Encountered

- Discovered mid-Task-2 that `renderWithProviders(<AppLayout />, { route })` cannot exercise `AppLayout`'s `<Outlet />` at all - `Outlet` only resolves through an actual matched `<Route>`. Fixed by rendering the app's real `<AppRoutes />` tree instead, which is now the established pattern for any future test that needs a page to actually appear inside the layout.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-01/D-02 (bilingual UI, manual switcher, browser-based default, key-parity guard) are fully delivered and regression-proof: any future namespace or key added by Plans 08/09 without its translation counterpart will fail `locales.test.ts` immediately.
- `changeAppLanguage` and `LanguageSwitcher` are the stable public surface later plans (08 onward) should use for anything that needs to react to or trigger a language change - no new i18n primitives should be needed.
- The `<human-check>` in Task 2 (real-browser first-load detection and reload persistence) is deferred to the phase's end-of-phase batch (Plan 10), consistent with `workflow.human_verify_mode: end-of-phase`.
- No new blockers. Pre-existing STATE.md blockers (DEPL-01 on Linux/macOS, GPU-path acceptance, job-crossing-containers design, click-to-segment research) remain open and are unaffected by this plan.

## Self-Check: PASSED

All key files confirmed present on disk (`frontend/src/i18n/language.test.ts`, `frontend/src/i18n/locales.test.ts`, `frontend/src/components/LanguageSwitcher.tsx`, `frontend/src/components/LanguageSwitcher.test.tsx`). All three commits (`da31ffb`, `f3b82ae`, `3e6dff0`) confirmed present in `git log --oneline --all`. Re-run clean: `npm --prefix frontend run test -- --run` -> 31 passed (0 failed); `npm --prefix frontend run build` -> succeeds with no TypeScript errors. All plan-level acceptance-criteria checks re-verified: `grep -c "changeAppLanguage" frontend/src/i18n/language.ts` = 2, `grep -c "languageChanged" frontend/src/i18n/index.ts` = 1, `grep -c "LanguageSwitcher" frontend/src/app/AppLayout.tsx` = 2, `locales.test.ts` still passes with the new `language.*` keys present in both locale files.

---
*Phase: 01-runnable-skeleton-projects*
*Completed: 2026-09-28*
