---
phase: "04"
slug: "train-download"
audited: "2026-10-10"
baseline: "04-UI-SPEC.md (approved)"
screenshots: false
interaction_capture: false
overall_score: 17
max_score: 24
---

# Phase 04 — UI Review (Train & Download)

> Retroactive 6-pillar audit by gsd-ui-auditor, code-only. No dev server was reachable, so no screenshots were taken. Visual pillars (2, 3, 4, 6) are graded from code; a 3 there is a ceiling, not a confirmation.

## Scores

| Pillar | Score | Key finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | i18n complete: en/ru key parity in training (143 keys), images, project; no Latin text left in ru strings. |
| 2. Visuals | 3/4 | 16 `aria-label`s on the touched files; icon-only buttons are labelled. Hierarchy and focus not checked visually. |
| 3. Color | 3/4 | Phase code (`features/training`) has no hex/rgb. Hex literals remain in `features/editor/ZoomOverlay.tsx:21` (`#242424`) and `app/routes.tsx:27` (`#141414`). |
| 4. Typography | 3/4 | Phase code uses weights 400/600 only and sizes xs/sm/md. `fw={500}` remains outside the phase (`ConflictBanner.tsx:31`, `ProjectSettingsPage.tsx:116`). |
| 5. Spacing | 2/4 | Contract rule "no Mantine xs/sm/lg spacing in new code" broken in 4 places; plus the off-scale `gap={12}`. |
| 6. Experience Design | 3/4 | Loading, error and empty states; 3 s run polling; live region on the run page; project delete blocked during training; failed/interrupted/cancelled views all present. Interactive flows not exercised. |

**Overall: 17/24.** No pillar scored 1, so there are no blockers. All findings are warnings.

## Top fixes

1. **Spacing scale.** `gap="sm"` → `gap={8}` in `features/training/RunPage.tsx:80`, `features/images/ImagesPage.tsx:279`, `features/images/ImageGrid.tsx:48`; `gap={12}` → `8` or `16` in `features/images/UploadPanel.tsx:143`.
2. **Theme tokens instead of hex.** `ZoomOverlay.tsx:21` `bg="#242424"` → `var(--mantine-color-dark-7)`; `app/routes.tsx:27` `#141414` → a theme token.
3. **Visual confirmation of numeric contract items.** These need a running app and screenshots at 1440×900 and 1024×640:
   - the ru editor top bar at 1024 px fits without clipping;
   - the failure log block is 320 px high;
   - the split pill on the tile (`top: 152px`) does not overlap the box counter;
   - the name field is hidden in DeleteProjectModal while a run is active.

   These items are also in the phase UAT checklist (04-VALIDATION.md, item 12).

## Other warnings (outside phase scope)

- `fw={500}` in `ConflictBanner.tsx:31` and `ProjectSettingsPage.tsx:116`.
- `c="dimmed"` for small text in `ProjectLayout.tsx:41`, `ProjectOverviewPage.tsx:26,37`, `ProjectNotFound.tsx:15`.
- Mantine named spacing in `ProjectSettingsPage.tsx:119,131` and `ProjectNotFound.tsx:13`.

## Verified against the contract

- `features/training` contains no `c="dimmed"` and no weights other than 400/600. SelectionBar `fw={500}` was changed to 600.
- Modal titles are 16/600 (`AutoSplitDialog.tsx:216`).
- The run page has `role="status"` with `aria-live="polite"` (`RunPage.tsx:190`). The indicator and progress bar use `aria-live="off"` (`ActiveRunIndicator.tsx:76,127`).
- The download is a plain link with `download` to `/api/models/{id}/download`, not fetch+blob (`api/training.ts:299-301`).
- The 1440 px wide mode in the indicator and SplitMenu uses `WIDE_QUERY` (`ActiveRunIndicator.tsx:23`, `EditorTopBar.tsx:21`).
- The failure log is collapsed by default, with `Code` and `CopyButton` (`RunFailureLog.tsx`).
- "Split dataset" is disabled with a tooltip when nothing is unassigned (`ImagesPage.tsx:290`).

## Audit limits

- No screenshots and no interaction capture.
- UI-SPEC lines 449–576 (the "UI Considerations" tail) were not fully read.
- PLAN files were read through grep only.
- The auditor's concern that the start-form tests might not have run is resolved: the post-merge gates ran the full Vitest suite green after every wave (731 passed after wave 6).
