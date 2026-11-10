import { createClient } from '@supabase/supabase-js'
import type {
  AcademicYear,
  AuthUser,
  CarouselItem,
  Player,
  ProjectorState,
  PublicPlayer,
  PurseTransaction,
  PurseTransactionType,
  Season,
  SiteSettings,
  Sport,
  Team,
  UserRole
} from './types'
import {
  blobToDataUrl,
  createThumbnailBlob,
  validateImageFile
} from './imageCompression'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isDemoMode = !supabaseUrl || !supabaseAnonKey

const supabase = !isDemoMode
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Broadcast channel for real-time cross-tab updates in demo mode
const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('fieldr-projector-sync')
  : null

function notifyChange(event: string, payload?: unknown) {
  if (channel) {
    channel.postMessage({ event, payload, timestamp: Date.now() })
  }
}

// Local storage keys
const STORAGE_KEYS = {
  USER: 'fieldr_auth_user',
  SEASONS: 'fieldr_seasons',
  SPORTS: 'fieldr_sports',
  TEAMS: 'fieldr_teams',
  PLAYERS: 'fieldr_players',
  TRANSACTIONS: 'fieldr_transactions',
  PROJECTOR: 'fieldr_projector_state',
  CAROUSEL: 'fieldr_carousel_items',
  SETTINGS: 'fieldr_site_settings'
}

const DEFAULT_SPORTS: Sport[] = [
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

const DEFAULT_CAROUSEL: CarouselItem[] = [
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

const DEFAULT_SETTINGS: SiteSettings = {
  help_page: {
    title: 'Help & Instructions',
    body: 'Welcome to Fieldr.\n\nFor Tournament Admins:\nUse the admin dashboard to configure teams, register player rosters, and execute purse adjustments.\n\nFor Audience & Displays:\nThe Projector view updates in real time to show live player spotlights, franchise purse balances, and finalized team squads.'
  },
  about_page: {
    title: 'About Fieldr',
    body: 'Fieldr is a specialized live athletic auction platform.\n\nBuilt for high-energy collegiate and club sports draft events with real-time big screen synchronisation, audited team purses, and transparent player scouting.'
  },
  auction_timing: {
    window_duration_seconds: 60
  }
}

function getLocal<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : defaultValue
  } catch {
    return defaultValue
  }
}

function setLocal<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage limit fallback
  }
}

// Helper to generate sequential player codes in demo mode
function getNextPlayerCode(seasonId: string, currentPlayers: Player[]): string {
  const seasonPlayers = currentPlayers.filter((p) => p.season_id === seasonId)
  let maxNum = 0
  for (const p of seasonPlayers) {
    if (p.player_code) {
      const match = p.player_code.match(/^FLD-(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > maxNum) maxNum = num
      }
    }
  }
  return `FLD-${String(maxNum + 1).padStart(4, '0')}`
}

// Initial seed for demo mode
function initializeDemoStore() {
  if (typeof window === 'undefined') return

  const storedSports = getLocal<Sport[]>(STORAGE_KEYS.SPORTS, [])
  if (!storedSports || storedSports.length === 0) {
    setLocal(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
  } else {
    // Ensure roles in localStorage match the exact database specification
    const updated = DEFAULT_SPORTS.map((ds) => {
      const existing = storedSports.find((s) => s.id === ds.id)
      return existing ? { ...existing, roles: ds.roles } : ds
    })
    setLocal(STORAGE_KEYS.SPORTS, updated)
  }

  // Migrate any demo players with legacy role variants to exact role values
  const storedPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
  if (storedPlayers.length > 0) {
    let changed = false
    const updatedPlayers = storedPlayers.map((p) => {
      if (p.sport.toLowerCase() === 'cricket') {
        if (p.playing_role === 'Batsman') {
          changed = true
          return { ...p, playing_role: 'Batter' }
        }
        if (p.playing_role === 'Wicket-keeper') {
          changed = true
          return { ...p, playing_role: 'Wicketkeeper' }
        }
      }
      return p
    })
    if (changed) {
      setLocal(STORAGE_KEYS.PLAYERS, updatedPlayers)
    }
  }

  let seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
  if (!seasons || seasons.length === 0) {
    const defaultSeason: Season = {
      id: 'season-2026-fieldr',
      name: 'Annual Sports 2026',
      is_active: true,
      start_date: '2026-03-01',
      end_date: '2026-03-15',
      created_at: new Date().toISOString()
    }
    seasons = [defaultSeason]
    setLocal(STORAGE_KEYS.SEASONS, seasons)
  }

  const activeSeason = seasons.find((s) => s.is_active) || seasons[0]

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

  if (!localStorage.getItem(STORAGE_KEYS.TEAMS)) {
    setLocal(STORAGE_KEYS.TEAMS, [])
  }

  if (!localStorage.getItem(STORAGE_KEYS.PLAYERS)) {
    setLocal(STORAGE_KEYS.PLAYERS, [])
  }

  if (!localStorage.getItem(STORAGE_KEYS.TRANSACTIONS)) {
    setLocal(STORAGE_KEYS.TRANSACTIONS, [])
  }
}

if (isDemoMode) {
  initializeDemoStore()
}

// ==================== AUTH METHODS ====================

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (isDemoMode) {
    return getLocal<AuthUser | null>(STORAGE_KEYS.USER, null)
  }

  if (!supabase) return null

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  return {
    id: session.user.id,
    email: session.user.email || '',
    role: (profile?.role as UserRole) || 'projector'
  }
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  if (isDemoMode) {
    const role: UserRole = email.toLowerCase().includes('admin') ? 'admin' : 'projector'
    const user: AuthUser = {
      id: `demo-${role}-${Date.now()}`,
      email,
      role
    }
    setLocal(STORAGE_KEYS.USER, user)
    notifyChange('auth_change')
    return user
  }

  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    throw new Error(error?.message || 'Authentication failed')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single()

  const user: AuthUser = {
    id: data.user.id,
    email: data.user.email || email,
    role: (profile?.role as UserRole) || 'projector'
  }
  return user
}

