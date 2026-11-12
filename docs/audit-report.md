# Fieldr Application Audit Report

---

## 1. Unused Code

### 1A. SURE Unused Code (No import, route, RPC call, realtime subscription, or dynamic reference anywhere)

- **File:** `package.json` — `autoprefixer` (`devDependencies`)
  - **Status:** `SURE`
  - **What is wrong:** `autoprefixer` (`^10.4.21`) is listed in `devDependencies`, but Tailwind CSS v4 (`@tailwindcss/vite`) handles vendor prefixing internally without PostCSS/Autoprefixer and no `postcss.config` exists.
  - **Risk:** `low`
  - **Suggested fix:** Remove `"autoprefixer": "^10.4.21"` from `devDependencies` in `package.json`.

- **File:** `src/lib/types.ts` — entire file (`export * from '../types'`)
  - **Status:** `SURE`
  - **What is wrong:** Re-export shim file is never imported by any module in `src/` (all modules import from `../types`, `../../types`, or `./types` inside `src/lib/data/`).
  - **Risk:** `low`
  - **Suggested fix:** Delete `src/lib/types.ts`.

- **File:** `src/hooks/useDebounce.ts` & `src/hooks/index.ts` — `useDebounce` hook and barrel file
  - **Status:** `SURE`
  - **What is wrong:** `useDebounce` and `src/hooks/index.ts` are never imported anywhere (`AdminAthletes.tsx` and `AdminPlayers.tsx` implement inline `setTimeout` debounce effects instead).
  - **Risk:** `low`
  - **Suggested fix:** Delete `src/hooks/useDebounce.ts` and `src/hooks/index.ts`, or adopt `useDebounce` in `AdminAthletes.tsx` and `AdminPlayers.tsx`.

- **File:** `src/components/admin/index.ts` — entire barrel file (`export * from './BulkRegisterPanel'`)
  - **Status:** `SURE`
  - **What is wrong:** Nothing imports `src/components/admin/index.ts` (`AdminPlayers.tsx` imports directly from `../../components/admin/BulkRegisterPanel`).
  - **Risk:** `low`
  - **Suggested fix:** Delete `src/components/admin/index.ts`.

- **File:** `src/components/home/index.ts` — entire barrel file
  - **Status:** `SURE`
  - **What is wrong:** No file imports from `src/components/home` barrel; `HomePage.tsx`, `RostersPage.tsx`, and `ProjectorPage.tsx` import directly from the individual component files.
  - **Risk:** `low`
  - **Suggested fix:** Delete `src/components/home/index.ts`.

- **File:** `src/pages/admin/AdminLayout.tsx` — `Coins` icon import
  - **Status:** `SURE`
  - **What is wrong:** `Coins` is imported from `@phosphor-icons/react` on line 9 but never referenced after removing the Purses sidebar tab.
  - **Risk:** `low`
  - **Suggested fix:** Remove `Coins` from the `@phosphor-icons/react` import in `src/pages/admin/AdminLayout.tsx`.

- **File:** `src/pages/admin/AdminPurses.tsx` — `PageHeader` import
  - **Status:** `SURE`
  - **What is wrong:** `PageHeader` is imported from `../../components/ui` on line 12 but is unused after converting `AdminPurses` to an embedded section under `AdminTeams`.
  - **Risk:** `low`
  - **Suggested fix:** Remove `PageHeader` from the `../../components/ui` import in `src/pages/admin/AdminPurses.tsx`.

- **File:** `src/pages/admin/AdminAuction.tsx` — Unused Phosphor icon imports (`ArrowRight`, `CheckCircle`, `ClockCounterClockwise`, `Coins`, `Prohibit`, `ShieldCheck`, `User`, `XCircle`)
  - **Status:** `SURE`
  - **What is wrong:** Eight icons imported from `@phosphor-icons/react` at lines 4–20 are never rendered in `AdminAuction.tsx`.
  - **Risk:** `low`
  - **Suggested fix:** Remove `ArrowRight`, `CheckCircle`, `ClockCounterClockwise`, `Coins`, `Prohibit`, `ShieldCheck`, `User`, and `XCircle` from the import list in `src/pages/admin/AdminAuction.tsx`.

- **File:** `src/pages/admin/AdminProjectorControl.tsx` — Unused `teams` prop in `AdminProjectorControlProps`
  - **Status:** `SURE`
  - **What is wrong:** `teams: Team[]` is declared in `AdminProjectorControlProps` and passed by `AdminPage.tsx`, but never destructured or used inside `AdminProjectorControl` (which loads its own `publicTeams` and `fullTeams`).
  - **Risk:** `low`
  - **Suggested fix:** Remove `teams` from `AdminProjectorControlProps` and from `<AdminProjectorControl />` in `src/pages/admin/AdminPage.tsx` (or use the passed prop instead of re-fetching).

