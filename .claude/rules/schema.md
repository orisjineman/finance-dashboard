---
paths:
  - "server/src/types.ts"
  - "client/src/types.ts"
  - "server/src/store.ts"
  - "server/src/defaults.ts"
  - "server/src/app.ts"
  - "client/src/api.ts"
---

# Changing the `DashboardData` schema

Users' existing `data/finance-dashboard.json` files must keep loading after any schema change. Every read goes through `migrate()` in `server/src/store.ts`.

Adding a field or section touches all of:
- `server/src/types.ts` **and** `client/src/types.ts` (duplicated by hand, keep identical shapes)
- `server/src/defaults.ts` — default value
- `migrate()` — nested sections need an explicit `{ ...defaults, ...parsed }` spread at each level, or new nested fields stay `undefined` for old files
- new top-level section only: `SECTIONS` in `server/src/app.ts`, a `save*` in `client/src/api.ts`, and `SAVERS` in `client/src/App.tsx`

Removing or moving a field:
- `delete` it in `migrate()` with a short Korean comment saying why (see `isaPortfolio`, `raisePct`, `riskAccess`)
- if the value moved elsewhere, carry the old value over when the new location is unset (see `loan.ltvPct` → `home.policy.bogeumjari.ltv`)
- add a case to `server/test/store.test.ts` that feeds the old shape through `migrate()`
