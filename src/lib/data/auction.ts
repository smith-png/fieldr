import { logError } from '../logger'
import type {
  AuctionBid,
  AuctionSale,
  AuctionSettings,
  Player,
  ProjectorState
} from '../../types'
import { AppError } from '../errors'
import {
  supabase,
  REALTIME_DEBOUNCE_MS,
  markLocalMutation,
  isRealtimeSuppressed,
  formatAthleteCode
} from './client'
import type { AuctionService } from './types'

export const DEFAULT_AUCTION_SETTINGS: Omit<AuctionSettings, 'season_id'> = {
  bid_increments: [5, 10, 25],
  max_squad_size: null,
  secured_enabled: true,
  secured_duration_seconds: 5.6,
  price_countup_seconds: 1.8,
  bid_update_ms: 600,
  catchup_window_seconds: 15
}

export function getDefaultAuctionSettings(seasonId: string): AuctionSettings {
  return {
    season_id: seasonId,
    bid_increments: [...DEFAULT_AUCTION_SETTINGS.bid_increments],
    max_squad_size: DEFAULT_AUCTION_SETTINGS.max_squad_size,
    secured_enabled: DEFAULT_AUCTION_SETTINGS.secured_enabled,
    secured_duration_seconds: DEFAULT_AUCTION_SETTINGS.secured_duration_seconds,
    price_countup_seconds: DEFAULT_AUCTION_SETTINGS.price_countup_seconds,
    bid_update_ms: DEFAULT_AUCTION_SETTINGS.bid_update_ms,
    catchup_window_seconds: DEFAULT_AUCTION_SETTINGS.catchup_window_seconds
  }
}

function normalizeAuctionSettings(seasonId: string, raw?: Record<string, unknown> | null): AuctionSettings {
  if (!raw) {
    return getDefaultAuctionSettings(seasonId)
  }

  let increments = [...DEFAULT_AUCTION_SETTINGS.bid_increments]
  if (Array.isArray(raw.bid_increments) && raw.bid_increments.length > 0) {
    const uniquePositive = Array.from(
      new Set(
        raw.bid_increments
          .map((v) => Number(v))
          .filter((v) => !isNaN(v) && v > 0)
      )
    ).sort((a, b) => a - b)
    if (uniquePositive.length > 0) {
      increments = uniquePositive
    }
  }

  const maxSquad =
    raw.max_squad_size !== undefined && raw.max_squad_size !== null && Number(raw.max_squad_size) > 0
      ? Math.round(Number(raw.max_squad_size))
      : null

  const securedEnabled =
    typeof raw.secured_enabled === 'boolean'
      ? raw.secured_enabled
      : DEFAULT_AUCTION_SETTINGS.secured_enabled

  const rawDuration = Number(raw.secured_duration_seconds)
  const securedDurationSeconds =
    raw.secured_duration_seconds !== undefined &&
    raw.secured_duration_seconds !== null &&
    !isNaN(rawDuration) &&
    rawDuration >= 2 &&
    rawDuration <= 15
      ? rawDuration
      : DEFAULT_AUCTION_SETTINGS.secured_duration_seconds

  const rawCountup = Number(raw.price_countup_seconds)
  const priceCountupSeconds =
    raw.price_countup_seconds !== undefined &&
    raw.price_countup_seconds !== null &&
    !isNaN(rawCountup) &&
    rawCountup >= 0.3 &&
    rawCountup <= 6
      ? Math.min(rawCountup, securedDurationSeconds)
      : Math.min(DEFAULT_AUCTION_SETTINGS.price_countup_seconds, securedDurationSeconds)

  const rawBidUpdateMs = Number(raw.bid_update_ms)
  const bidUpdateMs =
    raw.bid_update_ms !== undefined &&
    raw.bid_update_ms !== null &&
    !isNaN(rawBidUpdateMs) &&
    rawBidUpdateMs >= 100 &&
    rawBidUpdateMs <= 2000
      ? Math.round(rawBidUpdateMs)
      : DEFAULT_AUCTION_SETTINGS.bid_update_ms

  const rawCatchup = Number(raw.catchup_window_seconds)
  const catchupWindowSeconds =
    raw.catchup_window_seconds !== undefined &&
    raw.catchup_window_seconds !== null &&
    !isNaN(rawCatchup) &&
    rawCatchup >= 0 &&
    rawCatchup <= 120
      ? Math.round(rawCatchup)
      : DEFAULT_AUCTION_SETTINGS.catchup_window_seconds

  return {
    season_id: String(raw.season_id || seasonId),
    bid_increments: increments,
    max_squad_size: maxSquad,
    secured_enabled: securedEnabled,
    secured_duration_seconds: securedDurationSeconds,
    price_countup_seconds: priceCountupSeconds,
    bid_update_ms: bidUpdateMs,
    catchup_window_seconds: catchupWindowSeconds
  }
}

