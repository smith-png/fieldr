# Fieldr Public Visual Style Proposal

## Audit Summary & Guardrails

Across the nine public views (`Home` below the hero, `Teams`, `Team detail`, `Rosters`, `Roster sport`, `Player profile`, `Results`, `Reels`, and `Rules`), the current public UI is clean and fast, but visually uniform:

- **Boxes inside boxes:** Nearly every section uses `PUBLIC_CARD` (`rounded-3xl bg-surface border border-border`) wrapping `PUBLIC_WELL` (`rounded-2xl bg-bg border border-border`) or nested `RosterPlayerCard` containers (most noticeable on `SeasonTeamDetailPage`, `PlayerProfilePage`, `ReelsPage`, and `RulesPage`).
- **Identical section headers and metadata pills:** Every page header and subsection divider shares the same single `border-b border-border` rule with right-aligned `PUBLIC_COUNT_PILL` capsules, giving analytical pages (`Results`), narrative pages (`Reels`, `Rules`), and directory pages (`Teams`, `Rosters`) the same flat cadence.
- **Minimal tactile feedback:** Interactive cards mostly swap `border-color` on hover with little sense of physical response, and empty states vary in polish across pages (`TeamsPage`, `RosterSportPage`, `SeasonTeamDetailPage`, `ResultsPage`, `PlayerProfilePage`, and `RulesPage` each render ad-hoc placeholders).
- **Strong existing anchors to harmonize with (untouched):** The redesigned Home hero (`HeroWord` hollow Syne outline filling with sage + `HeroBalls`), the contained rounded recessed `TickerStrip` rail, the daylight/dark-studio `SportArt` illustrations, and team-color `color-mix` tinting.

### Non-Negotiable Constraints Across All 3 Directions
- **Tokens only:** All colors derive exclusively from existing CSS variables (`--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--border`, `--accent`, `--accent-bright`, `--points`, `--error`, `--btn-bg`, `--btn-fg`, `--on-accent`, `--scrim`) and `color-mix(in srgb, ...)`. Zero new hardcoded hex values in components; full `data-theme="dark"` and light-mode parity.
- **Typography:** Uses only fonts already loaded in `index.html` (`Syne` at `var(--syne-title)` 600 and `var(--syne-sub)` 500, `DM Sans`, `DotGothic16`, and system monospace with `tabular-nums`). `Instrument Serif` is not loaded in `index.html`, and no new fonts are added. `Syne 800` remains strictly reserved for the hero, wordmarks, and Projector.
- **Icons & copy:** Phosphor icons only; zero emoji anywhere.
- **Performance & safety:** Zero new dependencies, zero images/videos/SVG filters, compositor-only animation (`transform`, `opacity`), full `prefers-reduced-motion` support, `>= 44px` tap targets, `0` CLS, no new queries or realtime channels. Untouched: `HeroWord`, `HeroBalls`, `HeaderBar`, `BrandMark`, `FooterMark`, `ProjectorPage`, `SecuredSequence`, `src/lib/data/*`, `supabase/*`, auth/bidding/season logic, and admin pages.

---

## Direction 1 — Court Monograph (Swiss Editorial Broadsheet)

### Concept & Mood
Court Monograph reimagines Fieldr's public pages as a printed Olympic programme book and architectural sports monograph. Rather than floating every list and stat block inside bubbly `rounded-3xl` boxes-within-boxes, it opens the canvas up with disciplined hairline grids, tighter architectural corners, numbered editorial section folios (`01`, `02`, `03`), and clean unboxed typographic metadata separated by `/` and `·` colophons. The quiet, museum-grade restraint lets the existing `HeroWord`, `SportArt` scenes, team colors, athlete portraits, and amber `points` figures carry all the emotional weight without visual clutter.

