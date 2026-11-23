# Fieldr Codebase Optimization & Audit Report

> **Audit Mode:** Strict read-only inspection of `src/`, `public/`, `index.html`, root configuration files (`package.json`, `vite.config.ts`, `tsconfig.json`, `vercel.json`, `metadata.json`, `.env.example`), `.github/`, `docs/`, and `supabase/`. No source code, config, asset, or database state was modified.

---

## Baseline

| Metric | Result |
|---|---|
| **Type check (`npm run lint` -> `tsc --noEmit`)** | **PASS** (0 errors) |
| **Production build (`npm run build` -> `vite build`)** | **PASS** (2.48 s; emits Vite >500 kB chunk-size warning) |
| **Dependency audit (`bun audit`)** | **PASS** (0 vulnerabilities across 226 packages) |
| **Entry JS chunk (`dist/assets/index-iZSH_L5V.js`)** | **606.70 kB** raw (`606,707 B`) / **175.73 kB** gzip |
| **Entry CSS chunk (`dist/assets/index-BlwrUGp8.css`)** | **95.88 kB** raw (`95,879 B`) / **15.14 kB** gzip |
| **Total build output (`dist/`)** | **4.14 MB** (`4,136,228 B`, `4.0 MB` on disk across 109 files, 90 JS/CSS chunks) |

