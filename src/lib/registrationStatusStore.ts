import { useSyncExternalStore } from 'react'
import type { PublicRegistrationConfig } from '../types'

const STORAGE_KEY = 'fieldr_reg_status_v1'
const STALE_AFTER_MS = 60_000
const IDLE_TIMEOUT_MS = 1_500
const MAX_TIMEOUT_MS = 2_147_483_647

type RegistrationReason = PublicRegistrationConfig['reason']

export interface StoredRegistrationStatus {
  open: boolean
  fetchedAt: number
  reason: RegistrationReason
  season_id: string | null
  season_name: string | null
  opens_at: string | null
  closes_at: string | null
}

export interface RegistrationStatusSnapshot {
  hasValue: boolean
  open: boolean
  reason: RegistrationReason | null
  fetchedAt: number
  season_id: string | null
  season_name: string | null
  opens_at: string | null
  closes_at: string | null
  config: PublicRegistrationConfig | null
  isRefreshing: boolean
  lastFetchFailed: boolean
}

type Listener = () => void

function isValidReason(value: unknown): value is RegistrationReason {
  return (
    value === 'open' ||
    value === 'closed' ||
    value === 'before_open' ||
    value === 'after_close' ||
    value === 'no_season'
  )
}

function readFromSessionStorage(): StoredRegistrationStatus | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.open !== 'boolean') return null
    if (typeof obj.fetchedAt !== 'number' || !Number.isFinite(obj.fetchedAt)) return null

    const reason: RegistrationReason = isValidReason(obj.reason)
      ? obj.reason
      : obj.open
      ? 'open'
      : 'closed'

    return {
      open: obj.open,
      fetchedAt: obj.fetchedAt,
      reason,
      season_id: typeof obj.season_id === 'string' ? obj.season_id : null,
      season_name: typeof obj.season_name === 'string' ? obj.season_name : null,
      opens_at: typeof obj.opens_at === 'string' ? obj.opens_at : null,
      closes_at: typeof obj.closes_at === 'string' ? obj.closes_at : null
    }
  } catch {
    return null
  }
}

function writeToSessionStorage(record: StoredRegistrationStatus): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

function evaluateWindow(
  record: StoredRegistrationStatus,
  nowMs: number
): { open: boolean; reason: RegistrationReason } {
  if (
    record.reason === 'closed' ||
    record.reason === 'no_season' ||
    record.reason === 'after_close'
  ) {
    return { open: false, reason: record.reason }
  }

  const opensAtMs = record.opens_at ? Date.parse(record.opens_at) : NaN
  const closesAtMs = record.closes_at ? Date.parse(record.closes_at) : NaN

  if (Number.isFinite(opensAtMs) && nowMs < opensAtMs) {
    return { open: false, reason: 'before_open' }
  }
  if (Number.isFinite(closesAtMs) && nowMs >= closesAtMs) {
    return { open: false, reason: 'after_close' }
  }

  if (record.reason === 'open' || record.reason === 'before_open' || record.open) {
    return { open: true, reason: 'open' }
  }

  return { open: false, reason: record.reason }
}

