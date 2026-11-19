# Overlay & Frosted Surface Audit Report

## Overlay Inventory

| Component and file path | Type | Where it appears | Current background style | Frost candidate |
| --- | --- | --- | --- | --- |
| `HeaderBar` (`src/components/layout/HeaderBar.tsx`) | Sticky bar | All public pages (`Home`, `Teams`, `Rosters`, `RosterSport`, `Rules`, `Content`, `PlayerProfile`, `SeasonTeamDetail`) | Transparent at top; scrolled backdrop layer uses `color-mix(in srgb, var(--bg) 65%, transparent)` with `backdrop-filter: blur(14px) saturate(140%)` (92% fallback without blur) | **Yes** — Already uses the canonical frosted surface style. |
| `NavigationMenu` (`src/components/layout/NavigationMenu.tsx`) | Bottom sheet (mobile) / Drawer (desktop) + Backdrop | All public pages via header trigger | Panel uses `color-mix(in srgb, var(--bg) 65%, transparent)` + `backdrop-filter: blur(14px) saturate(140%)`; backdrop uses `bg-black/25 dark:bg-black/45` (no blur) | **Yes** — Already uses the canonical frosted surface style. |
| `AppToaster` (`src/components/ui/Toast.tsx`, mounted in `src/App.tsx`) | Toast | Global across public, owner, and admin pages (unmounted on `/projector`) | Solid (`!bg-surface`, `!border-border`, `!shadow-xl`, no blur) | **Yes** — Short-lived notification pill with minimal text and clear accent left border. |
| `RosterScoutModal` (`src/components/roster/RosterScoutModal.tsx`) | Modal + Backdrop | Public `RosterSportPage` (clicking an athlete card) | Solid card (`bg-surface border-border`), solid photo badges (`bg-black/75`, `bg-black/60`), translucent backdrop (`bg-scrim`, `rgba(0,0,0,0.6)`, no blur) | **Yes** — Compact public-facing athlete preview card where frosted surface matches the public shell. |
| Owner photo lightbox (`src/pages/public/SeasonTeamDetailPage.tsx`) | Full-screen overlay / Modal | Public & owner `SeasonTeamDetailPage` (clicking franchise owner portrait) | Translucent dark backdrop (`bg-black/80`, no blur) framing raw `<img>` | **No** — Photo lightbox needs an unobstructed dark scrim for image contrast rather than frosted glass. |
| `HomeBackdrop` (`src/components/home/HomeBackdrop.tsx`) | Full-screen backdrop (decorative) | Public `HomePage` | Transparent SVG contour/radial glow layer (`fixed inset-0`, no blur) | **No** — Non-interactive decorative background layer behind page content. |
| `AdminLayout` mobile top header (`src/pages/admin/AdminLayout.tsx`) | Sticky bar | All `/admin` pages on mobile (`< 768px`) | Solid (`bg-surface border-b border-border`, no blur) | **Yes** — Top navigation chrome identical in role to the public sticky header. |
| `AdminLayout` mobile slide-in drawer (`src/pages/admin/AdminLayout.tsx`) | Drawer + Backdrop | All `/admin` pages on mobile (`< 768px`) | Solid drawer (`bg-surface border-r border-border`), translucent backdrop (`bg-scrim`, no blur) | **Yes** — Mobile navigation drawer with simple link list and season selector, safe to frost. |
| `AdminLayout` floating Confetti button & error alert (`src/pages/admin/AdminLayout.tsx`) | Floating button + Floating alert | Fixed top-right across all `/admin` pages | Button uses `Button` secondary variant (solid `bg-surface-2`); error pill uses solid `bg-menu-bg border-error/60` (no blur) | **Yes** — Small floating trigger over scrolling admin content; keep error alert high-contrast. |
| `Dialog` — non-destructive forms/views (`src/components/ui/Dialog.tsx`, used in `AdminPlayers`, `AdminPurses`, `AdminSetup`, `AdminSeasons`, `AdminTeams`, `BulkRegisterPanel`, `CreditsSetupCard`) | Dialog / Modal + Backdrop | Admin forms, CSV import/export, owner login credentials, purse adjustment/history, credit/ticker editors, bulk registration summary | Solid surface (`bg-surface border-border shadow-2xl`), translucent backdrop (`bg-scrim`, no blur) | **Careful** — Dense multi-field admin forms, tables, and monospace numeric inputs risk reduced legibility over busy dashboards. |
| `Dialog` — destructive & live-auction confirmations (`src/components/ui/Dialog.tsx`, used in `AdminAuction`, `AdminProjectorControl`, `AdminPlayers`, `AdminAthletes`, `AdminTeams`, `AdminSeasons`, `AdminPurses`, `CreditsSetupCard`, `RulesSetupCard`, `HandbookSetupCard`) | Dialog / Modal + Backdrop | Live auction (Confirm Sale, Mark Unsold, Undo Last Sale, Clear Queue), Projector stage guard, Delete Athlete/Team/Season/Player/Credit/Rule/Handbook, Reset All Purses | Solid surface (`bg-surface border-border shadow-2xl`), translucent backdrop (`bg-scrim`, no blur) | **No** — Destructive and live-auction confirmations must stay solid for maximum clarity and zero misclicks. |
| `BulkRegisterPanel` (`src/components/admin/BulkRegisterPanel.tsx`) | Drawer + Backdrop | Admin `AdminPlayers` / `AdminAthletes` bulk registration flow | Solid drawer (`bg-surface border-l border-border shadow-2xl`), translucent backdrop (`bg-scrim`, no blur) | **Careful** — Contains dense multi-select athlete checklists and form inputs where solid contrast protects readability. |
| Register / Edit Player side drawer (`src/pages/admin/AdminPlayers.tsx`) | Drawer + Backdrop | Admin Players tab (`Register Player` / `Edit Player Entry`) | Solid drawer (`bg-surface border-l border-border shadow-2xl`), translucent backdrop (`bg-scrim`, no blur) | **Careful** — Dense multi-step form with searchable picker and numeric inputs; frosting can reduce contrast. |
| New / Edit Athlete side drawer (`src/pages/admin/AdminAthletes.tsx`) | Drawer + Backdrop | Admin Athletes tab (`New Athlete` / `Edit Athlete`) | Solid drawer (`bg-surface border-l border-border shadow-2xl`), translucent backdrop (`bg-scrim`, no blur) | **Careful** — Dense form with photo upload and identity fields; frosting risks legibility loss over underlying table. |
| Sticky table headers (`src/pages/admin/AdminLogs.tsx`, `src/pages/admin/AdminTeams.tsx`) | Sticky bar (`<thead>`) | Admin Logs tables and Admin Teams CSV import preview table | Solid (`bg-surface-2 border-b border-border`, no blur) | **No** — Table headers over scrolling data rows must remain opaque so row text does not bleed through. |
| Secured Sequence full-screen preview & top controls bar (`src/pages/admin/AdminSetup.tsx`) | Full-screen overlay + Floating controls bar | Admin Setup page ("Preview Secured Animation") | Full-screen container is solid (`bg-bg`); top controls bar is translucent with blur (`bg-surface/90 backdrop-blur-md border-border`) | **No** — Full-screen projector simulation must stay opaque; its top preview bar is **Careful** (already lightly blurred at 90% opacity over animated stage). |
| Auto-hiding top-right controls (`src/pages/public/ProjectorPage.tsx`) | Floating buttons (Theme + Fullscreen) | `/projector` auditorium display | Translucent with blur (`bg-surface/90 backdrop-blur-md border-border shadow-md`) | **No** — Projector display chrome should stay crisp and avoid heavy low-opacity frost on large screens. |
| Stage photo corner badges (`src/pages/public/ProjectorPage.tsx`) | Overlay badges (Status, Code, Sport) | `/projector` player spotlight and auction stage cards | Translucent with blur (`bg-surface/90 backdrop-blur-md` and `bg-bg/90 backdrop-blur-md border-border`) | **No** — Auditorium projector display overlays must stay high-contrast and crisp at distance. |
| Bid-change color flash (`src/pages/public/ProjectorPage.tsx`) | Full-screen overlay | `/projector` live auction bid/team change | Radial team-color gradient (`opacity: 0.42 -> 0`, no blur) | **No** — Transient projector stage effect, not a UI surface. |
| `SecuredSequence` ambient glow / flash / sweep layers (`src/components/projector/SecuredSequence.tsx`) | Full-screen overlay | `/projector` sold sequence and `AdminSetup` preview | Gradient/tint overlays (`pointer-events-none`, no blur) | **No** — Projector celebration animation layers. |
| `ProjectorConfetti` (`src/components/projector/ProjectorConfetti.tsx`) | Full-screen overlay (canvas) | `/projector` when confetti is triggered | Transparent full-screen `<canvas>` (`pointer-events-none`) | **No** — Full-screen particle canvas on projector display. |

