# Fieldr Project Reference

This document describes how Fieldr is built and how it works, based directly on the files in this repository. It is written in plain language for anyone operating, reviewing, or maintaining the project. Wherever server-side details or deployment procedures cannot be verified from the repository files alone, this guide states **Not found in code**.

---

## 1. Overview

Fieldr is a live sports player auction web application built for campus or club tournaments. It combines a public tournament site, a private admin command center, a team owner portal, and a synchronized big-screen auditorium projector display.

### Who Uses Fieldr
- **Visitors and spectators:** Browse registered athletes by sport, inspect teams and drafted squads, read tournament help and about pages, view official auction rules PDFs, and unlock the handbook with a code.
- **Admins (auction operators):** Manage seasons, universal athlete profiles, seasonal registrations, franchise teams, team purses, live auction bidding, projector scenes, site content, documents, and staff accounts.
- **Projector operators:** Sign in on an auditorium computer to display the synchronized `/projector` screen in fullscreen without needing admin write access.
- **Team owners:** Sign in to view their own franchise's confidential Owner Panel, showing remaining points purse, total spend, squad size, and drafted players with purchase prices.

### The Three Sports
Fieldr ships with three primary tournament sports configured across the public site and default seed data:
- **Cricket** (default roles: Batsman, Bowler, All-Rounder, Wicket-Keeper)
- **Futsal** (default roles: Forward, Midfielder, Defender, Goalkeeper)
- **Volleyball** (default roles: Setter, Outside Hitter, Middle Blocker, Libero, Opposite)

Admins can customize playing roles for each sport inside System Setup.

### How a Season Works
Fieldr separates **universal athlete profiles** (stored once in the `athletes` table with a permanent 4-digit code such as `#0001`) from **seasonal player entries** (stored per season in the `players` table).
- One season is marked **Active** at a time. The public site, Home page counters, rosters, teams directory, and projector automatically display the active season.
- When a new season starts, admins create it, switch it to Active, register teams for that season, and enroll existing or new athletes into the new season's player pool without losing their past tournament history.

### Real-World Auction Flow (Registration to Sale)
1. **Athlete creation:** An admin creates a universal athlete profile (name, roll number, academic year, optional photo). Fieldr assigns a permanent sequential 4-digit code.
2. **Season registration:** The athlete is registered into the active season for a specific sport, playing role, and base point value (individually or in bulk). They enter the pool with status **available**.
3. **Team and purse setup:** Admins create franchise teams for each sport with a starting points purse (for example, 1,000 PTS) and optionally provision an owner login per team.
4. **Queueing:** Before or during the auction, the operator adds available or unsold players into the sport's auction queue (one by one or by pasting a comma-separated list of 4-digit codes) and orders them.
5. **Live stage:** Bringing a player to stage switches the auditorium projector to the live auction scene showing the player's photo, role, year, base points, and current bid.
6. **Bidding:** As team representatives raise paddles in the room, the admin clicks team tiles or bid increment buttons. Each bid updates the database, triggers a team-colour flash on the projector, and records a row in the bid log.
7. **Securing or passing:**
   - **Secure (Sold):** The winning team's purse is deducted, the player is assigned to that team as **sold**, a sale record and purse transaction are written, and the projector plays the Secured reveal animation before settling on a static SOLD card.
   - **Mark unsold:** The player is marked **unsold**, cleared from leading bids, and can be re-queued later.
   - **Undo last sale:** If a mistake happens, the operator can reverse the latest sale, refunding the team's purse and returning the player to the pool.

---

## 2. Tech Stack

All packages below and their exact version constraints come from `package.json`.

### Runtime Dependencies

| Package / Service | Version (`package.json`) | Purpose in Fieldr |
|---|---|---|
| `react` | `^19.0.1` | Core user interface library |
| `react-dom` | `^19.0.1` | Browser rendering for React |
| `react-router-dom` | `^7.18.5` | Client-side page routing, redirects, and URL query parameters |
| `@supabase/supabase-js` | `^2.119.0` | Database queries, authentication, realtime subscriptions, file storage, RPCs, and Edge Function calls |
| `motion` | `^12.23.24` | Smooth animations and scene transitions (used mainly on the Projector, Secured reveal, and navigation) |
| `@phosphor-icons/react` | `^2.1.10` | Rounded icon set used across public, admin, and projector interfaces |
| `react-markdown` | `^10.1.0` | Renders Markdown content for the Help and About public pages |
| `remark-gfm` | `^4.0.1` | Adds GitHub-flavored Markdown support (tables, checklists, strikethrough) to Help and About pages |
| `remark-breaks` | `^4.0.0` | Converts single line breaks in Markdown into visible line breaks |
| `sonner` | `^2.0.8` | Toast notifications across the application |
| `@vercel/analytics` | `^2.0.1` | Privacy-friendly page view analytics mounted in `App.tsx` |
| `@number-flow/react` | `^0.6.2` | Declared in `package.json` but currently unused anywhere in `src/` |
| `vite` | `^8.3.0` | Frontend development server and production bundler |
| `@vitejs/plugin-react` | `^6.1.1` | Official Vite plugin for React JSX and build integration |
| `@tailwindcss/vite` | `^4.3.3` | Tailwind CSS v4 Vite integration for utility styling |

### Development Dependencies

| Package | Version (`package.json`) | Purpose |
|---|---|---|
| `typescript` | `^7.0.2` | Static type checking (`tsc --noEmit`) |
| `tailwindcss` | `^4.3.3` | Utility-first CSS framework |
| `@types/react` | `^19.3.0` | TypeScript definitions for React |
| `@types/react-dom` | `^19.3.0` | TypeScript definitions for React DOM |
| `@types/node` | `^22.14.0` | TypeScript definitions for Node built-ins used in `vite.config.ts` |

### External Services
- **Supabase:** Hosts the PostgreSQL database, row-level security policies, RPC functions, realtime pub/sub channels, user authentication, file storage buckets, and the `manage-owner` Edge Function.
- **Vercel:** Hosts the compiled static single-page application (SPA) and analytics.
- **Google Fonts:** Loads `DM Sans`, `Syne`, and `DotGothic16` stylesheets via `index.html`.
- **GitHub Actions:** Runs a scheduled keepalive workflow every two days to keep the Supabase project warm.

---

## 3. Project Structure

### Root Files
- `index.html`: HTML shell, anti-flicker theme initialization script, metadata, favicon link, and Google Fonts preloads.
- `package.json`: Project scripts (`dev`, `build`, `preview`, `lint`) and dependency versions.
- `vite.config.ts`: Vite build and dev server settings (React plugin, Tailwind v4 plugin, `@` alias, `DISABLE_HMR` toggle).
- `tsconfig.json`: TypeScript compiler options (`ES2022`, `react-jsx`, `noEmit`).
- `vercel.json`: Catch-all rewrite so all SPA routes resolve to `index.html`.
- `.env.example`: Template listing public Supabase environment variable names.
- `.github/workflows/keepalive.yml`: Scheduled workflow pinging the Supabase `keepalive` RPC.
- `supabase/`: Historical database schema and migration reference files (`schema.sql`, `migration_v2.sql`, `migration_v3.sql`, `migration_v4_sports_roles.sql`, `patch_security_realtime.sql`).
- `CODE_HEALTH_REPORT.md`: Read-only static audit report of the codebase.
- `README.md`: High-level repository overview (partially outdated compared to live features).

### `public/` Folder
- `public/favicon.svg`: Site vector favicon.
- `public/robots.txt`: Crawler rules allowing public routes and disallowing `/admin`, `/projector`, and `/login`.
- `public/images/rosters/cricket.jpg`: Cricket sport card photograph.
- `public/images/rosters/futsal.jpg`: Futsal sport card photograph.
- `public/images/rosters/volleyball.jpg`: Volleyball sport card photograph.

### `src/` Folder
- `src/main.tsx`: React root entry point mounting `<App />`.
- `src/App.tsx`: Top-level router, providers (`ThemeProvider`, `AuthProvider`, `ToastProvider`), global `ErrorBoundary`, lazy route definitions, and Vercel Analytics.
- `src/index.css`: Theme color variables, typography classes, animations, scrollbars, and `.frost` utilities.
- `src/types/index.ts`: Shared TypeScript interfaces for seasons, athletes, players, teams, purses, auction entities, projector state, credits, rules, and auth users.
- `src/hooks/`
  - `useAutoSlideshow.ts`: Synchronized timer hook for projector team and player slideshows.
  - `useBodyScrollLock.ts`: Reference-counted scroll locking for modals and drawers.
  - `useTheme.ts`: Convenience re-export of theme context hook.
