import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CarouselItem, SiteSettings, Sport } from '../../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const REALTIME_DEBOUNCE_MS = 300

export type RealtimeScope = 'players' | 'athletes' | 'teams' | 'auction'

const localMutationUntil: Record<RealtimeScope, number> = {
  players: 0,
  athletes: 0,
  teams: 0,
  auction: 0
}

export function markLocalMutation(
  scopes: RealtimeScope[] = ['players', 'athletes', 'teams', 'auction'],
  suppressMs = 1500
): void {
  const until = Date.now() + suppressMs
  for (const scope of scopes) {
    localMutationUntil[scope] = Math.max(localMutationUntil[scope] || 0, until)
  }
}

export function isRealtimeSuppressed(scope: RealtimeScope): boolean {
  return Date.now() < (localMutationUntil[scope] || 0)
}

export async function resolveCurrentAdminActor(explicitActor?: string): Promise<string> {
  if (explicitActor && explicitActor.trim().length > 0) {
    return explicitActor.trim()
  }
  if (!supabase) return 'admin'
  try {
    const { data } = await supabase.auth.getSession()
    const authUser = data.session?.user
    if (!authUser) return 'admin'
    const meta = authUser.user_metadata as Record<string, unknown> | undefined
    const displayName =
      (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
      (typeof meta?.display_name === 'string' && meta.display_name.trim()) ||
      (typeof meta?.name === 'string' && meta.name.trim()) ||
      ''
    if (displayName) return displayName
    if (typeof authUser.email === 'string' && authUser.email.trim()) {
      return authUser.email.trim()
    }
  } catch {
    // Fall back to default label if session lookup fails
  }
  return 'admin'
}

export function formatAthleteCode(code: number | string | undefined | null): string {
  if (code === undefined || code === null) return '0001'
  if (typeof code === 'number') {
    return String(Math.max(1, Math.floor(code))).padStart(4, '0')
  }
  const clean = String(code).trim().replace(/^FLD-?/i, '')
  const parsed = parseInt(clean, 10)
  if (!isNaN(parsed) && parsed > 0) {
    return String(parsed).padStart(4, '0')
  }
  return '0001'
}

export function parseAthleteCode(input: string | number | undefined | null): number | null {
  if (input === undefined || input === null) return null
  if (typeof input === 'number') {
    return Number.isInteger(input) && input > 0 ? input : null
  }
  const clean = String(input).trim().replace(/^FLD-?/i, '')
  const parsed = parseInt(clean, 10)
  return !isNaN(parsed) && parsed > 0 ? parsed : null
}

export const DEFAULT_SPORTS: Sport[] = [
  {
    id: 'cricket',
    name: 'Cricket',
    roles: ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper']
  },
  {
    id: 'futsal',
    name: 'Futsal',
    roles: ['Goalkeeper', 'Defender', 'Winger', 'Pivot']
  },
  {
    id: 'volleyball',
    name: 'Volleyball',
    roles: ['Setter', 'Outside hitter', 'Middle blocker', 'Opposite', 'Libero']
  }
]

export const FALLBACK_CAROUSEL_TEXTS: string[] = [
  'LIVE PLAYER AUCTIONS',
  'DRAFT. BID. WIN.',
  'CRICKET / FUTSAL / VOLLEYBALL SQUADS'
]

export const DEFAULT_CAROUSEL: CarouselItem[] = [
  {
    id: 'car-1',
    text: 'LIVE PLAYER AUCTIONS',
    sort_order: 0,
    active: true
  },
  {
    id: 'car-2',
    text: 'DRAFT. BID. WIN.',
    sort_order: 1,
    active: true
  },
  {
    id: 'car-3',
    text: 'CRICKET / FUTSAL / VOLLEYBALL SQUADS',
    sort_order: 2,
    active: true
  }
]

export const DEFAULT_SETTINGS: SiteSettings = {
  help_page: {
    title: 'Help & Instructions',
    body:
      'Welcome to Fieldr.\n\nFor Tournament Admins:\nUse the admin dashboard to configure teams, register player rosters, and execute purse adjustments.\n\nFor Audience & Displays:\nThe Projector view updates in real time to show live player spotlights, franchise purse balances, and finalized team squads.'
  },
  about_page: {
    title: 'About Fieldr',
    body:
      'Fieldr is a specialized live athletic auction platform.\n\nBuilt for high-energy collegiate and club sports draft events with real-time big screen synchronisation, audited team purses, and transparent player scouting.'
  },
  auction_timing: {
    window_duration_seconds: 60
  },
  primary_icon: 'classic'
}
