import { logError } from '../logger'
import type {
  Athlete,
  Player,
  PublicPlayer,
  Team
} from '../../types'
import { AppError } from '../errors'
import { PUBLIC_PLAYER_SELECT_COLUMNS, PUBLIC_SQUAD_SELECT_COLUMNS } from '../constants'
import {
  supabase,
  formatAthleteCode,
  parseAthleteCode,
  REALTIME_DEBOUNCE_MS,
  markLocalMutation,
  isRealtimeSuppressed
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
  PublicPlayersPagedResult,
  SeasonPlayerLookupResult
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
    player_code: pubRow?.player_code ? formatAthleteCode(pubRow.player_code) : formattedCode,
    name: String(ath?.name || pubRow?.name || row.name || 'Unnamed Athlete'),
    sport: String(pubRow?.sport || row.sport || 'Cricket'),
    playing_role: String(pubRow?.playing_role || row.playing_role || 'Player'),
    academic_year: ((pubRow?.academic_year || row.academic_year || ath?.academic_year || '1st') as Player['academic_year']),
    roll_no: ath?.roll_no ?? (row.roll_no ? String(row.roll_no) : undefined),
    photo_url: ath?.photo_url || pubRow?.photo_url || (row.photo_url ? String(row.photo_url) : undefined),
    photo_thumb_url:
      ath?.photo_thumb_url ||
      pubRow?.photo_thumb_url ||
      (row.photo_thumb_url ? String(row.photo_thumb_url) : undefined),
    base_points: typeof row.base_points === 'number' ? row.base_points : 100,
    status: (row.status as Player['status']) || 'available',
    team_id: (row.team_id as string | null) ?? null,
    purchase_price: typeof row.purchase_price === 'number' ? row.purchase_price : null,
    created_at: row.created_at ? String(row.created_at) : undefined
  }
}

type PlayersServiceWithRefund = Omit<PlayersService, 'unassignPlayerFromTeam'> & {
  unassignPlayerFromTeam(
    playerId: string,
    refundToPurse?: boolean
  ): Promise<{ player: Player; team: Team | null }>
}

interface PublicSquadRow {
  player_id: string
  season_id: string
  sport: string
  player_code: string
  name: string
  photo_thumb_url?: string
  photo_url?: string
  academic_year: string
  playing_role: string
  purchase_price?: number | null
  team_id: string
  team_name: string
  team_short_code: string
  team_color: string
  team_logo_url?: string | null
}

