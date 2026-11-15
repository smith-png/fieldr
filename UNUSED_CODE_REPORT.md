# Unused Code Audit Report

## 1. Files Never Imported or Routed To Anywhere

- `src/components/home/SportEquipmentSvgs.tsx` — SVG sport illustration components (`6,829 B`); replaced by static roster `.jpg` images and never imported anywhere. **Risk: Safe**
- `src/components/layout/index.ts` — Barrel re-export file (`179 B`) for layout components; every consumer imports directly from concrete files (`HeaderBar.tsx`, `NavigationMenu.tsx`, etc.). **Risk: Safe**

## 2. Exports That Nothing Imports

- `src/components/home/SportEquipmentSvgs.tsx` (`CricketIllustration`, `FutsalIllustration`, `VolleyballIllustration`) — Vector sport card illustrations; 0 imports across the codebase. **Risk: Safe**
- `src/lib/queryCache.ts` (`invalidateQuery`, `QUERY_FRESH_TTL_MS`, `QUERY_REVALIDATE_AFTER_MS`) — Cache helper function and TTL constants; never imported outside `queryCache.ts` (`invalidateQuery` has 0 calls anywhere). **Risk: Safe**
- `src/lib/publicCache.ts` (`SeasonCardCacheItem`, `SeasonDetailCacheEntry`, `RosterPagedCacheEntry`, `RosterSportInfoCacheEntry`, `SeasonTeamDetailCacheEntry`, `PlayerProfileCacheEntry`) — Cache entry TypeScript interfaces; only referenced inside `publicCache.ts`. **Risk: Safe**
- `src/components/ui/Skeleton.tsx` (`SkeletonStatTile`) — Skeleton tile component re-exported in `src/components/ui/index.ts`; only used internally by `AdminDashboardSkeleton` in `Skeleton.tsx`. **Risk: Safe**
- `src/components/credits/CreditsSection.tsx` (`getPersonInitials`) — Helper function; only called internally within `CreditsSection.tsx`. **Risk: Safe**
- `src/lib/data/site.ts` (`PUBLIC_HOME_CACHE_KEY`, `HOME_CACHE_TTL_MS`, `PublicTickerCachePayload`, `PublicHomeCachePayload`, `writeCachedTickerSpeed`, `invalidateCachedPublicHome`) — Home/ticker cache constants, types, and helpers; only used internally within `site.ts`. **Risk: Safe**
- `src/components/ui/Button.tsx` (`ButtonVariant`, `ButtonSize`, `ButtonProps`) — Component prop types; only used inside `Button.tsx` and barrel re-export. **Risk: Safe**
- `src/components/ui/Dialog.tsx` (`DialogProps`) — Component prop interface; only used inside `Dialog.tsx` and barrel re-export. **Risk: Safe**
- `src/components/ui/EmptyState.tsx` (`EmptyStateProps`) — Component prop interface; only used inside `EmptyState.tsx` and barrel re-export. **Risk: Safe**
- `src/components/ui/ErrorState.tsx` (`ErrorStateProps`) — Component prop interface; only used inside `ErrorState.tsx` and barrel re-export. **Risk: Safe**
- `src/components/ui/PageHeader.tsx` (`PageHeaderProps`) — Component prop interface; only used inside `PageHeader.tsx` and barrel re-export. **Risk: Safe**
- `src/components/ui/Pagination.tsx` (`PaginationProps`) — Component prop interface; only used inside `Pagination.tsx` and barrel re-export. **Risk: Safe**
- `src/components/ui/SegmentedControl.tsx` (`SegmentedControlOption`, `SegmentedControlProps`) — Component prop types; only used inside `SegmentedControl.tsx` and barrel re-export. **Risk: Safe**
- `src/components/ui/Spinner.tsx` (`SpinnerProps`) — Component prop interface; only used inside `Spinner.tsx` and barrel re-export. **Risk: Safe**
- `src/components/ui/Toast.tsx` (`ToastItemProps`) — Component prop interface; only used inside `Toast.tsx` and barrel re-export. **Risk: Safe**
- `src/components/roster/RosterPlayerCard.tsx` (`RosterPlayerCardProps`) — Component prop interface; only used inside `RosterPlayerCard.tsx`. **Risk: Safe**
- `src/components/roster/RosterScoutModal.tsx` (`RosterScoutModalProps`) — Component prop interface; only used inside `RosterScoutModal.tsx`. **Risk: Safe**
- `src/components/admin/BulkRegisterPanel.tsx` (`BulkRegisterPanelProps`) — Component prop interface; only used inside `BulkRegisterPanel.tsx`. **Risk: Safe**
- `src/lib/academicYears.ts` (`AcademicYearDefinition`) — TypeScript interface; only used inside `academicYears.ts`. **Risk: Safe**
- `src/lib/sports.ts` (`SportDefinition`) — TypeScript interface; only used inside `sports.ts`. **Risk: Safe**
- `src/lib/data/types.ts` (`BulkRegisterEntryInput`) — TypeScript interface; only referenced inside `src/lib/data/types.ts`. **Risk: Safe**
- `src/lib/data/credits.ts` (`CreateCreditPersonInput`, `UpdateCreditPersonInput`, `extractCreditsBucketPath`) — Input types and storage path helper; only used internally within `credits.ts`. **Risk: Safe**
- `src/lib/theme.tsx` (`getStoredPreference`, `setStoredPreference`, `getSystemTheme`, `resolveTheme`, `applyThemeToDom`) — Internal theme helpers; only called inside `src/lib/theme.tsx`. **Risk: Likely safe**