### Files Touched
- `src/index.css` (editorial surface, hairline divider, folio rule, and subtle motion utility classes)
- `src/components/public/publicStyles.ts` (tighter radius scale, unboxed metadata tokens, hairline headers, editorial button press states)
- `src/components/home/SportCardsGrid.tsx` (editorial folio header + quiet bottom hairline reveal)
- `src/pages/public/TeamsPage.tsx` (folio sport sections, sleeker team cards, upgraded empty state)
- `src/pages/public/SeasonTeamDetailPage.tsx` (remove card-inside-card nesting on public Squad Roster role groups; flat editorial header band)
- `src/pages/public/RostersPage.tsx` (editorial header, architectural sport cards)
- `src/pages/public/RosterSportPage.tsx` (streamlined hairline filter strip instead of heavy outer filter box, upgraded empty state)
- `src/components/roster/RosterPlayerCard.tsx` (crisp monograph card proportions, unboxed secondary sport labels, tactile hover/press)
- `src/components/roster/RosterScoutModal.tsx` (aligned corner scale and unboxed stat grid dividers)
- `src/pages/public/PlayerProfilePage.tsx` (hairline career ledger rows instead of nested cards, editorial profile band)
- `src/pages/public/ResultsPage.tsx` (broadsheet 3-column summary strip separated by vertical hairlines, flat hairline-divided auction feed rows, cleaner analytics cards)
- `src/pages/public/ReelsPage.tsx` (monograph chapter sections with hairline key-dates/prizes/FAQ rows instead of nested wells)
- `src/pages/public/RulesPage.tsx` (clean document index table/list with hairline rows and crisp action buttons)
- `src/components/ui/EmptyState.tsx` (refined editorial empty plaque with thin solid frame and sage corner accent tick)

### What It Changes
- **Surfaces:** Eliminates nested `PUBLIC_WELL`-inside-`PUBLIC_CARD` layering on `SeasonTeamDetailPage`, `PlayerProfilePage`, `ReelsPage`, `RulesPage`, and `ResultsPage`. Primary content rests directly on `--bg` or a single-elevation `--surface` sheet with generous whitespace, keeping container contrast calm.
- **Borders:** Steps the public radius scale down from `rounded-3xl` to a disciplined architectural `rounded-xl` / `rounded-2xl` system with crisp `1px solid var(--border)` hairlines. Team-tinted cards (`TeamsPage`, `SeasonTeamDetailPage`, `RosterPlayerCard`, `ResultsPage`) retain their `color-mix` border tint at a crisper `1px` weight with a subtle top-edge `2px` hairline accent strip (`border-t-2`) in `--team-color` or `--accent-bright` (strictly top edge, never thick left callout bars).
- **Section dividers:** Replaces plain `border-b border-border` lines with a signature **double-weight editorial rule**: a full-width `1px` `var(--border)` line anchored on the left by a `32px` `2px`-tall `var(--accent-bright)` registration tick via `::after` (zero extra DOM nodes).
- **Section headers:** Adds quiet monospace folio indices (`01`, `02`, `03` in `text-muted tabular-nums`) before major section titles (`Explore`, `Teams` sport groups, `Results` analytics, `Reels` chapters) and flattens static `PUBLIC_COUNT_PILL` capsules into clean inline metadata (`Season Name · 12 teams · 96 players`) while keeping interactive filter buttons clearly clickable.
- **Card treatments:** `SportCardsGrid` and `RostersPage` cards gain tighter frame proportions and unboxed index labels (`01` set clean without pill capsule clutter). `ResultsPage` summary metrics become a unified 3-column horizontal ledger split by crisp vertical hairlines instead of three boxy cards; feed rows become sleek horizontal ledger entries with strong amber `points` right-alignment. `RulesPage` documents read like an official publication index with numbered rows (`01`, `02`).
- **Hover & press states:** Interactive cards and ledger rows use a fast `160ms cubic-bezier(0.16, 1, 0.3, 1)` compositor response: subtle `translateY(-2px)` lift on cards (or subtle background tint shift on flat ledger rows), arrow/caret `translateX(3px)` nudge, and a crisp `active:scale-[0.985]` press settle.
- **Scroll & entrance motion:** Lightweight CSS-only fade-rise (`opacity: 0 -> 1`, `translateY(8px -> 0)`, `260ms`) on page `<main>` headers and a single shared one-time `IntersectionObserver` reveal (reusing the pattern already in `SportArt.tsx`) for below-the-fold sections (`ResultsPage` analytics, `TeamsPage` sport groups, `ReelsPage` chapters). Disabled cleanly under `prefers-reduced-motion: reduce`.
- **Empty states:** Unified editorial plaque across `EmptyState.tsx`, `TeamsPage`, `RosterSportPage`, `SeasonTeamDetailPage`, `PlayerProfilePage`, `ResultsPage`, and `RulesPage`—solid hairline frame, subtle sage horizontal rule above the title, Phosphor icon in a clean square architectural frame, and crisp copy with clear next action.

