import type { Athlete, AthleteCareerEntry, Player, PublicPlayer, PublicTeam, Season, Team } from '../../types'
import { AppError } from '../errors'
import {
  isDemoMode,
  supabase,
  getLocal,
  setLocal,
  notifyChange,
  STORAGE_KEYS,
  formatAthleteCode,
  parseAthleteCode,
  getNextAthleteCode
} from './client'
import { deletePlayerPhotoAssets } from './storage'
import type { AthletesPagedParams, AthletesPagedResult, AthletesService } from './types'

const demoAthletesService: AthletesService = {
  async getAllAthletes(): Promise<Athlete[]> {
    const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, []).map((a) => ({
      ...a,
      academic_year: a.academic_year || '1st'
    }))
    return allAthletes.sort((a, b) => a.athlete_code - b.athlete_code)
  },

  async getAthletesPaged(params: AthletesPagedParams): Promise<AthletesPagedResult> {
    const { page, pageSize, search } = params
    const offset = (page - 1) * pageSize

    const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])

    const countByAthleteId: Record<string, number> = {}
    for (const p of allPlayers) {
      if (p.athlete_id) {
        countByAthleteId[p.athlete_id] = (countByAthleteId[p.athlete_id] || 0) + 1
      }
    }

    let filtered = allAthletes.map((a) => ({
      ...a,
      academic_year: a.academic_year || '1st',
      entries_count: countByAthleteId[a.id] || 0
    }))

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      const parsedCode = parseAthleteCode(q)
      filtered = filtered.filter((a) => {
        if (parsedCode !== null && a.athlete_code === parsedCode) return true
        if (formatAthleteCode(a.athlete_code).toLowerCase().includes(q)) return true
        if (a.name.toLowerCase().includes(q)) return true
        if (a.roll_no && a.roll_no.toLowerCase().includes(q)) return true
        return false
      })
    }

    filtered.sort((a, b) => a.athlete_code - b.athlete_code)

    const totalCount = filtered.length
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
    const paged = filtered.slice(offset, offset + pageSize)

    return {
      athletes: paged,
      totalCount,
      totalPages
    }
  },

  async searchAthletes(query: string): Promise<Athlete[]> {
    try {
      const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, []).map((a) => ({
        ...a,
        academic_year: a.academic_year || '1st'
      }))
      const q = (query || '').trim().toLowerCase()
      if (!q) return allAthletes.slice(0, 20)

      const parsedCode = parseAthleteCode(q)

      return allAthletes
        .filter((a) => {
          if (parsedCode !== null && a.athlete_code === parsedCode) return true
          if (formatAthleteCode(a.athlete_code).toLowerCase().includes(q)) return true
          if (a.name.toLowerCase().includes(q)) return true
          if (a.roll_no && a.roll_no.toLowerCase().includes(q)) return true
          return false
        })
        .slice(0, 20)
    } catch {
      return []
    }
  },

  async getAthleteByCode(code: number | string): Promise<Athlete | null> {
    try {
      const parsed = parseAthleteCode(code)
      if (parsed === null) return null
      const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
      const found = allAthletes.find((a) => a.athlete_code === parsed)
      return found ? { ...found, academic_year: found.academic_year || '1st' } : null
    } catch {
      return null
    }
  },

  async getAthleteById(id: string): Promise<Athlete | null> {
    try {
      const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
      const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
      const found = allAthletes.find((a) => a.id === id)
      if (!found) return null
      const entriesCount = allPlayers.filter((p) => p.athlete_id === id).length
      return {
        ...found,
        academic_year: found.academic_year || '1st',
        entries_count: entriesCount
      }
    } catch {
      return null
    }
  },

  async getAthleteCareer(athleteId: string): Promise<AthleteCareerEntry[]> {
    return demoAthletesService.getAthleteEntries(athleteId)
  },

  async getAthleteEntries(athleteId: string): Promise<AthleteCareerEntry[]> {
    try {
      const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
      const allSeasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
      const allTeams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

      const entries = allPlayers.filter((p) => p.athlete_id === athleteId)

      const career: AthleteCareerEntry[] = entries.map((p) => {
        const season = allSeasons.find((s) => s.id === p.season_id)
        const team = p.team_id ? allTeams.find((t) => t.id === p.team_id) : null

        return {
          player_id: p.id,
          season_id: p.season_id,
          season_name: season?.name || 'Unknown Season',
          is_season_active: !!season?.is_active,
          sport: p.sport,
          playing_role: p.playing_role,
          academic_year: p.academic_year,
          status: p.status,
          team_id: p.team_id,
          team_name: team?.name || null,
          team_short_code: team?.short_code || null,
          team_color: team?.color || null,
          base_points: p.base_points,
          purchase_price: p.purchase_price
        }
      })

      return career.sort((a, b) => {
        if (a.is_season_active && !b.is_season_active) return -1
        if (!a.is_season_active && b.is_season_active) return 1
        return a.season_name.localeCompare(b.season_name)
      })
    } catch {
      return []
    }
  },

  async createAthlete(
    data: Omit<Athlete, 'id' | 'athlete_code' | 'created_at'>
  ): Promise<Athlete> {
    const trimmedName = data.name.trim()
    if (!trimmedName) throw new AppError('Athlete name is required')
    if (!data.academic_year) throw new AppError('Academic year is required')

    const athletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const nextCode = getNextAthleteCode(athletes)

    const newAthlete: Athlete = {
      id: `ath-${Date.now()}-${nextCode}`,
      athlete_code: nextCode,
      name: trimmedName,
      academic_year: data.academic_year,
      photo_url: data.photo_url || undefined,
      photo_thumb_url: data.photo_thumb_url || undefined,
      roll_no: data.roll_no?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      created_at: new Date().toISOString(),
      entries_count: 0
    }

    athletes.push(newAthlete)
    setLocal(STORAGE_KEYS.ATHLETES, athletes)
    notifyChange('athletes_change')
    return newAthlete
  },

  async updateAthlete(id: string, updates: Partial<Athlete>): Promise<Athlete> {
    const athletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const index = athletes.findIndex((a) => a.id === id)
    if (index === -1) throw new AppError('Athlete not found')

    // athlete_code is strictly immutable
    const { athlete_code: _forbidden, entries_count: _ignored, ...safeUpdates } = updates

    const updated: Athlete = {
      ...athletes[index],
      ...safeUpdates,
      name: safeUpdates.name !== undefined ? safeUpdates.name.trim() : athletes[index].name,
      academic_year: safeUpdates.academic_year || athletes[index].academic_year || '1st'
    }

    athletes[index] = updated
    setLocal(STORAGE_KEYS.ATHLETES, athletes)

    // Sync updated name, roll_no, and photos to player entries; sync academic_year to ACTIVE season only
    const seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
    const activeSeason = seasons.find((s) => s.is_active)
    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    let playersChanged = false

    const updatedPlayers = players.map((p) => {
      if (p.athlete_id === id) {
        playersChanged = true
        const isCurrentActiveSeason = activeSeason && p.season_id === activeSeason.id
        return {
          ...p,
          name: updated.name,
          roll_no: updated.roll_no,
          photo_url: updated.photo_url,
          photo_thumb_url: updated.photo_thumb_url,
          academic_year:
            safeUpdates.academic_year !== undefined && isCurrentActiveSeason
              ? safeUpdates.academic_year
              : p.academic_year
        }
      }
      return p
    })

    if (playersChanged) {
      setLocal(STORAGE_KEYS.PLAYERS, updatedPlayers)
      notifyChange('players_change')
    }

    notifyChange('athletes_change')
    return updated
  },

  async deleteAthlete(id: string): Promise<void> {
    const allPlayers = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const hasEntries = allPlayers.some((p) => p.athlete_id === id)
    if (hasEntries) {
      throw new AppError('This athlete has sport entries and cannot be deleted.')
    }

    const athletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const target = athletes.find((a) => a.id === id)
    if (!target) throw new AppError('Athlete not found')

    await deletePlayerPhotoAssets(target.photo_url, target.photo_thumb_url)

    const remaining = athletes.filter((a) => a.id !== id)
    setLocal(STORAGE_KEYS.ATHLETES, remaining)
    notifyChange('athletes_change')
  }
}

