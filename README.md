# Fieldr - Live Sports Player Auction Platform

Fieldr is a specialized, auction administration and big-screen projector display platform engineered for athletic auctions (Cricket, Futsal, Volleyball).

## System Architecture

Fieldr operates with two account roles:
1. **Admin (`/admin`)**: Manages seasons, teams, player registrations, CSV rosters, team player assignments with auction purchase purse accounting, and direct live scene switching on the projector display.
2. **Projector (`/projector`)**: Fullscreen, read-only stage display for auditorium screens. Features 4 live scenes: Idle Welcome ("Draft. Bid. Win."), All Teams & Purse Standings (with animated counters), Player Spotlight, and Team Roster.


## Offline Demo Mode

If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not provided, Fieldr automatically boots in **Demo Mode**:
- All data is persisted in browser `localStorage`.
- Real-time updates between the Admin console and Projector screen are synchronized instantly via `BroadcastChannel('fieldr-projector-sync')` and window storage events.
- Quick one-click login buttons for Admin and Projector are displayed on the login page for instant testing. (These buttons are automatically hidden when Supabase is connected).
- Photos are compressed via client-side HTML5 canvas (max 400px, 0.7 JPEG) to ensure smooth storage within browser quotas.


## Available Sports & Roles

- **Cricket**: Batter, Bowler, All-rounder, Wicketkeeper
- **Futsal**: Goalkeeper, Defender, Winger, Pivot
- **Volleyball**: Setter, Spiker, Libero, Blocker
