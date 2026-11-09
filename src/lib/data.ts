import { createClient } from '@supabase/supabase-js'
import type {
  AuthUser,
  Player,
  ProjectorState,
  PurseTransaction,
  PurseTransactionType,
  Season,
  Sport,
  Team,
  UserRole
} from './types'
import { compressImageFile } from './imageCompression'

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
  PROJECTOR: 'fieldr_projector_state'
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
    roles: ['Setter', 'Spiker', 'Libero', 'Blocker']
  }
]

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

// Initial seed for demo mode
function initializeDemoStore() {
  if (typeof window === 'undefined') return

  if (!localStorage.getItem(STORAGE_KEYS.SPORTS)) {
    setLocal(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
  }

  let seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
  if (!seasons || seasons.length === 0) {
    const defaultSeason: Season = {
      id: 'season-2026-drgmc',
      name: 'DRGMC Annual Sports 2026',
      is_active: true,
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

export async function createSeason(name: string): Promise<Season> {
  if (isDemoMode) {
    const seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
    const newSeason: Season = {
      id: `season-${Date.now()}`,
      name: name.trim(),
      is_active: seasons.length === 0,
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
    .insert([{ name: name.trim(), is_active: false }])
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
  if (error || !data) return DEFAULT_SPORTS
  return data
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

export async function createPlayer(playerData: Omit<Player, 'id' | 'created_at'>): Promise<Player> {
  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const newPlayer: Player = {
      ...playerData,
      id: `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
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

export async function bulkCreatePlayers(playersData: Omit<Player, 'id' | 'created_at'>[]): Promise<Player[]> {
  if (isDemoMode) {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const newPlayers: Player[] = playersData.map((pd, i) => ({
      ...pd,
      id: `player-${Date.now()}-${i}`,
      created_at: new Date().toISOString()
    }))
    allPlayers.push(...newPlayers)
    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    notifyChange('players_change')
    return newPlayers
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

  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw new Error(error.message)
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

export async function uploadAsset(file: File, folder = 'assets'): Promise<string> {
  // Always compress image client-side to prevent memory/storage bloat
  const compressedDataUrl = await compressImageFile(file, 400, 0.7)

  if (isDemoMode) {
    return compressedDataUrl
  }

  if (!supabase) return compressedDataUrl

  try {
    // Convert base64 data url back to Blob for storage upload
    const res = await fetch(compressedDataUrl)
    const blob = await res.blob()
    const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('fieldr-assets')
      .upload(filename, blob, {
        contentType: 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      return compressedDataUrl
    }

    const { data } = supabase.storage.from('fieldr-assets').getPublicUrl(filename)
    return data.publicUrl
  } catch {
    return compressedDataUrl
  }
}
