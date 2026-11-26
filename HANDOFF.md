# Fieldr Engineering Handoff

This document summarizes all client-side changes made from the intermittent error-page fix through multi-admin concurrency and expected-state auction guards. It is intended as a direct context handoff for continuing work on the codebase.

**Build / Typecheck Status:** Both `tsc --noEmit` and `vite build` pass with zero errors.

---

## 1. Summary of Workstreams (Chronological)

### Workstream A: Error Page Diagnostics, Stale-Deploy Chunk Recovery & Load-Time Races
Goal: Diagnose and eliminate intermittent "Something went wrong" crashes on initial load (particularly on `/admin` and `/owner` routes) and recover cleanly from stale Vite deploy chunks.

1. **ErrorBoundary improvements (`src/components/layout/ErrorBoundary.tsx`, `src/App.tsx`)**
   - Logs both `error` and `errorInfo.componentStack` via `console.error` in `componentDidCatch`.
   - Added `ErrorFallbackCard` with:
     - A **"Try again"** button next to **"Reload page"** that resets boundary state (`hasError: false`, clears `error` and `componentStack`) without forcing a full browser reload.
     - A collapsed `<details>` ("Details") disclosure displaying `error.name`, `error.message`, and the first 5 non-empty lines of `error.stack` (falling back to `componentStack`) for easy screenshot debugging.
   - Kept the existing card design unchanged.

2. **Stale deploy chunk reload helper (`src/lib/lazyWithRetry.ts`, `src/main.tsx`, `src/App.tsx`, `src/pages/admin/AdminPage.tsx`, public pages)**
   - Added `lazyWithRetry`, `retryDynamicImport`, `isChunkLoadError`, `triggerChunkReloadOnce`, and `installPreloadErrorHandler`.
   - Matches chunk load failures (`failed to fetch dynamically imported module`, `importing a module script failed`, `chunkloaderror`, `unable to preload css`).
   - On first chunk failure, sets `sessionStorage` flag `fieldr_chunk_reload_attempted = '1'`, triggers a single `window.location.reload()`, and keeps the dynamic import promise pending during reload so the ErrorBoundary does not flash.
   - Prevents infinite reload loops if the flag is already set. Clears the flag on successful dynamic import and 5 seconds after settled `window` load.
   - Registers a `vite:preloadError` window listener in `src/main.tsx` (`installPreloadErrorHandler()`) that calls `triggerChunkReloadOnce()` and `event.preventDefault()`.
   - Wrapped every `React.lazy(...)` import across the app: all route imports in `src/App.tsx` (including `projectorRouteComponent` via `retryDynamicImport`), all admin tab imports in `src/pages/admin/AdminPage.tsx`, `LazyNavigationMenu` in `src/pages/public/HomePage.tsx`, and `MarkdownContent` in `src/pages/public/RegisterPage.tsx`, `src/pages/public/ReelsPage.tsx`, and `src/pages/public/ReelSubmitPage.tsx`.

3. **Load-time race and undefined-data hardening**
   - **`src/lib/data/auth.ts`**: Hardened `getCurrentUser()` and `signIn()` to throw `AppError` on session/profile fetch errors instead of returning silently corrupted state, and guarded `data?.session` / `session?.user` / `profile?.role` with optional chaining.
   - **`src/components/layout/RouteGuard.tsx`**: Added explicit `user?.role` guard before role checks and `preloadComponent.load()`. Caught preload errors into an inline `<ErrorState>` with retry instead of crashing into the global boundary.
   - **`src/pages/admin/AdminPage.tsx`**: Gated initial data fetches and tab prefetching behind `isAdminReady = !isAuthLoading && user?.role === 'admin'`. Guarded all array reads with `Array.isArray(...)`, tracked mount/request-id cancellation, and added an inline `<ErrorState>` retry view when the initial admin bundle fails to load.
   - **`src/pages/admin/AdminAccounts.tsx`**: Gated loads behind `isAdminReady`, guarded cached/fetched `accounts` and `sessions` arrays with `Array.isArray(...)`, and rendered inline `<ErrorState>` retry panels on load failure.
   - **`src/pages/admin/AdminTeams.tsx` & `src/pages/admin/AdminLogs.tsx`**: Added `Array.isArray(...)` guards on props/responses and inline `<ErrorState>` retry states on initial query failure.
   - **`src/pages/public/OwnerLoginPage.tsx` & `src/pages/public/SeasonTeamDetailPage.tsx`**: Deferred owner-scoped queries until `!isAuthLoading`, added `Array.isArray(...)` guards around player/sport payloads, and ensured failed initial queries show inline `<ErrorState>` retry panels rather than throwing during render.

