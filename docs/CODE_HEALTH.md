# Fieldr Code Health Audit & Safe Cleanup Report

## Phase 1: Codebase Audit Findings

Each finding below is rated by refactor risk:
- **LOW**: Purely mechanical, zero runtime/layout/timing change, verifiable by TypeScript compiler and direct inspection.
- **MEDIUM**: Mechanical data-layer or state-hook cleanup requiring careful verification of data shape and component props.
- **HIGH**: Changes to realtime subscriptions, live auction state machine, animation timings, layout structure, or auth/routing (deliberately excluded from Phase 2).

---

### 1. Duplication

- **[LOW] Sport name/slug matching logic repeated across pages and data modules**
  - Files: `src/pages/admin/AdminAuction.tsx`, `src/pages/admin/AdminPlayers.tsx`, `src/pages/public/HomePage.tsx`, `src/pages/public/RostersPage.tsx`, `src/pages/public/RosterSportPage.tsx`, `src/pages/public/SeasonDetailPage.tsx`, `src/components/home/SportCardsGrid.tsx`, `src/components/admin/BulkRegisterPanel.tsx`, `src/lib/data/players.ts`, `src/lib/data/teams.ts`
  - Detail: Case-insensitive sport comparison (`s.name.toLowerCase() === target.toLowerCase() || s.id.toLowerCase() === target.toLowerCase()`) is written inline in 10+ places instead of calling a single helper in `src/lib/utils.ts`.
- **[LOW] Athlete/player initials fallback calculation repeated**
  - Files: `src/pages/admin/AdminAuction.tsx`, `src/pages/public/ProjectorPage.tsx`, `src/pages/public/SeasonDetailPage.tsx`, `src/pages/public/SeasonTeamDetailPage.tsx`, `src/components/projector/SecuredSequence.tsx`, `src/components/roster/RosterPlayerCard.tsx`
  - Detail: `name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()` is duplicated across 6 components.
- **[LOW] Points and currency formatting repeated**
  - Files: `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/AdminPurses.tsx`, `src/pages/admin/AdminTeams.tsx`, `src/pages/admin/AdminAuction.tsx`, `src/pages/public/ProjectorPage.tsx`, `src/components/projector/SecuredSequence.tsx`
  - Detail: `(val ?? 0).toLocaleString()` and `+X` increment formatting are repeated inline.
- **[LOW] Season sorting logic duplicated**
  - Files: `src/lib/data/seasons.ts`, `src/pages/public/SeasonPage.tsx`
  - Detail: Sorting seasons with `is_active` first and `created_at` descending is implemented in both `getSeasons()` and `SeasonPage.tsx`.
- **[MEDIUM] Side-panel drawer shell markup repeated**
  - Files: `src/pages/admin/AdminAthletes.tsx`, `src/pages/admin/AdminPlayers.tsx`, `src/components/admin/BulkRegisterPanel.tsx`
  - Detail: Fixed right-hand drawer container (`fixed inset-0 z-50 flex justify-end` + `bg-scrim` backdrop + header with close button) is repeated in 3 places with minor width differences (`max-w-lg` vs `max-w-xl`).
- **[HIGH] Realtime subscription boilerplate across data modules**
  - Files: `src/lib/data/projector.ts`, `src/lib/data/teams.ts`, `src/lib/data/players.ts`, `src/lib/data/auction.ts`
  - Detail: Each subscription uses custom channel names, custom payload merging (`fetchPublicPlayerEnrichment`), and custom `CustomEvent` fallbacks for demo mode. Consolidating into a generic realtime wrapper risks breaking channel lifecycle or reconnect handling.

---

### 2. Magic Strings

- **[LOW] Raw player status literals (`'available'`, `'sold'`, `'unsold'`)**
  - Files: `src/types/index.ts`, `src/lib/data/players.ts`, `src/lib/data/auction.ts`, `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/AdminPlayers.tsx`, `src/pages/admin/AdminAuction.tsx`, `src/pages/public/ProjectorPage.tsx`, `src/pages/public/SeasonDetailPage.tsx`, `src/pages/public/TeamsPage.tsx`
  - Detail: Status values are scattered as raw string literals instead of referencing a shared `PLAYER_STATUS` constant and union type in `src/lib/constants.ts`.
