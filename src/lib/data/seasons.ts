import type { CarouselItem, Match, MatchPlayerStats, Player, ProjectorState, PurseTransaction, Season, SeasonDeletionCounts, Team } from '../../types'
import { AppError } from '../errors'
import {
  isDemoMode,
  supabase,
  getLocal,
  setLocal,
  notifyChange,
  STORAGE_KEYS
} from './client'
import type { SeasonsService } from './types'

const demoSeasonsService: SeasonsService = {
  async getSeasons(): Promise<Season[]> {
    try {
      const stored = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
      if (!Array.isArray(stored)) return []
      return [...stored].sort((a, b) => {
        if (a.is_active && !b.is_active) return -1
        if (!a.is_active && b.is_active) return 1
        return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
      })
    } catch {
      return []
    }
  },

  async getSeason(id: string): Promise<Season | null> {
    const seasons = await demoSeasonsService.getSeasons()
    return seasons.find((s) => s.id === id) || null
  },

  async getActiveSeason(): Promise<Season | null> {
    try {
      const seasons = await demoSeasonsService.getSeasons()
      return seasons.find((s) => s && s.is_active) || null
    } catch {
      return null
    }
  },

  async createSeason(
    name: string,
    startDate?: string,
    endDate?: string,
    description?: string,
    isArchived = false
  ): Promise<Season> {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new AppError('Season name is required')
    }

    const seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
    const nameExists = seasons.some(
      (s) => s.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (nameExists) {
      throw new AppError(`A season named "${trimmedName}" already exists`)
    }

    if (startDate && endDate && endDate < startDate) {
      throw new AppError('End date must be on or after start date')
    }

    if (isArchived && seasons.length === 0) {
      // First season must be active unless user overrides
    }

    const newSeason: Season = {
      id: `season-${Date.now()}`,
      name: trimmedName,
      is_active: !isArchived && seasons.length === 0,
      is_archived: isArchived,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      description: description?.trim() || undefined,
      created_at: new Date().toISOString()
    }

    seasons.unshift(newSeason)
    setLocal(STORAGE_KEYS.SEASONS, seasons)
    notifyChange('seasons_change')
    return newSeason
  },

  async setActiveSeason(id: string): Promise<void> {
    const seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
    const target = seasons.find((s) => s.id === id)
    if (!target) {
      throw new AppError('Season not found')
    }
    if (target.is_archived) {
      throw new AppError('An archived season cannot be made active')
    }

    const updated = seasons.map((s) => ({
      ...s,
      is_active: s.id === id
    }))
    setLocal(STORAGE_KEYS.SEASONS, updated)

    const projector = getLocal<ProjectorState>(STORAGE_KEYS.PROJECTOR, {
      season_id: id,
      mode: 'idle',
      player_id: null,
      team_id: null,
      updated_at: new Date().toISOString()
    })
    setLocal(STORAGE_KEYS.PROJECTOR, { ...projector, season_id: id })

    notifyChange('seasons_change')
    notifyChange('projector_change')
  },

  async getSeasonDeletionPreview(seasonId: string): Promise<SeasonDeletionCounts> {
    const teams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, []).filter((t) => t.season_id === seasonId)
    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter((p) => p.season_id === seasonId)
    const matches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, []).filter((m) => m.season_id === seasonId)
    const matchIds = new Set(matches.map((m) => m.id))
    const matchStats = getLocal<MatchPlayerStats[]>(STORAGE_KEYS.MATCH_STATS, []).filter((s) => matchIds.has(s.match_id))
    const txs = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, []).filter((t) => t.season_id === seasonId)
    const carousel = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, []).filter((c) => c.season_id === seasonId)

    return {
      teams: teams.length,
      players: players.length,
      matches: matches.length,
      match_stats: matchStats.length,
      purse_transactions: txs.length,
      carousel_items: carousel.length
    }
  },

  async deleteSeason(seasonId: string): Promise<void> {
    const seasons = getLocal<Season[]>(STORAGE_KEYS.SEASONS, [])
    const target = seasons.find((s) => s.id === seasonId)
    if (!target) {
      throw new AppError('Season not found')
    }
    if (target.is_active) {
      throw new AppError('Cannot delete active season. Make another season active first.')
    }
    if (seasons.length <= 1) {
      throw new AppError('Cannot delete the only remaining season.')
    }

    // Cascade delete season records (athletes are preserved!)
    const matches = getLocal<Match[]>(STORAGE_KEYS.MATCHES, [])
    const matchIds = new Set(matches.filter((m) => m.season_id === seasonId).map((m) => m.id))

    const remainingMatches = matches.filter((m) => m.season_id !== seasonId)
    setLocal(STORAGE_KEYS.MATCHES, remainingMatches)

    const stats = getLocal<MatchPlayerStats[]>(STORAGE_KEYS.MATCH_STATS, [])
    const remainingStats = stats.filter((s) => !matchIds.has(s.match_id))
    setLocal(STORAGE_KEYS.MATCH_STATS, remainingStats)

    const txs = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
    setLocal(STORAGE_KEYS.TRANSACTIONS, txs.filter((t) => t.season_id !== seasonId))

    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    setLocal(STORAGE_KEYS.PLAYERS, players.filter((p) => p.season_id !== seasonId))

    const teams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    setLocal(STORAGE_KEYS.TEAMS, teams.filter((t) => t.season_id !== seasonId))

    const carousel = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, [])
    setLocal(STORAGE_KEYS.CAROUSEL, carousel.filter((c) => c.season_id !== seasonId))

    const remainingSeasons = seasons.filter((s) => s.id !== seasonId)
    setLocal(STORAGE_KEYS.SEASONS, remainingSeasons)

    notifyChange('seasons_change')
    notifyChange('teams_change')
    notifyChange('players_change')
    notifyChange('matches_change')
  }
}

