# Admin Page Map: Athletes, Players, Teams, and Purses

---

## 1. Admin Athletes Page

- **Exact File Path**: `src/pages/admin/AdminAthletes.tsx`
- **Route**: `/admin` (rendered inside `src/pages/admin/AdminPage.tsx` when `currentTab === 'athletes'`; wrapped in `<RouteGuard allowedRoles={['admin']}>` in `src/App.tsx`)
- **Admin Sidebar Link**:
  - Defined in `src/pages/admin/AdminLayout.tsx` in the `tabs` array:
    `{ id: 'athletes', label: 'Athletes', icon: <IdentificationBadge size={18} weight="bold" /> }`
  - Clicking the sidebar button calls `onSelectTab('athletes')` (handled by `handleSelectTab` in `src/pages/admin/AdminPage.tsx`, which sets `currentTab` to `'athletes'` and navigates to `/admin` if currently on `/admin/logs`).
- **Supabase Tables, Views, RPCs, Storage & Realtime Used**:
  - **Tables**:
    - `athletes`:
      - `SELECT` (`id, athlete_code, name, academic_year, photo_url, photo_thumb_url, roll_no, notes, created_at`) via `getAthletesPaged`, `getAthleteById`, and `getAllAthletes` (inside `BulkRegisterPanel`)
      - `INSERT` (`name, academic_year, photo_url, photo_thumb_url, roll_no, notes`) via `createAthlete`
      - `UPDATE` (`name, academic_year, roll_no, notes, photo_url, photo_thumb_url`) via `updateAthlete`
      - `DELETE` (`eq('id', id)`) via `deleteAthlete`
    - `players`:
      - `SELECT` (`athlete_id` / `id` counts and `id, season_id, sport, playing_role, academic_year, status, team_id, base_points, purchase_price`) via `getAthletesPaged`, `getAthleteById`, `getAthleteEntries`, `deleteAthlete` (pre-delete check), and `BulkRegisterPanel` (`getPlayers`, `bulkRegisterPlayers`)
      - `INSERT` (`athlete_id, season_id, sport, playing_role, base_points, academic_year`) via `bulkRegisterPlayers` (inside `BulkRegisterPanel`)
      - `UPDATE` (`academic_year` synced for active season rows when athlete `academic_year` is updated) via `updateAthlete`
    - `seasons`:
      - `SELECT` (`id, name, is_active, created_at`) via `getAthleteEntries` and `updateAthlete`
    - `sports`:
      - `SELECT` (`id, name, roles`) via `getRolesForSport` (inside `BulkRegisterPanel`) and passed down from `AdminPage` (`getSports`)
  - **Views**:
    - `public_players`: `SELECT` via `getPlayers` (used inside `BulkRegisterPanel`)
  - **RPCs**: None directly
  - **Storage**:
    - Bucket `fieldr-assets` (`players/originals/*` and `players/thumbnails/*`) via `uploadPlayerPhotos` and `deletePlayerPhotoAssets`
  - **Realtime Subscriptions**:
    - Channel `admin_athletes_realtime`: listens to `postgres_changes` (`event: '*'`) on `public.athletes` and `public.players` via `subscribeToAthletes`
- **Shared Components & Contexts Imported**:
  - UI components (`src/components/ui`): `Button`, `Dialog`, `EmptyState`, `PageHeader`, `Pagination`
  - Admin components (`src/components/admin`): `BulkRegisterPanel`
  - Contexts & utilities: `useToast` (`src/lib/ToastContext`), `ACADEMIC_YEARS` / `getAcademicYearLabel` (`src/lib/academicYears`), `validateImageFile` (`src/lib/imageCompression`), `getErrorMessage` (`src/lib/errors`)
  - Icons (`@phosphor-icons/react`): `ArrowLeft`, `IdentificationBadge`, `MagnifyingGlass`, `PencilSimple`, `Plus`, `Trash`, `UploadSimple`, `User`, `UserPlus`, `X`

---

## 2. Admin Players Page

- **Exact File Path**: `src/pages/admin/AdminPlayers.tsx`
- **Route**: `/admin` (rendered inside `src/pages/admin/AdminPage.tsx` when `currentTab === 'players'`; wrapped in `<RouteGuard allowedRoles={['admin']}>` in `src/App.tsx`)
- **Admin Sidebar Link**:
  - Defined in `src/pages/admin/AdminLayout.tsx` in the `tabs` array:
    `{ id: 'players', label: 'Players', icon: <Users size={18} weight="bold" /> }`
  - Clicking the sidebar button calls `onSelectTab('players')` (handled by `handleSelectTab` in `src/pages/admin/AdminPage.tsx`, which sets `currentTab` to `'players'` and navigates to `/admin` if currently on `/admin/logs`).
