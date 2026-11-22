import { useEffect, useState } from 'react'
import { isDemoMode, getLocal, STORAGE_KEYS, supabase } from './data/client'
import type { Player, Season, Team } from '../types'

export type PublicResultStatus = 'sold' | 'unsold' | 'available'

export interface PublicResultRow {
  season_id: string
  season_name: string
  player_id: string
  athlete_code: number
  name: string
  photo_thumb_url: string | null
  sport: string
  playing_role: string
  base_points: number
  status: PublicResultStatus
  team_name: string | null
  team_color: string | null
  sale_price: number | null
  sold_at: string | null
}

export interface PublicResultsSnapshot {
  seasonId: string | null
  seasonName: string | null
  rows: PublicResultRow[]
  version: string | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  lastCheckedAt: number | null
  lastChangedAt: number | null
}

type ResultsListener = (snapshot: PublicResultsSnapshot) => void

const BASE_POLL_INTERVAL_MS = 20_000
const BACKOFF_POLL_INTERVAL_MS = 120_000
const UNCHANGED_BEFORE_BACKOFF = 10
const PAGE_SIZE = 500

const RESULTS_SELECT_COLS =
  'season_id, season_name, player_id, athlete_code, name, photo_thumb_url, sport, playing_role, base_points, status, team_name, team_color, sale_price, sold_at'

let snapshot: PublicResultsSnapshot = {
  seasonId: null,
  seasonName: null,
  rows: [],
  version: null,
  isLoading: true,
  isRefreshing: false,
  error: null,
  lastCheckedAt: null,
  lastChangedAt: null
}

const listeners = new Set<ResultsListener>()
let pollTimer: ReturnType<typeof setTimeout> | null = null
let inFlightController: AbortController | null = null
let unchangedChecks = 0
let visibilityAttached = false

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: unknown; message?: unknown }
  if (e.name === 'AbortError') return true
  if (typeof e.message === 'string' && /abort/i.test(e.message)) return true
  return false
}

function emit(): void {
  const current = snapshot
  listeners.forEach((listener) => {
    try {
      listener(current)
    } catch {
      // ignore subscriber callback error
    }
  })
}

function updateSnapshot(patch: Partial<PublicResultsSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  emit()
}

