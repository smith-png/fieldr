import type { Player, ProjectorState, PublicTeam, PurseTransaction, Sport, Team } from '../../types'
import { AppError } from '../errors'
import {
  isDemoMode,
  supabase,
  getLocal,
  setLocal,
  notifyChange,
  demoBroadcastChannel,
  STORAGE_KEYS,
  DEFAULT_SPORTS
} from './client'
import type { TeamsService } from './types'
import { getActiveSeason } from './seasons'

const demoTeamsService: TeamsService = {
  async getSports(): Promise<Sport[]> {
    return getLocal<Sport[]>(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
  },

  async getRolesForSport(sportNameOrId: string): Promise<string[]> {
    const sports = await demoTeamsService.getSports()
    const found = sports.find(
      (s) =>
        s.id.toLowerCase() === sportNameOrId.toLowerCase() ||
        s.name.toLowerCase() === sportNameOrId.toLowerCase()
    )
    return found?.roles || []
  },

  async getTeams(seasonId: string): Promise<Team[]> {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    return allTeams.filter((t) => t.season_id === seasonId)
  },

  async getPublicTeams(seasonId: string): Promise<PublicTeam[]> {
    const teams = await demoTeamsService.getTeams(seasonId)
    return teams.map((t) => ({
      id: t.id,
      season_id: t.season_id,
      sport: t.sport,
      name: t.name,
      short_code: t.short_code,
      color: t.color,
      logo_url: t.logo_url,
      owner_display_name: t.owner_display_name,
      created_at: t.created_at
    }))
  },

  async getActiveTeams(): Promise<Team[]> {
    const activeSeason = await getActiveSeason()
    if (!activeSeason) return []
    return demoTeamsService.getTeams(activeSeason.id)
  },

  async createTeam(
    teamData: Omit<Team, 'id' | 'current_purse' | 'created_at'>
  ): Promise<Team> {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const newTeam: Team = {
      ...teamData,
      id: `team-${Date.now()}`,
      current_purse: teamData.starting_purse,
      created_at: new Date().toISOString()
    }
    allTeams.push(newTeam)
    setLocal(STORAGE_KEYS.TEAMS, allTeams)

    // Initial purse transaction
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
  },

  async bulkCreateTeams(
    teamsData: Array<Omit<Team, 'id' | 'current_purse' | 'created_at'>>
  ): Promise<Team[]> {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
    const created: Team[] = []

    for (let i = 0; i < teamsData.length; i++) {
      const td = teamsData[i]
      const newTeam: Team = {
        ...td,
        id: `team-${Date.now()}-${i}`,
        current_purse: td.starting_purse,
        created_at: new Date().toISOString()
      }
      created.push(newTeam)
      allTx.unshift({
        id: `tx-${Date.now()}-${i}`,
        season_id: td.season_id,
        team_id: newTeam.id,
        type: 'initial',
        amount: newTeam.starting_purse,
        balance_after: newTeam.starting_purse,
        reason: 'Initial team purse',
        created_at: new Date().toISOString(),
        created_by: 'admin'
      })
    }

    allTeams.push(...created)
    setLocal(STORAGE_KEYS.TEAMS, allTeams)
    setLocal(STORAGE_KEYS.TRANSACTIONS, allTx)
    notifyChange('teams_change')
    return created
  },

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team> {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const index = allTeams.findIndex((t) => t.id === id)
    if (index === -1) throw new AppError('Team not found')

    const updated = { ...allTeams[index], ...updates }
    allTeams[index] = updated
    setLocal(STORAGE_KEYS.TEAMS, allTeams)
    notifyChange('teams_change')
    return updated
  },

  async deleteTeam(id: string): Promise<void> {
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
  },

  subscribeToTeams(seasonId: string, callback: (teams: Team[]) => void): () => void {
    const handleUpdate = () => {
      demoTeamsService.getTeams(seasonId).then(callback).catch(() => {})
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

    if (demoBroadcastChannel) demoBroadcastChannel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)
    handleUpdate()

    return () => {
      if (demoBroadcastChannel) demoBroadcastChannel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  }
}

const supabaseTeamsService: TeamsService = {
  async getSports(): Promise<Sport[]> {
    if (!supabase) return DEFAULT_SPORTS
    const { data, error } = await supabase.from('sports').select('*')
    if (error || !data || data.length === 0) return DEFAULT_SPORTS
    return data as Sport[]
  },

  async getRolesForSport(sportNameOrId: string): Promise<string[]> {
    const sports = await supabaseTeamsService.getSports()
    const found = sports.find(
      (s) =>
        s.id.toLowerCase() === sportNameOrId.toLowerCase() ||
        s.name.toLowerCase() === sportNameOrId.toLowerCase()
    )
    return found?.roles || []
  },

  async getTeams(seasonId: string): Promise<Team[]> {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('season_id', seasonId)
      .order('name', { ascending: true })

    if (error) throw new AppError(error.message, { original: error })
    return (data as Team[]) || []
  },

  async getActiveTeams(): Promise<Team[]> {
    const activeSeason = await getActiveSeason()
    if (!activeSeason) return []
    return supabaseTeamsService.getTeams(activeSeason.id)
  },

  async createTeam(
    teamData: Omit<Team, 'id' | 'current_purse' | 'created_at'>
  ): Promise<Team> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase
      .from('teams')
      .insert([
        {
          ...teamData,
          current_purse: teamData.starting_purse
        }
      ])
      .select()
      .single()

    if (error) throw new AppError(error.message, { original: error })

    await supabase.from('purse_transactions').insert([
      {
        season_id: teamData.season_id,
        team_id: data.id,
        type: 'initial',
        amount: data.starting_purse,
        balance_after: data.starting_purse,
        reason: 'Initial team purse',
        created_by: 'admin'
      }
    ])

    return data as Team
  },

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as Team
  },

  async deleteTeam(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    await supabase
      .from('players')
      .update({ team_id: null, status: 'available', purchase_price: null })
      .eq('team_id', id)

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
    if (error) throw new AppError(error.message, { original: error })
  },

  async getPublicTeams(seasonId: string): Promise<PublicTeam[]> {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('public_teams')
      .select('*')
      .eq('season_id', seasonId)
      .order('name', { ascending: true })

    if (error) {
      console.error('getPublicTeams error:', error)
      return []
    }
    return (data as PublicTeam[]) || []
  },

  async bulkCreateTeams(
    teamsData: Array<Omit<Team, 'id' | 'current_purse' | 'created_at'>>
  ): Promise<Team[]> {
    if (!supabase) throw new AppError('Supabase not configured')

    const inserts = teamsData.map((td) => ({
      ...td,
      current_purse: td.starting_purse
    }))

    const { data, error } = await supabase.from('teams').insert(inserts).select()
    if (error) throw new AppError(error.message, { original: error })

    const createdTeams = (data as Team[]) || []
    if (createdTeams.length > 0) {
      const txInserts = createdTeams.map((t) => ({
        season_id: t.season_id,
        team_id: t.id,
        type: 'initial' as const,
        amount: t.starting_purse,
        balance_after: t.starting_purse,
        reason: 'Initial team purse',
        created_by: 'admin'
      }))
      await supabase.from('purse_transactions').insert(txInserts)
    }

    return createdTeams
  },

  subscribeToTeams(seasonId: string, callback: (teams: Team[]) => void): () => void {
    if (!supabase) return () => {}

    supabaseTeamsService.getTeams(seasonId).then(callback).catch(() => {})

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
          supabaseTeamsService.getTeams(seasonId).then(callback).catch(() => {})
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

export const teamsService: TeamsService = isDemoMode
  ? demoTeamsService
  : supabaseTeamsService

export const getSports = () => teamsService.getSports()
export const getRolesForSport = (sportNameOrId: string) =>
  teamsService.getRolesForSport(sportNameOrId)
export const getTeams = (seasonId: string) => teamsService.getTeams(seasonId)
export const getPublicTeams = (seasonId: string) => teamsService.getPublicTeams(seasonId)
export const getActiveTeams = () => teamsService.getActiveTeams()
export const createTeam = (
  teamData: Omit<Team, 'id' | 'current_purse' | 'created_at'>
) => teamsService.createTeam(teamData)
export const bulkCreateTeams = (
  teamsData: Array<Omit<Team, 'id' | 'current_purse' | 'created_at'>>
) => teamsService.bulkCreateTeams(teamsData)
export const updateTeam = (id: string, updates: Partial<Team>) =>
  teamsService.updateTeam(id, updates)
export const deleteTeam = (id: string) => teamsService.deleteTeam(id)
export const subscribeToTeams = (
  seasonId: string,
  callback: (teams: Team[]) => void
) => teamsService.subscribeToTeams(seasonId, callback)