### Cost & Performance Estimate
- **Files touched:** 14 files (1 CSS file, 1 style constants file, 12 public pages/components).
- **New CSS:** ~95 lines in `src/index.css` (~2.1 KB raw / ~0.7 KB gzipped).
- **Bundle & mobile performance:** Net neutral-to-negative JS diff (removing redundant nested wrappers and inline `<style>` blocks in `TeamsPage`/`SeasonTeamDetailPage` into `src/index.css`). Zero new packages, zero layout shifts (`CLS = 0`), compositor-only hover/entrance transitions. Expected Mobile PageSpeed impact: **0 ms regression** (stays well above 90).

### Light Mode vs. Dark Mode
- **Light mode (`:root`):** Reads like fine archival paper (`#F4F5F1`) and crisp white broadsheet plates (`#FFFFFF`) ruled with warm sage-grey ink hairlines (`#D5D9D0`), forest sage registration ticks (`#047554`), and deep antique amber (`#8A5A00`) bid figures. Unboxed typography makes daylight browsing noticeably airier and sharper.
- **Dark mode (`[data-theme="dark"]`):** Reads like a nocturnal museum catalog on matte obsidian (`#0B0B0B`) and charcoal plates (`#121412`), with `10%` crisp hairline dividers, subtle emerald registration ticks (`#047554`), and luminous gold (`#C88B0F`) auction values that stay legible without glare.

---

## Direction 2 — Milled Field (Tactile Recessed Surfaces Echoing the Ticker Rail)

### Concept & Mood
Milled Field builds a cohesive physical language directly out of Fieldr's newly refined `TickerStrip` rail—extending its faint sage tint, concentric inset rim, and quiet recessed depth across every public view. Surfaces feel like precision-milled scorecards and pressed stationery rather than generic flat web cards: primary containers sit cleanly elevated with a whisper-thin top sheen and soft sage-tinted rim, while secondary trays (filters, metric wells, FAQ drawers, PDF rule rows, empty states) are subtly *carved* into the canvas as recessed grooves. The result feels unmistakably bespoke to Fieldr—calm, tactile, and materially grounded from top to bottom.

### Files Touched
- `src/index.css` (shared tactile surface classes: `.pub-plate`, `.pub-plate-interactive`, `.pub-groove`, `.pub-rim-frame`, `.pub-divider-etched`, and press/reveal animations)
- `src/components/public/publicStyles.ts` (maps `PUBLIC_CARD`, `PUBLIC_WELL`, `PUBLIC_PILL_BAR`, `PUBLIC_INPUT`, `PUBLIC_BTN_PRIMARY/SECONDARY` to the milled surface tokens)
- `src/components/home/SportCardsGrid.tsx` (matching sage-rimmed inner hairline on sport cards + etched Explore header)
- `src/pages/public/TeamsPage.tsx` (milled team cards with concentric inner hairline tinted by `--team-color`, recessed owner strip, etched empty plaque)
- `src/pages/public/SeasonTeamDetailPage.tsx` (milled team banner plaque with concentric inner frame, recessed squad role headers, cleaner squad cards)
- `src/pages/public/RostersPage.tsx` (milled sport frames matching the TickerStrip rim language)
- `src/pages/public/RosterSportPage.tsx` (recessed filter channel tray for Year & Role selectors matching the ticker groove, milled empty plaque)
- `src/components/roster/RosterPlayerCard.tsx` (tactile scorecard plate with recessed photo well, subtle inner edge highlight, and crisp press detents)
- `src/components/roster/RosterScoutModal.tsx` (machined inner hairline frame on modal and carved metadata wells)
- `src/pages/public/PlayerProfilePage.tsx` (milled athlete dossier plate + carved career timeline wells)
- `src/pages/public/ResultsPage.tsx` (carved 3-tile scoreboard counters with subtle sage top bevel, recessed progress channels, tactile sold-feed rows, milled analytics plates)
- `src/pages/public/ReelsPage.tsx` (carved theme plaque with concentric rim, recessed accordion FAQ & prize channels)
- `src/pages/public/RulesPage.tsx` (milled publication binder card with recessed document slots)
- `src/components/ui/EmptyState.tsx` (recessed groove empty plaque echoing the ticker channel)