- **Supabase Tables, Views, RPCs & Realtime Used**:
  - **Tables**:
    - `players` (often joined with `athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)`):
      - `SELECT` via `getPlayersPaged`, `getPlayers`, `exportPlayersForSport`, `createPlayer` (duplicate check), `assignPlayerToTeam`, and `unassignPlayerFromTeam`
      - `INSERT` (`athlete_id, season_id, sport, playing_role, base_points, academic_year`) via `createPlayer`, `bulkCreatePlayers`, and `bulkRegisterPlayers` (in `BulkRegisterPanel`)
      - `UPDATE` (`sport, playing_role, base_points, academic_year`) via `updatePlayer`
      - `DELETE` (`eq('id', id)`) via `deletePlayer`
    - `athletes`:
      - `SELECT` (`id, athlete_code, name, academic_year, photo_url, photo_thumb_url, roll_no, notes, created_at`) via `searchAthletes`, `getAllAthletes` (in `BulkRegisterPanel`), and embedded foreign-key join on `players`
    - `teams`:
      - `SELECT` (`*`) via `assignPlayerToTeam`, `unassignPlayerFromTeam`, and passed as prop from `AdminPage` (`getTeams`)
    - `sports`:
      - `SELECT` (`id, name, roles`) via `getRolesForSport` and passed as prop from `AdminPage` (`getSports`)
    - `projector_state`:
      - `SELECT` and `UPDATE` (resets `mode: 'idle', player_id: null` if the deleted player was currently on stage) via `deletePlayer`
  - **Views**:
    - `public_players`:
      - `SELECT` (`id, season_id, athlete_id, athlete_code, player_code, name, sport, playing_role, academic_year, photo_url, photo_thumb_url`) via `getPlayers` and `exportPlayersForSport`
  - **RPCs**:
    - `assign_player_to_team({ p_player_id, p_team_id, p_price })` via `assignPlayerToTeam`
    - `unassign_player_from_team({ p_player_id, p_refund })` via `unassignPlayerFromTeam`
  - **Realtime Subscriptions**:
    - Channel `admin_athletes_realtime`: listens to `postgres_changes` on `public.athletes` and `public.players` via `subscribeToAthletes`
    - Channel `players_${seasonId}` (in parent `AdminPage.tsx`): listens to `postgres_changes` on `public.players` (`filter: season_id=eq.${seasonId}`) via `subscribeToPlayers`
- **Shared Components & Contexts Imported**:
  - UI components (`src/components/ui`): `Button`, `Dialog`, `EmptyState`, `PageHeader`, `Pagination`
  - Admin components (`src/components/admin`): `BulkRegisterPanel`
  - Router (`react-router-dom`): `Link`
  - Contexts & utilities: `useToast` (`src/lib/ToastContext`), `getAcademicYearLabel` (`src/lib/academicYears`), `getErrorMessage` (`src/lib/errors`)
  - Icons (`@phosphor-icons/react`): `ArrowsLeftRight`, `CheckCircle`, `DownloadSimple`, `Funnel`, `IdentificationBadge`, `MagnifyingGlass`, `PencilSimple`, `Plus`, `Trash`, `UploadSimple`, `User`, `UserMinus`, `UserPlus`, `Users`, `WarningCircle`, `X`

---

## 3. Admin Teams Page

- **Exact File Path**: `src/pages/admin/AdminTeams.tsx`
- **Route**: `/admin` (rendered inside `src/pages/admin/AdminPage.tsx` when `currentTab === 'teams'`; wrapped in `<RouteGuard allowedRoles={['admin']}>` in `src/App.tsx`)
- **Admin Sidebar Link**:
  - Defined in `src/pages/admin/AdminLayout.tsx` in the `tabs` array:
    `{ id: 'teams', label: 'Teams', icon: <ShieldCheck size={18} weight="bold" /> }`
  - Clicking the sidebar button calls `onSelectTab('teams')` (handled by `handleSelectTab` in `src/pages/admin/AdminPage.tsx`, which sets `currentTab` to `'teams'` and navigates to `/admin` if currently on `/admin/logs`).
