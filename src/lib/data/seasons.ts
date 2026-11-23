import { logError } from '../logger'
import type { Season, SeasonDeletionCounts } from '../../types'
import { AppError } from '../errors'
import { publicCache } from '../publicCache'
import { supabase, markLocalMutation } from './client'
import type { SeasonsService } from './types'

export function invalidateSeasonCaches(): void {
  publicCache.activeSeason = { loaded: false, value: null }
  publicCache.seasonTeamDetails.clear()
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('fieldr_seasons_updated_at', String(Date.now()))
      localStorage.removeItem('fieldr_public_home_v1')
    } catch {
      // ignore storage errors
    }
  }
}

const SEASON_COLS =
  'id, name, is_active, start_date, end_date, description, created_at'

const supabaseSeasonsService: SeasonsService = {
  async getSeasons(): Promise<Season[]> {
    try {
      if (!supabase) return []
      const { data, error } = await supabase
        .from('seasons')
        .select(SEASON_COLS)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        logError('getSeasons error from Supabase:', error)
        return []
      }
      return Array.isArray(data) ? (data as Season[]) : []
    } catch (err) {
      logError('getSeasons caught error:', err)
      return []
    }
  },

  async getSeason(id: string): Promise<Season | null> {
    try {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('seasons')
        .select(SEASON_COLS)
        .eq('id', id)
        .maybeSingle()

      if (error) {
        logError('getSeason error from Supabase:', error)
        return null
      }
      return data as Season | null
    } catch (err) {
      logError('getSeason caught error:', err)
      return null
    }
  },

  async getActiveSeason(): Promise<Season | null> {
    try {
      if (!supabase) return null
      const { data, error } = await supabase
        .from('seasons')
        .select('id, name, is_active, created_at')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (error) {
        logError('getActiveSeason error from Supabase:', error)
        return null
      }
      return data as Season | null
    } catch (err) {
      logError('getActiveSeason caught error:', err)
      return null
    }
  },

  async createSeason(
    name: string,
    startDate?: string,
    endDate?: string,
    description?: string
  ): Promise<Season> {
    if (!supabase) throw new AppError('Supabase not configured')

    const trimmedName = name.trim()
    if (!trimmedName) throw new AppError('Season name is required')
    if (startDate && endDate && endDate < startDate) {
      throw new AppError('End date must be on or after start date')
    }

    markLocalMutation(['players', 'teams', 'auction'])
    const { data, error } = await supabase
      .from('seasons')
      .insert([
        {
          name: trimmedName,
          is_active: false,
          start_date: startDate || null,
          end_date: endDate || null,
          description: description?.trim() || null
        }
      ])
      .select(SEASON_COLS)
      .single()

    if (error) throw new AppError(error.message, { original: error })
    markLocalMutation(['players', 'teams', 'auction'])
    invalidateSeasonCaches()
    return data as Season
  },

  async renameSeason(seasonId: string, name: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    const trimmedName = name.trim()
    if (trimmedName.length < 1 || trimmedName.length > 60) {
      throw new AppError('Season name must be between 1 and 60 characters')
    }

    markLocalMutation(['players', 'teams', 'auction'])
    const { data, error } = await supabase.rpc('rename_season', {
      p_season_id: seasonId,
      p_name: trimmedName
    })

    if (error) {
      throw new AppError(error.message, { original: error })
    }
    if (data && typeof data === 'object' && 'error' in data && (data as { error?: unknown }).error) {
      throw new AppError(String((data as { error: unknown }).error))
    }

    markLocalMutation(['players', 'teams', 'auction'])
    invalidateSeasonCaches()
  },

  async setActiveSeason(id: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data: seasonToActivate, error: checkError } = await supabase
      .from('seasons')
      .select('id')
      .eq('id', id)
      .single()

    if (checkError || !seasonToActivate) {
      throw new AppError('Season not found')
    }

    markLocalMutation(['players', 'teams', 'auction'])
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
    markLocalMutation(['players', 'teams', 'auction'])
    invalidateSeasonCaches()
  },

  async getSeasonDeletionPreview(seasonId: string): Promise<SeasonDeletionCounts> {
    if (!supabase) {
      return { teams: 0, players: 0, purse_transactions: 0, carousel_items: 0 }
    }

    const [teamsRes, playersRes, txRes, carRes] = await Promise.all([
      supabase.from('teams').select('id', { count: 'exact', head: true }).eq('season_id', seasonId),
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('season_id', seasonId),
      supabase.from('purse_transactions').select('id', { count: 'exact', head: true }).eq('season_id', seasonId),
      supabase.from('carousel_items').select('id', { count: 'exact', head: true }).eq('season_id', seasonId)
    ])

    return {
      teams: teamsRes.count || 0,
      players: playersRes.count || 0,
      purse_transactions: txRes.count || 0,
      carousel_items: carRes.count || 0
    }
  },

  async deleteSeason(seasonId: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    markLocalMutation(['players', 'teams', 'auction'])
    const { error } = await supabase.rpc('delete_season', {
      p_season_id: seasonId
    })

    if (error) {
      throw new AppError(error.message, { original: error })
    }
    markLocalMutation(['players', 'teams', 'auction'])
    invalidateSeasonCaches()
  }
}

export const seasonsService: SeasonsService = supabaseSeasonsService

export const getSeasons = () => seasonsService.getSeasons()
export const getSeason = (id: string) => seasonsService.getSeason(id)
export const getActiveSeason = () => seasonsService.getActiveSeason()
export const createSeason = (
  name: string,
  start?: string,
  end?: string,
  description?: string
) => seasonsService.createSeason(name, start, end, description)
export const renameSeason = (seasonId: string, name: string) =>
  seasonsService.renameSeason(seasonId, name)
export const setActiveSeason = (id: string) => seasonsService.setActiveSeason(id)
export const getSeasonDeletionPreview = (seasonId: string) =>
  seasonsService.getSeasonDeletionPreview(seasonId)
export const deleteSeason = (seasonId: string) => seasonsService.deleteSeason(seasonId)