---

## Exact Public Header & Public Menu Frosted Surface Style

Both `src/components/layout/HeaderBar.tsx` (`.public-site-header__backdrop`) and `src/components/layout/NavigationMenu.tsx` (`.public-navigation-sheet`) define identical inline `<style>` rules:

- **Default / `@supports` frosted background & blur**:
  - `background-color: color-mix(in srgb, var(--bg) 65%, transparent);` (`--bg` is `#F4F5F1` in light mode, `#0B0B0B` in dark mode)
  - `backdrop-filter: blur(14px) saturate(140%);`
  - `-webkit-backdrop-filter: blur(14px) saturate(140%);`
- **Fallback (no `backdrop-filter` support or `@media (prefers-reduced-transparency: reduce)`)**:
  - `background-color: color-mix(in srgb, var(--bg) 92%, transparent);`
  - `backdrop-filter: none;`
  - `-webkit-backdrop-filter: none;`
- **Hairline border**:
  - Header: `border-b border-border/60` (`--border` is `#D5D9D0` in light mode, `rgba(240, 242, 238, 0.10)` in dark mode)
  - Menu panel: `border border-border/60 lg:border-y-0 lg:border-l-0 lg:border-r lg:border-border/60`
- **Dimmed backdrop behind menu**:
  - `bg-black/25 dark:bg-black/45` (no blur)

