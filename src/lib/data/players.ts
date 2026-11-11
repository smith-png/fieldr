import type {
  Athlete,
  Player,
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
  formatAthleteCode,
  parseAthleteCode,
  getNextAthleteCode
} from './client'
import { getActiveSeason } from './seasons'
import type {
  BulkRegisterParams,
  BulkRegisterResult,
  BulkRegisterSkippedItem,
  PlayersPagedParams,
  PlayersPagedResult,
  PlayersService,
  PublicPlayersPagedParams,
  PublicPlayersPagedResult
} from './types'

function mapJoinedPlayer(row: Record<string, unknown>, pubRow?: PublicPlayer, athRow?: Athlete): Player {
  const embeddedAth = Array.isArray(row.athletes)
    ? (row.athletes[0] as Athlete | undefined)
    : (row.athletes as Athlete | undefined)
  const ath = athRow || embeddedAth

  const rawCode =
    ath?.athlete_code ??
    pubRow?.athlete_code ??
    (typeof row.athlete_code === 'number' ? row.athlete_code : undefined)

  const formattedCode =
    rawCode !== undefined && rawCode !== null
      ? formatAthleteCode(rawCode)
      : String(pubRow?.player_code || row.player_code || '0001')

  return {
    id: String(row.id || pubRow?.id || ''),
    season_id: String(row.season_id || pubRow?.season_id || ''),
    athlete_id: String(row.athlete_id || pubRow?.athlete_id || ath?.id || '') || undefined,
    athlete_code: rawCode,
    player_code: formattedCode,
    name: String(ath?.name || pubRow?.name || row.name || 'Unnamed Athlete'),
    sport: String(row.sport || pubRow?.sport || 'Cricket'),
    playing_role: String(row.playing_role || pubRow?.playing_role || 'Player'),
    academic_year: ((row.academic_year || pubRow?.academic_year || ath?.academic_year || '1st') as Player['academic_year']),
    roll_no: ath?.roll_no ?? (row.roll_no ? String(row.roll_no) : undefined),
    photo_url: ath?.photo_url || pubRow?.photo_url || (row.photo_url ? String(row.photo_url) : undefined),
    photo_thumb_url:
      ath?.photo_thumb_url ||
      pubRow?.photo_thumb_url ||
      (row.photo_thumb_url ? String(row.photo_thumb_url) : undefined),
    base_points: typeof row.base_points === 'number' ? row.base_points : 100,
    status: (row.status as Player['status']) || pubRow?.status || 'available',
    team_id: (row.team_id as string | null) ?? pubRow?.team_id ?? null,
    purchase_price: typeof row.purchase_price === 'number' ? row.purchase_price : null,
    created_at: row.created_at ? String(row.created_at) : undefined
  }
}