---

### Workstream B: Multi-Admin Live Sync (Up to 3 Concurrent Admins)
Goal: Keep up to 3 admins working simultaneously in live sync without silent overwrites, duplicate realtime channels, or public-page realtime overhead.

1. **Single shared admin realtime layer (`src/hooks/useAdminRealtime.tsx`, `src/lib/adminRealtime.ts`, `src/lib/data/client.ts`)**
   - Mounted `<AdminRealtimeProvider>` exclusively inside `src/pages/admin/AdminPage.tsx` (enabled only when `isAdminReady`). Never subscribes on public pages.
   - Maintains exactly **2 Supabase Realtime channels per admin browser tab**, both cleaned up (`untrack` + `removeChannel`) on unmount or season switch:
     - **Channel 1 (`admin_db_sync_${seasonId}` or `admin_db_sync_global`)**: Single `postgres_changes` channel subscribed to:
       - Global tables: `seasons`, `carousel_items`, `site_settings`
       - Season-scoped tables (`season_id=eq.${seasonId}`): `projector_state`, `players`, `teams`, `purse_transactions`, `auction_queue`, `owner_announcements`
     - **Channel 2 (`admin-sync`)**: Single Broadcast + Presence channel (`broadcast: { self: false }`, `presence: { key: user.id }`):
       - **Broadcast (`entity_changed`)**: Propagates admin mutations for entities whose tables are not on `postgres_changes` or span composite writes: `athletes`, `registrations`, `credits`, `handbooks`, `reels`, `auction_settings`, `sports`, `rules`.
       - **Presence**: Tracks `{ user_id, email, name, online_at }` (resolving display name from Supabase auth `user_metadata.full_name` / `display_name` / `name` or email local part) and exposes sorted `onlineAdmins` via `useAdminRealtime()`.
   - **Per-topic 300ms debounce (`REALTIME_DEBOUNCE_MS = 300`)**: `emitTopic(topic)` debounces bursts per topic and triggers only subscribers registered via `useAdminRealtimeTopics(topics, callback, enabled)`.
   - **Targeted refetches (no full reloads, no trusting partial payloads for money/purse)**:
     - `AdminPage.tsx` (`AdminRealtimeBridge`) refetches only the affected slice: `refreshProjectorOnly`, `refreshPlayersOnly`, `refreshTeamsOnly`, `refreshTransactionsOnly` (refetches both transactions and teams so purse balances stay authoritative), `refreshSeasonsOnly`, and `refreshSportsOnly`.
     - Individual tabs/cards subscribe only to their own topics: `AdminAuction`, `AdminDashboard`, `AdminLogs`, `AdminAthletes`, `AdminPlayers`, `AdminSetup`, `AdminRegistrationsTab`, `RegistrationSetupCard`, `CreditsSetupCard`, `RulesSetupCard`, `ReelsSetupCard`, `HandbookSetupCard`, and `ReelSubmissionsCard`.
   - Removed duplicate auction realtime channel setup: `subscribeToAuctionRealtime` in `src/lib/data/auction.ts` is now a no-op because `AdminAuction.tsx` consumes `AdminRealtimeProvider`.
   - Added `broadcastAdminSync(entity, action)` calls after successful mutations in `src/lib/data/athletes.ts`, `src/lib/data/auction.ts` (settings), `src/lib/data/credits.ts`, `src/lib/data/reels.ts`, `src/lib/data/registrations.ts`, `src/lib/data/rules.ts`, `src/lib/data/teams.ts` (sport roles), and `src/components/admin/HandbookSetupCard.tsx`.

2. **Admins online presence indicator (`src/pages/admin/AdminLayout.tsx`, `src/components/admin/AdminNav.tsx`)**
   - `AdminLayout` reads `onlineAdmins` from `useAdminRealtime()` and passes it into both desktop and mobile `AdminNav`.
   - Displays a compact **"Admins online: N"** indicator in the sidebar footer (with a collapsed rail pill showing the count + tooltip, and an expandable list showing display names and a `(you)` marker for the current admin).