function getNextBoundaryMs(
  record: StoredRegistrationStatus | null,
  nowMs: number
): number | null {
  if (!record) return null
  if (
    record.reason === 'closed' ||
    record.reason === 'no_season' ||
    record.reason === 'after_close'
  ) {
    return null
  }

  const candidates: number[] = []
  if (record.opens_at) {
    const ms = Date.parse(record.opens_at)
    if (Number.isFinite(ms) && ms > nowMs) candidates.push(ms)
  }
  if (record.closes_at) {
    const ms = Date.parse(record.closes_at)
    if (Number.isFinite(ms) && ms > nowMs) candidates.push(ms)
  }

  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

// Synchronous initial hydration from sessionStorage at module load
let storedRecord: StoredRegistrationStatus | null = readFromSessionStorage()
let fullConfig: PublicRegistrationConfig | null = null
let isRefreshing = false
let lastFetchFailed = false
let hasFetchedThisSession = false
let inFlightPromise: Promise<PublicRegistrationConfig | null> | null = null
let initialized = false
let boundaryTimerId: number | null = null
const listeners = new Set<Listener>()

function buildSnapshot(nowMs: number): RegistrationStatusSnapshot {
  if (!storedRecord) {
    return {
      hasValue: false,
      open: false,
      reason: null,
      fetchedAt: 0,
      season_id: null,
      season_name: null,
      opens_at: null,
      closes_at: null,
      config: null,
      isRefreshing,
      lastFetchFailed
    }
  }

  const evaluated = evaluateWindow(storedRecord, nowMs)
  const effectiveConfig: PublicRegistrationConfig | null = fullConfig
    ? fullConfig.is_open === evaluated.open && fullConfig.reason === evaluated.reason
      ? fullConfig
      : {
          ...fullConfig,
          is_open: evaluated.open,
          reason: evaluated.reason
        }
    : null

  return {
    hasValue: true,
    open: evaluated.open,
    reason: evaluated.reason,
    fetchedAt: storedRecord.fetchedAt,
    season_id: storedRecord.season_id,
    season_name: storedRecord.season_name,
    opens_at: storedRecord.opens_at,
    closes_at: storedRecord.closes_at,
    config: effectiveConfig,
    isRefreshing,
    lastFetchFailed
  }
}

function snapshotsEqual(
  a: RegistrationStatusSnapshot,
  b: RegistrationStatusSnapshot
): boolean {
  return (
    a.hasValue === b.hasValue &&
    a.open === b.open &&
    a.reason === b.reason &&
    a.fetchedAt === b.fetchedAt &&
    a.season_id === b.season_id &&
    a.season_name === b.season_name &&
    a.opens_at === b.opens_at &&
    a.closes_at === b.closes_at &&
    a.isRefreshing === b.isRefreshing &&
    a.lastFetchFailed === b.lastFetchFailed &&
    (a.config === b.config ||
      (a.config !== null &&
        b.config !== null &&
        a.config.is_open === b.config.is_open &&
        a.config.reason === b.config.reason &&
        a.config.season_id === b.config.season_id &&
        a.config.season_name === b.config.season_name &&
        a.config.opens_at === b.config.opens_at &&
        a.config.closes_at === b.config.closes_at &&
        a.config.instructions_md === b.config.instructions_md &&
        a.config.confirmation_message === b.config.confirmation_message &&
        a.config.accepted_sports === b.config.accepted_sports))
  )
}

let currentSnapshot: RegistrationStatusSnapshot = buildSnapshot(Date.now())

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

function scheduleBoundaryTimer(): void {
  if (typeof window === 'undefined') return
  if (boundaryTimerId !== null) {
    window.clearTimeout(boundaryTimerId)
    boundaryTimerId = null
  }

  const nowMs = Date.now()
  const nextBoundary = getNextBoundaryMs(storedRecord, nowMs)
  if (nextBoundary === null) return

  const delayMs = nextBoundary - nowMs + 50
  if (delayMs <= 0 || delayMs > MAX_TIMEOUT_MS) return

  boundaryTimerId = window.setTimeout(() => {
    boundaryTimerId = null
    syncSnapshot(true)
  }, delayMs)
}

function syncSnapshot(shouldNotify: boolean): void {
  const next = buildSnapshot(Date.now())
  const changed = !snapshotsEqual(currentSnapshot, next)
  if (changed) {
    currentSnapshot = next
  }
  scheduleBoundaryTimer()
  if (changed && shouldNotify) {
    notify()
  }
}

export function recomputeRegistrationStatus(): void {
  syncSnapshot(true)
}

export async function refreshRegistrationStatus(options?: {
  force?: boolean
}): Promise<PublicRegistrationConfig | null> {
  const force = Boolean(options?.force)

  // At most one request in flight at any time
  if (inFlightPromise) {
    return inFlightPromise
  }

  if (
    !force &&
    hasFetchedThisSession &&
    !lastFetchFailed &&
    storedRecord &&
    Date.now() - storedRecord.fetchedAt < STALE_AFTER_MS
  ) {
    syncSnapshot(true)
    return currentSnapshot.config
  }

  isRefreshing = true
  syncSnapshot(true)

  const run = async (): Promise<PublicRegistrationConfig | null> => {
    try {
      const { fetchPublicRegistrationConfigStrict } = await import('./data/registrations')
      const fresh = await fetchPublicRegistrationConfigStrict()
      const now = Date.now()

      const nextRecord: StoredRegistrationStatus = {
        open: fresh.is_open,
        fetchedAt: now,
        reason: fresh.reason,
        season_id: fresh.season_id,
        season_name: fresh.season_name,
        opens_at: fresh.opens_at,
        closes_at: fresh.closes_at
      }

      storedRecord = nextRecord
      fullConfig = fresh
      hasFetchedThisSession = true
      lastFetchFailed = false
      writeToSessionStorage(nextRecord)
      return fresh
    } catch {
      // Keep last known state on network/server failure; retry on next visibility change
      lastFetchFailed = true
      return fullConfig
    }
  }

  const runner = run()
  inFlightPromise = runner
  try {
    return await runner
  } finally {
    isRefreshing = false
    if (inFlightPromise === runner) {
      inFlightPromise = null
    }
    syncSnapshot(true)
  }
}

export function invalidateRegistrationStatus(): void {
  hasFetchedThisSession = false
  if (storedRecord) {
    storedRecord = { ...storedRecord, fetchedAt: 0 }
  }
  // Never clear storedRecord or reset open to false while refresh runs
  if (inFlightPromise) {
    void inFlightPromise.finally(() => {
      void refreshRegistrationStatus({ force: true })
    })
    return
  }
  void refreshRegistrationStatus({ force: true })
}

export function initRegistrationStatusStore(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  scheduleBoundaryTimer()

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      syncSnapshot(true)
      const age = storedRecord ? Date.now() - storedRecord.fetchedAt : Infinity
      if (lastFetchFailed || !storedRecord || age >= STALE_AFTER_MS) {
        void refreshRegistrationStatus()
      }
    })
  }

  const runIdleFetch = () => {
    if (hasFetchedThisSession || inFlightPromise) return
    void refreshRegistrationStatus()
  }

  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(runIdleFetch, { timeout: IDLE_TIMEOUT_MS })
  } else {
    window.setTimeout(runIdleFetch, IDLE_TIMEOUT_MS)
  }
}

export function getRegistrationStatusSnapshot(): RegistrationStatusSnapshot {
  return currentSnapshot
}

export function subscribeRegistrationStatus(listener: Listener): () => void {
  initRegistrationStatusStore()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useRegistrationStatus(): RegistrationStatusSnapshot {
  return useSyncExternalStore(
    subscribeRegistrationStatus,
    getRegistrationStatusSnapshot,
    getRegistrationStatusSnapshot
  )
}