- **[LOW] Raw projector mode literals (`'idle'`, `'teams'`, `'player'`, `'roster'`, `'auction'`, `'sold'`, `'unsold'`)**
  - Files: `src/types/index.ts`, `src/lib/data/projector.ts`, `src/lib/data/auction.ts`, `src/pages/admin/AdminProjectorControl.tsx`, `src/pages/admin/AdminAuction.tsx`, `src/pages/public/ProjectorPage.tsx`
  - Detail: Projector mode strings should be centralized in `src/lib/constants.ts` (`PROJECTOR_MODES`).
- **[LOW] Raw purse transaction types (`'initial'`, `'add'`, `'deduct'`, `'set'`) and user roles (`'admin'`, `'projector'`)**
  - Files: `src/types/index.ts`, `src/lib/data/purses.ts`, `src/pages/admin/AdminDashboard.tsx`, `src/pages/admin/AdminPurses.tsx`, `src/App.tsx`, `src/components/layout/RouteGuard.tsx`, `src/components/layout/NavigationMenu.tsx`
  - Detail: Centralize in `src/lib/constants.ts` (`PURSE_TX_TYPES`, `USER_ROLES`).
- **[LOW] Scattered `localStorage` keys across client, auction, theme, and layout**
  - Files: `src/lib/data/client.ts` (`STORAGE_KEYS`), `src/lib/data/auction.ts` (`DEMO_AUCTION_BIDS_KEY`, `DEMO_AUCTION_SALES_KEY`, `DEMO_AUCTION_SETTINGS_KEY`), `src/lib/AuthContext.tsx` (`fieldr_demo_role`), `src/lib/theme.tsx` (`fieldr-theme`), `src/pages/admin/AdminLayout.tsx` (`fieldr_admin_sidebar_collapsed`)
  - Detail: Consolidate all storage key constants in `src/lib/constants.ts` while keeping the exact key strings unchanged.

---

### 3. Data Layer Leaks

- **[LOW] Direct `supabase` usage outside `src/lib/data/*`**
  - Detail: Verified that zero components or hooks in `src/pages/*`, `src/components/*`, or `src/lib/AuthContext.tsx` import `supabase` directly. Every query, mutation, auth call, and storage upload goes through `src/lib/data/*`.
- **[LOW] Auction write verification**
  - Files: `src/lib/data/auction.ts`, `src/pages/admin/AdminAuction.tsx`
  - Detail: Verified that all live auction writes in `AdminAuction.tsx` go exclusively through the six RPC wrappers (`auctionBringToStage`, `auctionPlaceBid`, `auctionClearBid`, `auctionSecure`, `auctionMarkUnsold`, `auctionUndoLastSale`), and no client code updates `players`, `teams`, `purse_transactions`, or auction tables directly for auction sales or purse changes.

---

### 4. Public Safety Check (CRITICAL)

- **[MEDIUM] Public pages calling `getPlayers(seasonId)` which queries `public.players` alongside `public_players`**
  - Files:
    - `src/pages/public/HomePage.tsx` (line 48: `getPlayers(active.id)`)
    - `src/pages/public/TeamsPage.tsx` (line 28: `getPlayers(season.id)`)
    - `src/pages/public/RostersPage.tsx` (line 26: `getPlayers(active.id)`)
    - `src/pages/public/SeasonPage.tsx` (line 37: `getPlayers(s.id)`)
    - `src/pages/public/SeasonDetailPage.tsx` (line 68: `getPlayers(id)`)
    - `src/pages/public/SeasonTeamDetailPage.tsx` (line 55: `getPlayers(id)`)
  - Cause: In `src/lib/data/players.ts`, `getPlayers(seasonId)` runs `supabase.from('players').select('*').eq('season_id', seasonId)` in parallel with `public_players` to merge admin-only columns (`base_points`, `purchase_price`). Public pages must NEVER query `players`, `teams`, `athletes`, `purse_transactions`, or `profiles`, and must only read `public_players`, `public_teams`, `public_squads`, `seasons`, `sports`, `carousel_items`, and `site_settings`.
  - Fix: Added `getPublicPlayersBySeason(seasonId: string): Promise<PublicPlayer[]>` in `src/lib/data/players.ts` that queries ONLY `public_players` with explicit public columns (`PUBLIC_PLAYER_COLS`) and never touches `players`. Updated all 6 public pages (`HomePage.tsx`, `TeamsPage.tsx`, `RostersPage.tsx`, `SeasonPage.tsx`, `SeasonDetailPage.tsx`, `SeasonTeamDetailPage.tsx`) to call `getPublicPlayersBySeason`.
