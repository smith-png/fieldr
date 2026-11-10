import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CarouselItem, Player, ProjectorState, Season, SiteSettings, Sport } from '../../types'
import { SPORTS } from '../sports'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isDemoMode = !supabaseUrl || !supabaseAnonKey

export const supabase: SupabaseClient | null = !isDemoMode
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Broadcast channel for real-time cross-tab updates in demo mode
export const demoBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('fieldr-projector-sync')
    : null

export function notifyChange(event: string, payload?: unknown): void {
  if (demoBroadcastChannel) {
    demoBroadcastChannel.postMessage({ event, payload, timestamp: Date.now() })
  }
}

// Local storage keys for demo persistence
export const STORAGE_KEYS = {
  USER: 'fieldr_auth_user',
  SEASONS: 'fieldr_seasons',
  SPORTS: 'fieldr_sports',
  TEAMS: 'fieldr_teams',
  PLAYERS: 'fieldr_players',
  ATHLETES: 'fieldr_athletes',
  MATCHES: 'fieldr_matches',
  MATCH_STATS: 'fieldr_match_stats',
  TRANSACTIONS: 'fieldr_transactions',
  PROJECTOR: 'fieldr_projector_state',
  CAROUSEL: 'fieldr_carousel_items',
  SETTINGS: 'fieldr_site_settings'
} as const

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

export const DEFAULT_SPORTS: Sport[] = SPORTS.map((s) => ({
  id: s.slug,
  name: s.label,
  roles: [...s.roles]
}))

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
  }
}

export function getLocal<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

export function setLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage quota fallback
  }
}

import type { Athlete, Match, Team } from '../../types'

export function getNextAthleteCode(currentAthletes: Athlete[]): number {
  let maxCode = 0
  for (const a of currentAthletes) {
    if (a.athlete_code && a.athlete_code > maxCode) {
      maxCode = a.athlete_code
    }
  }
  return maxCode + 1
}

export function getNextPlayerCode(_seasonId: string, _currentPlayers: Player[]): string {
  // Numeric codes are tied to athletes now. This is a fallback helper returning formatted string.
  return '0001'
}