---

## Shared Frosted Utility or Component

- **None exists.** The frosted CSS is duplicated verbatim inside inline `<style>` tags in `HeaderBar.tsx` and `NavigationMenu.tsx`, while `ProjectorPage.tsx` and `AdminSetup.tsx` independently use inline Tailwind `bg-surface/90 backdrop-blur-md` / `bg-bg/90 backdrop-blur-md`. Nothing is defined in `src/index.css` or a shared component.

---

## Z-Index Scale & Page Scroll-Lock Inconsistencies

### Z-Index Scale Discrepancies

- `z-0`: `HomeBackdrop`, `ProjectorPage` bid flash, `SecuredSequence` glow/backdrop layers
- `z-10` / none: `AdminLogs` sticky `<thead>` (`z-10`) vs `AdminTeams` CSV preview sticky `<thead>` (no `z-*` class)
- `z-20`: `SecuredSequence` flash/sweep layers
- `z-30`: `AdminLayout` mobile sticky top bar (`z-30`); `AdminSetup` preview controls bar (`relative z-30` inside a `z-50` overlay)
- `z-40`: `HeaderBar` sticky header, `AdminLayout` floating Confetti button (`z-40` — sits above mobile `z-30` admin header)
- `z-50`: `NavigationMenu`, `Dialog`, `RosterScoutModal`, `BulkRegisterPanel`, `AdminPlayers` drawer, `AdminAthletes` drawer, `AdminLayout` mobile drawer, `AdminSetup` Secured preview, `SeasonTeamDetailPage` owner photo lightbox, `ProjectorPage` auto-hiding controls
- `z-[9999]`: `ProjectorConfetti` canvas
- Sonner default (`999999999`): `AppToaster` (unconfigured `z-index`, always sits above `z-50` modals/drawers)

### Page Scroll-Lock Inconsistencies

- **Ref-counted with route-change cleanup**: `NavigationMenu.tsx` uses a module-level lock counter (`activeBodyScrollLocks`), avoids saving `'hidden'` as the prior overflow, and unlocks on close/unmount/route change.
- **Naive save/restore with unstable effect dependencies**: `Dialog.tsx` and `RosterScoutModal.tsx` save `document.body.style.overflow` locally and restore it on cleanup with `[isOpen, onClose]` / `[player, onClose]`. Inline `onClose` callbacks re-run the effect on parent re-renders, and opening a `Dialog` while another scroll-locking overlay is open (e.g., `BulkRegisterPanel` or `AdminLayout` mobile drawer) can save `'hidden'` and leave scroll locked.
- **Unconditional reset to `''`**: `AdminLayout.tsx` mobile drawer sets `document.body.style.overflow = 'hidden'` and unconditionally resets it to `''` on cleanup, clobbering any active lock from another overlay.
- **No scroll lock at all**: `BulkRegisterPanel.tsx`, `AdminPlayers.tsx` side drawer, `AdminAthletes.tsx` side drawer, `AdminSetup.tsx` Secured Sequence full-screen preview, and `SeasonTeamDetailPage.tsx` owner photo lightbox never lock `document.body.style.overflow` (background page remains scrollable behind them).
