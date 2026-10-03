---
phase: "02"
slug: "image-upload-classes"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-03"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser → nginx → api | Uploads, class CRUD, listing, delete requests from the SPA | untrusted image bytes, filenames, JSON bodies, query params (sort/q/cursor) |
| api → filesystem (data/projects) | Staged writes, thumbnails, orphan cleanup, deletions | paths built from integer ids and CHECK-constrained ext only |
| api → SQLite | Image/class rows, keyset paging | ORM-bound parameters, project-scoped queries |
| api → Pillow decoder | Header check + full decode of uploaded files | untrusted image content (pixel bombs, polyglots) |
| build → package registries | pillow, python-multipart, react-virtuoso, @mantine/dropzone | third-party code via committed lockfiles |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T2-01-01 | Tampering | process_image / upload route | high | mitigate | image_processing.py FORMAT_EXT + full decode | closed |
| T2-01-02 | Denial of Service | process_image (decompression bomb) | high | mitigate | image_processing.py MIN_SIDE / max_image_pixels | closed |
| T2-01-03 | Tampering | storage path builders | high | mitigate | clean_filename; test_images_api.py ../../evil.png | closed |
| T2-01-04 | Spoofing (CSRF) | POST /api/projects/{id}/images | high | mitigate | security.py require_xhr; no CORSMiddleware | closed |
| T2-01-05 | Tampering (stored XSS) | ImageTile / filename rendering | medium | mitigate | no dangerouslySetInnerHTML in frontend/src | closed |
| T2-01-06 | Information Disclosure | immutable thumbnail caching | medium | mitigate | 0002_create_images.py sqlite_autoincrement | closed |
| T2-01-07 | Tampering (integrity) | ingest pipeline | medium | mitigate | uq_images_project_sha256 + os.replace | closed |
| T2-01-08 | Denial of Service | disk usage | medium | accept | Accepted Risks Log | closed |
| T2-01-SC | Tampering | pillow, python-multipart, react-virtuoso installs | high | mitigate | Dockerfile.backend uv sync --frozen; npm ci | closed |
| T2-02-01 | Tampering | ClassCreate / ClassUpdate | medium | mitigate | schemas.py extra=forbid + color regex | closed |
| T2-02-02 | Tampering (stored XSS / CSS injection) | ClassRow name and swatch | medium | mitigate | validated #RRGGBB only; React text | closed |
| T2-02-03 | Tampering (integrity) | position assignment | medium | mitigate | unique normalized_name index | closed |
| T2-02-04 | Spoofing (CSRF) | POST /classes | low | mitigate | no CORS middleware; TrustedHostMiddleware | closed |
| T2-02-05 | Denial of Service | unbounded class count | low | accept | Accepted Risks Log | closed |
| T2-03-01 | Denial of Service | process_image (pixel bombs, huge files) | high | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-03-02 | Tampering | corrupt / truncated / polyglot files | high | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-03-03 | Tampering | filename handling | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-03-04 | Tampering (integrity) | duplicate race / project delete race | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-03-05 | Elevation of Privilege | Pillow decoder vulnerabilities | medium | mitigate | pyproject pillow>=12.3,<13 | closed |
| T2-04-01 | Denial of Service | nginx body limits | high | mitigate | nginx.conf.template client_max_body_size 1m / upload location | closed |
| T2-04-02 | Information Disclosure / Tampering | security headers on the new location | high | mitigate | nginx.conf.template nosniff + CSP at server level | closed |
| T2-04-03 | Denial of Service | nginx startup with an unset variable | medium | mitigate | docker-compose.yml ${MAX_UPLOAD_MB:-50} | closed |
| T2-04-04 | Denial of Service | disk fill via many uploads | medium | accept | Accepted Risks Log | closed |
| T2-04-05 | Spoofing (CSRF) | upload route via proxy | high | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-05-01 | Tampering | PATCH/DELETE class by id | medium | mitigate | classes.py get_class_or_404 | closed |
| T2-05-02 | Tampering (integrity) | index shift on delete | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-05-03 | Repudiation / accidental data loss | class delete UI | medium | mitigate | DeleteClassModal data-autofocus on Cancel | closed |
| T2-05-04 | Spoofing (CSRF) | PATCH/DELETE | low | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-06-01 | Denial of Service (client) | upload state with thousands of files | medium | mitigate | UploadPanel.test caps at 100 rows | closed |
| T2-06-02 | Denial of Service (server) | request fan-out | medium | mitigate | UploadContext CONCURRENCY | closed |
| T2-06-03 | Tampering (stored XSS) | rejected list filenames and server reasons | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-06-04 | Spoofing (CSRF) | batched POSTs | high | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-06-05 | Information Disclosure | GET /api/config | low | accept | Accepted Risks Log | closed |
| T2-07-01 | Tampering | dropped non-image files | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-07-02 | Denial of Service (client) | very large folder drops | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-07-03 | Tampering (XSS) | empty/error state text and API messages | low | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-07-SC | Tampering | @mantine/dropzone (+ react-dropzone, file-selector) install | high | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-08-01 | Tampering / Denial of Service (data loss) | reconcile_orphans | high | mitigate | storage.py is_symlink checks / find_orphans | closed |
| T2-08-02 | Tampering (path traversal) | remove_project_dir | high | mitigate | storage.py remove_project_dir | closed |
| T2-08-03 | Denial of Service | startup | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-08-04 | Repudiation | silent deletions | low | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-08-05 | Information Disclosure | image/class counts in project responses | low | accept | Accepted Risks Log | closed |
| T2-09-01 | Tampering (SQL injection / wildcard abuse) | search filter | medium | mitigate | images.py contains(autoescape=True) | closed |
| T2-09-02 | Tampering | cursor decoding | medium | mitigate | images.py 422 Invalid cursor | closed |
| T2-09-03 | Denial of Service | deep paging / large pages | low | mitigate | images.py MAX_PAGE_SIZE = 500 | closed |
| T2-09-04 | Information Disclosure | cross-project listing | medium | mitigate | images.py where project_id == | closed |
| T2-10-01 | Information Disclosure | GET /file | medium | mitigate | images.py id AND project_id lookup | closed |
| T2-10-02 | Tampering (content sniffing / polyglot) | original file delivery | high | mitigate | images.py media_type from EXT_MEDIA[ext] | closed |
| T2-10-03 | Tampering (XSS) | viewer header filename | low | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-11-01 | Tampering | POST /images/delete | high | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-11-02 | Denial of Service | huge id lists | low | mitigate | schemas.py max_length=1000 | closed |
| T2-11-03 | Spoofing (CSRF) | delete route | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-11-04 | Repudiation / accidental data loss | delete UI | medium | mitigate | DeleteImagesModal data-autofocus | closed |
| T2-11-05 | Information Disclosure | id reuse with immutable caches | medium | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-12-01 | Tampering | seed_images.py target | low | mitigate | verified per plan/SUMMARY (tests) | closed |
| T2-12-02 | Denial of Service | disk usage from seeding | low | accept | Accepted Risks Log | closed |
| T2-12-03 | Information Disclosure | smoke data | low | mitigate | verified per plan/SUMMARY (tests) | closed |
| T-02-13-01 | Denial of service | POST /images/delete request size | low | mitigate | images.ts DELETE_BATCH_SIZE sequential | closed |
| T-02-13-02 | Tampering (integrity of displayed state) | useDeleteImages partial failure | medium | mitigate | images.ts pruneDeletedImages on partial failure | closed |
| T-02-13-03 | Denial of service | ImagesPage empty-list next-page effect | medium | mitigate | ImagesPage guarded fetchNextPage effect | closed |
| T-02-13-04 | Elevation of privilege / Tampering | Retry after a partial failure resends already-deleted ids | low | accept | Accepted Risks Log | closed |
| T-02-13-05 | Spoofing (CSRF) | POST /images/delete | low | accept | Accepted Risks Log | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T2-01-08 | Single-operator local tool; per-file cap (MAX_UPLOAD_MB) here, request cap via nginx; no disk quota — documented as an accepted risk in the README by Plan 02-04 | owner (plan-time decision) | 2026-10-03 |
| AR-02 | T2-02-05 | Single-operator local tool; classes are tiny rows; no list virtualization needed below a few hundred | owner (plan-time decision) | 2026-10-03 |
| AR-03 | T2-04-04 | No quota in a single-operator local tool; documented in README (en + ru) as an accepted risk | owner (plan-time decision) | 2026-10-03 |
| AR-04 | T2-06-05 | Exposes only upload limits and accepted extensions, which the UI displays anyway | owner (plan-time decision) | 2026-10-03 |
| AR-05 | T2-08-05 | Single-operator app; counts reveal nothing beyond the operator's own data | owner (plan-time decision) | 2026-10-03 |
| AR-06 | T2-12-02 | ~40 MB for 5000 images; developer-run tool; README notes the size | owner (plan-time decision) | 2026-10-03 |
| AR-07 | T-02-13-04 | delete_images scopes rows to the project and ignores ids that no longer exist (a repeated request deletes nothing), so a retry cannot delete anything outside the user's own selection. The toast then reports only that attempt's count. | owner (plan-time decision) | 2026-10-03 |
| AR-08 | T-02-13-05 | Unchanged by this plan. The route relies on the JSON Content-Type CORS preflight (decision 02-11). Hardening is tracked separately as 02-REVIEW WR-03 and is not part of G-02-5. | owner (plan-time decision) | 2026-10-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-03 | 62 | 62 | 0 | /gsd-secure-phase (L1 grep-level, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-03