3. **In-flight mutation guards & conflict handling (`src/lib/errors.ts` + admin pages)**
   - Added `CONFLICT_TOAST_MESSAGE = 'Already updated by another admin'` and `isStaleConflictError(err)` in `src/lib/errors.ts` (matching Postgres serialization/deadlock/no-data codes `40001`, `40P01`, `P0002` and stale/state-mismatch error messages).
   - Added conflict toast + immediate refetch (never silently overwriting) in:
     - `AdminPurses.tsx`, `AdminPlayers.tsx`, `AdminProjectorControl.tsx`, `AdminSeasons.tsx`, `AdminSetup.tsx`, and `AdminRegistrationsTab.tsx`.
   - Added in-flight submission guards (ref + pending state disabling action buttons until the call resolves) on auction actions (`AdminAuction.tsx`), purse actions (`AdminPurses.tsx`), and other admin mutation buttons.

4. **Admin attribution on mutations & Activity Logs (`src/lib/data/client.ts`, `src/lib/data/purses.ts`, `src/lib/data/teams.ts`, `src/pages/admin/AdminLogs.tsx`)**
   - Added `resolveCurrentAdminActor(explicitActor?)` in `src/lib/data/client.ts`, resolving the signed-in admin's metadata display name or email (fallback `'admin'`).
   - Passed resolved actor into `execute_purse_transaction` (`p_created_by`) in `src/lib/data/purses.ts` and team initial purse / adjustment paths in `src/lib/data/teams.ts`.
   - Updated `src/pages/admin/AdminLogs.tsx` to display an **Admin** column (`row.actor || '—'`, truncated with tooltip) and include `actor` in CSV exports.

---

### Workstream C: Expected-State Concurrency Parameters for Auction Stage RPCs
Goal: Wire the four updated auction database RPCs to accept optional expected-state parameters from the currently displayed UI so two concurrent admins cannot act on a stale stage.

1. **Typed service & RPC call updates (`src/lib/data/types.ts`, `src/lib/data/auction.ts`)**
   - Updated `AuctionService` signatures and `supabaseAuctionService` / exported wrappers to pass named arguments:
     - `auction_place_bid`: `{ p_team_id: teamId, p_amount: amount, p_expected_player_id: expectedPlayerId ?? null }`
     - `auction_clear_bid`: `{ p_season_id: seasonId, p_expected_player_id: expectedPlayerId ?? null, p_expected_bid: expectedBid ?? null }`
     - `auction_secure`: `{ p_season_id: seasonId, p_expected_player_id: expectedPlayerId ?? null, p_expected_bid: expectedBid ?? null }`
     - `auction_mark_unsold`: `{ p_season_id: seasonId, p_expected_player_id: expectedPlayerId ?? null, p_expected_bid: expectedBid ?? null }`

2. **Auction stage UI behavior (`src/pages/admin/AdminAuction.tsx`)**
   - **Snapshot from screen state at tap time**: `handlePlaceBid`, `handleClearBid`, `handleConfirmSecure`, and `handleConfirmMarkUnsold` read `expectedPlayerId = stagePlayer?.id ?? projectorState.player_id ?? null` and `expectedBid = projectorState.current_bid != null ? Number(projectorState.current_bid) : null` directly from currently rendered React state (never refetched before calling the RPC).
   - **Stale error handling**: In `handleActionFailure`, if `message.trim().startsWith('Stale:')`:
     - Closes open confirmation dialogs (`isSecureConfirmOpen`, `isUnsoldConfirmOpen`, `isUndoSaleConfirmOpen`, `isClearQueueConfirmOpen`, `pendingReplacePlayer`).
     - Shows toast: `"Another admin changed the stage. Check the screen and try again."`
     - Immediately refetches auction state (`await Promise.all([fetchLiveAuctionState(), onRefresh()])`).
     - Does **not** automatically retry.
     - Non-`Stale:` errors continue to show their original message unchanged.
   - **In-flight button guards**: `isPending` + synchronous `actionInFlightRef` disable all team Bid tiles, Sold (`Secure`) button & confirm dialog CTA, Unsold (`Mark unsold`) button & confirm dialog CTA, and Clear bid button while any auction call is in flight.
   - **Replace-on-stage confirmation dialog**: `handleBringToStage(player)` checks `hasActiveStageBid = projectorState.mode === 'auction' && Boolean(stagePlayer) && (Boolean(projectorState.team_id) || (projectorState.current_bid != null && Number(projectorState.current_bid) > 0))`.
     - If `hasActiveStageBid && stagePlayer?.id !== player.id`, opens a confirm `<Dialog>` asking `"Another player is on stage with a bid. Replace them?"` before calling `auction_bring_to_stage`.
     - If the stage is empty or has no active bid, calls `auction_bring_to_stage` directly with no dialog.

