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
  DEFAULT_SPORTS,
  REALTIME_DEBOUNCE_MS,
  markLocalMutation,
  isRealtimeSuppressed
} from './client'
import type { TeamsService } from './types'
import { getActiveSeason } from './seasons'

const demoTeamsService: TeamsService = {
  async getSports(): Promise<Sport[]> {
    const sports = getLocal<Sport[]>(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
    const order = ['cricket', 'futsal', 'volleyball']
    return [...sports].sort((a, b) => {
      const idxA = order.indexOf(a.id.toLowerCase())
      const idxB = order.indexOf(b.id.toLowerCase())
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB)
    })
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

  async getSportRoleUsageCounts(sportIdOrName: string): Promise<Record<string, number>> {
    const sports = await demoTeamsService.getSports()
    const found = sports.find(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (!found) return {}

    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const counts: Record<string, number> = {}
    for (const role of found.roles) {
      counts[role] = 0
    }
    for (const p of allPlayers) {
      if (p.sport.toLowerCase() === found.name.toLowerCase()) {
        const matchedRole =
          found.roles.find((r) => r.toLowerCase() === p.playing_role.toLowerCase()) ||
          p.playing_role
        counts[matchedRole] = (counts[matchedRole] || 0) + 1
      }
    }
    return counts
  },

  async addSportRole(sportIdOrName: string, roleName: string): Promise<Sport> {
    const trimmed = roleName.trim()
    if (!trimmed) throw new AppError('Role name is required.')

    const allSports = getLocal<Sport[]>(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
    const idx = allSports.findIndex(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (idx === -1) throw new AppError('Sport not found.')

    const sport = allSports[idx]
    if (sport.roles.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
      throw new AppError(`Role "${trimmed}" already exists in ${sport.name}.`)
    }

    const updated: Sport = {
      ...sport,
      roles: [...sport.roles, trimmed]
    }
    allSports[idx] = updated
    setLocal(STORAGE_KEYS.SPORTS, allSports)
    notifyChange('sports_change')
    return updated
  },

  async renameSportRole(
    sportIdOrName: string,
    oldRole: string,
    newRole: string
  ): Promise<{ sport: Sport; updatedPlayersCount: number }> {
    const trimmed = newRole.trim()
    if (!trimmed) throw new AppError('Role name is required.')

    const allSports = getLocal<Sport[]>(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
    const idx = allSports.findIndex(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (idx === -1) throw new AppError('Sport not found.')

    const sport = allSports[idx]
    const roleIdx = sport.roles.findIndex((r) => r.toLowerCase() === oldRole.toLowerCase())
    if (roleIdx === -1) throw new AppError(`Role "${oldRole}" not found in ${sport.name}.`)

    const duplicate = sport.roles.some(
      (r, i) => i !== roleIdx && r.toLowerCase() === trimmed.toLowerCase()
    )
    if (duplicate) {
      throw new AppError(`Role "${trimmed}" already exists in ${sport.name}.`)
    }

    const updatedRoles = [...sport.roles]
    updatedRoles[roleIdx] = trimmed

    const updatedSport: Sport = {
      ...sport,
      roles: updatedRoles
    }
    allSports[idx] = updatedSport
    setLocal(STORAGE_KEYS.SPORTS, allSports)

    // Update playing_role on all existing players rows of that sport that use the old name
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    let updatedPlayersCount = 0
    const updatedPlayers = allPlayers.map((p) => {
      if (
        p.sport.toLowerCase() === sport.name.toLowerCase() &&
        p.playing_role.toLowerCase() === oldRole.toLowerCase()
      ) {
        updatedPlayersCount += 1
        return { ...p, playing_role: trimmed }
      }
      return p
    })

    if (updatedPlayersCount > 0) {
      setLocal(STORAGE_KEYS.PLAYERS, updatedPlayers)
      notifyChange('players_change')
    }
    notifyChange('sports_change')

    return { sport: updatedSport, updatedPlayersCount }
  },

  async reorderSportRoles(sportIdOrName: string, orderedRoles: string[]): Promise<Sport> {
    const allSports = getLocal<Sport[]>(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
    const idx = allSports.findIndex(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (idx === -1) throw new AppError('Sport not found.')

    const updated: Sport = {
      ...allSports[idx],
      roles: orderedRoles
    }
    allSports[idx] = updated
    setLocal(STORAGE_KEYS.SPORTS, allSports)
    notifyChange('sports_change')
    return updated
  },

  async deleteSportRole(sportIdOrName: string, roleName: string): Promise<Sport> {
    const allSports = getLocal<Sport[]>(STORAGE_KEYS.SPORTS, DEFAULT_SPORTS)
    const idx = allSports.findIndex(
      (s) =>
        s.id.toLowerCase() === sportIdOrName.toLowerCase() ||
        s.name.toLowerCase() === sportIdOrName.toLowerCase()
    )
    if (idx === -1) throw new AppError('Sport not found.')

    const sport = allSports[idx]
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const usedCount = allPlayers.filter(
      (p) =>
        p.sport.toLowerCase() === sport.name.toLowerCase() &&
        p.playing_role.toLowerCase() === roleName.toLowerCase()
    ).length

    if (usedCount > 0) {
      throw new AppError(
        `${usedCount} players use this role. Rename it or change those players first.`
      )
    }

    const updated: Sport = {
      ...sport,
      roles: sport.roles.filter((r) => r.toLowerCase() !== roleName.toLowerCase())
    }
    allSports[idx] = updated
    setLocal(STORAGE_KEYS.SPORTS, allSports)
    notifyChange('sports_change')
    return updated
  },

  async getTeams(seasonId: string): Promise<Team[]> {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    return allTeams.filter((t) => t.season_id === seasonId)
  },

  async getPublicTeams(seasonId: string): Promise<PublicTeam[]> {
    let targetSeasonId = seasonId
    if (!targetSeasonId) {
      const activeSeason = await getActiveSeason()
      targetSeasonId = activeSeason?.id || ''
    }
    if (!targetSeasonId) return []

    const teams = await demoTeamsService.getTeams(targetSeasonId)
    return teams.map((t) => ({
      id: t.id,
      season_id: t.season_id,
      sport: t.sport,
      name: t.name,
      short_code: t.short_code,
      color: t.color,
      logo_url: t.logo_url,
      owner_display_name: t.owner_display_name,
      owner_photo_url: t.owner_photo_url,
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
    markLocalMutation(['teams', 'auction'])
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

    markLocalMutation(['teams', 'auction'])
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
    markLocalMutation(['teams', 'auction'])
    allTeams[index] = updated
    setLocal(STORAGE_KEYS.TEAMS, allTeams)
    notifyChange('teams_change')
    return updated
  },

  async deleteTeam(id: string): Promise<void> {
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const targetTeam = allTeams.find((t) => t.id === id)
    const filteredTeams = allTeams.filter((t) => t.id !== id)
    markLocalMutation(['teams', 'players', 'auction'])
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
    let active = true
    let latestReqId = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const runFetch = () => {
      if (!active) return
      const reqId = ++latestReqId
      demoTeamsService
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

    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.event === 'teams_change') {
        scheduleFetch()
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.TEAMS) {
        scheduleFetch()
      }
    }

    if (demoBroadcastChannel) demoBroadcastChannel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      if (demoBroadcastChannel) demoBroadcastChannel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  }
}

const supabaseTeamsService: TeamsService = {
  async getSports(): Promise<Sport[]> {
    if (!supabase) return DEFAULT_SPORTS
    const { data, error } = await supabase.from('sports').select('id, name, roles')
    if (error) {
      console.error('Supabase getSports error:', error.message, error)
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
      .select()
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
      .select()
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
      .select()
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
      .select()
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
      .select()
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
      console.error('Supabase getPublicTeams error:', error.message, error)
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

export const teamsService: TeamsService = isDemoMode
  ? demoTeamsService
  : supabaseTeamsService

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