export async function demoSignIn(role: UserRole): Promise<AuthUser> {
  const email = role === 'admin' ? 'admin@fieldr.app' : 'projector@fieldr.app'
  const user: AuthUser = {
    id: `demo-${role}-user`,
    email,
    role
  }
  setLocal(STORAGE_KEYS.USER, user)
  notifyChange('auth_change')
  return user
}

export async function signOut(): Promise<void> {
  if (isDemoMode) {
    localStorage.removeItem(STORAGE_KEYS.USER)
    notifyChange('auth_change')
    return
  }

  if (supabase) {
    await supabase.auth.signOut()
  }
}

// ==================== SEASONS ====================

export async function getSeasons(): Promise<Season[]> {
  if (isDemoMode) {
    return getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
  }

  if (!supabase) return []
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getActiveSeason(): Promise<Season | null> {
  const seasons = await getSeasons()
  return seasons.find((s) => s.is_active) || null
}

export async function createSeason(name: string, startDate?: string, endDate?: string): Promise<Season> {
  if (isDemoMode) {
    const seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
    const newSeason: Season = {
      id: `season-${Date.now()}`,
      name: name.trim(),
      is_active: seasons.length === 0,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      created_at: new Date().toISOString()
    }
    seasons.push(newSeason)
    setLocal(STORAGE_KEYS.SEASONS, seasons)
    notifyChange('seasons_change')
    return newSeason
  }

  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('seasons')
    .insert([{
      name: name.trim(),
      is_active: false,
      start_date: startDate || null,
      end_date: endDate || null
    }])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function setActiveSeason(id: string): Promise<void> {
  if (isDemoMode) {
    const seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
    const updated = seasons.map((s) => ({
      ...s,
      is_active: s.id === id
    }))
    setLocal(STORAGE_KEYS.SEASONS, updated)

    const projector = getLocal<ProjectorState>(STORAGE_KEYS.PROJECTOR, {
      season_id: id,
      mode: 'idle',
      player_id: null,
      team_id: null,
      updated_at: new Date().toISOString()
    })
    setLocal(STORAGE_KEYS.PROJECTOR, { ...projector, season_id: id })

    notifyChange('seasons_change')
    notifyChange('projector_change')
    return
  }

  if (!supabase) throw new Error('Supabase not configured')

  // Find currently active season to allow rollback if activation fails
  const { data: currentActive } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)

  const prevActiveIds = currentActive ? currentActive.map((s) => s.id) : []

  // Step 1: Deactivate existing active seasons
  if (prevActiveIds.length > 0) {
    const { error: deactError } = await supabase
      .from('seasons')
      .update({ is_active: false })
      .in('id', prevActiveIds)

    if (deactError) {
      throw new Error(`Failed to deactivate current season: ${deactError.message}`)
    }
  }

  // Step 2: Activate target season
  const { error: actError } = await supabase
    .from('seasons')
    .update({ is_active: true })
    .eq('id', id)

  if (actError) {
    // Rollback: restore previously active seasons
    if (prevActiveIds.length > 0) {
      await supabase
        .from('seasons')
        .update({ is_active: true })
        .in('id', prevActiveIds)
    }
    throw new Error(`Failed to activate season: ${actError.message}`)
  }
}

// ==================== SPORTS ====================

export async function getSports(): Promise<Sport[]> {
  if (isDemoMode) {
    return getLocal<Sport[]>(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
  }

  if (!supabase) return DEFAULT_SPORTS
  const { data, error } = await supabase.from('sports').select('*')
  if (error || !data || data.length === 0) return DEFAULT_SPORTS
  return data
}

// Shared helper to load exact role names for a sport from the database
export async function getRolesForSport(sportNameOrId: string): Promise<string[]> {
  const sports = await getSports()
  const found = sports.find(
    (s) =>
      s.id.toLowerCase() === sportNameOrId.toLowerCase() ||
      s.name.toLowerCase() === sportNameOrId.toLowerCase()
  )
  return found?.roles || []
}

// ==================== TEAMS ====================

export async function getTeams(seasonId: string): Promise<Team[]> {
  if (isDemoMode) {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    return allTeams.filter((t) => t.season_id === seasonId)
  }

  if (!supabase) return []
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('season_id', seasonId)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

export async function getActiveTeams(): Promise<Team[]> {
  const activeSeason = await getActiveSeason()
  if (!activeSeason) return []
  return getTeams(activeSeason.id)
}

export async function createTeam(teamData: Omit<Team, 'id' | 'current_purse' | 'created_at'>): Promise<Team> {
  if (isDemoMode) {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const newTeam: Team = {
      ...teamData,
      id: `team-${Date.now()}`,
      current_purse: teamData.starting_purse,
      created_at: new Date().toISOString()
    }
    allTeams.push(newTeam)
    setLocal(STORAGE_KEYS.TEAMS, allTeams)

    // Initial transaction
    const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
    allTx.unshift({
      id: `tx-${Date.now()}`,
      season_id: teamData.season_id,
      team_id: newTeam.id,
      type: 'initial',
      amount: newTeam.starting_purse,
      balance_after: newTeam.starting_purse,
      reason: 'Initial team purse',
      created_at: new Date().toISOString(),
      created_by: 'admin'
    })
    setLocal(STORAGE_KEYS.TRANSACTIONS, allTx)

    notifyChange('teams_change')
    return newTeam
  }

  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('teams')
    .insert([{
      ...teamData,
      current_purse: teamData.starting_purse
    }])
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Record initial transaction
  await supabase.from('purse_transactions').insert([{
    season_id: teamData.season_id,
    team_id: data.id,
    type: 'initial',
    amount: data.starting_purse,
    balance_after: data.starting_purse,
    reason: 'Initial team purse',
    created_by: 'admin'
  }])

  return data
}

export async function updateTeam(id: string, updates: Partial<Team>): Promise<Team> {
  if (isDemoMode) {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const index = allTeams.findIndex((t) => t.id === id)
    if (index === -1) throw new Error('Team not found')

    const updated = { ...allTeams[index], ...updates }
    allTeams[index] = updated
    setLocal(STORAGE_KEYS.TEAMS, allTeams)
    notifyChange('teams_change')
    return updated
  }

  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteTeam(id: string): Promise<void> {
  if (isDemoMode) {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const targetTeam = allTeams.find((t) => t.id === id)
    const filteredTeams = allTeams.filter((t) => t.id !== id)
    setLocal(STORAGE_KEYS.TEAMS, filteredTeams)

    // Unassign all players belonging to this team
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const updatedPlayers = allPlayers.map((p) => {
      if (p.team_id === id) {
        return {
          ...p,
          team_id: null,
          status: 'available' as const,
          purchase_price: null
        }
      }
      return p
    })
    setLocal(STORAGE_KEYS.PLAYERS, updatedPlayers)

    // Check projector state: if showing this team, switch to idle
    const projector = getLocal<ProjectorState>(STORAGE_KEYS.PROJECTOR, {
      season_id: targetTeam?.season_id || '',
      mode: 'idle',
      player_id: null,
      team_id: null,
      updated_at: new Date().toISOString()
    })
    if (projector.team_id === id) {
      setLocal(STORAGE_KEYS.PROJECTOR, {
        ...projector,
        mode: 'idle',
        team_id: null,
        player_id: null,
        updated_at: new Date().toISOString()
      })
      notifyChange('projector_change')
    }

    notifyChange('teams_change')
    notifyChange('players_change')
    return
  }

  if (!supabase) throw new Error('Supabase not configured')

  // Set players back to available
  await supabase
    .from('players')
    .update({ team_id: null, status: 'available', purchase_price: null })
    .eq('team_id', id)

  // Check projector state
  const { data: pState } = await supabase
    .from('projector_state')
    .select('*')
    .eq('team_id', id)
    .single()

  if (pState) {
    await supabase
      .from('projector_state')
      .update({ mode: 'idle', team_id: null, updated_at: new Date().toISOString() })
      .eq('team_id', id)
  }

  const { error } = await supabase.from('teams').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ==================== PLAYERS ====================

export async function getPlayers(seasonId: string): Promise<Player[]> {
  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    return allPlayers.filter((p) => p.season_id === seasonId)
  }

  if (!supabase) return []
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('season_id', seasonId)
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)
  return data || []
}

// Paginated admin players query
export async function getPlayersPaged(params: {
  seasonId: string
  page: number
  pageSize: number
  search?: string
  sport?: string
  role?: string
  status?: string
}): Promise<{ players: Player[]; totalCount: number; totalPages: number }> {
  const { seasonId, page, pageSize, search, sport, role, status } = params
  const offset = (page - 1) * pageSize

  if (isDemoMode) {
    let list = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter((p) => p.season_id === seasonId)

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.player_code && p.player_code.toLowerCase().includes(q)) ||
        (p.roll_no && p.roll_no.toLowerCase().includes(q))
      )
    }

    if (sport && sport !== 'all') {
      list = list.filter((p) => p.sport.toLowerCase() === sport.toLowerCase())
    }

    if (role && role !== 'all') {
      list = list.filter((p) => p.playing_role.toLowerCase() === role.toLowerCase())
    }

    if (status && status !== 'all') {
      list = list.filter((p) => p.status === status)
    }

    list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

    const totalCount = list.length
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const paged = list.slice(offset, offset + pageSize)

    return { players: paged, totalCount, totalPages }
  }

  if (!supabase) {
    return { players: [], totalCount: 0, totalPages: 1 }
  }

  let query = supabase
    .from('players')
    .select('*', { count: 'exact' })
    .eq('season_id', seasonId)

  if (search && search.trim()) {
    const q = search.trim()
    query = query.or(`name.ilike.%${q}%,player_code.ilike.%${q}%,roll_no.ilike.%${q}%`)
  }

  if (sport && sport !== 'all') {
    query = query.ilike('sport', sport)
  }

  if (role && role !== 'all') {
    query = query.ilike('playing_role', role)
  }

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  query = query
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + pageSize - 1)

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  const totalCount = count || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return {
    players: (data as Player[]) || [],
    totalCount,
    totalPages
  }
}

