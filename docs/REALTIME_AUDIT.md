# Supabase Realtime Subscriptions Audit

## 1 & 2. All Realtime Subscriptions and Unmount Cleanup

### A. Supabase `postgres_changes` Channel Definitions (`src/lib/data/`)

| Helper File | Function | Channel Name | Table(s) / Filter | Used By (Page / Component) | Context | Unsubscribes / Removes Channel on Unmount |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/lib/data/site.ts` (L391–409) | `subscribeToCarouselItems` | `fieldr-carousel-realtime` | `public.carousel_items` (`event: '*'`) | `src/pages/public/HomePage.tsx` (L126–149) | Public Page (`Home`) | **Yes** (`supabase.removeChannel(realtimeChannel)` in `useEffect` cleanup) |
| `src/lib/data/projector.ts` (L241–267) | `subscribeToProjector` | `projector_state_${seasonId}` | `public.projector_state` (`season_id=eq.${seasonId}`) | `src/pages/admin/AdminPage.tsx` (L165–179)<br>`src/pages/public/ProjectorPage.tsx` (L589–630) | Admin Pages, Auction Room, Projector | **Yes** (`supabase.removeChannel(sbChannel)` in `useEffect` cleanup) |
| `src/lib/data/players.ts` (L1340–1362) | `subscribeToPlayers` | `players_${seasonId}` | `public.players` (`season_id=eq.${seasonId}`) | `src/pages/admin/AdminPage.tsx` (L168–179)<br>`src/pages/public/ProjectorPage.tsx` (L611–630) | Admin Pages, Auction Room, Projector | **Yes** (`supabase.removeChannel(sbChannel)` in `useEffect` cleanup) |
| `src/lib/data/teams.ts` (L830–853) | `subscribeToTeams` | `teams_${seasonId}` | `public.teams` (`season_id=eq.${seasonId}`) | `src/pages/admin/AdminPage.tsx` (L171–179)<br>`src/pages/public/ProjectorPage.tsx` (L600–630) | Admin Pages, Auction Room, Projector | **Yes** (`supabase.removeChannel(sbChannel)` in `useEffect` cleanup) |
| `src/lib/data/athletes.ts` (L765–793) | `subscribeToAthletes` | `admin_athletes_realtime` | `public.athletes` (`event: '*'`)<br>`public.players` (`event: '*'`) | `src/pages/admin/AdminAthletes.tsx` (L172–176)<br>`src/pages/admin/AdminPlayers.tsx` (L378–383) | Admin Pages (`Athletes` tab, `Players` tab) | **Yes** (`supabase.removeChannel(channel)` in `useEffect` cleanup) |
| `src/lib/data/auction.ts` (L698–730) | `subscribeToAuctionSettings` | `auction_settings_${seasonId}` | `public.auction_settings` (`season_id=eq.${seasonId}`) | `src/pages/public/ProjectorPage.tsx` (L593–630) | Projector | **Yes** (`supabase.removeChannel(channel)` in `useEffect` cleanup) |
| `src/lib/data/auction.ts` (L915–983) | `subscribeToAuctionRealtime` | `admin_auction_live_${seasonId}` | `public.auction_state` (`season_id=eq.${seasonId}`)<br>`public.auction_bids` (`season_id=eq.${seasonId}`)<br>`public.auction_settings` (`season_id=eq.${seasonId}`)<br>`public.teams` (`season_id=eq.${seasonId}`)<br>`public.players` (`season_id=eq.${seasonId}`)<br>`public.projector_state` (`season_id=eq.${seasonId}`) | `src/pages/admin/AdminAuction.tsx` (L179–184) | Auction Room (`AdminAuction` tab inside `AdminPage`) | **Yes** (`supabase.removeChannel(channel)` in `useEffect` cleanup) |

### B. Supabase Broadcast / Presence Usage
- **Supabase Broadcast (`.on('broadcast', ...)`):** None used anywhere in the project.
- **Supabase Presence (`.on('presence', ...)`):** None used anywhere in the project.
- **Browser `BroadcastChannel` (local demo mode only):** `src/lib/data/client.ts` (L17–20) creates `new BroadcastChannel('fieldr-projector-sync')` only when `isDemoMode === true` (when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing). All demo listeners remove their `message` event listener on unmount.

---

## 3. WebSocket Connections and Realtime Channels per Open Browser Tab

Because the app shares a single `SupabaseClient` instance (`src/lib/data/client.ts`), `@supabase/supabase-js` multiplexes all active realtime channels in a browser tab over **at most 1 WebSocket connection** (`0` WebSocket connections if no channel is subscribed on that page).

| Page | Route(s) | WebSocket Connections per Tab | Active Realtime Channels Multiplexed on that WebSocket |
| :--- | :--- | :--- | :--- |
| **Home** | `/` | **1** | **1 channel:** `fieldr-carousel-realtime` (`carousel_items`) |
| **Rosters** | `/rosters`, `/rosters/:sport` | **0** | **0 channels** |
| **Teams** | `/teams` | **0** | **0 channels** |
| **Team page** | `/season/:id/teams/:teamId` | **0** | **0 channels** |
| **Season** | `/season`, `/season/:id` | **0** | **0 channels** |
| **Help** | `/help` | **0** | **0 channels** |
| **About** | `/about` | **0** | **0 channels** |
| **Handbook** | `/handbook` | **0** | **0 channels** |
| **Admin pages** (Dashboard, Seasons, Teams, Purses, Projector Control, Setup, Logs) | `/admin`, `/admin/logs` | **1** | **3 channels** (mounted by parent `AdminPage.tsx`):<br>1. `projector_state_${seasonId}`<br>2. `players_${seasonId}`<br>3. `teams_${seasonId}` |
| **Admin pages** (Athletes tab or Players tab) | `/admin` (`Athletes` / `Players` tab) | **1** | **4 channels** (3 from parent `AdminPage.tsx` + 1 from active tab):<br>1. `projector_state_${seasonId}`<br>2. `players_${seasonId}`<br>3. `teams_${seasonId}`<br>4. `admin_athletes_realtime` (`athletes`, `players`) |
| **Auction Room** | `/admin` (`Auction` tab) | **1** | **4 channels** (3 from parent `AdminPage.tsx` + 1 from `AdminAuction.tsx`):<br>1. `projector_state_${seasonId}`<br>2. `players_${seasonId}`<br>3. `teams_${seasonId}`<br>4. `admin_auction_live_${seasonId}` (`auction_state`, `auction_bids`, `auction_settings`, `teams`, `players`, `projector_state`) |
| **Projector** | `/projector` | **1** | **4 channels** (mounted by `ProjectorPage.tsx`):<br>1. `projector_state_${seasonId}`<br>2. `auction_settings_${seasonId}`<br>3. `teams_${seasonId}`<br>4. `players_${seasonId}` |

---

## 4. Supabase Client Instantiation

- **Created once and shared:** `createClient(supabaseUrl, supabaseAnonKey)` is called in **one place only** — `src/lib/data/client.ts` (lines 12–14) — and exported as the singleton `supabase` instance imported across the entire application.

---

## 5. Pages / Components Using Realtime That Do Not Need It

1. **Public Home Page (`src/pages/public/HomePage.tsx`, line 126 — `subscribeToCarouselItems`):**
   - Opens a live WebSocket connection (`fieldr-carousel-realtime` on `public.carousel_items`) for every signed-out visitor on `/`. Homepage ticker text is static configuration edited only occasionally in Admin Setup; fetching once on page load (with the existing in-memory cache) is sufficient and avoids opening a WebSocket connection for every public homepage visitor.
2. **Admin Shell (`src/pages/admin/AdminPage.tsx`, lines 165–173) when viewing non-live Admin tabs (`Seasons`, `Setup`, `Activity Log`):**
   - `AdminPage.tsx` keeps `subscribeToProjector`, `subscribeToPlayers`, and `subscribeToTeams` open across all admin tabs, including static configuration/audit tabs (`AdminSetup`, `AdminSeasons`, `AdminLogs`) that do not need live projector/player/team streaming.
   - Additionally, when the **Auction Room** (`AdminAuction.tsx`) is open, `AdminAuction` subscribes to `admin_auction_live_${seasonId}` (which already listens to `teams`, `players`, and `projector_state`), duplicating the 3 table listeners already active in the parent `AdminPage.tsx`.
   - Similarly, when `AdminPlayers.tsx` is open, `subscribeToAthletes` listens to `public.players`, duplicating the `players_${seasonId}` subscription already active in the parent `AdminPage.tsx`.
