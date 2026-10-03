# Phase 02 - Deferred items

Out-of-scope discoveries logged by executors. Not fixed in the plan that found them.

## 02-09

- `frontend/src/features/images/UploadPanel.test.tsx` > "UploadPanel finished > reveals filename and reason rows and a Copy list button for 2 rejected files" fails with `expect(element).toBeVisible()` on this dev machine (Windows 11). It fails in isolation and reproduces with the 02-09 frontend changes reverted, so it is not caused by 02-09. Likely a timing dependence on the Mantine `Collapse` transition when the rejected-files list is expanded (visibility asserted right after the click). It passed once in a full-suite run earlier in the same session, so it is intermittent. Plan 02-06 owns the test.
- `CreateProjectModal > blocks submission ... over 100 characters` times out (5000 ms) under full-suite load; a following test in the same file then fails as a cascade. Already known to the orchestrator; passes in isolation.