function normalizeBid(row: Record<string, unknown>): AuctionBid {
  return {
    id: String(row.id || ''),
    season_id: row.season_id ? String(row.season_id) : undefined,
    player_id: String(row.player_id || ''),
    team_id: String(row.team_id || ''),
    amount: Number(row.amount || 0),
    voided: Boolean(row.voided),
    created_at: String(row.created_at || new Date().toISOString())
  }
}

function normalizeSale(row: Record<string, unknown>): AuctionSale {
  return {
    id: String(row.id || ''),
    season_id: row.season_id ? String(row.season_id) : undefined,
    player_id: String(row.player_id || ''),
    team_id: String(row.team_id || ''),
    price: Number(row.price || 0),
    reversed_at: row.reversed_at ? String(row.reversed_at) : null,
    created_at: String(row.created_at || new Date().toISOString())
  }
}

const AUCTION_SETTINGS_COLS =
  'season_id, bid_increments, max_squad_size, secured_enabled, secured_duration_seconds, price_countup_seconds, bid_update_ms, catchup_window_seconds'

const supabaseAuctionService: AuctionService = {
  async getAuctionSettings(seasonId: string): Promise<AuctionSettings> {
    if (!supabase || !seasonId) {
      return normalizeAuctionSettings(seasonId, null)
    }

    const { data, error } = await supabase
      .from('auction_settings')
      .select(AUCTION_SETTINGS_COLS)
      .eq('season_id', seasonId)
      .maybeSingle()

    if (error) {
      logError('Supabase getAuctionSettings error:', error.message, error)
      return normalizeAuctionSettings(seasonId, null)
    }

    return normalizeAuctionSettings(seasonId, data as Record<string, unknown> | null)
  },

  async saveAuctionSettings(settings: AuctionSettings): Promise<AuctionSettings> {
    if (!supabase) throw new AppError('Supabase not configured')
    if (!settings.season_id) throw new AppError('Season ID is required.')

    const sortedIncrements = Array.from(
      new Set(
        settings.bid_increments
          .map((v) => Number(v))
          .filter((v) => !isNaN(v) && v > 0)
      )
    ).sort((a, b) => a - b)

    const payload = {
      season_id: settings.season_id,
      bid_increments: sortedIncrements,
      max_squad_size:
        settings.max_squad_size !== null &&
        settings.max_squad_size !== undefined &&
        Number(settings.max_squad_size) > 0
          ? Math.round(Number(settings.max_squad_size))
          : null,
      secured_enabled: Boolean(settings.secured_enabled),
      secured_duration_seconds: Number(settings.secured_duration_seconds),
      price_countup_seconds: Number(settings.price_countup_seconds),
      bid_update_ms: Math.round(Number(settings.bid_update_ms)),
      catchup_window_seconds: Math.round(Number(settings.catchup_window_seconds))
    }

    markLocalMutation(['auction'])
    const { data, error } = await supabase
      .from('auction_settings')
      .upsert(payload, { onConflict: 'season_id' })
      .select(AUCTION_SETTINGS_COLS)
      .single()

    if (error) {
      logError('Supabase saveAuctionSettings error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

    markLocalMutation(['auction'])
    return normalizeAuctionSettings(settings.season_id, data as Record<string, unknown>)
  },

  subscribeToAuctionSettings(
    seasonId: string,
    callback: (settings: AuctionSettings) => void
  ): () => void {
    if (!supabase || !seasonId) return () => {}

    let active = true
    let latestReqId = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleCallback = (raw?: Record<string, unknown>) => {
      if (!active || isRealtimeSuppressed('auction')) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!active || isRealtimeSuppressed('auction')) return
        if (raw && Object.keys(raw).length > 0) {
          callback(normalizeAuctionSettings(seasonId, raw))
        } else {
          const reqId = ++latestReqId
          supabaseAuctionService
            .getAuctionSettings(seasonId)
            .then((res) => {
              if (active && reqId === latestReqId) callback(res)
            })
            .catch(() => {})
        }
      }, REALTIME_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel(`auction_settings_${seasonId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_settings',
          filter: `season_id=eq.${seasonId}`
        },
        (payload) => {
          scheduleCallback(payload.new as Record<string, unknown> | undefined)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const reqId = ++latestReqId
          supabaseAuctionService
            .getAuctionSettings(seasonId)
            .then((res) => {
              if (active && reqId === latestReqId) callback(res)
            })
            .catch(() => {})
        }
      })

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      if (supabase) {
        supabase.removeChannel(channel)
      }
    }
  },

  async getAuctionBidsForPlayer(playerId: string): Promise<AuctionBid[]> {
    if (!supabase || !playerId) return []

    const { data, error } = await supabase
      .from('auction_bids')
      .select('id, player_id, team_id, amount, voided, created_at')
      .eq('player_id', playerId)
      .eq('voided', false)
      .order('created_at', { ascending: false })

    if (error) {
      logError('Supabase getAuctionBidsForPlayer error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

    return ((data as Array<Record<string, unknown>>) || []).map(normalizeBid)
  },

  async getRecentAuctionSales(seasonId: string, limit = 10): Promise<AuctionSale[]> {
    if (!supabase || !seasonId) return []

    const { data, error } = await supabase
      .from('auction_sales')
      .select('id, season_id, player_id, team_id, price, reversed_at, created_at')
      .eq('season_id', seasonId)
      .is('reversed_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (!error) {
      return ((data as Array<Record<string, unknown>>) || []).map(normalizeSale)
    }

    // Fallback if auction_sales does not filter by season_id directly
    const isColumnError =
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      (error.message && error.message.includes('season_id'))

    if (!isColumnError) {
      logError('Supabase getRecentAuctionSales error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('auction_sales')
      .select('id, player_id, team_id, price, reversed_at, created_at')
      .is('reversed_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (fallbackError) {
      logError('Supabase getRecentAuctionSales error:', fallbackError.message, fallbackError)
      throw new AppError(fallbackError.message, { original: fallbackError })
    }

    return ((fallbackData as Array<Record<string, unknown>>) || []).map(normalizeSale)
  },

  async auctionBringToStage(playerId: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')
    markLocalMutation(['auction'])
    const { error } = await supabase.rpc('auction_bring_to_stage', {
      p_player_id: playerId
    })
    if (error) {
      logError('Supabase auction_bring_to_stage error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }
    markLocalMutation(['auction'])
  },

  async auctionPlaceBid(teamId: string, amount: number): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')
    markLocalMutation(['auction'])
    const { error } = await supabase.rpc('auction_place_bid', {
      p_team_id: teamId,
      p_amount: amount
    })
    if (error) {
      logError('Supabase auction_place_bid error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }
    markLocalMutation(['auction'])
  },

  async auctionClearBid(seasonId: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')
    markLocalMutation(['auction'])
    const { error } = await supabase.rpc('auction_clear_bid', {
      p_season_id: seasonId
    })
    if (error) {
      logError('Supabase auction_clear_bid error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }
    markLocalMutation(['auction'])
  },

  async auctionSecure(seasonId: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')
    markLocalMutation(['auction', 'players', 'teams'])
    const { error } = await supabase.rpc('auction_secure', {
      p_season_id: seasonId
    })
    if (error) {
      logError('Supabase auction_secure error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }
    markLocalMutation(['auction', 'players', 'teams'])
  },

  async auctionMarkUnsold(seasonId: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')
    markLocalMutation(['auction', 'players'])
    const { error } = await supabase.rpc('auction_mark_unsold', {
      p_season_id: seasonId
    })
    if (error) {
      logError('Supabase auction_mark_unsold error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }
    markLocalMutation(['auction', 'players'])
  },

  async auctionUndoLastSale(seasonId: string): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')
    markLocalMutation(['auction', 'players', 'teams'])
    const { error } = await supabase.rpc('auction_undo_last_sale', {
      p_season_id: seasonId
    })
    if (error) {
      logError('Supabase auction_undo_last_sale error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }
    markLocalMutation(['auction', 'players', 'teams'])
  },

  async auctionBackToIdle(seasonId: string): Promise<ProjectorState> {
    if (!supabase) throw new AppError('Supabase not configured')

    const payload = {
      season_id: seasonId,
      mode: 'idle' as const,
      player_id: null,
      team_id: null,
      current_bid: null,
      updated_at: new Date().toISOString()
    }

    markLocalMutation(['auction'])
    const { data, error } = await supabase
      .from('projector_state')
      .upsert(payload)
      .select()
      .single()

    if (error) {
      logError('Supabase auctionBackToIdle error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

    markLocalMutation(['auction'])
    return data as ProjectorState
  },

  subscribeToAuctionRealtime(seasonId: string, onUpdate: () => void): () => void {
    if (!supabase || !seasonId) return () => {}

    let active = true
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleUpdate = () => {
      if (!active || isRealtimeSuppressed('auction')) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!active || isRealtimeSuppressed('auction')) return
        onUpdate()
      }, REALTIME_DEBOUNCE_MS)
    }

    const channel = supabase
      .channel(`admin_auction_live_${seasonId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projector_state',
          filter: `season_id=eq.${seasonId}`
        },
        () => scheduleUpdate()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `season_id=eq.${seasonId}`
        },
        () => scheduleUpdate()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `season_id=eq.${seasonId}`
        },
        () => scheduleUpdate()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_bids'
        },
        () => scheduleUpdate()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_sales'
        },
        () => scheduleUpdate()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_settings',
          filter: `season_id=eq.${seasonId}`
        },
        () => scheduleUpdate()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'auction_queue',
          filter: `season_id=eq.${seasonId}`
        },
        () => scheduleUpdate()
      )
      .subscribe()

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      if (supabase) {
        supabase.removeChannel(channel)
      }
    }
  }
}