- **File:** `src/pages/admin/AdminPlayers.tsx` — Unused `athletesVersion` prop in `AdminPlayersProps`
  - **Status:** `SURE`
  - **What is wrong:** `athletesVersion?: number` is declared in `AdminPlayersProps` and passed from `AdminPage.tsx`, but `AdminPlayers` never destructures or reads `athletesVersion`.
  - **Risk:** `low`
  - **Suggested fix:**Either remove `athletesVersion` from `AdminPlayersProps` or include it in the `useEffect` dependency array of `loadPagedPlayers` so athlete edits trigger a player table refresh.

- **File:** `src/lib/data/players.ts` & `src/lib/data/types.ts` — `bulkCreatePlayers`
  - **Status:** `SURE`
  - **What is wrong:** `bulkCreatePlayers` in `PlayersService`, `demoPlayersService`, `supabasePlayersService`, and `export const bulkCreatePlayers` is never called anywhere after removing CSV player import.
  - **Risk:** `low`
  - **Suggested fix:** Remove `bulkCreatePlayers` from `src/lib/data/types.ts` and `src/lib/data/players.ts`.

- **File:** `src/lib/data/site.ts` & `src/lib/data/types.ts` — `reorderCarouselItems` and `subscribeToCarouselItems`
  - **Status:** `SURE`
  - **What is wrong:** Both methods are implemented in `demoSiteService` and `supabaseSiteService` and exported from `src/lib/data/site.ts`, but neither is ever imported or called (`AdminSetup.tsx` uses `moveCarouselItem` instead, and no page subscribes to `fieldr-carousel-realtime`).
  - **Risk:** `low`
  - **Suggested fix:** Remove `reorderCarouselItems` and `subscribeToCarouselItems` from `src/lib/data/site.ts` and `src/lib/data/types.ts`.

- **File:** `src/lib/theme.tsx` & `src/hooks/useTheme.ts` — `useForceDarkTheme`
  - **Status:** `SURE`
  - **What is wrong:** `useForceDarkTheme` is defined in `src/lib/theme.tsx` and re-exported in `src/hooks/useTheme.ts`, but never called by any component.
  - **Risk:** `low`
  - **Suggested fix:** Remove `useForceDarkTheme` from `src/lib/theme.tsx` and `src/hooks/useTheme.ts`.

- **File:** `src/lib/sports.ts` — `getSportBySlug`, `getSportByNameOrSlug`, `isValidSport`
  - **Status:** `SURE`
  - **What is wrong:** All three helper functions exported from `src/lib/sports.ts` have zero callers outside `src/lib/sports.ts`.
  - **Risk:** `low`
  - **Suggested fix:** Remove `getSportBySlug`, `getSportByNameOrSlug`, and `isValidSport` from `src/lib/sports.ts`, or use them in place of ad-hoc sport string comparisons.

- **File:** `src/lib/utils.ts` — `sortSeasons`
  - **Status:** `SURE`
  - **What is wrong:** `sortSeasons` is exported on line 42 of `src/lib/utils.ts` and never imported anywhere (`seasons.ts` has its own internal `sortSeasonList` function).
  - **Risk:** `low`
  - **Suggested fix:** Remove `sortSeasons` from `src/lib/utils.ts`.

- **File:** `src/lib/academicYears.ts` — `isValidAcademicYear`
  - **Status:** `SURE`
  - **What is wrong:** `isValidAcademicYear` is exported on line 22 of `src/lib/academicYears.ts` and never imported anywhere.
  - **Risk:** `low`
  - **Suggested fix:** Remove `isValidAcademicYear` from `src/lib/academicYears.ts`.

- **File:** `src/lib/errors.ts` — `toAppError`
  - **Status:** `SURE`
  - **What is wrong:** `toAppError` is exported on line 18 of `src/lib/errors.ts` and never imported anywhere in the codebase.
  - **Risk:** `low`
  - **Suggested fix:** Remove `toAppError` from `src/lib/errors.ts`.