const supabaseAthletesService: AthletesService = {
  async getAllAthletes(): Promise<Athlete[]> {
    if (!supabase) throw new AppError('Supabase not configured')
    const { data, error } = await supabase
      .from('athletes')
      .select('*')
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

    let query = supabase.from('athletes').select('*', { count: 'exact' })

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
        .select('*')
        .order('athlete_code', { ascending: true })
        .limit(20)
      if (error) throw new AppError(error.message, { original: error })
      return ((data as Athlete[]) || []).map((a) => ({
        ...a,
        academic_year: a.academic_year || '1st'
      }))
    }

    const parsedCode = parseAthleteCode(q)
    let dbQuery = supabase.from('athletes').select('*')

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
      .select(
        'id, player_code, athlete_code, name, photo_thumb_url, photo_url, academic_year, sport, playing_role, season_id, athlete_id'
      )
      .eq('athlete_code', parsed)
      .limit(1)

    if (error) {
      console.error('Supabase getAthleteByCode error:', error.message, error)
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
      .select('*')
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

  // Public career lookup reads ONLY from public_players, seasons, and public_teams
  async getAthleteCareer(athleteId: string): Promise<AthleteCareerEntry[]> {
    if (!supabase) return []

    const [playersRes, seasonsRes, teamsRes] = await Promise.all([
      supabase
        .from('public_players')
        .select('*')
        .eq('athlete_id', athleteId),
      supabase.from('seasons').select('id, name, is_active, created_at'),
      supabase
        .from('public_teams')
        .select('id, season_id, sport, name, short_code, color, logo_url, owner_display_name, created_at')
    ])

    if (playersRes.error) {
      console.error('Supabase getAthleteCareer (public_players) error:', playersRes.error.message, playersRes.error)
      return []
    }
    if (seasonsRes.error) {
      console.error('Supabase getAthleteCareer (seasons) error:', seasonsRes.error.message, seasonsRes.error)
    }
    if (teamsRes.error) {
      console.error('Supabase getAthleteCareer (public_teams) error:', teamsRes.error.message, teamsRes.error)
    }
    if (!playersRes.data) return []

    const seasonsMap = new Map<string, Season>()
    for (const s of (seasonsRes.data as Season[]) || []) {
      seasonsMap.set(s.id, s)
    }

    const teamsMap = new Map<string, PublicTeam>()
    for (const t of (teamsRes.data as PublicTeam[]) || []) {
      teamsMap.set(t.id, t)
    }

    const career: AthleteCareerEntry[] = (playersRes.data as PublicPlayer[]).map((item) => {
      const season = seasonsMap.get(item.season_id)
      const team = item.team_id ? teamsMap.get(item.team_id) : undefined
      return {
        player_id: item.id,
        season_id: item.season_id,
        season_name: season?.name || 'Season',
        is_season_active: !!season?.is_active,
        sport: item.sport,
        playing_role: item.playing_role,
        academic_year: item.academic_year || '1st',
        status: item.status || 'available',
        team_id: item.team_id ?? null,
        team_name: team?.name || null,
        team_short_code: team?.short_code || null,
        team_color: team?.color || null,
        base_points: 0,
        purchase_price: null
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
      .select()
      .single()

    if (error) throw new AppError(error.message, { original: error })
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

    const { data: updated, error } = await supabase
      .from('athletes')
      .update(payload)
      .eq('id', id)
      .select()
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

    const { error } = await supabase.from('athletes').delete().eq('id', id)
    if (error) {
      if (error.code === '23503') {
        throw new AppError('This athlete has sport entries and cannot be deleted.', {
          original: error
        })
      }
      throw new AppError(error.message, { original: error })
    }

    if (athleteToDelete) {
      await deletePlayerPhotoAssets(
        athleteToDelete.photo_url,
        athleteToDelete.photo_thumb_url
      )
    }
  }
}

export const athletesService: AthletesService = isDemoMode
  ? demoAthletesService
  : supabaseAthletesService

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