export const auctionService: AuctionService = supabaseAuctionService

export const getAuctionSettings = (seasonId: string) =>
  auctionService.getAuctionSettings(seasonId)
export const saveAuctionSettings = (settings: AuctionSettings) =>
  auctionService.saveAuctionSettings(settings)
export const subscribeToAuctionSettings = (
  seasonId: string,
  callback: (settings: AuctionSettings) => void
) => auctionService.subscribeToAuctionSettings(seasonId, callback)
export const getAuctionBidsForPlayer = (playerId: string) =>
  auctionService.getAuctionBidsForPlayer(playerId)
export const getRecentAuctionSales = (seasonId: string, limit?: number) =>
  auctionService.getRecentAuctionSales(seasonId, limit)
export const auctionBringToStage = (playerId: string) =>
  auctionService.auctionBringToStage(playerId)
export const auctionPlaceBid = (teamId: string, amount: number) =>
  auctionService.auctionPlaceBid(teamId, amount)
export const auctionClearBid = (seasonId: string) =>
  auctionService.auctionClearBid(seasonId)
export const auctionSecure = (seasonId: string) =>
  auctionService.auctionSecure(seasonId)
export const auctionMarkUnsold = (seasonId: string) =>
  auctionService.auctionMarkUnsold(seasonId)
