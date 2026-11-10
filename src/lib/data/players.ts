import type {
  Athlete,
  Player,
  PlayerStatus,
  ProjectorState,
  PublicPlayer,
  PurseTransaction,
  Season,
  Team
} from '../../types'
import { AppError } from '../errors'
import {
  isDemoMode,
  supabase,
  getLocal,
  setLocal,
  notifyChange,
  demoBroadcastChannel,
  STORAGE_KEYS,
  getNextPlayerCode,
  formatAthleteCode,
  getNextAthleteCode
} from './client'
import { getActiveSeason } from './seasons'
import { deletePlayerPhotoAssets, uploadPlayerPhotos } from './storage'
import type {
  PlayersPagedParams,
  PlayersPagedResult,
  PlayersService,
  PublicPlayersPagedParams,
  PublicPlayersPagedResult
} from './types'

const demoPlayersService: PlayersService = {
  async getPlayers(seasonId: string): Promise<Player[]> {
    try {
      if (!seasonId) return []
      const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
      return Array.isArray(allPlayers)
        ? allPlayers.filter((p) => p && p.season_id === seasonId)
        : []
    } catch {
      return []
    }
  },

  async getPlayersPaged(params: PlayersPagedParams): Promise<PlayersPagedResult> {
    const { seasonId, page, pageSize, search, sport, role, status } = params
    const offset = (page - 1) * pageSize

    let list = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter(
      (p) => p.season_id === seasonId
    )

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (p) =>
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
  },

  async getPublicPlayersPaged(
    params: PublicPlayersPagedParams
  ): Promise<PublicPlayersPagedResult> {
    const { sport, role: playingRole, academicYear, cursor, pageSize = 12 } = params
    const offset = cursor ? parseInt(cursor, 10) : 0
    const limit = pageSize

    const activeSeason = (getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])).find((s) => s.is_active)
    if (!activeSeason) return { players: [], hasMore: false }

    let list = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter(
      (p) =>
        p.season_id === activeSeason.id &&
        (!sport || p.sport.toLowerCase() === sport.toLowerCase())
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
      athlete_code: p.athlete_code,
      athlete_id: p.athlete_id,
      name: p.name,
      photo_thumb_url: p.photo_thumb_url || p.photo_url,
      photo_url: p.photo_url,
      academic_year: p.academic_year || '1st',
      sport: p.sport,
      playing_role: p.playing_role,
      season_id: p.season_id,
      status: p.status,
      team_id: p.team_id,
      base_points: p.base_points,
      purchase_price: p.purchase_price
    }))

    const nextOffset = offset + sliced.length
    return {
      players: publicList,
      nextCursor: nextOffset < totalCount ? String(nextOffset) : undefined,
      hasMore: nextOffset < totalCount
    }
  },

  async createPlayer(
    playerData: Omit<Player, 'id' | 'player_code' | 'created_at'>,
    options?: { photoFile?: File }
  ): Promise<Player> {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])

    let photoUrl = playerData.photo_url
    let photoThumbUrl = playerData.photo_thumb_url

    if (options?.photoFile) {
      const uploadRes = await uploadPlayerPhotos(options.photoFile)
      photoUrl = uploadRes.photoUrl
      photoThumbUrl = uploadRes.thumbUrl
    }

    let athlete: Athlete | undefined

    if (playerData.athlete_id) {
      athlete = allAthletes.find((a) => a.id === playerData.athlete_id)
      if (!athlete) throw new AppError('Linked athlete profile not found')
    } else {
      // Find by exact name or create new athlete
      const existing = allAthletes.find(
        (a) => a.name.trim().toLowerCase() === playerData.name.trim().toLowerCase()
      )
      if (existing) {
        athlete = existing
      } else {
        const nextCode = getNextAthleteCode(allAthletes)
        athlete = {
          id: `ath-${Date.now()}-${nextCode}`,
          athlete_code: nextCode,
          name: playerData.name.trim(),
          photo_url: photoUrl,
          photo_thumb_url: photoThumbUrl,
          roll_no: playerData.roll_no?.trim(),
          notes: playerData.notes?.trim(),
          created_at: new Date().toISOString()
        }
        allAthletes.push(athlete)
        setLocal(STORAGE_KEYS.ATHLETES, allAthletes)
        notifyChange('athletes_change')
      }
    }

    // Check unique constraint: athlete cannot have two entries in the same season for the same sport
    const duplicate = allPlayers.some(
      (p) =>
        p.season_id === playerData.season_id &&
        p.athlete_id === athlete!.id &&
        p.sport.toLowerCase() === playerData.sport.toLowerCase()
    )
    if (duplicate) {
      throw new AppError(
        `Athlete ${athlete.name} is already registered in ${playerData.sport} for this season.`
      )
    }

    const playerCode = formatAthleteCode(athlete.athlete_code)

    const newPlayer: Player = {
      ...playerData,
      athlete_id: athlete.id,
      athlete_code: athlete.athlete_code,
      name: athlete.name,
      photo_url: photoUrl || athlete.photo_url,
      photo_thumb_url: photoThumbUrl || athlete.photo_thumb_url,
      id: `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      player_code: playerCode,
      academic_year: playerData.academic_year || '1st',
      created_at: new Date().toISOString()
    }

    allPlayers.push(newPlayer)
    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    notifyChange('players_change')
    return newPlayer
  },

  async bulkCreatePlayers(
    playersData: Array<Omit<Player, 'id' | 'player_code' | 'created_at'>>
  ): Promise<Player[]> {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const createdList: Player[] = []

    for (let i = 0; i < playersData.length; i++) {
      const pd = playersData[i]
      let athlete: Athlete | undefined

      if (pd.athlete_id) {
        athlete = allAthletes.find((a) => a.id === pd.athlete_id)
      } else if (pd.athlete_code) {
        athlete = allAthletes.find((a) => a.athlete_code === pd.athlete_code)
      }

      if (!athlete) {
        const existing = allAthletes.find(
          (a) => a.name.trim().toLowerCase() === pd.name.trim().toLowerCase()
        )
        if (existing) {
          athlete = existing
        } else {
          const nextCode = getNextAthleteCode(allAthletes)
          athlete = {
            id: `ath-${Date.now()}-${nextCode}`,
            athlete_code: nextCode,
            name: pd.name.trim(),
            photo_url: pd.photo_url,
            photo_thumb_url: pd.photo_thumb_url,
            roll_no: pd.roll_no?.trim(),
            notes: pd.notes?.trim(),
            created_at: new Date().toISOString()
          }
          allAthletes.push(athlete)
        }
      }

      // Check duplicate
      const isDup = allPlayers
        .concat(createdList)
        .some(
          (p) =>
            p.season_id === pd.season_id &&
            p.athlete_id === athlete!.id &&
            p.sport.toLowerCase() === pd.sport.toLowerCase()
        )
      if (isDup) continue

      const newPlayer: Player = {
        ...pd,
        athlete_id: athlete.id,
        athlete_code: athlete.athlete_code,
        name: athlete.name,
        photo_url: pd.photo_url || athlete.photo_url,
        photo_thumb_url: pd.photo_thumb_url || athlete.photo_thumb_url,
        id: `player-${Date.now()}-${i}`,
        player_code: formatAthleteCode(athlete.athlete_code),
        academic_year: pd.academic_year || '1st',
        created_at: new Date().toISOString()
      }
      createdList.push(newPlayer)
    }

    setLocal(STORAGE_KEYS.ATHLETES, allAthletes)
    allPlayers.push(...createdList)
    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    notifyChange('athletes_change')
    notifyChange('players_change')
    return createdList
  },

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player> {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const index = allPlayers.findIndex((p) => p.id === id)
    if (index === -1) throw new AppError('Player not found')

    const updated = { ...allPlayers[index], ...updates }
    allPlayers[index] = updated
    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    notifyChange('players_change')
    return updated
  },

  async deletePlayer(id: string): Promise<void> {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const targetPlayer = allPlayers.find((p) => p.id === id)
    const filteredPlayers = allPlayers.filter((p) => p.id !== id)
    setLocal(STORAGE_KEYS.PLAYERS, filteredPlayers)

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
  },

  async exportPlayersForSport(seasonId: string, sport?: string): Promise<Player[]> {
    let list = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter(
      (p) => p.season_id === seasonId
    )
    if (sport && sport !== 'all') {
      list = list.filter((p) => p.sport.toLowerCase() === sport.toLowerCase())
    }
    list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    return list
  },

  async assignPlayerToTeam(
    playerId: string,
    teamId: string,
    price = 0
  ): Promise<{ player: Player; team: Team }> {
    const purchasePrice = price > 0 ? price : 0

    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

    const player = allPlayers.find((p) => p.id === playerId)
    const team = allTeams.find((t) => t.id === teamId)

    if (!player) throw new AppError('Player not found')
    if (!team) throw new AppError('Team not found')

    if (player.status === 'sold') {
      throw new AppError('Player already assigned')
    }

    if (player.sport.toLowerCase() !== team.sport.toLowerCase()) {
      throw new AppError(
        `Sport mismatch: Player is in ${player.sport}, Team is in ${team.sport}`
      )
    }

    if (purchasePrice > 0) {
      if (team.current_purse < purchasePrice) {
        throw new AppError(
          `Insufficient purse balance. Team only has ${team.current_purse} points available, price is ${purchasePrice}`
        )
      }
      team.current_purse -= purchasePrice

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
  },

  async unassignPlayerFromTeam(
    playerId: string
  ): Promise<{ player: Player; team: Team | null }> {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

    const player = allPlayers.find((p) => p.id === playerId)
    if (!player) throw new AppError('Player not found')

    const prevTeamId = player.team_id
    let team: Team | null = null

    if (prevTeamId) {
      const found = allTeams.find((t) => t.id === prevTeamId)
      if (found) team = found
    }

    player.team_id = null
    player.status = 'available'
    player.purchase_price = null

    setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
    notifyChange('players_change')
    notifyChange('teams_change')
    return { player, team }
  },

  subscribeToPlayers(seasonId: string, callback: (players: Player[]) => void): () => void {
    const handleUpdate = () => {
      demoPlayersService.getPlayers(seasonId).then(callback).catch(() => {})
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

    if (demoBroadcastChannel) demoBroadcastChannel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)
    handleUpdate()

    return () => {
      if (demoBroadcastChannel) demoBroadcastChannel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  }
}

const supabasePlayersService: PlayersService = {
  async getPlayers(seasonId: string): Promise<Player[]> {
    try {
      if (!seasonId) return []
      if (!supabase) return []
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('season_id', seasonId)
        .order('name', { ascending: true })

      if (error) {
        console.error('getPlayers error from Supabase:', error)
        return []
      }
      return Array.isArray(data) ? (data as Player[]) : []
    } catch (err) {
      console.error('getPlayers caught error:', err)
      return []
    }
  },

  async getPlayersPaged(params: PlayersPagedParams): Promise<PlayersPagedResult> {
    const { seasonId, page, pageSize, search, sport, role, status } = params
    const offset = (page - 1) * pageSize

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
    if (error) throw new AppError(error.message, { original: error })

    const totalCount = count || 0
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

    return {
      players: (data as Player[]) || [],
      totalCount,
      totalPages
    }
  },

  async getPublicPlayersPaged(
    params: PublicPlayersPagedParams
  ): Promise<PublicPlayersPagedResult> {
    const { sport, role: playingRole, academicYear, cursor, pageSize = 12 } = params
    const offset = cursor ? parseInt(cursor, 10) : 0
    const limit = pageSize

    if (!supabase) return { players: [], hasMore: false }

    const activeSeason = await getActiveSeason()
    if (!activeSeason) return { players: [], hasMore: false }

    let query = supabase
      .from('public_players')
      .select(
        'id, player_code, athlete_code, athlete_id, name, photo_thumb_url, photo_url, academic_year, sport, playing_role, season_id, status, team_id, base_points, purchase_price',
        { count: 'exact' }
      )
      .eq('season_id', activeSeason.id)

    if (sport && sport !== 'all') {
      query = query.ilike('sport', sport)
    }

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
    if (error) throw new AppError(error.message, { original: error })

    const totalCount = count || 0
    const players = (data as PublicPlayer[]) || []
    const nextOffset = offset + players.length

    return {
      players,
      nextCursor: nextOffset < totalCount ? String(nextOffset) : undefined,
      hasMore: nextOffset < totalCount
    }
  },

  async createPlayer(
    playerData: Omit<Player, 'id' | 'player_code' | 'created_at'>,
    options?: { photoFile?: File }
  ): Promise<Player> {
    if (!supabase) throw new AppError('Supabase not configured')

    let photoUrl = playerData.photo_url
    let photoThumbUrl = playerData.photo_thumb_url

    if (options?.photoFile) {
      const uploadRes = await uploadPlayerPhotos(options.photoFile)
      photoUrl = uploadRes.photoUrl
      photoThumbUrl = uploadRes.thumbUrl
    }

    let athleteId = playerData.athlete_id

    if (!athleteId) {
      const trimmedName = playerData.name.trim()
      const { data: existingAth } = await supabase
        .from('athletes')
        .select('id')
        .ilike('name', trimmedName)
        .maybeSingle()

      if (existingAth) {
        athleteId = existingAth.id
      } else {
        const { data: newAth, error: athErr } = await supabase
          .from('athletes')
          .insert([
            {
              name: trimmedName,
              photo_url: photoUrl || null,
              photo_thumb_url: photoThumbUrl || null,
              roll_no: playerData.roll_no?.trim() || null,
              notes: playerData.notes?.trim() || null
            }
          ])
          .select('id')
          .single()

        if (athErr) throw new AppError(athErr.message, { original: athErr })
        athleteId = newAth.id
      }
    }

    const { data, error } = await supabase
      .from('players')
      .insert([
        {
          ...playerData,
          athlete_id: athleteId,
          photo_url: photoUrl,
          photo_thumb_url: photoThumbUrl
        }
      ])
      .select()
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as Player
  },

  async bulkCreatePlayers(
    playersData: Array<Omit<Player, 'id' | 'player_code' | 'created_at'>>
  ): Promise<Player[]> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase
      .from('players')
      .insert(playersData)
      .select()

    if (error) throw new AppError(error.message, { original: error })
    return (data as Player[]) || []
  },

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase
      .from('players')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as Player
  },

  async deletePlayer(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

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

    const { data: playerToDelete } = await supabase
      .from('players')
      .select('photo_url, photo_thumb_url')
      .eq('id', id)
      .single()

    if (playerToDelete) {
      await deletePlayerPhotoAssets(
        playerToDelete.photo_url,
        playerToDelete.photo_thumb_url
      )
    }

    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) throw new AppError(error.message, { original: error })
  },

  async exportPlayersForSport(seasonId: string, sport?: string): Promise<Player[]> {
    const result: Player[] = []
    const batchSize = 1000

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
      if (error) throw new AppError(error.message, { original: error })

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
  },

  async assignPlayerToTeam(
    playerId: string,
    teamId: string,
    price = 0
  ): Promise<{ player: Player; team: Team }> {
    const purchasePrice = price > 0 ? price : 0

    if (!supabase) throw new AppError('Supabase not configured')

    const { error: rpcErr } = await supabase.rpc('assign_player_to_team', {
      p_player_id: playerId,
      p_team_id: teamId,
      p_price: purchasePrice
    })
    if (rpcErr) throw new AppError(rpcErr.message, { original: rpcErr })

    const { data: updatedPlayer, error: pErr } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single()
    if (pErr || !updatedPlayer) {
      throw new AppError(pErr?.message || 'Player not found', { original: pErr })
    }

    const { data: updatedTeam, error: tErr } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single()
    if (tErr || !updatedTeam) {
      throw new AppError(tErr?.message || 'Team not found', { original: tErr })
    }

    return { player: updatedPlayer as Player, team: updatedTeam as Team }
  },

  async unassignPlayerFromTeam(
    playerId: string
  ): Promise<{ player: Player; team: Team | null }> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data: pData } = await supabase
      .from('players')
      .select('team_id')
      .eq('id', playerId)
      .single()
    const prevTeamId = pData?.team_id

    const { error: rpcErr } = await supabase.rpc('unassign_player_from_team', {
      p_player_id: playerId
    })
    if (rpcErr) throw new AppError(rpcErr.message, { original: rpcErr })

    const { data: updatedPlayer, error: pErr } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single()
    if (pErr || !updatedPlayer) {
      throw new AppError(pErr?.message || 'Player not found', { original: pErr })
    }

    let updatedTeam: Team | null = null
    if (prevTeamId) {
      const { data: t } = await supabase
        .from('teams')
        .select('*')
        .eq('id', prevTeamId)
        .single()
      if (t) updatedTeam = t as Team
    }

    return { player: updatedPlayer as Player, team: updatedTeam }
  },

  subscribeToPlayers(seasonId: string, callback: (players: Player[]) => void): () => void {
    if (!supabase) return () => {}

    supabasePlayersService.getPlayers(seasonId).then(callback).catch(() => {})

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
          supabasePlayersService.getPlayers(seasonId).then(callback).catch(() => {})
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

export const playersService: PlayersService = isDemoMode
  ? demoPlayersService
  : supabasePlayersService

export const getPlayers = (seasonId: string) => playersService.getPlayers(seasonId)
export const getPlayersPaged = (params: PlayersPagedParams) =>
  playersService.getPlayersPaged(params)

// Backward-compatible getPublicPlayersPaged wrapper supporting offset/limit or cursor
export async function getPublicPlayersPaged(
  params:
    | PublicPlayersPagedParams
    | {
        sport: string
        academicYear?: string
        playingRole?: string
        offset: number
        limit: number
      }
): Promise<{ players: PublicPlayer[]; totalCount: number; hasMore: boolean }> {
  if ('offset' in params) {
    const res = await playersService.getPublicPlayersPaged({
      seasonId: '',
      sport: params.sport,
      role: params.playingRole,
      academicYear: params.academicYear,
      cursor: String(params.offset),
      pageSize: params.limit
    })
    return {
      players: res.players,
      totalCount: 0,
      hasMore: res.hasMore
    }
  }
  const res = await playersService.getPublicPlayersPaged(params)
  return {
    players: res.players,
    totalCount: 0,
    hasMore: res.hasMore
  }
}

export const createPlayer = (
  data: Omit<Player, 'id' | 'player_code' | 'created_at'>,
  options?: { photoFile?: File }
) => playersService.createPlayer(data, options)
export const bulkCreatePlayers = (
  list: Array<Omit<Player, 'id' | 'player_code' | 'created_at'>>
) => playersService.bulkCreatePlayers(list)
export const updatePlayer = (id: string, updates: Partial<Player>) =>
  playersService.updatePlayer(id, updates)
export const deletePlayer = (id: string) => playersService.deletePlayer(id)
export const exportPlayersForSport = (seasonId: string, sport?: string) =>
  playersService.exportPlayersForSport(seasonId, sport)
export const assignPlayerToTeam = (playerId: string, teamId: string, price?: number) =>
  playersService.assignPlayerToTeam(playerId, teamId, price || 0)
export const unassignPlayerFromTeam = (playerId: string, _refundToPurse?: boolean) =>
  playersService.unassignPlayerFromTeam(playerId)
export const subscribeToPlayers = (
  seasonId: string,
  callback: (players: Player[]) => void
) => playersService.subscribeToPlayers(seasonId, callback)
