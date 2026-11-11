# Fieldr Typography Rules

1. **Brand Fonts**:
   - **Syne** (`700`, `800` via `.font-syne`): Used strictly for headings and the `"Fieldr"` wordmark.
   - **DM Sans** (`300..800` via `--font-sans` / `font-sans` and `body`): Used for all body text, descriptions, form controls, buttons, tabs, and general UI across both admin and public pages.
   - **Monospace** (`font-mono`): Used only for IDs, 4-digit player/athlete codes, point/currency amounts, timestamps, and eyebrow/table-header labels where already designated.
   - **Display / Accent Fonts**: `DotGothic16` (`.font-dot`) and `Instrument Serif` (`.font-serif-accent`) remain limited to their existing specialized components.
   - **No Manrope**: `Manrope` must never be loaded in `index.html` or referenced in CSS or components.

2. **Font Weights (Set on Components, Never via Global Overrides)**:
   - **Body text, descriptions, subtitles, table cells, placeholders**: `300` (inherited from `body { font-weight: 300; }`).
   - **Buttons (secondary, outline, ghost, danger), tab/switcher labels, chips, form labels, table column headers (`<th>`)**: `400` (`font-normal`).
   - **Primary buttons (`variant="primary"`) and selected tab/switcher options**: `500` (`font-medium`).
   - **Dialog titles (`<h3>`)**: `Syne` `700` (`font-syne font-bold`).
   - **Page titles (`<h1>`) and the `"Fieldr"` wordmark**: `Syne` `800` (`font-syne font-extrabold`).

3. **Global CSS (`src/index.css`) Discipline**:
   - Do not add global `font-weight` or `font-family` override selectors targeting buttons, headings, spans, tables, or uppercase text in `src/index.css`.
   - Form elements (`button, input, select, textarea`) inherit their font via `button, input, select, textarea { font-family: inherit; }`.
   - Admin pages and public pages share the same typography tokens and rules.

4. **Projector Display (`src/pages/public/ProjectorPage.tsx`)**:
   - Do not modify `ProjectorPage.tsx` or any projector scene typography unless explicitly requested.