// Public Roster Query: Endless scroll reading from public_players VIEW
export async function getPublicPlayersPaged(params: {
  sport: string
  academicYear?: string
  playingRole?: string
  offset: number
  limit: number
}): Promise<{ players: PublicPlayer[]; totalCount: number; hasMore: boolean }> {
  const { sport, academicYear, playingRole, offset, limit } = params

  if (isDemoMode) {
    const activeSeason = (getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])).find((s) => s.is_active)
    if (!activeSeason) return { players: [], totalCount: 0, hasMore: false }

    let list = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter(
      (p) => p.season_id === activeSeason.id && p.sport.toLowerCase() === sport.toLowerCase()
    )

    if (academicYear && academicYear !== 'all') {
      list = list.filter((p) => p.academic_year === academicYear)
    }

    if (playingRole && playingRole.toLowerCase() !== 'all') {
      list = list.filter((p) => p.playing_role === playingRole)
    }

    list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

    const totalCount = list.length
    const sliced = list.slice(offset, offset + limit)

    const publicList: PublicPlayer[] = sliced.map((p) => ({
      id: p.id,
      player_code: p.player_code,
      name: p.name,
      photo_thumb_url: p.photo_thumb_url || p.photo_url,
      photo_url: p.photo_url,
      academic_year: p.academic_year || '1st',
      sport: p.sport,
      playing_role: p.playing_role,
      season_id: p.season_id
    }))

    return {
      players: publicList,
      totalCount,
      hasMore: offset + sliced.length < totalCount
    }
  }

  if (!supabase) return { players: [], totalCount: 0, hasMore: false }

  const activeSeason = await getActiveSeason()
  if (!activeSeason) return { players: [], totalCount: 0, hasMore: false }

  let query = supabase
    .from('public_players')
    .select('id, player_code, name, photo_thumb_url, photo_url, academic_year, sport, playing_role, season_id', {
      count: 'exact'
    })
    .eq('season_id', activeSeason.id)
    .ilike('sport', sport)

  if (academicYear && academicYear !== 'all') {
    query = query.eq('academic_year', academicYear)
  }

  if (playingRole && playingRole.toLowerCase() !== 'all') {
    query = query.eq('playing_role', playingRole)
  }

  query = query
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  const { data, count, error } = await query
  if (error) throw new Error(error.message)

  const totalCount = count || 0
  const players = (data as PublicPlayer[]) || []

  return {
    players,
    totalCount,
    hasMore: offset + players.length < totalCount
  }
}