---

## 2. Complete File Inventory (New & Modified Since Error-Page Prompt)

### New Files
- `src/lib/lazyWithRetry.ts` — Stale chunk reload-once wrapper, `vite:preloadError` listener, `sessionStorage` loop guard.
- `src/lib/adminRealtime.ts` — Shared admin realtime topic types, `OnlineAdmin` type, channel constants, and `broadcastAdminSync()`.
- `src/hooks/useAdminRealtime.tsx` — `AdminRealtimeProvider`, `useAdminRealtime()`, and `useAdminRealtimeTopics()` managing the single Postgres changes channel + single Broadcast/Presence channel per admin tab with 300ms per-topic debounce.

### Modified Core / App Infrastructure
- `src/main.tsx` — Calls `installPreloadErrorHandler()` on startup.
- `src/App.tsx` — Switches all route lazy imports to `lazyWithRetry` / `retryDynamicImport`, wires `ErrorFallbackCard` into global `ErrorBoundary`.
- `src/components/layout/ErrorBoundary.tsx` — Adds `console.error` logging with component stack, collapsed "Details" panel, and "Try again" reset button.
- `src/components/layout/RouteGuard.tsx` — Adds `user?.role` guard and inline `<ErrorState>` retry UI for failed route preloads.
- `src/lib/errors.ts` — Adds `CONFLICT_TOAST_MESSAGE` and `isStaleConflictError()`.

### Modified Data Layer (`src/lib/data/*`)
- `src/lib/data/types.ts` — Updated `AuctionService` method signatures with optional `expectedPlayerId` / `expectedBid`.
- `src/lib/data/client.ts` — Added `REALTIME_DEBOUNCE_MS = 300` and `resolveCurrentAdminActor()`.
- `src/lib/data/auth.ts` — Hardened session/profile retrieval against undefined/error races.
- `src/lib/data/auction.ts` — Added `p_expected_player_id` / `p_expected_bid` RPC parameters, broadcast sync on `saveAuctionSettings`, made `subscribeToAuctionRealtime` a no-op (delegated to `AdminRealtimeProvider`).
- `src/lib/data/purses.ts` — Passes resolved admin actor (`p_created_by`) to `execute_purse_transaction`.
- `src/lib/data/teams.ts` — Broadcasts `'sports'` sync on role mutations; passes resolved admin actor on team purse creation/adjustments.
- `src/lib/data/athletes.ts` — Broadcasts `'athletes'` sync on create/update/delete.
- `src/lib/data/registrations.ts` — Broadcasts `'registrations'` (and `'athletes'` on approval) sync on admin registration mutations.
- `src/lib/data/credits.ts` — Broadcasts `'credits'` sync on create/update/delete/reorder.
- `src/lib/data/rules.ts` — Broadcasts `'rules'` sync on upload/delete.
- `src/lib/data/reels.ts` — Broadcasts `'reels'` sync on settings/submission mutations.

