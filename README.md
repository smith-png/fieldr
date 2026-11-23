# Fieldr - Live Sports Player Auction Platform

Fieldr is a specialized, auction administration and big-screen projector display platform engineered for athletic auctions (Cricket, Futsal, Volleyball).

## System Architecture

Fieldr operates with two account roles:
1. **Admin (`/admin`)**: Manages seasons, teams, player registrations, CSV rosters, team player assignments with auction purchase purse accounting, and direct live scene switching on the projector display.
2. **Projector (`/projector`)**: Fullscreen, read-only stage display for auditorium screens. Features 4 live scenes: Idle Welcome ("Draft. Bid. Win."), All Teams & Purse Standings (with animated counters), Player Spotlight, and Team Roster.


## Supabase Configuration

Fieldr requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to connect to Supabase. If either setting is missing at startup, the app displays a full-page configuration error instead of loading.


## Available Sports & Roles

- **Cricket**: Batter, Bowler, All-rounder, Wicketkeeper
- **Futsal**: Goalkeeper, Defender, Winger, Pivot
- **Volleyball**: Setter, Spiker, Libero, Blocker