export const auctionUndoLastSale = (seasonId: string) =>
  auctionService.auctionUndoLastSale(seasonId)
export const auctionBackToIdle = (seasonId: string) =>
  auctionService.auctionBackToIdle(seasonId)
export const subscribeToAuctionRealtime = (seasonId: string, onUpdate: () => void) =>
  auctionService.subscribeToAuctionRealtime(seasonId, onUpdate)

export interface AuctionQueueEntry {
  season_id: string
  sport: string
  player_id: string
  sort_order: number
  player: Player | null
}

export interface QueueBulkAddResult {
  addedCount: number
  notFound: string[]
  alreadyQueued: string[]
  notAvailable: string[]
  message: string
}

function mapJoinedQueuePlayer(rawPlayer: unknown): Player | null {
  if (!rawPlayer || typeof rawPlayer !== 'object') return null
  const row = rawPlayer as Record<string, unknown>
  const athRaw = Array.isArray(row.athletes) ? row.athletes[0] : row.athletes
  const ath =
    athRaw && typeof athRaw === 'object' ? (athRaw as Record<string, unknown>) : null

  const athleteCode =
    typeof ath?.athlete_code === 'number'
      ? ath.athlete_code
      : typeof row.athlete_code === 'number'
      ? row.athlete_code
      : undefined

  const playerCode =
    typeof row.player_code === 'string' && row.player_code.trim()
      ? row.player_code.trim()
      : formatAthleteCode(athleteCode ?? 1)

  return {
    id: String(row.id || ''),
    season_id: String(row.season_id || ''),
    athlete_id: row.athlete_id ? String(row.athlete_id) : ath?.id ? String(ath.id) : undefined,
    athlete_code: athleteCode,
    player_code: playerCode,
    name: String(ath?.name ?? row.name ?? 'Athlete'),
    sport: String(row.sport || ''),
    playing_role: String(row.playing_role || ''),
    academic_year: (ath?.academic_year || row.academic_year || '1st') as Player['academic_year'],
    roll_no:
      ath?.roll_no !== undefined && ath?.roll_no !== null
        ? String(ath.roll_no)
        : row.roll_no !== undefined && row.roll_no !== null
        ? String(row.roll_no)
        : undefined,
    notes:
      row.notes !== undefined && row.notes !== null
        ? String(row.notes)
        : undefined,
    photo_url:
      ath?.photo_url !== undefined && ath?.photo_url !== null
        ? String(ath.photo_url)
        : row.photo_url !== undefined && row.photo_url !== null
        ? String(row.photo_url)
        : undefined,
    photo_thumb_url:
      ath?.photo_thumb_url !== undefined && ath?.photo_thumb_url !== null
        ? String(ath.photo_thumb_url)
        : row.photo_thumb_url !== undefined && row.photo_thumb_url !== null
        ? String(row.photo_thumb_url)
        : undefined,
    base_points: typeof row.base_points === 'number' ? row.base_points : Number(row.base_points) || 0,
    status: (row.status || 'available') as Player['status'],
    team_id: row.team_id ? String(row.team_id) : null,
    purchase_price:
      typeof row.purchase_price === 'number'
        ? row.purchase_price
        : row.purchase_price !== null && row.purchase_price !== undefined
        ? Number(row.purchase_price)
        : null,
    created_at: row.created_at ? String(row.created_at) : undefined
  }
}