- **Supabase Tables, Views, RPCs, Edge Functions, Storage & Realtime Used**:
  - **Tables**:
    - `teams`:
      - `SELECT` (`id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, owner_user_id, starting_purse, current_purse, created_at`) via `getTeams` in parent `AdminPage.tsx`
      - `INSERT` via `createTeam` and `bulkCreateTeams`
      - `UPDATE` via `updateTeam`
      - `DELETE` (`eq('id', id)`) via `deleteTeam`
    - `purse_transactions`:
      - `INSERT` (`season_id, team_id, type: 'initial', amount, balance_after, reason: 'Initial team purse', created_by: 'admin'`) when creating teams via `createTeam` and `bulkCreateTeams`
    - `players`:
      - `UPDATE` (`team_id: null, status: 'available', purchase_price: null` for players on a deleted team) via `deleteTeam`
    - `projector_state`:
      - `SELECT` and `UPDATE` (resets `mode: 'idle', team_id: null` if the deleted team was currently on stage) via `deleteTeam`
    - `sports`:
      - `SELECT` (`id, name, roles`) passed as `sports` prop from `AdminPage.tsx` (`getSports`)
  - **Views**: None directly
  - **RPCs**: None directly
  - **Edge Functions**:
    - `supabase.functions.invoke('manage-owner', { body: { action, team_id, login_id, password } })` with `action: 'status' | 'set' | 'remove'` via `manageOwnerLogin`
  - **Storage**:
    - Bucket `fieldr-assets` (`teams/*` and `owners/*` folders) via `uploadAsset` and `deleteStorageAsset`
  - **Realtime Subscriptions**:
    - Channel `teams_${seasonId}` (in parent `AdminPage.tsx`): listens to `postgres_changes` on `public.teams` (`filter: season_id=eq.${seasonId}`) via `subscribeToTeams`
- **Shared Components & Contexts Imported**:
  - UI components (`src/components/ui`): `Button`, `Dialog`, `EmptyState`, `PageHeader`
  - Contexts & utilities: `useToast` (`src/lib/ToastContext`), `getErrorMessage` (`src/lib/errors`)
  - Icons (`@phosphor-icons/react`): `CheckCircle`, `DownloadSimple`, `Eye`, `EyeSlash`, `Key`, `PencilSimple`, `Plus`, `ShieldCheck`, `Trash`, `UploadSimple`, `User`, `Wallet`, `WarningCircle`

---

## 4. Admin Purses Page

- **Exact File Path**: `src/pages/admin/AdminPurses.tsx`
- **Route**: `/admin` (rendered inside `src/pages/admin/AdminPage.tsx` when `currentTab === 'purses'`; wrapped in `<RouteGuard allowedRoles={['admin']}>` in `src/App.tsx`)
- **Admin Sidebar Link**:
  - Defined in `src/pages/admin/AdminLayout.tsx` in the `tabs` array:
    `{ id: 'purses', label: 'Purses', icon: <Coins size={18} weight="bold" /> }`
  - Clicking the sidebar button calls `onSelectTab('purses')` (handled by `handleSelectTab` in `src/pages/admin/AdminPage.tsx`, which sets `currentTab` to `'purses'` and navigates to `/admin` if currently on `/admin/logs`).
- **Supabase Tables, Views, RPCs & Realtime Used**:
  - **Tables**:
    - `purse_transactions`:
      - `SELECT` (`id, season_id, team_id, type, amount, balance_after, reason, created_at, created_by`) via `getPurseTransactions` (in `AdminPage.tsx`) and after `executePurseTransaction`
    - `teams`:
      - `SELECT` (`id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, owner_user_id, starting_purse, current_purse, created_at`) passed as `teams` prop from `AdminPage.tsx` (`getTeams`)
      - Updated indirectly in the database by the `execute_purse_transaction` and `reset_all_purses` RPCs
  - **Views**: None
  - **RPCs**:
    - `execute_purse_transaction({ p_team_id, p_season_id, p_type, p_amount, p_reason, p_created_by })` via `executePurseTransaction`
    - `reset_all_purses({ p_season_id, p_starting_amount, p_reason })` via `resetAllPurses`
  - **Realtime Subscriptions**:
    - Channel `teams_${seasonId}` (in parent `AdminPage.tsx`): listens to `postgres_changes` on `public.teams` (`filter: season_id=eq.${seasonId}`) via `subscribeToTeams`
- **Shared Components & Contexts Imported**:
  - UI components (`src/components/ui`): `Button`, `Dialog`, `EmptyState`, `PageHeader`
  - Contexts: `useToast` (`src/lib/ToastContext`)
  - Icons (`@phosphor-icons/react`): `ArrowsClockwise`, `Minus`, `PencilSimple`, `Plus`, `ShieldCheck`