- **File:** `src/lib/constants.ts` — `PLAYER_STATUS_VALUES`, `PROJECTOR_MODE_VALUES`, `PROJECTOR_AUTO_FILTER_VALUES`, `PURSE_TX_TYPES`, `USER_ROLES`, `ADMIN_TABS` runtime arrays/objects
  - **Status:** `SURE`
  - **What is wrong:** These six exported constants are only used inside `src/lib/constants.ts` to derive TypeScript union types (`PlayerStatus`, `ProjectorMode`, etc.) and are never imported as runtime values anywhere else.
  - **Risk:** `low`
  - **Suggested fix:** Drop the `export` keyword from `PLAYER_STATUS_VALUES`, `PROJECTOR_MODE_VALUES`, `PROJECTOR_AUTO_FILTER_VALUES`, `PURSE_TX_TYPES`, `USER_ROLES`, and `ADMIN_TABS` in `src/lib/constants.ts`.

- **File:** `src/index.css` — `.font-serif-accent` CSS utility class
  - **Status:** `SURE`
  - **What is wrong:** `.font-serif-accent` (`font-family: 'Instrument Serif', Georgia, serif;`) on line 111 is never used in any component, and the `Instrument Serif` font is not loaded in `index.html`.
  - **Risk:** `low`
  - **Suggested fix:** Remove the `.font-serif-accent` rule from `src/index.css`.

---

### 1B. NOT SURE Unused Code (Legacy cache fields or partially referenced symbols)

- **File:** `src/lib/publicCache.ts`, `src/lib/data/seasons.ts`, `src/pages/public/SeasonTeamDetailPage.tsx` — `publicCache.seasonCards`, `publicCache.seasonDetails`, `SeasonCardCacheItem`, `SeasonDetailCacheEntry`
  - **Status:** `NOT SURE`
  - **What is wrong:** Leftover cache structures from the removed public Season pages are never populated anywhere, though `seasons.ts` still clears them and `SeasonTeamDetailPage.tsx` still checks them as a fallback before `publicCache.activeSeason`.
  - **Risk:** `low`
  - **Suggested fix:** Remove `seasonCards` and `seasonDetails` (and their types) from `src/lib/publicCache.ts`, `src/lib/data/seasons.ts`, and `src/pages/public/SeasonTeamDetailPage.tsx`.

- **File:** `src/lib/ToastContext.tsx` — `toast`, `success`, and `error` methods on `ToastContextType`
  - **Status:** `NOT SURE`
  - **What is wrong:** `ToastProvider` exposes `toast`, `showToast`, `success`, and `error`, but every component in the app exclusively destructures `showToast`.
  - **Risk:** `low`
  - **Suggested fix:** Simplify `ToastContextType` to only expose `showToast`.

---

## 2. Duplicate Logic

- **File:** `src/pages/public/TeamsPage.tsx` (lines 42–70), `src/pages/public/SeasonTeamDetailPage.tsx` (lines 31–59), `src/pages/admin/AdminTeams.tsx` (lines 52–80)
  - **What is wrong:** The exact same 29-line `getTeamCardTintStyle(color?: string | null)` function for computing 3/6-digit hex RGBA and `color-mix` linear-gradient backgrounds is copy-pasted across three files.
  - **Risk:** `low`
  - **Suggested fix:** Move `getTeamCardTintStyle` into `src/lib/utils.ts` and import it in `TeamsPage.tsx`, `SeasonTeamDetailPage.tsx`, and `AdminTeams.tsx`.

- **File:** `src/pages/admin/AdminPlayers.tsx` (lines 38–46, `sanitizeCsvValue`) and `src/pages/admin/AdminLogs.tsx` (lines 41–51, `escapeCsvCell`)
  - **What is wrong:** Both files implement nearly identical CSV formula-injection sanitization (`=`, `+`, `-`, `@`, `\t`, `\r` prefixing with `'`) and double-quote escaping.
  - **Risk:** `low`
  - **Suggested fix:** Extract a shared `escapeCsvCell(value: unknown): string` helper into `src/lib/utils.ts` and reuse it in both `AdminPlayers.tsx` and `AdminLogs.tsx`.

- **File:** `src/lib/utils.ts` (`getInitials`, lines 18–26), `src/components/credits/CreditsSection.tsx` (`getPersonInitials`, lines 6–14), and `src/pages/admin/AdminAuction.tsx` (inline `.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()`, lines 873–877 and 1091–1095)
  - **What is wrong:** Name-to-initials extraction is implemented four separate times with slightly different single-word handling.
  - **Risk:** `low`
  - **Suggested fix:** Use `getInitials` from `src/lib/utils.ts` across `CreditsSection.tsx` and `AdminAuction.tsx`.

