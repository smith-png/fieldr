# Fieldr Typography Audit

## Summary Table

| Element | File | Font Family | Weight |
| :--- | :--- | :--- | :--- |
| **Sidebar wordmark `"Fieldr"` (admin layout)** | `src/components/layout/BrandMark.tsx` (lines 52–58) + `src/index.css` (lines 127–144) | `Syne` (`.font-syne`) | `800` in class (`font-extrabold`), **computed `500`** outside `div[data-theme]` due to `src/index.css` rule on `span.font-extrabold:not(h1):not(.text-3xl)...` (Note: `Syne` only loads `700;800` from Google Fonts, so the browser synthesizes/falls back to `700`) |
| **Main page title: `Auction Room`** | `src/pages/admin/AdminAuction.tsx` (line 493) | `Syne` (`.font-syne`) | `800` (`font-extrabold` on `<h1>`) |
| **Main page title: `Registered Players`** | `src/pages/admin/AdminPlayers.tsx` (line 582) → `src/components/ui/PageHeader.tsx` (line 35) | `Syne` (`.font-syne`) | `800` (`font-extrabold` on `<h1>`) |
| **Main page title: `Activity Log`** | `src/pages/admin/AdminLogs.tsx` (lines 250–252) | `Manrope` (`font-sans`) | `700` (`font-bold` on `<h1>`; note `Manrope` loads `400;500;600` in `index.html`) |
| **Public hamburger menu items (`Home`, `Teams`, `Season`, `Dashboard`, `Projector`)** | `src/components/layout/NavigationMenu.tsx` (lines 165–176) | `Manrope` (`font-sans`) | `500` (`font-medium`) |
| **Public hamburger menu item (`Sign out`)** | `src/components/layout/NavigationMenu.tsx` (lines 192–203) | `Manrope` (`font-sans`) | `400` (`font-normal`) |
| **Public home page hero title (`DRAFT. / BID. / WIN.`)** | `src/pages/public/HomePage.tsx` (lines 175–192) | `Syne` (`.font-syne`) | `800` (`font-extrabold` on `<motion.h1>`) |
| **Projector page title (`/projector` idle season title)** | `src/pages/public/ProjectorPage.tsx` (lines 821–826) | `Syne` (`.font-syne`) | `800` (`font-extrabold` on `<h1>`) |
| **Admin Projector page title (`Projector Command Studio`)** | `src/pages/admin/AdminProjectorControl.tsx` (lines 450–453) → `src/components/ui/PageHeader.tsx` (line 35) | `Syne` (`.font-syne`) | `800` (`font-extrabold` on `<h1>`) |
| **Dialogs (`Dialog` container / title / body)** | `src/components/ui/Dialog.tsx` (lines 61–104) | `Manrope` (inherits from `body` / `--font-sans`) | Title (`<h3>`): `500` (`font-medium`); Description (`<p>`): `400` (`font-normal`); Body: inherits `400` |
| **Toasts (`ToastItem`)** | `src/components/ui/Toast.tsx` (line 28) | Tailwind default `font-mono` (`ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, ...`) | `400` (default normal; dismiss `<button>` inside gets `Manrope` `400` from `src/index.css` line 111) |
| **Dropdown menus (native `<select>`)** | `src/index.css` (lines 111–124) & page components | `Manrope` (forced by `src/index.css` `:is(..., select, ...)`) (`DM Sans` if inside `div[data-theme]`) | `400` (or `500` when `font-medium` / `font-semibold` is applied) |

---

## 1. Where Fonts Are Defined or Loaded

