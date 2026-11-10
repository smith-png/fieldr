# Fieldr Architecture

Fieldr is a live sports player auction and stage projector platform designed for tournament drafts across Cricket, Futsal, and Volleyball.

## Directory Structure

```text
src/
├── types/                Single source of truth for TypeScript types (no any)
├── lib/
│   ├── data/             Modular data access layer
│   │   ├── client.ts     Supabase client initialization & demo storage
│   │   ├── types.ts      Data service interfaces
│   │   ├── seasons.ts    Season CRUD operations
│   │   ├── players.ts    Player roster, pagination, and assignment RPCs
│   │   ├── teams.ts      Team creation, updates, and subscriptions
│   │   ├── purses.ts     Purse transactions & balance adjustments
│   │   ├── projector.ts  Projector scene state read/write/subscribe
│   │   ├── site.ts       Ticker carousel items and page settings
│   │   ├── storage.ts    Player photo & logo uploads with compression
│   │   ├── auth.ts       Authentication methods (Supabase & demo)
│   │   └── index.ts      Consolidated data export
│   ├── sports.ts         Canonical sport definitions, slugs, roles, and order
│   ├── academicYears.ts  Canonical academic year values and labels
│   ├── errors.ts         AppError class and error normalization helpers
│   ├── theme.tsx         Theme engine (system / light / dark)
│   ├── AuthContext.tsx   Session context & role management
│   └── ToastContext.tsx  Global toast notification provider
├── hooks/                Custom hooks (useDebounce, useTheme)
├── components/
│   ├── ui/               Shared UI primitives (Button, Dialog, Toast, EmptyState,
│   │                     ErrorState, Pagination, PageHeader, Spinner, SegmentedControl)
│   ├── layout/           Layout components (BrandMark, HeaderBar, NavigationMenu,
│   │                     RouteGuard, SiteFooter, ErrorBoundary)
│   ├── home/             Home-specific views (TickerStrip, SportCardsGrid,
│   │                     SportEquipmentSvgs, AnimatedCounter)
│   ├── roster/           Roster views (RosterPlayerCard, RosterScoutModal)
│   └── admin/            Shared admin helpers and subcomponents
└── pages/
    ├── public/           Public pages (HomePage, TeamsPage, SeasonPage,
    │                     ContentPage, RostersPage, RosterSportPage, LoginPage, ProjectorPage)
    └── admin/            Admin pages (AdminPage, AdminLayout, AdminDashboard,
                          AdminPlayers, AdminTeams, AdminPurses, AdminSeasons,
                          AdminProjectorControl, AdminSetup)
```

## Data Flow

```text
[UI Component]
      │
      ▼
[Custom Hook or Context] (Optional: useToast, useDebounce, useAuth)
      │
      ▼
[src/lib/data/] (seasons.ts, players.ts, teams.ts, purses.ts, projector.ts, site.ts, storage.ts)
      │
      ├──────────────────────────────┬──────────────────────────────┐
      ▼                              ▼                              ▼
[Demo Mode (isDemoMode)]      [Supabase Client]           [BroadcastChannel / Realtime]
  • localStorage tables         • Remote Postgres DB        • Cross-tab demo sync
  • In-memory canvas photos     • Row Level Security (RLS)  • Supabase postgres_changes
                                • Storage bucket & RPCs
```

All data queries and mutations route exclusively through `src/lib/data/`. Components never access Supabase or localStorage directly for application data. When operations fail, data functions throw `AppError` carrying the specific backend error message to be surfaced directly in toasts.

## Extension Guidelines

### Adding a New Table
1. Define table schema and RLS policies in `supabase/`.
2. Add the TypeScript interface to `src/types/index.ts`.
3. Create a service module in `src/lib/data/` defining the TypeScript interface and two implementations (Supabase and Demo), guarded by `isDemoMode`.
4. Re-export the service and helper functions from `src/lib/data/index.ts`.

### Adding a New Public or Admin Page
1. Place public pages under `src/pages/public/` and admin views under `src/pages/admin/`.
2. Register the route in `src/App.tsx`. Protect admin or projector routes using `<RouteGuard allowedRoles={[...]}>`.
3. If navigation links are required, add the link entry to `src/components/layout/NavigationMenu.tsx`.

### Adding a New Sport
1. Add the sport slug, display label, order, and exact playing roles to `SPORTS` in `src/lib/sports.ts`.
2. Provide the corresponding equipment illustration in `src/components/home/SportEquipmentSvgs.tsx` and register it in `src/components/home/SportCardsGrid.tsx`.
3. In Supabase production mode, insert the corresponding row into the `sports` table (`id`, `name`, `roles`).