## 3. Unused Dependencies in `package.json`

- `autoprefixer` (`devDependencies`) — PostCSS plugin not imported or configured anywhere; Tailwind v4 uses `@tailwindcss/vite` directly. **Risk: Safe**
- `@types/node` (`devDependencies`) — Node type definitions not referenced in `tsconfig.json` or any source file. **Risk: Likely safe**

## 4. Unused Imports and Unused Variables Inside Files

- `src/App.tsx` (line 6) — Default import `React`; never read after converting page components to `lazy()`. **Risk: Safe**
- `src/components/layout/ErrorBoundary.tsx` (line 1) — Default import `React`; never read under `react-jsx` transform. **Risk: Safe**
- `src/lib/constants.ts` (line 9) — Local constant `PLAYER_STATUS_VALUES`; declared without export and never read. **Risk: Safe**
- `src/lib/constants.ts` (line 29) — Local constant `PROJECTOR_MODE_VALUES`; declared without export and never read. **Risk: Safe**
- `src/lib/constants.ts` (line 51) — Local constant `PROJECTOR_AUTO_FILTER_VALUES`; declared without export and never read. **Risk: Safe**
- `src/lib/data/types.ts` (line 11) — Imported type `PlayerStatus`; never referenced in `src/lib/data/types.ts`. **Risk: Safe**
- `src/pages/public/SeasonTeamDetailPage.tsx` (line 116) — State variable `season` in `const [season, setSeason]`; updated via `setSeason` but never read in JSX. **Risk: Likely safe**

## 5. CSS: Unused Classes, Custom Properties, Fonts, and Keyframes

- `index.html` (line 36) — Google Font `Instrument Serif` (`family=Instrument+Serif:ital@0;1`); loaded over the network but never referenced in `src/index.css` or any component. **Risk: Safe**
- `src/index.css` (lines 25, 47, 69) — Custom properties `--on-media` and `--color-on-media`; defined in `:root`, `[data-theme="dark"]`, and `@theme inline`, never used in CSS or TSX. **Risk: Safe**
- `src/index.css` (lines 27, 49, 71) — Custom properties `--brand-gradient-start` and `--color-brand-start`; defined in theme blocks, never used in CSS or TSX. **Risk: Safe**
- `src/index.css` (lines 28, 50, 72) — Custom properties `--brand-gradient-end` and `--color-brand-end`; defined in theme blocks, never used in CSS or TSX. **Risk: Safe**

## 6. Unreferenced Assets in `public/` or `src/`