### What It Changes
- **Surfaces:** Introduces a clear two-tier material hierarchy using pure CSS `color-mix` and subtle `inset` box-shadows (no outer glow, no heavy drop shadows):
  1. **Milled Plates (`.pub-plate`):** `var(--surface)` lightly warmed with `2–3%` sage (`color-mix`), a quiet `1px` top highlight edge, and soft ground contact—used for primary containers and cards.
  2. **Recessed Grooves (`.pub-groove`):** Mirrors `.ticker-strip-surface` with a faint inward top shadow and soft bottom rim highlight—used for filter bars (`RosterSportPage`, `ResultsPage`), metric trays, progress tracks, FAQ items (`ReelsPage`), and empty states.
- **Borders:** Outer `1px` borders subtly blended with sage (`color-mix(in srgb, var(--accent-bright) 18%, var(--border))` on hero/featured plates, or `var(--team-color)` on franchise cards). Featured plaques (`SeasonTeamDetailPage` header, `PlayerProfilePage` header, `ReelsPage` theme callout, `ResultsPage` total-spent card) carry a quiet concentric `inset: 3px` `1px` inner hairline (`::before`), directly echoing the rounded `TickerStrip` rail.
- **Section dividers:** Subtle **etched groove dividers** (`.pub-divider-etched`: `1px` hairline paired with a `1px` soft highlight beneath it via `box-shadow`, reading like a pressed crease in card stock or dark anodized metal).
- **Section headers:** Calm `Syne` 600/500 headings paired with a quiet recessed counter readout (subtle carved pill/chip using `.pub-groove` styling rather than flat `surface-2`) and a small sage square/dash index mark on primary headers (`Explore`, `Registered Teams`, `Results`, `Auction stats`).
- **Card treatments:** `RosterPlayerCard`, `TeamsPage` cards, and `ResultsPage` rows feel like physical player/franchise plates—thumbnails sit inside a slightly recessed `rounded-xl` socket (`inset` top edge), while team-color cards tint both the outer rim and a faint `3–4%` surface wash cleanly in both themes.
- **Hover & press states:** Tactile hardware feedback (`150ms cubic-bezier(0.22, 1, 0.36, 1)`): hover lifts the plate `translateY(-2px)` and sharpens the sage/team border; active press depresses cleanly (`translateY(0) scale(0.985)`) with a slightly deeper inset top bevel so tapping on mobile feels physical.
- **Scroll & entrance motion:** Gentle compositor-only rise-and-settle (`opacity` + `translateY(10px -> 0)`, `320ms`) on page mount and card groups, staggered subtly (`40ms` steps capped at 5 items so long lists stay instant). Fully disabled when `prefers-reduced-motion: reduce` is active.
- **Empty states:** Centered recessed groove plaque with a concentric `3px` inner hairline, muted Phosphor icon seated inside a small circular machined socket, calm `Syne` 500 heading, and high-contrast primary action.

### Cost & Performance Estimate
- **Files touched:** 14 files (same targeted public surface as Direction 1).
- **New CSS:** ~130 lines in `src/index.css` (~2.9 KB raw / ~0.9 KB gzipped), using simple `inset` box-shadows (no blur filters, no `backdrop-filter` additions).
- **Bundle & mobile performance:** Zero new dependencies, zero extra DOM elements (concentric rims use `::before`), zero CLS. `inset` box-shadows are painted once on static layers and never animated—only `transform` and `opacity` animate on hover/enter. Expected Mobile PageSpeed impact: **0 ms regression** (stays >= 90).

### Light Mode vs. Dark Mode
- **Light mode (`:root`):** Feels like thick cotton paper stock and sage-rimmed matchday cards in crisp daylight—pale `2%` sage-tinted white plates (`--surface`), gentle cool top-inner shadows inside recessed trays, and soft bright lower bevels that create natural depth without ever looking grey or muddy.
- **Dark mode (`[data-theme="dark"]`):** Feels like precision-machined dark slate (`#121412`) on obsidian (`#0B0B0B`)—deeper recessed shadows (`rgba(0,0,0,0.55)`) inside grooves, whisper-faint `rgba(240,242,238,0.06)` lower rim highlights, and understated emerald inner hairlines (`#047554`) that match the dark-mode `TickerStrip` seamlessly.

---

## Direction 3 — Draft Dossier & Corner Marks (Live Auction Scouting Desk)