> **Build environment note:** Because `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are unset in this local workspace, Vite constant-folded `isDemoMode` to `true` and tree-shook `@supabase/supabase-js` out of `index-iZSH_L5V.js`. Production deployments with Supabase env vars configured will have an even larger entry chunk unless vendor chunking is added (see **F-001**).

### Largest 10 Build Chunks (`dist/assets/`)

| # | Chunk | Raw Size | Gzip Size | Notes |
|---|---|---:|---:|---|
| 1 | `index-iZSH_L5V.js` | 606.70 kB (`606,707 B`) | 175.73 kB | Entry bundle (`react`, `react-dom`, `react-router-dom`, `sonner`, `@vercel/*`, `HomePage`, core data modules) |
| 2 | `MarkdownContent-CHhUMDC9.js` | 198.59 kB (`198,590 B`) | 58.07 kB | `react-markdown`, `remark-gfm`, `remark-breaks` (`micromark`/`mdast`/`hast`) |
| 3 | `AdminSetup-DmnFQbLA.js` | 135.37 kB (`135,373 B`) | 24.20 kB | Monolithic 5-tab setup page + 4 embedded setup cards |
| 4 | `react-B8W8x4eE.js` | 128.89 kB (`128,891 B`) | 42.55 kB | `motion/react` animation runtime (lazy-loaded by `NavigationMenu`, `ProjectorPage`, `SecuredSequence`) |
| 5 | `index-BlwrUGp8.css` | 95.88 kB (`95,879 B`) | 15.14 kB | Compiled Tailwind v4 + custom design tokens & utilities |
| 6 | `AdminAuction-DNj_CRqs.js` | 67.51 kB (`67,513 B`) | 12.54 kB | Live Auction Room UI |
| 7 | `SeasonTeamDetailPage-DBUE7fjk.js` | 67.28 kB (`67,278 B`) | 13.98 kB | Public team detail + inline Owner Panel |
| 8 | `AdminAthletes-ZrJCPUQ6.js` | 63.64 kB (`63,641 B`) | 12.49 kB | Universal athletes directory + registrations tab |
| 9 | `ProjectorPage-DSI0oRgd.js` | 62.78 kB (`62,783 B`) | 13.36 kB | Auditorium projector display |
| 10 | `ResultsPage-B1MN3JmY.js` | 60.26 kB (`60,259 B`) | 10.83 kB | Public live results feed & stats |

*(11th overall / 10th JS-only chunk: `AdminPage-DTPtECiv.js` — `57.14 kB` raw / `14.15 kB` gzip.)*

---

## Verification Highlights (Clean Checks Across Audit Areas)

- **No unimported source files:** Every `.ts` and `.tsx` file under `src/` (106 files) is reachable from `src/main.tsx` via static or lazy imports.
- **No public signed-out Realtime channels:** Confirmed across all 12 files in `src/pages/public/`. Public visitors never open any Supabase Realtime WebSocket channel (see **Realtime Subscription Inventory** below).
- **Hidden easter eggs intact:** `src/components/layout/FooterMark.tsx` and its four assets (`fieldr-flame-loop.webp`, `fieldr-flame-loop-light.webp`, `fieldr-flame-still-dark.png`, `fieldr-flame-still-light.png`) are verified active and untouched.
- **No unsafe HTML injection or `eval`:** Zero occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `document.write`, `eval`, or `new Function`. `MarkdownContent` renders through `react-markdown` without `rehype-raw`, blocks `<img>`, and enforces `target="_blank" rel="noopener noreferrer"` on links. Zero `target="_blank"` anchors omit `noopener`.
- **No leaked credentials or PII in repo:** Full-repository scan found zero JWTs, zero private keys, zero real Supabase project URLs, and zero real personal emails. Only 5 benign placeholder/documentation lines matched generic patterns: `.env.example:2`, `.env.example:5`, `docs/PROJECT_REFERENCE.md:643`, `src/lib/data/auth.ts:31`, and `src/pages/public/LoginPage.tsx:111`.
- **Observers & object URLs cleaned up:** All 4 `ResizeObserver` / `IntersectionObserver` instances disconnect on unmount, and all `URL.createObjectURL` calls (`CreditsSetupCard`, `RegisterPage`, `imageCompression`, `seasonBackup`, `shareResultsImage`, `shareSquadImage`, CSV exports) call `URL.revokeObjectURL`.
- **Zero `TODO`/`FIXME`/`HACK`/`XXX` markers, zero commented-out code blocks, and zero `console.log`/`warn`/`debug` calls.**

---

## Findings (Sorted by Impact: High -> Medium -> Low)

### High Impact

#### F-001 — Unsplit 606.70 kB Entry Bundle (No Vendor Chunking)
- **Area:** Performance
- **File path(s):** `vite.config.ts`, `src/App.tsx`, `src/pages/public/HomePage.tsx`, `src/lib/data/client.ts`, `src/lib/data/players.ts`, `src/lib/data/teams.ts`, `src/lib/data/seasons.ts`, `src/lib/data/site.ts`
- **What is wrong:** `vite.config.ts` defines no chunk-splitting strategy, so `react` and `react-dom` (~410 KiB raw), `react-router-dom`, `sonner`, `@vercel/analytics`, `@vercel/speed-insights`, `HomePage`, and four core data modules are merged into a single `index-iZSH_L5V.js` entry chunk. When Supabase environment variables are present in production builds, `@supabase/supabase-js` is also statically pulled into this same entry chunk via `src/lib/data/client.ts`.
- **Evidence:** `vite build` emits a >500 kB chunk warning on `dist/assets/index-iZSH_L5V.js` (`606.70 kB` raw / `175.73 kB` gzip). Byte-range profiling of `index-iZSH_L5V.js` confirms `react`/`react-dom` occupies ~0–410 KiB, `sonner` + router + analytics occupy ~410–490 KiB, and app code occupies ~490–592 KiB.
- **Effect:** Every app code release invalidates the browser cache for ~410+ kB of stable vendor libraries, increasing repeat-visit download and parse time on mobile connections.
- **Risk:** `Low`
- **Impact:** `High`
- **Proposed fix:** Configure explicit vendor chunk splitting in `vite.config.ts` separating `react`/`react-dom`/`react-router-dom` into a stable framework vendor chunk and `@supabase/supabase-js` into its own vendor chunk, while keeping `HomePage` fast to paint.
- **Recommendation:** `Implement now`

---

#### F-002 — Broken PWA Manifest and Apple Touch Icon Paths
- **Area:** Reliability / Assets
- **File path(s):** `index.html:28`, `public/manifest.webmanifest:13,20,26`, `public/images/icons/icon-192.png`, `public/images/icons/icon-512.png`, `public/images/icons/icon-maskable-512.png`
- **What is wrong:** `index.html` links `apple-touch-icon` to `/icons/icon-192.png`, and `public/manifest.webmanifest` declares `/icons/icon-192.png`, `/icons/icon-512.png`, and `/icons/icon-maskable-512.png`. Those files do not exist at `/icons/*`; they live under `public/images/icons/`.
- **Evidence:** Directory listing of `public/` shows icons solely under `public/images/icons/`; `vercel.json` rewrites unknown paths to `/index.html`, so icon fetches return HTML instead of PNGs.
- **Effect:** PWA installation prompts, Android home-screen icons, and iOS "Add to Home Screen" touch icons silently break and fall back to generic icons.
- **Risk:** `Safe`
- **Impact:** `High`
- **Proposed fix:** Update the icon URLs in `index.html` and `public/manifest.webmanifest` to `/images/icons/icon-192.png`, `/images/icons/icon-512.png`, and `/images/icons/icon-maskable-512.png` (or move the icon files to `public/icons/`).
- **Recommendation:** `Implement now`

---

#### F-003 — Overlapping Admin Realtime Subscriptions Triggering Redundant Full-Table Refetches
- **Area:** Data Layer / Performance
- **File path(s):** `src/pages/admin/AdminPage.tsx:265-284`, `src/pages/admin/AdminAuction.tsx:183-237`, `src/lib/data/auction.ts:900-995`, `src/pages/admin/AdminAthletes.tsx:268-279`, `src/lib/data/athletes.ts:765-792`
- **What is wrong:** `AdminPage` always maintains three active Realtime channels (`projector_state_${seasonId}`, `players_${seasonId}`, `teams_${seasonId}`) regardless of which tab is open. When the Auction Room is open, `AdminAuction` opens a fourth channel (`admin_auction_live_${seasonId}`) watching 7 tables—including the same `projector_state`, `players`, and `teams` tables plus unfiltered `auction_bids` and `auction_sales`—and triggers a 7-query `fetchLiveAuctionState()` on every event while `AdminPage`'s channels also re-fetch `getPlayers` and `getTeams`. Similarly, `AdminAthletes` opens `admin_athletes_realtime` watching unfiltered `players` alongside `AdminPage`'s `players_${seasonId}`. Additionally, channel names are static without per-subscriber suffixes, risking teardown collisions if two components ever subscribe with the same topic in one client.
- **Evidence:** Direct inspection of `AdminPage.tsx:269-277`, `AdminAuction.tsx:187-232`, `auction.ts:916-986`, and `athletes.ts:765-785`.
- **Effect:** During live bidding, every bid/sale fires overlapping subscriptions and duplicate full-season queries (`players` + `teams`), multiplying database load and causing unnecessary re-renders across both `AdminPage` and `AdminAuction`.
- **Risk:** `Medium`
- **Impact:** `High`
- **Proposed fix:** Avoid duplicating `players`, `teams`, and `projector_state` subscriptions between `AdminPage` and child tabs (either lift shared live state into `AdminPage` or pause overlapping channels while `AdminAuction` is mounted), add `season_id` filters to `auction_bids` and `auction_sales` if those columns exist, and append unique subscriber IDs to channel names.
- **Recommendation:** `Needs decision` — consolidating shared state between `AdminPage` and `AdminAuction` touches live auction synchronization and should be verified against a rehearsal season.

---

#### F-004 — `HomePage` Queries `public_players` Across All Seasons with a 1,000-Row Cap
- **Area:** Data Layer / Reliability
- **File path(s):** `src/pages/public/HomePage.tsx:280,311-313`, `src/lib/data/players.ts:1395-1436`
- **What is wrong:** `HomePage` calls `getPublicPlayerSportRows()` with no `seasonId` so it can run concurrently with `getActiveSeason()`. Inside `players.ts`, `getPublicPlayerSportRows` selects `(sport, season_id)` from `public_players` with `.limit(1000)` and no `season_id` filter or ordering.
- **Evidence:** `HomePage.tsx:280` calls `getPublicPlayerSportRows()`; `players.ts:1411-1418` applies `.limit(1000)` unconditionally and only filters `.eq('season_id', seasonId)` when `seasonId` is supplied.
- **Effect:** As seasons accumulate past 1,000 total rows in `public_players`, PostgREST truncates results arbitrarily across seasons, causing the public Home page sport counts and total athlete count to silently under-report or drop to zero.
- **Risk:** `Low`
- **Impact:** `High`
- **Proposed fix:** Pass `activeSeason.id` (from cache when warm, or immediately after `getActiveSeason()` resolves on cold load) into `getPublicPlayerSportRows(seasonId)`, or aggregate counts per sport server-side so historical seasons never crowd out the active season.
- **Recommendation:** `Implement now`

---

#### F-005 — Repository SQL Scripts Severely Out of Sync with Live App & Contain Unsafe `SECURITY DEFINER` RPCs / Broad Policies
- **Area:** Database Notes / Security Hygiene
- **File path(s):** `supabase/schema.sql:33,108-278`, `supabase/migration_v3.sql:152-172,228-230`, `supabase/patch_security_realtime.sql:68`, `src/lib/data/*`, `src/pages/admin/AdminAccounts.tsx`, `src/lib/resultsPoller.ts`, `src/lib/seasonBackup.ts`, `.github/workflows/keepalive.yml`
- **What is wrong:**
  1. **13 tables/views, 31 RPCs, 4 storage buckets, and 1 Edge Function** called by `src/` and `.github/` are missing from `supabase/*.sql` (full diff in **Database Notes** below).
  2. In `supabase/schema.sql:108-278`, `execute_purse_transaction`, `reset_all_purses`, `assign_player_to_team`, and `unassign_player_from_team` are `SECURITY DEFINER` without `is_admin()` checks or `revoke execute ... from anon` (and `reset_all_purses` at line 191 is missing its closing `$$;`).
  3. `supabase/schema.sql:33` constrains `profiles.role` to only `'admin'` and `'projector'` (missing `'owner'` and any volunteer roles).
  4. `supabase/migration_v3.sql:228-230` defines `"Allow public read athletes"` (`for select using (true)`) directly on `public.athletes`, which includes private `roll_no` and `notes` columns; `public_players` (lines 152-170) also exposes `purchase_price` and `base_points`.
  5. `supabase/patch_security_realtime.sql:68` grants `SELECT` on all public tables to `anon` and `authenticated`, relying exclusively on RLS policies.
- **Evidence:** Static extraction of every `.from()`, `.rpc()`, `.storage.from()`, and `.functions.invoke()` call across `src/` and `.github/` compared against `CREATE TABLE`/`VIEW`/`FUNCTION` statements in all 5 files under `supabase/`.
- **Effect:** The repository cannot reproduce the production database, and if any of the `schema.sql` / `migration_v3.sql` definitions remain unpatched on the live database, unauthenticated or non-admin callers could read `athletes.roll_no`/`notes` or invoke purse/assignment RPCs.
- **Risk:** `High`
- **Impact:** `High`
- **Proposed fix:** Export the authoritative live schema, RLS policies, RPC definitions, and `manage-owner` Edge Function into version-controlled migrations, and audit live `SECURITY DEFINER` functions and `athletes` table RLS so no private data or admin mutation is callable by `anon` or unauthorized roles.
- **Recommendation:** `Needs decision` — requires inspecting live Supabase state before reconciling migrations or modifying policies.

---

#### F-006 — Auth Profile Lookup Defaults to `'projector'` Role on Missing Row or Read Error
- **Area:** Security Hygiene / Reliability
- **File path(s):** `src/lib/data/auth.ts:59-69,80-90`
- **What is wrong:** Both `getCurrentUser()` and `signIn()` in `supabaseAuthService` fall back to `role: (profile?.role as UserRole) || 'projector'` whenever the `profiles` query errors or returns null.
- **Evidence:** `src/lib/data/auth.ts:68` and `src/lib/data/auth.ts:89` do not check `error` from `.from('profiles').select('role').single()` and substitute `'projector'` by default.
- **Effect:** Fails open in client routing: any authenticated account with a transient profile read failure or missing `profiles` row is treated as `'projector'` and allowed through `RouteGuard` onto `/projector` (where Supabase RLS is the only remaining guard).
- **Risk:** `Medium`
- **Impact:** `High`
- **Proposed fix:** Check the Supabase query error explicitly and fail closed (return `null` / sign out or throw an authentication error) when a user's `profiles` row cannot be verified.
- **Recommendation:** `Needs decision` — verify every active staff/projector/owner account in live Supabase has a valid `profiles` row before enforcing fail-closed sign-in.

---

#### F-007 — Access-Code-Gated Handbooks Served via Public Storage URLs
- **Area:** Security Hygiene
- **File path(s):** `src/pages/public/HandbookPage.tsx:28,56-60,100-103,267`, `src/components/admin/HandbookSetupCard.tsx:18,49-54,67-71`
- **What is wrong:** `/handbook` gates listing documents behind the `handbook_list` RPC access code, but renders links using `supabase.storage.from('handbooks').getPublicUrl(filePath)`.
- **Evidence:** `HandbookPage.tsx:58` and `HandbookSetupCard.tsx:69` use `.getPublicUrl()`, requiring the `handbooks` bucket to be public (protected only by unguessable UUID filenames).
- **Effect:** Once a handbook URL is copied or shared, rotating or clearing the access code in Setup ("locking" the handbook page) does not revoke access to the PDF.
- **Risk:** `Medium`
- **Impact:** `High`
- **Proposed fix:** Make the `handbooks` storage bucket private and have the access-code verification flow issue short-lived signed URLs rather than permanent public URLs.
- **Recommendation:** `Needs decision` — requires coordinated Supabase Storage bucket and RPC/Edge Function updates.

---

#### F-008 — 1.20 MB of Unreferenced Static Assets in `public/` Copied into Every Build
- **Area:** Dead Code / Performance
- **File path(s):** `public/images/scoresDesktop.jpg` (`606,600 B`), `public/images/scoresMobile.jpg` (`588,880 B`), `public/assets/aistudio/fieldr-mark-egg_337e3ca2.css` (`7,240 B`), `public/images/icons/.gitkeep` (`1 B`)
- **What is wrong:** These four files sit in `public/` and are copied verbatim into `dist/` on every build despite zero references anywhere in `src/`, `index.html`, `manifest.webmanifest`, `sw.js`, or configs.
- **Evidence:** Automated reference scan across all source, HTML, manifest, service worker, and config files returned 0 matches for all four filenames/paths. Combined size is `1,202,721 B` — **29.1%** of the entire `4,136,228 B` `dist/` directory.
- **Effect:** Bloats repository, CI artifacts, and CDN deployments, and publicly serves an unintended leftover prompt attachment (`fieldr-mark-egg_337e3ca2.css`).
- **Risk:** `Safe`
- **Impact:** `High`
- **Proposed fix:** Remove these four unreferenced files from `public/`.
- **Recommendation:** `Implement now`

---

#### F-009 — Eager 198.59 kB `MarkdownContent` Import in `AdminSetup`, `RegisterPage`, and Background Admin Prefetch
- **Area:** Performance
- **File path(s):** `src/pages/admin/AdminSetup.tsx:50-55`, `src/components/admin/RegistrationSetupCard.tsx:16`, `src/pages/public/RegisterPage.tsx:27`, `src/lib/queryCache.ts:166-176`
- **What is wrong:** `MarkdownContent` (`198.59 kB` raw / `58.07 kB` gzip, #2 largest chunk) is statically imported by `AdminSetup.tsx`, `RegistrationSetupCard.tsx`, and `RegisterPage.tsx`. Furthermore, `AdminSetup.tsx` statically imports `SecuredSequence` and all four setup card sub-modules (`CreditsSetupCard`, `HandbookSetupCard`, `RegistrationSetupCard`, `RulesSetupCard`) even though only 1 of its 5 tabs is visible at a time. Worse, `scheduleLikelyAdminPrefetch()` prefetches `AdminSetup` (plus 7 other admin chunks) 1 second after `/admin` mounts, downloading ~349 kB of Setup + Markdown + SecuredSequence JS even when an admin only visits the Auction Room.
- **Evidence:** `vite build` outputs `MarkdownContent-CHhUMDC9.js` (`198.59 kB`) and `AdminSetup-DmnFQbLA.js` (`135.37 kB`). Static imports verified in `AdminSetup.tsx:50-55`, `RegistrationSetupCard.tsx:16`, `RegisterPage.tsx:27`, and `queryCache.ts:166-176`.
- **Effect:** Inflates network transfer on `/admin` idle load and forces mobile `/register` users to download ~199 kB of markdown parsing just for a short instructions block.
- **Risk:** `Low`
- **Impact:** `High`
- **Proposed fix:** Lazy-load `AdminSetup`'s individual tab panels and `MarkdownContent` (only mounting `MarkdownContent` when previewing markdown or when non-empty instructions exist), and remove `setup` from `scheduleLikelyAdminPrefetch()` (relying on hover/focus prefetch via `prefetchAdminTab`).
- **Recommendation:** `Implement now`

---

#### F-010 — 1-Second Interval at Root of `ResultsPage` Re-Renders Entire 1,576-Line Page Every Second
- **Area:** Performance
- **File path(s):** `src/pages/public/ResultsPage.tsx:234,241-280`
- **What is wrong:** `ResultsPage` stores `nowMs` in root component state and calls `setNowMs(Date.now())` every 1,000 ms via `setInterval` while the tab is visible.
- **Evidence:** `ResultsPage.tsx:234` and `247-249` trigger a root state update every second inside the 1,576-line `ResultsPage` component.
- **Effect:** Causes full React reconciliation of the entire Results page (header, stats, team summaries, filters, and all visible feed rows) 60 times per minute on mobile devices just to increment `"Updated 0:XX ago"` and relative sale times.
- **Risk:** `Safe`
- **Impact:** `High`
- **Proposed fix:** Move the 1-second clock into a small leaf component (or memoized `<UpdatedAgo>` / `<RelativeSaleTime>` components) so `ResultsPage` only re-renders when polled data or filters change.
- **Recommendation:** `Implement now`

---

### Medium Impact

#### F-011 — Transient Failure in `getPublicRegistrationConfig` Permanently Caches "Closed" for Session
- **Area:** Data Layer / Reliability
- **File path(s):** `src/lib/data/registrations.ts:49-50,227-265`, `src/components/layout/NavigationMenu.tsx:54-66`, `src/pages/public/RegisterPage.tsx:129`
- **What is wrong:** When `supabase.rpc('get_public_registration_config')` returns an error, lines `247-249` assign `cachedPublicConfig = CLOSED_FALLBACK_CONFIG` indefinitely with no TTL. Even successful responses are cached forever without expiry.
- **Evidence:** `src/lib/data/registrations.ts:230-255` checks `if (!force && cachedPublicConfig) return cachedPublicConfig` with no timestamp check and caches the error fallback.
- **Effect:** A single transient network hiccup hides the Register link in `NavigationMenu` and locks `/register` as "Registration is closed" for the entire SPA session until a hard refresh. Similarly, admins opening registration won't be reflected in already-open tabs.
- **Risk:** `Low`
- **Impact:** `Medium`
- **Proposed fix:** Never cache error fallbacks in `cachedPublicConfig`, and add a short in-memory TTL (e.g., 60 seconds) for successful config responses.
- **Recommendation:** `Implement now`

---

#### F-012 — Missing Request-ID / Unmount Cancellation Guards on Async `useEffect` Fetches
- **Area:** Reliability
- **File path(s):** `src/pages/public/PlayerProfilePage.tsx:86-158`, `src/pages/public/SeasonTeamDetailPage.tsx:529-660,680-807`, `src/pages/admin/AdminLogs.tsx:134-170`, `src/pages/admin/AdminDashboard.tsx:79-108`, `src/pages/admin/AdminAccounts.tsx:207-260`, `src/pages/public/HandbookPage.tsx:76-159`, `src/components/admin/AdminRegistrationsTab.tsx`, `src/components/admin/CreditsSetupCard.tsx`, `src/components/admin/HandbookSetupCard.tsx`, `src/components/admin/RulesSetupCard.tsx`
- **What is wrong:** Async data loaders invoked inside `useEffect` in these components lack an unmount flag or incrementing request-ID (`reqId`) guard before writing React state.
- **Evidence:** Direct inspection of `PlayerProfilePage.tsx:86-158`, `SeasonTeamDetailPage.tsx:529-660,680-807`, `AdminLogs.tsx:134-170`, `AdminDashboard.tsx:79-108`, and automated effect-guard scan across all pages/admin components.
- **Effect:** Fast route transitions (e.g., clicking between `/players/0001` and `/players/0002`, switching teams, or switching the active season in `/admin`) allow an older slow network response to overwrite newer screen state.
- **Risk:** `Safe`
- **Impact:** `Medium`
- **Proposed fix:** Track `mounted` and an incrementing `latestReqIdRef` (or `AbortController`) in these loaders, matching the pattern already established in `AdminPage.tsx` and `AdminAuction.tsx`.
- **Recommendation:** `Implement now`

---

#### F-013 — Unfiltered `storage` Event Listener in `AdminPage` Refetches Whole Admin Bundle
- **Area:** Data Layer / Performance
- **File path(s):** `src/pages/admin/AdminPage.tsx:241-262`
- **What is wrong:** `window.addEventListener('storage', handleStorageChange)` invokes `loadAllData()` on every cross-tab `localStorage` change without inspecting `event.key`.
- **Evidence:** `AdminPage.tsx:242-258` defines `const handleStorageChange = () => { ... loadAllData() }` with no `e.key` check.
- **Effect:** Toggling light/dark theme, collapsing the sidebar, or loading the public Home page in another tab triggers a full 6-query reload of the Admin console.
- **Risk:** `Safe`
- **Impact:** `Medium`
- **Proposed fix:** Accept the `StorageEvent` parameter and ignore keys outside `fieldr_seasons_updated_at` (plus demo `STORAGE_KEYS` only when `isDemoMode` is true).
- **Recommendation:** `Implement now`

---

#### F-014 — Sequential Registration Photo Uploads Without Rollback Cleanup Path
- **Area:** Reliability / Data Layer
- **File path(s):** `src/lib/data/registrations.ts:389-431`
- **What is wrong:** In `submitPublicRegistration`, `photo.jpg` and `thumb.jpg` are uploaded sequentially (`await` then `await`) rather than in parallel, and if the second upload or `attach_registration_photo` fails, no rollback removal is attempted (unlike `approveRegistration` at lines `829-834,855-866`).
- **Evidence:** `src/lib/data/registrations.ts:396-431` awaits `photoErr`, then `thumbErr`, then `attachErr` sequentially.
- **Effect:** Doubles upload latency on mobile networks and leaves orphaned files in `registration-pending` on partial failure until an admin runs `purge_registrations`.
- **Risk:** `Low`
- **Impact:** `Medium`
- **Proposed fix:** Upload `photo.jpg` and `thumb.jpg` concurrently via `Promise.all` to cut upload latency roughly in half, and ensure the error message guides retries cleanly while relying on `purge_registrations` for orphaned pending blobs.
- **Recommendation:** `Implement now`

---

#### F-015 — Large Unvirtualized DOM Lists (`AdminLogs` 1,000-Row Pages & Full-Season Tables)
- **Area:** Performance
- **File path(s):** `src/pages/admin/AdminLogs.tsx:37,158`, `src/pages/admin/AdminPlayers.tsx`, `src/pages/public/SeasonTeamDetailPage.tsx`
- **What is wrong:** `AdminLogs` fetches `LOG_PAGE_SIZE = 1000` rows per page and renders every filtered row as a DOM `<tr>` simultaneously without virtualization or smaller visual pagination. `AdminPlayers` also renders all filtered season entries at once.
- **Evidence:** `AdminLogs.tsx:37` defines `const LOG_PAGE_SIZE = 1000` and renders all filtered rows directly in the table body.
- **Effect:** On busy auction days with hundreds/thousands of bids and purse events, filtering or typing in the search box causes sluggish DOM layout/paint on lower-powered laptops and tablets.
- **Risk:** `Low`
- **Impact:** `Medium`
- **Proposed fix:** Paginate visible rows client-side (e.g., 50–100 rows per view) or virtualize the table body while keeping full CSV export intact.
- **Recommendation:** `Needs decision` — changing visible pagination in `AdminLogs` affects how admins scan logs and needs confirmation on whether "Export CSV" should still cover the full 1,000-row batch.

---

#### F-016 — Unoptimized Roster Hero Photo (`futsal.jpg`) & Missing `width`/`height`/`decoding`/`loading` on 15–16 `<img>` Elements
- **Area:** Performance (CLS / Image Decoding)
- **File path(s):** `public/images/rosters/futsal.jpg` (`251,108 B`, 1000×1250), `src/components/admin/AdminRegistrationsTab.tsx:575,754`, `src/components/admin/BulkRegisterPanel.tsx:540`, `src/components/roster/RosterScoutModal.tsx:105`, `src/pages/admin/AdminAthletes.tsx:910`, `src/pages/admin/AdminAuction.tsx:976,1497`, `src/pages/admin/AdminProjectorControl.tsx:1147`, `src/pages/admin/AdminTeams.tsx:697,841,892`, `src/pages/public/RegisterPage.tsx:739`, `src/components/projector/SecuredSequence.tsx:231,326`
- **What is wrong:** `public/images/rosters/futsal.jpg` is `251.1 kB` (more than 2.4× larger than `cricket.jpg` at `97.9 kB` and `volleyball.jpg` at `103.9 kB`), and none of the roster card photos provide WebP/AVIF formats or responsive `srcSet`/`sizes`. Across 38 `<img>` elements in `src/`, 16 lack explicit `width`/`height` attributes and 15 lack `decoding="async"` (excluding `FooterMark.tsx`, which is an intentional easter egg and must remain untouched, and projector/hero portraits that intentionally load eagerly).
- **Evidence:** Image header inspection confirmed `futsal.jpg` is `1000×1250` at `251,108 B`; AST-style JSX tag scan audited all 38 `<img>` elements in `src/`.
- **Effect:** Unnecessary image transfer on Home and Rosters pages, main-thread image decode contention in admin tables/modals, and minor CLS risk where containers don't lock aspect ratios.
- **Risk:** `Safe`
- **Impact:** `Medium`
- **Proposed fix:** Add explicit `width`, `height`, `decoding="async"`, and `loading="lazy"` on non-critical admin/modal/preview `<img>` elements (leaving `FooterMark.tsx` and eager projector images untouched); optionally generate optimized WebP/compressed JPEG variants for `futsal.jpg`.
- **Recommendation:** `Implement now`

---

#### F-017 — 39 Files Exceed 400 Lines (Including 13 Monoliths Over 1,000 Lines)
- **Area:** Code Quality
- **File path(s):** `src/pages/admin/AdminSetup.tsx` (2,363), `src/pages/public/ProjectorPage.tsx` (2,338), `src/pages/public/SeasonTeamDetailPage.tsx` (2,328), `src/pages/admin/AdminAuction.tsx` (1,979), `src/pages/public/ResultsPage.tsx` (1,576), `src/lib/data/players.ts` (1,438), `src/pages/admin/AdminPlayers.tsx` (1,402), `src/pages/admin/AdminProjectorControl.tsx` (1,335), `src/lib/data/auction.ts` (1,301), `src/pages/admin/AdminTeams.tsx` (1,241), `src/lib/seasonBackup.ts` (1,056), `src/components/admin/AdminRegistrationsTab.tsx` (1,055), `src/pages/admin/AdminAthletes.tsx` (1,046), plus 26 additional files between 408 and 966 lines.
- **What is wrong:** 39 of 106 TypeScript files in `src/` exceed 400 lines. Multi-feature pages (`AdminSetup`, `SeasonTeamDetailPage`, `ProjectorPage`, `AdminAuction`, `ResultsPage`) combine data fetching, realtime listeners, modal state, helper functions, and multi-section UI in single monolithic files.
- **Evidence:** Automated line count of all `.ts`/`.tsx` files in `src/` (full list of all 39 files verified; top 13 listed above, remaining 26 range from `AdminPage.tsx` at 408 lines to `registrations.ts` at 966 lines).
- **Effect:** Increases cognitive load, slows code splitting (monolithic pages ship all sub-views in one chunk), and raises regression risk during edits.
- **Risk:** `Medium`
- **Impact:** `Medium`
- **Proposed fix:** Split the largest pages along natural boundaries—for example, extract `OwnerPanel` out of `SeasonTeamDetailPage`, extract each of the 5 setup tabs out of `AdminSetup`, and extract scene renderers out of `ProjectorPage`.
- **Recommendation:** `Needs decision` — structural refactoring across core live pages should be phased by feature area rather than executed all at once.

---

#### F-018 — Duplicated Helpers Across Canvas Share Exports, Color/Date Formatting, PDF Cards, and Cache Invalidation
- **Area:** Duplicated Code
- **File path(s):**
  - `src/lib/shareResultsImage.ts` & `src/lib/shareSquadImage.ts` (9 duplicated helpers: `waitForFonts`, `loadImageAnonymous`, `roundedRectPath`, `drawFieldrTile`, `drawTrackedText`, `truncateText`, `canvasToPngBlob`, `triggerDownload`, `buildFilename`)
  - `getValidTeamColor` duplicated in 6 files: `src/components/roster/RosterPlayerCard.tsx:26`, `src/pages/admin/AdminAuction.tsx:81`, `src/pages/admin/AdminTeams.tsx:61`, `src/pages/public/ResultsPage.tsx:54`, `src/pages/public/SeasonTeamDetailPage.tsx:113`, `src/pages/public/TeamsPage.tsx:71`
  - `src/components/admin/HandbookSetupCard.tsx`, `src/components/admin/RulesSetupCard.tsx`, `src/pages/public/HandbookPage.tsx` (`formatHandbookDate`, `getHandbookPublicUrl`, PDF file validation, upload/delete flow)
  - `invalidateSeasonCaches` duplicated in `src/lib/data/seasons.ts:15` and `src/lib/seasonBackup.ts:223` (and `seasons.ts:23` manually deletes `fieldr_public_home_v1` instead of calling `invalidateCachedPublicHome`)
  - `isRecord`, `toFiniteNumber`, `toNullableFiniteNumber` duplicated across `registrations.ts`, `seasonBackup.ts`, and `resultsPoller.ts`
  - Demo `handleBroadcast`/`handleStorage` boilerplate duplicated across `athletes.ts`, `auction.ts`, `players.ts`, `projector.ts`, `teams.ts`
- **Evidence:** Cross-file function-name and implementation scan across all 106 files in `src/`.
- **Effect:** Bug fixes or formatting tweaks (e.g., team color validation, canvas font loading, PDF upload validation) must be applied in 2–6 places and easily drift out of sync.
- **Risk:** `Low`
- **Impact:** `Medium`
- **Proposed fix:** Consolidate `getValidTeamColor` into `src/lib/utils.ts`, extract shared canvas/download primitives into a `src/lib/shareCanvasUtils.ts` helper, centralize `invalidateSeasonCaches` (calling `invalidateCachedPublicHome`), and share generic record/number guards.
- **Recommendation:** `Implement now`

---

#### F-019 — Parallel Offline Demo Mode Implementations Across 15 Modules
- **Area:** Duplicated Code / Performance / Code Quality
- **File path(s):** `src/lib/data/client.ts`, `auth.ts`, `seasons.ts`, `teams.ts`, `players.ts`, `purses.ts`, `projector.ts`, `athletes.ts`, `site.ts`, `storage.ts`, `auction.ts`, `logs.ts`, `credits.ts`, `rules.ts`, `registrations.ts`, `src/lib/resultsPoller.ts`
- **What is wrong:** Nearly every data module maintains a full local `localStorage` + `BroadcastChannel` `demo*Service` alongside `supabase*Service`, accounting for a substantial fraction of `src/lib/data/` (~8,500+ lines total across data modules), even though multiple newer features (`Handbook`, `Rules`, `Credits`, `Owner Login`, `Owner Panel`, `Admin Accounts`, `Season Backup`) already require live Supabase and disable demo writes.
- **Evidence:** Dual `demo*Service` / `supabase*Service` implementations verified across `src/lib/data/` and `src/lib/resultsPoller.ts:163-277`.
- **Effect:** Every schema or RPC change requires maintaining two divergent implementations, inflating module sizes and review effort.
- **Risk:** `High`
- **Impact:** `Medium`
- **Proposed fix:** Decide whether offline Demo Mode is still needed; if retained, lazy-load demo implementations behind dynamic imports so production Supabase builds never parse or bundle demo code; if retired, remove `demo*Service` branches cleanly.
- **Recommendation:** `Needs decision` — retiring Demo Mode removes the zero-env offline preview workflow documented in `README.md`.

---

#### F-020 — Four Disconnected Caching Layers & Direct `supabase` Calls Bypassing `src/lib/data/`
- **Area:** Data Layer / Code Quality
- **File path(s):** `src/lib/publicCache.ts`, `src/lib/queryCache.ts`, `src/lib/data/site.ts`, `src/lib/data/registrations.ts`, `src/pages/admin/AdminAccounts.tsx`, `src/pages/admin/AdminDashboard.tsx`, `src/pages/public/HandbookPage.tsx`, `src/pages/public/OwnerLoginPage.tsx`, `src/pages/public/SeasonTeamDetailPage.tsx`, `src/components/admin/HandbookSetupCard.tsx`
- **What is wrong:** Caching is split across 4 separate systems: `publicCache` (no TTLs), `queryCache` (30s/60s TTLs whose `invalidateQuery` is never called anywhere), `localStorage` caches in `site.ts` (5-minute TTL), and a bare module variable in `registrations.ts` (infinite TTL). Additionally, 6 UI pages/components call `supabase.from()` / `supabase.rpc()` / `supabase.storage` / `supabase.auth` directly instead of routing through `src/lib/data/`.
- **Evidence:** Direct inspection of `publicCache.ts`, `queryCache.ts`, `site.ts`, `registrations.ts`, and automated scan of direct `supabase.*` usage outside `src/lib/`.
- **Effect:** Mutations in one area can leave stale data in another cache, and error handling / cache invalidation rules are inconsistent across screens.
- **Risk:** `Medium`
- **Impact:** `Medium`
- **Proposed fix:** Move direct UI `supabase` queries (owner announcements, shortlist, handbook, accounts) into typed `src/lib/data/` modules and unify cache invalidation rules across `publicCache` and `queryCache`.
- **Recommendation:** `Needs decision` — unifying data access and caching touches multiple working pages and should be done deliberately per domain.

---

#### F-021 — Relaxed `tsconfig.json` (`strict` Disabled) & 9 Explicit `any` / 6 Unsafe Casts or Non-Null Assertions
- **Area:** Code Quality / Reliability
- **File path(s):** `tsconfig.json`, `src/lib/data/teams.ts:935-949`, `src/pages/public/SeasonTeamDetailPage.tsx:555,1188,1199`, `src/pages/admin/AdminTeams.tsx:229,234`, `src/pages/public/HomePage.tsx:312`, `src/lib/data/auction.ts:161,168`, `src/lib/data/players.ts:1317`
- **What is wrong:** `tsconfig.json` does not enable `strict`, `strictNullChecks`, `noImplicitAny`, `noUnusedLocals`, or `noUnusedParameters`. Separately, 9 explicit `any` usages (6 in `teams.ts` Edge Function error parsing, 3 in `SeasonTeamDetailPage.tsx` owner overview mapping), 3 non-null assertions (`AdminTeams.tsx`, `HomePage.tsx`), and 3 `as unknown as` casts (`auction.ts`, `players.ts`) bypass type safety.
- **Evidence:** Inspection of `tsconfig.json:1-29` and regex audit of all 106 `.ts`/`.tsx` files in `src/`.
- **Effect:** Potential `null`/`undefined` dereferences and dead locals pass `npm run lint` (`tsc --noEmit`) silently.
- **Risk:** `Low`
- **Impact:** `Medium`
- **Proposed fix:** Replace the 9 `any` annotations, 3 `!` assertions, and 3 double-casts with narrow type guards first; then incrementally adopt `strictNullChecks`, `noUnusedLocals`, and `strict` in `tsconfig.json`.
- **Recommendation:** `Needs decision` — turning on `strict` in `tsconfig.json` will likely require fixing latent type warnings across many files and should be scheduled as its own pass.

---

#### F-022 — Missing Secondary Indexes & Broad `REPLICA IDENTITY FULL` Settings in `supabase/*.sql`
- **Area:** Database Notes Only
- **File path(s):** `supabase/schema.sql`, `supabase/migration_v2.sql`, `supabase/migration_v3.sql`, `supabase/patch_security_realtime.sql`
- **What is wrong:** Repo SQL defines explicit secondary indexes only on `matches` and `match_player_stats` (which the app does not query). Hot filter/join columns on `players` (`season_id`, `sport`, `status`, `team_id`, `athlete_id`), `teams` (`season_id`, `sport`, `owner_user_id`), `purse_transactions` (`season_id`, `team_id`, `created_at`), and `athletes` (`roll_no`) have no explicit indexes in repo SQL. Meanwhile, `patch_security_realtime.sql:60-64` applies `REPLICA IDENTITY FULL` to 5 tables (`projector_state`, `teams`, `players`, `seasons`, `purse_transactions`), increasing WAL write overhead on updates.
- **Evidence:** Full read of all 5 SQL files in `supabase/`.
- **Effect:** Sequential scans on `players`, `teams`, and `purse_transactions` as multi-season data grows, and extra WAL payload on high-frequency updates.
- **Risk:** `Medium`
- **Impact:** `Medium`
- **Proposed fix:** Audit existing indexes on the live Supabase database and add composite indexes matching the app's hot `WHERE`/`ORDER BY` filters if missing; review whether `REPLICA IDENTITY FULL` is still needed on `purse_transactions` and `seasons` (neither is subscribed to via Realtime in `src/`).
- **Recommendation:** `Needs decision` — live Supabase may already have manually added indexes; inspect live `pg_indexes` first.

---

#### F-023 — `SeasonTeamDetailPage` Always Fetches Every Player in the Entire Season
- **Area:** Data Layer / Performance
- **File path(s):** `src/pages/public/SeasonTeamDetailPage.tsx:707-765`
- **What is wrong:** Opening any single franchise page (`/season/:id/teams/:teamId`) fetches `getPublicPlayersBySeason(id)` (which queries both `public_players` and `public_squads` for the entire season) even for public visitors who only see that one team's squad (plus cross-sport badges for that team's athletes).
- **Evidence:** `SeasonTeamDetailPage.tsx:713` calls `getPublicPlayersBySeason(id)`, then filters `seasonPlayers.filter((p) => p.team_id === teamId)` on line `761`.
- **Effect:** Transfers and parses the full season's roster (potentially hundreds of players) on every cold team detail visit.
- **Risk:** `Low`
- **Impact:** `Medium`
- **Proposed fix:** Keep full-season player loading only when the Owner Panel shortlist picker is active, and for public visitors fetch only the team's drafted players (plus a lightweight lookup for those athletes' other sports).
- **Recommendation:** `Needs decision` — verify whether cross-sport badges or public cache warming between `/teams` and `/season/:id/teams/:teamId` rely on pre-populating `publicCache.playersBySeason`.

---

### Low Impact

#### F-024 — Unused `@number-flow/react` Dependency & Build Tooling Placed in `dependencies`
- **Area:** Dead Code / Config Hygiene
- **File path(s):** `package.json:13,16,19,28`
- **What is wrong:** `@number-flow/react` (`^0.6.2`) is declared in `package.json` `dependencies` but has zero imports anywhere in the codebase. Additionally, build-only tools `vite`, `@vitejs/plugin-react`, and `@tailwindcss/vite` are listed under `dependencies` instead of `devDependencies` (while `tailwindcss` is in `devDependencies`).
- **Evidence:** Package import scan across all files in `src/`, configs, and scripts returned 0 references to `@number-flow/react`.
- **Effect:** Unnecessary install weight and dependency-audit surface, plus inaccurate runtime vs build-time dependency classification.
- **Risk:** `Safe`
- **Impact:** `Low`
- **Proposed fix:** Remove `@number-flow/react` from `package.json` and move `vite`, `@vitejs/plugin-react`, and `@tailwindcss/vite` to `devDependencies`.
- **Recommendation:** `Implement now`

---

#### F-025 — Dead CSS Classes & `@keyframes` in `src/index.css` and No-Op `font-dm-sans` Class
- **Area:** Dead Code / CSS Weight
- **File path(s):** `src/index.css:206-247`, `src/pages/public/OwnerLoginPage.tsx:85`
- **What is wrong:** `.animate-blob-rotate`, `.animate-blob-drift-a`, `.animate-blob-drift-b` and `@keyframes blobRotate`, `blobDriftA`, `blobDriftB` in `src/index.css` have zero references across `src/` or `index.html`. Conversely, `OwnerLoginPage.tsx:85` applies `font-dm-sans`, which is not defined in CSS or Tailwind config (DM Sans is already inherited from `body`).
- **Evidence:** Full scan of every `.class` selector and `@keyframes` in `src/index.css` against all source and HTML files confirmed zero references to the three blob classes/keyframes and verified `font-dm-sans` only appears in `OwnerLoginPage.tsx:85`.
- **Effect:** Minor dead CSS in the `95.88 kB` stylesheet and a misleading utility class name.
- **Risk:** `Safe`
- **Impact:** `Low`
- **Proposed fix:** Delete the unused `.animate-blob-*` rules and `@keyframes blob*` definitions from `src/index.css` (and their reduced-motion overrides) and remove `font-dm-sans` from `OwnerLoginPage.tsx:85`.
- **Recommendation:** `Implement now`

---

#### F-026 — Dead Cache Fields (`seasonCards`, `seasonDetails`), Unused Exports, and Unused `NavigationMenu` Prop
- **Area:** Dead Code
- **File path(s):** `src/lib/publicCache.ts:34-45,87-91`, `src/lib/data/seasons.ts:17-18`, `src/lib/seasonBackup.ts:225-226`, `src/pages/public/SeasonTeamDetailPage.tsx:142-143`, `src/lib/queryCache.ts:1-2,39-49`, `src/lib/data/site.ts:526-549,699`, `src/components/ui/Skeleton.tsx:28-43`, `src/components/layout/NavigationMenu.tsx:20,23-26`, plus internal-only exports in `constants.ts` (`PLAYER_STATUS`), `CreditsSection.tsx` (`getPersonInitials`), `ProjectorConfetti.tsx` (`getConfettiFallSpeedMultiplier`), `resultsPoller.ts` (`getPublicResultsSnapshot`, `subscribePublicResults`), `seasonBackup.ts` (`validateSeasonBackup`), `theme.tsx` (`getStoredPreference`, `setStoredPreference`, `getStoredProjectorTheme`, `setStoredProjectorTheme`, `getSystemTheme`, `resolveTheme`, `applyThemeToDom`), `storage.ts` (`extractFieldrAssetPath`), `credits.ts` (`extractCreditsBucketPath`), `client.ts` (`initializeDemoStore`)
- **What is wrong:**
  - `publicCache.seasonCards` and `publicCache.seasonDetails` (left over from before `/season` redirected to `/teams`) are never populated anywhere—only cleared in `seasons.ts`/`seasonBackup.ts` and read as empty in `SeasonTeamDetailPage.tsx:142-143`.
  - `invalidateQuery` (`queryCache.ts`), `writeCachedTickerSpeed` (`site.ts`), and `invalidateCachedPublicHome` (`site.ts`) have zero external callers.
  - `NavigationMenu` declares `activeSeason: Season | null` in its props and every public page passes it, yet `NavigationMenu` never destructures or reads `activeSeason`.
  - Roughly 50 additional functions/constants/interfaces are `export`ed despite being used solely inside their own module (e.g., `SkeletonStatTile`, `PLAYER_STATUS`, `theme.tsx` helpers).
- **Evidence:** Whole-codebase symbol-usage scan across all 106 files in `src/` accounting for re-exports, dynamic imports, and lazy routes.
- **Effect:** Dead code clutter and misleading API surfaces (e.g., callers passing `activeSeason` to `NavigationMenu` thinking it renders season info).
- **Risk:** `Safe`
- **Impact:** `Low`
- **Proposed fix:** Remove `seasonCards` and `seasonDetails` from `publicCache`, drop the unused `activeSeason` prop from `NavigationMenu` and its callers, remove `writeCachedTickerSpeed` (and reuse `invalidateCachedPublicHome` in `seasons.ts`), and drop unnecessary `export` keywords from module-private helpers.
- **Recommendation:** `Implement now`

---

#### F-027 — Broad Google Fonts Weight Matrix & Minor `theme-color` Mismatch
- **Area:** Performance / Polish
- **File path(s):** `index.html:25,40-51`, `public/manifest.webmanifest:9-10`
- **What is wrong:** `index.html` preloads and loads 6 weights + italic of `DM Sans` (`300, 400, 500, 600, 700, 1,400`), `DotGothic16`, and `Syne` (`700, 800`) on every route, even though `DotGothic16` is only rendered on the Home ticker and Projector broadcast banner. Also, `index.html:25` declares `theme-color` as `#0a0a0a` while `manifest.webmanifest:9-10` and `src/index.css` use `#0B0B0B`.
- **Evidence:** Direct inspection of `index.html:25,43` and `public/manifest.webmanifest:9-10`.
- **Effect:** Extra font stylesheet/woff2 bytes on routes that don't use all weights or `DotGothic16`, and a subtle 1-step hex discrepancy in browser chrome tint before theme hydration.
- **Risk:** `Low`
- **Impact:** `Low`
- **Proposed fix:** Align `index.html` `theme-color` to `#0B0B0B` and audit which `DM Sans` weights are actually used before trimming unused weights or adding `text=` / unicode subsetting where appropriate.
- **Recommendation:** `Needs decision` — trimming font weights requires checking every page's typography (e.g., italic blockquotes in `MarkdownContent`) to avoid faux-bold/faux-italic synthesis.

---

#### F-028 — Owner Sign-In via `/login` Bounces Through `/projector`
- **Area:** Reliability / UX
- **File path(s):** `src/pages/public/LoginPage.tsx:41-45`, `src/components/layout/RouteGuard.tsx:76-79`
- **What is wrong:** On `/login`, `handleSubmit` navigates `admin` to `/admin` and every other role (including `owner`) to `/projector`, relying on `RouteGuard` to redirect `owner` onward to `/teams`.
- **Evidence:** `LoginPage.tsx:41-45` has only an `if (user.role === 'admin') ... else navigate('/projector')` branch.
- **Effect:** Extra navigation bounce and wasted prefetch of `ProjectorPage` chunk when an owner signs in from `/login`.
- **Risk:** `Safe`
- **Impact:** `Low`
- **Proposed fix:** Add an explicit `else if (user.role === 'owner') navigate('/teams')` branch in `LoginPage.tsx`.
- **Recommendation:** `Implement now`

---

#### F-029 — 76 Raw `console.error` Calls in Production & CommonJS `__dirname` in `vite.config.ts`
- **Area:** Code Quality
- **File path(s):** `vite.config.ts:11`, and 76 `console.error` statements across 23 files in `src/lib/data/` and `src/pages/`
- **What is wrong:** `vite.config.ts:11` uses `__dirname` in an ESM project (`"type": "module"`). In addition, 76 `console.error(...)` calls print raw Supabase/RPC error objects directly to browser developer tools in production.
- **Evidence:** Automated console scan counted `76` `console.error` calls (`0` `log`/`warn`/`info`/`debug`); `vite.config.ts:11` uses `path.resolve(__dirname, '.')`.
- **Effect:** Exposes raw backend error payloads in production browser consoles and relies on Vite's `__dirname` shim in ESM config loading.
- **Risk:** `Safe`
- **Impact:** `Low`
- **Proposed fix:** Replace `__dirname` with `import.meta.dirname` in `vite.config.ts`, and route error logging through a thin `logError` helper that suppresses verbose objects outside `import.meta.env.DEV`.
- **Recommendation:** `Implement now`

---

#### F-030 — Legacy Field Naming Drift in Core Types (`year_batch` / `academic_year`, `player_code` / `athlete_code`, `is_active` / `active`)
- **Area:** Code Quality
- **File path(s):** `src/types/index.ts`, `src/lib/data/players.ts`, `src/lib/data/site.ts`
- **What is wrong:** `Player` retains legacy `year_batch` alongside `academic_year` and `player_code` alongside `athlete_code`, while boolean active flags alternate between `is_active` (`Season`, `OwnerAnnouncementRow`) and `active` (`CarouselItem`).
- **Evidence:** Inspection of `src/types/index.ts` and fallback expressions across `src/lib/data/players.ts`.
- **Effect:** Forces defensive dual-field normalization across services and creates minor confusion when adding new features.
- **Risk:** `Medium`
- **Impact:** `Low`
- **Proposed fix:** Once legacy database columns are confirmed unused, standardize TypeScript models on `academic_year` and `athlete_code` and map database quirks strictly at the `src/lib/data/` boundary.
- **Recommendation:** `Needs decision` — requires verifying whether live DB views/rows still emit `year_batch` or `FLD-` `player_code` values.

---

#### F-031 — `RouteGuard` Preloads Protected `ProjectorPage` Chunk Before Verifying Auth/Role
- **Area:** Security Hygiene / Performance
- **File path(s):** `src/components/layout/RouteGuard.tsx:34-52`, `src/App.tsx:250-257`
- **What is wrong:** `RouteGuard`'s `useEffect` immediately calls `preloadComponent.load()` on mount—even while `isLoading` is true or when `user` is signed out or unauthorized—downloading `ProjectorPage-DSI0oRgd.js` (`62.78 kB`) before redirecting to `/login` or `/teams`.
- **Evidence:** `RouteGuard.tsx:34-52` has no check on `isLoading`, `user`, or `allowedRoles.includes(user.role)` before calling `preloadComponent.load()`.
- **Effect:** Unauthenticated visitors or bounced owners hitting `/projector` unnecessarily download the protected projector bundle before being redirected.
- **Risk:** `Safe`
- **Impact:** `Low`
- **Proposed fix:** Gate `preloadComponent.load()` inside `RouteGuard`'s `useEffect` on `!isLoading && Boolean(user) && allowedRoles.includes(user.role)`.
- **Recommendation:** `Implement now`

---

## Realtime Subscription Inventory (Area 4 Verification)

**Public Page Confirmation:** **Zero** public signed-out pages open any Supabase Realtime channel. (`HomePage`, `RostersPage`, `RosterSportPage`, `PlayerProfilePage`, `TeamsPage`, `ResultsPage`, `RegisterPage`, `ContentPage`, `RulesPage`, `HandbookPage`, `LoginPage`, `OwnerLoginPage` all use REST queries or HTTP polling via `resultsPoller.ts`.)

| Channel Name | Defined In | Opened By (Auth Gate) | Tables & Filters Watched | Removed on Unmount? | Overlap / Double-Open Risk |
|---|---|---|---|---|---|
| `projector_state_${seasonId}` | `src/lib/data/projector.ts:245` | `AdminPage.tsx:269` (`admin`) & `ProjectorPage.tsx:1086` (`admin`/`projector`) | `projector_state` (`season_id=eq.${seasonId}`) | Yes (`removeChannel`) | **Yes:** Overlaps with `admin_auction_live_${seasonId}` when `AdminAuction` is open; static channel name |
| `players_${seasonId}` | `src/lib/data/players.ts:1246` | `AdminPage.tsx:272` (`admin`) & `ProjectorPage.tsx:1105` (`admin`/`projector`) | `players` (`season_id=eq.${seasonId}`) | Yes (`removeChannel`) | **Yes:** Overlaps with both `admin_auction_live_${seasonId}` and `admin_athletes_realtime`; triggers redundant `getPlayers` |
| `teams_${seasonId}` | `src/lib/data/teams.ts:843` | `AdminPage.tsx:275` (`admin`) & `ProjectorPage.tsx:1099` (`admin`/`projector`) | `teams` (`season_id=eq.${seasonId}`) | Yes (`removeChannel`) | **Yes:** Overlaps with `admin_auction_live_${seasonId}`; triggers redundant `getTeams` |
| `auction_settings_${seasonId}` | `src/lib/data/auction.ts:700` | `ProjectorPage.tsx:1092` (`admin`/`projector`) | `auction_settings` (`season_id=eq.${seasonId}`) | Yes (`removeChannel`) | Low (only opened by `ProjectorPage`, which guards via `subscribedSeasonIdRef`) |
| `admin_auction_live_${seasonId}` | `src/lib/data/auction.ts:917` | `AdminAuction.tsx:230` (`admin`) | `projector_state`, `players`, `teams`, `auction_settings`, `auction_queue` (all filtered by `season_id`), plus **unfiltered** `auction_bids`, `auction_sales` | Yes (`removeChannel`) | **Yes:** Runs simultaneously alongside `AdminPage`'s 3 channels (see **F-003**) |
| `admin_athletes_realtime` | `src/lib/data/athletes.ts:766` | `AdminAthletes.tsx:269` (`admin`) | **Unfiltered** `athletes`, `players` | Yes (`removeChannel`) | **Yes:** Runs alongside `AdminPage`'s `players_${seasonId}` channel |
| `owner_announcements_${id}` | `src/pages/public/SeasonTeamDetailPage.tsx:504` | `SeasonTeamDetailPage.tsx:469` (**only when `isOwnerPanelActive` is true** — verified signed-in `owner` viewing own team) | `owner_announcements` (`season_id=eq.${id}`) | Yes (`removeChannel`) | Low (never opens for signed-out visitors or other users) |

---

## Database Notes Only (Area 8 — No SQL Written or Executed)

### Objects Referenced in Code / Workflows Missing from `supabase/*.sql`
- **Tables / Views (13):** `auction_bids`, `auction_queue`, `auction_sales`, `auction_settings`, `credits_people`, `handbook_settings`, `handbooks`, `owner_announcements`, `owner_shortlist`, `public_results`, `public_squads`, `registration_settings`, `rules_documents`
- **RPC Functions (31):** `admin_activity_log`, `admin_delete_account`, `admin_list_accounts`, `admin_list_admin_sessions`, `approve_athlete_registration`, `attach_registration_photo`, `auction_bring_to_stage`, `auction_clear_bid`, `auction_mark_unsold`, `auction_place_bid`, `auction_secure`, `auction_undo_last_sale`, `get_pending_registrations_count`, `get_public_registration_config`, `get_public_results_version`, `handbook_list`, `keepalive` (`.github/workflows/keepalive.yml`), `list_admin_registrations`, `owner_team_overview`, `purge_registrations`, `queue_add_by_codes`, `queue_add_player`, `queue_clear`, `queue_move`, `queue_remove`, `reject_athlete_registration`, `rename_season`, `restore_season_backup`, `set_broadcast_message`, `submit_athlete_registration`, `trigger_confetti`
- **Storage Buckets (4):** `handbooks`, `credits`, `rules`, `registration-pending` (only `fieldr-assets` is in `supabase/schema.sql`)
- **Edge Functions (1):** `manage-owner` (invoked from `src/lib/data/teams.ts:924`)

### Objects Defined in `supabase/*.sql` Never Queried in Code
- **Tables (2):** `matches`, `match_player_stats` (`supabase/migration_v3.sql`)

### Policies, RPCs & Indexes Worth Reviewing on Live Supabase
- Confirm live `execute_purse_transaction`, `reset_all_purses`, `assign_player_to_team`, and `unassign_player_from_team` enforce `is_admin()` (missing in `supabase/schema.sql`) and have `EXECUTE` revoked from `anon`.
- Confirm live RLS on `public.athletes` does not expose `roll_no` or `notes` to `anon` (unlike `supabase/migration_v3.sql:228-230`).
- Confirm live `profiles.role` check constraint and RLS match active roles (`admin`, `projector`, `owner`, and any volunteer roles).
- Verify composite indexes exist on `players(season_id, sport, status)`, `players(team_id)`, `players(athlete_id)`, `teams(season_id, sport)`, `purse_transactions(season_id, team_id, created_at)`, and `athletes(roll_no)`.
- Verify whether `REPLICA IDENTITY FULL` on `purse_transactions` and `seasons` can be reverted to `DEFAULT` since neither table is subscribed to over Realtime.

---

## Not Found in Code

The following items cannot be verified from this repository alone and require checking the live environments:
1. **Live Supabase schema, RLS policies, indexes, triggers, and RPC bodies** for the 13 missing tables/views, 31 missing RPCs, and 4 storage buckets (plus whether live `schema.sql` functions were manually patched in the Supabase SQL Editor).
2. **Source code and authorization logic of the `manage-owner` Edge Function** (not stored in `supabase/functions/` in this repo).
3. **Production bundle size when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are populated** (local audit build runs in Demo Mode where `@supabase/supabase-js` is tree-shaken).
4. **Live Vercel deployment settings** (HTTP caching headers for `/assets/*` and `/images/*`, compression settings, environment variables, preview/production branch rules, and real-user Web Vitals / Speed Insights metrics).
5. **Live database row counts and query execution plans** (needed to prioritize index additions and evaluate `AdminLogs` / `public_players` query latency).

---

## Summary Table

| ID | Title | Risk | Impact | Recommendation |
|---|---|---|---|---|
| F-001 | Unsplit 606.70 kB entry bundle (no vendor chunking) | Low | High | Implement now |
| F-002 | Broken PWA manifest and Apple Touch icon paths | Safe | High | Implement now |
| F-003 | Overlapping admin Realtime subscriptions & double refetches | Medium | High | Needs decision |
| F-004 | `HomePage` queries `public_players` across all seasons with 1,000-row cap | Low | High | Implement now |
| F-005 | Repo SQL out of sync with live DB & unsafe `SECURITY DEFINER`/policies | High | High | Needs decision |
| F-006 | Auth profile lookup defaults to `'projector'` instead of failing closed | Medium | High | Needs decision |
| F-007 | Access-code-gated handbooks served via public storage URLs | Medium | High | Needs decision |
| F-008 | 1.20 MB of unreferenced static assets in `public/` shipped in `dist/` | Safe | High | Implement now |
| F-009 | Eager 198.59 kB `MarkdownContent` & `AdminSetup` prefetch overhead | Low | High | Implement now |
| F-010 | 1-second root state tick re-renders 1,576-line `ResultsPage` every second | Safe | High | Implement now |
| F-011 | Transient failure in `getPublicRegistrationConfig` permanently caches closed | Low | Medium | Implement now |
| F-012 | Missing request-ID / unmount guards on async effects (navigation races) | Safe | Medium | Implement now |
| F-013 | Unfiltered `storage` listener in `AdminPage` reloads whole admin bundle | Safe | Medium | Implement now |
| F-014 | Sequential registration photo uploads without rollback path | Low | Medium | Implement now |
| F-015 | Large unvirtualized DOM lists (`AdminLogs` 1,000-row pages) | Low | Medium | Needs decision |
| F-016 | Unoptimized `futsal.jpg` (251 kB) & missing `img` attrs on 15–16 images | Safe | Medium | Implement now |
| F-017 | 39 source files > 400 lines (13 monoliths > 1,000 lines) | Medium | Medium | Needs decision |
| F-018 | Duplicated helpers (share canvas, `getValidTeamColor`, PDF cards, caches) | Low | Medium | Implement now |
| F-019 | Parallel offline Demo Mode doubles data layer footprint | High | Medium | Needs decision |
| F-020 | 4 disconnected caching layers & direct `supabase` calls in UI | Medium | Medium | Needs decision |
| F-021 | Relaxed `tsconfig.json` (`strict` off) & 9 `any` / 6 casts or `!` | Low | Medium | Needs decision |
| F-022 | Missing secondary indexes & broad `REPLICA IDENTITY FULL` in repo SQL | Medium | Medium | Needs decision |
| F-023 | `SeasonTeamDetailPage` fetches entire season's players for public views | Low | Medium | Needs decision |
| F-024 | Unused `@number-flow/react` & build plugins in `dependencies` | Safe | Low | Implement now |
| F-025 | Dead CSS blob classes/keyframes & undefined `font-dm-sans` class | Safe | Low | Implement now |
| F-026 | Dead `publicCache` fields, unused exports, and unused `NavigationMenu` prop | Safe | Low | Implement now |
| F-027 | Broad Google Fonts weight matrix & minor `theme-color` mismatch | Low | Low | Needs decision |
| F-028 | Owner sign-in via `/login` bounces through `/projector` | Safe | Low | Implement now |
| F-029 | 76 raw `console.error` calls in production & `__dirname` in `vite.config.ts` | Safe | Low | Implement now |
| F-030 | Legacy field naming drift in `src/types/index.ts` | Medium | Low | Needs decision |
| F-031 | `RouteGuard` preloads protected `ProjectorPage` chunk before auth check | Safe | Low | Implement now |
