# Fieldr - Live Sports Player Auction Platform

Fieldr is a specialized, dark-editorial auction administration and big-screen projector display platform engineered for athletic auctions (Cricket, Futsal, Volleyball).

## System Architecture

Fieldr operates with two account roles:
1. **Admin (`/admin`)**: Manages seasons, teams, player registrations, CSV rosters, team player assignments with auction purchase purse accounting, and direct live scene switching on the projector display.
2. **Projector (`/projector`)**: Fullscreen, read-only stage display for auditorium screens. Features 4 live scenes: Idle Welcome ("Draft. Bid. Win."), All Teams & Purse Standings (with animated counters), Player Spotlight, and Team Roster.

---

## Supabase Production Setup Guide

### 1. Create a Supabase Project
1. Log in to [supabase.com](https://supabase.com) and create a new project.
2. Select your closest region and set a secure database password.

### 2. Execute the Database Schema & Realtime Patch
1. Open your Supabase Dashboard and navigate to the **SQL Editor**.
2. Click **New Query**, copy the entire contents of `supabase/schema.sql`, and click **Run**.
3. Next, create another query, copy the contents of `supabase/patch_security_realtime.sql`, and click **Run**.
4. This creates all tables (`seasons`, `sports`, `profiles`, `teams`, `players`, `purse_transactions`, `projector_state`), seeds the 3 sports (Cricket, Futsal, Volleyball), configures Row-Level Security (RLS), sets up the `fieldr-assets` storage bucket, deploys atomic RPC functions (`execute_purse_transaction`, `assign_player_to_team`, `unassign_player_from_team`), and enables real-time websocket publication with full replica identity.

### 3. Configure Environment Variables
In your deployment environment or `.env.local`, set:
```env
# Use the publishable or anon key only, never the service_role key.
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-public-key"
```

### 4. Create the Two Accounts
1. In the Supabase Dashboard, go to **Authentication** > **Users**.
2. Click **Add User** > **Create User**.
3. Create the Admin user:
   - Email: `admin@fieldr.app`
   - Password: `<your-secure-password>`
   - Auto Confirm: Enabled
4. Create the Projector user:
   - Email: `projector@fieldr.app`
   - Password: `<your-secure-password>`
   - Auto Confirm: Enabled

### 5. Assign Account Roles in the Profiles Table
1. Open the Supabase **SQL Editor** and run:
```sql
-- Find the user IDs from auth.users and insert into public.profiles
insert into public.profiles (id, role)
select id, 'admin'
from auth.users
where email = 'admin@fieldr.app'
on conflict (id) do update set role = 'admin';

insert into public.profiles (id, role)
select id, 'projector'
from auth.users
where email = 'projector@fieldr.app'
on conflict (id) do update set role = 'projector';
```

---

## Offline Demo Mode

If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not provided, Fieldr automatically boots in **Demo Mode**:
- All data is persisted in browser `localStorage`.
- Real-time updates between the Admin console and Projector screen are synchronized instantly via `BroadcastChannel('fieldr-projector-sync')` and window storage events.
- Quick one-click login buttons for Admin and Projector are displayed on the login page for instant testing. (These buttons are automatically hidden when Supabase is connected).
- Photos are compressed via client-side HTML5 canvas (max 400px, 0.7 JPEG) to ensure smooth storage within browser quotas.

---

## Available Sports & Roles

- **Cricket**: Batter, Bowler, All-rounder, Wicketkeeper
- **Futsal**: Goalkeeper, Defender, Winger, Pivot
- **Volleyball**: Setter, Spiker, Libero, Blocker
