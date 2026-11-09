# Fieldr - Live Sports Player Auction Platform for DRGMC

Fieldr is a specialized, dark-editorial auction administration and big-screen display platform engineered for live sports player auctions at DRGMC college. It provides a real-time command center for tournament administrators to manage seasons, sports, teams, purses, and player drafts, alongside an ultra-high-legibility, fullscreen Projector view synchronized across displays.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following requirements and user updates are integrated into this plan:
> - **Player Assignment & Purse Accounting**: Direct "Assign to team" action for players matching sport categories, with optional auction purchase price deduction, negative balance blocking, and transactional audit trails. Includes "Unassign" with an optional purse refund.
> - **Atomic Postgres Ledger**: `supabase/schema.sql` includes an atomic RPC function to guarantee purse updates and transaction logs happen in a single transaction, rejecting negative balances.
> - **Conditional Demo Login Buttons**: One-click Admin and Projector test buttons display strictly in demo mode when Supabase is unconfigured; once Supabase environment variables are provided, only standard email/password authentication is rendered.
> - **Dot-Matrix Ticker Typography**: Live event tickers styled with Google Fonts' `Doto` / `DotGothic16` for authentic athletic stadium scoreboard presence.
> - **Storage & Memory Safeguards**: Client-side canvas compression for uploaded photos (max 400px wide, 0.7 JPEG quality) to prevent localStorage quota exhaustion during demo testing.
> - **Projector Lifecycle & Auto-Idle**: If an actively spotlighted player or team is deleted, projector state gracefully transitions to Idle. Includes autohiding fullscreen controls and `prefers-reduced-motion` accessibility.
> - **Strict No-Emoji Enforcement**: Zero Unicode emoji characters across all UI, labels, toasts, code comments, seeds, and README.

---

## 1. Overview & Core Concept

- **What It Does**: Fieldr gives DRGMC sports convenors a two-node live event execution system:
  1. **Admin Control Room (`/admin`)**: Create/manage tournament seasons, configure sport categories (Cricket, Futsal, Volleyball), register players with sport-specific roles and compressed photos, draft players directly into teams with real-time purse debits/refunds, manage team purse balances, and broadcast live scenes to the hall display.
  2. **Projector Stage (`/projector`)**: A clean, distraction-free stage projection screen with 4 broadcast scenes: Idle Welcome ("Draft. Bid. Win."), All Teams & Purse Leaderboard (with animated count-up numbers), Player Spotlight (cinematic player card, batch, base points), and Team Roster review showing assigned players.
- **Target Audience / Persona**: DRGMC sports committee admins managing live drafts, and college tournament audiences viewing the projector hall display.
- **Key Value**: Eliminates auction friction, manual ledger calculation errors, and presentation lag through authoritative admin control and instant projector broadcast.

---

## 2. User Experience & Visual Design

### Aesthetic Direction & Mood
- Inspired by dark, confident, minimal editorial aesthetics (`corestats.pro` design language).
- **Near-black immersive canvas** (`#0B0B0B`), crisp off-white text (`#F0F2EE`), subtle 1px hairline borders (`rgba(255,255,255,0.08)`), generous whitespace, and zero visual clutter.
- **Palette**:
  - Deep Canvas: `#0B0B0B`
  - Card/Surface: `#141414` / `#1A1A1A`
  - Sage Dark: `#395F3D`
  - Sage Mid: `#047554`
  - Sage Light: `#CBD1CB`
  - Cream Off-White: `#F0F2EE`
  - Amber Accent (Points / Purses only): `#C88B0F`
  - Destructive / Error: `#B91C1C`
- **Typography Pairing**:
  - Display & Hero Headlines: **Syne ExtraBold (800)** for monumental visual punch.
  - Body & UI Controls: **DM Sans (400, 500, 700)** for clarity and high scannability.
  - Stadium Ticker & Numeric Telemetry: **DotGothic16 / Doto** for retro dot-matrix stadium display, paired with `font-mono tabular-nums`.
  - Rare Editorial Accents: **Instrument Serif** italicized tags.
- **Strict Anti-Emoji Compliance**: All visual status indicators, sports markers, and actions use `@phosphor-icons/react` vector glyphs (`Trophy`, `Users`, `Wallet`, `Television`, `Cricket`, `SoccerBall`, `UploadSimple`, `CheckCircle`, `Warning`, `ArrowsLeftRight`, `UserMinus`, `UserPlus`).