- **File:** `src/pages/public/HandbookPage.tsx` (`formatHandbookDate`, `getHandbookPublicUrl`, lines 25–48), `src/components/admin/HandbookSetupCard.tsx` (`formatHandbookDate`, `getHandbookPublicUrl`, lines 56–71), and `src/lib/data/rules.ts` (`formatRulesDate`, `getRulesPublicUrl`, `getSafeRulesDownloadFilename`, lines 28–55)
  - **What is wrong:** Date formatting, safe PDF download filename generation, and Supabase storage public URL resolution are duplicated across Handbook public/admin components and Rules data helpers.
  - **Risk:** `low`
  - **Suggested fix:** Consolidate PDF date formatting, filename sanitization, and storage URL helpers into a shared utility or `src/lib/data/storage.ts`.

- **File:** `src/lib/data/projector.ts` (`clampInterval`, lines 11–16), `src/pages/admin/AdminProjectorControl.tsx` (`clampIntervalSeconds`, lines 73–78), and `src/hooks/useAutoSlideshow.ts` (`clampIntervalSeconds`, lines 13–18)
  - **What is wrong:** The projector interval clamping function (`Math.min(120, Math.max(3, Math.round(n)))` with default `8`) is written three times.
  - **Risk:** `low`
  - **Suggested fix:** Export `clampIntervalSeconds` from `src/lib/constants.ts` or `src/lib/utils.ts` and import it in all three modules.

- **File:** `src/pages/public/ProjectorPage.tsx` (`mergeTeamsWithPublicView`, lines 374–400) and `src/pages/admin/AdminProjectorControl.tsx` (`mergedTeams` `useMemo`, lines 199–226)
  - **What is wrong:** Merging `PublicTeam[]` with `Team[]` (combining public fields with `starting_purse` and `current_purse`) is written twice with identical mapping logic.
  - **Risk:** `low`
  - **Suggested fix:** Export `mergeTeamsWithPublicView` from `src/lib/data/teams.ts` and call it in both `ProjectorPage.tsx` and `AdminProjectorControl.tsx`.

---

## 3. Performance

- **File:** `src/lib/data/players.ts` (`supabasePlayersService.getPlayersPaged`, lines 808–864)
  - **What is wrong:** Despite being named `getPlayersPaged`, it fetches **all** `players` joined with `athletes` for the entire season (`select('*, athletes(...)').eq('season_id', seasonId)`), maps every row in JavaScript, filters by search in memory, sorts in memory, and slices `offset..offset+pageSize` on the client on every page change or search keystroke.
  - **Risk:** `high`
  - **Suggested fix:** Use server-side `.range(offset, offset + pageSize - 1)` and `{ count: 'exact' }` in Supabase (or filter against `public_players` / a database view) instead of downloading the entire season table on every page/filter change.

- **File:** `src/lib/data/players.ts` (`supabasePlayersService.getPlayers`, lines 711–747)
  - **What is wrong:** Every call to `getPlayers(seasonId)` executes two full-table queries in parallel (`public_players` with `PUBLIC_PLAYER_SELECT_COLUMNS` and `players` with `select('*')`) for the entire season and merges them in memory; this is triggered by `AdminPage`, `AdminPlayers`, `AdminAuction`, `BulkRegisterPanel`, `AdminProjectorControl`, and `ProjectorPage`.
  - **Risk:** `high`
  - **Suggested fix:** Select only the non-duplicated columns from `players` (`id, status, base_points, team_id, purchase_price, notes, created_at`) or join `players` with `athletes` in a single query.

- **File:** `src/pages/admin/AdminPage.tsx` (lines 91–103) + `src/pages/admin/AdminAthletes.tsx` + `src/pages/admin/AdminPlayers.tsx` + `src/pages/admin/AdminAuction.tsx`
  - **What is wrong:** `AdminPage` fetches all `teams`, `players`, `purse_transactions`, and `projector_state` on load and on every `onRefresh()`, while child views (`AdminPlayers.refreshSeasonPlayers`, `AdminAuction.fetchLiveAuctionState`, `AdminProjectorControl.loadExtraData`) concurrently re-fetch the exact same `players`, `teams`, and `projector_state` tables, multiplying network requests on college WiFi.
  - **Risk:** `high`
  - **Suggested fix:** Reuse the `players`, `teams`, and `projectorState` props already loaded and kept fresh via realtime in `AdminPage.tsx` instead of re-querying them inside child tabs.

- **File:** `src/lib/data/athletes.ts` (`supabaseAthletesService.getAthletesPaged`, lines 346–367)
  - **What is wrong:** After fetching 15 athletes for the current page, it runs an unbounded second query `supabase.from('players').select('athlete_id').eq('season_id', seasonId)` fetching **every** player row in the season just to count registrations for those 15 athletes.
  - **Risk:** `medium`
  - **Suggested fix:** Add `.in('athlete_id', athleteIds)` to the `players` count query in `getAthletesPaged` so only rows matching the 15 displayed athletes are transferred.