- **[LOW] `getAthleteCareer` in `src/lib/data/athletes.ts` uses `.from('public_players').select('*')`**
  - Files: `src/lib/data/athletes.ts` (line 445), called by `src/pages/public/PlayerProfilePage.tsx`
  - Fix: Replaced `.select('*')` on `public_players` with explicit public columns (`id, player_code, athlete_code, athlete_id, name, photo_thumb_url, photo_url, academic_year, sport, playing_role, season_id, status, team_id`).
- **[LOW] Audit of all other public pages and components**
  - `src/pages/public/RosterSportPage.tsx`: Calls `getActiveSeason`, `getRolesForSport`, `getPublicTeams`, `getPublicPlayersPaged`, `getAthleteOtherSportsInSeason` (all read only `seasons`, `sports`, `public_teams`, `public_players`). Safe.
  - `src/pages/public/PlayerProfilePage.tsx`: Calls `getActiveSeason`, `getAthleteByCode`, `getAthleteCareer` (all read only `seasons`, `public_players`, `public_teams`). Safe.
  - `src/pages/public/ContentPage.tsx`: Calls `getActiveSeason`, `getSiteSettings` (`seasons`, `site_settings`). Safe.
  - `src/components/home/SportCardsGrid.tsx`: Pure prop consumer. Safe.
  - `src/components/home/TickerStrip.tsx`: Pure prop consumer. Safe.

---

### 5. React Problems

- **[LOW] `AnimatedCounter.tsx` closure on `displayValue` in `useEffect`**
  - File: `src/components/home/AnimatedCounter.tsx` (lines 16–45)
  - Detail: `useEffect` read `displayValue` as the animation start point without tracking the latest rendered value in a ref if `value` updated mid-animation. Added `displayValueRef` so rapid updates smoothly animate from the latest displayed value without adding `displayValue` to the effect dependency array.
- **[LOW] `AdminPlayers.tsx` role-loading effect includes `playingRole` in dependency array**
  - File: `src/pages/admin/AdminPlayers.tsx` (lines 320–336)
  - Detail: The `useEffect` that fetches `getRolesForSport(sport)` listed `[sport, playingRole]` in its dependencies, causing `getRolesForSport(sport)` to re-run every time the user changed the role dropdown. Replaced with functional state update `setPlayingRole((prev) => ...)` so the effect depends only on `[sport]`.

---

### 6. TypeScript

- **[LOW] Duplicate `AdminTab` type definition and re-export**
  - Files: `src/types/index.ts`, `src/pages/admin/AdminLayout.tsx`, `src/pages/admin/AdminPage.tsx`
  - Fix: Defined `AdminTab` once in `src/lib/constants.ts`, re-exported via `src/types/index.ts`, imported directly from `../../types` in `AdminPage.tsx`, and removed the redundant `export type { AdminTab }` from `AdminLayout.tsx`.
- **[LOW] Public page state typed as `Player[]` instead of `PublicPlayer[]`**
  - Files: `src/pages/public/TeamsPage.tsx`, `src/pages/public/SeasonDetailPage.tsx`, `src/pages/public/SeasonTeamDetailPage.tsx`
  - Fix: Typed state as `PublicPlayer[]` to match `getPublicPlayersBySeason` and enforce at compile time that public pages never access private `Player` fields (`base_points`, `purchase_price`, `roll_no`, `notes`).

