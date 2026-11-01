# Phase 05 — UI Review

**Audited:** 2026-10-19
**Baseline:** 05-UI-SPEC.md (approved 2026-10-11)
**Screenshots:** not captured. A server answered on localhost:8080 but both Playwright captures failed; nothing answered on 3000 or 5173. Visual pillars are scored from code and the human UAT record (05-UAT.md, 7/7 pass, including 1024 and 1280 px in en and ru).
**Interaction captures:** off (workflow.ui_interaction_capture is false)

Empty capture directory left behind: `.planning/ui-reviews/05-20261019-094541/` (no files). The `.planning/ui-reviews/.gitignore` gate ran and covers `*.png` and `interaction/`.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | All UI-SPEC keys are used via i18n; no hardcoded JSX copy found in sample grep, but copy was not checked string-by-string against the contract |
| 2. Visuals | 3/4 | Focal-point and hierarchy rules are implemented per spec; no rendered evidence beyond UAT, and the sticky-name and chart-grid behavior is unverified in pixels |
| 3. Color | 3/4 | Zero hex or rgb literals in the training feature; the one-filled-CTA rule cannot be confirmed in code (Mantine `Button` defaults to `filled`) |
| 4. Typography | 4/4 | Sizes are only 12, 14, 16, 26 px; weights only 400 and 600 (`fw={500}`/`{700}` absent) |
| 5. Spacing | 3/4 | One off-scale value (`Divider my={6}` in the chart tooltip); the 200 px plot height is not found in code |
| 6. Experience Design | 3/4 | State coverage is broad (skeletons, reconnect note, 409 alerts, failure categories, resume blocked reasons); open backend review items WR-03 and WR-05 can surface as wrong status or wrong duration in the UI |

**Overall: 19/24**

---

## Top 3 Priority Fixes

1. **Cancel can end as `failed`** — the user cancels, the page shows the failed Alert with "Training process was killed"-style copy and a Resume button, which contradicts the cancelled contract. Source: 05-REVIEW.md WR-03 (final `cancelled`/`interrupted` write not guarded against `OperationalError`), status still `open` in 05-REVIEW-DISPOSITION.md. Fix: guard the terminal write and retry or reconcile it to `cancelled` in the worker.
2. **Live duration and server duration can disagree** — the Duration column and the run page's "Training time" are computed from browser clock plus server `segment_started_at` (05-REVIEW.md WR-05). Fix: compute the live segment from the server clock offset at stream open, or send server "now" with each status frame.
3. **Off-scale spacing in the chart tooltip** — `frontend/src/features/training/progress/ChartTooltip.tsx:103` uses `<Divider my={6} />`, which is not on the 4-multiple scale the contract requires. Fix: change to `my={8}`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

- Source strings are in `training` i18n namespace; CTA labels, empty, error and modal copy match the contract keys (`run.cancel.*`, `run.resume.*`, `list.filteredEmpty.*`, `failure.<code>.*`).
- Positive: the list's glyph-only download control has a localized `aria-label` (`list.downloadAria`, `TrainingPage.tsx:367`), and the sort headers use `list.sortAria` (`TrainingPage.tsx:260`).
- Gap: the audit confirmed key presence, not each en/ru value against the contract tables. `locales.test.ts` covers key parity only.
- Gap: `TrainingPage.tsx:361-370` uses a text glyph `↓` as the ActionIcon content. This is spec-permitted, but it is the only copy in the row, so screen-reader users depend entirely on the `aria-label`.

### Pillar 2: Visuals (3/4)

- Layout order (title row, status card, final results, charts, settings) follows UI-SPEC section order in `RunPage.tsx`.
- Focal point: status card and single filled CTA are structurally present; the chart panels use no accent.
- Breakpoint: chart grid switches on `(min-width: 1200px)` (`progress/RunCharts.tsx:34`), matching the spec.
- Table: the 11-column grid with `min-width: 1272px` and the sticky Name column is in `TrainingPage.module.css`; the sticky behavior and the 1024 px fit were only confirmed by human UAT (item 2), not in code.
- Gap: no rendered screenshot in this audit, so visual balance is scored from code only.

