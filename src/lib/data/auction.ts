import type {
  AuctionBid,
  AuctionSale,
  AuctionSettings,
  Player,
  ProjectorState,
  PurseTransaction,
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
  REALTIME_DEBOUNCE_MS,
  markLocalMutation,
  isRealtimeSuppressed
} from './client'
import type { AuctionService } from './types'

const DEMO_AUCTION_BIDS_KEY = STORAGE_KEYS.DEMO_AUCTION_BIDS
const DEMO_AUCTION_SALES_KEY = STORAGE_KEYS.DEMO_AUCTION_SALES
const DEMO_AUCTION_SETTINGS_KEY = STORAGE_KEYS.DEMO_AUCTION_SETTINGS

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

const demoAuctionService: AuctionService = {
  async getAuctionSettings(seasonId: string): Promise<AuctionSettings> {
    const allSettings = getLocal<Record<string, AuctionSettings>>(DEMO_AUCTION_SETTINGS_KEY, {})
    return normalizeAuctionSettings(seasonId, allSettings[seasonId] as unknown as Record<string, unknown>)
  },

  async saveAuctionSettings(settings: AuctionSettings): Promise<AuctionSettings> {
    if (!settings.season_id) throw new AppError('Season ID is required.')
    const normalized = normalizeAuctionSettings(
      settings.season_id,
      settings as unknown as Record<string, unknown>
    )
    markLocalMutation(['auction'])
    const allSettings = getLocal<Record<string, AuctionSettings>>(DEMO_AUCTION_SETTINGS_KEY, {})
    allSettings[settings.season_id] = normalized
    setLocal(DEMO_AUCTION_SETTINGS_KEY, allSettings)
    notifyChange('auction_settings_change', normalized)
    notifyChange('auction_change')
    return normalized
  },

  subscribeToAuctionSettings(
    seasonId: string,
    callback: (settings: AuctionSettings) => void
  ): () => void {
    let active = true
    let latestReqId = 0
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleFetch = () => {
      if (!active || isRealtimeSuppressed('auction')) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (!active || isRealtimeSuppressed('auction')) return
        const reqId = ++latestReqId
        demoAuctionService
          .getAuctionSettings(seasonId)
          .then((res) => {
            if (active && reqId === latestReqId) callback(res)
          })
          .catch(() => {})
      }, REALTIME_DEBOUNCE_MS)
    }

    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.event === 'auction_settings_change' || e.data?.event === 'auction_change') {
        scheduleFetch()
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === DEMO_AUCTION_SETTINGS_KEY) {
        scheduleFetch()
      }
    }

    if (demoBroadcastChannel) demoBroadcastChannel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      if (demoBroadcastChannel) demoBroadcastChannel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  },

  async getAuctionBidsForPlayer(playerId: string): Promise<AuctionBid[]> {
    if (!playerId) return []
    const allBids = getLocal<AuctionBid[]>(DEMO_AUCTION_BIDS_KEY, [])
    return allBids
      .filter((b) => b.player_id === playerId && !b.voided)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  },

  async getRecentAuctionSales(seasonId: string, limit = 10): Promise<AuctionSale[]> {
    const allSales = getLocal<AuctionSale[]>(DEMO_AUCTION_SALES_KEY, [])
    return allSales
      .filter((s) => (!s.season_id || s.season_id === seasonId) && !s.reversed_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit)
  },

  async auctionBringToStage(playerId: string): Promise<void> {
    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const player = players.find((p) => p.id === playerId)
    if (!player) throw new AppError('Player not found.')
    if (player.status === 'sold') throw new AppError('Player is already sold.')

    const nextState: ProjectorState = {
      season_id: player.season_id,
      mode: 'auction',
      player_id: player.id,
      team_id: null,
      current_bid: null,
      sale_player_id: null,
      sale_team_id: null,
      sale_price: null,
      updated_at: new Date().toISOString()
    }
    markLocalMutation(['auction'])
    setLocal(STORAGE_KEYS.PROJECTOR, nextState)
    notifyChange('projector_change', nextState)
  },

  async auctionPlaceBid(teamId: string, amount: number): Promise<void> {
    const state = getLocal<ProjectorState | null>(STORAGE_KEYS.PROJECTOR, null)
    if (!state || state.mode !== 'auction' || !state.player_id) {
      throw new AppError('No active player on stage for bidding.')
    }

    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const teams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const player = players.find((p) => p.id === state.player_id)
    const team = teams.find((t) => t.id === teamId)

    if (!player) throw new AppError('Stage player not found.')
    if (!team) throw new AppError('Team not found.')

    if (player.sport.toLowerCase() !== team.sport.toLowerCase()) {
      throw new AppError(`Sport mismatch: ${team.name} is a ${team.sport} team.`)
    }

    const settings = await demoAuctionService.getAuctionSettings(player.season_id)
    const squadCount = players.filter((p) => p.team_id === team.id && p.status === 'sold').length
    if (settings.max_squad_size && squadCount >= settings.max_squad_size) {
      throw new AppError(`Squad full (${squadCount}/${settings.max_squad_size}).`)
    }

    if (amount < player.base_points) {
      throw new AppError(`Bid must be at least base points (${player.base_points}).`)
    }

    if (state.team_id && state.current_bid != null && amount <= state.current_bid) {
      throw new AppError(`Bid must be greater than current bid (${state.current_bid}).`)
    }

    if (team.current_purse < amount) {
      throw new AppError(`Purse too low (${team.current_purse} PTS available).`)
    }

    const allBids = getLocal<AuctionBid[]>(DEMO_AUCTION_BIDS_KEY, [])
    const newBid: AuctionBid = {
      id: `bid-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      season_id: player.season_id,
      player_id: player.id,
      team_id: team.id,
      amount,
      voided: false,
      created_at: new Date().toISOString()
    }
    allBids.unshift(newBid)
    setLocal(DEMO_AUCTION_BIDS_KEY, allBids)

    const nextState: ProjectorState = {
      ...state,
      team_id: team.id,
      current_bid: amount,
      updated_at: new Date().toISOString()
    }
    markLocalMutation(['auction'])
    setLocal(STORAGE_KEYS.PROJECTOR, nextState)
    notifyChange('projector_change', nextState)
    notifyChange('auction_change')
  },

  async auctionClearBid(seasonId: string): Promise<void> {
    const state = getLocal<ProjectorState | null>(STORAGE_KEYS.PROJECTOR, null)
    if (!state || state.season_id !== seasonId || !state.player_id) {
      throw new AppError('No active player on stage.')
    }

    const allBids = getLocal<AuctionBid[]>(DEMO_AUCTION_BIDS_KEY, [])
    const updatedBids = allBids.map((b) =>
      b.player_id === state.player_id ? { ...b, voided: true } : b
    )
    setLocal(DEMO_AUCTION_BIDS_KEY, updatedBids)

    const nextState: ProjectorState = {
      ...state,
      team_id: null,
      current_bid: null,
      updated_at: new Date().toISOString()
    }
    markLocalMutation(['auction'])
    setLocal(STORAGE_KEYS.PROJECTOR, nextState)
    notifyChange('projector_change', nextState)
    notifyChange('auction_change')
  },

  async auctionSecure(seasonId: string): Promise<void> {
    const state = getLocal<ProjectorState | null>(STORAGE_KEYS.PROJECTOR, null)
    if (!state || state.season_id !== seasonId || !state.player_id || !state.team_id) {
      throw new AppError('Cannot secure: no leading team on stage.')
    }

    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const teams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])
    const pIdx = players.findIndex((p) => p.id === state.player_id)
    const tIdx = teams.findIndex((t) => t.id === state.team_id)

    if (pIdx === -1) throw new AppError('Player not found.')
    if (tIdx === -1) throw new AppError('Leading team not found.')

    const price = Number(state.current_bid ?? players[pIdx].base_points)
    if (teams[tIdx].current_purse < price) {
      throw new AppError('Purse too low to complete sale.')
    }

    teams[tIdx] = {
      ...teams[tIdx],
      current_purse: teams[tIdx].current_purse - price
    }
    players[pIdx] = {
      ...players[pIdx],
      status: 'sold',
      team_id: teams[tIdx].id,
      purchase_price: price
    }

    const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
    allTx.unshift({
      id: `tx-${Date.now()}`,
      season_id: seasonId,
      team_id: teams[tIdx].id,
      type: 'deduct',
      amount: price,
      balance_after: teams[tIdx].current_purse,
      reason: `Auction sale: ${players[pIdx].name}`,
      created_at: new Date().toISOString(),
      created_by: 'admin'
    })

    const allSales = getLocal<AuctionSale[]>(DEMO_AUCTION_SALES_KEY, [])
    allSales.unshift({
      id: `sale-${Date.now()}`,
      season_id: seasonId,
      player_id: players[pIdx].id,
      team_id: teams[tIdx].id,
      price,
      reversed_at: null,
      created_at: new Date().toISOString()
    })

    const nextState: ProjectorState = {
      ...state,
      mode: 'sold',
      sale_event_id: `sale-evt-${Date.now()}`,
      sale_player_id: players[pIdx].id,
      sale_team_id: teams[tIdx].id,
      sale_price: price,
      sale_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    markLocalMutation(['auction', 'players', 'teams'])
    setLocal(STORAGE_KEYS.TEAMS, teams)
    setLocal(STORAGE_KEYS.PLAYERS, players)
    setLocal(STORAGE_KEYS.TRANSACTIONS, allTx)
    setLocal(DEMO_AUCTION_SALES_KEY, allSales)
    setLocal(STORAGE_KEYS.PROJECTOR, nextState)

    notifyChange('teams_change')
    notifyChange('players_change')
    notifyChange('projector_change', nextState)
    notifyChange('auction_change')
  },

  async auctionMarkUnsold(seasonId: string): Promise<void> {
    const state = getLocal<ProjectorState | null>(STORAGE_KEYS.PROJECTOR, null)
    if (!state || state.season_id !== seasonId || !state.player_id) {
      throw new AppError('No player on stage to mark unsold.')
    }

    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const pIdx = players.findIndex((p) => p.id === state.player_id)
    markLocalMutation(['auction', 'players'])
    if (pIdx !== -1) {
      players[pIdx] = {
        ...players[pIdx],
        status: 'unsold',
        team_id: null,
        purchase_price: null
      }
      setLocal(STORAGE_KEYS.PLAYERS, players)
    }

    const nextState: ProjectorState = {
      ...state,
      mode: 'unsold',
      team_id: null,
      current_bid: null,
      updated_at: new Date().toISOString()
    }
    setLocal(STORAGE_KEYS.PROJECTOR, nextState)
    notifyChange('players_change')
    notifyChange('projector_change', nextState)
    notifyChange('auction_change')
  },

  async auctionUndoLastSale(seasonId: string): Promise<void> {
    const allSales = getLocal<AuctionSale[]>(DEMO_AUCTION_SALES_KEY, [])
    const activeSales = allSales
      .filter((s) => (!s.season_id || s.season_id === seasonId) && !s.reversed_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const newest = activeSales[0]
    if (!newest) {
      throw new AppError('No recent sale found to undo.')
    }

    const saleIdx = allSales.findIndex((s) => s.id === newest.id)
    allSales[saleIdx] = {
      ...allSales[saleIdx],
      reversed_at: new Date().toISOString()
    }

    const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, [])
    const teams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, [])

    const pIdx = players.findIndex((p) => p.id === newest.player_id)
    if (pIdx !== -1) {
      players[pIdx] = {
        ...players[pIdx],
        status: 'available',
        team_id: null,
        purchase_price: null
      }
    }

    const tIdx = teams.findIndex((t) => t.id === newest.team_id)
    if (tIdx !== -1) {
      teams[tIdx] = {
        ...teams[tIdx],
        current_purse: teams[tIdx].current_purse + newest.price
      }

      const allTx = getLocal<PurseTransaction[]>(STORAGE_KEYS.TRANSACTIONS, [])
      allTx.unshift({
        id: `tx-${Date.now()}`,
        season_id: seasonId,
        team_id: teams[tIdx].id,
        type: 'add',
        amount: newest.price,
        balance_after: teams[tIdx].current_purse,
        reason: `Reversed sale for player`,
        created_at: new Date().toISOString(),
        created_by: 'admin'
      })
      setLocal(STORAGE_KEYS.TRANSACTIONS, allTx)
    }

    markLocalMutation(['auction', 'players', 'teams'])
    const state = getLocal<ProjectorState | null>(STORAGE_KEYS.PROJECTOR, null)
    if (state && state.season_id === seasonId && state.player_id === newest.player_id && state.mode === 'sold') {
      const nextState: ProjectorState = {
        ...state,
        mode: 'idle',
        player_id: null,
        team_id: null,
        current_bid: null,
        updated_at: new Date().toISOString()
      }
      setLocal(STORAGE_KEYS.PROJECTOR, nextState)
      notifyChange('projector_change', nextState)
    }

    setLocal(DEMO_AUCTION_SALES_KEY, allSales)
    setLocal(STORAGE_KEYS.PLAYERS, players)
    setLocal(STORAGE_KEYS.TEAMS, teams)

    notifyChange('players_change')
    notifyChange('teams_change')
    notifyChange('auction_change')
  },

  async auctionBackToIdle(seasonId: string): Promise<ProjectorState> {
    const nextState: ProjectorState = {
      season_id: seasonId,
      mode: 'idle',
      player_id: null,
      team_id: null,
      current_bid: null,
      updated_at: new Date().toISOString()
    }
    markLocalMutation(['auction'])
    setLocal(STORAGE_KEYS.PROJECTOR, nextState)
    notifyChange('projector_change', nextState)
    notifyChange('auction_change')
    return nextState
  },

  subscribeToAuctionRealtime(_seasonId: string, onUpdate: () => void): () => void {
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

    const handleBroadcast = (e: MessageEvent) => {
      if (
        e.data?.event === 'projector_change' ||
        e.data?.event === 'players_change' ||
        e.data?.event === 'teams_change' ||
        e.data?.event === 'auction_change' ||
        e.data?.event === 'auction_settings_change'
      ) {
        scheduleUpdate()
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (
        e.key === STORAGE_KEYS.PROJECTOR ||
        e.key === STORAGE_KEYS.PLAYERS ||
        e.key === STORAGE_KEYS.TEAMS ||
        e.key === DEMO_AUCTION_BIDS_KEY ||
        e.key === DEMO_AUCTION_SALES_KEY ||
        e.key === DEMO_AUCTION_SETTINGS_KEY
      ) {
        scheduleUpdate()
      }
    }

    if (demoBroadcastChannel) demoBroadcastChannel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)

    return () => {
      active = false
      if (debounceTimer) clearTimeout(debounceTimer)
      if (demoBroadcastChannel) demoBroadcastChannel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
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
      console.error('Supabase getAuctionSettings error:', error.message, error)
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
      console.error('Supabase saveAuctionSettings error:', error.message, error)
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
      console.error('Supabase getAuctionBidsForPlayer error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

    return ((data as Array<Record<string, unknown>>) || []).map(normalizeBid)
  },

  async getRecentAuctionSales(seasonId: string, limit = 10): Promise<AuctionSale[]> {
    if (!supabase || !seasonId) return []

    const { data, error } = await supabase
      .from('auction_sales')
      .select('*')
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
      console.error('Supabase getRecentAuctionSales error:', error.message, error)
      throw new AppError(error.message, { original: error })
    }

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('auction_sales')
      .select('*')
      .is('reversed_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (fallbackError) {
      console.error('Supabase getRecentAuctionSales error:', fallbackError.message, fallbackError)
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
      console.error('Supabase auction_bring_to_stage error:', error.message, error)
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
      console.error('Supabase auction_place_bid error:', error.message, error)
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
      console.error('Supabase auction_clear_bid error:', error.message, error)
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
      console.error('Supabase auction_secure error:', error.message, error)
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
      console.error('Supabase auction_mark_unsold error:', error.message, error)
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
      console.error('Supabase auction_undo_last_sale error:', error.message, error)
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
      console.error('Supabase auctionBackToIdle error:', error.message, error)
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

export const auctionService: AuctionService = isDemoMode
  ? demoAuctionService
  : supabaseAuctionService

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