---

### 7. Styling

- **[LOW] Inline fallback colour strings vs CSS custom variables**
  - Files: `src/pages/admin/AdminTeams.tsx` (`#047554` default form state for `<input type="color">` is required by HTML5 color inputs which only accept `#rrggbb` hex strings — intentionally preserved).
  - Detail: All UI component fallback styles use `var(--accent)` or `var(--accent-bright)`.

---

### 8. Dead Code

- **[LOW] Unused imports across public pages**
  - `src/pages/public/LoginPage.tsx`: Unused `Button` import removed.
  - `src/pages/public/PlayerProfilePage.tsx`: Unused `ShieldCheck` import removed.
  - `src/pages/public/SeasonPage.tsx`: Unused `Link`, `Archive`, `Calendar`, `ShieldCheck`, `Users` imports removed.
- **[LOW] Dead function `getNextPlayerCode` in `src/lib/data/client.ts`**
  - File: `src/lib/data/client.ts`
  - Detail: `getNextPlayerCode` was never imported or called anywhere in the codebase and was removed.

---

### 9. Rule Violations

- **[LOW] Console logging check**
  - Detail: Verified zero `console.log` calls exist in `src/`. All `console.error` calls include descriptive context and error messages as required.
- **[LOW] No emoji / No forbidden text check**
  - Detail: Verified zero emojis and zero forbidden strings in UI components and pages.
- **[MEDIUM] Public table access rule violation**
  - Detail: Documented under Section 4 (`getPlayers` called from 6 public pages). Fixed in Phase 2 via `getPublicPlayersBySeason`.

---

### 10. Performance

- **[LOW] Replace `select('*')` with explicit column lists in `src/lib/data/*`**
  - Files:
    - `src/lib/data/seasons.ts`: `seasons` queries (`SEASON_COLS`)
    - `src/lib/data/teams.ts`: `sports`, `teams`, and `projector_state` queries
    - `src/lib/data/athletes.ts`: `athletes` (`ATHLETE_COLS`) and `public_players` queries
    - `src/lib/data/players.ts`: `public_players` queries (`PUBLIC_PLAYER_COLS`)
    - `src/lib/data/purses.ts`: `purse_transactions` queries (`PURSE_TX_COLS`)
    - `src/lib/data/projector.ts`: `projector_state` queries (`PROJECTOR_STATE_COLS`)
    - `src/lib/data/site.ts`: `carousel_items` and `site_settings` queries
    - `src/lib/data/auction.ts`: `auction_settings` (`AUCTION_SETTINGS_COLS`) and `auction_bids` queries
- **[MEDIUM] Redundant `players` table queries per season on `SeasonPage.tsx`**
  - File: `src/pages/public/SeasonPage.tsx`
  - Detail: Switching `getPlayers(s.id)` to `getPublicPlayersBySeason(s.id)` eliminates the extra `players` table query per season, cutting player-related Supabase requests in half on `/season` while keeping behaviour identical.

---

## Phase 2: Final Report

### 1. What Was Fixed (Grouped by Area)

- **Shared Constants & Union Types (`src/lib/constants.ts`, `src/types/index.ts`, `src/lib/data/client.ts`, `src/lib/data/auction.ts`, `src/lib/theme.tsx`, `src/pages/admin/AdminLayout.tsx`, `src/pages/admin/AdminPage.tsx`)**
  - Created `src/lib/constants.ts` containing `PLAYER_STATUS`, `PROJECTOR_MODES`, `PURSE_TX_TYPES`, `USER_ROLES`, `ADMIN_TABS`, `STORAGE_KEYS`, and their corresponding TypeScript union types (`PlayerStatus`, `ProjectorMode`, `PurseTransactionType`, `UserRole`, `AdminTab`).
  - Consolidated `STORAGE_KEYS` across `src/lib/data/client.ts`, `src/lib/data/auction.ts`, `src/lib/theme.tsx`, and `src/pages/admin/AdminLayout.tsx`.
  - Removed duplicate `export type { AdminTab }` from `src/pages/admin/AdminLayout.tsx` and imported `AdminTab` from `../../types` in `src/pages/admin/AdminPage.tsx`.