export function initializeDemoStore(): void {
  if (typeof window === 'undefined') return

  const storedSports = getLocal<Sport[]>(STORAGE_KEYS.SPORTS, [])
  if (!storedSports || storedSports.length === 0) {
    setLocal(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
  } else {
    const updated = DEFAULT_SPORTS.map((ds) => {
      const existing = storedSports.find((s) => s.id === ds.id)
      return existing ? { ...existing, roles: ds.roles } : ds
    })
    setLocal(STORAGE_KEYS.SPORTS, updated)
  }

  let seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
  if (!seasons || seasons.length === 0) {
    const activeSeason: Season = {
      id: 'season-2026-fieldr',
      name: 'Annual Sports 2026',
      is_active: true,
      is_archived: false,
      start_date: '2026-03-01',
      end_date: '2026-03-15',
      description: 'The premier collegiate athletic tournament and live player draft.',
      created_at: '2026-01-10T00:00:00.000Z'
    }
    const pastSeason: Season = {
      id: 'season-2025-fieldr',
      name: 'Championship 2025',
      is_active: false,
      is_archived: true,
      start_date: '2025-02-10',
      end_date: '2025-02-25',
      description: 'Inaugural inter-college athletic tournament featuring Cricket, Futsal, and Volleyball.',
      created_at: '2025-01-05T00:00:00.000Z'
    }
    seasons = [activeSeason, pastSeason]
    setLocal(STORAGE_KEYS.SEASONS, seasons)
  }

  const activeSeason = seasons.find((s) => s.is_active) || seasons[0]

  // Seed demo teams if empty
  let teams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
  if (!teams || teams.length === 0) {
    teams = [
      {
        id: 'team-c1-2026',
        season_id: activeSeason.id,
        sport: 'Cricket',
        name: 'Stallions CC',
        short_code: 'SCC',
        color: '#2F5233',
        owner_display_name: 'Marcus Vance',
        starting_purse: 10000,
        current_purse: 7400,
        created_at: '2026-02-01T00:00:00.000Z'
      },
      {
        id: 'team-c2-2026',
        season_id: activeSeason.id,
        sport: 'Cricket',
        name: 'Royal Tigers',
        short_code: 'RTG',
        color: '#B45309',
        owner_display_name: 'Devin Thorne',
        starting_purse: 10000,
        current_purse: 8100,
        created_at: '2026-02-01T00:00:00.000Z'
      },
      {
        id: 'team-f1-2026',
        season_id: activeSeason.id,
        sport: 'Futsal',
        name: 'Apex Velocity',
        short_code: 'APX',
        color: '#1E3A8A',
        owner_display_name: 'Elena Rostova',
        starting_purse: 10000,
        current_purse: 8900,
        created_at: '2026-02-01T00:00:00.000Z'
      },
      {
        id: 'team-v1-2026',
        season_id: activeSeason.id,
        sport: 'Volleyball',
        name: 'Thunder Spikes',
        short_code: 'TSP',
        color: '#047554',
        owner_display_name: 'Rachel Sterling',
        starting_purse: 10000,
        current_purse: 9200,
        created_at: '2026-02-01T00:00:00.000Z'
      },
      // 2025 archived season teams
      {
        id: 'team-c1-2025',
        season_id: 'season-2025-fieldr',
        sport: 'Cricket',
        name: 'Stallions CC',
        short_code: 'SCC',
        color: '#2F5233',
        owner_display_name: 'Marcus Vance',
        starting_purse: 10000,
        current_purse: 5000,
        created_at: '2025-01-15T00:00:00.000Z'
      },
      {
        id: 'team-c2-2025',
        season_id: 'season-2025-fieldr',
        sport: 'Cricket',
        name: 'Royal Tigers',
        short_code: 'RTG',
        color: '#B45309',
        owner_display_name: 'Devin Thorne',
        starting_purse: 10000,
        current_purse: 5200,
        created_at: '2025-01-15T00:00:00.000Z'
      }
    ]
    setLocal(STORAGE_KEYS.TEAMS, teams)
  }

  // Ensure athletes are seeded or backfilled from players
  let athletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
  let players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])

  if ((!athletes || athletes.length === 0) && (!players || players.length === 0)) {
    // Seed initial demo athletes
    athletes = [
      {
        id: 'ath-1',
        athlete_code: 1,
        name: 'Aiden Reed',
        roll_no: 'ENG-2023-014',
        notes: 'Top-order aggressive stroke maker and agile boundary fielder.',
        created_at: '2025-01-10T00:00:00.000Z'
      },
      {
        id: 'ath-2',
        athlete_code: 2,
        name: 'Kavita Sharma',
        roll_no: 'SCI-2022-088',
        notes: 'Clinical left-arm orthodox spinner and reliable middle order anchor.',
        created_at: '2025-01-10T00:00:00.000Z'
      },
      {
        id: 'ath-3',
        athlete_code: 3,
        name: 'Liam Henderson',
        roll_no: 'BUS-2024-002',
        notes: 'High-press futsal winger with rapid turnaround and crossing precision.',
        created_at: '2025-01-11T00:00:00.000Z'
      },
      {
        id: 'ath-4',
        athlete_code: 4,
        name: 'Mateo Silva',
        roll_no: 'ENG-2021-042',
        notes: 'Dominant volleyball outside hitter with heavy jump serve.',
        created_at: '2025-01-12T00:00:00.000Z'
      },
      {
        id: 'ath-5',
        athlete_code: 5,
        name: 'Zara Patel',
        roll_no: 'MED-2023-109',
        notes: 'Wicketkeeper batter with exceptional glove work against spin.',
        created_at: '2025-01-12T00:00:00.000Z'
      },
      {
        id: 'ath-6',
        athlete_code: 6,
        name: 'Daniel Brooks',
        roll_no: 'LAW-2022-031',
        notes: 'Pace bowler bowling at 85+ mph with late reverse swing.',
        created_at: '2025-01-13T00:00:00.000Z'
      }
    ]
    setLocal(STORAGE_KEYS.ATHLETES, athletes)

    // Seed player entries for these athletes across active and past seasons
    players = [
      // 2026 season entries
      {
        id: 'ply-2026-1',
        season_id: activeSeason.id,
        athlete_id: 'ath-1',
        athlete_code: 1,
        player_code: '0001',
        name: 'Aiden Reed',
        sport: 'Cricket',
        playing_role: 'Batter',
        academic_year: '3rd',
        base_points: 500,
        status: 'sold',
        team_id: 'team-c1-2026',
        purchase_price: 2600,
        created_at: '2026-02-05T00:00:00.000Z'
      },
      {
        id: 'ply-2026-2',
        season_id: activeSeason.id,
        athlete_id: 'ath-2',
        athlete_code: 2,
        player_code: '0002',
        name: 'Kavita Sharma',
        sport: 'Cricket',
        playing_role: 'All-rounder',
        academic_year: 'Final',
        base_points: 600,
        status: 'sold',
        team_id: 'team-c2-2026',
        purchase_price: 1900,
        created_at: '2026-02-05T00:00:00.000Z'
      },
      {
        id: 'ply-2026-3',
        season_id: activeSeason.id,
        athlete_id: 'ath-3',
        athlete_code: 3,
        player_code: '0003',
        name: 'Liam Henderson',
        sport: 'Futsal',
        playing_role: 'Winger',
        academic_year: '2nd',
        base_points: 400,
        status: 'sold',
        team_id: 'team-f1-2026',
        purchase_price: 1100,
        created_at: '2026-02-05T00:00:00.000Z'
      },
      {
        id: 'ply-2026-4',
        season_id: activeSeason.id,
        athlete_id: 'ath-4',
        athlete_code: 4,
        player_code: '0004',
        name: 'Mateo Silva',
        sport: 'Volleyball',
        playing_role: 'Attacker',
        academic_year: 'Final',
        base_points: 500,
        status: 'sold',
        team_id: 'team-v1-2026',
        purchase_price: 800,
        created_at: '2026-02-05T00:00:00.000Z'
      },
      {
        id: 'ply-2026-5',
        season_id: activeSeason.id,
        athlete_id: 'ath-5',
        athlete_code: 5,
        player_code: '0005',
        name: 'Zara Patel',
        sport: 'Cricket',
        playing_role: 'Wicketkeeper',
        academic_year: '3rd',
        base_points: 450,
        status: 'available',
        team_id: null,
        created_at: '2026-02-06T00:00:00.000Z'
      },
      {
        id: 'ply-2026-6',
        season_id: activeSeason.id,
        athlete_id: 'ath-6',
        athlete_code: 6,
        player_code: '0006',
        name: 'Daniel Brooks',
        sport: 'Cricket',
        playing_role: 'Bowler',
        academic_year: 'Final',
        base_points: 500,
        status: 'available',
        team_id: null,
        created_at: '2026-02-06T00:00:00.000Z'
      },
      // Multi-sport athlete entry: Aiden Reed also plays Futsal!
      {
        id: 'ply-2026-7',
        season_id: activeSeason.id,
        athlete_id: 'ath-1',
        athlete_code: 1,
        player_code: '0001',
        name: 'Aiden Reed',
        sport: 'Futsal',
        playing_role: 'Pivot',
        academic_year: '3rd',
        base_points: 400,
        status: 'available',
        team_id: null,
        created_at: '2026-02-06T00:00:00.000Z'
      },
      // 2025 archived season entries demonstrating career history
      {
        id: 'ply-2025-1',
        season_id: 'season-2025-fieldr',
        athlete_id: 'ath-1',
        athlete_code: 1,
        player_code: '0001',
        name: 'Aiden Reed',
        sport: 'Cricket',
        playing_role: 'Batter',
        academic_year: '2nd',
        base_points: 400,
        status: 'sold',
        team_id: 'team-c1-2025',
        purchase_price: 2100,
        created_at: '2025-01-20T00:00:00.000Z'
      },
      {
        id: 'ply-2025-2',
        season_id: 'season-2025-fieldr',
        athlete_id: 'ath-2',
        athlete_code: 2,
        player_code: '0002',
        name: 'Kavita Sharma',
        sport: 'Cricket',
        playing_role: 'All-rounder',
        academic_year: '3rd',
        base_points: 500,
        status: 'sold',
        team_id: 'team-c2-2025',
        purchase_price: 1800,
        created_at: '2025-01-20T00:00:00.000Z'
      }
    ]
    setLocal(STORAGE_KEYS.PLAYERS, players)
  } else if ((!athletes || athletes.length === 0) && players.length > 0) {
    // Backfill athletes from existing players
    athletes = []
    let currentCode = 1
    const nameMap = new Map<string, Athlete>()

    const updatedPlayers = players.map((p) => {
      const key = (p.name || '').trim().toLowerCase()
      let ath = nameMap.get(key)
      if (!ath) {
        let codeNum = currentCode
        const match = (p.player_code || '').match(/(\d+)/)
        if (match) {
          const parsed = parseInt(match[1], 10)
          if (!isNaN(parsed) && parsed > 0) codeNum = parsed
        }
        ath = {
          id: `ath-${Date.now()}-${codeNum}`,
          athlete_code: codeNum,
          name: p.name,
          photo_url: p.photo_url,
          photo_thumb_url: p.photo_thumb_url,
          roll_no: p.roll_no,
          notes: p.notes,
          created_at: p.created_at || new Date().toISOString()
        }
        nameMap.set(key, ath)
        athletes.push(ath)
        currentCode = Math.max(currentCode, codeNum) + 1
      }
      return {
        ...p,
        athlete_id: ath.id,
        athlete_code: ath.athlete_code,
        player_code: formatAthleteCode(ath.athlete_code)
      }
    })

    setLocal(STORAGE_KEYS.ATHLETES, athletes)
    setLocal(STORAGE_KEYS.PLAYERS, updatedPlayers)
    players = updatedPlayers
  }

  // Seed demo matches if empty
  let matches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, [])
  if (!matches || matches.length === 0) {
    matches = [
      {
        id: 'match-1',
        season_id: activeSeason.id,
        sport: 'Cricket',
        round: 'League Match 1',
        team_a_id: 'team-c1-2026',
        team_b_id: 'team-c2-2026',
        scheduled_at: '2026-03-05T14:00:00.000Z',
        venue: 'Main Stadium Oval',
        status: 'completed',
        score_a: '184/5 (20.0)',
        score_b: '172/8 (20.0)',
        winner_team_id: 'team-c1-2026',
        result_summary: 'Stallions CC won by 12 runs',
        created_at: '2026-02-15T00:00:00.000Z'
      },
      {
        id: 'match-2',
        season_id: activeSeason.id,
        sport: 'Cricket',
        round: 'League Match 2',
        team_a_id: 'team-c2-2026',
        team_b_id: 'team-c1-2026',
        scheduled_at: '2026-03-12T15:30:00.000Z',
        venue: 'Main Stadium Oval',
        status: 'scheduled',
        score_a: undefined,
        score_b: undefined,
        winner_team_id: null,
        result_summary: undefined,
        created_at: '2026-02-15T00:00:00.000Z'
      },
      // 2025 archived match
      {
        id: 'match-2025-final',
        season_id: 'season-2025-fieldr',
        sport: 'Cricket',
        round: 'Grand Final',
        team_a_id: 'team-c1-2025',
        team_b_id: 'team-c2-2025',
        scheduled_at: '2025-02-24T16:00:00.000Z',
        venue: 'Collegiate Arena',
        status: 'completed',
        score_a: '195/4 (20.0)',
        score_b: '168/9 (20.0)',
        winner_team_id: 'team-c1-2025',
        result_summary: 'Stallions CC won by 27 runs to claim 2025 Trophy',
        created_at: '2025-02-20T00:00:00.000Z'
      }
    ]
    setLocal(STORAGE_KEYS.MATCHES, matches)
  }

  if (!localStorage.getItem(STORAGE_KEYS.PROJECTOR)) {
    const defaultProjector: ProjectorState = {
      season_id: activeSeason.id,
      mode: 'idle',
      player_id: null,
      team_id: null,
      updated_at: new Date().toISOString()
    }
    setLocal(STORAGE_KEYS.PROJECTOR, defaultProjector)
  }

  if (!localStorage.getItem(STORAGE_KEYS.CAROUSEL)) {
    setLocal(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
  }

  if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
    setLocal(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  }

  if (!localStorage.getItem(STORAGE_KEYS.TRANSACTIONS)) {
    setLocal(STORAGE_KEYS.TRANSACTIONS, [])
  }
}

if (isDemoMode) {
  initializeDemoStore()
}
