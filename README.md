# Fieldr

Multi-sport tournament management, player auction, and live broadcast platform built with React, TypeScript, Vite, and Supabase.

Fieldr handles the full lifecycle of a seasonal multi-sport tournament (Cricket, Futsal, Volleyball)—from athlete registration and bulk roster imports to live auction bidding, real-time projector displays, match results, and highlight reels.

---

## Architecture & Project Structure

```text
fieldr-main/
├── public/
│   └── images/               # Brand flame animations (dark/light/colour variants) and icons
├── docs/
│   └── PROJECT_REFERENCE.md  # Domain architecture, data flow and live database reference
└── src/
    ├── pages/
    │   ├── public/           # Spectator & participant surfaces
    │   │   ├── HomePage.tsx              # Tournament overview, live ticker, sport hubs
    │   │   ├── RegisterPage.tsx          # Athlete registration & status tracking
    │   │   ├── RostersPage.tsx           # Sport-wise player pools & scout modals
    │   │   ├── TeamsPage.tsx             # Franchise overview & season squad breakdowns
    │   │   ├── ProjectorPage.tsx         # Live venue auction board & sold celebration sequences
    │   │   ├── ResultsPage.tsx           # Live & completed match scoreboards + shareable result cards
    │   │   ├── ReelsPage.tsx             # Tournament highlight feed & ReelSubmitPage
    │   │   └── RulesPage.tsx / HandbookPage.tsx
    │   └── admin/            # Operations console (role-gated)
    │       ├── AdminDashboard.tsx        # Season metrics & quick operational controls
    │       ├── AdminAuction.tsx          # Live bidding engine, lot queue & purse deductions
    │       ├── AdminProjectorControl.tsx # Remote stage control for ProjectorPage
    │       ├── AdminRegistrationsTab.tsx # Approval queue & BulkRegisterPanel
    │       ├── AdminPlayers.tsx / AdminAthletes.tsx / AdminTeams.tsx / AdminPurses.tsx
    │       ├── AdminSeasons.tsx          # Season lifecycle & JSON backup/restore
    │       └── AdminSetup.tsx            # Rules, handbook, credits, reels, and photo optimization
    ├── components/
    │   ├── home/             # Animated counters, sport artwork, ticker strip, theme backdrops
    │   ├── projector/        # Confetti engine & "Secured" player reveal sequence
    │   ├── roster/           # Player cards & scouting detail modal
    │   ├── admin/            # Modular setup cards & bulk registration tools
    │   ├── layout/           # Header, navigation drawer, route guards, error boundaries
    │   └── ui/               # Reusable primitives (Dialog, Toast, SegmentedControl, Skeleton, Pagination)
    ├── lib/
    │   ├── data/             # Domain-isolated Supabase data modules (auction, players, teams, purses, reels, site)
    │   ├── shareCanvasUtils.ts / shareSquadImage.ts / shareResultsImage.ts  # Client-side social card generators
    │   ├── imageCompression.ts   # Client-side roster photo optimizer
    │   ├── seasonBackup.ts       # Full season state export/import
    │   ├── queryCache.ts / publicCache.ts / resultsPoller.ts  # Caching & live polling utilities
    │   └── AuthContext.tsx / theme.tsx / ToastContext.tsx
    ├── hooks/                # Custom hooks (useAutoSlideshow, useDebounce, useBodyScrollLock, useTheme)
    └── types/                # Shared TypeScript domain interfaces
```

---

## Core Modules

- **Live Auction & Projector Sync:** `AdminAuction.tsx` and `AdminProjectorControl.tsx` drive real-time stage states rendered on `ProjectorPage.tsx`, complete with live purse tracking, squad slot validation, and animated player reveal sequences.
- **Data Access Layer (`src/lib/data/`):** All database reads, mutations, and storage operations are isolated into domain-specific modules (`auction.ts`, `players.ts`, `teams.ts`, `purses.ts`, `registrations.ts`, `reels.ts`, `seasons.ts`, `site.ts`) backed by client-side query caching.
- **Shareable Media Generators:** Built-in HTML5 Canvas utilities (`shareSquadImage.ts`, `shareResultsImage.ts`) render downloadable squad and match result graphics directly in the browser.
- **Season Portability & Media Optimization:** Includes full season JSON backup/restore (`seasonBackup.ts`) and client-side image compression (`imageCompression.ts`) for athlete profile photos.

---

## Local Setup

### Prerequisites
- Node.js 18+ or Bun
- A Supabase project initialized with the SQL files in `/supabase`

### Installation

```bash
# Install dependencies
bun install
# or: npm install

# Configure environment variables
cp .env.example .env
```

Populate `.env` with your Supabase project credentials, then start the development server:

```bash
bun run dev
# or: npm run dev
```

---

## Copyright & License

**Copyright © 2026 Smit Narendra Bhute. All Rights Reserved.**

This repository is published publicly for viewing and portfolio reference only. It is **not** open-source software.

- **Ownership:** All original source code, system architecture, database schemas, UI designs, documentation, and custom assets are the copyrighted intellectual property of **Smit Narendra Bhute**. Portions of the codebase were developed with AI coding assistance and curated, integrated, and authored by the copyright holder.
- **Restrictions:** Viewing and forking on GitHub are permitted solely under GitHub's Terms of Service. Copying, modifying, deploying, redistributing, or using any protected part of this codebase without prior written permission from the copyright holder is prohibited.
- **Third-Party Software:** Underlying packages and dependencies remain subject to their respective open-source licenses.

See the `LICENSE` file for full terms.
