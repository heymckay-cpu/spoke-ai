# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Tier gating lives in `lib/tiers` (Free / Pro / Ultra). Server middleware
  `requireCapability(cap)` returns `403 { code: "tier_required", required, current, capability }`. The web side uses `useCapability()` /
  `<GatedFeature capability="…">` to render an inline upgrade prompt instead
  of breaking the layout. The current tier is stored on the singleton
  `settings` row (`settings.tier`); defaults to `ultra` in dev and `free` in
  production. **Billing is not yet wired up** — the dev-only switcher in
  Settings → Plan flips the tier locally so gated features can be tested
  end-to-end. Replace with Stripe in a future task; the `/tier` endpoints
  and capability map will not need to change.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