- `src/lib/`
  - `AuthContext.tsx`: React context tracking signed-in user session, role, login/logout helpers, and auth state listener.
  - `ToastContext.tsx`: Toast notification wrapper built on `sonner`.
  - `theme.tsx`: Light/dark/system theme state provider and projector theme helper.
  - `constants.ts`: Shared constants for statuses, projector modes, slideshow intervals, public view column lists, and `localStorage` keys.
  - `sports.ts`: Canonical metadata for Cricket, Futsal, and Volleyball.
  - `academicYears.ts`: Academic year options and display label formatter.
  - `errors.ts`: `AppError` wrapper class for structured error handling.
  - `imageCompression.ts`: Client-side image validation (JPG/PNG/WebP up to 5 MB), thumbnail creation, and canvas resizing.
  - `publicCache.ts`: In-memory cache singleton shared across public pages plus change-detection helper.
  - `queryCache.ts`: In-memory TTL query cache plus route and admin tab code-prefetching helpers.
  - `utils.ts`: Shared helpers for sport matching, points formatting, and CSV sanitization.
  - `data.ts`: Barrel re-exporting everything from `src/lib/data/index.ts`.
  - `data/`: Domain data modules (`client.ts`, `auth.ts`, `seasons.ts`, `athletes.ts`, `players.ts`, `teams.ts`, `purses.ts`, `auction.ts`, `projector.ts`, `logs.ts`, `site.ts`, `credits.ts`, `rules.ts`, `storage.ts`, `types.ts`, `index.ts`).