const supabasePlayersService: PlayersServiceWithRefund = {
  // Admin and projector lookup: merges public_players view with players table
  async getPlayers(seasonId: string): Promise<Player[]> {
    try {
      if (!seasonId || !supabase) return []

      const [pubRes, plyRes] = await Promise.all([
        supabase
          .from('public_players')
          .select(PUBLIC_PLAYER_SELECT_COLUMNS)
          .eq('season_id', seasonId),
        supabase
          .from('players')
          .select(
            'id, season_id, athlete_id, sport, playing_role, base_points, academic_year, status, team_id, purchase_price, created_at'
          )
          .eq('season_id', seasonId)
      ])

      if (pubRes.error) {
        logError('Supabase getPlayers (public_players) error:', pubRes.error.message, pubRes.error)
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
      logError('getPlayers caught error:', err)
      return []
    }
  },

  // Public-only lookup: queries ONLY public_players and public_squads (never players or athletes)
  async getPublicPlayersBySeason(seasonId: string): Promise<PublicPlayer[]> {
    try {
      if (!seasonId || !supabase) return []

      const [pubRes, squadsRes] = await Promise.all([
        supabase
          .from('public_players')
          .select(PUBLIC_PLAYER_SELECT_COLUMNS)
          .eq('season_id', seasonId),
        supabase
          .from('public_squads')
          .select(PUBLIC_SQUAD_SELECT_COLUMNS)
          .eq('season_id', seasonId)
      ])

      if (pubRes.error) {
        logError('Supabase getPublicPlayersBySeason error:', pubRes.error.message, pubRes.error)
        return []
      }
      if (squadsRes.error) {
        logError('Supabase getPublicPlayersBySeason (public_squads) error:', squadsRes.error.message, squadsRes.error)
      }

      const squadMap = new Map<string, PublicSquadRow>()
      for (const sq of (squadsRes.data as PublicSquadRow[]) || []) {
        if (sq.player_id) {
          squadMap.set(sq.player_id, sq)
        }
      }

      const pubList = (pubRes.data as PublicPlayer[]) || []
      return pubList
        .map((pub) => {
          const squad = squadMap.get(pub.id)
          return {
            id: pub.id,
            season_id: pub.season_id,
            athlete_id: pub.athlete_id,
            athlete_code: pub.athlete_code,
            player_code: formatAthleteCode(pub.athlete_code ?? pub.player_code),
            name: pub.name || 'Unnamed Athlete',
            sport: pub.sport || 'Cricket',
            playing_role: pub.playing_role || 'Player',
            academic_year: (pub.academic_year || '1st') as PublicPlayer['academic_year'],
            status: squad ? ('sold' as const) : ('available' as const),
            team_id: squad ? squad.team_id : null,
            purchase_price: squad?.purchase_price ?? null,
            photo_url: pub.photo_url,
            photo_thumb_url: pub.photo_thumb_url || pub.photo_url
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    } catch (err) {
      logError('getPublicPlayersBySeason caught error:', err)
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
      .select(PUBLIC_PLAYER_SELECT_COLUMNS, { count: 'exact' })
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
      logError('Supabase getPublicPlayersPaged error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

    const totalCount = count || 0
    const rawPlayers = (data as PublicPlayer[]) || []
    const playerIds = rawPlayers.map((p) => p.id)

    const squadMap = new Map<string, PublicSquadRow>()
    if (playerIds.length > 0) {
      const { data: squadRows, error: squadError } = await supabase
        .from('public_squads')
        .select(PUBLIC_SQUAD_SELECT_COLUMNS)
        .in('player_id', playerIds)

      if (squadError) {
        logError('Supabase getPublicPlayersPaged (public_squads) error:', squadError.message, squadError)
      } else {
        for (const sq of (squadRows as PublicSquadRow[]) || []) {
          if (sq.player_id) {
            squadMap.set(sq.player_id, sq)
          }
        }
      }
    }

    const players: PublicPlayer[] = rawPlayers.map((pub) => {
      const squad = squadMap.get(pub.id)
      return {
        ...pub,
        status: squad ? ('sold' as const) : ('available' as const),
        team_id: squad ? squad.team_id : null,
        purchase_price: squad?.purchase_price ?? null
      }
    })

    const nextOffset = offset + players.length

    return {
      players,
      totalCount,
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
    markLocalMutation(['players', 'athletes', 'auction'])
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

    markLocalMutation(['players', 'athletes', 'auction'])
    return mapJoinedPlayer(data as Record<string, unknown>)
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
    markLocalMutation(['players', 'athletes', 'auction'])
    const { data, error } = await supabase
      .from('players')
      .insert(rowsToInsert)
      .select('*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year)')

    if (!error) {
      markLocalMutation(['players', 'athletes', 'auction'])
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
        markLocalMutation(['players', 'athletes', 'auction'])
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
      markLocalMutation(['players', 'athletes', 'auction'])
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

    markLocalMutation(['players', 'athletes', 'auction'])
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

    markLocalMutation(['players', 'athletes', 'auction'])
    return mapJoinedPlayer(data as Record<string, unknown>)
  },

  async deletePlayer(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    markLocalMutation(['players', 'athletes', 'auction'])
    const { data: pState } = await supabase
      .from('projector_state')
      .select('season_id, player_id')
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
    markLocalMutation(['players', 'athletes', 'auction'])
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

    markLocalMutation(['players', 'teams', 'auction'])
    const { error: rpcErr } = await supabase.rpc('assign_player_to_team', {
      p_player_id: playerId,
      p_team_id: teamId,
      p_price: purchasePrice
    })
    if (rpcErr) throw new AppError(rpcErr.message, { original: rpcErr })
    markLocalMutation(['players', 'teams', 'auction'])

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
      .select(
        'id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, owner_user_id, starting_purse, current_purse, created_at'
      )
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
    playerId: string,
    refundToPurse: boolean = true
  ): Promise<{ player: Player; team: Team | null }> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data: pData } = await supabase
      .from('players')
      .select('team_id')
      .eq('id', playerId)
      .single()
    const prevTeamId = pData?.team_id

    markLocalMutation(['players', 'teams', 'auction'])
    const { error: rpcErr } = await supabase.rpc('unassign_player_from_team', {
      p_player_id: playerId,
      p_refund: Boolean(refundToPurse)
    })
    if (rpcErr) throw new AppError(rpcErr.message, { original: rpcErr })
    markLocalMutation(['players', 'teams', 'auction'])

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
        .select(
          'id, season_id, sport, name, short_code, color, logo_url, owner_display_name, owner_photo_url, owner_user_id, starting_purse, current_purse, created_at'
        )
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

    let active = true
    let latestReqId = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const runFetch = () => {
      if (!active) return
      const reqId = ++latestReqId
      supabasePlayersService
        .getPlayers(seasonId)
        .then((res) => {
          if (active && reqId === latestReqId) {
            callback(res)
          }
        })
        .catch(() => {})
    }

    const scheduleFetch = () => {
      if (!active || isRealtimeSuppressed('players')) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!active || isRealtimeSuppressed('players')) return
        runFetch()
      }, REALTIME_DEBOUNCE_MS)
    }

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
  },

  async lookupSeasonPlayerByCode(
    seasonId: string,
    sport: string,
    athleteCode: number
  ): Promise<SeasonPlayerLookupResult> {
    if (!supabase) return { match: null, otherSports: [] }

    const { data: pubRows, error: pubError } = await supabase
      .from('public_players')
      .select(PUBLIC_PLAYER_SELECT_COLUMNS)
      .eq('season_id', seasonId)
      .eq('athlete_code', athleteCode)

    if (pubError) {
      throw new AppError(pubError.message, { original: pubError })
    }

    const rows = (pubRows || []) as Array<Record<string, unknown>>
    if (rows.length === 0) {
      return { match: null, otherSports: [] }
    }

    const sportNorm = sport.trim().toLowerCase()
    const matchedPub =
      rows.find((r) => String(r.sport || '').trim().toLowerCase() === sportNorm) || null
    const otherSports = Array.from(
      new Set(
        rows
          .filter((r) => String(r.sport || '').trim().toLowerCase() !== sportNorm)
          .map((r) => String(r.sport || '').trim())
          .filter(Boolean)
      )
    )

    if (!matchedPub) {
      return { match: null, otherSports }
    }

    const playerId = String(matchedPub.id)
    const { data: pRow } = await supabase
      .from('players')
      .select('id, status, base_points, team_id, purchase_price, notes, created_at')
      .eq('id', playerId)
      .maybeSingle()

    const match = mapJoinedPlayer(
      (pRow as Record<string, unknown>) || { id: playerId, season_id: seasonId },
      matchedPub as unknown as PublicPlayer
    )

    return { match, otherSports }
  }
}

export const playersService: PlayersServiceWithRefund = supabasePlayersService

export const getPlayers = (seasonId: string) => playersService.getPlayers(seasonId)
export const getPublicPlayersBySeason = (seasonId: string) =>
  playersService.getPublicPlayersBySeason(seasonId)
export const getPlayersPaged = (params: PlayersPagedParams) =>
  playersService.getPlayersPaged(params)
export const lookupSeasonPlayerByCode = (
  seasonId: string,
  sport: string,
  athleteCode: number
) => playersService.lookupSeasonPlayerByCode(seasonId, sport, athleteCode)

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
      totalCount: res.totalCount ?? res.players.length,
      hasMore: res.hasMore
    }
  }
  const res = await playersService.getPublicPlayersPaged(params)
  return {
    players: res.players,
    totalCount: res.totalCount ?? res.players.length,
    hasMore: res.hasMore
  }
}

