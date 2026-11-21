# Fieldr Code Health Audit Report

**Audit Type:** Read-Only Static & Build Audit  
**Scope:** Full repository (`src/`, `public/`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`, `vercel.json`, `metadata.json`, `.github/workflows/`, `supabase/` filenames & symbol cross-reference only)  
**Ground Truth Note:** `UNUSED_CODE_REPORT.md` and `docs/` are not present in the workspace root (likely removed or excluded after Cleanup Batch 1). Every finding below is verified directly against the current repository state. Where earlier cleanup batches or recent UI/performance refactors resolved, left open, or introduced an item (frosted overlays, collapsible admin sidebar, Auction Room redesign, Owner Panel redesign, RosterScoutModal redesign, performance phases, `useBodyScrollLock`), its current status (`Fixed`, `Still Open`, or `New`) is noted explicitly.

**Verdict Legend:**
- **SAFE TO REMOVE** — Verified zero live callers/references across static imports, dynamic imports, string references, routes, and CSS.
- **CHECK FIRST** — Appears unused, redundant, or out of sync, but a product, runtime, or database check is required before changing or deleting.
- **KEEP** — Looks unused to naive static scanners, but is required at runtime, by tooling, or by platform contracts.

---

## 1. Type and Build Health

### 1.1 TypeScript Check (`npx tsc --noEmit`)
- **Result:** Exit code `0` — **0 errors** under the current `tsconfig.json`.
- **Config Gap (`tsconfig.json:1-25`) — Verdict: CHECK FIRST**
  - `tsconfig.json` does not enable `strict`, `noUnusedLocals`, or `noUnusedParameters`.
  - Running `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` (read-only) surfaces **8 unused symbols** across 5 files (listed individually with verdicts in Section 3.4):
    1. `src/components/layout/ErrorBoundary.tsx:1` (`React` default import)
    2. `src/lib/constants.ts:9` (`PLAYER_STATUS_VALUES`)
    3. `src/lib/constants.ts:29` (`PROJECTOR_MODE_VALUES`)
    4. `src/lib/constants.ts:51` (`PROJECTOR_AUTO_FILTER_VALUES`)
    5. `src/lib/data/players.ts:22` (`getNextAthleteCode` import)
    6. `src/lib/data/site.ts:10` (`demoBroadcastChannel` import)
    7. `src/lib/data/types.ts:11` (`PlayerStatus` type import)
    8. `src/pages/public/SeasonTeamDetailPage.tsx:112` (`season` state variable)
  - *Check:* Enabling `noUnusedLocals` / `noUnusedParameters` in `tsconfig.json` after cleaning these 8 items will prevent future dead imports/variables.

### 1.2 Production Build (`npm run build` — Vite `v8.3.7`)
- **Result:** Exit code `0` — **0 build errors**, **2 warnings**:
  1. **`vite.config.ts:11:27` — `__dirname` under native ESM config loader — Verdict: CHECK FIRST**
     - Warning: `configLoader: 'native'` does not support CommonJS `__dirname` (Vite recommends `import.meta.dirname`).
     - *Check:* Replacing `path.resolve(__dirname, '.')` with `path.resolve(import.meta.dirname, '.')` requires Node >= 20.11 (supported by current runtime and Vercel Node 20/22).
  2. **Main entry bundle size warning (`dist/assets/index-BJuvRtey.js`: `593.00 kB` raw / `172.25 kB` gzip) — Verdict: CHECK FIRST** *(New / enlarged after Performance Phase 1 statically imported `HomePage`)*
     - Warning: `[plugin builtin:vite-reporter] Some chunks are larger than 500 kB after minification`.
     - *Check:* Statically importing `HomePage` in `src/App.tsx:15` intentionally eliminated the Home skeleton flash, pulling `HomePage`, `motion/react`, `@supabase/supabase-js`, and `@phosphor-icons/react` into the main entry chunk. Consider `build.rollupOptions.output.manualChunks` (splitting vendor libraries like `supabase` and `motion`) rather than re-lazy-loading `HomePage`.

---

## 2. Unused Files

### 2.1 Unused Source Modules (`src/`)
1. **`src/components/home/SportEquipmentSvgs.tsx` (lines 1–186) — Verdict: SAFE TO REMOVE** *(Still Open from earlier cleanup)*
   - **Evidence:** Exports `CricketIllustration` (line 7), `FutsalIllustration` (line 73), and `VolleyballIllustration` (line 129). Zero static imports, dynamic imports, or string references anywhere in `src/`, `index.html`, or `public/`. Replaced by photography in `src/components/home/SportCardsGrid.tsx:22-44` (`/images/rosters/{cricket,futsal,volleyball}.jpg`).
2. **`src/components/layout/index.ts` (lines 1–7) — Verdict: SAFE TO REMOVE** *(Still Open)*
   - **Evidence:** Barrel file re-exporting `BrandMark`, `HeaderBar`, `NavigationMenu`, `RouteGuard`, `SiteFooter`, and `ErrorBoundary`. Zero files import from `components/layout` or `components/layout/index` — every caller imports directly from the individual component paths (e.g., `components/layout/HeaderBar`).

### 2.2 Unused Public Assets (`public/`)
1. **`public/assets/aistudio/photo-1531415074968-036ba1b575da_a311cef8.jpeg` — Verdict: SAFE TO REMOVE** *(Still Open — intentionally deferred during performance batch)*
   - **Evidence:** Zero references in `src/`, `index.html`, `public/`, or config files. Superseded by `public/images/rosters/cricket.jpg`.
2. **`public/assets/aistudio/photo-1574629810360-7efbbe195018_afa3251e.jpeg` — Verdict: SAFE TO REMOVE** *(Still Open)*
   - **Evidence:** Zero references anywhere in the repo. Superseded by `public/images/rosters/futsal.jpg`.
3. **`public/assets/aistudio/photo-1612872087720-bb876e2e67d1_84544e51.jpeg` — Verdict: SAFE TO REMOVE** *(Still Open)*
   - **Evidence:** Zero references anywhere in the repo. Superseded by `public/images/rosters/volleyball.jpg`. (Once all three images are removed, the empty `public/assets/aistudio/` directory can also be removed.)
4. **`public/robots.txt` — Verdict: KEEP**
   - **Evidence:** Not imported by JS/HTML, but served statically at `/robots.txt` for search-engine crawlers.
5. **`public/favicon.svg` & `public/images/rosters/{cricket,futsal,volleyball}.jpg` — Verdict: KEEP**
   - **Evidence:** Referenced by `index.html:26` (`favicon.svg`) and `src/components/home/SportCardsGrid.tsx:24, 31, 38` (roster photos).

### 2.3 Skeleton Variants and Exports (`src/components/ui/Skeleton.tsx`)
1. **`PublicPageSkeleton` `'home'` variant union entry (`src/components/ui/Skeleton.tsx:222`) — Verdict: SAFE TO REMOVE** *(New — became unused after Performance Phase 1 made `HomePage` a static import)*
   - **Evidence:** All 11 `<PublicPageSkeleton>` usages in `src/App.tsx:113-195` pass `'cards'`, `'profile'`, or `'content'`. Zero callers pass `variant="home"`, and `PublicPageSkeleton` never had a dedicated `'home'` branch (it fell through to the default cards layout).
2. **`SkeletonStatTile` export (`src/components/ui/Skeleton.tsx:28`) — Verdict: KEEP (remove `export` keyword only)**
   - **Evidence:** Zero callers outside `Skeleton.tsx`; used internally by `AdminDashboardSkeleton` at `src/components/ui/Skeleton.tsx:112-115`. Keeping it as an unexported module-private helper preserves `AdminDashboardSkeleton`.
3. **All other Skeleton exports (`SkeletonBlock`, `SkeletonText`, `SkeletonCard`, `SkeletonTableRow`, `AdminDashboardSkeleton`, `AdminTableSkeleton`, `AdminCardsSkeleton`, `AdminShellSkeleton`, `PublicPageSkeleton`, `ProjectorPageSkeleton`) — Verdict: KEEP**
   - **Evidence:** Every one of these has active external callers (`App.tsx`, `RouteGuard.tsx`, `AdminPage.tsx`, and individual admin/public pages).

### 2.4 Demo-Mode Code Footprint
- **Files & Lines:**
  - `src/lib/data/client.ts:10, 17-26, 100-582` (`isDemoMode`, `demoBroadcastChannel`, `notifyChange`, `getLocal`, `setLocal`, `DEFAULT_CAROUSEL`, `DEFAULT_SETTINGS`, seed data & `initializeDemoStore`)
  - `src/lib/data/auth.ts:13-48` (`demoAuthService`), `seasons.ts:28-206` (`demoSeasonsService`), `teams.ts:19-415` (`demoTeamsService`), `players.ts:111-624` (`demoPlayersService`), `athletes.ts:30-276` (`demoAthletesService`), `purses.ts:25-120` (`demoPursesService`), `projector.ts:18-140` (`demoProjectorService`), `site.ts:25-160` (`demoSiteService`), `storage.ts:34-65` (`demoStorageService`), `auction.ts:45-605` (`demoAuctionService`), `logs.ts:25-120` (`demoLogsService`)
  - `src/lib/AuthContext.tsx:17, 22, 24, 126-135, 147, 149` (`isDemo`, `quickDemoLogin`)
  - `src/pages/public/LoginPage.tsx:13, 45-56, 153-185` (quick demo login buttons)
  - `src/pages/admin/AdminTeams.tsx:13` (`isDemoMode` check), `src/components/admin/HandbookSetupCard.tsx:15, 78, 100`, `src/components/admin/RulesSetupCard.tsx:13, 31, 49`
- **Verdict: CHECK FIRST** *(Still Open)*
  - **Rationale:** Demo mode accounts for roughly a third of `src/lib/data/` and allows the app to boot locally without Supabase env vars. However, newer features (`HandbookSetupCard`, `RulesSetupCard`, `CreditsSetupCard`, `OwnerLoginPage`, `SeasonTeamDetailPage` Owner Panel) already require live Supabase and disable/bypass demo mode. Confirm whether offline preview/demo mode is still desired before removing it.

### 2.5 Old Docs and Historical Database Script Files
1. **Stale comment pointing to missing doc (`src/index.css:1`) — Verdict: SAFE TO REMOVE** *(Still Open)*
   - **Evidence:** `/* Typography rules: see docs/TYPOGRAPHY_RULES.md */` references a file and `docs/` directory that do not exist in the repository.
2. **Stale `README.md` (`README.md:7-9, 17-34`) — Verdict: CHECK FIRST** *(Still Open)*
   - **Evidence:** Describes only 2 roles (`admin`, `projector` — omits `owner`), only 4 projector scenes (omits `auction`, `sold`, `unsold`, `auto`, broadcast, confetti), and refers to legacy setup steps. Update rather than delete.
3. **Database migration files in `supabase/` (`supabase/schema.sql`, `supabase/migration_v2.sql`, `supabase/migration_v3.sql`, `supabase/migration_v4_sports_roles.sql`, `supabase/patch_security_realtime.sql`) — Verdict: CHECK FIRST**
   - **Evidence:** Not imported by frontend code. As documented in Section 10, these files do not include newer tables/RPCs added directly in Supabase (`auction_*`, `credits_people`, `handbooks`, `handbook_settings`, `rules_documents`, `public_squads`, `owner_team_overview`, `admin_activity_log`, etc.). Check whether you want to keep them as historical migrations, update them to match production, or archive them.

---

## 3. Unused Exports and Functions

### 3.1 Unused Data-Layer Functions (`src/lib/data/`)
1. **`getActiveTeams` (`src/lib/data/teams.ts:232, 663, 887`, `src/lib/data/types.ts:63`) — Verdict: SAFE TO REMOVE**
   - **Evidence:** Defined on `TeamsService` and exported from `src/lib/data/teams.ts:887` (re-exported via `src/lib/data/index.ts:5`). Zero callers anywhere in `src/` (including inside `src/lib/data/`). All callers use `getTeams(seasonId)` or `getPublicTeams(seasonId)`.
2. **`invalidateCarouselCache` export & `SiteService` interface entry (`src/lib/data/site.ts:20`, `src/lib/data/types.ts:226`) — Verdict: CHECK FIRST**
   - **Evidence:** Zero callers outside `src/lib/data/site.ts`. Called internally inside `src/lib/data/site.ts` (lines 26, 64, 93, 114, 129, 156, 204, 230, 258, 277). Can be unexported and removed from `SiteService` unless kept intentionally for manual cache clearing.
3. **`writeCachedTickerSpeed` (`src/lib/data/site.ts:488`) — Verdict: CHECK FIRST**
   - **Evidence:** Exported from `site.ts:488`, zero callers outside `src/lib/data/site.ts`; called internally only once at `site.ts:710`. Safe to unexport (keep function body).
4. **`invalidateCachedPublicHome` (`src/lib/data/site.ts:659`) — Verdict: CHECK FIRST**
   - **Evidence:** Exported from `site.ts:659`, zero callers outside `src/lib/data/site.ts`; called internally at `site.ts:22`. (Note: `src/lib/data/seasons.ts:23` duplicates its behavior directly via `localStorage.removeItem('fieldr_public_home_v1')` instead of calling it — see Section 6.6.)
5. **`PUBLIC_HOME_CACHE_KEY` & `HOME_CACHE_TTL_MS` (`src/lib/data/site.ts:388-389`) — Verdict: CHECK FIRST**
   - **Evidence:** Zero references outside `src/lib/data/site.ts` (and `seasons.ts:23` hardcodes `'fieldr_public_home_v1'` instead of importing `PUBLIC_HOME_CACHE_KEY`). Either import `PUBLIC_HOME_CACHE_KEY` in `seasons.ts` or unexport both constants.
6. **`deletePlayerPhotoAssets` (`src/lib/data/storage.ts:192`, `src/lib/data/types.ts:235`) — Verdict: KEEP**
   - **Evidence:** Zero callers outside `src/lib/data/`, but actively called by `src/lib/data/athletes.ts:19, 269, 715` when deleting athletes.
7. **Unnecessarily exported module-internal helpers in `src/lib/data/` — Verdict: SAFE TO REMOVE (remove `export` keyword only; keep implementations)**
   - `src/lib/data/auction.ts:1176` — `buildQueueBulkAddSummary` (only called at `auction.ts:1257`)
   - `src/lib/data/client.ts:166` — `initializeDemoStore` (only called at `client.ts:581`)
   - `src/lib/data/credits.ts:23` — `extractCreditsBucketPath` (only called at `credits.ts:65`)
   - `src/lib/data/storage.ts:19` — `extractFieldrAssetPath` (only called at `storage.ts:112, 113, 150`)
   - `src/lib/data/logs.ts:153` (`logsService`), `players.ts:1325` (`playersService`), `projector.ts:283` (`projectorService`), `purses.ts:218` (`pursesService`), `seasons.ts:421` (`seasonsService`), `site.ts:681` (`siteService`), `storage.ts:161` (`storageService`), `teams.ts:868` (`teamsService`) — zero external callers because all consumers import the standalone wrapper functions (`getTeams`, `getPlayers`, etc.).

### 3.2 Unused Exports in `src/lib/`, `src/components/`, and `src/hooks/`
1. **`PLAYER_STATUS` (`src/lib/constants.ts:1`) — Verdict: SAFE TO REMOVE**
   - **Evidence:** Zero references anywhere in `src/` (only used internally on line 9 by `PLAYER_STATUS_VALUES`, which is itself unused).
2. **`invalidateQuery` (`src/lib/queryCache.ts:39`) — Verdict: CHECK FIRST**
   - **Evidence:** Exported at `src/lib/queryCache.ts:39`, zero callers anywhere in `src/`.
   - *Check:* `AdminPage.tsx` uses `getCachedQuery`/`setCachedQuery` under key `'admin:bundle'`, and mutations call `loadAllData()` which overwrites the entry, but `invalidateQuery` is never invoked (e.g., on sign-out). Either wire it into sign-out or remove it.
3. **`QUERY_FRESH_TTL_MS` & `QUERY_REVALIDATE_AFTER_MS` (`src/lib/queryCache.ts:1-2`) — Verdict: SAFE TO REMOVE (`export` keyword only)**
   - **Evidence:** Used only as default parameter values at `queryCache.ts:24, 32`; zero external imports.
4. **Dead `publicCache` entries & types (`src/lib/publicCache.ts:34-45, 87-91`) — Verdict: SAFE TO REMOVE** *(New — leftover after `/season` and `/season/:id` became redirects to `/teams`)*
   - `SeasonCardCacheItem` (`src/lib/publicCache.ts:34`), `SeasonDetailCacheEntry` (`src/lib/publicCache.ts:40`), `publicCache.seasonCards` (`src/lib/publicCache.ts:87-90`), and `publicCache.seasonDetails` (`src/lib/publicCache.ts:91`).
   - **Evidence:** Never populated (written) anywhere in the codebase. Only cleared in `src/lib/data/seasons.ts:17-18` and checked as always-empty fallbacks in `src/pages/public/SeasonTeamDetailPage.tsx:84-85`.
5. **Unnecessarily exported helpers in `src/lib/theme.tsx:14-81` — Verdict: SAFE TO REMOVE (`export` keyword only; keep functions)**
   - `getStoredPreference` (line 14), `setStoredPreference` (line 28), `getStoredProjectorTheme` (line 39), `setStoredProjectorTheme` (line 53), `getSystemTheme` (line 64), `resolveTheme` (line 75), `applyThemeToDom` (line 81). Zero external callers; used internally inside `theme.tsx`.
6. **Unnecessarily exported helpers/constants in components — Verdict: SAFE TO REMOVE (`export` keyword only; keep implementations)**
   - `src/components/admin/AdminNav.tsx:29, 35, 40, 46, 82` (`AdminNavItem`, `AdminNavGroup`, `ADMIN_DASHBOARD_ITEM`, `ADMIN_NAV_GROUPS`, `AdminNavProps`) — zero external refs.
   - `src/components/credits/CreditsSection.tsx:6` (`getPersonInitials`) — zero external refs; used internally inside `CreditsSection.tsx`.
   - `src/components/projector/ProjectorConfetti.tsx:20` (`getConfettiFallSpeedMultiplier`) — zero external refs; used internally inside `ProjectorConfetti.tsx`.
7. **Unused exported types/interfaces (zero external refs) — Verdict: CHECK FIRST (harmless TS types; safe to unexport)**
   - `src/lib/academicYears.ts:3` (`AcademicYearDefinition`)
   - `src/lib/sports.ts:1` (`SportDefinition`)
   - `src/lib/publicCache.ts:22, 28` (`RosterPagedCacheEntry`, `RosterSportInfoCacheEntry`)
   - `src/lib/data/credits.ts:93, 146` (`CreateCreditPersonInput`, `UpdateCreditPersonInput`)
   - `src/lib/data/site.ts:391, 397` (`PublicTickerCachePayload`, `PublicHomeCachePayload`)
   - `src/lib/data/teams.ts:902` (`OwnerLoginResult`)
   - `src/lib/data/types.ts:129` (`BulkRegisterEntryInput` — zero refs anywhere, even inside `src/lib/data/`)
   - `src/hooks/useAutoSlideshow.ts:6` (`AutoSlideshowResult`)
   - Component `*Props` / option types exported only for self-use: `BulkRegisterPanelProps` (`src/components/admin/BulkRegisterPanel.tsx:28`), `SecuredSequenceProps` (`src/components/projector/SecuredSequence.tsx:56`), `RosterPlayerCardProps` (`src/components/roster/RosterPlayerCard.tsx:6`), `RosterScoutModalProps` (`src/components/roster/RosterScoutModal.tsx:8`), `ButtonVariant`/`ButtonSize`/`ButtonProps` (`src/components/ui/Button.tsx:5-8`), `DialogProps` (`src/components/ui/Dialog.tsx:5`), `EmptyStateProps` (`src/components/ui/EmptyState.tsx:4`), `ErrorStateProps` (`src/components/ui/ErrorState.tsx:5`), `PageHeaderProps` (`src/components/ui/PageHeader.tsx:3`), `PaginationProps` (`src/components/ui/Pagination.tsx:4`), `SegmentedControlOption`/`SegmentedControlProps` (`src/components/ui/SegmentedControl.tsx:4, 11`), `SpinnerProps` (`src/components/ui/Spinner.tsx:4`).

### 3.3 Unused Component Props
1. **`SportCardsGridProps.sports` (`src/components/home/SportCardsGrid.tsx:10`) — Verdict: SAFE TO REMOVE**
   - **Evidence:** Declared optional (`sports?: Sport[]`) and imported `type { Sport }` on line 6, but never destructured or referenced anywhere in `SportCardsGrid.tsx:46-203` (the component iterates static `SPORTS` from `src/lib/sports.ts`). `src/pages/public/HomePage.tsx:620` still passes `sports={sports}` redundantly (`RostersPage.tsx:119` omits it).
2. **`NavigationMenuProps.activeSeason` (`src/components/layout/NavigationMenu.tsx:14`) — Verdict: SAFE TO REMOVE** *(New — leftover from earlier menu redesign)*
   - **Evidence:** Declared on `NavigationMenuProps` (line 14) with `import type { Season }` (line 9), but never destructured or read anywhere in `NavigationMenu.tsx:17-437`. Currently passed redundantly by 8 public pages (`ContentPage.tsx:130`, `HomePage.tsx:515`, `PlayerProfilePage.tsx:128`, `RosterSportPage.tsx:382, 418`, `RostersPage.tsx:103`, `RulesPage.tsx:105`, `SeasonTeamDetailPage.tsx:327`, `TeamsPage.tsx:176`).

### 3.4 Unused Imports, Local Constants, and State Variables (Caught by `tsc --noUnusedLocals --noUnusedParameters`)
1. **`src/components/layout/ErrorBoundary.tsx:1`** — `React` default import unused (JSX transform is `react-jsx`) — **Verdict: SAFE TO REMOVE**
2. **`src/lib/constants.ts:9`** — `PLAYER_STATUS_VALUES` unexported const, never read — **Verdict: SAFE TO REMOVE**
3. **`src/lib/constants.ts:29`** — `PROJECTOR_MODE_VALUES` unexported const, never read — **Verdict: SAFE TO REMOVE**
4. **`src/lib/constants.ts:51`** — `PROJECTOR_AUTO_FILTER_VALUES` unexported const, never read — **Verdict: SAFE TO REMOVE**
5. **`src/lib/data/players.ts:22`** — `getNextAthleteCode` imported from `./client`, never used in `players.ts` — **Verdict: SAFE TO REMOVE**
6. **`src/lib/data/site.ts:10`** — `demoBroadcastChannel` imported from `./client`, never used in `site.ts` — **Verdict: SAFE TO REMOVE**
7. **`src/lib/data/types.ts:11`** — `PlayerStatus` type imported from `../../types`, never used in `types.ts` — **Verdict: SAFE TO REMOVE**
8. **`src/pages/public/SeasonTeamDetailPage.tsx:112`** — `season` state value (`const [season, setSeason] = useState<Season | null>(...)`) is written (`setSeason`) at lines 225, 240, 267 but never read anywhere in the component (UI reads `team`, `teamPlayers`, etc.) — **Verdict: SAFE TO REMOVE** (state & `setSeason` calls can be removed after confirming no JSX needs season title; note `publicCache.seasonTeamDetails` stores `season` independently).

---

## 4. Unused Dependencies (`package.json`)

### 4.1 Declared in `package.json`, Never Imported
1. **`@number-flow/react` (`package.json:13`, `dependencies`) — Verdict: SAFE TO REMOVE** *(Still Open)*
   - **Evidence:** Zero imports or string references anywhere in `src/`, `index.html`, or config files.
2. **`autoprefixer` (`package.json:33`, `devDependencies`) — Verdict: SAFE TO REMOVE** *(Still Open)*
   - **Evidence:** Zero imports or config references. There is no `postcss.config.*`; Tailwind CSS v4 runs via `@tailwindcss/vite` (`vite.config.ts:5`), which uses Lightning CSS for vendor prefixing natively.
3. **`@types/node` (`package.json:27`), `@types/react` (`package.json:28`), `@types/react-dom` (`package.json:29`), `typescript` (`package.json:35`) — Verdict: KEEP**
   - **Evidence:** Type/compiler toolchain packages not imported directly in app source; required by `tsc` and `vite.config.ts` (`path`, `process`, `__dirname`).

### 4.2 Imported in Code, Missing from `package.json`
- **None (0 missing packages).** All third-party runtime imports (`@phosphor-icons/react`, `@supabase/supabase-js`, `canvas-confetti`, `motion/react`, `react`, `react-dom`, `react-router-dom`) and dev imports (`@tailwindcss/vite`, `@vitejs/plugin-react`, `tailwindcss`, `vite`) are declared in `package.json`. (`path` in `vite.config.ts:2` is a Node.js built-in typed by `@types/node`.)

---

## 5. Unused CSS

### 5.1 Unused Custom Properties & `@theme` Tokens in `src/index.css`
1. **`--on-media` & `@theme --color-on-media` (`src/index.css:25, 47, 69`) — Verdict: SAFE TO REMOVE**
   - **Evidence:** Zero usages of `--on-media`, `text-on-media`, `bg-on-media`, or `on-media` anywhere in `src/` or `index.html`.
2. **`--brand-gradient-start` & `@theme --color-brand-start` (`src/index.css:27, 49, 71`) — Verdict: SAFE TO REMOVE**
   - **Evidence:** Zero usages of `--brand-gradient-start` or `brand-start` anywhere in `src/` or `index.html`.
3. **`--brand-gradient-end` & `@theme --color-brand-end` (`src/index.css:28, 50, 72`) — Verdict: SAFE TO REMOVE**
   - **Evidence:** Zero usages of `--brand-gradient-end` or `brand-end` anywhere in `src/` or `index.html`.
4. **`--menu-bg` & `@theme --color-menu-bg` (`src/index.css:26, 48, 70`) — Verdict: CHECK FIRST** *(Leftover from old opaque dark navigation menu before frosted overlay rework)*
   - **Evidence:** `NavigationMenu.tsx` no longer uses `bg-menu-bg` (it uses `.frost-strong`). Only **1 reference** remains in the entire repo: `src/pages/admin/AdminLayout.tsx:295` (a confetti-cooldown error tooltip using `bg-menu-bg`). Replacing that single tooltip with `bg-surface` or `.frost-strong` would allow removing `--menu-bg` and `--color-menu-bg`.

### 5.2 Undefined / No-Op Utility Class in TSX
1. **`font-dm-sans` (`src/pages/public/OwnerLoginPage.tsx:76`, `src/pages/public/SeasonTeamDetailPage.tsx:512, 628`) — Verdict: SAFE TO REMOVE** *(New / carried over into Owner Panel)*
   - **Evidence:** `src/index.css:53-73` defines `--font-sans` in `@theme inline`, NOT `--font-dm-sans`. Tailwind v4 does not generate a `.font-dm-sans` utility, so these 3 class names emit no CSS (DM Sans is already inherited from `body` at `src/index.css:79`). Replace with `font-sans` or drop the class.

### 5.3 Custom Classes & `@keyframes` in `src/index.css`
- **All 13 custom classes and all 6 `@keyframes` in `src/index.css` are actively used — Verdict: KEEP:**
  - `.font-syne` (144 refs), `.font-dot` (6 refs), `.no-transitions` (2 refs in `src/lib/theme.tsx`), `.animate-blob-rotate` / `blobRotate` (1 ref), `.animate-blob-drift-a` / `blobDriftA` (2 refs), `.animate-blob-drift-b` / `blobDriftB` (1 ref), `.animate-hero-line` / `heroLineReveal` (1 ref), `.animate-ticker` / `tickerMarquee` (2 refs), `.skeleton-shimmer` / `fieldrSkeletonShimmer` (2 refs), `.thin-scrollbar` (8 refs), `.frost` (16 refs), `.frost-strong` (7 refs), `.frost-deep` (1 ref in `RosterScoutModal.tsx`).

### 5.4 Inline `<style>` Blocks in Components
All 4 inline `<style>` blocks inject active keyframes/rules (none are dead), but they sit outside `src/index.css` and are re-mounted per component instance:
1. **`src/components/home/TickerStrip.tsx:450-525`** (`tickerWipeReveal`, `tickerItemRiseIn`, `tickerSimpleFadeIn`, `tickerCrossfadeOut`, `.ticker-wipe-enter`, `.ticker-fade-enter-reduced`, `.ticker-item-enter`, `.ticker-crossfade-in`, `.ticker-crossfade-in-reduced`, `.ticker-crossfade-out`) — **Verdict: KEEP** (all classes referenced in `TickerStrip.tsx:53, 63-64, 422, 554-555`; optional future refactor: move to `src/index.css`).
2. **`src/components/layout/HeaderBar.tsx:51-68`** (`.public-site-header`, `.public-site-header__backdrop`, `.public-site-header--scrolled`) — **Verdict: KEEP** (actively drives scroll-triggered `.frost` fade on the public header; optional refactor: move to `src/index.css`).
3. **`src/pages/admin/AdminAuction.tsx:770-789`** (`auctionPricePop`, `.auction-price-pop`) — **Verdict: KEEP** (actively animates price updates in redesigned Auction Room; optional refactor: move to `src/index.css`).
4. **`src/pages/admin/AdminLayout.tsx:134-143`** (`fieldrConfettiCooldownBar`) — **Verdict: KEEP** (actively drives confetti button cooldown progress bar; optional refactor: move to `src/index.css`).

---

## 6. Conflicting or Duplicate Code

### 6.1 Scroll Lock — **Status: FIXED**
- **Current state:** Unified cleanly into `src/hooks/useBodyScrollLock.ts:27` with reference counting (`NavigationMenu.tsx:76`, `RosterScoutModal.tsx:24`, `Dialog.tsx:44`, `AdminLayout.tsx:121`). Zero rogue `document.body.style.overflow` writes exist outside `useBodyScrollLock.ts`. **Verdict: KEEP.**

### 6.2 Team Colour Validation & Rim Styling — **Status: NEW DUPLICATION (4 copies)**
- **Files & Lines:**
  - `src/pages/admin/AdminTeams.tsx:44` (`getValidTeamColor`)
  - `src/pages/admin/AdminAuction.tsx:81` (`getValidTeamColor`)
  - `src/pages/public/SeasonTeamDetailPage.tsx:55` (`getValidTeamColor`)
  - `src/pages/public/TeamsPage.tsx:61` (`getValidTeamColor`)
- **Pattern:** Four identical private copies of `getValidTeamColor(color?: string | null): string | null` plus identical `border-[color:color-mix(in_srgb,var(--team-color)_75%,transparent)]` rim class wiring across all 4 files (lines `AdminTeams.tsx:588-593`, `AdminAuction.tsx:1050-1055, 1189-1194, 1600-1605`, `SeasonTeamDetailPage.tsx:389-394`, `TeamsPage.tsx:257-262`).
- **Verdict: CHECK FIRST** — All 4 copies are current and consistent; consolidate into a single shared helper in `src/lib/utils.ts` during cleanup.

### 6.3 Date, Name, and Points Formatting — **Status: DUPLICATE HELPERS**
1. **Duplicate Date Formatters (3 identical copies):**
   - `src/lib/data/rules.ts:14` (`formatRulesDate` — exported)
   - `src/components/admin/HandbookSetupCard.tsx:56` (`formatHandbookDate` — local copy)
   - `src/pages/public/HandbookPage.tsx:26` (`formatHandbookDate` — local copy)
   - All three format ISO strings with identical `toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })`. **Verdict: CHECK FIRST** (consolidate into `src/lib/utils.ts`).
2. **Overlapping Name Formatters (2 copies):**
   - `src/components/roster/RosterScoutModal.tsx:14` (`formatAthleteName`)
   - `src/pages/admin/AdminAuction.tsx:96` (`formatBalancedName`)
   - **Verdict: CHECK FIRST** (check if intentionally different wrapping rules or mergeable).
3. **Points Formatting (`formatPoints`):**
   - Centralized cleanly in `src/lib/utils.ts:35`. **Verdict: KEEP.**

### 6.4 Frost / Surface Styles — **Status: MIXED (Shared `.frost*` vs Hand-Rolled `backdrop-blur-md`)**
- **Current Shared Classes:** `.frost` (`src/index.css:280`), `.frost-strong` (`src/index.css:285`), `.frost-deep` (`src/index.css:306`) — all include `@supports` and `prefers-reduced-transparency` fallbacks.
- **Leftover Hand-Rolled Blur Surfaces (7 instances without reduced-transparency fallback):**
  - `src/pages/admin/AdminSetup.tsx:2133` (`bg-surface/90 backdrop-blur-md`)
  - `src/pages/public/ProjectorPage.tsx:517, 1620, 1640, 1807, 1812, 2055` (`bg-surface/90 backdrop-blur-md` and `bg-bg/90 backdrop-blur-md`)
- **Verdict: CHECK FIRST** — Current `.frost*` classes are the intended system; the 7 `backdrop-blur-md` overlays in `ProjectorPage.tsx` and `AdminSetup.tsx` (preview bar) are older patterns that can be evaluated against projector contrast requirements before migrating.

### 6.5 Skeleton Components vs Ad-Hoc `animate-pulse` Placeholders
- **Current Shared System:** `src/components/ui/Skeleton.tsx` using `.skeleton-shimmer` (`src/index.css:204-241`).
- **Leftover Ad-Hoc `animate-pulse` Loading Placeholders (4 instances):**
  - `src/components/admin/CreditsSetupCard.tsx:451`
  - `src/components/admin/HandbookSetupCard.tsx:555`
  - `src/components/admin/RulesSetupCard.tsx:291`
  - `src/pages/admin/AdminTeams.tsx:1049` (`Loading status...`)
  - *(Note: `AdminSetup.tsx:2135` and `ProjectorPage.tsx:1972` use `animate-pulse` for live status indicator dots, not skeletons — **Verdict: KEEP**.)*
- **Verdict: CHECK FIRST** — Replace the 4 ad-hoc pulse placeholders with `SkeletonBlock` for consistent shimmer and reduced-motion handling.

### 6.6 Overlapping Cache Layers (3 Separate Caches)
1. **`src/lib/publicCache.ts`** — In-memory singleton for public pages (has 2 dead entries: `seasonCards` and `seasonDetails`, see Section 3.2).
2. **`src/lib/queryCache.ts`** — Separate in-memory TTL map (`memoryQueryCache`) used **only** for `'admin:bundle'` in `src/pages/admin/AdminPage.tsx:64, 88, 190, 230-231` (plus route/tab module prefetching `prefetchRoute` / `prefetchAdminTab`).
3. **`src/lib/data/site.ts:388-670`** — `localStorage` persistent cache (`fieldr_public_ticker_v1`, `fieldr_public_home_v1`) for instant Home/Ticker paint.
   - **Conflict/Duplication:** `src/lib/data/seasons.ts:23` manually calls `localStorage.removeItem('fieldr_public_home_v1')` with a hardcoded string instead of calling `invalidateCachedPublicHome()` from `src/lib/data/site.ts:659` (which also clears in-memory state).
- **Verdict: CHECK FIRST** — Keep the 3-tier distinction (public memory vs admin TTL vs home `localStorage`), but remove dead `publicCache` keys (`seasonCards`, `seasonDetails`) and route `seasons.ts:23` through `invalidateCachedPublicHome()`.

### 6.7 Season Lookups
- Public pages and data modules call `getActiveSeason()` (with `publicCache.activeSeason` hydration), while `AdminPage.tsx:159, 162` and `ProjectorPage.tsx:1096, 1160, 1341` call `getSeasons()` and pick `s.is_active || allSeasons[0]`.
- **Verdict: KEEP** — Admin needs the full seasons list for the season switcher, and Projector needs full season metadata; no conflicting fallback logic.

### 6.8 Direct `supabase` Client Usage Outside `src/lib/data/`
6 files outside `src/lib/data/` import and query `supabase` directly instead of going through `src/lib/data/`:
1. **`src/lib/AuthContext.tsx:17, 54, 65`** (`supabase.auth.onAuthStateChange`) — **Verdict: KEEP** (auth listener belongs in AuthContext).
2. **`src/components/admin/HandbookSetupCard.tsx:15, 69, 112-118, 179-191, 286-342`** (queries `handbook_settings`, `handbooks`, and `handbooks` storage bucket directly) — **Verdict: CHECK FIRST** (works, but bypasses the `src/lib/data/` abstraction used by `rules.ts` and `credits.ts`).
3. **`src/pages/public/HandbookPage.tsx:13, 47, 89`** (calls `handbook_list` RPC and `handbooks` storage bucket directly) — **Verdict: CHECK FIRST** (extracting a `src/lib/data/handbooks.ts` would align with `rules.ts`).
4. **`src/pages/public/OwnerLoginPage.tsx:7, 42, 53, 60`** (calls `supabase.auth.signInWithPassword`, queries `profiles`, calls `signOut` directly) — **Verdict: CHECK FIRST** (duplicates sign-in/profile lookup logic from `src/lib/data/auth.ts:72-91`).
5. **`src/pages/public/SeasonTeamDetailPage.tsx:22, 132, 138, 145`** (calls `owner_team_overview` RPC directly) — **Verdict: CHECK FIRST** (works, bypasses `src/lib/data/`).
6. **`src/components/admin/RulesSetupCard.tsx:13, 31, 49, 113, 152`** (imports `supabase` only for boolean availability checks `Boolean(supabase)`, while calling `src/lib/data/rules.ts` for actual queries) — **Verdict: CHECK FIRST** (redundant with `!isDemoMode` since `supabase !== null` iff `!isDemoMode` at `client.ts:10-14`).

### 6.9 Image & Storage URL Helpers
- **Duplicate bucket path extractors:** `extractFieldrAssetPath` (`src/lib/data/storage.ts:19`) and `extractCreditsBucketPath` (`src/lib/data/credits.ts:23`) duplicate URL-to-storage-path parsing for different buckets. **Verdict: CHECK FIRST** (candidate to share a parameterized helper).
- **Repeated photo fallback expressions:** `photo_thumb_url || photo_url` (thumbnails/lists) vs `photo_url || photo_thumb_url` (hero/stage/modal) is written inline across 15+ locations, while `ProjectorPage.tsx:99` defines a local `getPlayerPrimaryPhotoUrl(player)` helper. **Verdict: CHECK FIRST** (consistent thumb-vs-full choice, optional consolidation).

### 6.10 Duplicate Sport Constants
- **4 separate definitions of the 3 sports:**
  - `src/lib/sports.ts` (`SPORTS` — canonical public UI metadata)
  - `src/lib/data/client.ts:76` (`DEFAULT_SPORTS` — canonical fallback with default roles)
  - `src/pages/admin/AdminTeams.tsx:32` & `src/pages/public/TeamsPage.tsx:76` (`const SPORT_ORDER = ['Cricket', 'Futsal', 'Volleyball']` — 2 identical copies)
  - `src/pages/public/RosterSportPage.tsx:23` (`const KNOWN_SPORT_SLUGS = new Set(['cricket', 'futsal', 'volleyball'])`)
- **Verdict: CHECK FIRST** — Derive `SPORT_ORDER` and `KNOWN_SPORT_SLUGS` from `SPORTS` in `src/lib/sports.ts`.

### 6.11 Legacy Combined Admin Tab Conditions
- In `src/pages/admin/AdminPage.tsx:121-122`, `handleSelectTab` normalizes `'players' -> 'athletes'` and `'purses' -> 'teams'`, so `currentTab` can never become `'players'` or `'purses'`.
- Yet `AdminPage.tsx:78, 323, 351` and `src/lib/queryCache.ts:126, 131` still check `'players'` and `'purses'` as branch cases (while rendering `AdminPlayers` under `athletes` and `AdminPurses` under `teams`).
- **Verdict: CHECK FIRST** — Both `AdminPlayers` and `AdminPurses` ARE actively rendered (under the combined `athletes` and `teams` tabs), so DO NOT delete those components; only the unreachable `'players'` / `'purses'` union members in `AdminTab` (`src/types/index.ts`) and branch checks can be cleaned up after checking if any `onGoToTab('players' | 'purses')` calls still exist in `AdminDashboard` or `AdminPlayers`.

### 6.12 CSS `!important` Usage
- **All 9 `!important` declarations are legitimate accessibility/theme-switch overrides — Verdict: KEEP:**
  - `src/index.css:117` (`.no-transitions` instant theme switch)
  - `src/index.css:233, 236, 239, 240` (`@media (prefers-reduced-motion: reduce)` disabling animations/shimmer)
  - `src/components/home/TickerStrip.tsx:517, 518, 521, 522` (`@media (prefers-reduced-motion: reduce)` overriding ticker keyframes)
- **No conflicting `!important` fights exist.**

---

## 7. Routes and Access (`src/App.tsx`)

| Route (`src/App.tsx`) | Component / Target | Guard | Notes & Verdict |
|---|---|---|---|
| `/` (line 103) | `HomePage` (static import) | Public | Main landing page. **KEEP** |
| `/teams` (line 111) | `TeamsPage` (lazy) | Public | Teams directory. **KEEP** |
| `/season` (line 118) | `<Navigate to="/teams" replace />` | Public | Legacy redirect. **KEEP** (or check external links before removing) |
| `/season/:id` (line 119) | `<Navigate to="/teams" replace />` | Public | Legacy redirect. **KEEP** (or check bookmarks/shared links) |
| `/season/:id/teams/:teamId` (line 121) | `SeasonTeamDetailPage` (lazy) | Public + inline owner check | Public squad view; Owner Panel renders only if `user?.role === 'owner'` and server RPC `owner_team_overview` validates ownership (`SeasonTeamDetailPage.tsx:138-145`). **KEEP** |
| `/players/:code` (line 129) | `PlayerProfilePage` (lazy) | Public | Universal athlete profile. **KEEP** |
| `/rosters` (line 137) | `RostersPage` (lazy) | Public | Sport selector for rosters. **KEEP** |
| `/rosters/:sport` (line 145) | `RosterSportPage` (lazy) | Public | Sport-filtered roster. **KEEP** |
| `/help` (line 153) | `ContentPage` (`pageKey="help_content"`) | Public | Help & FAQ page. **KEEP** |
| `/about` (line 161) | `ContentPage` (`pageKey="about_content"`) | Public | About & credits page. **KEEP** |
| `/rules` (line 169) | `RulesPage` (lazy) | Public | Official rules PDFs. **KEEP** |
| `/handbook` (line 177) | `HandbookPage` (lazy) | Access-code gated (`handbook_list` RPC) | Unauthenticated route, but server-side RPC `handbook_list` verifies `p_code` before returning rows (`HandbookPage.tsx:89-91`). **KEEP** |
| `/login` (line 185) | `LoginPage` (lazy) | Public | Admin/Projector sign-in. **KEEP** |
| `/owner-login` (line 193) | `OwnerLoginPage` (lazy) | Public | Owner sign-in; verifies `profiles.role === 'owner'` before navigating to `/teams` (`OwnerLoginPage.tsx:53-63`). **KEEP** |
| `/admin` (line 201) | `AdminPage` (lazy) | `RouteGuard allowedRoles={['admin']}` | Full admin command center. **KEEP** |
| `/admin/logs` (line 211) | `AdminPage` (lazy, opens `logs` tab) | `RouteGuard allowedRoles={['admin']}` | Dedicated deep-link route for Activity Logs (`AdminPage.tsx:91, 112`). **KEEP** |
| `/projector` (line 221) | `ProjectorPage` (lazy) | `RouteGuard allowedRoles={['admin', 'projector']}` | Synchronized projector display. **KEEP** |
| `*` (line 231) | `<Navigate to="/" replace />` | Public | Catch-all fallback. **KEEP** |

### Access Audit Observations
- **No unprotected admin or projector routes exist.** Every `/admin*` route requires `allowedRoles={['admin']}` via `src/components/layout/RouteGuard.tsx:16-99`, and `/projector` requires `allowedRoles={['admin', 'projector']}`.
- **Minor Edge Case in `src/pages/public/LoginPage.tsx:32-36` — Verdict: CHECK FIRST:** If an `owner` signs in on `/login` instead of `/owner-login`, `LoginPage.tsx:32-36` only checks `user.role === 'admin' ? navigate('/admin') : navigate('/projector')`, sending an owner to `/projector` where `RouteGuard` then redirects them to `/`. Consider handling `owner` explicitly or redirecting owners to `/teams`.
- **Minor Edge Case in `src/lib/data/auth.ts:68, 89` — Verdict: CHECK FIRST:** If a user's `profiles` row cannot be read, `supabaseAuthService` defaults `role` to `'projector'` (`(profile?.role as UserRole) || 'projector'`). While database RLS still protects backend data, failing closed (e.g., returning `null` or denying access if `profile` is missing) is safer than defaulting to `'projector'`.

---

## 8. Leftovers

1. **`console.log` / `console.debug` / `console.warn` — 0 occurrences.** *(Fixed / Clean.)* Only `console.error` calls exist for genuine error catch blocks (29 calls across `src/lib/data/*` and `src/pages/*` — **Verdict: KEEP**).
2. **`debugger` statements — 0 occurrences.** *(Clean.)*
3. **`TODO` / `FIXME` / `HACK` / `XXX` comments — 0 occurrences.** *(Clean.)*
4. **Commented-out code blocks (> 5 consecutive lines) — 0 occurrences.** *(Clean.)*
5. **`"Sample"` string occurrences (2 total):**
   - `src/pages/admin/AdminSetup.tsx:988` (`// Sample data for the preview overlay` — drives the live Secured overlay preview button in Admin Setup using the first season team or fallback) — **Verdict: KEEP**.
   - `src/pages/admin/AdminTeams.tsx:976` (`<span>Download Sample Template</span>` — user-facing CSV import template button) — **Verdict: KEEP**.
6. **Hardcoded Demo Seed Data (`src/lib/data/client.ts:100-582`):**
   - Contains hardcoded sample athletes, teams, carousel messages, and season records for demo mode when Supabase env vars are missing — **Verdict: CHECK FIRST** (tied to the demo-mode decision in Section 2.4).
7. **Placeholder Email in Login UI (`src/pages/public/LoginPage.tsx:117`):**
   - Input `placeholder` attribute shows an example `@fieldr.app` email — **Verdict: KEEP** (UI placeholder only).

---

## 9. Secrets and Public Repo Safety

*Note: Per audit rules, ONLY file paths, line numbers, and variable names are reported below — zero credential values are included.*

1. **Git Tracking Check:**
   - The workspace directory `/app/applet` is **not** a git repository (`git status` exited with `fatal: not a git repository`).
   - `.gitignore:10-12` properly ignores `.env`, `.env.local`, `.env.*.local` while allowing `!.env.example`.
   - No `.env` or `.env.local` file exists in the workspace root (only `.env.example`).
2. **Environment Variable References (All Safe Public Client Vars):**
   - `src/lib/data/client.ts:7` — `supabaseUrl` (`import.meta.env.VITE_SUPABASE_URL`) — **Verdict: KEEP**
   - `src/lib/data/client.ts:8` — `supabaseAnonKey` (`import.meta.env.VITE_SUPABASE_ANON_KEY`) — **Verdict: KEEP** (Supabase anon/publishable key is designed to be public alongside RLS)
   - `vite.config.ts:17, 19` — `process.env.DISABLE_HMR` — **Verdict: KEEP**
   - `.env.example:1-4` — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` placeholders, plus a comment on line 2 explicitly warning never to use a `service_role` key — **Verdict: KEEP**
3. **GitHub Actions Keepalive Workflow (`.github/workflows/keepalive.yml:11-12`):**
   - Uses GitHub Secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` via `${{ secrets.* }}` — no hardcoded keys — **Verdict: KEEP**.
4. **Hardcoded Keys / Tokens / Passwords / Service-Role Keys Scan:**
   - **0 hardcoded JWTs, API keys, service-role keys, or passwords** found in `src/`, `public/`, `index.html`, `vercel.json`, `metadata.json`, or root config files.
   - `src/lib/data/auth.ts:31` — variable `email` holds demo-mode role email strings used only when `isDemoMode` is true (never sent to Supabase) — **Verdict: CHECK FIRST** (tied to demo mode).
   - `src/pages/public/OwnerLoginPage.tsx:41` — variable `email` constructs the owner auth email domain suffix from user-entered `loginId` — **Verdict: KEEP** (no password or secret stored).
   - `src/pages/public/HandbookPage.tsx:16, 111` — `HANDBOOK_SESSION_KEY` stores the user-entered handbook access code in `sessionStorage` so reload stays unlocked until tab close or Lock click — **Verdict: KEEP** (acceptable session-scoped UX, cleared on lock/failure).

---

## 10. SQL or Database References

*No SQL is printed below; only database object names, storage bucket names, and frontend call sites are listed.*

### 10.1 Tables & Views Called via `.from(...)` (21 total)

| Object Name | In Documented Core Set? | Present in Repo `supabase/*.sql`? | Call Sites | Verdict |
|---|---|---|---|---|
| `athletes` | Yes | Yes | `src/lib/data/athletes.ts` (9 calls + realtime) | **KEEP** |
| `carousel_items` | Yes | Yes | `src/lib/data/site.ts`, `seasons.ts` (11 calls) | **KEEP** |
| `players` | Yes | Yes | `src/lib/data/players.ts`, `athletes.ts` (23 calls + realtime) | **KEEP** |
| `profiles` | Yes | Yes | `src/lib/data/auth.ts:60, 81`, `OwnerLoginPage.tsx:54` | **KEEP** |
| `projector_state` | Yes | Yes | `src/lib/data/projector.ts`, `auction.ts`, `players.ts` (9 calls + realtime) | **KEEP** |
| `public_players` (view) | Yes | Yes | `src/lib/data/players.ts`, `athletes.ts` (7 calls) | **KEEP** |
| `public_teams` (view) | Yes | Yes | `src/lib/data/teams.ts:761` (1 call) | **KEEP** |
| `purse_transactions` | Yes | Yes | `src/lib/data/purses.ts`, `seasons.ts`, `teams.ts` (5 calls) | **KEEP** |
| `rules_documents` | Yes (documented) | **No** | `src/lib/data/rules.ts:45, 83, 112` | **KEEP** (verify repo migration sync) |
| `seasons` | Yes | Yes | `src/lib/data/seasons.ts`, `athletes.ts` (12 calls) | **KEEP** |
| `site_settings` | Yes (documented) | Yes | `src/lib/data/site.ts:312, 332, 372` | **KEEP** |
| `sports` | Yes | Yes | `src/lib/data/teams.ts:422-639` (5 calls) | **KEEP** |
| `teams` | Yes | Yes | `src/lib/data/teams.ts`, `players.ts`, `seasons.ts` (8 calls + realtime) | **KEEP** |
| `public_squads` (view) | **No** (not in base list / repo SQL) | **No** | `src/lib/data/athletes.ts:484`, `players.ts:691, 844` | **CHECK FIRST** (active public squad view in production; missing from `supabase/*.sql`) |
| `auction_bids` | **No** (auction room schema) | **No** | `src/lib/data/auction.ts:738` (+ realtime line 953) | **CHECK FIRST** (active in live Auction Room; missing from `supabase/*.sql`) |
| `auction_queue` | **No** (auction room schema) | **No** | `src/lib/data/auction.ts:1119` (+ realtime line 981) | **CHECK FIRST** (active in live Auction Room; missing from `supabase/*.sql`) |
| `auction_sales` | **No** (auction room schema) | **No** | `src/lib/data/auction.ts:756, 779` (+ realtime line 962) | **CHECK FIRST** (active in live Auction Room; missing from `supabase/*.sql`) |
| `auction_settings` | **No** (auction room schema) | **No** | `src/lib/data/auction.ts:612, 655` (+ realtime lines 706, 971) | **CHECK FIRST** (active in Admin Setup & Projector; missing from `supabase/*.sql`) |
| `credits_people` | **No** (credits feature) | **No** | `src/lib/data/credits.ts:81, 134, 205, 225, 243` | **CHECK FIRST** (active on About page & Admin Setup; missing from `supabase/*.sql`) |
| `handbook_settings` | **No** (handbook feature) | **No** | `src/components/admin/HandbookSetupCard.tsx:113, 180, 191` | **CHECK FIRST** (active in Admin Setup; direct component query; missing from `supabase/*.sql`) |
| `handbooks` | **No** (handbook feature) | **No** | `src/components/admin/HandbookSetupCard.tsx:118, 300, 342` | **CHECK FIRST** (active in Admin Setup; direct component query; missing from `supabase/*.sql`) |

### 10.2 RPC Functions Called via `.rpc(...)` & Workflows (23 total)

| RPC Name | Documented / Repo SQL? | Call Sites | Verdict |
|---|---|---|---|
| `assign_player_to_team` | Yes (both) | `src/lib/data/players.ts:1134` | **KEEP** |
| `unassign_player_from_team` | Yes (both) | `src/lib/data/players.ts:1182` | **KEEP** |
| `delete_season` | Yes (both) | `src/lib/data/seasons.ts:409` | **KEEP** |
| `rename_season` | Admin-checked RPC (not in repo SQL) | `src/lib/data/seasons.ts:315` | **KEEP** (verify repo SQL sync) |
| `rename_sport_role` | Yes (in repo SQL) | `src/lib/data/teams.ts:538` | **KEEP** |
| `reset_all_purses` | Yes (both) | `src/lib/data/purses.ts:207` | **KEEP** |
| `set_broadcast_message` | Documented (not in repo SQL) | `src/lib/data/projector.ts:324` | **KEEP** |
| `trigger_confetti` | Documented (not in repo SQL) | `src/lib/data/projector.ts:349` | **KEEP** |
| `keepalive` | Documented (not in repo SQL) | `.github/workflows/keepalive.yml:12` | **KEEP** |
| `admin_activity_log` | **Not in base doc / repo SQL** | `src/lib/data/logs.ts:129` (used by `AdminLogs.tsx`) | **CHECK FIRST** (verify admin role check on DB function) |
| `auction_bring_to_stage` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:796` | **CHECK FIRST** (active Auction Room RPC; verify admin guard & doc/SQL sync) |
| `auction_place_bid` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:809` | **CHECK FIRST** (active Auction Room RPC) |
| `auction_clear_bid` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:823` | **CHECK FIRST** (active Auction Room RPC) |
| `auction_secure` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:836` | **CHECK FIRST** (active Auction Room RPC) |
| `auction_mark_unsold` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:849` | **CHECK FIRST** (active Auction Room RPC) |
| `auction_undo_last_sale` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:862` | **CHECK FIRST** (active Auction Room RPC) |
| `queue_add_player` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:1162` | **CHECK FIRST** (active Auction Queue RPC) |
| `queue_add_by_codes` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:1248` | **CHECK FIRST** (active Auction Queue RPC) |
| `queue_remove` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:1263` | **CHECK FIRST** (active Auction Queue RPC) |
| `queue_clear` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:1275` | **CHECK FIRST** (active Auction Queue RPC) |
| `queue_move` | **Not in base doc / repo SQL** | `src/lib/data/auction.ts:1291` | **CHECK FIRST** (active Auction Queue RPC) |
| `handbook_list` | **Not in base doc / repo SQL** | `src/pages/public/HandbookPage.tsx:89` | **CHECK FIRST** (public access-code RPC; verify `p_code` security on DB) |
| `owner_team_overview` | **Not in base doc / repo SQL** | `src/pages/public/SeasonTeamDetailPage.tsx:145` | **CHECK FIRST** (owner-scoped RPC; verify `auth.uid()` ownership check on DB) |

### 10.3 Storage Buckets Referenced (4 total)
- `'fieldr-assets'` (`src/lib/data/storage.ts:73-154`) — **KEEP**
- `'credits'` (`CREDITS_BUCKET`, `src/lib/data/credits.ts:48, 59, 69`) — **KEEP**
- `'rules'` (`RULES_BUCKET`, `src/lib/data/rules.ts:35, 71, 92, 105`) — **KEEP**
- `'handbooks'` (`HANDBOOK_BUCKET`, `src/components/admin/HandbookSetupCard.tsx:69, 286, 309, 332`, `src/pages/public/HandbookPage.tsx:47`) — **KEEP**

### 10.4 Data-Layer Functions Calling a Table/RPC Nothing Else Uses
- **Zero orphaned table/RPC calls exist from unused data-layer functions:** The only completely unused data-layer function (`getActiveTeams` in `src/lib/data/teams.ts:663, 887`) queries `teams`, which is heavily used elsewhere. Every single table, view, and RPC listed above has at least one live UI caller (or scheduled workflow for `keepalive`).

---

## 11. Summary Table & Proposed Cleanup Order

| Order | Finding Group | SAFE TO REMOVE | CHECK FIRST | KEEP | Files Involved |
|---|---|---:|---:|---:|---|
| 1 (Safest) | Unused files & orphaned public images (Sec. 2.1–2.2) | 5 | 0 | 5 | `src/components/home/SportEquipmentSvgs.tsx`, `src/components/layout/index.ts`, `public/assets/aistudio/*` (3 JPEGs) |
| 2 | Unused dependencies (Sec. 4) | 2 | 0 | 4 | `package.json` (`@number-flow/react`, `autoprefixer`) |
| 3 | Unused imports, local consts, state & stale comment (Sec. 2.5, 3.4) | 9 | 0 | 0 | `ErrorBoundary.tsx`, `constants.ts`, `players.ts`, `site.ts`, `types.ts`, `SeasonTeamDetailPage.tsx`, `src/index.css:1` |
| 4 | Unused CSS tokens & no-op `font-dm-sans` class (Sec. 5.1–5.2) | 4 | 1 | 13 | `src/index.css` (`--on-media`, `--brand-gradient-*`, `--menu-bg`), `OwnerLoginPage.tsx`, `SeasonTeamDetailPage.tsx`, `AdminLayout.tsx` |
| 5 | Unused component props, `'home'` skeleton variant & dead `publicCache` keys (Sec. 2.3, 3.2–3.3) | 7 | 0 | 10 | `SportCardsGrid.tsx`, `HomePage.tsx`, `NavigationMenu.tsx` (+8 public pages), `Skeleton.tsx`, `publicCache.ts`, `seasons.ts`, `SeasonTeamDetailPage.tsx` |
| 6 | Unused data-layer function (`getActiveTeams`) & unnecessary `export` keywords (Sec. 3.1–3.2) | 22 | 5 | 1 | `teams.ts`, `types.ts`, `site.ts`, `queryCache.ts`, `theme.tsx`, `auction.ts`, `client.ts`, `credits.ts`, `storage.ts`, `AdminNav.tsx`, `CreditsSection.tsx`, `ProjectorConfetti.tsx` |
| 7 | Build/TS config hardening (Sec. 1) | 0 | 3 | 0 | `vite.config.ts` (`import.meta.dirname`, chunking), `tsconfig.json` (`noUnusedLocals` / `noUnusedParameters`) |
| 8 | Duplicate helpers & UI consistency consolidation (Sec. 6.2–6.11) | 0 | 10 | 2 | `AdminTeams.tsx`, `AdminAuction.tsx`, `TeamsPage.tsx`, `SeasonTeamDetailPage.tsx`, `HandbookSetupCard.tsx`, `HandbookPage.tsx`, `rules.ts`, `ProjectorPage.tsx`, `AdminSetup.tsx`, `CreditsSetupCard.tsx`, `RulesSetupCard.tsx`, `AdminPage.tsx` |
| 9 | Auth/login edge cases & direct `supabase` calls outside `src/lib/data/` (Sec. 6.8, 7) | 0 | 7 | 18 | `LoginPage.tsx`, `OwnerLoginPage.tsx`, `auth.ts`, `HandbookSetupCard.tsx`, `HandbookPage.tsx`, `SeasonTeamDetailPage.tsx`, `RulesSetupCard.tsx` |
| 10 (Riskiest) | Demo-mode decision & repo docs/DB schema documentation sync (Sec. 2.4–2.5, 8, 10) | 0 | 23 | 17 | `src/lib/data/*`, `AuthContext.tsx`, `LoginPage.tsx`, `README.md`, `supabase/*.sql` (schema sync check only) |