### Concept & Mood
Draft Dossier leans directly into Fieldr's unique identity as a **live sports player auction house**, turning the public side into a sharp, numbered scouting dossier and auction lot book. Its signature motif is architectural **corner registration marks** (rendered purely with CSS `linear-gradient` backgrounds—no extra markup or SVGs) framing key headers, featured totals, athlete cards, and empty plaques, paired with quiet dot-matrix (`DotGothic16`) or monospace lot stamps (`LOT // CRICKET`, `#042`, `STATISTICS`) and vertical hairline timeline spines on career and progress views. It feels distinctly athletic and curated—like an official auction catalog designed by an independent sports studio.

### Files Touched
- `src/index.css` (CSS-only `.pub-corner-ticks` registration bracket utility, `.pub-dossier-header`, `.pub-timeline-spine`, underline tab indicators, and staggered entrance keyframes)
- `src/components/public/publicStyles.ts` (dossier header layout, crisp underline-accented filter/back controls, sharp card geometry)
- `src/components/home/SportCardsGrid.tsx` (registration corner ticks on sport cards + dot-matrix `TOURNAMENT SQUADS` kicker tying `TickerStrip` to `Explore`)
- `src/pages/public/TeamsPage.tsx` (dossier team cards with lot-code corner stamp, crisp team-color top-right registration tick, structured empty dossier)
- `src/pages/public/SeasonTeamDetailPage.tsx` (franchise dossier header with corner registration brackets, clean vertical-spined role sections without nested box clutter)
- `src/pages/public/RostersPage.tsx` (corner-registered sport cards with subtle dot-matrix athlete count readout)
- `src/pages/public/RosterSportPage.tsx` (clean horizontal drafting-rail filter bar with crisp active underline/pill indicator and quiet filter summary)
- `src/components/roster/RosterPlayerCard.tsx` (lot-sheet athlete card: crisp `#CODE` top stamp, subtle corner tick reveal on hover, clean footer rule)
- `src/components/roster/RosterScoutModal.tsx` (framed scout dossier card with corner registration ticks around the portrait bay)
- `src/pages/public/PlayerProfilePage.tsx` (athlete dossier header + true vertical timeline spine connecting career seasons with sage active node and muted past nodes)
- `src/pages/public/ResultsPage.tsx` (scoreboard-style KPI strip with dot-matrix micro-labels, sharp auction-lot feed rows, corner-bracketed Total Points Spent hero card, and cleaner ranked leaderboard rows)
- `src/pages/public/ReelsPage.tsx` (briefing dossier layout with corner-registered theme box, numbered judging criteria bars, and vertical-spined key dates timeline)
- `src/pages/public/RulesPage.tsx` (numbered official regulations index with subtle corner ticks on the binder header and crisp open/download actions)
- `src/components/ui/EmptyState.tsx` (corner-bracketed dossier empty frame with quiet status label and clean action button)

### What It Changes
- **Surfaces:** Keeps cards on clean flat `--surface` against `--bg` (zero muddy gradients), using surface contrast sparingly for portrait frames (`--surface-2`) and interactive filter rails. Removes redundant outer wrapper boxes around `SeasonTeamDetailPage` role lists and `PlayerProfilePage` career entries so the timeline spine sits directly on the clean page flow.
- **Borders:** Uses crisp `1px solid var(--border)` edges paired with the **pure-CSS corner registration mark motif** (`.pub-corner-ticks`): four tiny `10px × 10px` `1.5px`-thick `var(--accent-bright)` (or `var(--team-color)`) right-angle corner ticks painted via 8 lightweight `linear-gradient` stops in `background-image`. On resting cards, ticks sit quietly at low contrast (`25–35%` mix); on featured headers and hovered cards, they crisp up to full `var(--accent-bright)` or `var(--team-color)`.
- **Section dividers:** Clean `1px` structural rules paired with a small vertical `10px` sage tick mark at the leading edge and a right-aligned monospace or `font-dot` readout (e.g., `03 SPORTS`, `14 LOTS`, `SEASON ANALYTICS`), visually bridging the `TickerStrip`'s stadium dot-matrix personality with the calm `Syne` headings below.
- **Section headers:** Two-line structured dossier headers: a restrained `font-dot` or `font-mono` uppercase micro-kicker (`LIVE AUCTION FEED`, `TOURNAMENT SQUADS`, `FRANCHISE ROSTER`, `OFFICIAL REGULATIONS`) above a `Syne` 600 title (`var(--syne-title)`), with a crisp horizontal baseline rule.
- **Card treatments:**
  - `RosterPlayerCard`: Feels like an authentic auction lot card—`#CODE` anchored cleanly at top-left, status dot + subtle label, amber `PTS` figure locked to a consistent baseline, and corner ticks activating on hover.
  - `PlayerProfilePage` & `ReelsPage` (Key Dates): Introduces a vertical `1px` `var(--border)` timeline spine on the left with a clean `8px` sage square/circle marker for the active season (and hollow ringed nodes for past seasons), replacing stacked disconnected boxes.
  - `ResultsPage`: Highlights the `Total points spent` card with full corner registration brackets and a quiet `font-dot` label, while keeping the live sold feed fast, scannable, and ledger-sharp.
