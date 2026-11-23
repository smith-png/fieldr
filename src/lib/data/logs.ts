import { logError } from '../logger'
import type { ActivityLogEntry } from '../../types'
import { AppError } from '../errors'
import { supabase } from './client'
import type { LogsService } from './types'

function mapLogRow(raw: Record<string, unknown>): ActivityLogEntry {
  return {
    occurred_at: String(raw.occurred_at || new Date().toISOString()),
    action: String(raw.action || ''),
    player_name: raw.player_name != null ? String(raw.player_name) : null,
    team_name: raw.team_name != null ? String(raw.team_name) : null,
    amount:
      raw.amount !== null && raw.amount !== undefined && raw.amount !== ''
        ? Number(raw.amount)
        : null,
    balance_after:
      raw.balance_after !== null &&
      raw.balance_after !== undefined &&
      raw.balance_after !== ''
        ? Number(raw.balance_after)
        : null,
    note: raw.note != null ? String(raw.note) : null,
    actor: raw.actor != null ? String(raw.actor) : null
  }
}

const supabaseLogsService: LogsService = {
  async getAdminActivityLog(
    seasonId: string,
    limit = 1000,
    offset = 0
  ): Promise<ActivityLogEntry[]> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase.rpc('admin_activity_log', {
      p_season_id: seasonId,
      p_limit: limit,
      p_offset: offset
    })

    if (error) {
      logError('Supabase admin_activity_log error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

    const rows = Array.isArray(data)
      ? (data as Array<Record<string, unknown>>).map(mapLogRow)
      : []

    rows.sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    )

    return rows
  }
}

export const logsService: LogsService = supabaseLogsService

export const getAdminActivityLog = (
  seasonId: string,
  limit = 1000,
  offset = 0
) => logsService.getAdminActivityLog(seasonId, limit, offset)