### Pillar 3: Color (3/4)

- No hex or rgb literals in `frontend/src/features/training` (excluding tests). Chart and status colors come from Mantine tokens.
- Chart series colors, accent usage and red reservations follow the UI-SPEC color table by inspection.
- Gap: the spec limits the filled (accent) CTA to one per screen. Mantine `Button` defaults to `variant="filled"`, so any button without an explicit variant is an extra filled CTA. The code does not make this explicit everywhere, and the one-filled-CTA count per status was not audited exhaustively.

### Pillar 4: Typography (4/4)

- `fz` values used: 12, 14, 16, 26 only. `size="xs"`/`"sm"` occurrences are Mantine component size props, not spacing.
- `fw` values used: 400 and 600 only, across all files (grep checked every `fw=` and `fontWeight:`).
- Monospace limited to the failure log `Code` block, per the spec.

### Pillar 5: Spacing (3/4)

- Confirmed fixed: `RunPage.tsx` no longer uses `gap="sm"`; spacing uses numeric scale values (`gap={8}`, `{16}`, `{24}`), as the carried-review item required.
- Off-scale: `frontend/src/features/training/progress/ChartTooltip.tsx:103` `Divider my={6}` (not a multiple of 4; spec scale is 4, 8, 16, 24, 32, 48, 64).
- Not located: the spec's chart plot area of 200 px high. `ResponsiveContainer` sizing was not found in code with a literal 200 pattern. Treat as unverified rather than failing.
- Fixed sizes that are component sizes (`height={36}`, `width={40}` in `progress/RunCharts.tsx`) are permitted by the spec's exceptions list only if they are control sizes; they were not traced further.

### Pillar 6: Experience Design (3/4)

Covered and verified in code:
- Loading: 308 px chart skeletons (`RunCharts.tsx:43`), three 48 px list skeleton rows.
- Stream: reconnect line and yellow `role="status"` unavailable Alert with retry (`RunCharts.tsx:280`).
- Resume: disabled with visible reason and `aria-describedby` (`ResumeButton.tsx:57`, `ResumeInfo.tsx`); submit guard.
- Failure: category-keyed titles, original message, collapsed log.
- Modals: cancel and delete confirmations with safe default focus, as spec.
- Progress: `role="progressbar"` with `aria-live="off"` (`BatchProgress.tsx:27`, `RunPage.tsx:498`).
- Sort headers: `aria-sort` on columns (`TrainingPage.tsx:256`).

Deductions:
- WR-03 (05-REVIEW.md): a cancel can be written as `failed`. The UI then shows failure copy and a Resume offer for an intentional stop. Open in the disposition file.
- WR-05: browser-clock duration can drift from server duration on the Duration column and the live timer.
- WR-01 (project delete removes a base model used by another project's queued run) is user-accepted as a known limitation (05-UAT.md item 6) and is not scored against the UI.

---

## Files Audited

- `.planning/phases/05-live-training-monitoring-control/05-UI-SPEC.md`
- `.planning/phases/05-live-training-monitoring-control/05-UAT.md`
- `.planning/phases/05-live-training-monitoring-control/05-REVIEW.md`
- `.planning/phases/05-live-training-monitoring-control/05-REVIEW-DISPOSITION.md`
- `frontend/src/features/training/*.tsx` (RunPage, TrainingPage, RunCharts, ChartTooltip, BatchProgress, ResumeButton, ResumeInfo, FailureAlert, FinalResultsCard, CancelRunModal, DeleteRunModal, RunStatusBadge)
- `frontend/src/features/training/TrainingPage.module.css`
- `frontend/src/i18n/locales/{en,ru}/`
- Plan and summary files 05-01 to 05-10 were in scope but were not re-read line by line; findings rest on the UI-SPEC and the source.