- **File:** `src/lib/data/purses.ts` (`supabasePursesService.getPurseTransactions`, lines 122–140) and `src/pages/admin/AdminPage.tsx` (line 96)
  - **What is wrong:** `getPurseTransactions` fetches every purse transaction for the season (`select('*')`) with no `.limit()`, and `AdminPage` loads all of them on initial mount and on every `onRefresh()` even though `AdminDashboard` only displays the latest 6 and `AdminLogs` has its own RPC.
  - **Risk:** `medium`
  - **Suggested fix:** Add an optional `limit` parameter to `getPurseTransactions(seasonId, limit)` and pass `limit = 10` from `AdminPage.tsx`.

- **File:** `src/pages/public/HomePage.tsx` (lines 68–75) and `src/pages/public/RostersPage.tsx` (lines 42–48)
  - **What is wrong:** Both public pages call `getPublicPlayersBySeason(active.id)`, which downloads every player row and all player columns (`photo_url`, `photo_thumb_url`, `name`, etc.) for the season plus all `public_squads` rows solely to compute three integer counts (`cricket`, `futsal`, `volleyball`).
  - **Risk:** `high`
  - **Suggested fix:** Add a lightweight count query (e.g. `select('sport')` on `public_players` without `public_squads`, or `count: 'exact', head: true` per sport) for the Home and Rosters overview cards.

- **File:** `src/pages/public/HomePage.tsx` (`handleMouseMove`, lines 41, 130–136, 180–186)
  - **What is wrong:** Moving the mouse anywhere on `HomePage` calls `setMousePos({ x, y })` on every `mousemove` event without throttling or `requestAnimationFrame`, causing the entire `HomePage` component tree (`HeaderBar`, `NavigationMenu`, `TickerStrip`, `SportCardsGrid`, `SiteFooter`) to re-render at 60–120Hz.
  - **Risk:** `medium`
  - **Suggested fix:** Use `useMotionValue` / `useSpring` from `motion/react` or update a `ref` inside `requestAnimationFrame` on the hero `div` instead of calling React `setState` on every mouse move.

- **File:** `src/pages/public/ProjectorPage.tsx` (lines 50, 164–190, 734–740, 1083–1086)
  - **What is wrong:** `enqueuePlayerPhotosForPreload` preloads and decodes **both** full-size `photo_url` and `photo_thumb_url` for every player in the season into an unbounded module-level `projectorImageCache` `Map`, and `TeamsAndPursesSceneContent` (line 736) renders `player.photo_url || player.photo_thumb_url` (preferring full-res over thumbnail) for tiny 28px–56px squad grid avatars.
  - **Risk:** `high`
  - **Suggested fix:** Prefer `player.photo_thumb_url || player.photo_url` in `TeamsAndPursesSceneContent`, and cap `projectorImageCache` size or only preload `photo_url` for available/spotlight players rather than both URLs for every player in the season.

---

## 4. Realtime

### Active Subscriptions Inventory

1. **Channel:** `projector_state_${seasonId}` (`src/lib/data/projector.ts`, line 242)
   - **Table:** `projector_state` (filtered by `season_id=eq.${seasonId}`)
   - **Opened by:** `AdminPage.tsx` (line 169) and `ProjectorPage.tsx` (line 1002)
   - **Cleaned up on unmount:** Yes (`supabase.removeChannel(sbChannel)`).

2. **Channel:** `players_${seasonId}` (`src/lib/data/players.ts`, line 1341)
   - **Table:** `players` (filtered by `season_id=eq.${seasonId}`)
   - **Opened by:** `AdminPage.tsx` (line 172) and `ProjectorPage.tsx` (line 1024)
   - **Cleaned up on unmount:** Yes (`supabase.removeChannel(sbChannel)`).

3. **Channel:** `teams_${seasonId}` (`src/lib/data/teams.ts`, line 831)
   - **Table:** `teams` (filtered by `season_id=eq.${seasonId}`)
   - **Opened by:** `AdminPage.tsx` (line 175) and `ProjectorPage.tsx` (line 1013)
   - **Cleaned up on unmount:** Yes (`supabase.removeChannel(sbChannel)`).

