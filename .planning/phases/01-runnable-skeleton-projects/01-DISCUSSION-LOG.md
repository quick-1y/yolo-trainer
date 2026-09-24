# Phase 1: Runnable Skeleton & Projects - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-24
**Phase:** 01-runnable-skeleton-projects
**Areas discussed:** UI language & look, Projects screen, Docker & data storage, Repo layout & hygiene

---

## UI language & look

| Question | Options | Selected |
|----------|---------|----------|
| UI language | i18n EN+RU / English only / Russian only | i18n EN+RU |
| Component kit | Mantine / Ant Design / shadcn+Tailwind / You decide | Mantine |
| Theme | Dark+light by system / Dark only / Light only | Dark only |
| Default language | Browser language / Always EN / Always RU | Browser language |
| API error language | Error codes translated by frontend / English text only | English text only |

## Projects screen

| Question | Options | Selected |
|----------|---------|----------|
| List layout | Cards / Table | Cards |
| Project fields | Name+type+description / Name+type | Name+type+description |
| Name uniqueness | Unique case-insensitive / Duplicates allowed | Unique case-insensitive |
| Delete confirmation | Type name / Simple confirm / Trash (soft delete) | Type name |
| Inside a project | Sidebar shell / Simple page | Sidebar shell |
| Task type editable | Fixed at creation / Editable while empty | Fixed |
| Sort/search | By updated, no search / By date + name search | By updated, no search |

## Docker & data storage

| Question | Options | Selected |
|----------|---------|----------|
| Data location | ./data bind mount / Named volume / Hybrid | ./data bind mount |
| Port/bind | 127.0.0.1:8080 / 0.0.0.0:8080 | 0.0.0.0 at first, then reversed to 127.0.0.1 default after the no-auth follow-up |
| Frontend serving | FastAPI serves SPA / Separate nginx | Separate nginx |
| Images | Local build / GHCR prebuilt | Local build |
| Worker in phase 1 | Real torch image + heartbeat / Empty stub / One image for both | Real torch image + heartbeat |
| GPU variant selection | Override file / Profiles / You decide | Override file |
| Dev workflow | Native + Docker acceptance / Docker-only | Native + Docker acceptance |
| LAN exposure handling | README warning + BIND_ADDR / Reconsider: default 127.0.0.1 | Default 127.0.0.1 |

## Repo layout & hygiene

| Question | Options | Selected |
|----------|---------|----------|
| Layout | backend/+frontend/, scripts in root / scripts in legacy/ | Scripts stay in root |
| Python deps | uv + pyproject + uv.lock / pip + requirements | uv |
| example_ready_dataset images | Ignore + small fixture later / Commit all / Ignore, no fixture | Ignore + small fixture later |
| Code style | English + type hints + ruff / Russian comments | English + type hints + ruff |
| README language | English + README.ru.md / English only / Russian only | English + README.ru.md |
| Frontend tests | Vitest + compose smoke / + Playwright / pytest only | Vitest + compose smoke |

## Claude's Discretion

- i18n library/layout, state management, routing, project ID format, API route shapes, heartbeat mechanism, nginx/Dockerfile specifics, frontend package manager.

## Deferred Ideas

- GHCR prebuilt multi-arch images; light theme; project search; trash/soft delete; Playwright E2E.
