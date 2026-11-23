# Demo Mode Removal Plan & Tracking

## Baseline (Before Removal)

- **Type check (`npm run lint` -> `tsc --noEmit`):** PASS (0 errors)
- **Production build (`npm run build` -> `vite build`):** PASS (2.50 s, 0 warnings)
- **Entry JS chunk (`dist/assets/index-wMWtjlSF.js`):** 168.48 kB (`168,484 B`) raw / 42.00 kB gzip
- **Total `dist/` size:** 2.89 MB (`2,886,281 B`, 116 files)

## Inventory of Demo Mode Traces

### Data Layer (`src/lib/data/`)
- `src/lib/data/logs.ts` — `demoLogsService`, `isDemoMode` branch
- `src/lib/data/rules.ts` — `isDemoMode` guards
- `src/lib/data/credits.ts` — `isDemoMode` guards
- `src/lib/data/storage.ts` — `demoStorageService` (base64 data URLs), `isDemoMode` branch
- `src/lib/data/purses.ts` — `demoPursesService`, `isDemoMode` branch
- `src/lib/data/projector.ts` — `demoProjectorService`, `demoBroadcastChannel` subscription, `isDemoMode` branch
- `src/lib/data/seasons.ts` — `demoSeasonsService`, `isDemoMode` branch
- `src/lib/data/site.ts` — `demoSiteService`, `isDemoMode` branches (preserving live `DEFAULT_CAROUSEL`, `DEFAULT_SETTINGS`, `FALLBACK_CAROUSEL_TEXTS`, and `localStorage` speed/home caches)
- `src/lib/data/athletes.ts` — `demoAthletesService`, `demoBroadcastChannel` subscription, `isDemoMode` branch
- `src/lib/data/teams.ts` — `demoTeamsService`, `demoBroadcastChannel` subscription, `isDemoMode` branch (preserving live `DEFAULT_SPORTS` fallback)
- `src/lib/data/players.ts` — `demoPlayersService`, `demoBroadcastChannel` subscription, `isDemoMode` branch
- `src/lib/data/auction.ts` — `demoAuctionService`, demo queue/bids/sales `localStorage` helpers, `demoBroadcastChannel` subscription, `isDemoMode` branch
- `src/lib/data/registrations.ts` — `DEMO_REG_SETTINGS_KEY`, `DEMO_REGISTRATIONS_KEY`, `getDemoSettings`, `computeDemoPublicConfig`, `isDemoMode` branches
- `src/lib/data/auth.ts` + `src/lib/data/types.ts` — `demoAuthService`, `demoSignIn`
- `src/lib/data/client.ts` + `src/lib/constants.ts` — `isDemoMode`, `demoBroadcastChannel`, `notifyChange`, `getLocal`, `setLocal`, `getNextAthleteCode`, `initializeDemoStore` + seed data, 13 demo-only `STORAGE_KEYS` (preserving `THEME`, `PROJECTOR_THEME`, `ADMIN_SIDEBAR_COLLAPSED`, `DEFAULT_SPORTS`, `FALLBACK_CAROUSEL_TEXTS`, `DEFAULT_CAROUSEL`, `DEFAULT_SETTINGS`)

### Shared Lib & Startup (`src/lib/`, `src/App.tsx`)
- `src/lib/resultsPoller.ts` — `loadDemoResults`, `isDemoMode` branch
- `src/lib/AuthContext.tsx` — `isDemo`, `quickDemoLogin`, `demoSignIn`, non-Supabase fallback
- `src/App.tsx` — startup check rendering full-page error `"Fieldr is not configured: missing Supabase settings"` when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing

### UI Pages & Components
- `src/pages/public/LoginPage.tsx` — `quickDemoLogin`, `isDemo` one-click demo buttons
- `src/pages/admin/AdminLayout.tsx` — `isDemo` badge in top header
- `src/pages/admin/AdminPage.tsx` — `isDemoMode` + demo `STORAGE_KEYS` check in `storage` event listener (preserving `fieldr_seasons_updated_at` cross-tab sync)
- `src/pages/admin/AdminTeams.tsx` — `isDemoMode` write/upload guards
- `src/components/admin/CreditsSetupCard.tsx` — `isDemoMode` guards & "Read-only in demo mode" badge
- `src/components/admin/HandbookSetupCard.tsx` — `isDemoMode` guards
- `src/components/admin/RulesSetupCard.tsx` — `isDemoMode` guards

