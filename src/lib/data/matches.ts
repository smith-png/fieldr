import type { Match, MatchPlayerStats, MatchWithTeams, Team } from '../../types'
import { AppError } from '../errors'
import {
  isDemoMode,
  supabase,
  getLocal,
  setLocal,
  notifyChange,
  demoBroadcastChannel,
  STORAGE_KEYS
} from './client'
import type { MatchesService } from './types'

function hydrateMatch(match: Match, teams: Team[]): MatchWithTeams {
  const teamA = teams.find((t) => t.id === match.team_a_id)
  const teamB = teams.find((t) => t.id === match.team_b_id)
  const winner = match.winner_team_id ? teams.find((t) => t.id === match.winner_team_id) : null

  return {
    ...match,
    team_a: teamA,
    team_b: teamB,
    winner_team: winner
  }
}

const demoMatchesService: MatchesService = {
  async getMatches(seasonId: string, sport?: string): Promise<MatchWithTeams[]> {
    try {
      const allMatches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, [])
      const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

      let filtered = allMatches.filter((m) => m.season_id === seasonId)
      if (sport && sport !== 'all') {
        filtered = filtered.filter((m) => m.sport.toLowerCase() === sport.toLowerCase())
      }

      return filtered
        .map((m) => hydrateMatch(m, allTeams))
        .sort((a, b) => {
          if (a.scheduled_at && b.scheduled_at) {
            return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
          }
          return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
        })
    } catch {
      return []
    }
  },

  async getMatch(id: string): Promise<MatchWithTeams | null> {
    try {
      const allMatches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, [])
      const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
      const match = allMatches.find((m) => m.id === id)
      return match ? hydrateMatch(match, allTeams) : null
    } catch {
      return null
    }
  },

  async createMatch(matchData: Omit<Match, 'id' | 'created_at'>): Promise<MatchWithTeams> {
    const allMatches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, [])
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

    if (matchData.team_a_id === matchData.team_b_id) {
      throw new AppError('Team A and Team B must be different teams')
    }

    const newMatch: Match = {
      ...matchData,
      id: `match-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString()
    }

    allMatches.push(newMatch)
    setLocal(STORAGE_KEYS.MATCHES, allMatches)
    notifyChange('matches_change')

    return hydrateMatch(newMatch, allTeams)
  },

  async updateMatch(id: string, updates: Partial<Match>): Promise<MatchWithTeams> {
    const allMatches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, [])
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

    const index = allMatches.findIndex((m) => m.id === id)
    if (index === -1) throw new AppError('Match not found')

    const updated = { ...allMatches[index], ...updates }
    allMatches[index] = updated
    setLocal(STORAGE_KEYS.MATCHES, allMatches)
    notifyChange('matches_change')

    return hydrateMatch(updated, allTeams)
  },

  async deleteMatch(id: string): Promise<void> {
    const allMatches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, [])
    const filtered = allMatches.filter((m) => m.id !== id)
    setLocal(STORAGE_KEYS.MATCHES, filtered)

    // Delete associated player stats
    const stats = getLocal<MatchPlayerStats[]>(STORAGE_KEYS.MATCH_STATS, [])
    setLocal(
      STORAGE_KEYS.MATCH_STATS,
      stats.filter((s) => s.match_id !== id)
    )

    notifyChange('matches_change')
  },

  async bulkCreateMatches(
    matchesData: Array<Omit<Match, 'id' | 'created_at'>>
  ): Promise<Match[]> {
    const allMatches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, [])
    const createdList: Match[] = []

    for (let i = 0; i < matchesData.length; i++) {
      const md = matchesData[i]
      const newMatch: Match = {
        ...md,
        id: `match-${Date.now()}-${i}`,
        created_at: new Date().toISOString()
      }
      createdList.push(newMatch)
    }

    allMatches.push(...createdList)
    setLocal(STORAGE_KEYS.MATCHES, allMatches)
    notifyChange('matches_change')

    return createdList
  },

  async getMatchStats(matchId: string): Promise<MatchPlayerStats[]> {
    try {
      const allStats = getLocal<MatchPlayerStats[]>(STORAGE_KEYS.MATCH_STATS, [])
      return allStats.filter((s) => s.match_id === matchId)
    } catch {
      return []
    }
  },

  async saveMatchStats(
    matchId: string,
    stats: Array<{ playerId: string; stats: Record<string, unknown> }>
  ): Promise<void> {
    const allStats = getLocal<MatchPlayerStats[]>(STORAGE_KEYS.MATCH_STATS, [])
    const otherStats = allStats.filter((s) => s.match_id !== matchId)

    const newStats: MatchPlayerStats[] = stats.map((item, idx) => ({
      id: `stat-${Date.now()}-${idx}`,
      match_id: matchId,
      player_id: item.playerId,
      stats: item.stats,
      created_at: new Date().toISOString()
    }))

    setLocal(STORAGE_KEYS.MATCH_STATS, [...otherStats, ...newStats])
    notifyChange('matches_change')
  },

  subscribeToMatches(
    seasonId: string,
    callback: (matches: MatchWithTeams[]) => void
  ): () => void {
    const handleUpdate = () => {
      demoMatchesService.getMatches(seasonId).then(callback).catch(() => {})
    }

    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.event === 'matches_change') handleUpdate()
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.MATCHES) handleUpdate()
    }

    if (demoBroadcastChannel) demoBroadcastChannel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)
    handleUpdate()

    return () => {
      if (demoBroadcastChannel) demoBroadcastChannel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  }
}

const supabaseMatchesService: MatchesService = {
  async getMatches(seasonId: string, sport?: string): Promise<MatchWithTeams[]> {
    if (!supabase) return []

    let query = supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(*),
        team_b:teams!matches_team_b_id_fkey(*),
        winner_team:teams!matches_winner_team_id_fkey(*)
      `)
      .eq('season_id', seasonId)

    if (sport && sport !== 'all') {
      query = query.ilike('sport', sport)
    }

    query = query.order('scheduled_at', { ascending: true, nullsFirst: false })

    const { data, error } = await query
    if (error) {
      console.error('getMatches error:', error)
      return []
    }
    return (data as MatchWithTeams[]) || []
  },

  async getMatch(id: string): Promise<MatchWithTeams | null> {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('matches')
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(*),
        team_b:teams!matches_team_b_id_fkey(*),
        winner_team:teams!matches_winner_team_id_fkey(*)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('getMatch error:', error)
      return null
    }
    return data as MatchWithTeams | null
  },

  async createMatch(matchData: Omit<Match, 'id' | 'created_at'>): Promise<MatchWithTeams> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase
      .from('matches')
      .insert([matchData])
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(*),
        team_b:teams!matches_team_b_id_fkey(*),
        winner_team:teams!matches_winner_team_id_fkey(*)
      `)
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as MatchWithTeams
  },

  async updateMatch(id: string, updates: Partial<Match>): Promise<MatchWithTeams> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase
      .from('matches')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        team_a:teams!matches_team_a_id_fkey(*),
        team_b:teams!matches_team_b_id_fkey(*),
        winner_team:teams!matches_winner_team_id_fkey(*)
      `)
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as MatchWithTeams
  },

  async deleteMatch(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { error } = await supabase.from('matches').delete().eq('id', id)
    if (error) throw new AppError(error.message, { original: error })
  },

  async bulkCreateMatches(
    matchesData: Array<Omit<Match, 'id' | 'created_at'>>
  ): Promise<Match[]> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase
      .from('matches')
      .insert(matchesData)
      .select()

    if (error) throw new AppError(error.message, { original: error })
    return (data as Match[]) || []
  },

  async getMatchStats(matchId: string): Promise<MatchPlayerStats[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('match_player_stats')
      .select('*')
      .eq('match_id', matchId)

    if (error) {
      console.error('getMatchStats error:', error)
      return []
    }
    return (data as MatchPlayerStats[]) || []
  },

  async saveMatchStats(
    matchId: string,
    stats: Array<{ playerId: string; stats: Record<string, unknown> }>
  ): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    // Upsert or delete & replace for this match
    await supabase.from('match_player_stats').delete().eq('match_id', matchId)

    if (stats.length > 0) {
      const inserts = stats.map((s) => ({
        match_id: matchId,
        player_id: s.playerId,
        stats: s.stats
      }))

      const { error } = await supabase.from('match_player_stats').insert(inserts)
      if (error) throw new AppError(error.message, { original: error })
    }
  },

  subscribeToMatches(
    seasonId: string,
    callback: (matches: MatchWithTeams[]) => void
  ): () => void {
    if (!supabase) return () => {}

    supabaseMatchesService.getMatches(seasonId).then(callback).catch(() => {})

    const sbChannel = supabase
      .channel(`matches_${seasonId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `season_id=eq.${seasonId}`
        },
        () => {
          supabaseMatchesService.getMatches(seasonId).then(callback).catch(() => {})
        }
      )
      .subscribe()

    return () => {
      if (supabase) {
        supabase.removeChannel(sbChannel)
      }
    }
  }
}

export const matchesService: MatchesService = isDemoMode
  ? demoMatchesService
  : supabaseMatchesService

export const getMatches = (seasonId: string, sport?: string) =>
  matchesService.getMatches(seasonId, sport)
export const getMatch = (id: string) => matchesService.getMatch(id)
export const createMatch = (data: Omit<Match, 'id' | 'created_at'>) =>
  matchesService.createMatch(data)
export const updateMatch = (id: string, updates: Partial<Match>) =>
  matchesService.updateMatch(id, updates)
export const deleteMatch = (id: string) => matchesService.deleteMatch(id)
export const bulkCreateMatches = (list: Array<Omit<Match, 'id' | 'created_at'>>) =>
  matchesService.bulkCreateMatches(list)
export const getMatchStats = (matchId: string) => matchesService.getMatchStats(matchId)
export const saveMatchStats = (
  matchId: string,
  stats: Array<{ playerId: string; stats: Record<string, unknown> }>
) => matchesService.saveMatchStats(matchId, stats)
export const subscribeToMatches = (
  seasonId: string,
  callback: (matches: MatchWithTeams[]) => void
) => matchesService.subscribeToMatches(seasonId, callback)
