# Wheel Strategy Dashboard

A full-stack options wheel strategy screener and portfolio tracker. Users sign in with Clerk (email / Google / Apple), and each user gets their own private workspace — settings, positions, holdings, scan history, and AI features are all isolated per user.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/web run dev` — run the web frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`
- Optional env: `QUIVER_API_KEY` (enables the Quiver alt-data signals in the candidate drawer; feature is hidden when unset), `MARKET_PROVIDER=polygon` + `POLYGON_API_KEY` (live quotes)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + Clerk (`@clerk/express`) for auth
- Web: React + Vite + Clerk (`@clerk/react`) for auth
- DB: PostgreSQL + Drizzle ORM — all tables scoped by `user_id`
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)

## Authentication (Clerk)

- **Replit-managed Clerk** — keys provisioned automatically via `setupClerkWhitelabelAuth()`
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` are auto-set
- Dev uses `pk_test_*` keys (expected — Clerk's "development keys" warning in the console is normal)
- The Clerk proxy is mounted at `/api/__clerk` so Clerk JS loads through the same origin as the API
- Every API route is protected via `requireUser` middleware (`middlewares/auth.ts`); user ID is extracted with `getUserId(req)`
- Cookie-based auth for web — no `getToken()` / Bearer headers needed in the browser

## Where things live

- `artifacts/api-server/src/` — Express API server
  - `middlewares/auth.ts` — `requireUser` / `getUserId`
  - `middlewares/tier.ts` — `requireCapability(cap)` for gated features
  - `lib/tierStore.ts` — per-user tier read/write (settings table)
  - `lib/settingsStore.ts` — per-user screener settings
  - `lib/scanRunner.ts` — per-user scan cache
  - `routes/` — all routes scoped by `userId`
- `artifacts/web/src/` — React + Vite frontend
  - `App.tsx` — `ClerkProvider`, routing, sign-in/sign-up pages
  - `components/app-shell.tsx` — authenticated shell, `useUser` / `useClerk`
  - `pages/` — feature pages (all protected via `<Show when="signed-in">`)
- `lib/db/src/schema/` — Drizzle schema; every user-facing table has a `user_id` column

## Architecture decisions

- **Per-user isolation**: All DB tables (`settings`, `positions`, `holdings`, `notifications`, `scan_snapshots`, `candidate_explanations`, `qa_conversations`) carry a `user_id` column. Queries always filter by `userId`.
- **Tier gating**: Lives in `lib/tiers` (Free / Pro / Ultra). Server middleware `requireCapability(cap)` returns `403 { code: "tier_required", required, current, capability }`. The web side uses `useCapability()` / `<GatedFeature capability="…">` to render an inline upgrade prompt. The current tier is stored on the per-user `settings` row (`settings.tier`).
- **No billing yet**: Users self-select their tier from Settings → Plan. The tier switcher is always visible (not dev-only). Stripe billing will be added in a follow-up task; the `/tier` endpoints and capability map will not need to change.
- **Scan scheduler**: With multi-user auth, there's no system-level scan user. Scans are user-triggered only via `POST /api/scan`. The scheduler is a no-op stub.

## User preferences

- Keep existing code structure; don't rewrite from scratch
- All secrets managed via Replit environment variables — never hardcoded

## Gotchas

- The Clerk proxy middleware must come before body parsers in `app.ts` (it streams raw bytes)
- `getUserId(req)` throws if called on an unauthenticated request — only call it inside routes protected by `requireUser`
- DB migration: `pnpm --filter @workspace/db run push-force` requires interactive prompts; use `executeSql` directly for non-interactive schema changes
- `publishableKeyFromHost` is imported from `@clerk/react/internal` on the frontend (not `@clerk/shared/keys`)