- **Shared Formatting & Domain Helpers (`src/lib/utils.ts`, `src/pages/public/HomePage.tsx`, `src/pages/public/RostersPage.tsx`, `src/pages/public/SeasonPage.tsx`, `src/pages/public/SeasonDetailPage.tsx`, `src/components/roster/RosterPlayerCard.tsx`)**
  - Created `src/lib/utils.ts` with `matchesSport`, `getInitials`, `formatPoints`, and `sortSeasons`.
  - Replaced inline sport name comparisons, season sorting, and player initial generation in public pages and `RosterPlayerCard.tsx`.
- **Public Data Layer Safety (`src/lib/data/types.ts`, `src/lib/data/players.ts`, `src/lib/data/athletes.ts`, `src/pages/public/HomePage.tsx`, `src/pages/public/TeamsPage.tsx`, `src/pages/public/RostersPage.tsx`, `src/pages/public/SeasonPage.tsx`, `src/pages/public/SeasonDetailPage.tsx`, `src/pages/public/SeasonTeamDetailPage.tsx`)**
  - Added `getPublicPlayersBySeason(seasonId)` in `src/lib/data/players.ts` that queries ONLY the `public_players` view and never queries `public.players` or `public.athletes`.
  - Updated `HomePage.tsx`, `TeamsPage.tsx`, `RostersPage.tsx`, `SeasonPage.tsx`, `SeasonDetailPage.tsx`, and `SeasonTeamDetailPage.tsx` to call `getPublicPlayersBySeason` and typed their state as `PublicPlayer[]`.
- **React Hook Dependencies & Closures (`src/components/home/AnimatedCounter.tsx`, `src/pages/admin/AdminPlayers.tsx`)**
  - Fixed stale closure in `AnimatedCounter.tsx` by tracking the current displayed value in `displayValueRef`.
  - Removed `playingRole` from the `useEffect` dependency array in `AdminPlayers.tsx` using a functional state update so `getRolesForSport(sport)` only executes when `sport` changes.
- **Dead Code & Unused Imports (`src/lib/data/client.ts`, `src/pages/public/LoginPage.tsx`, `src/pages/public/PlayerProfilePage.tsx`, `src/pages/public/SeasonPage.tsx`)**
  - Removed unused `getNextPlayerCode` from `src/lib/data/client.ts`.
  - Removed unused icon and UI imports from `LoginPage.tsx`, `PlayerProfilePage.tsx`, and `SeasonPage.tsx`.
- **Explicit Column Selection (`src/lib/data/seasons.ts`, `src/lib/data/teams.ts`, `src/lib/data/purses.ts`, `src/lib/data/projector.ts`, `src/lib/data/site.ts`, `src/lib/data/athletes.ts`, `src/lib/data/players.ts`, `src/lib/data/auction.ts`)**
  - Replaced `select('*')` with explicit column lists across `seasons`, `sports`, `teams`, `athletes`, `public_players`, `purse_transactions`, `projector_state`, `carousel_items`, `site_settings`, `auction_settings`, and `auction_bids`.

### 2. What Was Found But Deliberately NOT Changed (With Risk Level & Reason)

- **Realtime Subscription Consolidation (`src/lib/data/projector.ts`, `src/lib/data/teams.ts`, `src/lib/data/players.ts`, `src/lib/data/auction.ts`) — HIGH Risk**
  - Reason: Each realtime channel uses table-specific filters, custom payload enrichment (`fetchPublicPlayerEnrichment`), and custom reconnect/visibility catch-up hooks. Refactoring into a generic subscription factory risks altering channel lifecycle or breaking live projector/auction synchronization.
- **Side-Panel Drawer Markup Extraction (`src/pages/admin/AdminAthletes.tsx`, `src/pages/admin/AdminPlayers.tsx`, `src/components/admin/BulkRegisterPanel.tsx`) — MEDIUM/HIGH Risk**
  - Reason: Each drawer has distinct header badges, sticky footer action bars, and width classes (`max-w-lg` vs `max-w-xl`). Extracting a wrapper component risks subtle layout or z-index shifts.
