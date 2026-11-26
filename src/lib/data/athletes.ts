import { logError } from '../logger'
import type { Athlete, AthleteCareerEntry, Player, PublicPlayer, Season } from '../../types'
import { AppError } from '../errors'
import { PUBLIC_PLAYER_SELECT_COLUMNS, PUBLIC_SQUAD_SELECT_COLUMNS } from '../constants'
import {
  supabase,
  formatAthleteCode,
  parseAthleteCode,
  markLocalMutation
} from './client'
import { broadcastAdminSync } from '../adminRealtime'
import { deletePlayerPhotoAssets } from './storage'
import type { AthletesPagedParams, AthletesPagedResult, AthletesService } from './types'

const ATHLETE_COLS =
  'id, athlete_code, name, academic_year, photo_url, photo_thumb_url, roll_no, notes, created_at'

const supabaseAthletesService: AthletesService = {
  async getAllAthletes(): Promise<Athlete[]> {
    if (!supabase) throw new AppError('Supabase not configured')
    const { data, error } = await supabase
      .from('athletes')
      .select(ATHLETE_COLS)
      .order('athlete_code', { ascending: true })
    if (error) throw new AppError(error.message, { original: error })
    return ((data as Athlete[]) || []).map((a) => ({
      ...a,
      academic_year: a.academic_year || '1st'
    }))
  },

  async getAthletesPaged(params: AthletesPagedParams): Promise<AthletesPagedResult> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { page, pageSize, search } = params
    const offset = (page - 1) * pageSize

    let query = supabase.from('athletes').select(ATHLETE_COLS, { count: 'exact' })

    if (search && search.trim()) {
      const q = search.trim()
      const parsedCode = parseAthleteCode(q)
      if (parsedCode !== null) {
        query = query.or(
          `athlete_code.eq.${parsedCode},name.ilike.%${q}%,roll_no.ilike.%${q}%`
        )
      } else {
        query = query.or(`name.ilike.%${q}%,roll_no.ilike.%${q}%`)
      }
    }

    query = query
      .order('athlete_code', { ascending: true })
      .range(offset, offset + pageSize - 1)

    const { data, count, error } = await query
    if (error) throw new AppError(error.message, { original: error })

    const athletesList = (data as Athlete[]) || []
    const athleteIds = athletesList.map((a) => a.id)

    const countsMap: Record<string, number> = {}
    if (athleteIds.length > 0) {
      const { data: playerRows, error: pError } = await supabase
        .from('players')
        .select('athlete_id')
        .in('athlete_id', athleteIds)

      if (pError) throw new AppError(pError.message, { original: pError })

      if (playerRows) {
        for (const row of playerRows as Array<{ athlete_id: string | null }>) {
          if (row.athlete_id) {
            countsMap[row.athlete_id] = (countsMap[row.athlete_id] || 0) + 1
          }
        }
      }
    }

    const enriched = athletesList.map((a) => ({
      ...a,
      academic_year: a.academic_year || '1st',
      entries_count: countsMap[a.id] || 0
    }))

    const totalCount = count || 0
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

    return {
      athletes: enriched,
      totalCount,
      totalPages
    }
  },

  async searchAthletes(query: string): Promise<Athlete[]> {
    if (!supabase) return []
    const q = (query || '').trim()
    if (!q) {
      const { data, error } = await supabase
        .from('athletes')
        .select(ATHLETE_COLS)
        .order('athlete_code', { ascending: true })
        .limit(20)
      if (error) throw new AppError(error.message, { original: error })
      return ((data as Athlete[]) || []).map((a) => ({
        ...a,
        academic_year: a.academic_year || '1st'
      }))
    }

    const parsedCode = parseAthleteCode(q)
    let dbQuery = supabase.from('athletes').select(ATHLETE_COLS)

    if (parsedCode !== null) {
      dbQuery = dbQuery.or(`athlete_code.eq.${parsedCode},name.ilike.%${q}%,roll_no.ilike.%${q}%`)
    } else {
      dbQuery = dbQuery.or(`name.ilike.%${q}%,roll_no.ilike.%${q}%`)
    }

    const { data, error } = await dbQuery.order('athlete_code', { ascending: true }).limit(20)
    if (error) throw new AppError(error.message, { original: error })
    return ((data as Athlete[]) || []).map((a) => ({
      ...a,
      academic_year: a.academic_year || '1st'
    }))
  },

  // Public pages read ONLY from public_players, never from athletes directly
  async getAthleteByCode(code: number | string): Promise<Athlete | null> {
    if (!supabase) return null
    const parsed = parseAthleteCode(code)
    if (parsed === null) return null

    const { data, error } = await supabase
      .from('public_players')
      .select(PUBLIC_PLAYER_SELECT_COLUMNS)
      .eq('athlete_code', parsed)
      .limit(1)

    if (error) {
      logError('Supabase getAthleteByCode error:', error.message, error)
      return null
    }

    const first = (data as PublicPlayer[] | null)?.[0]
    if (!first) return null

    return {
      id: first.athlete_id || first.id,
      athlete_code: first.athlete_code ?? parsed,
      name: first.name,
      academic_year: first.academic_year || '1st',
      photo_url: first.photo_url,
      photo_thumb_url: first.photo_thumb_url
    }
  },

  async getAthleteById(id: string): Promise<Athlete | null> {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('athletes')
      .select(ATHLETE_COLS)
      .eq('id', id)
      .maybeSingle()

    if (error) throw new AppError(error.message, { original: error })
    if (!data) return null

    const { count, error: cError } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', id)

    if (cError) throw new AppError(cError.message, { original: cError })

    const ath = data as Athlete
    return {
      ...ath,
      academic_year: ath.academic_year || '1st',
      entries_count: count || 0
    }
  },

  // Public career lookup reads ONLY from public_players, seasons, and public_squads
  async getAthleteCareer(athleteId: string): Promise<AthleteCareerEntry[]> {
    if (!supabase) return []

    const [playersRes, seasonsRes] = await Promise.all([
      supabase
        .from('public_players')
        .select(PUBLIC_PLAYER_SELECT_COLUMNS)
        .eq('athlete_id', athleteId),
      supabase.from('seasons').select('id, name, is_active, created_at')
    ])

    if (playersRes.error) {
      logError('Supabase getAthleteCareer (public_players) error:', playersRes.error.message, playersRes.error)
      return []
    }
    if (seasonsRes.error) {
      logError('Supabase getAthleteCareer (seasons) error:', seasonsRes.error.message, seasonsRes.error)
    }
    if (!playersRes.data) return []

    const pubEntries = (playersRes.data as PublicPlayer[]) || []
    const playerIds = pubEntries.map((p) => p.id)

    interface PublicSquadCareerRow {
      player_id: string
      season_id: string
      purchase_price?: number | null
      team_id: string
      team_name: string
      team_short_code: string
      team_color: string
    }

    const squadsMap = new Map<string, PublicSquadCareerRow>()
    if (playerIds.length > 0) {
      const { data: squadRows, error: squadsErr } = await supabase
        .from('public_squads')
        .select(PUBLIC_SQUAD_SELECT_COLUMNS)
        .in('player_id', playerIds)

      if (squadsErr) {
        logError('Supabase getAthleteCareer (public_squads) error:', squadsErr.message, squadsErr)
      } else {
        for (const sq of (squadRows as PublicSquadCareerRow[]) || []) {
          if (sq.player_id) {
            squadsMap.set(sq.player_id, sq)
          }
        }
      }
    }

    const seasonsMap = new Map<string, Season>()
    for (const s of (seasonsRes.data as Season[]) || []) {
      seasonsMap.set(s.id, s)
    }

    const career: AthleteCareerEntry[] = pubEntries.map((item) => {
      const season = seasonsMap.get(item.season_id)
      const squad = squadsMap.get(item.id)
      return {
        player_id: item.id,
        season_id: item.season_id,
        season_name: season?.name || 'Season',
        is_season_active: !!season?.is_active,
        sport: item.sport,
        playing_role: item.playing_role,
        academic_year: item.academic_year || '1st',
        status: squad ? 'sold' : 'available',
        team_id: squad ? squad.team_id : null,
        team_name: squad ? squad.team_name : null,
        team_short_code: squad ? squad.team_short_code : null,
        team_color: squad ? squad.team_color : null,
        base_points: 0,
        purchase_price: squad?.purchase_price ?? null
      }
    })

    return career.sort((a, b) => {
      if (a.is_season_active && !b.is_season_active) return -1
      if (!a.is_season_active && b.is_season_active) return 1
      return a.season_name.localeCompare(b.season_name)
    })
  },

  // Admin detail lookup: fetches all entries for an athlete in players across seasons
  async getAthleteEntries(athleteId: string): Promise<AthleteCareerEntry[]> {
    if (!supabase) throw new AppError('Supabase not configured')

    const [playersRes, seasonsRes] = await Promise.all([
      supabase
        .from('players')
        .select(
          'id, season_id, sport, playing_role, academic_year, status, team_id, base_points, purchase_price'
        )
        .eq('athlete_id', athleteId),
      supabase.from('seasons').select('id, name, is_active, created_at')
    ])

    if (playersRes.error) {
      throw new AppError(playersRes.error.message, { original: playersRes.error })
    }
    if (seasonsRes.error) {
      throw new AppError(seasonsRes.error.message, { original: seasonsRes.error })
    }

    const seasonsMap = new Map<string, Season>()
    for (const s of (seasonsRes.data as Season[]) || []) {
      seasonsMap.set(s.id, s)
    }

    const entries: AthleteCareerEntry[] = ((playersRes.data as Player[]) || []).map((item) => {
      const season = seasonsMap.get(item.season_id)
      return {
        player_id: item.id,
        season_id: item.season_id,
        season_name: season?.name || 'Unknown Season',
        is_season_active: !!season?.is_active,
        sport: item.sport,
        playing_role: item.playing_role,
        academic_year: item.academic_year || '1st',
        status: item.status,
        team_id: item.team_id,
        team_name: null,
        team_short_code: null,
        team_color: null,
        base_points: item.base_points,
        purchase_price: item.purchase_price
      }
    })

    return entries.sort((a, b) => {
      if (a.is_season_active && !b.is_season_active) return -1
      if (!a.is_season_active && b.is_season_active) return 1
      return a.season_name.localeCompare(b.season_name)
    })
  },

  async createAthlete(
    data: Omit<Athlete, 'id' | 'athlete_code' | 'created_at'>
  ): Promise<Athlete> {
    if (!supabase) throw new AppError('Supabase not configured')
    const trimmedName = data.name.trim()
    if (!trimmedName) throw new AppError('Athlete name is required')
    if (!data.academic_year) throw new AppError('Academic year is required')

    markLocalMutation(['athletes', 'players'])
    const { data: created, error } = await supabase
      .from('athletes')
      .insert([
        {
          name: trimmedName,
          academic_year: data.academic_year,
          photo_url: data.photo_url || null,
          photo_thumb_url: data.photo_thumb_url || null,
          roll_no: data.roll_no?.trim() || null,
          notes: data.notes?.trim() || null
        }
      ])
      .select(ATHLETE_COLS)
      .single()

    if (error) throw new AppError(error.message, { original: error })
    markLocalMutation(['athletes', 'players'])
    broadcastAdminSync('athletes', 'create')
    return {
      ...(created as Athlete),
      entries_count: 0
    }
  },

  async updateAthlete(id: string, updates: Partial<Athlete>): Promise<Athlete> {
    if (!supabase) throw new AppError('Supabase not configured')

    // athlete_code is strictly immutable and read-only
    const { athlete_code: _forbidden, entries_count: _ignored, id: _id, created_at: _ca, ...rest } = updates

    const payload: Record<string, unknown> = {}
    if (rest.name !== undefined) {
      const trimmed = rest.name.trim()
      if (!trimmed) throw new AppError('Athlete name is required')
      payload.name = trimmed
    }
    if (rest.academic_year !== undefined) {
      payload.academic_year = rest.academic_year
    }
    if (rest.roll_no !== undefined) {
      payload.roll_no = rest.roll_no?.trim() || null
    }
    if (rest.notes !== undefined) {
      payload.notes = rest.notes?.trim() || null
    }
    if (rest.photo_url !== undefined) {
      payload.photo_url = rest.photo_url || null
    }
    if (rest.photo_thumb_url !== undefined) {
      payload.photo_thumb_url = rest.photo_thumb_url || null
    }

    markLocalMutation(['athletes', 'players'])
    const { data: updated, error } = await supabase
      .from('athletes')
      .update(payload)
      .eq('id', id)
      .select(ATHLETE_COLS)
      .single()

    if (error) throw new AppError(error.message, { original: error })

    // When an athlete's academic_year is edited, also update academic_year on that athlete's players rows in the ACTIVE season only
    if (payload.academic_year !== undefined) {
      const { data: activeSeason, error: seasonErr } = await supabase
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .maybeSingle()

      if (seasonErr) throw new AppError(seasonErr.message, { original: seasonErr })

      if (activeSeason?.id) {
        const { error: syncError } = await supabase
          .from('players')
          .update({ academic_year: payload.academic_year })
          .eq('athlete_id', id)
          .eq('season_id', activeSeason.id)

        if (syncError) {
          throw new AppError(syncError.message, { original: syncError })
        }
      }
    }

    markLocalMutation(['athletes', 'players'])
    broadcastAdminSync('athletes', 'update')
    return updated as Athlete
  },

  async deleteAthlete(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { count, error: countErr } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', id)

    if (countErr) throw new AppError(countErr.message, { original: countErr })

    if ((count ?? 0) > 0) {
      throw new AppError('This athlete has sport entries and cannot be deleted.')
    }

    const { data: athleteToDelete } = await supabase
      .from('athletes')
      .select('photo_url, photo_thumb_url')
      .eq('id', id)
      .maybeSingle()

    markLocalMutation(['athletes', 'players'])
    const { error } = await supabase.from('athletes').delete().eq('id', id)
    if (error) {
      if (error.code === '23503') {
        throw new AppError('This athlete has sport entries and cannot be deleted.', {
          original: error
        })
      }
      throw new AppError(error.message, { original: error })
    }

    markLocalMutation(['athletes', 'players'])
    broadcastAdminSync('athletes', 'delete')
    if (athleteToDelete) {
      await deletePlayerPhotoAssets(
        athleteToDelete.photo_url,
        athleteToDelete.photo_thumb_url
      )
    }
  }
}

export const athletesService: AthletesService = supabaseAthletesService

// Deprecated: athletes is synced via the shared AdminRealtimeProvider ("admin-sync" broadcast).
export function subscribeToAthletes(_onUpdate: () => void): () => void {
  return () => {}
}

export const getAllAthletes = () => athletesService.getAllAthletes()
export const getAthletesPaged = (params: AthletesPagedParams) =>
  athletesService.getAthletesPaged(params)
export const searchAthletes = (q: string) => athletesService.searchAthletes(q)
export const getAthleteByCode = (code: number | string) => athletesService.getAthleteByCode(code)
export const getAthleteById = (id: string) => athletesService.getAthleteById(id)
export const getAthleteCareer = (athleteId: string) => athletesService.getAthleteCareer(athleteId)
export const getAthleteEntries = (athleteId: string) => athletesService.getAthleteEntries(athleteId)
export const createAthlete = (data: Omit<Athlete, 'id' | 'athlete_code' | 'created_at'>) =>
  athletesService.createAthlete(data)
export const updateAthlete = (id: string, updates: Partial<Athlete>) =>
  athletesService.updateAthlete(id, updates)
export const deleteAthlete = (id: string) => athletesService.deleteAthlete(id)
export { formatAthleteCode, parseAthleteCode }