export async function getAuctionQueue(
  seasonId: string,
  sport?: string
): Promise<AuctionQueueEntry[]> {
  if (!supabase || !seasonId) return []

  const buildQuery = (selectCols: string) => {
    let q = supabase!
      .from('auction_queue')
      .select(selectCols)
      .eq('season_id', seasonId)
      .order('sort_order', { ascending: true })
    if (sport && sport.trim()) {
      q = q.ilike('sport', sport.trim())
    }
    return q
  }

  let { data, error } = await buildQuery(
    'season_id, sport, player_id, sort_order, players(*, athletes(id, athlete_code, name, photo_url, photo_thumb_url, roll_no, academic_year))'
  )

  if (error) {
    const fallback = await buildQuery('season_id, sport, player_id, sort_order, players(*)')
    data = fallback.data
    error = fallback.error
  }

  if (error) {
    logError('Supabase getAuctionQueue error:', error.message, error)
    throw new AppError(error.message, { original: error })
  }

  const rows = ((data || []) as unknown) as Array<Record<string, unknown>>
  return rows
    .map((r) => {
      const joinedRaw = Array.isArray(r.players) ? r.players[0] : r.players
      return {
        season_id: String(r.season_id || seasonId),
        sport: String(r.sport || sport || ''),
        player_id: String(r.player_id || ''),
        sort_order: typeof r.sort_order === 'number' ? r.sort_order : Number(r.sort_order) || 0,
        player: mapJoinedQueuePlayer(joinedRaw)
      }
    })
    .sort((a, b) => a.sort_order - b.sort_order)
}