const supabaseSeasonsService: SeasonsService = {
  async getSeasons(): Promise<Season[]> {
    try {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        console.error('getSeasons error from Supabase:', error)
        return []
      }
      return Array.isArray(data) ? (data as Season[]) : []
    } catch (err) {
      console.error('getSeasons caught error:', err)
      return []
    }
  },

  async getSeason(id: string): Promise<Season | null> {
    try {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error) {
        console.error('getSeason error from Supabase:', error)
        return null
      }
      return data as Season | null
    } catch (err) {
      console.error('getSeason caught error:', err)
      return null
    }
  },

  async getActiveSeason(): Promise<Season | null> {
    try {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        console.error('getActiveSeason error from Supabase:', error)
        return null
      }
      return data as Season | null
    } catch (err) {
      console.error('getActiveSeason caught error:', err)
      return null
    }
  },

  async createSeason(
    name: string,
    startDate?: string,
    endDate?: string,
    description?: string,
    isArchived = false
  ): Promise<Season> {
    if (!supabase) throw new AppError('Supabase not configured')

    const trimmedName = name.trim()
    if (!trimmedName) throw new AppError('Season name is required')
    if (startDate && endDate && endDate < startDate) {
      throw new AppError('End date must be on or after start date')
    }

    const { data, error } = await supabase
      .from('seasons')
      .insert([
        {
          name: trimmedName,
          is_active: false,
          is_archived: isArchived,
          start_date: startDate || null,
          end_date: endDate || null,
          description: description?.trim() || null
        }
      ])
      .select()
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as Season
  },

  async setActiveSeason(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data: seasonToActivate, error: checkError } = await supabase
      .from('seasons')
      .select('is_archived')
      .eq('id', id)
      .single()

    if (checkError || !seasonToActivate) {
      throw new AppError('Season not found')
    }
    if (seasonToActivate.is_archived) {
      throw new AppError('An archived season cannot be made active')
    }

    const { data: currentActive } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)

    const prevActiveIds = currentActive ? currentActive.map((s) => s.id) : []

    if (prevActiveIds.length > 0) {
      const { error: deactError } = await supabase
        .from('seasons')
        .update({ is_active: false })
        .in('id', prevActiveIds)

      if (deactError) {
        throw new AppError(`Failed to deactivate current season: ${deactError.message}`, {
          original: deactError
        })
      }
    }

    const { error: actError } = await supabase
      .from('seasons')
      .update({ is_active: true })
      .eq('id', id)

    if (actError) {
      if (prevActiveIds.length > 0) {
        await supabase
          .from('seasons')
          .update({ is_active: true })
          .in('id', prevActiveIds)
      }
      throw new AppError(`Failed to activate season: ${actError.message}`, {
        original: actError
      })
    }
  },

  async getSeasonDeletionPreview(seasonId: string): Promise<SeasonDeletionCounts> {
    if (!supabase) {
      return { teams: 0, players: 0, matches: 0, match_stats: 0, purse_transactions: 0, carousel_items: 0 }
    }

    const [teamsRes, playersRes, matchesRes, txRes, carRes] = await Promise.all([
      supabase.from('teams').select('id', { count: 'exact', head: true }).eq('season_id', seasonId),
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('season_id', seasonId),
      supabase.from('matches').select('id', { count: 'exact', head: true }).eq('season_id', seasonId),
      supabase.from('purse_transactions').select('id', { count: 'exact', head: true }).eq('season_id', seasonId),
      supabase.from('carousel_items').select('id', { count: 'exact', head: true }).eq('season_id', seasonId)
    ])

    return {
      teams: teamsRes.count || 0,
      players: playersRes.count || 0,
      matches: matchesRes.count || 0,
      match_stats: 0, // cascades with matches
      purse_transactions: txRes.count || 0,
      carousel_items: carRes.count || 0
    }
  },

  async deleteSeason(seasonId: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { error } = await supabase.rpc('delete_season', {
      p_season_id: seasonId
    })

    if (error) {
      throw new AppError(error.message, { original: error })
    }
  }
}

export const seasonsService: SeasonsService = isDemoMode
  ? demoSeasonsService
  : supabaseSeasonsService

export const getSeasons = () => seasonsService.getSeasons()
export const getSeason = (id: string) => seasonsService.getSeason(id)
export const getActiveSeason = () => seasonsService.getActiveSeason()
export const createSeason = (
  name: string,
  start?: string,
  end?: string,
  description?: string,
  isArchived?: boolean
) => seasonsService.createSeason(name, start, end, description, isArchived)
export const setActiveSeason = (id: string) => seasonsService.setActiveSeason(id)
export const getSeasonDeletionPreview = (seasonId: string) =>
  seasonsService.getSeasonDeletionPreview(seasonId)
export const deleteSeason = (seasonId: string) => seasonsService.deleteSeason(seasonId)