4. **Channel:** `admin_athletes_realtime` (`src/lib/data/athletes.ts`, line 766)
   - **Tables:** `athletes` (unfiltered) and `players` (unfiltered)
   - **Opened by:** `AdminAthletes.tsx` (line 179, when the `'athletes'` tab is mounted inside `AdminPage`)
   - **Cleaned up on unmount:** Yes (`supabase.removeChannel(sbChannel)`).

5. **Channel:** `admin_auction_live_${seasonId}` (`src/lib/data/auction.ts`, line 917)
   - **Tables:** `projector_state`, `players`, `teams`, `auction_settings`, `auction_queue` (filtered by `season_id=eq.${seasonId}`), plus `auction_bids` and `auction_sales` (unfiltered)
   - **Opened by:** `AdminAuction.tsx` (line 201, when the `'auction'` tab is mounted inside `AdminPage`)
   - **Cleaned up on unmount:** Yes (`supabase.removeChannel(channel)`).

6. **Channel:** `auction_settings_${seasonId}` (`src/lib/data/auction.ts`, line 700)
   - **Table:** `auction_settings` (filtered by `season_id=eq.${seasonId}`)
   - **Opened by:** `ProjectorPage.tsx` (line 1006)
   - **Cleaned up on unmount:** Yes (`supabase.removeChannel(channel)`).

*(Note: Public pages do not open any realtime channels; `fieldr-carousel-realtime` in `src/lib/data/site.ts` is unused dead code.)*

### Realtime Problems Found

- **File:** `src/pages/admin/AdminAuction.tsx` (line 201) & `src/lib/data/auction.ts` (lines 917–956) vs. `src/pages/admin/AdminPage.tsx` (lines 169–177)
  - **What is wrong:** When the Admin Auction Room tab is open, `AdminPage` already has active subscriptions on `projector_state`, `players`, and `teams`, while `AdminAuction` opens `admin_auction_live_${seasonId}` which subscribes to `projector_state`, `players`, and `teams` a second time, causing every bid/sale/stage change to fire duplicate debounced full-season refetches (`getPlayers`, `getTeams`, `getProjectorState`) in both parent and child.
  - **Risk:** `high`
  - **Suggested fix:** Remove `projector_state`, `players`, and `teams` listeners from `subscribeToAuctionRealtime` (keeping `auction_bids`, `auction_sales`, `auction_settings`, and `auction_queue`) and rely on `AdminPage` props for `players`, `teams`, and `projectorState`.

- **File:** `src/pages/admin/AdminAthletes.tsx` (line 179) & `src/lib/data/athletes.ts` (lines 766–779) vs. `src/pages/admin/AdminPage.tsx` (line 172)
  - **What is wrong:** `AdminAthletes` subscribes to `admin_athletes_realtime` which listens to all changes on `players` (without a `season_id` filter) at the same time `AdminPage` subscribes to `players_${seasonId}`, triggering redundant queries (`getAthletesPaged` + `getPlayers`) whenever any player row changes.
  - **Risk:** `medium`
  - **Suggested fix:** Listen only to `athletes` on `admin_athletes_realtime` and trigger registration count updates from the parent `players` state in `AdminPage.tsx`.

- **File:** `src/lib/data/auction.ts` (`subscribeToAuctionRealtime`, lines 932–939)
  - **What is wrong:** The `postgres_changes` listeners on `auction_bids` and `auction_sales` inside `admin_auction_live_${seasonId}` have no `filter: season_id=eq.${seasonId}`, so events from any season trigger a refetch.
  - **Risk:** `low`
  - **Suggested fix:** Add `filter: \`season_id=eq.${seasonId}\`` to the `auction_bids` and `auction_sales` `.on('postgres_changes', ...)` bindings in `src/lib/data/auction.ts`.

- **File:** `src/pages/public/ProjectorPage.tsx` (lines 983–1042)
  - **What is wrong:** The `useEffect` that initializes data and opens 4 realtime subscriptions depends on `[activeSeason?.id, handleIncomingProjectorState, refetchSeasonData]`; on first mount `activeSeason?.id` is `undefined`, then `init()` calls `setActiveSeason(active)` which changes `activeSeason?.id` from `undefined` to the UUID, immediately tearing down the newly created channels and running `init()` and `refetchSeasonData(active.id)` a second time.
  - **Risk:** `high`
  - **Suggested fix:** Separate the initial `getSeasons()` lookup into a mount-only `useEffect([])` and run `refetchSeasonData` + realtime channel setup in a second `useEffect` gated on `if (!activeSeason?.id) return`.

---

## 5. Errors and Warnings

