import { logError } from '../logger'
import type { PublicTeam, Sport, Team } from '../../types'
import { AppError } from '../errors'
import {
  supabase,
  DEFAULT_SPORTS,
  REALTIME_DEBOUNCE_MS,
  markLocalMutation,
  isRealtimeSuppressed
} from './client'
import type { TeamsService } from './types'
import { getActiveSeason } from './seasons'

const supabaseTeamsService: TeamsService = {
  async getSports(): Promise<Sport[]> {
    if (!supabase) return DEFAULT_SPORTS
    const { data, error } = await supabase
      .from('sports')
      .select('id, name, roles')
      .limit(10)
    if (error) {
      logError('Supabase getSports error:', error.message, error)
      return DEFAULT_SPORTS
    }
    if (!data || data.length === 0) return DEFAULT_SPORTS
    const order = ['cricket', 'futsal', 'volleyball']
    return [...(data as Sport[])].sort((a, b) => {
      const idxA = order.indexOf(a.id.toLowerCase())
      const idxB = order.indexOf(b.id.toLowerCase())
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB)
    })
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

  async getSportRoleUsageCounts(sportIdOrName: string): Promise<Record<string, number>> {
    if (!supabase) return {}
    const sports = await supabaseTeamsService.getSports()
    const found = sports.find(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (!found) return {}

    const counts: Record<string, number> = {}
    for (const role of found.roles) {
      counts[role] = 0
    }

    const { data, error } = await supabase
      .from('players')
      .select('playing_role')
      .ilike('sport', found.name)

    if (error) throw new AppError(error.message, { original: error })

    for (const row of (data as Array<{ playing_role: string }>) || []) {
      const matchedRole =
        found.roles.find((r) => r.toLowerCase() === (row.playing_role || '').toLowerCase()) ||
        row.playing_role
      if (matchedRole) {
        counts[matchedRole] = (counts[matchedRole] || 0) + 1
      }
    }
    return counts
  },

  async addSportRole(sportIdOrName: string, roleName: string): Promise<Sport> {
    if (!supabase) throw new AppError('Supabase not configured')
    const trimmed = roleName.trim()
    if (!trimmed) throw new AppError('Role name is required.')

    const sports = await supabaseTeamsService.getSports()
    const found = sports.find(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (!found) throw new AppError('Sport not found.')

    if (found.roles.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
      throw new AppError(`Role "${trimmed}" already exists in ${found.name}.`)
    }

    const nextRoles = [...found.roles, trimmed]
    const { data, error } = await supabase
      .from('sports')
      .update({ roles: nextRoles })
      .eq('id', found.id)
      .select('id, name, roles')
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as Sport
  },

  async renameSportRole(
    sportIdOrName: string,
    oldRole: string,
    newRole: string
  ): Promise<{ sport: Sport; updatedPlayersCount: number }> {
    if (!supabase) throw new AppError('Supabase not configured')
    const trimmed = newRole.trim()
    if (!trimmed) throw new AppError('Role name is required.')

    const sports = await supabaseTeamsService.getSports()
    const found = sports.find(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (!found) throw new AppError('Sport not found.')

    const roleIdx = found.roles.findIndex((r) => r.toLowerCase() === oldRole.toLowerCase())
    if (roleIdx === -1) throw new AppError(`Role "${oldRole}" not found in ${found.name}.`)

    const duplicate = found.roles.some(
      (r, i) => i !== roleIdx && r.toLowerCase() === trimmed.toLowerCase()
    )
    if (duplicate) {
      throw new AppError(`Role "${trimmed}" already exists in ${found.name}.`)
    }

    // Call atomic RPC rename_sport_role first
    const { data: rpcCount, error: rpcError } = await supabase.rpc('rename_sport_role', {
      p_sport_id: found.id,
      p_old_role: oldRole,
      p_new_role: trimmed
    })

    if (!rpcError) {
      const updatedRoles = [...found.roles]
      updatedRoles[roleIdx] = trimmed
      return {
        sport: { ...found, roles: updatedRoles },
        updatedPlayersCount: typeof rpcCount === 'number' ? rpcCount : 0
      }
    }

    // If RPC function is not yet installed in Supabase (PGRST202 / 42883), execute single-query updates
    const isMissingRpc =
      rpcError.code === 'PGRST202' ||
      rpcError.code === '42883' ||
      (rpcError.message && rpcError.message.includes('rename_sport_role'))

    if (!isMissingRpc) {
      throw new AppError(rpcError.message, { original: rpcError })
    }

    const updatedRoles = [...found.roles]
    updatedRoles[roleIdx] = trimmed

    const { data: updatedSportData, error: sportErr } = await supabase
      .from('sports')
      .update({ roles: updatedRoles })
      .eq('id', found.id)
      .select('id, name, roles')
      .single()

    if (sportErr) throw new AppError(sportErr.message, { original: sportErr })

    const { count, error: playersErr } = await supabase
      .from('players')
      .update({ playing_role: trimmed }, { count: 'exact' })
      .ilike('sport', found.name)
      .ilike('playing_role', oldRole)

    if (playersErr) throw new AppError(playersErr.message, { original: playersErr })

    return {
      sport: updatedSportData as Sport,
      updatedPlayersCount: count ?? 0
    }
  },

  async reorderSportRoles(sportIdOrName: string, orderedRoles: string[]): Promise<Sport> {
    if (!supabase) throw new AppError('Supabase not configured')

    const sports = await supabaseTeamsService.getSports()
    const found = sports.find(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (!found) throw new AppError('Sport not found.')

    const { data, error } = await supabase
      .from('sports')
      .update({ roles: orderedRoles })
      .eq('id', found.id)
      .select('id, name, roles')
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as Sport
  },

  async deleteSportRole(sportIdOrName: string, roleName: string): Promise<Sport> {
    if (!supabase) throw new AppError('Supabase not configured')

    const sports = await supabaseTeamsService.getSports()
    const found = sports.find(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (!found) throw new AppError('Sport not found.')

    // Check usage across all players of this sport
    const { count: usedCount, error: countErr } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .ilike('sport', found.name)
      .ilike('playing_role', roleName)

    if (countErr) throw new AppError(countErr.message, { original: countErr })

    if ((usedCount ?? 0) > 0) {
      throw new AppError(
        `${usedCount} players use this role. Rename it or change those players first.`
      )
    }

    const nextRoles = found.roles.filter((r) => r.toLowerCase() !== roleName.toLowerCase())
    const { data, error } = await supabase
      .from('sports')
      .update({ roles: nextRoles })
      .eq('id', found.id)
      .select('id, name, roles')
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as Sport
  },

  async getTeams(seasonId: string): Promise<Team[]> {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('teams')
      .select(
        'id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, owner_user_id, starting_purse, current_purse, created_at'
      )
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

    markLocalMutation(['teams', 'auction'])
    const { data, error } = await supabase
      .from('teams')
      .insert([
        {
          ...teamData,
          current_purse: teamData.starting_purse
        }
      ])
      .select(
        'id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, owner_user_id, starting_purse, current_purse, created_at'
      )
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

    markLocalMutation(['teams', 'auction'])
    return data as Team
  },

  async updateTeam(id: string, updates: Partial<Team>): Promise<Team> {
    if (!supabase) throw new AppError('Supabase not configured')

    markLocalMutation(['teams', 'auction'])
    const { data, error } = await supabase
      .from('teams')
      .update(updates)
      .eq('id', id)
      .select(
        'id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, owner_user_id, starting_purse, current_purse, created_at'
      )
      .single()

    if (error) throw new AppError(error.message, { original: error })
    markLocalMutation(['teams', 'auction'])
    return data as Team
  },

  async deleteTeam(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    markLocalMutation(['teams', 'players', 'auction'])
    await supabase
      .from('players')
      .update({ team_id: null, status: 'available', purchase_price: null })
      .eq('team_id', id)

    const { data: pState } = await supabase
      .from('projector_state')
      .select('season_id, team_id')
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
    markLocalMutation(['teams', 'players', 'auction'])
  },

  async getPublicTeams(seasonId: string): Promise<PublicTeam[]> {
    if (!supabase) return []
    let targetSeasonId = seasonId
    if (!targetSeasonId) {
      const activeSeason = await getActiveSeason()
      targetSeasonId = activeSeason?.id || ''
    }
    if (!targetSeasonId) return []

    const { data, error } = await supabase
      .from('public_teams')
      .select(
        'id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, created_at'
      )
      .eq('season_id', targetSeasonId)
      .order('name', { ascending: true })

    if (error) {
      logError('Supabase getPublicTeams error:', error.message, error)
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

    markLocalMutation(['teams', 'auction'])
    const { data, error } = await supabase
      .from('teams')
      .insert(inserts)
      .select(
        'id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, owner_user_id, starting_purse, current_purse, created_at'
      )
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

    markLocalMutation(['teams', 'auction'])
    return createdTeams
  },

  subscribeToTeams(seasonId: string, callback: (teams: Team[]) => void): () => void {
    if (!supabase) return () => {}

    let active = true
    let latestReqId = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const runFetch = () => {
      if (!active) return
      const reqId = ++latestReqId
      supabaseTeamsService
        .getTeams(seasonId)
        .then((res) => {
          if (active && reqId === latestReqId) {
            callback(res)
          }
        })
        .catch(() => {})
    }

    const scheduleFetch = () => {
      if (!active || isRealtimeSuppressed('teams')) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!active || isRealtimeSuppressed('teams')) return
        runFetch()
      }, REALTIME_DEBOUNCE_MS)
    }

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
          scheduleFetch()
        }
      )
      .subscribe()

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      if (supabase) {
        supabase.removeChannel(sbChannel)
      }
    }
  }
}