- `src/components/`
  - `admin/`: Admin navigation (`AdminNav.tsx`), shared admin style tokens (`adminStyles.ts`), bulk athlete registration drawer (`BulkRegisterPanel.tsx`), and System Setup cards (`CreditsSetupCard.tsx`, `HandbookSetupCard.tsx`, `RulesSetupCard.tsx`).
  - `common/`: Markdown renderer (`MarkdownContent.tsx`).
  - `credits/`: Public About page Credits showcase (`CreditsSection.tsx`).
  - `home/`: Home page components (`HomeBackdrop.tsx`, `TickerStrip.tsx`, `SportCardsGrid.tsx`, `AnimatedCounter.tsx`).
  - `layout/`: Shared navigation and chrome (`HeaderBar.tsx`, `NavigationMenu.tsx`, `SiteFooter.tsx`, `BrandMark.tsx`, `FooterMark.tsx`, `RouteGuard.tsx`, `ErrorBoundary.tsx`).
  - `projector/`: Fullscreen confetti canvas (`ProjectorConfetti.tsx`) and animated Secured sale reveal (`SecuredSequence.tsx`).
  - `public/`: Shared visual class tokens for public pages (`publicStyles.ts`).
  - `roster/`: Roster athlete card (`RosterPlayerCard.tsx`) and floating detail modal (`RosterScoutModal.tsx`).
  - `ui/`: Reusable UI primitives (`Button.tsx`, `Dialog.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `PageHeader.tsx`, `Pagination.tsx`, `SegmentedControl.tsx`, `Skeleton.tsx`, `Spinner.tsx`, `Toast.tsx`).
- `src/pages/public/`: Public, owner, login, and projector pages (`HomePage.tsx`, `RostersPage.tsx`, `RosterSportPage.tsx`, `PlayerProfilePage.tsx`, `TeamsPage.tsx`, `SeasonTeamDetailPage.tsx`, `ContentPage.tsx`, `RulesPage.tsx`, `HandbookPage.tsx`, `LoginPage.tsx`, `OwnerLoginPage.tsx`, `ProjectorPage.tsx`).
- `src/pages/admin/`: Admin shell and workspace pages (`AdminPage.tsx`, `AdminLayout.tsx`, `AdminDashboard.tsx`, `AdminAuction.tsx`, `AdminProjectorControl.tsx`, `AdminAthletes.tsx`, `AdminPlayers.tsx`, `AdminTeams.tsx`, `AdminPurses.tsx`, `AdminSeasons.tsx`, `AdminLogs.tsx`, `AdminAccounts.tsx`, `AdminSetup.tsx`).

---

## 4. Routes and Pages

Every route declared in `src/App.tsx` is listed below.

| Route | Component | Who Can Open It | What It Shows |
|---|---|---|---|
| `/` | `HomePage` | Everyone | Hero headline (`DRAFT. BID. WIN.`), active season summary, dot-matrix ticker strip, and Explore sport cards |
| `/rosters` | `RostersPage` | Everyone | Official Rosters hub with photo cards and active-season athlete counts for Cricket, Futsal, and Volleyball |
| `/rosters/:sport` | `RosterSportPage` | Everyone | Filterable, endlessly scrollable athlete roster for one sport, with Academic Year and Playing Role filter pills and athlete modal |
| `/players/:code` | `PlayerProfilePage` | Everyone | Universal athlete profile by 4-digit code showing photo, permanent ID, and multi-season tournament history |
| `/teams` | `TeamsPage` | Everyone | Active season franchise teams grouped by sport, tinted by team color, showing owner display name and squad count |
| `/season` | Redirect | Everyone | Redirects automatically to `/teams` |
| `/season/:id` | Redirect | Everyone | Redirects automatically to `/teams` |
| `/season/:id/teams/:teamId` | `SeasonTeamDetailPage` | Everyone (Owner Panel only for that team's signed-in owner) | Team identity, drafted squad list, and inline confidential Owner Panel when opened by that franchise's owner |
| `/help` | `ContentPage` (`help_page`) | Everyone | Admin-editable Markdown Help and Instructions page |
| `/about` | `ContentPage` (`about_page`) | Everyone | Admin-editable Markdown About page followed by the Credits section (Main people and Contributors) |
| `/rules` | `RulesPage` | Everyone | Public list of uploaded Auction Rules PDFs with Open and Download buttons |
| `/handbook` | `HandbookPage` | Anyone with the valid access code | Access-code gate that unlocks a list of uploaded Handbook PDFs with Open and Download buttons |
| `/login` | `LoginPage` | Everyone | Staff sign-in form for Admin and Projector accounts (also displays one-click demo buttons only when in demo mode) |
| `/owner-login` | `OwnerLoginPage` | Everyone | Franchise owner sign-in using Login ID and password; redirects signed-in owners to `/teams` |
| `/admin` | `AdminPage` | `admin` only | Full Admin Command Center with sidebar/mobile navigation across all management tabs |
| `/admin/logs` | `AdminPage` (opens `logs` tab) | `admin` only | Direct deep-link into the Activity Log tab of the Admin Command Center |
| `/projector` | `ProjectorPage` | `admin` and `projector` | Synchronized auditorium display showing idle screen, live auction stage, secured animation, unsold state, teams/purses, and player spotlight |
| `*` (any other path) | Redirect | Everyone | Catch-all redirect back to `/` |

---

## 5. Roles and Access

Fieldr uses three authenticated user roles (`admin`, `projector`, `owner`) plus unauthenticated public visitors.

### Role Permissions Matrix

| Capability | Signed-Out Visitor | Owner (`owner`) | Projector (`projector`) | Admin (`admin`) |
|---|---|---|---|---|
| View public site (Home, Rosters, Teams, Profiles, Help, About, Rules) | Yes | Yes | Yes | Yes |
| Unlock `/handbook` with valid access code | Yes | Yes | Yes | Yes |
| View confidential Owner Panel on their own team page | No | Yes (own team only) | No | No |
| Open `/projector` auditorium screen | No | No | Yes | Yes |
| Open `/admin` and `/admin/logs` | No | No | No | Yes |
| Modify seasons, athletes, teams, purses, auction, setup, accounts | No | No | No | Yes |

### Sign-In Flows
- **Staff sign-in (`/login`):** Uses email and password through Supabase Auth (`signInWithPassword`), then looks up the user's `role` in the `profiles` table. Admins are sent to `/admin`; non-admins are sent to `/projector` (where `RouteGuard` redirects `owner` accounts to `/teams` if an owner accidentally signs in on `/login`).
- **Owner sign-in (`/owner-login`):** Owners enter a short Login ID and password. The page lowercases and trims the Login ID, appends the internal owner login email domain suffix, signs in through Supabase Auth, and explicitly verifies that the user's `profiles` row has `role === 'owner'`. If not, the session is signed out immediately with an error message. Valid owners are redirected to `/teams`.

### How Roles Are Checked
- **Frontend guards (`RouteGuard.tsx`):** Wraps `/admin`, `/admin/logs`, and `/projector`. While auth loads, it renders a matching skeleton screen. Unauthenticated users are redirected to `/login`. Authenticated users whose role is not in `allowedRoles` are redirected (`owner` -> `/teams`, `projector` -> `/projector`, otherwise `/login`).
- **Session listener (`AuthContext.tsx`):** Subscribes to `supabase.auth.onAuthStateChange`. When the user ID has not changed (for example, on token refresh or browser tab focus), it skips re-fetching the profile to avoid unnecessary reloads.
- **Database enforcement:** Sensitive reads and writes are enforced server-side via Supabase Row-Level Security (RLS) and RPC permission checks.

### What Happens When a Profile Cannot Be Read
- On **staff sign-in and session load** (`src/lib/data/auth.ts`), if the query to `profiles` fails or returns no role, the client falls back to assigning the role `'projector'` in memory (`(profile?.role as UserRole) || 'projector'`). It does not grant `'admin'`, and backend RLS still controls actual database permissions.
- On **owner sign-in** (`src/pages/public/OwnerLoginPage.tsx`), if the `profiles` query fails or the role is not `'owner'`, the user is immediately signed out and shown `"This login is not an owner account."`

---

## 6. Data Layer

### How Data Is Fetched and Saved
Most database access lives in modular service files under `src/lib/data/`, each exposing clean async functions and switching automatically between a Supabase implementation and an offline Demo implementation:
- `client.ts`: Initializes the Supabase client, detects demo mode, holds `localStorage` helpers, realtime suppression timestamps (to ignore echoed events right after a local write), and code formatting helpers.
- `auth.ts`: Sign-in, sign-out, session lookup.
- `seasons.ts`: Season CRUD, active season switching, deletion counts preview, rename/delete RPCs.
- `athletes.ts`: Universal athlete search, 15-per-page server pagination, profile/career lookup, photo cleanup, and realtime subscription.
- `players.ts`: Seasonal registrations, bulk registration, public roster views, paginated public rosters, manual team assign/unassign RPCs, and realtime subscription.
- `teams.ts`: Franchise team CRUD, public team view, sports and roles management, `manage-owner` Edge Function wrapper, and realtime subscription.
- `purses.ts`: Purse adjustment RPC (`execute_purse_transaction`), transaction history, and season-wide purse reset RPC.
- `auction.ts`: Auction settings, live bids, recent sales, queue RPCs, stage/bidding/secure/unsold/undo RPCs, and live admin realtime subscription.
- `projector.ts`: Projector state read/write, broadcast announcement RPC, confetti trigger RPC, and realtime subscription.
- `logs.ts`: Paginated unified activity log RPC (`admin_activity_log`).
- `site.ts`: Site settings (`site_settings`), homepage ticker items (`carousel_items`), and persistent `localStorage` caching for Home and Ticker.
- `credits.ts`: Credits people CRUD and image upload to the `credits` bucket.
- `rules.ts`: Auction Rules PDF upload, listing, and deletion in the `rules` bucket.
- `storage.ts`: Image compression and upload/deletion for athlete photos, team logos, and owner photos in `fieldr-assets`.

A few components call `supabase` directly outside `src/lib/data/`: `AuthContext.tsx` (auth state listener), `AdminAccounts.tsx` (account and session RPCs plus `signOut({ scope: 'others' })`), `HandbookSetupCard.tsx` and `HandbookPage.tsx` (handbook settings, uploads, and `handbook_list` RPC), `OwnerLoginPage.tsx` (owner login and profile check), and `SeasonTeamDetailPage.tsx` (`owner_team_overview` RPC).

### Caching Layers
1. **Public in-memory cache (`src/lib/publicCache.ts`):** Holds active season, sports, ticker text, teams/players per season, roster filter queries, page content, credits, rules, team detail entries, and athlete profiles so switching between public pages paints immediately while refreshing quietly in the background.
2. **TTL query cache (`src/lib/queryCache.ts`):** Tracks freshness (60 seconds fresh TTL, 30 seconds revalidation threshold) for public page fetches and the admin data bundle (`admin:bundle`), and deduplicates route/tab JS module prefetching.
3. **Home & Ticker `localStorage` cache (`src/lib/data/site.ts`):** Stores `fieldr_public_home_v1` (5-minute freshness window) and `fieldr_public_ticker_v1` so returning visitors see the Home page stats and marquee ticker immediately without waiting for network responses.

### Realtime Channels
All Supabase Realtime channels use `postgres_changes` with a short debounce (`250 ms` on admin/live channels, suppressed briefly after local writes to avoid duplicate reloads).

| Channel Name | Defined In | Tables & Filters Watched | Listeners |
|---|---|---|---|
| `projector_state_<seasonId>` | `src/lib/data/projector.ts` | `projector_state` (filtered by `season_id`) | `ProjectorPage`, `AdminPage` |
| `auction_settings_<seasonId>` | `src/lib/data/auction.ts` | `auction_settings` (filtered by `season_id`) | `ProjectorPage` |
| `teams_<seasonId>` | `src/lib/data/teams.ts` | `teams` (filtered by `season_id`) | `ProjectorPage`, `AdminPage` |
| `players_<seasonId>` | `src/lib/data/players.ts` | `players` (filtered by `season_id`) | `ProjectorPage`, `AdminPage` |
| `admin_auction_live_<seasonId>` | `src/lib/data/auction.ts` | `projector_state`, `players`, `teams`, `auction_settings`, `auction_queue` (all filtered by `season_id`), plus `auction_bids` and `auction_sales` | `AdminAuction` |
| `admin_athletes_realtime` | `src/lib/data/athletes.ts` | `athletes` and `players` (all rows) | `AdminAthletes` |

---

## 7. Database in Words and Tables Only

Fieldr uses Supabase (PostgreSQL). The repository's `supabase/` folder contains older baseline migration files (`schema.sql`, `migration_v2.sql`, `migration_v3.sql`, `migration_v4_sports_roles.sql`, `patch_security_realtime.sql`), while several newer tables, views, functions, and policies were added directly in the live Supabase dashboard. Columns and behaviors below are documented from what is verified in code; server-side constraints or definitions missing from the repo are marked **Not found in code**.

### Tables

| Table | Purpose | Verified Columns Used in Code | Repo Schema Notes |
|---|---|---|---|
| `profiles` | Maps Supabase Auth users to application roles | `id`, `role` (`admin`, `projector`, `owner`), `created_at` | Defined in repo baseline; `owner` role constraint update in live DB is Not found in code |
| `seasons` | Stores tournament seasons and marks which one is active | `id`, `name`, `is_active`, `start_date`, `end_date`, `description`, `created_at` | Defined in repo baseline |
| `sports` | Lists supported sports and their ordered playing role lists | `id`, `name`, `roles` (text array), `created_at` | Defined in `migration_v4_sports_roles.sql` |
| `athletes` | Universal athlete directory preserved across seasons | `id`, `athlete_code` (permanent numeric ID), `name`, `roll_no`, `academic_year`, `photo_url`, `photo_thumb_url`, `notes`, `created_at` | Defined in `migration_v3.sql` |
| `players` | Seasonal registration linking an athlete to a sport, role, base value, and team | `id`, `season_id`, `athlete_id`, `player_code`, `name`, `academic_year`, `sport`, `playing_role`, `base_points`, `status` (`available`, `sold`, `unsold`), `team_id`, `purchase_price`, `photo_url`, `photo_thumb_url`, `created_at` | Defined in repo baseline + `migration_v3.sql` |
| `teams` | Franchise teams registered for a season, including purse balances | `id`, `season_id`, `name`, `short_code`, `sport`, `color`, `logo_url`, `starting_purse`, `current_purse`, `owner_display_name`, `owner_photo_url`, `created_at` | Defined in repo baseline; exact live column for owner auth user linkage is Not found in code |
| `purse_transactions` | Ledger of every points credit, deduction, purchase, refund, reset, or manual set | `id`, `season_id`, `team_id`, `player_id`, `type` (`initial`, `add`, `deduct`, `set`, `purchase`, `refund`), `amount`, `balance_after`, `note`, `created_at` | Defined in repo baseline |
| `projector_state` | Single live state row per season driving the auditorium screen | `season_id`, `mode`, `player_id`, `team_id`, `current_bid`, `leading_team_id` / `team_id`, `auto_sport`, `auto_filter`, `auto_interval_seconds`, `auto_started_at`, `broadcast_message`, `confetti_at`, `sale_event_id`, `sale_player_id`, `sale_team_id`, `sale_price`, `sale_at`, `updated_at` | Base columns in repo; auction/sale/broadcast/confetti columns added in live DB (exact DDL Not found in code) |
| `carousel_items` | Messages shown on the Home page dot-matrix ticker strip | `id`, `season_id`, `text`, `is_active`, `display_order`, `created_at` | Defined in repo baseline |
| `site_settings` | Key-value JSON settings for pages, ticker speed, and confetti speed | `key`, `value`, `updated_at` | Defined in repo baseline |
| `auction_settings` | Per-season rules and animation timings for bidding and Secured reveal | `season_id`, `bid_increments`, `max_squad_size`, `secured_enabled`, `secured_duration_seconds`, `price_countup_seconds`, `bid_update_ms`, `catchup_window_seconds` | Live-only table; exact server-side schema constraints Not found in code |
| `auction_queue` | Ordered queue of players waiting to come to the live auction stage | `id`, `season_id`, `sport`, `player_id`, `position`, `created_at` | Live-only table; exact server-side schema constraints Not found in code |
| `auction_bids` | Individual bid events placed during live bidding on a player | `id`, `season_id`, `player_id`, `team_id`, `amount`, `created_at` | Live-only table; exact server-side schema constraints Not found in code |
| `auction_sales` | Completed auction sales records (including reversed/undone flag if tracked) | `id`, `season_id`, `player_id`, `team_id`, `price`, `undone_at` / reversal tracking, `created_at` | Live-only table; exact server-side schema constraints Not found in code |
| `credits_people` | People displayed in the About page Credits section | `id`, `name`, `role`, `description`, `photo_url`, `kind` (`core` or `contributor`), `display_order`, `created_at` | Live-only table; exact server-side schema constraints Not found in code |
| `handbook_settings` | Single-row (`id = 1`) configuration holding the Handbook access code | `id`, `access_code`, `updated_at` | Live-only table; exact server-side schema constraints Not found in code |
| `handbooks` | Metadata for uploaded Handbook PDFs | `id`, `title`, `file_path`, `created_at` | Live-only table; exact server-side schema constraints Not found in code |
| `rules_documents` | Metadata for uploaded Auction Rules PDFs | `id`, `title`, `file_path`, `created_at` | Live-only table; exact server-side schema constraints Not found in code |

### Views

| View | Purpose | Verified Columns Used in Code | Notes |
|---|---|---|---|
| `public_players` | Safe public projection of seasonal players (hides private roll numbers and internal notes) | `id`, `player_code`, `athlete_code`, `name`, `photo_thumb_url`, `photo_url`, `academic_year`, `sport`, `playing_role`, `season_id`, `athlete_id`, `status`, `team_id`, `base_points` | Defined in `patch_security_realtime.sql` (live updates to columns Not found in code) |
| `public_teams` | Safe public projection of franchise teams (hides private purse balances) | `id`, `season_id`, `name`, `short_code`, `sport`, `color`, `logo_url`, `owner_display_name`, `owner_photo_url` | Defined in `patch_security_realtime.sql` |
| `public_squads` | Public view joining drafted players with their franchise team details | `player_id`, `season_id`, `sport`, `player_code`, `name`, `photo_thumb_url`, `photo_url`, `academic_year`, `playing_role`, `purchase_price`, `team_id`, `team_name`, `team_short_code`, `team_color`, `team_logo_url` | Live-only view; server-side view definition Not found in code |

### Database Functions (RPCs)

Server-side implementations and exact access grants for RPCs marked "Live-only" are **Not found in code**; their purposes below are verified from how the frontend invokes them.

| RPC Name | What It Does | Who May Call It (Verified / Expected) |
|---|---|---|
| `execute_purse_transaction` | Atomically adds, deducts, or sets a team's purse and inserts a ledger entry | Admin (verified in repo `schema.sql`) |
| `assign_player_to_team` | Assigns a player to a team, marks sold, optionally deducts purse and logs purchase | Admin (verified in repo `schema.sql`) |
| `unassign_player_from_team` | Releases a player back to available pool and optionally refunds purchase price | Admin (verified in repo `schema.sql`) |
| `reset_all_purses` | Resets starting and current purse for all teams in a season and logs initial rows | Admin (live-only definition Not found in code) |
| `queue_add_player` | Appends a single player to the sport's auction queue | Admin (live-only definition Not found in code) |
| `queue_add_by_codes` | Adds multiple players by 4-digit codes and returns added/not-found/already-queued/not-available breakdown | Admin (live-only definition Not found in code) |
| `queue_remove` | Removes one entry from the auction queue | Admin (live-only definition Not found in code) |
| `queue_clear` | Clears all queued players for a sport in the season | Admin (live-only definition Not found in code) |
| `queue_move` | Moves a queue item up or down | Admin (live-only definition Not found in code) |
| `auction_bring_to_stage` | Places a player onto the live auction stage and updates `projector_state` to `auction` | Admin (live-only definition Not found in code) |
| `auction_place_bid` | Records a new leading team and bid amount on stage, enforcing purse/squad rules and writing to `auction_bids` | Admin (live-only definition Not found in code) |
| `auction_clear_bid` | Clears the current bid and leading team for the staged player | Admin (live-only definition Not found in code) |
| `auction_secure` | Finalizes a sale: deducts team purse, marks player sold, records `auction_sales` and `purse_transactions`, switches projector to `sold` with `sale_event_id` | Admin (live-only definition Not found in code) |
| `auction_mark_unsold` | Marks staged player unsold, clears bids, and switches projector to `unsold` | Admin (live-only definition Not found in code) |
| `auction_undo_last_sale` | Reverses the most recent sale in the season, refunds team purse, and restores player status | Admin (live-only definition Not found in code) |
| `set_broadcast_message` | Sets or clears the idle-screen announcement text on `projector_state` | Admin (live-only definition Not found in code) |
| `trigger_confetti` | Stamps `confetti_at` on `projector_state` to fire confetti on connected projectors | Admin (live-only definition Not found in code) |
| `rename_season` | Renames a season (1 to 60 characters) | Admin (live-only definition Not found in code) |
| `delete_season` | Deletes a non-active season and cascades its teams, players, transactions, and carousel items while preserving `athletes` | Admin (live-only definition Not found in code) |
| `rename_sport_role` | Renames a playing role in `sports` and updates existing player entries, returning count updated | Admin (live-only definition Not found in code) |
| `admin_activity_log` | Returns paginated unified activity rows (bids, sales, reversals, purse adjustments) for a season | Admin (live-only definition Not found in code) |
| `admin_list_accounts` | Lists registered user accounts and roles for the Admin Accounts screen | Admin (live-only definition Not found in code) |
| `admin_list_admin_sessions` | Lists active admin sessions (including session IDs used to mark "This device") | Admin (live-only definition Not found in code) |
| `admin_delete_account` | Deletes a non-self user account | Admin (live-only definition Not found in code) |
| `owner_team_overview` | Returns the signed-in owner's linked team, remaining purse, total spent, and purchased players | Authenticated Owner (live-only definition Not found in code) |
| `handbook_list` | Validates the submitted access code (`p_code`) and returns matching handbook PDF records if valid | Public / Anyone (live-only definition Not found in code) |
| `keepalive` | Lightweight database ping invoked by GitHub Actions every 2 days | Public anon key (live-only definition Not found in code) |

### Storage Buckets

| Bucket Name | Stored Files | Used By | Server-Side Bucket Policies |
|---|---|---|---|
| `fieldr-assets` | Athlete full photos, athlete thumbnails, team logos, and owner photos | `src/lib/data/storage.ts`, `AdminAthletes`, `AdminTeams` | Exact live storage policies Not found in code (public URLs are generated via `getPublicUrl`) |
| `credits` | Portrait photos for Credits people (JPG/PNG/WebP up to 5 MB) | `src/lib/data/credits.ts`, `CreditsSetupCard`, `CreditsSection` | Exact live storage policies Not found in code |
| `handbooks` | Uploaded Handbook PDFs (up to 20 MB) | `HandbookSetupCard`, `HandbookPage` | Exact live storage policies Not found in code (public URLs used after code gate) |
| `rules` | Uploaded Auction Rules PDFs (up to 20 MB) | `src/lib/data/rules.ts`, `RulesSetupCard`, `RulesPage` | Exact live storage policies Not found in code |

### Security Rules in Plain Words
From `supabase/patch_security_realtime.sql` and frontend usage:
- **Public visitors** can read public views (`public_players`, `public_teams`, `public_squads`), active seasons, sports, ticker items, site settings, credits, and rules documents. They cannot read raw private purse balances, roll numbers, admin logs, or raw `handbook_settings` access codes.
- **Handbook access** is gated behind the `handbook_list` RPC so the access code is checked on the server rather than downloaded to the browser.
- **Owners** can view their own franchise's confidential finances only through `owner_team_overview`, which scopes results to the logged-in user on the server.
- **Projector accounts** can read live season state (`projector_state`, `teams`, `players`, `auction_settings`) to render the auditorium display, but cannot modify auction or admin data.
- **Admins** hold full read/write permissions across operational tables and administrative RPCs.
- Exact live RLS policies for tables added after `patch_security_realtime.sql` are **Not found in code**.

---

## 8. Supabase Edge Functions

Fieldr invokes **one** Supabase Edge Function from the frontend: **`manage-owner`** (called in `src/lib/data/teams.ts` via `supabase.functions.invoke('manage-owner', ...)`).

> **Important:** The source code of `manage-owner` (and any other deployed Edge Functions, if any exist) lives only in Supabase and is **Not found in code** in this repository.

### `manage-owner` Client Contract (Verified from Frontend)
Called exclusively by admins from the Teams page Owner Login modal.

| Action | Inputs Sent | Output Consumed by Frontend | Purpose |
|---|---|---|---|
| `status` | `action: 'status'`, `team_id` | `{ has_owner: boolean, login_id?: string }` | Checks whether a franchise already has an owner account and displays its Login ID |
| `set` | `action: 'set'`, `team_id`, `login_id`, `password` | `{ ok, login_id }` or `{ error }` | Creates a new owner account for the team or resets the existing owner's Login ID and password |
| `remove` | `action: 'remove'`, `team_id` | `{ ok }` or `{ error }` | Removes the owner login associated with that team |

Frontend validation before calling `set`:
- **Login ID:** 3 to 30 characters, lowercase letters, digits, dots, underscores, or hyphens (`a-z`, `0-9`, `.`, `_`, `-`).
- **Password:** Minimum 8 characters. Never shown again after saving.

---

## 9. Admin Features, Page by Page

The Admin Command Center (`/admin`) uses a frosted collapsible desktop sidebar (`264px` expanded, `72px` collapsed, persisted in `localStorage`) and a sticky top bar + horizontal tab strip + slide-in drawer on mobile. Across all admin tabs, a floating **Confetti** button in the top-right triggers confetti on connected projectors with a 4-second cooldown bar. The sidebar also provides a **Season Switcher**, **Appearance** toggle (System / Light / Dark), **Sign Out**, and **Launch Projector** (opens `/projector` in a new tab).

### 1. Dashboard (`AdminDashboard.tsx`)
- Displays the active season title and a quick **Switch Projector Scene** button.
- Four summary stat cards: Registered Teams, Player Pool (with drafted vs available breakdown), Total Active Purse, and Purse Transactions count.
- Quick Action shortcuts: Register New Player, Create New Franchise Team, Reset Starting Purses, and Broadcast Player Spotlight.
- Recent Purse Activity table displaying the latest 6 transactions.

### 2. Auction Room (`AdminAuction.tsx`)
- Sport tabs (Cricket, Futsal, Volleyball) showing combined available + unsold player counts; auto-switches when a player is staged.
- **Left stage column:** Live status indicator (`IDLE`, `LIVE`, `SOLD`, `UNSOLD`), staged player card (code, photo, role, base points, academic year), live bid price readout, quick increment buttons (from `auction_settings.bid_increments`), franchise team bidding tiles (showing remaining purse and squad count, automatically disabled if purse is too low or squad is full), and stage actions (**Secure**, **Mark unsold**, **Clear bid**, **Back to idle**).
- **Below stage:** Live **Bid History** for the staged player (newest first with `TOP` badge) and **Recent Sales** (last 10 sales, with **Undo last sale** confirmation button on the newest sale).
- **Right sticky rail:** Switchable between **Queue** (search-and-add single player, bulk add by comma-separated 4-digit codes with detailed summary, reorder up/down, remove, clear, and bring to stage) and **Sold** (searchable list of drafted players with winning team and price).

### 3. Projector Command Studio (`AdminProjectorControl.tsx`)
- Shows an **Auction Stage Guard** warning banner and confirmation prompt whenever an operator attempts to switch scenes while a player is live in `auction`, `sold`, or `unsold` mode.
- **Idle Screen module:** Switches projector to `idle` and controls the **Broadcast Announcement** banner (max 200 characters, Announce or Clear).
- **Teams & Purses module:** Picks sport, toggles **Auto slideshow** (`roster_auto`) vs **Single team** (`roster`), selects transition style (`fade`, `slide`, `zoom` saved in `localStorage`), sets interval (3–120 seconds, default 8s, with quick chips 5/8/10/15s), or selects a specific team; includes a Stop button returning to idle.
- **Player Spotlight module:** Picks sport, toggles **Auto slideshow** (`player_auto`) vs **Single player** (`player`), selects transition style (`fade`, `slide`, `zoom`), looks up a single player by numeric code (up to 6 digits, 300 ms debounced search), or filters auto slideshow by status (`All`, `Available`, `Sold`, `Unsold`) with interval controls and Stop button.

### 4. Athletes (`AdminAthletes.tsx` + `AdminPlayers.tsx` + `BulkRegisterPanel.tsx`)
The Athletes navigation tab renders two stacked panels on one screen:
- **Universal Athletes Directory:** 15-per-page server pagination, 300 ms debounced search by name, 4-digit code, or roll number, realtime updates, create/edit athlete modal (auto-assigned code, photo upload generating full image + 400px thumbnail, notes), career history viewer, and delete protection (blocks deleting an athlete who has seasonal sport entries).
- **Seasonal Registered Players:** 15-per-page pagination filtered by Sport, Role, Status, and Search. Includes a single-athlete registration drawer (default base points: `100` PTS), a **Bulk Register** drawer (filter by academic year chips, Select All, per-athlete role overrides), a manual Assign/Unassign franchise modal (with optional price and purse refund toggle), and formula-safe CSV export.

### 5. Teams (`AdminTeams.tsx` + `AdminPurses.tsx`)
The Teams navigation tab renders two stacked panels:
- **Franchise Teams:** Grouped by sport. Create/edit team (name, 1–3 character uppercase short code, sport, hex color, starting purse default `1000` PTS, owner display name, owner photo resized to 600px, team logo resized to 400px, with automatic cleanup of replaced images). Supports CSV bulk team import with validation preview and downloadable sample template. Includes the **Owner Login** modal (key icon) to create, reset, or remove each team's owner credentials via `manage-owner`.
- **Purses & Balances:** Lists every team's starting purse, current purse, and spend. Per-team actions: **Add**, **Deduct**, **Set** (with optional note), and **History** modal. Top-level **Reset All Purses** button resets all teams in the active season to a chosen uniform amount (default `1000` PTS).

### 6. Seasons (`AdminSeasons.tsx`)
- Lists all seasons with active badge and date range.
- **Create Season:** Name, optional start/end dates (validates end date is on or after start date), and description.
- **Set as Active:** Deactivates the previous season and activates the selected season, invalidating public caches.
- **Rename Season:** 1 to 60 characters via `rename_season`.
- **Delete Season:** Disabled for the active season or if only one season exists. Shows a cascade preview count (teams, player entries, purse transactions, carousel items), requires typing the exact season name to confirm, preserves all universal `athletes`, and calls `delete_season`.

### 7. Logs (`AdminLogs.tsx` — also at `/admin/logs`)
- Unified audit trail powered by `admin_activity_log` RPC, fetched in 1,000-row pages (`Load more`).
- Filter pills: `All`, `Bids`, `Sales`, `Reversals`, `Purse`.
- Additional filters by Team dropdown and Player name search, plus Refresh and CSV export (`fieldr-activity-log-<season>-<date>.csv`).

### 8. Accounts (`AdminAccounts.tsx`)
- **Registered Accounts card:** Lists accounts and roles via `admin_list_accounts`, with a delete button (`admin_delete_account`) and confirmation dialog.
- **Admin Sessions card:** Lists active admin sessions via `admin_list_admin_sessions`. Decodes the current Supabase access token's `session_id` claim to sort the current device first and badge it with a sage **"This device"** pill. Includes a **"Sign out other sessions"** button (enabled when more than one session is active) that opens a frosted confirmation dialog and calls `supabase.auth.signOut({ scope: 'others' })`.

### 9. System Setup (`AdminSetup.tsx`)
Organized into four tabs:

#### Tab 1: Display
- **Homepage Ticker Strip:** Add, edit (max 80 characters), reorder up/down, toggle Active/Inactive (at least one active item required), or delete `carousel_items`.
- **Ticker speed** (`site_settings.ticker_speed`): Range `1` to `10` (step `1`, unit: speed scale), default `5`, with live marquee preview.
- **Auction Display and Rules** (stored per season in `auction_settings`, with live "Preview secured animation" overlay and "Reset to defaults"):

| Setting | Database Field | Range / Allowed Values | Unit | Default |
|---|---|---|---|---|
| Secured animation | `secured_enabled` | On / Off (`true` / `false`) | Boolean | `On` (`true`) |
| Secured sequence length | `secured_duration_seconds` | `2` to `15` (step `0.1`) | Seconds | `5.6` s |
| Price count-up | `price_countup_seconds` | `0.3` to `6` (step `0.1`, must be <= sequence length) | Seconds | `1.8` s |
| Bid update animation | `bid_update_ms` | `100` to `2000` (step `50`) | Milliseconds | `600` ms |
| Catch-up window after refresh | `catchup_window_seconds` | `0` to `120` (step `1`) | Seconds | `15` s |
| Bid increments | `bid_increments` | Positive numbers, at least 1 value | Points (PTS) | `[5, 10, 25]` |
| Maximum squad size | `max_squad_size` | `null` ("No limit") or integer >= `1` | Players | `null` (No limit) |

- **Confetti Fall Speed** (`site_settings.confetti_fall_speed`): Range `1` to `10` (step `1`, unit: speed scale), default `5`, with a "Test on projector" button (4-second cooldown).

#### Tab 2: Content
- **Public Pages Editor:** Edits `help_page` and `about_page` in `site_settings` (page title, Markdown body, and live formatted preview).
- **Credits (`CreditsSetupCard.tsx`):** Manages `credits_people` in two sections: **Main people** (`kind: 'core'`, maximum 5, optional description up to 400 characters) and **Contributors** (`kind: 'contributor'`, unlimited, no description). Name max 80 characters (required), Role max 80 characters (optional), photo JPG/PNG/WebP max 5 MB, reorder up/down, delete with confirmation.

#### Tab 3: Documents
- **Handbook (`HandbookSetupCard.tsx`):** Sets or generates (`FLDR-XXXX-XXXX`) the access code stored in `handbook_settings`. Leaving the code empty locks `/handbook` for everyone. Uploads PDFs up to 20 MB to `handbooks`, with Open and Delete actions.
- **Auction Rules (`RulesSetupCard.tsx`):** Uploads PDFs up to 20 MB to `rules` / `rules_documents`, with Open and Delete actions.

#### Tab 4: Sports
- **Sports and Roles:** Select a sport, add a new role, rename an existing role (calls `rename_sport_role` to update matching players and reports how many records changed), reorder roles up/down, or delete a role (blocked if any players currently use that role).

---

## 10. Auction Flow in Detail

1. **Queue management:** Operators select a sport in the Auction Room and add players individually (`queue_add_player`) or in bulk via comma-separated 4-digit codes (`queue_add_by_codes`). Queue order can be shifted up/down (`queue_move`), pruned (`queue_remove`), or emptied (`queue_clear`).
2. **Bringing a player to stage:** Clicking a queued player or "Bring to stage" calls `auction_bring_to_stage`, setting `projector_state.mode` to `'auction'` with `player_id` set and bids reset.
3. **Price calculation and bidding:**
   - When no team is leading yet, the suggested opening bid equals the player's `base_points`.
   - Once a team leads, the suggested next bid equals `current_bid + smallest increment` from `auction_settings.bid_increments`.
   - Operators can pick quick increment pills or enter a custom amount, then click a franchise team tile to call `auction_place_bid`.
   - Team tiles display each team's live remaining purse and squad count (`count / maxSquad`) and disable automatically if the team cannot afford the bid or has reached `max_squad_size`.
   - Each accepted bid writes a row to `auction_bids` and updates `projector_state` (`team_id`, `current_bid`), flashing the projector in that team's color.
   - Operators can also clear a mistaken bid via `auction_clear_bid` or return the stage to idle without selling via `auctionBackToIdle`.
4. **Securing a sale and purse deduction:**
   - Clicking **Secure** opens a confirmation dialog showing player, winning team, and final price.
   - Confirming calls `auction_secure`, which atomically deducts the winning price from the team's `current_purse`, updates the player to `status = 'sold'`, `team_id`, and `purchase_price`, inserts a `purchase` row in `purse_transactions`, inserts a row in `auction_sales`, removes the player from the queue, and sets `projector_state.mode = 'sold'` along with `sale_event_id`, `sale_player_id`, `sale_team_id`, `sale_price`, and `sale_at`.
5. **Marking unsold:** Clicking **Mark unsold** and confirming calls `auction_mark_unsold`, setting `status = 'unsold'`, clearing any leading bid, and switching `projector_state.mode` to `'unsold'`.
6. **Undo last sale & manual unassign/refund:**
   - **Undo last sale** in Recent Sales calls `auction_undo_last_sale`, refunding the winning team's purse, recording a reversal/refund, and returning the player to the pool.
   - **Manual unassign** on the Players panel calls `unassign_player_from_team` with an optional refund checkbox, refunding the purchase price (`type = 'refund'`) when checked and setting the player back to `available`.
7. **Logs written:** Every bid (`auction_bids`), completed sale (`auction_sales`), reversal, and purse credit/deduction/set/purchase/refund (`purse_transactions`) appears unified in `/admin/logs` via `admin_activity_log`.

---

## 11. Projector

The auditorium display runs at `/projector` (`src/pages/public/ProjectorPage.tsx`). It supports an independent dark/light theme toggle (`fieldr-projector-theme` in `localStorage`) and a fullscreen button in the top-right corner; these controls stay hidden during projection and fade in for 3 seconds on mouse, touch, or keyboard activity.

### Projector Scenes

| Mode (`projector_state.mode`) | Controlled From | What It Displays |
|---|---|---|
| `idle` | Projector Command Studio / Auction "Back to idle" | Large centered season title and small Fieldr brand mark at the bottom; when a broadcast announcement is active, the title fades up and a full-width dot-matrix banner animates open across the center |
| `auction` | Auction Room ("Bring to stage" / bids) | Two-column live bidding stage: large player portrait, `#code`, sport, role, academic year, and base points on the left; huge animated bid number, leading franchise crest/name, and team-color flash pulse on every bid on the right |
| `sold` | Auction Room ("Secure") | Plays the fullscreen `SecuredSequence` reveal (when `secured_enabled` is on), then settles into a calm static SOLD card showing player portrait, winning franchise, and final winning bid |
| `unsold` | Auction Room ("Mark unsold") | Muted card with desaturated portrait, `UNSOLD` badge, player details, academic year, and base points |
| `roster` | Projector Command Studio (Teams & Purses — Single team) | Selected franchise crest, color accent, purse balance, and drafted squad list |
| `roster_auto` | Projector Command Studio (Teams & Purses — Auto slideshow) | Cycles automatically through teams of the selected sport using the configured interval and `fade` / `slide` / `zoom` transition |
| `teams` | Legacy / fallback team overview | Handled together with the Teams & Purses scene (`isTeamsAndPursesMode`) |
| `player` | Projector Command Studio (Player Spotlight — Single player) | Large spotlight portrait and bio card for one chosen player |
| `player_auto` | Projector Command Studio (Player Spotlight — Auto slideshow) | Cycles automatically through players matching the chosen sport and status filter (`all`, `available`, `sold`, `unsold`) using the configured interval and `fade` / `slide` / `zoom` transition |

### Broadcast Messages
Admins enter up to 200 characters in the Projector Command Studio's Idle Screen panel (`set_broadcast_message`). When `mode === 'idle'` and a message is set, a full-width strip reveals smoothly (`clipPath` inset reveal, or simple opacity fade under reduced motion) displaying uppercase `DotGothic16` text. Clearing the message closes the strip and restores the season title.

### Confetti (`ProjectorConfetti.tsx`)
Clicking **Confetti** in the admin header (or "Test on projector" in Setup) updates `projector_state.confetti_at` via `trigger_confetti`. The projector ignores the initial `confetti_at` value on page load so refreshing never causes surprise confetti; whenever `confetti_at` changes afterward, it fetches `confetti_fall_speed` (1–10, default 5, 3-second fallback timeout) and launches an HTML5 canvas confetti burst. Under reduced motion, animation intensity is toned down or simplified.

### Slideshows and Transitions
Auto slideshows (`roster_auto` and `player_auto`) use `useAutoSlideshow` anchored to `projector_state.auto_started_at` and `auto_interval_seconds` (3–120 seconds, default 8s), so multiple projector screens stay on the exact same slide at the same second. Transition styles (`fade`, `slide`, `zoom`) are stored in `localStorage` (`fieldr_projector_team_animation`, `fieldr_projector_player_animation`) and synced across tabs via `storage` events.

### Secured Animation and Timings (`SecuredSequence.tsx`)
- Tracks `projector_state.sale_event_id` so each sale animates only once.
- Plays for `secured_duration_seconds` (range 2–15s, default `5.6` s), counting up the final winning price over `price_countup_seconds` (range 0.3–6s, default `1.8` s), then transitions cleanly to the static SOLD card.
- **Refresh catch-up:** If the projector reloads right after a sale, it replays the Secured animation only if `mode === 'sold'`, `secured_enabled` is true, and the time elapsed since `sale_at` is within `catchup_window_seconds` (0–120s, default `15` s, with a 5-second clock-skew grace).

### How the Projector Stays in Sync
- Subscribes to four Supabase Realtime channels (`projector_state`, `auction_settings`, `teams`, `players`) for the active season.
- Re-fetches all season data and checks whether the active season changed whenever the browser tab becomes visible (`visibilitychange`) or internet connectivity returns (`online`), and listens for cross-tab `fieldr_seasons_updated_at` storage events.
- Preloads upcoming player images via an LRU image cache (up to 40 decoded images, 4 concurrent workers, 1-second retry) and waits up to `2000 ms` (`useDecodedPlayerGate`) for a staged player's primary photo to decode before swapping the card to prevent blank flashes.

---

## 12. Public Site

Every public page shares the sticky scroll-aware `HeaderBar` (which fades in a `.frost` backdrop on scroll), the lazy-loaded slide-over `NavigationMenu` (hamburger menu), and `SiteFooter`.

- **Home Page (`/`):**
  - Subtle fixed architectural vector background (`HomeBackdrop.tsx`) with thin geometric ellipses/lines, a faint radial sage glow, and subtle scroll parallax (disabled under reduced motion). Note: any separate photographic floodlight background is **Not found in code**.
  - Hero header (`DRAFT. BID. WIN.`) with active season name, total athletes, and cached teams count, plus quick **Rosters** (smooth scroll) and **Teams** buttons.
  - **Dot-Matrix Ticker Strip (`TickerStrip.tsx`):** Seamless horizontal marquee in `DotGothic16` font driven by active `carousel_items` and `ticker_speed` (1–10, default 5). Pauses on fine-pointer hover, locks duration once running to prevent jumps, and switches to a static centered strip under `prefers-reduced-motion`.
  - **Explore Sport Cards (`SportCardsGrid.tsx`):** Full-color photographic cards for Cricket, Futsal, and Volleyball with subtle bottom readability gradients, index chips (`01`–`03`), and live athlete counts.
- **Official Rosters (`/rosters` and `/rosters/:sport`):**
  - `/rosters` shows the three sport cards with counts.
  - `/rosters/:sport` loads athletes 20 at a time with infinite scroll (`IntersectionObserver`), filtered by **Year** and **Role** pill bars synced to URL query parameters (`?year=...&role=...`).
  - Clicking an athlete card opens **`RosterScoutModal`**: a frosted dialog showing large portrait photo, `#code`, role, base points, academic year, sport, drafted/available pill, and a **"View full profile"** link that passes the originating sport and active filters via URL query parameters.
- **Universal Athlete Profile (`/players/:code`):**
  - Displays the athlete's permanent `#code`, portrait, latest role, and full multi-season **Tournament History** with links to drafted team pages.
  - The Back link reads the origin query params (`from`, `sportName`, `year`, `role`) so returning from a sport roster sends the visitor back to that exact sport squad with their Year and Role filters still applied (falling back to `/rosters` when opened directly).
- **Teams (`/teams`) and Team Detail (`/season/:id/teams/:teamId`):**
  - `/teams` groups active-season franchises by sport with subtle team-color card tinting, owner display name, and squad counts.
  - `/season/:id/teams/:teamId` shows the team crest, short code, owner name, and full drafted squad (hiding financial data from public visitors, while rendering the Owner Panel inline if viewed by that team's authenticated owner).
- **Help (`/help`) and About (`/about`):**
  - Both use `ContentPage.tsx` to render admin-managed Markdown from `site_settings` (`help_page` and `about_page`), showing `"Coming soon"` if blank.
  - `/about` additionally mounts **`CreditsSection`**, displaying up to 5 **Main people** cards (portrait, name, role, optional bio) and an **"Also thanks to"** grid of Contributors.
- **Auction Rules (`/rules`):** Lists uploaded PDFs from `rules_documents` with Open (new tab) and Download buttons.
- **Handbook (`/handbook`):** Shows an access code input gate. Submitting a code calls the `handbook_list` RPC. If valid, the code is remembered in browser `sessionStorage` (`fieldr_handbook_access_code`) for the tab session and the PDF list unlocks with Open, Download, and Lock buttons.

---

## 13. Owner Panel

The Owner Panel is not a separate route; it renders inline at the top of a franchise's team detail page (`/season/:id/teams/:teamId`) when both conditions are met:
1. The viewer is signed in with `user.role === 'owner'`.
2. The server RPC `owner_team_overview` returns a team record whose `team_id` matches the page's `:teamId`.

### What Owners See
- Confidential Franchise Portal header with last-updated timestamp, **Refresh** button, and **Sign out** button.
- **Purse Remaining** (in PTS) and a visual spend progress bar (`spent / (spent + remaining)`).
- **Purse Spent** and **Roster Count**.
- **Players Bought** list showing each drafted player's 4-digit code, photo thumbnail (if uploaded), name, playing role, and purchase price.

### Owner Account Lifecycle
- **Create:** Admin opens Teams tab -> clicks the key icon on a team -> enters a Login ID (3–30 chars) and Password (min 8 chars) -> frontend invokes the `manage-owner` Edge Function with `action: 'set'`.
- **Reset:** Admin opens the same modal, enters a new Login ID and/or password, and saves (`action: 'set'`). Existing passwords are never displayed.
- **Remove:** Admin clicks Remove in the Owner Login modal (`action: 'remove'`), revoking that franchise's owner login.

---

## 14. Design System

### Color Palette (`src/index.css`)

| Token | Light Theme | Dark Theme | Role |
|---|---|---|---|
| `--bg` | `#F4F5F1` | `#0B0B0B` | Page background |
| `--surface` | `#FFFFFF` | `#121412` | Primary cards and panels |
| `--surface-2` | `#ECEEE8` | `#1A1D1A` | Secondary pills, chips, nested frames |
| `--text` | `#121412` | `#F0F2EE` | Primary body and heading text |
| `--text-muted` | `#5A6158` | `#9AA097` | Secondary labels and captions |
| `--border` | `#D5D9D0` | `rgba(240, 242, 238, 0.10)` | Hairlines and card borders |
| `--accent` | `#2F5233` | `#395F3D` | Brand forest/sage green |
| `--accent-bright` | `#047554` | `#047554` | Interactive emerald highlight and focus rings |
| `--points` | `#8A5A00` | `#C88B0F` | Points (PTS) values and purse figures |
| `--error` | `#B91C1C` | `#B91C1C` | Destructive actions and error banners |
| `--btn-bg` / `--btn-fg` | `#121412` / `#FFFFFF` | `#F0F2EE` / `#0B0B0B` | Primary high-contrast button colors |

### Typography (`index.html` & `src/index.css`)
- **UI & Body (`--font-sans`):** `DM Sans` (weights 300–700, body defaults to light 300 with `line-height: 1.55`).
- **Display & Headings (`.font-syne`):** `Syne` (weights 700, 800) for page titles, hero poster lines, player names, and stat figures.
- **Stadium Ticker & Broadcast Banner (`.font-dot`):** `DotGothic16` monospace for the dot-matrix ticker and projector announcements.
- **Numbers:** Tabular numerals (`tabular-nums`) and monospace badges are used for player codes (`#0001`), counts, dates, and point totals.

### Spacing and Corner Radius Rules
- Shared public and admin containers (`publicStyles.ts` and `adminStyles.ts`) enforce rounded, blunt geometry across every element:
  - **Cards & modals:** `rounded-3xl` (`24px`)
  - **Inputs, inner rows, photo frames, secondary surfaces:** `rounded-2xl` (`16px`)
  - **Buttons, tabs, pills, badges, icon buttons:** `rounded-full` (pill) or `rounded-2xl`
- Public pages use three standard width shells (`max-w-7xl` wide, `max-w-5xl` medium, `max-w-3xl` narrow) with generous padding (`px-5 sm:px-8 lg:px-12`).
- Icons use `@phosphor-icons/react` in `regular` weight (with `bold` on select hero/projector controls).

### `.frost` Utilities
Three shared frosted-glass classes live in `src/index.css`:
- `.frost`: 65% `--bg` tint + `14px` backdrop blur + `1.4` saturation.
- `.frost-strong`: 85% `--bg` tint + `18px` backdrop blur + `1.4` saturation (used on drawers, navigation menu, confirmation dialogs).
- `.frost-deep`: 70% `--bg` tint + `28px` backdrop blur + `1.5` saturation (used on `RosterScoutModal`).
- All three automatically fall back to a 92% opaque `--bg` with no blur when `backdrop-filter` is unsupported or when the user enables `prefers-reduced-transparency: reduce`.
- The desktop admin sidebar uses a flat 2.5% brand-green `color-mix` over `--bg` with a `20px` backdrop blur, a subtle 1px green right border, and no glow or drop-shadow.

### Light & Dark Theme
- Managed by `ThemeProvider` (`src/lib/theme.tsx`) with three preferences: `system`, `light`, and `dark` (stored in `localStorage` under `fieldr-theme`).
- An inline script in `index.html` applies `data-theme` and the `.dark` class before React mounts to prevent any white flash on load.
- Switching themes temporarily applies `.no-transitions` so elements change cleanly without color-transition lag.
- `/projector` maintains its own separate theme preference (`fieldr-projector-theme`).

### Motion and Reduced-Motion Handling
- CSS `@media (prefers-reduced-motion: reduce)` disables hero reveal, ticker marquee scrolling, ambient blob drift, and skeleton shimmer.
- Components (`HomePage`, `HomeBackdrop`, `TickerStrip`, `SportCardsGrid`, `ProjectorPage`, `SecuredSequence`, `ProjectorConfetti`) explicitly check `prefers-reduced-motion` via `matchMedia` or Motion's `useReducedMotion()`, replacing slides, zooms, parallax, and confetti physics with calm opacity fades or static layouts.

---

## 15. Demo Mode

Demo mode is an offline fallback that lets Fieldr boot locally without a Supabase backend. It is currently planned for removal once live Supabase is used everywhere.

### How It Activates
In `src/lib/data/client.ts`, `isDemoMode` is `true` whenever either `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing at build/runtime. When active, `client.ts` seeds sample seasons, sports, teams, athletes, players, carousel messages, and settings into `localStorage` (under `STORAGE_KEYS`), and uses the browser's `BroadcastChannel` (`fieldr_demo_sync`) plus `storage` events to sync tabs locally.

### Files Touched by Demo Mode
- **Core & Auth:** `src/lib/data/client.ts`, `src/lib/constants.ts` (`STORAGE_KEYS`), `src/lib/AuthContext.tsx` (`isDemo`, `quickDemoLogin`).
- **All Data Modules (dual `demo*Service` / `supabase*Service` implementations):** `src/lib/data/auth.ts`, `seasons.ts`, `athletes.ts`, `players.ts`, `teams.ts`, `purses.ts`, `auction.ts`, `projector.ts`, `logs.ts`, `site.ts`, `storage.ts`, `credits.ts`, `rules.ts`.
- **UI Pages & Components:** `src/pages/public/LoginPage.tsx` (one-click Admin/Projector demo buttons), `src/pages/admin/AdminTeams.tsx` (disables owner login management in demo mode), `src/components/admin/CreditsSetupCard.tsx`, `src/components/admin/HandbookSetupCard.tsx`, and `src/components/admin/RulesSetupCard.tsx` (read-only/disabled in demo mode).

---

## 16. Settings and Configuration

### Site Settings (`site_settings` table)

| Key | Where Stored | Who Edits It | Default Value |
|---|---|---|---|
| `help_page` | `site_settings` (`value`: `{ title, body }`) | Admin (Setup -> Content) | Built-in fallback title `"Help & Instructions"` / `"Coming soon"` when empty |
| `about_page` | `site_settings` (`value`: `{ title, body }`) | Admin (Setup -> Content) | Built-in fallback title `"About Fieldr"` / `"Coming soon"` when empty |
| `ticker_speed` | `site_settings` (`value`: number `1`–`10`) | Admin (Setup -> Display) | `5` (`DEFAULT_TICKER_SPEED`) |
| `confetti_fall_speed` | `site_settings` (`value`: number `1`–`10`) | Admin (Setup -> Display) | `5` (`DEFAULT_CONFETTI_FALL_SPEED`) |

### Other Configuration Tables and Browser Storage Keys
- **Per-season auction rules:** Stored in `auction_settings` (edited by Admin in Setup -> Display; defaults listed in Section 9).
- **Handbook access code:** Stored in `handbook_settings` (`id = 1`, column `access_code`; edited by Admin in Setup -> Documents; empty locks the page).
- **Browser-local preferences (`localStorage` / `sessionStorage`):**
  - `fieldr-theme` (site light/dark/system preference)
  - `fieldr-projector-theme` (projector dark/light preference)
  - `fieldr_admin_sidebar_collapsed` (desktop admin sidebar collapsed state)
  - `fieldr_projector_team_animation` and `fieldr_projector_player_animation` (`fade` | `slide` | `zoom`)
  - `fieldr_public_home_v1` and `fieldr_public_ticker_v1` (public Home/Ticker cache)
  - `fieldr_seasons_updated_at` (cross-tab season switch signal)
  - `fieldr_handbook_access_code` (`sessionStorage` only; cleared when tab closes or Lock is clicked)

---

## 17. Deployment

### Build & Hosting Setup
- **Platform:** Vercel (indicated by `vercel.json` and `@vercel/analytics`).
- **Build command:** `npm run build` (runs `vite build`, outputting static files to `dist/`).
- **Type check command:** `npm run lint` (runs `tsc --noEmit`).
- **Routing (`vercel.json`):** Contains a single rewrite rule routing all paths `/(.*)` to `/index.html` so direct links to routes like `/rosters/cricket`, `/admin/logs`, or `/projector` work on refresh.
- **Vercel dashboard project settings (branches, domains, preview rules):** **Not found in code**.

### Environment Variable Names (Names Only)
- **Frontend build/runtime (`.env.example`, `src/lib/data/client.ts`):**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY` (public publishable/anon key only — never a `service_role` key)
- **Development tooling (`vite.config.ts`):**
  - `DISABLE_HMR` (disables Vite HMR and file watching when set to `"true"`)
- **GitHub Actions secrets (`.github/workflows/keepalive.yml`):**
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

### GitHub Actions Keepalive Workflow
Defined in `.github/workflows/keepalive.yml` ("Supabase keep-alive"):
- Runs on a cron schedule (`0 6 */2 * *` — every 2 days at 06:00 UTC) and supports manual trigger (`workflow_dispatch`).
- Sends an HTTP POST request to the Supabase REST RPC endpoint `keepalive` using the repository's `SUPABASE_URL` and `SUPABASE_ANON_KEY` secrets to prevent free-tier database pausing.

### Rollback Method
A documented rollback runbook or automated rollback workflow is **Not found in code**. (In standard Vercel hosting, rollbacks are performed from the Vercel Deployments dashboard by promoting a previous deployment, but this is not scripted in the repository.)

---

## 18. Performance and Quality Work Done

### Caching and Instant Paint
- **Three-tier caching:** Public pages hydrate immediately from `publicCache` (memory) and `localStorage` (`fieldr_public_home_v1` / `fieldr_public_ticker_v1`), skipping redundant network calls while within freshness windows (5 minutes on Home, 30–60 seconds on query cache) and avoiding React re-renders via `hasDataChanged`.
- **Parallel loading:** Home page and admin pages fire independent queries concurrently via `Promise.all` / `Promise.allSettled`.

### Code Splitting, Chunking, and Preloading
- **Static Home entry:** `HomePage` is statically imported in `App.tsx` so the landing page renders without a lazy-load skeleton flash.
- **Lazy routes & admin tabs:** Every other route (`TeamsPage`, `RostersPage`, `RosterSportPage`, `PlayerProfilePage`, `SeasonTeamDetailPage`, `ContentPage`, `RulesPage`, `HandbookPage`, `LoginPage`, `OwnerLoginPage`, `AdminPage`, `ProjectorPage`), the Home `NavigationMenu`, and all 11 admin tab components are split via `React.lazy`.
- **Custom Rollup `manualChunks` configuration:** **Not found in code** (`vite.config.ts` uses Vite's default automatic chunking).
- **Prefetching:** Hovering, focusing, or touching navigation links triggers `prefetchRoute(path)`. Inside `/admin`, `scheduleLikelyAdminPrefetch()` warms up common admin tabs 1 second after mount, and hovering sidebar items calls `prefetchAdminTab(tab)`.
- **Projector image preloading:** LRU decoded image cache (40 entries, 4 concurrent workers, 1s retry) preloads upcoming slideshow/stage photos and gates player card swaps for up to 2 seconds so photos never pop in late.
- **Client-side image compression:** Uploads are resized and JPEG-compressed in the browser (`imageCompression.ts`: 400px thumbnails/logos, 600px owner photos) before reaching Supabase Storage.

### Known Audit Findings (`CODE_HEALTH_REPORT.md` — Verified Against Current Code)
Several findings from the earlier audit have already been fixed (removed unused `SportEquipmentSvgs.tsx`, `components/layout/index.ts`, `public/assets/aistudio/`, and `autoprefixer`; unified body scroll locking in `useBodyScrollLock.ts`). Notable items still present in current code:
- **Main entry bundle size:** Because `HomePage`, `motion`, `@supabase/supabase-js`, and `@phosphor-icons/react` are bundled into the initial entry chunk, Vite emits a >500 kB chunk warning during `vite build`.
- **Vite config ESM warning:** `vite.config.ts` uses `__dirname` under native ESM config loading (Vite recommends `import.meta.dirname`).
- **Unused dependency:** `@number-flow/react` is listed in `package.json` but never imported in `src/`.
- **Relaxed TypeScript flags:** `tsconfig.json` does not enable `strict`, `noUnusedLocals`, or `noUnusedParameters`.

---

## 19. Known Issues and Deferred Work

### Explicit `TODO` / `FIXME` / `HACK` Markers
- Explicit `TODO`, `FIXME`, `HACK`, or `XXX` markers in `src/`: **Not found in code** (zero occurrences across `src/`).

### Limitations and Deferred Items Visible in Code
1. **Repo database scripts lag behind live Supabase:** `supabase/*.sql` files do not include live-only tables (`auction_*`, `credits_people`, `handbooks`, `handbook_settings`, `rules_documents`), the `public_squads` view, newer RPCs, or `manage-owner` Edge Function code.
2. **Demo mode maintenance burden:** Roughly a third of `src/lib/data/` maintains parallel offline demo implementations, even though newer features (Handbook, Auction Rules, Credits, Owner Login, Owner Panel) already require live Supabase.
3. **Profile-read fallback on staff login:** `src/lib/data/auth.ts` defaults to `'projector'` in memory if a signed-in user's `profiles` row cannot be read, rather than failing closed.
4. **Owner signing in on `/login`:** `LoginPage.tsx` sends non-admins to `/projector`, relying on `RouteGuard` to bounce `owner` accounts onward to `/teams`.
5. **Minor code cleanups noted in audit:**
   - Unused `@number-flow/react` dependency in `package.json`.
   - Duplicate private `getValidTeamColor` helpers across 4 files and duplicate `format*Date` helpers across 3 files.
   - `seasons.ts` manually removes `'fieldr_public_home_v1'` instead of calling `invalidateCachedPublicHome()`.
   - Unused `font-dm-sans` class on `OwnerLoginPage.tsx` and `SeasonTeamDetailPage.tsx` (DM Sans is already inherited from `body`).
   - Dead `publicCache.seasonCards` and `publicCache.seasonDetails` fields left over after `/season` redirected to `/teams`.
   - Several components (`HandbookSetupCard`, `HandbookPage`, `OwnerLoginPage`, `SeasonTeamDetailPage`, `AdminAccounts`) query `supabase` directly instead of going through `src/lib/data/`.

---

## 20. Glossary

- **Season:** A single tournament edition (for example, an annual championship). Only one season is **Active** at a time; deleting an inactive season removes its teams, player registrations, and purse logs while keeping universal athlete profiles intact.
- **Athlete:** A permanent person record in the universal `athletes` directory. Keeps the same 4-digit code across multiple seasons.
- **Player (Seasonal Entry):** An athlete's registration in a specific season for one sport, playing role, and base point value. One athlete can have entries across multiple seasons or sports.
- **Player Code (Athlete Code):** A permanent 4-digit numeric identifier displayed with a leading hash and zero-padding (for example, `#0042`), used for quick search, bulk queueing, player profile URLs (`/players/42`), and projector spotlight lookup.
- **Base Points:** The starting opening valuation (in PTS) for a player when brought onto the live auction stage (default `100` PTS on registration).
- **Purse:** A franchise team's points budget (`starting_purse` and `current_purse` in PTS) used to bid on and buy players during the auction.
- **Queue:** The ordered waiting list of available or unsold players for a sport inside the Auction Room, ready to be brought onto the stage one by one.
- **Stage:** The active bidding slot in the Auction Room and on the auditorium projector where one player is currently being bid on (`auction`), just sold (`sold`), or passed (`unsold`).
- **Secured:** The finalized state of a winning auction bid. Triggers purse deduction, team assignment, sale logging, and the fullscreen `SecuredSequence` celebration animation on the projector.
- **Unsold:** A player who went through the live stage without being bought; they remain eligible to be re-queued later.
- **Scene:** One of the visual modes shown on the `/projector` auditorium display (`idle`, `auction`, `sold`, `unsold`, `roster`, `roster_auto`, `player`, `player_auto`).
- **Broadcast Announcement:** A short text banner (up to 200 characters) pushed by an admin onto the projector's Idle scene.
- **Owner Panel:** The confidential inline section shown on a team's detail page when viewed by that franchise's signed-in owner, displaying remaining purse, spend progress, and purchased players.
- **Ticker Strip:** The scrolling dot-matrix announcement marquee on the public Home page, fed by active `carousel_items` and controlled by `ticker_speed`.
- **Demo Mode:** An offline local browser mode (`localStorage` + `BroadcastChannel`) that activates automatically when Supabase environment variables are absent.