- **File:** `src/pages/public/ProjectorPage.tsx` (lines 983–1042)
  - **What is wrong:** Because `setActiveSeason(active)` inside `init()` changes the `activeSeason?.id` dependency of the same `useEffect` while the first `init()` is still awaiting `refetchSeasonData(active.id)`, the cleanup function runs or races with channel creation, producing Supabase WebSocket channel teardown/re-subscribe warnings and duplicate network requests on Projector startup.
  - **Risk:** `medium`
  - **Suggested fix:** Decouple fetching the active season from the `[activeSeason?.id]` subscription `useEffect` in `src/pages/public/ProjectorPage.tsx`.

- **File:** `src/lib/theme.tsx` (`applyThemeToDom`, line 88)
  - **What is wrong:** Uses invalid media query `window.matchMedia('(prefers-color-scheme: reduce)')` instead of `'(prefers-reduced-motion: reduce)'`, which always evaluates to `false` and logs/triggers an invalid media query feature value check.
  - **Risk:** `low`
  - **Suggested fix:** Change `'(prefers-color-scheme: reduce)'` to `'(prefers-reduced-motion: reduce)'` on line 88 of `src/lib/theme.tsx`.

- **File:** `src/lib/data/players.ts` (`getPublicPlayersBySeason`, line 777) and `src/lib/data/teams.ts` (`getPublicTeams`, line 614)
  - **What is wrong:** When `activeSeason` is loaded or when `seasonId` is temporarily empty during initial state transitions, `getPublicTeams('')` or `getPlayers('')` can pass an empty string `''` to `.eq('season_id', seasonId)` on a `uuid` column in PostgreSQL, causing PostgREST `22P02 invalid input syntax for type uuid: ""` console errors (`Supabase getPublicTeams error`).
  - **Risk:** `medium`
  - **Suggested fix:** Guard `getPublicTeams`, `getTeams`, `getPlayers`, and `getPublicPlayersBySeason` with `if (!seasonId || !seasonId.trim()) return []` before querying Supabase.

---

## 6. Rule Breaks

- **File:** `src/index.css` (lines 76–90)
  - **What is wrong:** Global font overrides exist in `src/index.css`: `body` sets `font-family: var(--font-sans); font-weight: 300;` and `div[data-theme]` sets `font-family: var(--font-sans); line-height: 1.55; letter-spacing: 0.005em;`, overriding inherited font weights and families globally across themed containers.
  - **Risk:** `medium`
  - **Suggested fix:** Keep font family and weight declarations scoped to utility classes or root defaults rather than overriding `font-weight: 300` on `body` and `font-family` on `div[data-theme]`.

- **File:** `src/lib/data/auction.ts` (`supabaseAuctionService.auctionBackToIdle`, lines 872–898)
  - **What is wrong:** In the Auction service (`auction.ts`), `auctionBackToIdle` performs a direct table write (`supabase.from('projector_state').upsert(payload, { onConflict: 'season_id' })`) instead of calling a database RPC like all other auction state mutations (`auction_bring_to_stage`, `auction_place_bid`, `auction_clear_bid`, `auction_secure`, `auction_mark_unsold`, `auction_undo_last_sale`).
  - **Risk:** `medium`
  - **Suggested fix:** Route `auctionBackToIdle` through an RPC (or `projectorService.setProjectorMode(seasonId, 'idle')` if intentional) instead of writing directly to `projector_state` from the auction service.

- **File:** `src/pages/public/ProjectorPage.tsx` (lines 959, 1013, 1024)
  - **What is wrong:** `ProjectorPage` is located under `src/pages/public/ProjectorPage.tsx` and calls `getTeams(seasonId)` (which queries the non-public `teams` table) and `getPlayers(seasonId)` (which queries both `public_players` and the non-public `players` table). *(Note: `/projector` is wrapped in `<RouteGuard allowedRoles={['admin', 'projector']}>` in `App.tsx`, so it is authenticated, but it resides in `src/pages/public/`.)*
  - **Risk:** `low`
  - **Suggested fix:** Move `ProjectorPage.tsx` out of `src/pages/public/` (e.g., to `src/pages/projector/ProjectorPage.tsx`) or ensure `teams` purse reads are exposed on the public/projector view if `/projector` is ever accessed without admin/projector RLS privileges.

*(Note: Checked across the entire codebase — there are zero emojis, zero occurrences of "DRGMC", and all unauthenticated public pages read exclusively from `public_players`, `public_teams`, `public_squads`, `seasons`, `sports`, `athletes`, `site_settings`, `carousel_items`, `credits_people`, `rules_documents`, and the `handbook_list` / `owner_team_overview` RPCs.)*

---

## 7. Robustness