export const createPlayer = (
  data: Omit<Player, 'id' | 'player_code' | 'created_at'>,
  options?: { photoFile?: File }
) => playersService.createPlayer(data, options)
export const bulkRegisterPlayers = (params: BulkRegisterParams) =>
  playersService.bulkRegisterPlayers(params)
export const updatePlayer = (id: string, updates: Partial<Player>) =>
  playersService.updatePlayer(id, updates)
export const deletePlayer = (id: string) => playersService.deletePlayer(id)
export const exportPlayersForSport = (seasonId: string, sport?: string) =>
  playersService.exportPlayersForSport(seasonId, sport)
export const assignPlayerToTeam = (playerId: string, teamId: string, price?: number) =>
  playersService.assignPlayerToTeam(playerId, teamId, price || 0)
export const unassignPlayerFromTeam = (playerId: string, refundToPurse: boolean = true) =>
  playersService.unassignPlayerFromTeam(playerId, Boolean(refundToPurse))
export const subscribeToPlayers = (
  seasonId: string,
  callback: (players: Player[]) => void
) => playersService.subscribeToPlayers(seasonId, callback)

export async function getPublicPlayerSportRows(
  seasonId?: string
): Promise<Array<{ sport: string; season_id: string }> | null> {
  try {
    if (!supabase) return []

    let query = supabase
      .from('public_players')
      .select('sport, season_id')
      .limit(1000)

    if (seasonId) {
      query = query.eq('season_id', seasonId)
    }

    const { data, error } = await query
    if (error || !Array.isArray(data)) {
      if (error) {
        logError('Supabase getPublicPlayerSportRows error:', error.message, error)
      }
      return null
    }

    return (data as Array<{ sport?: string; season_id?: string }>).map((r) => ({
      sport: String(r.sport || ''),
      season_id: String(r.season_id || '')
    }))
  } catch (err) {
    logError('getPublicPlayerSportRows caught error:', err)
    return null
  }
}