### Documentation
- `README.md` — Offline Demo Mode section
- `docs/PROJECT_REFERENCE.md` — Section 15 (Demo Mode) and references in Sections 5, 6, 17, 18
- `docs/OPTIMIZATION_REPORT.md` — historical read-only audit report (left untouched)

## Batch Plan (One Module per Batch)

| Batch | Target Module | Status |
|---|---|---|
| 1 | `src/lib/data/logs.ts` | Done |
| 2 | `src/lib/data/rules.ts` | Done |
| 3 | `src/lib/data/credits.ts` | Done |
| 4 | `src/lib/data/storage.ts` | Done |
| 5 | `src/lib/data/purses.ts` | Done |
| 6 | `src/lib/data/projector.ts` | Done |
| 7 | `src/lib/data/seasons.ts` | Done |
| 8 | `src/lib/data/site.ts` | Done |
| 9 | `src/lib/data/athletes.ts` | Done |
| 10 | `src/lib/data/teams.ts` | Done |
| 11 | `src/lib/data/players.ts` | Done |
| 12 | `src/lib/data/auction.ts` | Done |
| 13 | `src/lib/data/registrations.ts` | Done |
| 14 | `src/lib/resultsPoller.ts` | Done |
| 15 | `src/pages/public/LoginPage.tsx` | Done |
| 16 | `src/pages/admin/AdminLayout.tsx` | Done |
| 17 | `src/pages/admin/AdminPage.tsx` | Done |
| 18 | `src/pages/admin/AdminTeams.tsx` | Done |
| 19 | `src/components/admin/CreditsSetupCard.tsx` | Done |
| 20 | `src/components/admin/HandbookSetupCard.tsx` | Done |
| 21 | `src/components/admin/RulesSetupCard.tsx` | Done |
| 22 | `src/lib/AuthContext.tsx` | Done |
| 23 | `src/lib/data/auth.ts` & `src/lib/data/types.ts` | Done |
| 24 | `src/lib/data/client.ts` & `src/lib/constants.ts` | Done |
| 25 | `src/App.tsx` (unconfigured Supabase startup screen) | Done |
| 26 | `README.md` & `docs/PROJECT_REFERENCE.md` | Done |

## After Removal

- **Type check (`npm run lint` -> `tsc --noEmit`):** PASS (0 errors)
- **Production build (`npm run build` -> `vite build`):** PASS (2.47 s, 0 warnings)
- **Lines removed across the 29 edited files:** 3,573 net lines removed (14,957 -> 11,384 lines; 3,592 lines removed across 28 files, +19 lines added in `src/App.tsx` for the unconfigured Supabase startup screen)
- **Entry JS chunk (`dist/assets/index-jHaxLxRp.js`):** 175.79 kB (`175,790 B`) raw / 43.35 kB gzip (175.79 kB / 43.38 kB gzip when built with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`)
- **Total `dist/` size:** 3.14 MB (`3,140,573 B`, 117 files; `3,140,636 B` with Supabase env vars set). Note: the baseline build without Supabase env vars constant-folded `isDemoMode = true`, which tree-shook `vendor-supabase` (216.00 kB) and the live Supabase service implementations out of `dist/`; after removal, the build always includes the live Supabase bundle regardless of env vars.
- **Residual `demo` grep across `src/`, `README.md`, `docs/PROJECT_REFERENCE.md`:** 0 matches

## Needs Decision

- `blobToDataUrl` in `src/lib/imageCompression.ts`: Previously imported only by Demo Mode branches in `src/lib/data/storage.ts` and `src/lib/data/registrations.ts`; now has zero callers in `src/`. Left in place because it is a generic image utility helper rather than explicitly demo-only.
- `docs/OPTIMIZATION_REPORT.md` (finding `F-019`): Still references Demo Mode as a historical read-only audit snapshot; left untouched.
- `DEFAULT_SETTINGS.auction_timing` (`window_duration_seconds: 60`) in `src/lib/data/client.ts`: Preserved inside `DEFAULT_SETTINGS` used by `src/lib/data/site.ts` because it is part of the live `SiteSettings` fallback type rather than clearly demo-only.