- **File:** `src/pages/admin/AdminAuction.tsx` (`handleBringToStage`, `handleQuickAddBid`, `handleTypedBidSubmit`, `handleClearBid`, `handleConfirmSecure`, `handleConfirmMarkUnsold`, `handleConfirmUndoLastSale`, lines 281–515)
  - **What is wrong:** Double-click protection relies solely on React state `if (isPending) return; setIsPending(true);`. Because React state updates are asynchronous and batched, a rapid double-tap on a bid increment button (`+100`, `+500`), "Bring to Stage", or "Confirm Secure" on a touch tablet before the next render frame can fire two concurrent RPC calls (`auction_place_bid` or `auction_secure`).
  - **Risk:** `high`
  - **Suggested fix:** Guard all auction action handlers with a synchronous `inFlightRef = useRef(false)` check (`if (inFlightRef.current) return; inFlightRef.current = true;`) in addition to `isPending` state.

- **File:** `src/pages/admin/AdminPurses.tsx` (`handleAdjustSubmit`, `handleResetConfirm`, lines 49–105)
  - **What is wrong:** `handleAdjustSubmit` (which calls `execute_purse_transaction` to add/deduct team points) and `handleResetConfirm` (which calls `reset_all_purses`) only set `setIsSubmitting(true)` without a synchronous `if (isSubmitting)` or `useRef` lock at the top of the handler, allowing programmatic form submission (e.g., pressing Enter twice in the amount input) to execute duplicate purse transactions.
  - **Risk:** `high`
  - **Suggested fix:** Add a synchronous `submittingRef.current` guard at the very first line of `handleAdjustSubmit` and `handleResetConfirm` in `src/pages/admin/AdminPurses.tsx`.

- **File:** `src/pages/public/TeamsPage.tsx` (lines 81–139, 178–202)
  - **What is wrong:** `TeamsPage` has no error state: if `getActiveSeason()`, `getPublicTeams()`, or `getPublicPlayersBySeason()` fails (e.g., flaky college WiFi), the `catch` block only logs to `console.error`, sets `isLoading` to `false`, and renders the misleading empty state `"No Active Teams Found — There are no registered franchises in the current tournament season yet"` with no Retry button.
  - **Risk:** `medium`
  - **Suggested fix:** Track `hasError` state in `TeamsPage.tsx` and render `<ErrorState onRetry={loadData} />` when the fetch throws and no cached data is available.

- **File:** `src/pages/public/RostersPage.tsx` (lines 26–68, 92)
  - **What is wrong:** `RostersPage` has neither a loading state nor an error state; if the network is slow or fails, it silently shows `0 players registered` on all sport cards with no feedback or retry option.
  - **Risk:** `low`
  - **Suggested fix:** Add loading/error handling or pass an `isLoading` prop to `SportCardsGrid` so player counts show a skeleton or dash while loading.

- **File:** `src/pages/public/RosterSportPage.tsx` (lines 296–308)
  - **What is wrong:** `fetchPlayers` catches errors from `getPublicPlayersPaged` and only logs them to `console.error`, leaving the user looking at `"No Athletes Found — No registered athletes match the selected filter criteria"` when a network request fails on college WiFi.
  - **Risk:** `medium`
  - **Suggested fix:** Add an error state with a Retry button (`<ErrorState onRetry={() => fetchPlayers(0, false)} />`) when `getPublicPlayersPaged` fails and no cached players exist.

- **File:** `src/pages/public/ContentPage.tsx` (lines 89–98, 134–147) and `src/pages/public/RulesPage.tsx` (lines 62–68, 112–124)
  - **What is wrong:** Neither `ContentPage` (`/help`, `/about`) nor `RulesPage` (`/rules`) tracks fetch errors; if `getSiteSettings()` or `getRulesDocuments()` fails due to a network drop, `ContentPage` displays `"Coming soon"` and `RulesPage` displays `"Auction rules will be published soon."` instead of an error state with retry.
  - **Risk:** `medium`
  - **Suggested fix:** Add `hasError` state and render `<ErrorState onRetry={loadData} />` in `ContentPage.tsx` and `RulesPage.tsx` when the initial fetch fails.

- **File:** `src/pages/public/PlayerProfilePage.tsx` (line 134)
  - **What is wrong:** The `EmptyState` action button uses `onAction={() => window.location.href = '/rosters'}`, triggering a full browser page reload and wiping out `publicCache` instead of client-side routing via `useNavigate()`.
  - **Risk:** `low`
  - **Suggested fix:** Replace `window.location.href = '/rosters'` with `navigate('/rosters')` from `react-router-dom`.