1. **Google Fonts stylesheet in `index.html` (lines 32–34)**:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,400&family=DotGothic16&family=Instrument+Serif:ital@0;1&family=Manrope:wght@400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
   ```
   - **`DM Sans`**: normal (`ital=0`) optical size `9..40`, variable weights `300..800`; italic (`ital=1`) optical size `9..40`, weight `400`.
   - **`DotGothic16`**: weight `400` (regular only).
   - **`Instrument Serif`**: normal (`ital=0`) weight `400`; italic (`ital=1`) weight `400`.
   - **`Manrope`**: weights `400`, `500`, `600`.
   - **`Syne`**: weights `700`, `800`.

2. **Tailwind Config & `@theme` tokens in `src/index.css` (lines 1, 48–67)**:
   - There is no standalone `tailwind.config.js`/`ts`; Tailwind v4 is loaded via `@import "tailwindcss";` on line 1 of `src/index.css`.
   - `@theme inline` (lines 48–50) defines:
     ```css
     @theme inline {
       --font-sans: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
     ```
   - `--font-mono` is not overridden in `@theme`, so `font-mono` uses Tailwind v4's built-in monospace stack.

3. **Global CSS rules & utility classes in `src/index.css`**:
   - **`body` (`src/index.css`, lines 71–78)**:
     ```css
     body {
       background-color: var(--bg);
       color: var(--text);
       font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
       font-weight: 400;
       overflow-x: hidden;
     }
     ```
   - **`div[data-theme]` (`src/index.css`, lines 81–85)**:
     ```css
     div[data-theme] {
       background-color: var(--bg);
       color: var(--text);
       font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
     }
     ```
     *(Note: `ThemeProvider` sets `data-theme` on `<html>` (`document.documentElement`), whereas only `ProjectorPage.tsx` line 759 renders a `<div data-theme={projectorTheme}>`.)*
   - **Custom font utility classes (`src/index.css`, lines 98–108)**:
     ```css
     .font-syne {
       font-family: 'Syne', sans-serif;
     }
     .font-dot {
       font-family: 'DotGothic16', monospace;
     }
     .font-serif-accent {
       font-family: 'Instrument Serif', Georgia, serif;
     }
     ```
   - **Global element & weight overrides outside `div[data-theme]` (`src/index.css`, lines 111–171)**:
     - **Lines 111–124** (forces `Manrope` on controls/tables outside `div[data-theme]`):
       ```css
       :where(:not(div[data-theme], div[data-theme] *)):is(
         button, input, select, textarea, label, th, td, [role="tab"], [role="radio"]
       ):not(.font-mono):not(.font-syne) {
         font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
         letter-spacing: normal;
       }
       ```
     - **Lines 127–144** (clamps `.font-bold`, `.font-extrabold`, `.font-semibold` to `font-weight: 500` on non-`h1`, non-`text-3xl..9xl` elements outside `div[data-theme]`):
       ```css
       :where(:not(div[data-theme], div[data-theme] *)):is(
         button:not(.bg-btn-bg), a:not(.bg-btn-bg), label, th, td, p, span, div, h3, h4
       ):not(h1):not(.text-3xl):not(.text-4xl):not(.text-5xl):not(.text-6xl):not(.text-7xl):not(.text-8xl):not(.text-9xl):is(
         .font-bold, .font-extrabold, .font-semibold
       ) {
         font-weight: 500;
       }
       ```
     - **Lines 147–151** (primary buttons/links `.bg-btn-bg`):
       ```css
       :where(:not(div[data-theme], div[data-theme] *)):is(button.bg-btn-bg, a.bg-btn-bg) {
         font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
         font-weight: 600;
         letter-spacing: 0.01em;
       }
       ```
     - **Lines 154–159** (replaces `.font-syne` with `Manrope` weight `500` on smaller `h3`/`h4` headings outside `div[data-theme]`):
       ```css
       :where(:not(div[data-theme], div[data-theme] *)):is(h3, h4).font-syne:not(.text-2xl):not(.text-3xl):not(.text-4xl) {
         font-family: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;
         font-weight: 500;
         letter-spacing: -0.01em;
         line-height: 1.35;
       }
       ```
     - **Lines 162–171** (forces `font-weight: 500` on small `.uppercase` labels/headers outside `div[data-theme]`):
       ```css
       :where(:not(div[data-theme], div[data-theme] *)).uppercase:is(
         .text-xs, .text-\[11px\], .text-\[10px\], .text-\[9px\], th
       ) {
         letter-spacing: 0.04em;
         font-weight: 500;
       }
       ```

---

## 2. Exact Classes on Requested Elements

1. **Sidebar wordmark `"Fieldr"` in the admin layout**:
   - Rendered by `<BrandMark size="sm" />` in `src/pages/admin/AdminLayout.tsx` (lines 76, 179), defined in `src/components/layout/BrandMark.tsx` (lines 52–58):
     ```tsx
     <span
       className={`font-syne font-extrabold tracking-tight text-text leading-none transition-colors ${
         isSmall ? 'text-sm' : 'text-[21px] group-hover:text-accent-bright'
       }`}
     >
       Fieldr
     </span>
     ```
   - **Font**: `Syne` (`.font-syne`). Because it is a `<span>` with `text-sm` (or `text-[21px]`) outside `div[data-theme]`, the global rule in `src/index.css` (lines 127–144) overrides `.font-extrabold` (`800`) to `font-weight: 500`.

2. **Main page titles**:
   - **`Admin Auction Room`** (`src/pages/admin/AdminAuction.tsx`, line 493):
     ```tsx
     <h1 className="font-syne font-extrabold text-2xl sm:text-3xl text-text tracking-tight">
       Auction Room
     </h1>
     ```
     → **`Syne`**, weight **`800`** (`<h1>` is excluded from the `font-weight: 500` clamp via `:not(h1)`).
   - **`Registered Players`** (`src/pages/admin/AdminPlayers.tsx`, line 582 via `<PageHeader title="Registered Players" />` in `src/components/ui/PageHeader.tsx`, line 35):
     ```tsx
     <h1 className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-text">
       {title}
     </h1>
     ```
     → **`Syne`**, weight **`800`**.
   - **`Activity Log`** (`src/pages/admin/AdminLogs.tsx`, lines 250–252):
     ```tsx
     <h1 className="font-sans font-bold text-3xl sm:text-4xl text-text tracking-tight">
       Activity Log
     </h1>
     ```
     → **`Manrope`** (`font-sans`), weight **`700`** (`font-bold` on `<h1>`; synthesized by browser since `Manrope` loads `400;500;600`).

3. **Public hamburger menu items (`Home`, `Teams`, `Season`, `Dashboard`, `Projector`, `Sign out`)**:
   - Defined in `src/components/layout/NavigationMenu.tsx`:
   - **`Home`, `Teams`, `Season`, `Dashboard`, `Projector` (lines 165–170)**:
     ```tsx
     <Link
       to={link.path}
       onClick={onClose}
       className="group flex items-center gap-4 text-4xl sm:text-6xl md:text-7xl font-sans font-medium tracking-tight leading-tight text-white/85 hover:text-white transition-colors transition-transform transform hover:translate-x-3"
     >
     ```
     → **`Manrope`** (`font-sans`), weight **`500`** (`font-medium`).
   - **`Sign out` (lines 192–197)**:
     ```tsx
     <button
       type="button"
       onClick={handleSignOut}
       className="group flex items-center gap-3 text-2xl sm:text-3xl font-sans font-normal text-white/60 hover:text-error transition-colors transition-transform transform hover:translate-x-2"
     >
     ```
     → **`Manrope`** (`font-sans`), weight **`400`** (`font-normal`).

4. **Public home page hero title (`DRAFT.`, `BID.`, `WIN.`)**:
   - Defined in `src/pages/public/HomePage.tsx` (lines 175–192):
     ```tsx
     <motion.h1
       className={`font-syne font-extrabold text-6xl sm:text-8xl md:text-9xl lg:text-[10.5rem] tracking-tighter leading-[0.88] ...`}
     >
       {line}
     </motion.h1>
     ```
     → **`Syne`** (`.font-syne`), weight **`800`** (`font-extrabold`).

5. **Projector page title**:
   - **Public/Display Projector route (`/projector`, `src/pages/public/ProjectorPage.tsx`, lines 821–826)**:
     ```tsx
     <h1
       className="font-syne font-extrabold text-5xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tight leading-[1.02] text-text"
       style={{ textWrap: 'balance' }}
     >
       {activeSeason?.name || 'Annual Sports Tournament'}
     </h1>
     ```
     → **`Syne`** (`.font-syne`), weight **`800`** (`font-extrabold`). (Other scene headings in `ProjectorPage.tsx`—such as `Franchise Purses` on line 1299 and player/team `<h2>`s on lines 205, 900, 1154, 1249—also use `font-syne font-extrabold`.)
   - **Admin Projector tab (`Projector Command Studio`, `src/pages/admin/AdminProjectorControl.tsx`, lines 450–453)**:
     Uses `<PageHeader title="Projector Command Studio" />` (`src/components/ui/PageHeader.tsx`, line 35):
     `className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-text"` → **`Syne`**, weight **`800`**.

---

## 3. Dialogs, Toasts, Dropdown Menus, and Portal Placement

- **Portal Usage**: `createPortal` is **not used anywhere** in the codebase (`0` occurrences). All overlays, modals, toasts, and menus render **inside the React app root (`#root`)**.
- **Dialogs (`src/components/ui/Dialog.tsx`, lines 61–112)**:
  - Rendered inline where mounted in the component tree (inside `#root`, and inside `AdminLayout`'s `<div className="min-h-screen bg-bg text-text flex font-sans">` when used in Admin).
  - Inherits **`Manrope`** (`--font-sans` / `body`).
  - Title (`<h3>`, line 83): `className="text-lg font-medium text-text tracking-tight leading-snug"` → **`Manrope`**, weight **`500`**.
  - Description (`<p>`, line 91): `className="text-xs font-normal text-muted mt-1 leading-relaxed"` → **`Manrope`**, weight **`400`**.
  - Body (`<div className="p-6">`, line 102): inherits **`Manrope`**, weight **`400`**.
- **Toasts (`src/lib/ToastContext.tsx`, lines 46–62 & `src/components/ui/Toast.tsx`, line 28)**:
  - Rendered inside `<ToastProvider>` inside `#root` (`src/App.tsx`, line 52) as a sibling to `<Routes>`.
  - `ToastItem` (`src/components/ui/Toast.tsx`, line 28) sets:
    ```tsx
    className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface text-text shadow-xl text-xs font-mono tracking-wide max-w-sm transition-all"
    ```
  - Inherits/uses Tailwind's **`font-mono`** (`ui-monospace, SFMono-Regular, ...`), weight **`400`**.
- **Dropdown menus**:
  - There are no custom portal dropdown menu components; all dropdowns are native `<select>` elements (e.g. `AdminLayout.tsx` line 106, `AdminLogs.tsx` line 320, `AdminPlayers.tsx`, `AdminTeams.tsx`) plus the fullscreen `<NavigationMenu>` overlay (`src/components/layout/NavigationMenu.tsx`, rendered inline inside each public page inside `#root`).
  - All `<select>` elements outside `div[data-theme]` match `:where(:not(div[data-theme], div[data-theme] *)):is(..., select, ...):not(.font-mono):not(.font-syne)` in `src/index.css` (lines 111–124) and use **`Manrope`**.

---

## 4. Files and Classes That Change Fonts of Both Admin and Public Pages Simultaneously

1. **`index.html` (line 34)**:
   - Loads the Google Fonts (`DM Sans`, `DotGothic16`, `Instrument Serif`, `Manrope`, `Syne`) for the entire document.
2. **`src/index.css`**:
   - **Line 49 (`@theme inline`)**: `--font-sans: 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif;` — redefines Tailwind's `font-sans` utility across both admin and public pages.
   - **Lines 71–78 (`body`)**: Sets `font-family: 'Manrope', ...; font-weight: 400;` on `<body>`. Since public pages (`HomePage`, `TeamsPage`, `SeasonPage`, etc.) do not put `data-theme` on a `<div>` (`ThemeProvider` in `src/lib/theme.tsx` line 94 puts `data-theme` on `<html>` / `document.documentElement`), both public pages and admin pages inherit `Manrope` from `<body>` and obey all `:where(:not(div[data-theme], div[data-theme] *))` rules! (Only `/projector` in `src/pages/public/ProjectorPage.tsx` line 759 puts `data-theme` on a `<div>`, which triggers `div[data-theme] { font-family: 'DM Sans', ... }`).
   - **Lines 98–108 (`.font-syne`, `.font-dot`, `.font-serif-accent`)**: Shared font-family classes used across both public and admin views.
   - **Lines 111–171 (`:where(:not(div[data-theme], div[data-theme] *))...` rules)**: Because `data-theme` is on `<html>` rather than a `<div>` for both Admin and Public pages, all 5 global override blocks in `src/index.css` apply to **both** Admin pages and Public pages simultaneously:
     - Forcing `Manrope` on `button, input, select, textarea, label, th, td, [role="tab"], [role="radio"]` (lines 111–124).
     - Clamping `.font-bold, .font-extrabold, .font-semibold` to `font-weight: 500` on `button, a, label, th, td, p, span, div, h3, h4` that are not `h1` or `text-3xl..9xl` (lines 127–144).
     - Forcing `Manrope` weight `600` on `.bg-btn-bg` buttons/links (lines 147–151).
     - Replacing `.font-syne` with `Manrope` weight `500` on `h3, h4` without `text-2xl..4xl` (lines 154–159).
     - Forcing `font-weight: 500` on small `.uppercase` elements (lines 162–171).
3. **Shared UI & Layout Components**:
   - **`src/components/layout/BrandMark.tsx` (lines 41, 53, 60)**: Used in both public `HeaderBar`/`SiteFooter`/`ProjectorPage` and `AdminLayout` sidebar/mobile header (`font-syne font-extrabold` on `"F"` and `"Fieldr"`).
   - **`src/components/ui/PageHeader.tsx` (lines 30, 35, 39)**: Used across admin pages and shared views (`font-mono` eyebrow, `font-syne font-extrabold` `<h1>`, inherited `Manrope` subtitle).
   - **`src/components/ui/Button.tsx` (line 58)**: Applies `font-sans` (`Manrope`) and variant weights (`font-semibold` / `font-medium`) everywhere `<Button>` is used.
   - **`src/components/ui/SegmentedControl.tsx` (lines 68, 79)**: Applies `font-sans` on tabs and `font-mono` on badges.
   - **`src/components/ui/Dialog.tsx` & `src/components/ui/Toast.tsx`**: Shared modal and toast components rendered across all routes.