const demoPlayersService: PlayersService = {
  async getPlayers(seasonId: string): Promise<Player[]> {
    try {
      if (!seasonId) return []
      const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
      const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
      const athMap = new Map<string, Athlete>()
      for (const a of allAthletes) athMap.set(a.id, a)

      return Array.isArray(allPlayers)
        ? allPlayers
            .filter((p) => p && p.season_id === seasonId)
            .map((p) => {
              const ath = p.athlete_id ? athMap.get(p.athlete_id) : undefined
              return {
                ...p,
                name: ath?.name || p.name,
                athlete_code: ath?.athlete_code ?? p.athlete_code,
                player_code: formatAthleteCode(ath?.athlete_code ?? p.player_code),
                photo_url: ath?.photo_url ?? p.photo_url,
                photo_thumb_url: ath?.photo_thumb_url ?? p.photo_thumb_url,
                roll_no: ath?.roll_no ?? p.roll_no
              }
            })
        : []
    } catch {
      return []
    }
  },

  async getPlayersPaged(params: PlayersPagedParams): Promise<PlayersPagedResult> {
    const { seasonId, page, pageSize, search, sport, role, status } = params
    const offset = (page - 1) * pageSize

    let list = await demoPlayersService.getPlayers(seasonId)

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      const parsedCode = parseAthleteCode(q)
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (parsedCode !== null && p.athlete_code === parsedCode) ||
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

    const activeSeason = getLocal<Season[]>(STORAGE_KEYS.SEASONS, []).find((s) => s.is_active)
    if (!activeSeason) return { players: [], hasMore: false }

    const seasonPlayers = await demoPlayersService.getPlayers(activeSeason.id)
    let list = seasonPlayers.filter(
      (p) => !sport || p.sport.toLowerCase() === sport.toLowerCase()
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
      team_id: p.team_id
    }))

    const nextOffset = offset + sliced.length
    return {
      players: publicList,
      nextCursor: nextOffset < totalCount ? String(nextOffset) : undefined,
      hasMore: nextOffset < totalCount
    }
  },

  async createPlayer(
    playerData: Omit<Player, 'id' | 'player_code' | 'created_at'>
  ): Promise<Player> {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])

    if (!playerData.athlete_id) {
      throw new AppError('Please select an athlete profile first.')
    }

    const athlete = allAthletes.find((a) => a.id === playerData.athlete_id)
    if (!athlete) {
      throw new AppError('Selected athlete profile was not found.')
    }

    // Check unique constraint: athlete cannot have two entries in the same season for the same sport
    const duplicate = allPlayers.some(
      (p) =>
        p.season_id === playerData.season_id &&
        p.athlete_id === athlete.id &&
        p.sport.toLowerCase() === playerData.sport.toLowerCase()
    )
    if (duplicate) {
      throw new AppError('This athlete is already registered for this sport in this season.')
    }

    const playerCode = formatAthleteCode(athlete.athlete_code)
    const snapshotYear = playerData.academic_year || athlete.academic_year || '1st'

    const newPlayer: Player = {
      id: `player-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      season_id: playerData.season_id,
      athlete_id: athlete.id,
      athlete_code: athlete.athlete_code,
      player_code: playerCode,
      name: athlete.name,
      sport: playerData.sport,
      playing_role: playerData.playing_role,
      academic_year: snapshotYear,
      roll_no: athlete.roll_no,
      photo_url: athlete.photo_url,
      photo_thumb_url: athlete.photo_thumb_url,
      base_points: playerData.base_points,
      status: 'available',
      team_id: null,
      purchase_price: null,
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
            academic_year: pd.academic_year || '1st',
            photo_url: pd.photo_url,
            photo_thumb_url: pd.photo_thumb_url,
            roll_no: pd.roll_no?.trim(),
            notes: pd.notes?.trim(),
            created_at: new Date().toISOString()
          }
          allAthletes.push(athlete)
        }
      }

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
        photo_url: athlete.photo_url,
        photo_thumb_url: athlete.photo_thumb_url,
        id: `player-${Date.now()}-${i}`,
        player_code: formatAthleteCode(athlete.athlete_code),
        academic_year: pd.academic_year || athlete.academic_year || '1st',
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

  async bulkRegisterPlayers(params: BulkRegisterParams): Promise<BulkRegisterResult> {
    const { seasonId, sport, basePoints, entries } = params
    if (!seasonId) throw new AppError('No active tournament season selected.')
    if (!sport) throw new AppError('Sport is required.')

    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const athMap = new Map<string, Athlete>()
    for (const a of allAthletes) {
      athMap.set(a.id, a)
    }

    const existingAthleteIds = new Set<string>(
      allPlayers
        .filter(
          (p) =>
            p.season_id === seasonId &&
            p.sport.toLowerCase() === sport.toLowerCase() &&
            !!p.athlete_id
        )
        .map((p) => p.athlete_id as string)
    )

    const registered: Player[] = []
    const skipped: BulkRegisterSkippedItem[] = []
    const seenInBatch = new Set<string>()

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const ath = athMap.get(entry.athlete_id)
      if (!ath) {
        skipped.push({
          athlete_id: entry.athlete_id,
          athlete_name: entry.athlete_name,
          athlete_code: entry.athlete_code,
          reason: 'Athlete profile not found'
        })
        continue
      }
      if (!entry.playing_role || !entry.playing_role.trim()) {
        skipped.push({
          athlete_id: ath.id,
          athlete_name: ath.name,
          athlete_code: ath.athlete_code,
          reason: 'Playing role is required'
        })
        continue
      }
      if (existingAthleteIds.has(ath.id) || seenInBatch.has(ath.id)) {
        skipped.push({
          athlete_id: ath.id,
          athlete_name: ath.name,
          athlete_code: ath.athlete_code,
          reason: 'Already registered for this sport in this season'
        })
        continue
      }

      seenInBatch.add(ath.id)
      const newPlayer: Player = {
        id: `player-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
        season_id: seasonId,
        athlete_id: ath.id,
        athlete_code: ath.athlete_code,
        player_code: formatAthleteCode(ath.athlete_code),
        name: ath.name,
        sport,
        playing_role: entry.playing_role.trim(),
        academic_year: ath.academic_year || entry.academic_year || '1st',
        roll_no: ath.roll_no,
        photo_url: ath.photo_url,
        photo_thumb_url: ath.photo_thumb_url,
        base_points: basePoints,
        status: 'available',
        team_id: null,
        purchase_price: null,
        created_at: new Date().toISOString()
      }
      registered.push(newPlayer)
    }

    if (registered.length > 0) {
      allPlayers.push(...registered)
      setLocal(STORAGE_KEYS.PLAYERS, allPlayers)
      notifyChange('players_change')
    }

    return { registered, skipped }
  },

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player> {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const index = allPlayers.findIndex((p) => p.id === id)
    if (index === -1) throw new AppError('Player not found')

    const current = allPlayers[index]
    const nextSport = updates.sport || current.sport

    if (current.athlete_id && nextSport.toLowerCase() !== current.sport.toLowerCase()) {
      const duplicate = allPlayers.some(
        (p) =>
          p.id !== id &&
          p.season_id === current.season_id &&
          p.athlete_id === current.athlete_id &&
          p.sport.toLowerCase() === nextSport.toLowerCase()
      )
      if (duplicate) {
        throw new AppError('This athlete is already registered for this sport in this season.')
      }
    }

    const updated: Player = {
      ...current,
      sport: nextSport,
      playing_role: updates.playing_role !== undefined ? updates.playing_role : current.playing_role,
      base_points: updates.base_points !== undefined ? updates.base_points : current.base_points
    }
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
    let list = await demoPlayersService.getPlayers(seasonId)
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
      if (e.data?.event === 'players_change' || e.data?.event === 'athletes_change') {
        handleUpdate()
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.PLAYERS || e.key === STORAGE_KEYS.ATHLETES) {
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
  // Uses public_players + players so it works for both public pages (without touching athletes) and admin
  async getPlayers(seasonId: string): Promise<Player[]> {
    try {
      if (!seasonId || !supabase) return []

      const [pubRes, plyRes] = await Promise.all([
        supabase
          .from('public_players')
          .select('*')
          .eq('season_id', seasonId),
        supabase.from('players').select('*').eq('season_id', seasonId)
      ])

      if (pubRes.error) {
        console.error('Supabase getPlayers (public_players) error:', pubRes.error.message, pubRes.error)
      }

      const pubList = (pubRes.data as PublicPlayer[]) || []
      const pubMap = new Map<string, PublicPlayer>()
      for (const pub of pubList) {
        pubMap.set(pub.id, pub)
      }

      const rawPlayers = (plyRes.data as Array<Record<string, unknown>>) || []
      let result: Player[]

      if (rawPlayers.length > 0) {
        result = rawPlayers.map((row) => mapJoinedPlayer(row, pubMap.get(String(row.id))))
      } else {
        result = pubList.map((pub) => mapJoinedPlayer({}, pub))
      }

      return result.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
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

    // Fetch season players joined with athletes (admin-only endpoint)
    let query = supabase
      .from('players')
      .select('*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)')
      .eq('season_id', seasonId)

    if (sport && sport !== 'all') {
      query = query.ilike('sport', sport)
    }

    if (role && role !== 'all') {
      query = query.ilike('playing_role', role)
    }

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw new AppError(error.message, { original: error })

    let mapped = ((data as Array<Record<string, unknown>>) || []).map((row) =>
      mapJoinedPlayer(row)
    )

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      const parsedCode = parseAthleteCode(q)
      mapped = mapped.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (parsedCode !== null && p.athlete_code === parsedCode) ||
          (p.player_code && p.player_code.toLowerCase().includes(q)) ||
          (p.roll_no && p.roll_no.toLowerCase().includes(q))
      )
    }

    mapped.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

    const totalCount = mapped.length
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const paged = mapped.slice(offset, offset + pageSize)

    return {
      players: paged,
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
      .select('*', { count: 'exact' })
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
    if (error) {
      console.error('Supabase getPublicPlayersPaged error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

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
    playerData: Omit<Player, 'id' | 'player_code' | 'created_at'>
  ): Promise<Player> {
    if (!supabase) throw new AppError('Supabase not configured')

    if (!playerData.athlete_id) {
      throw new AppError('Please select an athlete profile first.')
    }

    // Check if that athlete is already registered in the same season and sport
    const { count: existingCount, error: checkErr } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', playerData.season_id)
      .eq('athlete_id', playerData.athlete_id)
      .ilike('sport', playerData.sport)

    if (checkErr) throw new AppError(checkErr.message, { original: checkErr })

    if ((existingCount ?? 0) > 0) {
      throw new AppError('This athlete is already registered for this sport in this season.')
    }

    // Save inserts ONLY into players: athlete_id, season_id, sport, playing_role, base_points, academic_year
    const { data, error } = await supabase
      .from('players')
      .insert([
        {
          athlete_id: playerData.athlete_id,
          season_id: playerData.season_id,
          sport: playerData.sport,
          playing_role: playerData.playing_role,
          base_points: playerData.base_points,
          academic_year: playerData.academic_year
        }
      ])
      .select('*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new AppError('This athlete is already registered for this sport in this season.', {
          original: error
        })
      }
      throw new AppError(error.message, { original: error })
    }

    return mapJoinedPlayer(data as Record<string, unknown>)
  },

  async bulkCreatePlayers(
    playersData: Array<Omit<Player, 'id' | 'player_code' | 'created_at'>>
  ): Promise<Player[]> {
    if (!supabase) throw new AppError('Supabase not configured')

    const rowsToInsert = playersData
      .filter((p) => !!p.athlete_id)
      .map((p) => ({
        athlete_id: p.athlete_id,
        season_id: p.season_id,
        sport: p.sport,
        playing_role: p.playing_role,
        base_points: p.base_points,
        academic_year: p.academic_year
      }))

    if (rowsToInsert.length === 0) return []

    const { data, error } = await supabase
      .from('players')
      .insert(rowsToInsert)
      .select('*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)')

    if (error) throw new AppError(error.message, { original: error })
    return ((data as Array<Record<string, unknown>>) || []).map((r) => mapJoinedPlayer(r))
  },

  async bulkRegisterPlayers(params: BulkRegisterParams): Promise<BulkRegisterResult> {
    if (!supabase) throw new AppError('Supabase not configured')
    const { seasonId, sport, basePoints, entries } = params
    if (!seasonId) throw new AppError('No active tournament season selected.')
    if (!sport) throw new AppError('Sport is required.')

    // Check existing registrations for this season and sport
    const { data: existingRows, error: checkErr } = await supabase
      .from('players')
      .select('athlete_id')
      .eq('season_id', seasonId)
      .ilike('sport', sport)

    if (checkErr) throw new AppError(checkErr.message, { original: checkErr })

    const existingAthleteIds = new Set<string>(
      ((existingRows as Array<{ athlete_id: string | null }>) || [])
        .map((r) => r.athlete_id)
        .filter((id): id is string => !!id)
    )

    const validEntries: typeof entries = []
    const skipped: BulkRegisterSkippedItem[] = []
    const seenInBatch = new Set<string>()

    for (const entry of entries) {
      if (!entry.athlete_id) {
        skipped.push({
          athlete_id: entry.athlete_id,
          athlete_name: entry.athlete_name,
          athlete_code: entry.athlete_code,
          reason: 'Missing athlete profile ID'
        })
        continue
      }
      if (!entry.playing_role || !entry.playing_role.trim()) {
        skipped.push({
          athlete_id: entry.athlete_id,
          athlete_name: entry.athlete_name,
          athlete_code: entry.athlete_code,
          reason: 'Playing role is required'
        })
        continue
      }
      if (existingAthleteIds.has(entry.athlete_id) || seenInBatch.has(entry.athlete_id)) {
        skipped.push({
          athlete_id: entry.athlete_id,
          athlete_name: entry.athlete_name,
          athlete_code: entry.athlete_code,
          reason: 'Already registered for this sport in this season'
        })
        continue
      }

      seenInBatch.add(entry.athlete_id)
      validEntries.push(entry)
    }

    if (validEntries.length === 0) {
      return { registered: [], skipped }
    }

    const rowsToInsert = validEntries.map((entry) => ({
      athlete_id: entry.athlete_id,
      season_id: seasonId,
      sport,
      playing_role: entry.playing_role.trim(),
      base_points: basePoints,
      academic_year: entry.academic_year || '1st'
    }))

    // Execute one batch insert into players
    const { data, error } = await supabase
      .from('players')
      .insert(rowsToInsert)
      .select('*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)')

    if (!error) {
      const registered = ((data as Array<Record<string, unknown>>) || []).map((r) =>
        mapJoinedPlayer(r)
      )
      return { registered, skipped }
    }

    // If the batch insert failed due to a row-level constraint (e.g. concurrent duplicate 23505),
    // keep the successful ones and record the exact Supabase error for each failed row
    if (validEntries.length > 1) {
      const registered: Player[] = []
      for (const entry of validEntries) {
        const { data: singleData, error: singleErr } = await supabase
          .from('players')
          .insert([
            {
              athlete_id: entry.athlete_id,
              season_id: seasonId,
              sport,
              playing_role: entry.playing_role.trim(),
              base_points: basePoints,
              academic_year: entry.academic_year || '1st'
            }
          ])
          .select(
            '*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)'
          )
          .single()

        if (singleErr) {
          skipped.push({
            athlete_id: entry.athlete_id,
            athlete_name: entry.athlete_name,
            athlete_code: entry.athlete_code,
            reason:
              singleErr.code === '23505'
                ? `Already registered for this sport in this season (${singleErr.message})`
                : singleErr.message
          })
        } else if (singleData) {
          registered.push(mapJoinedPlayer(singleData as Record<string, unknown>))
        }
      }
      if (registered.length > 0 || skipped.length > 0) {
        return { registered, skipped }
      }
    }

    throw new AppError(error.message, { original: error })
  },

  async updatePlayer(id: string, updates: Partial<Player>): Promise<Player> {
    if (!supabase) throw new AppError('Supabase not configured')

    const payload: Record<string, unknown> = {}
    if (updates.sport !== undefined) payload.sport = updates.sport
    if (updates.playing_role !== undefined) payload.playing_role = updates.playing_role
    if (updates.base_points !== undefined) payload.base_points = updates.base_points
    if (updates.academic_year !== undefined) payload.academic_year = updates.academic_year

    const { data, error } = await supabase
      .from('players')
      .update(payload)
      .eq('id', id)
      .select('*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new AppError('This athlete is already registered for this sport in this season.', {
          original: error
        })
      }
      throw new AppError(error.message, { original: error })
    }

    return mapJoinedPlayer(data as Record<string, unknown>)
  },

  async deletePlayer(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data: pState } = await supabase
      .from('projector_state')
      .select('*')
      .eq('player_id', id)
      .maybeSingle()

    if (pState) {
      await supabase
        .from('projector_state')
        .update({ mode: 'idle', player_id: null, updated_at: new Date().toISOString() })
        .eq('player_id', id)
    }

    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) throw new AppError(error.message, { original: error })
  },

  async exportPlayersForSport(seasonId: string, sport?: string): Promise<Player[]> {
    let list = await supabasePlayersService.getPlayers(seasonId)
    if (sport && sport !== 'all') {
      list = list.filter((p) => p.sport.toLowerCase() === sport.toLowerCase())
    }
    return list
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
      .select('*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)')
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

    return {
      player: mapJoinedPlayer(updatedPlayer as Record<string, unknown>),
      team: updatedTeam as Team
    }
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
      .select('*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)')
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

    return {
      player: mapJoinedPlayer(updatedPlayer as Record<string, unknown>),
      team: updatedTeam
    }
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
export const bulkRegisterPlayers = (params: BulkRegisterParams) =>
  playersService.bulkRegisterPlayers(params)
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