export const teamsService: TeamsService = supabaseTeamsService

export const getSports = () => teamsService.getSports()
export const getRolesForSport = (sportNameOrId: string) =>
  teamsService.getRolesForSport(sportNameOrId)
export const addSportRole = (sportIdOrName: string, roleName: string) =>
  teamsService.addSportRole(sportIdOrName, roleName)
export const renameSportRole = (sportIdOrName: string, oldRole: string, newRole: string) =>
  teamsService.renameSportRole(sportIdOrName, oldRole, newRole)
export const reorderSportRoles = (sportIdOrName: string, orderedRoles: string[]) =>
  teamsService.reorderSportRoles(sportIdOrName, orderedRoles)
export const deleteSportRole = (sportIdOrName: string, roleName: string) =>
  teamsService.deleteSportRole(sportIdOrName, roleName)
export const getSportRoleUsageCounts = (sportIdOrName: string) =>
  teamsService.getSportRoleUsageCounts(sportIdOrName)
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

export interface OwnerLoginResult {
  success: boolean
  login_id?: string | null
  message?: string
}

export async function manageOwnerLogin(params: {
  action: 'status' | 'set' | 'remove'
  team_id: string
  login_id?: string
  password?: string
}): Promise<OwnerLoginResult> {
  if (!supabase) {
    throw new AppError('Supabase client not initialized')
  }

  const { data, error } = await supabase.functions.invoke('manage-owner', {
    body: {
      action: params.action,
      team_id: params.team_id,
      login_id: params.login_id,
      password: params.password
    }
  })

  if (error) {
    let msg = error.message
    if (data && typeof data === 'object' && typeof (data as any).error === 'string') {
      msg = (data as any).error
    } else if ((error as any).context && typeof (error as any).context.json === 'function') {
      try {
        const body = await (error as any).context.json()
        if (body?.error) msg = body.error
      } catch {
        // ignore
      }
    }
    throw new AppError(msg)
  }

  if (data && typeof data === 'object' && (data as any).error) {
    throw new AppError((data as any).error)
  }

  return {
    success: true,
    login_id: data?.login_id ?? (data?.user?.login_id || null),
    message: data?.message
  }
}