- **`select('*')` on `players` and `auction_sales` (`src/lib/data/players.ts`, `src/lib/data/auction.ts`) — MEDIUM Risk**
  - Reason: `players.ts` (`mapJoinedPlayer`) and `auction.ts` (`getRecentAuctionSales`) include schema-tolerance fallbacks for optional/legacy columns (`season_id` on `auction_sales`, joined `athletes(...)` fields on `players`). Keeping `select('*')` on those two admin-only queries prevents PostgREST `42703` errors across schema revisions.
- **Projector `SecuredSequence.tsx` & `ProjectorPage.tsx` Animation & Catch-Up Logic — HIGH Risk**
  - Reason: Contains carefully tuned motion keyframes, `secured_duration_seconds` / `price_countup_seconds` timing, and `catchup_window_seconds` reconnect logic that must remain untouched.
- **Admin Auction Room Bid Flow (`src/pages/admin/AdminAuction.tsx`) — HIGH Risk**
  - Reason: Contains live auction RPC orchestration, optimistic UI guards, and keyboard/tablet tap target layouts that must not be altered.
- **HTML5 Color Input Hex Default (`#047554` in `src/pages/admin/AdminTeams.tsx`) — LOW Risk (Intentional)**
  - Reason: `<input type="color">` requires a `#rrggbb` hex string and does not support CSS `var(--...)` syntax.

### 3. Manual Test Checklist (10 Most Important Flows)

1. **Signed-Out Home Page (`/`)**: Verify hero section, dot-matrix ticker items, and sport roster counts load with zero Supabase RLS errors in the browser console.
2. **Signed-Out Teams Directory (`/teams`)**: Verify all teams for the active season render with logos, short codes, owner names, and squad counts (reading exclusively from `public_teams` and `public_players`).
3. **Signed-Out Sport Roster & Search (`/rosters`, `/rosters/cricket`)**: Verify filtering by role and academic year, searching by player name or 4-digit code, and "Load More" pagination.
4. **Signed-Out Athlete Profile (`/players/:code`)**: Verify universal athlete header and multi-season career history load from `public_players` and `public_teams`.
5. **Signed-Out Seasons Archive (`/season`, `/season/:id`, `/season/:id/teams/:teamId`)**: Verify active and past seasons, season overview/teams/players tabs, and franchise squad groupings by role.
6. **Admin Authentication & Navigation (`/login`, `/admin`)**: Verify admin login, collapsible desktop sidebar persistence (`fieldr_admin_sidebar_collapsed`), theme switcher (`fieldr-theme`), and season switcher.
7. **Admin Athletes & Bulk Registration (`/admin` -> Athletes / Players)**: Verify creating/editing an athlete, opening "Bulk Register", filtering by sport/roles, and registering multiple athletes in one step.
8. **Admin Setup — Sports & Roles and Auction Settings (`/admin` -> Setup)**: Verify adding, renaming (with player count toast), reordering, and deleting sport roles, plus saving "Auction display and rules" settings.
9. **Admin Live Auction Room (`/admin` -> Auction)**: Verify bringing an available/unsold player to stage, placing increment and custom bids, clearing bids, marking unsold, securing a player, and undoing the last sale.
10. **Live Projector Display (`/projector`)**: Verify `idle`, `auction`, `sold` (with `SecuredSequence` animation and count-up), and `unsold` scenes update in real time and catch up on tab visibility/reconnect.

### 4. Files That Grew or Shrank by More Than 30%

- `src/lib/constants.ts`: New file (+80 lines) created to hold shared constants and union types.
- `src/lib/utils.ts`: New file (+54 lines) created to hold shared formatting, sport matching, and sorting helpers.
- `docs/CODE_HEALTH.md`: New file created for the Phase 1 audit and Phase 2 final report.
- No existing application source file grew or shrank by more than 30%.