- **Hover & press states:** Hovering interactive cards triggers a `150ms` `translateY(-2px)` lift while cross-fading a pseudo-element corner-tick overlay (`opacity: 0 -> 1`, strictly compositor-animated, no `background-image` repaints). Buttons and cards depress cleanly on tap (`active:scale-[0.985]`).
- **Scroll & entrance motion:** Crisp `opacity` + `translateY(6px -> 0)` (`220ms`) entry for dossier headers and a subtle staggered reveal for top-level grids (`Teams`, `Results` summary tiles, `Rules` rows). Respects `prefers-reduced-motion: reduce` completely.
- **Empty states:** Official "awaiting lot / no records" dossier frame bounded by subtle corner registration ticks, centered Phosphor icon, clear `Syne` 500 title, muted guidance text, and a single primary return/reset button.

### Cost & Performance Estimate
- **Files touched:** 14 files (same controlled public scope).
- **New CSS:** ~140 lines in `src/index.css` (~3.2 KB raw / ~1.0 KB gzipped). Corner ticks use `::after` with `opacity` transitions so hover never triggers paint invalidation on the card itself.
- **Bundle & mobile performance:** Zero new packages, zero SVG filters, zero extra images, `CLS = 0`. Timeline spines and corner ticks add negligible DOM weight (< 1 KB total). Expected Mobile PageSpeed impact: **0 ms regression** (stays >= 90).

### Light Mode vs. Dark Mode
- **Light mode (`:root`):** Reads like a crisp field-printed scouting binder—warm light canvas (`#F4F5F1`), clean white lot sheets (`#FFFFFF`), forest-green (`#047554`) architectural corner marks, subtle charcoal hairlines, and warm bronze-amber (`#8A5A00`) bid prices.
- **Dark mode (`[data-theme="dark"]`):** Reads like an understated nocturnal auction war room—matte obsidian (`#0B0B0B`) background, deep slate lot sheets (`#121412`), precise emerald corner ticks that frame content like a viewfinder without neon glow, and crisp gold (`#C88B0F`) bid totals.

---

## Quick Comparison

| Dimension | 1. Court Monograph | 2. Milled Field | 3. Draft Dossier |
| :--- | :--- | :--- | :--- |
| **Core visual idea** | Swiss sporting broadsheet: hairlines, folio numbers (`01`, `02`), unboxed metadata | Tactile stationery & machined grooves matching the recessed `TickerStrip` rail | Live auction lot book: pure-CSS corner registration ticks, dot-matrix kickers, timeline spines |
| **Card geometry** | Tighter architectural corners (`rounded-xl`/`2xl`), flat single-elevation + ledger rows | Soft machined plates (`rounded-2xl`) + carved concave grooves & concentric inner rims | Sharp framed lot sheets (`rounded-2xl`) with corner bracket accents |
| **Strongest pages** | `Results`, `Rules`, `Reels`, `PlayerProfile` (cleanest reduction in box clutter) | `Home` (below hero), `Teams`, `Rosters`, `RosterSport` (highest harmony with TickerStrip) | `Results`, `PlayerProfile`, `SeasonTeamDetail`, `RosterPlayerCard` (strongest auction identity) |
| **CSS & JS cost** | ~95 lines CSS (~0.7 KB gz), 14 files, 0 deps | ~130 lines CSS (~0.9 KB gz), 14 files, 0 deps | ~140 lines CSS (~1.0 KB gz), 14 files, 0 deps |
| **Mobile PageSpeed** | 90+ (0 CLS, compositor-only motion) | 90+ (0 CLS, compositor-only motion) | 90+ (0 CLS, compositor-only motion) |

---

Reply with **Direction 1**, **Direction 2**, or **Direction 3** (or tell me if you want to blend specific elements from two directions) and I will implement Phase 2 in a single cumulative batch.