### Modified Admin Shell & Pages (`src/pages/admin/*`, `src/components/admin/*`)
- `src/pages/admin/AdminPage.tsx` — Uses `lazyWithRetry` for all tab imports, gates initial load on `isAdminReady`, renders `<ErrorState>` on initial failure, wraps app in `<AdminRealtimeProvider>` + `<AdminRealtimeBridge>` with slice-level refetches.
- `src/pages/admin/AdminLayout.tsx` — Reads `onlineAdmins` from `useAdminRealtime()` and passes it to `AdminNav`.
- `src/components/admin/AdminNav.tsx` — Renders collapsible "Admins online: N" presence widget in desktop sidebar (expanded & collapsed) and mobile drawer.
- `src/pages/admin/AdminAuction.tsx` — Consumes `useAdminRealtimeTopics`, passes expected-state RPC parameters from displayed screen state, handles `"Stale:"` errors with toast + immediate refetch (no retry), guards all stage buttons while pending, adds confirm dialog before replacing a player with an active bid.
- `src/pages/admin/AdminDashboard.tsx` — Subscribes to shared realtime topics.
- `src/pages/admin/AdminLogs.tsx` — Subscribes to shared realtime topics, adds `Admin` (`actor`) column & CSV field, adds inline `<ErrorState>` retry and array guards.
- `src/pages/admin/AdminPurses.tsx` — Adds in-flight guards and stale-conflict toast + refetch handling.
- `src/pages/admin/AdminPlayers.tsx` — Subscribes to shared realtime topics and adds conflict toast + refetch handling.
- `src/pages/admin/AdminAthletes.tsx` — Subscribes to shared realtime topics (`athletes`, `players`, `registrations`).
- `src/pages/admin/AdminTeams.tsx` — Hardened array/load error handling.
- `src/pages/admin/AdminAccounts.tsx` — Gated loads on `isAdminReady`, guarded arrays, added inline `<ErrorState>` retry panels.
- `src/pages/admin/AdminProjectorControl.tsx` — Added conflict toast + refetch handling.
- `src/pages/admin/AdminSeasons.tsx` — Added conflict toast + refetch handling.
- `src/pages/admin/AdminSetup.tsx` — Subscribes to `carousel_items`, `site_settings`, `sports`, and `auction_settings`; adds conflict handling.
- `src/components/admin/AdminRegistrationsTab.tsx` — Subscribes to `registrations` topic and adds conflict handling.
- `src/components/admin/RegistrationSetupCard.tsx` — Subscribes to `registrations` and `seasons` topics.
- `src/components/admin/CreditsSetupCard.tsx` — Subscribes to `credits` topic.
- `src/components/admin/RulesSetupCard.tsx` — Subscribes to `rules` topic.
- `src/components/admin/ReelsSetupCard.tsx` — Subscribes to `reels` topic.
- `src/components/admin/ReelSubmissionsCard.tsx` — Subscribes to `reels` topic.
- `src/components/admin/HandbookSetupCard.tsx` — Subscribes to `handbooks` topic and broadcasts `handbooks` sync on create/update/delete.

### Modified Public / Owner Routes (`src/pages/public/*`)
- `src/pages/public/HomePage.tsx` — Switched `LazyNavigationMenu` to `lazyWithRetry`, added `Array.isArray` guards.
- `src/pages/public/RegisterPage.tsx` — Switched `MarkdownContent` to `lazyWithRetry`.
- `src/pages/public/ReelsPage.tsx` — Switched `MarkdownContent` to `lazyWithRetry`.
- `src/pages/public/ReelSubmitPage.tsx` — Switched `MarkdownContent` to `lazyWithRetry`.
- `src/pages/public/OwnerLoginPage.tsx` — Hardened auth loading/user state handling.
- `src/pages/public/SeasonTeamDetailPage.tsx` — Waits for `!isAuthLoading` before owner queries, guards arrays, adds inline `<ErrorState>` retry.

---

## 3. Important Invariants & Gotchas for Continuation

1. **Supabase Realtime scoping**: Public routes must **not** subscribe to admin realtime channels. Keep `<AdminRealtimeProvider>` mounted only inside `AdminPage.tsx` (gated by `isAdminReady`). Projector and Owner views retain their existing separate flows.
2. **Stale error contract on `AdminAuction.tsx`**:
   - The four stage RPCs (`auction_place_bid`, `auction_clear_bid`, `auction_secure`, `auction_mark_unsold`) are expected to raise an error message starting with `"Stale:"` when `p_expected_player_id` or `p_expected_bid` no longer matches server state.
   - `AdminAuction.tsx` intentionally checks `message.trim().startsWith('Stale:')` rather than the broader `isStaleConflictError()` helper so business-rule errors (e.g., purse too low, squad full, invalid bid increment) keep their exact server messages.
   - Other admin pages (`AdminPurses`, `AdminPlayers`, `AdminProjectorControl`, `AdminSeasons`, `AdminSetup`, `AdminRegistrationsTab`) use `isStaleConflictError()` + `CONFLICT_TOAST_MESSAGE`.
3. **Never refetch before computing expected-state args**: In `AdminAuction.tsx`, `expectedPlayerId` and `expectedBid` must always come from the currently displayed React state at the moment the admin clicks the button—otherwise the optimistic concurrency check is defeated.
4. **Never trust partial realtime payloads for money/purse numbers**: All realtime callbacks debounce (300ms) and refetch authoritative rows from Supabase.
5. **Environment & security conventions**: Never hardcode Supabase URLs or anon keys (always read `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` via `src/lib/data/client.ts`).
