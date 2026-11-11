import type {
  ActivityLogEntry,
  AuctionBid,
  AuctionSale,
  Player,
  PurseTransaction,
  Team
} from '../../types'
import { AppError } from '../errors'
import { isDemoMode, supabase, getLocal, STORAGE_KEYS } from './client'
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

const demoLogsService: LogsService = {
  async getAdminActivityLog(
    seasonId: string,
    limit = 1000,
    offset = 0
  ): Promise<ActivityLogEntry[]> {
    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter(
      (p) => p.season_id === seasonId
    )
    const teams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, []).filter(
      (t) => t.season_id === seasonId
    )
    const bids = getLocal<AuctionBid[]>(STORAGE_KEYS.DEMO_AUCTION_BIDS, []).filter(
      (b) => !b.season_id || b.season_id === seasonId
    )
    const sales = getLocal<AuctionSale[]>(STORAGE_KEYS.DEMO_AUCTION_SALES, []).filter(
      (s) => !s.season_id || s.season_id === seasonId
    )
    const txs = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, []).filter(
      (t) => t.season_id === seasonId
    )

    const playerMap = new Map(players.map((p) => [p.id, p.name]))
    const teamMap = new Map(teams.map((t) => [t.id, t.name]))

    const entries: ActivityLogEntry[] = []

    for (const b of bids) {
      entries.push({
        occurred_at: b.created_at,
        action: b.voided ? 'Bid cleared' : 'Bid placed',
        player_name: playerMap.get(b.player_id) || null,
        team_name: teamMap.get(b.team_id) || null,
        amount: b.amount,
        balance_after: null,
        note: null,
        actor: 'admin'
      })
    }

    for (const s of sales) {
      entries.push({
        occurred_at: s.created_at,
        action: 'Sold',
        player_name: playerMap.get(s.player_id) || null,
        team_name: teamMap.get(s.team_id) || null,
        amount: s.price,
        balance_after: null,
        note: null,
        actor: 'admin'
      })
      if (s.reversed_at) {
        entries.push({
          occurred_at: s.reversed_at,
          action: 'Sale reversed',
          player_name: playerMap.get(s.player_id) || null,
          team_name: teamMap.get(s.team_id) || null,
          amount: s.price,
          balance_after: null,
          note: null,
          actor: 'admin'
        })
      }
    }

    for (const tx of txs) {
      entries.push({
        occurred_at: tx.created_at,
        action: `Purse ${tx.type}`,
        player_name: null,
        team_name: teamMap.get(tx.team_id) || null,
        amount: tx.amount,
        balance_after: tx.balance_after,
        note: tx.reason || null,
        actor: tx.created_by || 'admin'
      })
    }

    entries.sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    )

    return entries.slice(offset, offset + limit)
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
      console.error('Supabase admin_activity_log error:', error.message, error)
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

export const logsService: LogsService = isDemoMode
  ? demoLogsService
  : supabaseLogsService

export const getAdminActivityLog = (
  seasonId: string,
  limit = 1000,
  offset = 0
) => logsService.getAdminActivityLog(seasonId, limit, offset)
