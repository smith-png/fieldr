# Realtime Subscriptions Audit

## 1. Realtime Subscriptions & Helpers Across the Project

| File name | Page or component | Table or channel listened to | Used by (PUBLIC signed-out page, ADMIN page, or PROJECTOR) | Unsubscribes on page close (yes or no) |
| :--- | :--- | :--- | :--- | :--- |
| `src/lib/data/client.ts` | `demoBroadcastChannel` (module-level helper) | `BroadcastChannel('fieldr-projector-sync')` (demo mode only) | PUBLIC signed-out page, ADMIN page, PROJECTOR | No (module-level channel instance in demo mode; individual subscribers remove their message listeners on unmount) |
| `src/lib/data/site.ts` | `subscribeToCarouselItems` | Supabase channel `fieldr-carousel-realtime` on table `public.carousel_items` (`event: '*'`); in demo mode `BroadcastChannel('fieldr-projector-sync')` (`carousel_change`) + `window` `storage` | PUBLIC signed-out page (`HomePage`) | Yes (`supabase.removeChannel(realtimeChannel)` / `removeEventListener`) |
| `src/lib/data/teams.ts` | `subscribeToTeams` | Supabase channel `teams_${seasonId}` on table `public.teams` (`event: '*'`, `season_id=eq.${seasonId}`); in demo mode `BroadcastChannel('fieldr-projector-sync')` (`teams_change`) + `window` `storage` | ADMIN page (`AdminPage`), PROJECTOR (`ProjectorPage`) | Yes (`supabase.removeChannel(sbChannel)` / `removeEventListener`) |
| `src/lib/data/players.ts` | `subscribeToPlayers` | Supabase channel `players_${seasonId}` on table `public.players` (`event: '*'`, `season_id=eq.${seasonId}`); in demo mode `BroadcastChannel('fieldr-projector-sync')` (`players_change`) + `window` `storage` | ADMIN page (`AdminPage`), PROJECTOR (`ProjectorPage`) | Yes (`supabase.removeChannel(sbChannel)` / `removeEventListener`) |
| `src/lib/data/projector.ts` | `subscribeToProjector` | Supabase channel `projector_state_${seasonId}` on table `public.projector_state` (`event: '*'`, `season_id=eq.${seasonId}`); in demo mode `BroadcastChannel('fieldr-projector-sync')` (`projector_change`) + `window` `storage` | ADMIN page (`AdminPage`), PROJECTOR (`ProjectorPage`) | Yes (`supabase.removeChannel(sbChannel)` / `removeEventListener`) |
| `src/lib/data/athletes.ts` | `subscribeToAthletes` | Supabase channel `admin_athletes_realtime` on tables `public.athletes` (`event: '*'`) and `public.players` (`event: '*'); in demo mode `BroadcastChannel('fieldr-projector-sync')` (`athletes_change`, `players_change`) + `window` `storage` | ADMIN page (`AdminAthletes`, `AdminPlayers`) | Yes (`supabase.removeChannel(channel)` / `removeEventListener`) |
| `src/lib/data/auction.ts` | `subscribeToAuctionSettings` | Supabase channel `auction_settings_${seasonId}` on table `public.auction_settings` (`event: '*'`, `season_id=eq.${seasonId}`); in demo mode `BroadcastChannel('fieldr-projector-sync')` (`auction_settings_change`) + `window` `storage` | PROJECTOR (`ProjectorPage`) | Yes (`supabase.removeChannel(channel)` / `removeEventListener`) |
| `src/lib/data/auction.ts` | `subscribeToAuctionRealtime` | Supabase channel `admin_auction_live_${seasonId}` on tables `public.projector_state`, `public.players`, `public.teams`, `public.auction_bids`, `public.auction_sales`, and `public.auction_settings` (`event: '*'`); in demo mode `BroadcastChannel('fieldr-projector-sync')` + `window` `storage` | ADMIN page (`AdminAuction`) | Yes (`supabase.removeChannel(channel)` / `removeEventListener`) |
| `src/pages/public/HomePage.tsx` | `HomePage` | Calls `subscribeToCarouselItems` -> channel `fieldr-carousel-realtime` (`public.carousel_items`) | PUBLIC signed-out page | Yes |
| `src/pages/public/ProjectorPage.tsx` | `ProjectorPage` | Calls `subscribeToProjector` (`projector_state_${seasonId}` -> `public.projector_state`), `subscribeToAuctionSettings` (`auction_settings_${seasonId}` -> `public.auction_settings`), `subscribeToTeams` (`teams_${seasonId}` -> `public.teams`), and `subscribeToPlayers` (`players_${seasonId}` -> `public.players`) | PROJECTOR | Yes |
| `src/pages/admin/AdminPage.tsx` | `AdminPage` (admin layout shell for all `/admin/*` views) | Calls `subscribeToProjector` (`projector_state_${seasonId}` -> `public.projector_state`), `subscribeToPlayers` (`players_${seasonId}` -> `public.players`), and `subscribeToTeams` (`teams_${seasonId}` -> `public.teams`) | ADMIN page | Yes |
| `src/pages/admin/AdminAuction.tsx` | `AdminAuction` (mounted inside `AdminPage` on `/admin/auction`) | Calls `subscribeToAuctionRealtime` -> channel `admin_auction_live_${seasonId}` (`public.projector_state`, `public.players`, `public.teams`, `public.auction_bids`, `public.auction_sales`, `public.auction_settings`) | ADMIN page | Yes |
| `src/pages/admin/AdminAthletes.tsx` | `AdminAthletes` (mounted inside `AdminPage` on `/admin/athletes`) | Calls `subscribeToAthletes` -> channel `admin_athletes_realtime` (`public.athletes`, `public.players`) | ADMIN page | Yes |
| `src/pages/admin/AdminPlayers.tsx` | `AdminPlayers` (mounted inside `AdminPage` on `/admin/players`) | Calls `subscribeToAthletes` -> channel `admin_athletes_realtime` (`public.athletes`, `public.players`) | ADMIN page | Yes |

---

## 2. Realtime WebSocket Connections & Channels per Browser Tab

Because the app uses a single shared `SupabaseClient` instance (`@supabase/supabase-js`), Supabase Realtime opens **at most 1 underlying WebSocket connection per browser tab** and multiplexes all subscribed channels over that socket.

| Page | Underlying WebSocket connections opened | Active Supabase Realtime channels (topics) subscribed | Details |
| :--- | :--- | :--- | :--- |
| **Public Home** (`/`) | **1** | **1 channel** (1 `postgres_changes` listener) | Subscribes to `fieldr-carousel-realtime` (`public.carousel_items`). |
| **Public Teams page** (`/teams` and `/season/:id/teams/:teamId`) | **0** | **0 channels** | Does not open any realtime subscriptions (fetches via REST only). |
| **Rosters page** (`/rosters` and `/rosters/:sport`) | **0** | **0 channels** | Does not open any realtime subscriptions (fetches via REST only). |
| **The Projector** (`/projector`) | **1** | **4 channels** (4 `postgres_changes` listeners) | Subscribes to `projector_state_${seasonId}`, `auction_settings_${seasonId}`, `teams_${seasonId}`, and `players_${seasonId}`. |
| **The Auction Room** (`/admin/auction`) | **1** | **4 channels** (9 `postgres_changes` listeners) | `AdminPage` subscribes to 3 channels (`projector_state_${seasonId}`, `players_${seasonId}`, `teams_${seasonId}`) and `AdminAuction` subscribes to 1 channel (`admin_auction_live_${seasonId}` with 6 `postgres_changes` listeners on `projector_state`, `players`, `teams`, `auction_bids`, `auction_sales`, and `auction_settings`). |

---

## 3. Supabase Client Instantiation

- The Supabase client is **created once and shared** across the entire application.
- `createClient(supabaseUrl, supabaseAnonKey)` is called in one place only: `src/lib/data/client.ts` (lines 12–14), where it is exported as the module singleton `export const supabase: SupabaseClient | null`. All other data modules import and reuse this single instance.