function clearPollTimer(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function abortInFlight(): void {
  if (inFlightController) {
    const controller = inFlightController
    inFlightController = null
    controller.abort()
  }
}

function normalizeStatus(raw: unknown): PublicResultStatus {
  const s = String(raw || '').trim().toLowerCase()
  if (s === 'sold') return 'sold'
  if (s === 'unsold') return 'unsold'
  return 'available'
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function toNullableFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function normalizeResultRow(raw: Record<string, unknown>): PublicResultRow {
  const status = normalizeStatus(raw.status)
  const isSold = status === 'sold'
  return {
    season_id: String(raw.season_id || ''),
    season_name: String(raw.season_name || ''),
    player_id: String(raw.player_id || ''),
    athlete_code: Math.trunc(toFiniteNumber(raw.athlete_code, 0)),
    name: String(raw.name || ''),
    photo_thumb_url:
      typeof raw.photo_thumb_url === 'string' && raw.photo_thumb_url.trim()
        ? raw.photo_thumb_url.trim()
        : null,
    sport: String(raw.sport || ''),
    playing_role: String(raw.playing_role || ''),
    base_points: toFiniteNumber(raw.base_points, 0),
    status,
    team_name:
      isSold && typeof raw.team_name === 'string' && raw.team_name.trim()
        ? raw.team_name.trim()
        : null,
    team_color:
      isSold && typeof raw.team_color === 'string' && raw.team_color.trim()
        ? raw.team_color.trim()
        : null,
    sale_price: isSold ? toNullableFiniteNumber(raw.sale_price) : null,
    sold_at:
      isSold && typeof raw.sold_at === 'string' && raw.sold_at.trim()
        ? raw.sold_at.trim()
        : null
  }
}

function loadDemoResults(): {
  version: string
  seasonId: string | null
  seasonName: string | null
  rows: PublicResultRow[]
} {
  const seasons = getLocal<Array<Season & { is_rehearsal?: boolean }>>(STORAGE_KEYS.SEASONS, [])
  const activeSeason =
    seasons.find(
      (s) =>
        s &&
        s.is_active &&
        !s.is_rehearsal &&
        !/\brehearsal\b/i.test(s.name || '')
    ) || null

  if (!activeSeason) {
    return { version: 'none', seasonId: null, seasonName: null, rows: [] }
  }

  const players = getLocal<Player[]>(STORAGE_KEYS.PLAYERS, []).filter(
    (p) => p && p.season_id === activeSeason.id
  )
  const teams = getLocal<Team[]>(STORAGE_KEYS.TEAMS, []).filter(
    (t) => t && t.season_id === activeSeason.id
  )
  const teamMap = new Map<string, { name: string; color: string }>()
  for (const t of teams) {
    teamMap.set(t.id, { name: t.name, color: t.color })
  }

  const demoSales = getLocal<
    Array<{
      player_id: string
      team_id: string
      price: number
      reversed_at?: string | null
      created_at?: string | null
    }>
  >('fieldr_auction_sales', [])

  const latestSaleByPlayer = new Map<
    string,
    { team_id: string; price: number; created_at: string | null }
  >()
  for (const sale of demoSales) {
    if (!sale || sale.reversed_at) continue
    const prev = latestSaleByPlayer.get(sale.player_id)
    if (
      !prev ||
      (sale.created_at || '') >= (prev.created_at || '')
    ) {
      latestSaleByPlayer.set(sale.player_id, {
        team_id: sale.team_id,
        price: Number(sale.price) || 0,
        created_at: sale.created_at || null
      })
    }
  }

  let soldCount = 0
  let unsoldCount = 0
  let priceSum = 0
  let latestEvent = ''

  const rows: PublicResultRow[] = players.map((p, idx) => {
    const status = normalizeStatus(p.status)
    const isSold = status === 'sold'
    const sale = isSold ? latestSaleByPlayer.get(p.id) : undefined
    const resolvedTeamId = isSold ? sale?.team_id || p.team_id || null : null
    const team = resolvedTeamId ? teamMap.get(resolvedTeamId) : undefined
    const salePrice = isSold
      ? sale?.price ?? (typeof p.purchase_price === 'number' ? p.purchase_price : null)
      : null
    const soldAt = isSold ? sale?.created_at || p.created_at || null : null

    if (isSold) {
      soldCount += 1
      priceSum += salePrice ?? 0
      if (soldAt && soldAt > latestEvent) latestEvent = soldAt
    } else if (status === 'unsold') {
      unsoldCount += 1
    }

    const parsedCode =
      typeof p.athlete_code === 'number' && p.athlete_code > 0
        ? p.athlete_code
        : Number(String(p.player_code || '').replace(/\D/g, '')) || idx + 1

    return {
      season_id: activeSeason.id,
      season_name: activeSeason.name,
      player_id: p.id,
      athlete_code: parsedCode,
      name: p.name,
      photo_thumb_url: p.photo_thumb_url || p.photo_url || null,
      sport: p.sport,
      playing_role: p.playing_role,
      base_points: Number(p.base_points) || 0,
      status,
      team_name: isSold ? team?.name || null : null,
      team_color: isSold ? team?.color || null : null,
      sale_price: salePrice,
      sold_at: soldAt
    }
  })

  const version = `${activeSeason.id}:${rows.length}:${soldCount}:${unsoldCount}:${priceSum}:${latestEvent}`
  return {
    version,
    seasonId: activeSeason.id,
    seasonName: activeSeason.name,
    rows
  }
}

async function fetchRemoteVersion(signal: AbortSignal): Promise<string> {
  if (!supabase) return 'none'
  const { data, error } = await supabase
    .rpc('get_public_results_version')
    .abortSignal(signal)

  if (error) {
    throw error
  }
  if (data === null || data === undefined) return 'none'
  return String(data)
}

async function fetchRemoteResultsRows(signal: AbortSignal): Promise<PublicResultRow[]> {
  if (!supabase) return []
  const all: PublicResultRow[] = []
  let from = 0

  while (true) {
    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('public_results')
      .select(RESULTS_SELECT_COLS)
      .order('sold_at', { ascending: false, nullsFirst: false })
      .order('athlete_code', { ascending: true })
      .range(from, to)
      .abortSignal(signal)

    if (error) {
      throw error
    }

    const batch = Array.isArray(data)
      ? (data as Array<Record<string, unknown>>).map(normalizeResultRow)
      : []

    all.push(...batch)
    if (batch.length < PAGE_SIZE) {
      break
    }
    from += PAGE_SIZE
  }

  return all
}

function scheduleNextPoll(): void {
  clearPollTimer()
  if (listeners.size === 0 || isDocumentHidden()) return

  const delay =
    unchangedChecks >= UNCHANGED_BEFORE_BACKOFF
      ? BACKOFF_POLL_INTERVAL_MS
      : BASE_POLL_INTERVAL_MS

  pollTimer = setTimeout(() => {
    pollTimer = null
    void pollOnce()
  }, delay)
}

async function pollOnce(): Promise<void> {
  if (listeners.size === 0 || isDocumentHidden()) return
  if (inFlightController) return

  clearPollTimer()
  const controller = new AbortController()
  inFlightController = controller

  if (snapshot.version !== null) {
    updateSnapshot({ isRefreshing: true })
  }

  try {
    if (isDemoMode || !supabase) {
      const demo = loadDemoResults()
      if (controller.signal.aborted || listeners.size === 0) return

      const now = Date.now()
      const hasChanged = snapshot.version === null || demo.version !== snapshot.version
      if (hasChanged) {
        unchangedChecks = 0
        updateSnapshot({
          seasonId: demo.seasonId,
          seasonName: demo.seasonName,
          rows: demo.rows,
          version: demo.version,
          isLoading: false,
          isRefreshing: false,
          error: null,
          lastCheckedAt: now,
          lastChangedAt: now
        })
      } else {
        unchangedChecks += 1
        updateSnapshot({
          isLoading: false,
          isRefreshing: false,
          error: null,
          lastCheckedAt: now
        })
      }
      return
    }

    const nextVersion = await fetchRemoteVersion(controller.signal)
    if (controller.signal.aborted || listeners.size === 0) return

    const now = Date.now()
    const needsFullFetch = snapshot.version === null || nextVersion !== snapshot.version

    if (!needsFullFetch) {
      unchangedChecks += 1
      updateSnapshot({
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastCheckedAt: now
      })
      return
    }

    unchangedChecks = 0

    if (nextVersion === 'none') {
      updateSnapshot({
        seasonId: null,
        seasonName: null,
        rows: [],
        version: 'none',
        isLoading: false,
        isRefreshing: false,
        error: null,
        lastCheckedAt: now,
        lastChangedAt: now
      })
      return
    }

    const rows = await fetchRemoteResultsRows(controller.signal)
    if (controller.signal.aborted || listeners.size === 0) return

    const first = rows[0]
    updateSnapshot({
      seasonId: first?.season_id || null,
      seasonName: first?.season_name || null,
      rows,
      version: nextVersion,
      isLoading: false,
      isRefreshing: false,
      error: null,
      lastCheckedAt: Date.now(),
      lastChangedAt: Date.now()
    })
  } catch (err: unknown) {
    if (isAbortError(err, controller.signal) || listeners.size === 0) {
      return
    }
    const message =
      err instanceof Error && err.message
        ? err.message
        : typeof err === 'object' &&
          err !== null &&
          'message' in err &&
          typeof (err as { message: unknown }).message === 'string'
        ? (err as { message: string }).message
        : 'Unable to load auction results.'
    updateSnapshot({
      isLoading: false,
      isRefreshing: false,
      error: message
    })
  } finally {
    if (inFlightController === controller) {
      inFlightController = null
    }
    if (listeners.size > 0 && !isDocumentHidden()) {
      scheduleNextPoll()
    }
  }
}

function handleVisibilityChange(): void {
  if (listeners.size === 0) return
  if (isDocumentHidden()) {
    clearPollTimer()
    abortInFlight()
    if (snapshot.isRefreshing) {
      updateSnapshot({ isRefreshing: false })
    }
  } else {
    clearPollTimer()
    void pollOnce()
  }
}

function attachVisibilityListener(): void {
  if (visibilityAttached || typeof document === 'undefined') return
  document.addEventListener('visibilitychange', handleVisibilityChange)
  visibilityAttached = true
}

function detachVisibilityListener(): void {
  if (!visibilityAttached || typeof document === 'undefined') return
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  visibilityAttached = false
}

export function getPublicResultsSnapshot(): PublicResultsSnapshot {
  return snapshot
}

export function subscribePublicResults(listener: ResultsListener): () => void {
  listeners.add(listener)
  listener(snapshot)

  if (listeners.size === 1) {
    attachVisibilityListener()
    if (!isDocumentHidden()) {
      void pollOnce()
    }
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearPollTimer()
      abortInFlight()
      detachVisibilityListener()
      if (snapshot.isRefreshing) {
        snapshot = { ...snapshot, isRefreshing: false }
      }
    }
  }
}

export function usePublicResults(): PublicResultsSnapshot {
  const [state, setState] = useState<PublicResultsSnapshot>(() => getPublicResultsSnapshot())

  useEffect(() => {
    return subscribePublicResults(setState)
  }, [])

  return state
}