### Key Views & Layout Flow
1. **Top-Left Animated Brand Mark & Fullscreen Menu**:
   - 52px rounded-square tile (22% radius) with soft feathered edges, rotating slowly (14s) with drifting blurred sage blobs.
   - Razor-sharp white "F" in Syne ExtraBold centered on top.
   - Clicking triggers an expansive circular clip-path reveal overlay featuring staggered Syne navigation links, role indicators, Esc key listener, and focus trapping.
2. **Landing Page (`/`)**:
   - Eyebrow: "Live player auctions for DRGMC".
   - Monumental 3-line Hero: "DRAFT." "BID." "WIN." with staggered slide-up mask motion and pointer-driven subtle parallax (disabled under `prefers-reduced-motion`).
   - Stadium dot-matrix ticker strip with live season stats.
   - Value pillars: "Register players", "Build teams", "Fund purses" with hairline dividers and scroll reveals.
3. **Authentication (`/login`)**:
   - Clean, focused form with email/password.
   - If Supabase credentials are not configured, display "Demo mode: One-click sign in" with Admin and Projector quick buttons. If Supabase is configured, hide demo buttons completely.
4. **Admin Dashboard (`/admin`)**:
   - Desktop left rail / mobile bottom-sheet navigation with 44px minimum touch targets.
   - 6 Core Modules:
     1. *Overview / Dashboard*: Active season metrics, team purse aggregates, recent ledger log.
     2. *Seasons*: Create season, toggle active status.
     3. *Players*: Registration drawer (photo upload with automatic 400px canvas compression, sport-dependent role dropdowns, year/batch, roll number, base points), search/filter table, CSV bulk import, edit/delete modals.
     4. *Player Assignment Modal / Drawer*: "Assign to team" button (matching player's sport only). Optional auction purchase price input; automatically deducts from team purse, blocks if insufficient balance, logs transaction ("Player assigned: <name>"), and marks player as 'sold'. "Unassign" option with optional "Refund to purse" toggle.
     5. *Teams*: Team creator (name, 3-letter short code, hex palette picker, logo upload, owner display name, starting purse). Deletion confirmation with automatic unassigning of all team players back to 'available'.
     6. *Purses*: Global starting purse reset, per-team Add / Deduct / Set operations with reason logging, negative balance prevention, and transaction history.
     7. *Projector Control Room*: Mode selector (Idle, Teams, Player Spotlight, Team Roster) with miniature real-time stage preview. Auto-falls back to Idle if an active player or team is deleted.
5. **Projector Stage (`/projector`)**:
   - 100% fullscreen canvas, persistent authenticated session, hidden exit control and floating fullscreen button that auto-fades after 3 seconds of cursor inactivity.
   - Motion transitions: cross-fade with subtle scale and blur between modes; rolling count-up animations for purse balances. Roster view renders team header, owner, remaining purse, and all assigned players.

---

## 3. Key Product Decisions & Trade-Offs

- **Pluggable Data Layer (`src/lib/data.ts`)**:
  - All database reads, writes, and real-time subscription calls route through a unified interface.
  - When Supabase credentials (`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`) are present, it connects directly to Supabase Auth, Tables, Storage, and Realtime channels.
  - In local or unconfigured mode, it defaults cleanly to `localStorage` with `BroadcastChannel` real-time sync, displaying a subtle "Demo mode" indicator in the admin console.
- **Atomic Purse Transactions**:
  - Handled via `execute_purse_transaction` Postgres RPC in Supabase, and atomic validation logic in the localStorage adapter, ensuring purse balances never desync from transaction logs or drop below zero.
- **Client-Side Photo Compression**:
  - Canvas utility resizing images to a max dimension of 400px at 0.7 JPEG quality ensures snappy uploads and keeps localStorage well under browser storage limits.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               Fieldr Web App                                │
├──────────────────────────────────────┬──────────────────────────────────────┤
│          Admin View (/admin)         │      Projector View (/projector)     │
│  - Season & Sport Config             │  - Fullscreen Auditorium Stage       │
│  - Player Registration, CSV, Assign  │  - Animated Mode Crossfade           │
│  - Team & Purse Management           │  - Animated Tabular Counters         │
│  - Projector Scene Switcher          │  - Auto-hiding Stage Controls        │
├──────────────────────────────────────┴──────────────────────────────────────┤
│                            Pluggable Data Layer                             │
│                             (src/lib/data.ts)                               │
│   ├── Supabase Client (Auth + Tables + Realtime + Storage + Atomic RPC)    │
│   └── LocalStorage Fallback + BroadcastChannel Sync + Canvas Compression    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Entity Schemas & SQL Blueprint (`supabase/schema.sql`)
- **seasons**: `id uuid primary key`, `name text`, `is_active boolean`, `created_at timestamptz`
- **sports**: `id text primary key`, `name text`, `roles text[]` (seeded: Cricket, Futsal, Volleyball)
- **profiles**: `id uuid primary key references auth.users(id) on delete cascade`, `role text check (role in ('admin', 'projector'))`
- **players**: `id uuid primary key`, `season_id uuid references seasons(id) on delete cascade`, `name text`, `sport text`, `playing_role text`, `year_batch text`, `roll_no text`, `photo_url text`, `base_points numeric`, `status text check (status in ('available', 'sold'))`, `team_id uuid references teams(id) on delete set null`, `notes text`, `purchase_price numeric`
- **teams**: `id uuid primary key`, `season_id uuid references seasons(id) on delete cascade`, `sport text`, `name text`, `short_code text`, `color text`, `logo_url text`, `owner_display_name text`, `owner_user_id uuid`, `starting_purse numeric`, `current_purse numeric`
- **purse_transactions**: `id uuid primary key`, `season_id uuid references seasons(id) on delete cascade`, `team_id uuid references teams(id) on delete cascade`, `type text check (type in ('initial', 'add', 'deduct', 'set'))`, `amount numeric`, `balance_after numeric`, `reason text`, `created_at timestamptz`, `created_by text`
- **projector_state**: `season_id uuid primary key references seasons(id) on delete cascade`, `mode text check (mode in ('idle', 'teams', 'player', 'roster'))`, `player_id uuid`, `team_id uuid`, `updated_at timestamptz`
- **RPC Function**: `execute_purse_transaction(p_team_id, p_season_id, p_type, p_amount, p_reason)` with balance checking and row locking.
- **Storage**: `fieldr-assets` bucket with RLS policies allowing authenticated read and admin upload.

---

## 5. Step-by-Step Execution Plan

1. **Dependencies & Fonts**:
   - Install `@phosphor-icons/react`, `react-router-dom`, `motion`, `@supabase/supabase-js`.
   - Add Google Fonts for `Syne`, `DM Sans`, and `DotGothic16` in `index.html`.
2. **Supabase Schema & README Setup**:
   - Create `supabase/schema.sql` containing all table schemas, enums, RLS policies, storage bucket configurations, seed data, and the `execute_purse_transaction` RPC.
   - Create `README.md` documenting step-by-step Supabase deployment, Auth user creation, role assignment, and env configuration.
3. **Core Data Layer (`src/lib/data.ts`)**:
   - Implement storage adapter with local memory + `localStorage` and `BroadcastChannel` real-time sync.
   - Implement canvas photo compressor utility (400px, 0.7 JPEG).
   - Implement player assignment/unassignment logic with atomic purse debit and refund calculation.
   - Implement Supabase client adapter with fallback detection.
4. **Brand Elements, Navigation & Landing Page**:
   - Build 52px organic rotating blob logo tile and circular clip-path full-screen menu.
   - Build Landing Page (`/`) with staggered Syne headlines, dot-matrix ticker strip, value pillars, and footer.
5. **Authentication & Route Guards (`/login`)**:
   - Implement login form with role-based redirection (`/admin` or `/projector`).
   - Conditionally render demo one-click credentials when Supabase is not connected; hide in production.
6. **Admin Area (`/admin`)**:
   - Implement dashboard metrics, season switcher, team CRUD, player drawer + CSV import, player team assignment/unassignment with purse deduction/refund, purse transaction ledger, and projector control room with live preview.
7. **Projector View (`/projector`)**:
   - Build fullscreen auditorium stage with Idle, Teams, Player Spotlight, and Team Roster scenes.
   - Implement auto-hiding fullscreen control, cross-tab real-time sync, and auto-idle fallback on item deletion.
8. **Verification & Audit**:
   - Codebase scan to ensure strictly zero emoji characters.
   - Touch targets and mobile/tablet responsiveness validation.
   - Rebuild check with `compile_applet` and `lint_applet`.
