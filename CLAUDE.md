# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal finance dashboard (Korean UI) that runs locally: Express server + React/Vite client, data persisted to a JSON file on disk.

## Commands

Run from the repo root unless noted.

- `npm run install:all` — install server and client deps (each has its own `package.json`/lockfile)
- `npm run dev` — server (`tsx watch`, port 4300) + client (Vite, port 5173, proxies `/api` → 4300). Use http://localhost:5173
- `npm start` — build both, then serve everything from the server at http://localhost:4300
- `npm run build` — `tsc -b && vite build` for client, `tsc` for server (this is the type check)
- `npm test` — vitest for server then client
- Single test file: `npx vitest run test/store.test.ts` (in `server/`) or `npx vitest run src/rebalance.test.ts` (in `client/`); add `-t "<name>"` to filter by test name
- Lint (client only): `npm run lint --prefix client` (oxlint)
- Windows autostart: `bin/start-windows.ps1` (build + hidden background server, logs in `.finance-dashboard*.log`), `bin/autostart-windows.ps1 [-Uninstall]` registers a Startup-folder shortcut. `bin/finance-dashboard` is the bash equivalent (start/stop/status). Script rules: `.claude/rules/windows-scripts.md`.

## Architecture

**Data model.** All user data is one `DashboardData` object stored in `data/finance-dashboard.json` — real personal data, gitignored, and blocked from Read/Edit in `.claude/settings.json`. Top-level keys are "sections": `rows, simulation, loan, checklist, strategy, history, budget, rebalance, home`. Money amounts are in 만원 unless a field says otherwise.

**Types are duplicated**, not shared: `server/src/types.ts` and `client/src/types.ts` must be kept in sync by hand. Every read runs old data files through `migrate()` in `server/src/store.ts`. Schema-change checklist: `.claude/rules/schema.md`.

**Persistence & concurrency (server).** `store.ts` serializes all writes through an in-process queue (`enqueue`). Each save writes the file and periodically snapshots it into `data/backups/` (max ~one per 10 min, keep latest 30). `data/secrets.json` (public-data API key) and `data/benchmark-cache.json` live alongside but are not backed up. Tests set `FD_DATA_DIR` to a temp dir.

**Save protocol.** `GET /api/data` returns all data plus `_versions` per section. Each section is saved independently via `PUT /api/<section>` with `If-Match`; the server answers 409 if another tab saved first (versions are reset on server restart). The client (`api.ts`) tracks versions and throws `ConflictError`; `App.tsx` holds all state and debounces saves per section (`SAVE_DELAY_MS`).

**Client structure.** `App.tsx` owns the whole `DashboardData` state and passes slices + setters to tab panels in `components/`. Calculation logic lives in plain TS modules in `client/src/` (e.g. `rebalance.ts`, `simulation.ts`, `home.ts`, `tax.ts`, `returns.ts`, `alerts.ts`), each with colocated `*.test.ts`; components should stay presentational. `derive.ts` computes values that depend on multiple inputs (refund estimate, pension credit rate) — screens and alerts read derived values rather than raw inputs. The simulation tab and the overview's home-purchase projection share one growth calculation; don't fork it.

Many inputs are entered once in the "내 정보" (`budget`) tab and reused by other tabs — prefer reading those over adding per-tab duplicates (several past refactors consolidated such duplicates, with `migrate()` dropping the old fields).

**Server extras.** `quotes.ts` (stock prices) and `benchmarks.ts` (index ETF closes, 12h cache) call the data.go.kr API using the key in `secrets.json`. `xlsxImport.ts` parses uploaded xlsx into an import preview. In production the server also serves `client/dist` with an SPA fallback.

**Artifact build.** `import.meta.env.MODE === "artifact"` is a serverless web build (hides the 데이터 tab). Its build files (`scripts/build-artifact.mjs`, `client/src/api.artifact.ts`, `client/vite.config.artifact.ts`) are intentionally gitignored and may not exist in a checkout.

## Conventions

- UI text, code comments, and commit messages are in Korean. Commits use `feat:` / `fix:` / `refactor:` / `docs:` / `chore:` prefixes with a Korean summary. Work is committed directly to `main`.
- UI copy uses a casual tone (반말), e.g. "다른 화면에서 먼저 바뀌었어."
- README's feature tables are kept in sync when tabs/features change.
