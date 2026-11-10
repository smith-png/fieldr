import type { Athlete, AthleteCareerEntry, Player, Season, Team } from '../../types'
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
import type { AthletesService } from './types'

const demoAthletesService: AthletesService = {
  async searchAthletes(query: string): Promise<Athlete[]> {
    try {
      const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
      const q = (query || '').trim().toLowerCase()
      if (!q) return allAthletes.slice(0, 10)

      const parsedCode = parseAthleteCode(q)

      return allAthletes.filter((a) => {
        if (parsedCode !== null && a.athlete_code === parsedCode) return true
        if (a.name.toLowerCase().includes(q)) return true
        if (a.roll_no && a.roll_no.toLowerCase().includes(q)) return true
        return false
      }).slice(0, 20)
    } catch {
      return []
    }
  },

  async getAthleteByCode(code: number | string): Promise<Athlete | null> {
    try {
      const parsed = parseAthleteCode(code)
      if (parsed === null) return null
      const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
      return allAthletes.find((a) => a.athlete_code === parsed) || null
    } catch {
      return null
    }
  },

  async getAthleteById(id: string): Promise<Athlete | null> {
    try {
      const allAthletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
      return allAthletes.find((a) => a.id === id) || null
    } catch {
      return null
    }
  },

  async getAthleteCareer(athleteId: string): Promise<AthleteCareerEntry[]> {
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

      // Sort by season creation date or active first
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

    const athletes = getLocal<Athlete[]>(STORAGE_KEYS.ATHLETES, [])
    const nextCode = getNextAthleteCode(athletes)

    const newAthlete: Athlete = {
      id: `ath-${Date.now()}-${nextCode}`,
      athlete_code: nextCode,
      name: trimmedName,
      photo_url: data.photo_url || undefined,
      photo_thumb_url: data.photo_thumb_url || undefined,
      roll_no: data.roll_no?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      created_at: new Date().toISOString()
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
    const { athlete_code: _forbidden, ...safeUpdates } = updates

    const updated = {
      ...athletes[index],
      ...safeUpdates,
      name: safeUpdates.name !== undefined ? safeUpdates.name.trim() : athletes[index].name
    }

    athletes[index] = updated
    setLocal(STORAGE_KEYS.ATHLETES, athletes)

    // Sync updated name and photos to player entries for this athlete
    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    let playersChanged = false
    const updatedPlayers = players.map((p) => {
      if (p.athlete_id === id) {
        playersChanged = true
        return {
          ...p,
          name: updated.name,
          photo_url: updated.photo_url,
          photo_thumb_url: updated.photo_thumb_url
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
  }
}

const supabaseAthletesService: AthletesService = {
  async searchAthletes(query: string): Promise<Athlete[]> {
    if (!supabase) return []
    const q = (query || '').trim()
    if (!q) {
      const { data } = await supabase
        .from('athletes')
        .select('*')
        .order('athlete_code', { ascending: true })
        .limit(10)
      return (data as Athlete[]) || []
    }

    const parsedCode = parseAthleteCode(q)
    let dbQuery = supabase.from('athletes').select('*')

    if (parsedCode !== null) {
      dbQuery = dbQuery.or(`athlete_code.eq.${parsedCode},name.ilike.%${q}%,roll_no.ilike.%${q}%`)
    } else {
      dbQuery = dbQuery.or(`name.ilike.%${q}%,roll_no.ilike.%${q}%`)
    }

    const { data, error } = await dbQuery.limit(20)
    if (error) {
      console.error('searchAthletes error:', error)
      return []
    }
    return (data as Athlete[]) || []
  },

  async getAthleteByCode(code: number | string): Promise<Athlete | null> {
    if (!supabase) return null
    const parsed = parseAthleteCode(code)
    if (parsed === null) return null

    const { data, error } = await supabase
      .from('athletes')
      .select('*')
      .eq('athlete_code', parsed)
      .maybeSingle()

    if (error) {
      console.error('getAthleteByCode error:', error)
      return null
    }
    return data as Athlete | null
  },

  async getAthleteById(id: string): Promise<Athlete | null> {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('athletes')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      console.error('getAthleteById error:', error)
      return null
    }
    return data as Athlete | null
  },

  async getAthleteCareer(athleteId: string): Promise<AthleteCareerEntry[]> {
    if (!supabase) return []

    // Fetch player entries with seasons and teams
    const { data: entries, error } = await supabase
      .from('players')
      .select(`
        id,
        season_id,
        sport,
        playing_role,
        academic_year,
        status,
        team_id,
        base_points,
        purchase_price,
        seasons!inner ( id, name, is_active, created_at ),
        teams ( id, name, short_code, color )
      `)
      .eq('athlete_id', athleteId)

    if (error) {
      console.error('getAthleteCareer error:', error)
      return []
    }

    if (!entries) return []

    const career: AthleteCareerEntry[] = entries.map((item: any) => ({
      player_id: item.id,
      season_id: item.season_id,
      season_name: item.seasons?.name || 'Unknown Season',
      is_season_active: !!item.seasons?.is_active,
      sport: item.sport,
      playing_role: item.playing_role,
      academic_year: item.academic_year || '1st',
      status: item.status,
      team_id: item.team_id,
      team_name: item.teams?.name || null,
      team_short_code: item.teams?.short_code || null,
      team_color: item.teams?.color || null,
      base_points: item.base_points,
      purchase_price: item.purchase_price
    }))

    return career.sort((a, b) => {
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

    const { data: created, error } = await supabase
      .from('athletes')
      .insert([
        {
          name: trimmedName,
          photo_url: data.photo_url || null,
          photo_thumb_url: data.photo_thumb_url || null,
          roll_no: data.roll_no?.trim() || null,
          notes: data.notes?.trim() || null
        }
      ])
      .select()
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return created as Athlete
  },

  async updateAthlete(id: string, updates: Partial<Athlete>): Promise<Athlete> {
    if (!supabase) throw new AppError('Supabase not configured')

    // athlete_code is immutable
    const { athlete_code: _forbidden, ...safeUpdates } = updates

    const { data: updated, error } = await supabase
      .from('athletes')
      .update(safeUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return updated as Athlete
  }
}

export const athletesService: AthletesService = isDemoMode
  ? demoAthletesService
  : supabaseAthletesService

export const searchAthletes = (q: string) => athletesService.searchAthletes(q)
export const getAthleteByCode = (code: number | string) => athletesService.getAthleteByCode(code)
export const getAthleteById = (id: string) => athletesService.getAthleteById(id)
export const getAthleteCareer = (athleteId: string) => athletesService.getAthleteCareer(athleteId)
export const createAthlete = (data: Omit<Athlete, 'id' | 'athlete_code' | 'created_at'>) =>
  athletesService.createAthlete(data)
export const updateAthlete = (id: string, updates: Partial<Athlete>) =>
  athletesService.updateAthlete(id, updates)
export { formatAthleteCode, parseAthleteCode }