- `public/assets/aistudio/IMG_20261115_174022_6d83a653.jpg` — Unreferenced uploaded image (`5,287,840 B` / `5.29 MB`); 0 references in code or HTML. **Risk: Safe**
- `public/assets/aistudio/devault-ascii-20261115-183609_92a5dc9e.jpg` — Unreferenced uploaded image (`1,978,772 B` / `1.98 MB`); duplicate of `public/images/rosters/cricket.jpg`. **Risk: Safe**
- `public/assets/aistudio/devault-ascii-20261115-193708_40961b01.jpg` — Unreferenced uploaded image (`1,787,755 B` / `1.79 MB`); unused B&W grain image. **Risk: Safe**
- `public/assets/aistudio/devault-ascii-20261115-183518_b03ccb00.jpg` — Unreferenced uploaded image (`1,786,142 B` / `1.79 MB`); duplicate of `public/images/rosters/futsal.jpg`. **Risk: Safe**
- `public/assets/aistudio/devault-ascii-20261115-193925_b36a5c98.jpg` — Unreferenced uploaded image (`1,498,895 B` / `1.50 MB`); unused B&W grain image. **Risk: Safe**
- `public/assets/aistudio/IMG_20261115_174218_a2d80eb2.jpg` — Unreferenced uploaded image (`1,492,141 B` / `1.49 MB`); 0 references in code or HTML. **Risk: Safe**
- `public/assets/aistudio/devault-ascii-20261115-194255_97292901.jpg` — Unreferenced uploaded image (`1,398,933 B` / `1.40 MB`); unused B&W grain image. **Risk: Safe**
- `public/assets/aistudio/IMG_20261115_174039_7647de07.jpg` — Unreferenced uploaded image (`1,167,772 B` / `1.17 MB`); 0 references in code or HTML. **Risk: Safe**
- `public/assets/aistudio/devault-ascii-20261115-183716_fd2bec89.jpg` — Unreferenced uploaded image (`646,222 B` / `646.2 KB`); duplicate of `public/images/rosters/volleyball.jpg`. **Risk: Safe**

## 7. Leftover Debug Code, Comments, Unused Mock Data, and Duplicate Components

- `src/components/home/SportEquipmentSvgs.tsx` — Obsolete SVG sport illustrations superseded by static `.jpg` photos in `SportCardsGrid.tsx`; unused by any page (`0` console.log calls or >5-line commented-out code blocks exist in the project). **Risk: Safe**

## 8. Old Features That No Longer Have a Route or Menu Link

- `src/lib/publicCache.ts` (lines 34–45, 87–91) — `publicCache.seasonCards` (`SeasonCardCacheItem[]`) and `publicCache.seasonDetails` (`Map<string, SeasonDetailCacheEntry>`) from the removed public `/seasons` and `/seasons/:seasonId` pages; never populated anywhere. **Risk: Safe**
- `src/pages/public/SeasonTeamDetailPage.tsx` (lines 88–89) and `src/lib/data/seasons.ts` (lines 17–18) — Reads and clears `publicCache.seasonDetails` and `publicCache.seasonCards`, which are always empty because the public Season pages were removed. **Risk: Safe**

## Unsure

- `src/lib/data/players.ts` (line 22) — Unused import `getNextAthleteCode` from `./athletes`; located inside the players data module. **Risk: Unsure**
- `src/lib/data/site.ts` (line 10) — Unused import `demoBroadcastChannel` from `./client`; located inside the site settings data module. **Risk: Unsure**
- `src/hooks/useTheme.ts` — 6-line re-export wrapper around `src/lib/theme.tsx`; imported only by `src/pages/public/ProjectorPage.tsx` while other files import from `src/lib/theme.tsx` directly. **Risk: Unsure**
- `src/lib/data/client.ts` (lines 258, 464) — Demo-mode seed data for archived 2025 season teams and career entries; used only when running in offline/demo fallback mode. **Risk: Unsure**

## Totals

- **Number of files that could be deleted:** 11 (`2` source files: `src/components/home/SportEquipmentSvgs.tsx`, `src/components/layout/index.ts`; plus `9` unreferenced image files in `public/assets/aistudio/`)
- **Number of packages that could be removed:** 2 (`autoprefixer`, `@types/node`)
- **Total size of unused assets:** `17,044,472 bytes` (`17.04 MB` / `16.25 MiB` across 9 files in `public/assets/aistudio/`)