export async function createPlayer(
  playerData: Omit<Player, 'id' | 'player_code' | 'created_at'>
): Promise<Player> {
  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const playerCode = getNextPlayerCode(playerData.season_id, allPlayers)
    const newPlayer: Player = {
      ...playerData,
      id: `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      player_code: playerCode,
      academic_year: playerData.academic_year || '1st',
      created_at: new Date().toISOString()
    }
    allPlayers.push(newPlayer)
    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    notifyChange('players_change')
    return newPlayer
  }

  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('players')
    .insert([playerData])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function bulkCreatePlayers(
  playersData: Omit<Player, 'id' | 'player_code' | 'created_at'>[]
): Promise<Player[]> {
  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const createdList: Player[] = []
    for (let i = 0; i < playersData.length; i++) {
      const pd = playersData[i]
      const playerCode = getNextPlayerCode(pd.season_id, allPlayers.concat(createdList))
      const newPlayer: Player = {
        ...pd,
        id: `player-${Date.now()}-${i}`,
        player_code: playerCode,
        academic_year: pd.academic_year || '1st',
        created_at: new Date().toISOString()
      }
      createdList.push(newPlayer)
    }
    allPlayers.push(...createdList)
    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    notifyChange('players_change')
    return createdList
  }

  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('players')
    .insert(playersData)
    .select()

  if (error) throw new Error(error.message)
  return data || []
}

export async function updatePlayer(id: string, updates: Partial<Player>): Promise<Player> {
  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const index = allPlayers.findIndex((p) => p.id === id)
    if (index === -1) throw new Error('Player not found')

    const updated = { ...allPlayers[index], ...updates }
    allPlayers[index] = updated
    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    notifyChange('players_change')
    return updated
  }

  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deletePlayer(id: string): Promise<void> {
  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const targetPlayer = allPlayers.find((p) => p.id === id)
    const filteredPlayers = allPlayers.filter((p) => p.id !== id)
    setLocal(STORAGE_KEYS.PLAYERS, filteredPlayers)

    // Check projector state: if showing this player, switch to idle
    const projector = getLocal<ProjectorState>(STORAGE_KEYS.PROJECTOR, {
      season_id: targetPlayer?.season_id || '',
      mode: 'idle',
      player_id: null,
      team_id: null,
      updated_at: new Date().toISOString()
    })
    if (projector.player_id === id) {
      setLocal(STORAGE_KEYS.PROJECTOR, {
        ...projector,
        mode: 'idle',
        player_id: null,
        updated_at: new Date().toISOString()
      })
      notifyChange('projector_change')
    }

    notifyChange('players_change')
    return
  }

  if (!supabase) throw new Error('Supabase not configured')

  // Check projector state
  const { data: pState } = await supabase
    .from('projector_state')
    .select('*')
    .eq('player_id', id)
    .single()

  if (pState) {
    await supabase
      .from('projector_state')
      .update({ mode: 'idle', player_id: null, updated_at: new Date().toISOString() })
      .eq('player_id', id)
  }

  // Fetch player to delete storage photos if any
  const { data: playerToDelete } = await supabase
    .from('players')
    .select('photo_url, photo_thumb_url')
    .eq('id', id)
    .single()

  if (playerToDelete) {
    await deletePlayerPhotoAssets(playerToDelete.photo_url, playerToDelete.photo_thumb_url)
  }

  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Export players in batches of 1000
export async function exportPlayersForSport(seasonId: string, sport?: string): Promise<Player[]> {
  const result: Player[] = []
  const batchSize = 1000

  if (isDemoMode) {
    let list = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter((p) => p.season_id === seasonId)
    if (sport && sport !== 'all') {
      list = list.filter((p) => p.sport.toLowerCase() === sport.toLowerCase())
    }
    list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    return list
  }

  if (!supabase) return []

  let from = 0
  let keepFetching = true

  while (keepFetching) {
    let query = supabase
      .from('players')
      .select('*')
      .eq('season_id', seasonId)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + batchSize - 1)

    if (sport && sport !== 'all') {
      query = query.ilike('sport', sport)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    if (data && data.length > 0) {
      result.push(...(data as Player[]))
      from += batchSize
      if (data.length < batchSize) {
        keepFetching = false
      }
    } else {
      keepFetching = false
    }
  }

  return result
}

// ==================== PLAYER ASSIGNMENT & ROSTER ====================

export async function assignPlayerToTeam(
  playerId: string,
  teamId: string,
  price?: number
): Promise<{ player: Player; team: Team }> {
  const purchasePrice = price && price > 0 ? price : 0

  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

    const player = allPlayers.find((p) => p.id === playerId)
    const team = allTeams.find((t) => t.id === teamId)

    if (!player) throw new Error('Player not found')
    if (!team) throw new Error('Team not found')

    if (player.status === 'sold') {
      throw new Error('Player already assigned')
    }

    if (player.sport.toLowerCase() !== team.sport.toLowerCase()) {
      throw new Error(`Sport mismatch: Player is in ${player.sport}, Team is in ${team.sport}`)
    }

    if (purchasePrice > 0) {
      if (team.current_purse < purchasePrice) {
        throw new Error(
          `Insufficient purse balance. Team only has ${team.current_purse} points available, price is ${purchasePrice}`
        )
      }
      team.current_purse -= purchasePrice

      // Record transaction
      const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
      allTx.unshift({
        id: `tx-${Date.now()}`,
        season_id: player.season_id,
        team_id: team.id,
        type: 'deduct',
        amount: purchasePrice,
        balance_after: team.current_purse,
        reason: `Player assigned: ${player.name}`,
        created_at: new Date().toISOString(),
        created_by: 'admin'
      })
      setLocal(STORAGE_KEYS.TRANSACTIONS, allTx)
    }

    player.team_id = team.id
    player.status = 'sold'
    player.purchase_price = purchasePrice > 0 ? purchasePrice : null

    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    setLocal(STORAGE_KEYS.TEAMS, allTeams)

    notifyChange('players_change')
    notifyChange('teams_change')
    return { player, team }
  }

  if (!supabase) throw new Error('Supabase not configured')

  const { error: rpcErr } = await supabase.rpc('assign_player_to_team', {
    p_player_id: playerId,
    p_team_id: teamId,
    p_price: purchasePrice
  })
  if (rpcErr) throw new Error(rpcErr.message)

  const { data: updatedPlayer, error: pErr } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()
  if (pErr || !updatedPlayer) throw new Error(pErr?.message || 'Player not found')

  const { data: updatedTeam, error: tErr } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .single()
  if (tErr || !updatedTeam) throw new Error(tErr?.message || 'Team not found')

  return { player: updatedPlayer, team: updatedTeam }
}

export async function unassignPlayerFromTeam(
  playerId: string,
  refundToPurse = false
): Promise<{ player: Player; team?: Team }> {
  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

    const player = allPlayers.find((p) => p.id === playerId)
    if (!player) throw new Error('Player not found')

    const prevTeamId = player.team_id
    const prevPrice = player.purchase_price || 0
    let team: Team | undefined

    if (prevTeamId) {
      team = allTeams.find((t) => t.id === prevTeamId)
      if (team && refundToPurse && prevPrice > 0) {
        team.current_purse += prevPrice

        const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
        allTx.unshift({
          id: `tx-${Date.now()}`,
          season_id: player.season_id,
          team_id: team.id,
          type: 'add',
          amount: prevPrice,
          balance_after: team.current_purse,
          reason: `Refund: player unassigned (${player.name})`,
          created_at: new Date().toISOString(),
          created_by: 'admin'
        })
        setLocal(STORAGE_KEYS.TRANSACTIONS, allTx)
      }
    }

    player.team_id = null
    player.status = 'available'
    player.purchase_price = null

    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    setLocal(STORAGE_KEYS.TEAMS, allTeams)

    notifyChange('players_change')
    notifyChange('teams_change')
    return { player, team }
  }

  if (!supabase) throw new Error('Supabase not configured')

  const { data: pData } = await supabase
    .from('players')
    .select('team_id')
    .eq('id', playerId)
    .single()
  const prevTeamId = pData?.team_id

  const { error: rpcErr } = await supabase.rpc('unassign_player_from_team', {
    p_player_id: playerId
  })
  if (rpcErr) throw new Error(rpcErr.message)

  const { data: updatedPlayer, error: pErr } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()
  if (pErr || !updatedPlayer) throw new Error(pErr?.message || 'Player not found')

  let updatedTeam: Team | undefined
  if (prevTeamId) {
    const { data: t } = await supabase
      .from('teams')
      .select('*')
      .eq('id', prevTeamId)
      .single()
    if (t) updatedTeam = t
  }

  return { player: updatedPlayer, team: updatedTeam }
}

// ==================== PURSES & TRANSACTIONS ====================

export async function getPurseTransactions(seasonId: string, teamId?: string): Promise<PurseTransaction[]> {
  if (isDemoMode) {
    const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
    return allTx
      .filter((tx) => tx.season_id === seasonId && (!teamId || tx.team_id === teamId))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }

  if (!supabase) return []
  let query = supabase
    .from('purse_transactions')
    .select('*')
    .eq('season_id', seasonId)
    .order('created_at', { ascending: false })

  if (teamId) {
    query = query.eq('team_id', teamId)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data || []
}

export async function executePurseTransaction(
  seasonId: string,
  teamId: string,
  type: PurseTransactionType,
  amount: number,
  reason?: string
): Promise<{ newBalance: number; transaction: PurseTransaction }> {
  if (amount < 0 && (type === 'add' || type === 'deduct')) {
    throw new Error('Transaction amount must be positive')
  }

  if (isDemoMode) {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const team = allTeams.find((t) => t.id === teamId)
    if (!team) throw new Error('Team not found')

    let newBalance = team.current_purse
    if (type === 'add') {
      newBalance += amount
    } else if (type === 'deduct') {
      newBalance -= amount
    } else if (type === 'set' || type === 'initial') {
      newBalance = amount
    }

    if (newBalance < 0) {
      throw new Error(`Insufficient purse balance. Resulting balance would be negative (${newBalance})`)
    }

    team.current_purse = newBalance
    setLocal(STORAGE_KEYS.TEAMS, allTeams)

    const tx: PurseTransaction = {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      season_id: seasonId,
      team_id: teamId,
      type,
      amount,
      balance_after: newBalance,
      reason: reason || `Purse ${type} action`,
      created_at: new Date().toISOString(),
      created_by: 'admin'
    }

    const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
    allTx.unshift(tx)
    setLocal(STORAGE_KEYS.TRANSACTIONS, allTx)

    notifyChange('teams_change')
    notifyChange('transactions_change')
    return { newBalance, transaction: tx }
  }

  if (!supabase) throw new Error('Supabase not configured')

  const { data: newBalance, error: rpcErr } = await supabase.rpc('execute_purse_transaction', {
    p_team_id: teamId,
    p_season_id: seasonId,
    p_type: type,
    p_amount: amount,
    p_reason: reason || `Purse ${type} action`,
    p_created_by: 'admin'
  })

  if (rpcErr) throw new Error(rpcErr.message)

  const { data: txList } = await supabase
    .from('purse_transactions')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(1)

  return { newBalance, transaction: txList?.[0] }
}

export async function resetAllPurses(
  seasonId: string,
  startingAmount: number,
  reason = 'Global starting purse reset'
): Promise<void> {
  if (startingAmount < 0) {
    throw new Error('Starting amount must be non-negative')
  }

  if (isDemoMode) {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const seasonTeams = allTeams.filter((t) => t.season_id === seasonId)
    const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])

    const now = new Date().toISOString()
    for (const team of seasonTeams) {
      team.starting_purse = startingAmount
      team.current_purse = startingAmount
      allTx.unshift({
        id: `tx-${Date.now()}-${team.id}`,
        season_id: seasonId,
        team_id: team.id,
        type: 'set',
        amount: startingAmount,
        balance_after: startingAmount,
        reason,
        created_at: now,
        created_by: 'admin'
      })
    }

    setLocal(STORAGE_KEYS.TEAMS, allTeams)
    setLocal(STORAGE_KEYS.TRANSACTIONS, allTx)
    notifyChange('teams_change')
    notifyChange('transactions_change')
    return
  }

  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase.rpc('reset_all_purses', {
    p_season_id: seasonId,
    p_starting_amount: startingAmount,
    p_reason: reason
  })

  if (error) throw new Error(error.message)
}

// ==================== PROJECTOR STATE ====================

export async function getProjectorState(seasonId: string): Promise<ProjectorState> {
  if (isDemoMode) {
    const state = getLocal<ProjectorState>(STORAGE_KEYS.PROJECTOR, {
      season_id: seasonId,
      mode: 'idle',
      player_id: null,
      team_id: null,
      updated_at: new Date().toISOString()
    })
    return state.season_id === seasonId ? state : { ...state, season_id: seasonId }
  }

  if (!supabase) {
    return {
      season_id: seasonId,
      mode: 'idle',
      player_id: null,
      team_id: null,
      updated_at: new Date().toISOString()
    }
  }

  const { data, error } = await supabase
    .from('projector_state')
    .select('*')
    .eq('season_id', seasonId)
    .single()

  if (error || !data) {
    return {
      season_id: seasonId,
      mode: 'idle',
      player_id: null,
      team_id: null,
      updated_at: new Date().toISOString()
    }
  }

  return data
}

export async function setProjectorState(state: ProjectorState): Promise<ProjectorState> {
  const updatedState: ProjectorState = {
    ...state,
    updated_at: new Date().toISOString()
  }

  if (isDemoMode) {
    setLocal(STORAGE_KEYS.PROJECTOR, updatedState)
    notifyChange('projector_change', updatedState)
    return updatedState
  }

  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('projector_state')
    .upsert(updatedState)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export function subscribeToProjector(
  seasonId: string,
  callback: (state: ProjectorState) => void
): () => void {
  if (isDemoMode) {
    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.event === 'projector_change') {
        const state = getLocal<ProjectorState>(STORAGE_KEYS.PROJECTOR, {
          season_id: seasonId,
          mode: 'idle',
          player_id: null,
          team_id: null,
          updated_at: new Date().toISOString()
        })
        callback(state)
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.PROJECTOR && e.newValue) {
        try {
          callback(JSON.parse(e.newValue))
        } catch {
          // ignore
        }
      }
    }

    if (channel) channel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)

    // Initial delivery
    getProjectorState(seasonId).then(callback).catch(() => {})

    return () => {
      if (channel) channel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  }

  if (!supabase) return () => {}

  // Fetch initial
  getProjectorState(seasonId).then(callback).catch(() => {})

  const sbChannel = supabase
    .channel(`projector_state_${seasonId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'projector_state',
        filter: `season_id=eq.${seasonId}`
      },
      (payload) => {
        if (payload.new) {
          callback(payload.new as ProjectorState)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(sbChannel)
  }
}

export function subscribeToTeams(
  seasonId: string,
  callback: (teams: Team[]) => void
): () => void {
  if (isDemoMode) {
    const handleUpdate = () => {
      getTeams(seasonId).then(callback).catch(() => {})
    }

    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.event === 'teams_change') {
        handleUpdate()
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.TEAMS) {
        handleUpdate()
      }
    }

    if (channel) channel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)
    handleUpdate()

    return () => {
      if (channel) channel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  }

  if (!supabase) return () => {}

  getTeams(seasonId).then(callback).catch(() => {})

  const sbChannel = supabase
    .channel(`teams_${seasonId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'teams',
        filter: `season_id=eq.${seasonId}`
      },
      () => {
        getTeams(seasonId).then(callback).catch(() => {})
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(sbChannel)
  }
}

export function subscribeToPlayers(
  seasonId: string,
  callback: (players: Player[]) => void
): () => void {
  if (isDemoMode) {
    const handleUpdate = () => {
      getPlayers(seasonId).then(callback).catch(() => {})
    }

    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.event === 'players_change') {
        handleUpdate()
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.PLAYERS) {
        handleUpdate()
      }
    }

    if (channel) channel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)
    handleUpdate()

    return () => {
      if (channel) channel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  }

  if (!supabase) return () => {}

  getPlayers(seasonId).then(callback).catch(() => {})

  const sbChannel = supabase
    .channel(`players_${seasonId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `season_id=eq.${seasonId}`
      },
      () => {
        getPlayers(seasonId).then(callback).catch(() => {})
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(sbChannel)
  }
}

// ==================== ASSET UPLOADS ====================

// Photos: Accept JPG, PNG, WebP up to 5 MB. Upload original + 400px thumbnail.
export async function uploadPlayerPhotos(
  file: File
): Promise<{ photo_url: string; photo_thumb_url: string }> {
  validateImageFile(file)

  const thumbBlob = await createThumbnailBlob(file, 400, 0.82)

  if (isDemoMode) {
    const originalDataUrl = await blobToDataUrl(file)
    const thumbDataUrl = await blobToDataUrl(thumbBlob)
    return {
      photo_url: originalDataUrl,
      photo_thumb_url: thumbDataUrl
    }
  }

  if (!supabase) throw new Error('Supabase not configured')

  const timestamp = Date.now()
  const rand = Math.random().toString(36).substring(2, 8)
  const ext = file.name.split('.').pop() || 'jpg'

  const origPath = `players/originals/${timestamp}-${rand}.${ext}`
  const thumbPath = `players/thumbnails/${timestamp}-${rand}.jpg`

  // 1. Upload original
  const { error: origErr } = await supabase.storage
    .from('fieldr-assets')
    .upload(origPath, file, { contentType: file.type, upsert: true })

  if (origErr) throw new Error(`Original upload failed: ${origErr.message}`)
  const { data: origData } = supabase.storage.from('fieldr-assets').getPublicUrl(origPath)

  // 2. Upload thumbnail
  let thumbUrl = origData.publicUrl
  try {
    const { error: thumbErr } = await supabase.storage
      .from('fieldr-assets')
      .upload(thumbPath, thumbBlob, { contentType: 'image/jpeg', upsert: true })

    if (!thumbErr) {
      const { data: thumbData } = supabase.storage.from('fieldr-assets').getPublicUrl(thumbPath)
      thumbUrl = thumbData.publicUrl
    }
  } catch {
    // fall back to original
  }

  return {
    photo_url: origData.publicUrl,
    photo_thumb_url: thumbUrl
  }
}

export async function deletePlayerPhotoAssets(photoUrl?: string, thumbUrl?: string): Promise<void> {
  if (isDemoMode || !supabase) return

  const filesToDelete: string[] = []
  const extractPath = (url?: string) => {
    if (!url || !url.includes('/fieldr-assets/')) return null
    const parts = url.split('/fieldr-assets/')
    return parts[1] ? decodeURIComponent(parts[1]) : null
  }

  const p1 = extractPath(photoUrl)
  const p2 = extractPath(thumbUrl)
  if (p1) filesToDelete.push(p1)
  if (p2 && p2 !== p1) filesToDelete.push(p2)

  if (filesToDelete.length > 0) {
    try {
      await supabase.storage.from('fieldr-assets').remove(filesToDelete)
    } catch {
      // ignore deletion errors
    }
  }
}

// Upload team logo or misc asset
export async function uploadAsset(file: File, folder = 'assets'): Promise<string> {
  validateImageFile(file)
  const thumbBlob = await createThumbnailBlob(file, 400, 0.85)

  if (isDemoMode) {
    return blobToDataUrl(thumbBlob)
  }

  if (!supabase) return blobToDataUrl(thumbBlob)

  try {
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`
    const { error: uploadError } = await supabase.storage
      .from('fieldr-assets')
      .upload(filename, thumbBlob, {
        contentType: 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      return blobToDataUrl(thumbBlob)
    }

    const { data } = supabase.storage.from('fieldr-assets').getPublicUrl(filename)
    return data.publicUrl
  } catch {
    return blobToDataUrl(thumbBlob)
  }
}

// ==================== CAROUSEL ITEMS ====================

// In-memory 60-second cache for active carousel items
let activeCarouselCache: { data: CarouselItem[]; expiresAt: number } | null = null

export function invalidateCarouselCache(): void {
  activeCarouselCache = null
}

export async function getCarouselItems(activeOnly = false): Promise<CarouselItem[]> {
  // If active-only requested, check 60s cache first
  if (activeOnly && activeCarouselCache && Date.now() < activeCarouselCache.expiresAt) {
    return activeCarouselCache.data
  }

  if (isDemoMode) {
    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const sorted = [...all].sort(
      (a, b) => a.sort_order - b.sort_order || (a.created_at || '').localeCompare(b.created_at || '')
    )
    const result = activeOnly ? sorted.filter((item) => item.active) : sorted
    if (activeOnly) {
      activeCarouselCache = { data: result, expiresAt: Date.now() + 60_000 }
    }
    return result
  }

  if (!supabase) return activeOnly ? DEFAULT_CAROUSEL.filter((i) => i.active) : DEFAULT_CAROUSEL

  let query = supabase
    .from('carousel_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (activeOnly) {
    query = query.eq('active', true)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(error.message)
  }

  const result: CarouselItem[] = data || []
  if (activeOnly) {
    activeCarouselCache = { data: result, expiresAt: Date.now() + 60_000 }
  }
  return result
}

export async function createCarouselItem(text: string, sort_order: number, seasonId?: string): Promise<CarouselItem> {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 80) {
    throw new Error('Carousel item must be between 1 and 80 characters.')
  }

  invalidateCarouselCache()

  if (isDemoMode) {
    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const newItem: CarouselItem = {
      id: `car-${Date.now()}`,
      text: trimmed,
      sort_order,
      active: true,
      season_id: seasonId || null,
      created_at: new Date().toISOString()
    }
    all.push(newItem)
    setLocal(STORAGE_KEYS.CAROUSEL, all)
    notifyChange('carousel_change')
    return newItem
  }

  if (!supabase) throw new Error('Supabase not configured')

  const { data, error } = await supabase
    .from('carousel_items')
    .insert([{ text: trimmed, sort_order, active: true, season_id: seasonId || null }])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateCarouselItem(id: string, updates: Partial<CarouselItem>): Promise<CarouselItem> {
  if (updates.text !== undefined) {
    const trimmed = updates.text.trim()
    if (!trimmed || trimmed.length > 80) {
      throw new Error('Carousel item must be between 1 and 80 characters.')
    }
    updates.text = trimmed
  }

  invalidateCarouselCache()

  if (isDemoMode) {
    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const idx = all.findIndex((i) => i.id === id)
    if (idx === -1) throw new Error('Carousel item not found')

    // Guard: at least 1 active item must remain
    if (updates.active === false && all[idx].active) {
      const activeRemaining = all.filter((i) => i.id !== id && i.active)
      if (activeRemaining.length === 0) {
        throw new Error('At least 1 active ticker item is required.')
      }
    }

    const updated = { ...all[idx], ...updates }
    all[idx] = updated
    setLocal(STORAGE_KEYS.CAROUSEL, all)
    notifyChange('carousel_change')
    return updated
  }

  if (!supabase) throw new Error('Supabase not configured')

  // Guard: if deactivating, check active count in DB
  if (updates.active === false) {
    const { data: activeItems } = await supabase
      .from('carousel_items')
      .select('id')
      .eq('active', true)

    if (activeItems && activeItems.filter((i) => i.id !== id).length === 0) {
      throw new Error('At least 1 active ticker item is required.')
    }
  }

  const { data, error } = await supabase
    .from('carousel_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteCarouselItem(id: string): Promise<void> {
  invalidateCarouselCache()

  if (isDemoMode) {
    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const target = all.find((i) => i.id === id)
    if (target?.active) {
      const activeRemaining = all.filter((i) => i.id !== id && i.active)
      if (activeRemaining.length === 0) {
        throw new Error('At least 1 active ticker item is required.')
      }
    }
    setLocal(STORAGE_KEYS.CAROUSEL, all.filter((i) => i.id !== id))
    notifyChange('carousel_change')
    return
  }

  if (!supabase) throw new Error('Supabase not configured')

  // Check remaining active in DB
  const { data: activeItems } = await supabase
    .from('carousel_items')
    .select('id')
    .eq('active', true)

  if (activeItems && activeItems.length <= 1 && activeItems[0]?.id === id) {
    throw new Error('At least 1 active ticker item is required.')
  }

  const { error } = await supabase.from('carousel_items').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function swapCarouselItems(
  item1: { id: string; sort_order: number },
  item2: { id: string; sort_order: number }
): Promise<void> {
  invalidateCarouselCache()

  if (isDemoMode) {
    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const match1 = all.find((i) => i.id === item1.id)
    const match2 = all.find((i) => i.id === item2.id)
    if (match1) match1.sort_order = item1.sort_order
    if (match2) match2.sort_order = item2.sort_order
    setLocal(STORAGE_KEYS.CAROUSEL, all)
    notifyChange('carousel_change')
    return
  }

  if (!supabase) return

  const { error: err1 } = await supabase
    .from('carousel_items')
    .update({ sort_order: item1.sort_order })
    .eq('id', item1.id)

  if (err1) throw new Error(err1.message)

  const { error: err2 } = await supabase
    .from('carousel_items')
    .update({ sort_order: item2.sort_order })
    .eq('id', item2.id)

  if (err2) throw new Error(err2.message)
}

export async function reorderCarouselItems(orderedItems: { id: string; sort_order: number }[]): Promise<void> {
  invalidateCarouselCache()

  if (isDemoMode) {
    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    for (const item of orderedItems) {
      const match = all.find((i) => i.id === item.id)
      if (match) match.sort_order = item.sort_order
    }
    setLocal(STORAGE_KEYS.CAROUSEL, all)
    notifyChange('carousel_change')
    return
  }

  if (!supabase) return

  for (const item of orderedItems) {
    const { error } = await supabase.from('carousel_items').update({ sort_order: item.sort_order }).eq('id', item.id)
    if (error) throw new Error(error.message)
  }
}

export function subscribeToCarouselItems(callback: (items: CarouselItem[]) => void): () => void {
  let isUnsubscribed = false

  const refresh = async () => {
    try {
      invalidateCarouselCache()
      const items = await getCarouselItems(true)
      if (!isUnsubscribed) {
        callback(items)
      }
    } catch {
      // ignore background refresh failure
    }
  }

  if (isDemoMode) {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.CAROUSEL) {
        refresh()
      }
    }
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.event === 'carousel_change') {
        refresh()
      }
    }
    window.addEventListener('storage', handleStorage)
    if (channel) {
      channel.addEventListener('message', handleMessage)
    }
    return () => {
      isUnsubscribed = true
      window.removeEventListener('storage', handleStorage)
      if (channel) {
        channel.removeEventListener('message', handleMessage)
      }
    }
  }

  if (!supabase) return () => {}

  const realtimeChannel = supabase
    .channel('fieldr-carousel-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'carousel_items' },
      () => {
        refresh()
      }
    )
    .subscribe()

  return () => {
    isUnsubscribed = true
    supabase.removeChannel(realtimeChannel)
  }
}

// ==================== SITE SETTINGS ====================

export async function getSiteSettings(): Promise<SiteSettings> {
  if (isDemoMode) {
    return getLocal<SiteSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  }

  if (!supabase) return DEFAULT_SETTINGS

  const { data, error } = await supabase.from('site_settings').select('*')
  if (error || !data) return DEFAULT_SETTINGS

  const result: SiteSettings = { ...DEFAULT_SETTINGS }
  for (const row of data) {
    result[row.key] = row.value
  }
  return result
}

export async function updateSiteSetting(key: string, value: unknown): Promise<void> {
  if (isDemoMode) {
    const current = getLocal<SiteSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
    current[key] = value as any
    setLocal(STORAGE_KEYS.SETTINGS, current)
    notifyChange('settings_change')
    return
  }

  if (!supabase) throw new Error('Supabase not configured')

  const { error } = await supabase
    .from('site_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })

  if (error) throw new Error(error.message)
}