export async function queueAddPlayer(playerId: string): Promise<void> {
  if (!supabase) throw new AppError('Supabase not configured')
  markLocalMutation(['auction'])
  const { error } = await supabase.rpc('queue_add_player', {
    p_player_id: playerId
  })
  if (error) {
    throw new AppError(error.message, { original: error })
  }
  markLocalMutation(['auction'])
}

function toStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.map((item) => String(item ?? '').trim()).filter(Boolean)
}

export function buildQueueBulkAddSummary(raw: unknown): QueueBulkAddResult {
  if (typeof raw === 'string' && raw.trim()) {
    const matchCount = raw.match(/(\d+)\s+added/i)
    return {
      addedCount: matchCount ? Number(matchCount[1]) : 0,
      notFound: [],
      alreadyQueued: [],
      notAvailable: [],
      message: raw.trim()
    }
  }

  const unwrapped = Array.isArray(raw) ? raw[0] : raw
  const obj =
    unwrapped && typeof unwrapped === 'object'
      ? (unwrapped as Record<string, unknown>)
      : {}

  let addedCount = 0
  if (typeof obj.added === 'number') {
    addedCount = obj.added
  } else if (Array.isArray(obj.added)) {
    addedCount = obj.added.length
  } else if (typeof obj.added_count === 'number') {
    addedCount = obj.added_count
  } else if (typeof obj.inserted === 'number') {
    addedCount = obj.inserted
  } else if (typeof obj.count === 'number') {
    addedCount = obj.count
  }

  const notFound = toStringArray(obj.not_found ?? obj.notFound ?? obj.missing)
  const alreadyQueued = toStringArray(
    obj.already_queued ?? obj.alreadyQueued ?? obj.duplicate ?? obj.duplicates
  )
  const notAvailable = toStringArray(
    obj.not_available ?? obj.notAvailable ?? obj.unavailable ?? obj.sold
  )

  const parts: string[] = []
  if (
    addedCount > 0 ||
    (notFound.length === 0 && alreadyQueued.length === 0 && notAvailable.length === 0)
  ) {
    parts.push(`${addedCount} added.`)
  }
  if (notFound.length > 0) {
    parts.push(`Not found: ${notFound.join(', ')}.`)
  }
  if (alreadyQueued.length > 0) {
    parts.push(`Already queued: ${alreadyQueued.join(', ')}.`)
  }
  if (notAvailable.length > 0) {
    parts.push(`Not available: ${notAvailable.join(', ')}.`)
  }

  return {
    addedCount,
    notFound,
    alreadyQueued,
    notAvailable,
    message: parts.join(' ')
  }
}

export async function queueAddByCodes(
  seasonId: string,
  sport: string,
  codes: string[]
): Promise<QueueBulkAddResult> {
  if (!supabase) throw new AppError('Supabase not configured')
  markLocalMutation(['auction'])
  const { data, error } = await supabase.rpc('queue_add_by_codes', {
    p_season_id: seasonId,
    p_sport: sport,
    p_codes: codes
  })
  if (error) {
    throw new AppError(error.message, { original: error })
  }
  markLocalMutation(['auction'])
  return buildQueueBulkAddSummary(data)
}

export async function queueRemove(playerId: string): Promise<void> {
  if (!supabase) throw new AppError('Supabase not configured')
  markLocalMutation(['auction'])
  const { error } = await supabase.rpc('queue_remove', {
    p_player_id: playerId
  })
  if (error) {
    throw new AppError(error.message, { original: error })
  }
  markLocalMutation(['auction'])
}

export async function queueClear(seasonId: string, sport: string): Promise<void> {
  if (!supabase) throw new AppError('Supabase not configured')
  markLocalMutation(['auction'])
  const { error } = await supabase.rpc('queue_clear', {
    p_season_id: seasonId,
    p_sport: sport
  })
  if (error) {
    throw new AppError(error.message, { original: error })
  }
  markLocalMutation(['auction'])
}

export async function queueMove(
  playerId: string,
  direction: 'up' | 'down'
): Promise<void> {
  if (!supabase) throw new AppError('Supabase not configured')
  markLocalMutation(['auction'])
  const { error } = await supabase.rpc('queue_move', {
    p_player_id: playerId,
    p_direction: direction
  })
  if (error) {
    throw new AppError(error.message, { original: error })
  }
  markLocalMutation(['auction'])
}

