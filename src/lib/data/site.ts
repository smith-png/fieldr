import { logError } from '../logger'
import type { CarouselItem, Season, SiteSettings, Sport } from '../../types'
import type { SportSlug } from '../sports'
import { AppError } from '../errors'
import {
  supabase,
  DEFAULT_CAROUSEL,
  DEFAULT_SETTINGS,
  FALLBACK_CAROUSEL_TEXTS
} from './client'
import type { SiteService } from './types'

let activeCarouselCache: { data: CarouselItem[]; expiresAt: number } | null = null

export function invalidateCarouselCache(): void {
  activeCarouselCache = null
  invalidateCachedPublicHome()
}

const supabaseSiteService: SiteService = {
  invalidateCarouselCache,

  async getCarouselItems(activeOnly = false): Promise<CarouselItem[]> {
    try {
      if (activeOnly && activeCarouselCache && Date.now() < activeCarouselCache.expiresAt) {
        return activeCarouselCache.data
      }

      if (!supabase) return activeOnly ? DEFAULT_CAROUSEL.filter((i) => i.active) : DEFAULT_CAROUSEL

      let query = supabase
        .from('carousel_items')
        .select('id, text, sort_order, active, season_id, created_at')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(activeOnly ? 25 : 100)

      if (activeOnly) {
        query = query.eq('active', true)
      }

      const { data, error } = await query
      if (error || !data || !Array.isArray(data) || data.length === 0) {
        if (error) logError('getCarouselItems error from Supabase:', error)
        return activeOnly ? DEFAULT_CAROUSEL.filter((i) => i.active) : DEFAULT_CAROUSEL
      }

      const result: CarouselItem[] = data as CarouselItem[]
      if (activeOnly) {
        activeCarouselCache = { data: result, expiresAt: Date.now() + 60_000 }
      }
      return result
    } catch (err) {
      logError('getCarouselItems caught unexpected error:', err)
      return activeOnly ? DEFAULT_CAROUSEL.filter((i) => i.active) : DEFAULT_CAROUSEL
    }
  },

  async createCarouselItem(
    text: string,
    sortOrder: number,
    seasonId?: string
  ): Promise<CarouselItem> {
    const trimmed = text.trim()
    if (!trimmed || trimmed.length > 80) {
      throw new AppError('Carousel item must be between 1 and 80 characters.')
    }

    invalidateCarouselCache()

    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase
      .from('carousel_items')
      .insert([{ text: trimmed, sort_order: sortOrder, active: true, season_id: seasonId || null }])
      .select('id, text, sort_order, active, season_id, created_at')
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as CarouselItem
  },

  async updateCarouselItem(
    id: string,
    updates: Partial<CarouselItem>
  ): Promise<CarouselItem> {
    if (updates.text !== undefined) {
      const trimmed = updates.text.trim()
      if (!trimmed || trimmed.length > 80) {
        throw new AppError('Carousel item must be between 1 and 80 characters.')
      }
      updates.text = trimmed
    }

    invalidateCarouselCache()

    if (!supabase) throw new AppError('Supabase not configured')

    if (updates.active === false) {
      const { data: activeItems } = await supabase
        .from('carousel_items')
        .select('id')
        .eq('active', true)
        .limit(25)

      if (activeItems && activeItems.filter((i) => i.id !== id).length === 0) {
        throw new AppError('At least 1 active ticker item is required.')
      }
    }

    const { data, error } = await supabase
      .from('carousel_items')
      .update(updates)
      .eq('id', id)
      .select('id, text, sort_order, active, season_id, created_at')
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as CarouselItem
  },

  async deleteCarouselItem(id: string): Promise<void> {
    invalidateCarouselCache()

    if (!supabase) throw new AppError('Supabase not configured')

    const { data: activeItems } = await supabase
      .from('carousel_items')
      .select('id')
      .eq('active', true)
      .limit(25)

    if (activeItems && activeItems.length <= 1 && activeItems[0]?.id === id) {
      throw new AppError('At least 1 active ticker item is required.')
    }

    const { error } = await supabase.from('carousel_items').delete().eq('id', id)
    if (error) throw new AppError(error.message, { original: error })
  },

  async swapCarouselItems(id1: string, id2: string): Promise<void> {
    invalidateCarouselCache()

    if (!supabase) return

    const { data: item1 } = await supabase
      .from('carousel_items')
      .select('sort_order')
      .eq('id', id1)
      .single()

    const { data: item2 } = await supabase
      .from('carousel_items')
      .select('sort_order')
      .eq('id', id2)
      .single()

    if (!item1 || !item2) return

    const { error: err1 } = await supabase
      .from('carousel_items')
      .update({ sort_order: item2.sort_order })
      .eq('id', id1)
    if (err1) throw new AppError(err1.message, { original: err1 })

    const { error: err2 } = await supabase
      .from('carousel_items')
      .update({ sort_order: item1.sort_order })
      .eq('id', id2)
    if (err2) throw new AppError(err2.message, { original: err2 })
  },

  async getSiteSettings(): Promise<SiteSettings> {
    if (!supabase) return DEFAULT_SETTINGS

    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value, updated_at')
      .limit(50)
    if (error) {
      logError('Supabase getSiteSettings error:', error.message, error)
      return DEFAULT_SETTINGS
    }
    if (!data) return DEFAULT_SETTINGS

    const result: SiteSettings = { ...DEFAULT_SETTINGS }
    for (const row of data) {
      result[row.key] = row.value
    }
    return result
  },

  async updateSiteSetting(key: string, value: unknown): Promise<void> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { error } = await supabase
      .from('site_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() })

    if (error) throw new AppError(error.message, { original: error })
  }
}

export const DEFAULT_TICKER_SPEED = 5

export function normalizeTickerSpeed(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
    return DEFAULT_TICKER_SPEED
  }
  const num = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(num) || num < 1 || num > 10) {
    return DEFAULT_TICKER_SPEED
  }
  return Math.round(num)
}

export function getTickerSpeedMultiplier(value: unknown): number {
  const v = normalizeTickerSpeed(value)
  if (v <= 5) {
    return 0.4 + (v - 1) * 0.15
  }
  return 1 + (v - 5) * 0.24
}

export async function getTickerSpeedSetting(): Promise<number | null> {
  try {
    if (!supabase) return DEFAULT_TICKER_SPEED

    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .eq('key', 'ticker_speed')
      .limit(1)
      .maybeSingle()

    if (error || !data || data.value === undefined) {
      return null
    }
    return normalizeTickerSpeed(data.value)
  } catch {
    return null
  }
}

export async function getConfettiFallSpeedSetting(): Promise<number | null> {
  try {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('site_settings')
      .select('key, value')
      .eq('key', 'confetti_fall_speed')
      .limit(1)
      .maybeSingle()

    if (
      error ||
      !data ||
      data.value === undefined ||
      data.value === null ||
      data.value === '' ||
      typeof data.value === 'boolean'
    ) {
      return null
    }

    const num = typeof data.value === 'number' ? data.value : Number(data.value)
    return Number.isFinite(num) && num >= 1 && num <= 10 ? Math.round(num) : null
  } catch {
    return null
  }
}

const PUBLIC_TICKER_CACHE_KEY = 'fieldr_public_ticker_v1'
export const PUBLIC_HOME_CACHE_KEY = 'fieldr_public_home_v1'
export const HOME_CACHE_TTL_MS = 5 * 60 * 1000

export interface PublicTickerCachePayload {
  items: string[]
  ticker_speed?: number
  timestamp?: number
}

export interface PublicHomeCachePayload {
  version: 1
  timestamp: number
  activeSeason: Season | null
  playerCounts: Record<SportSlug, number>
  sports: Sport[]
  tickerItems: string[]
  tickerSpeed: number
}

export function sanitizeTickerTexts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      if (
        entry &&
        typeof entry === 'object' &&
        'text' in entry &&
        typeof (entry as { text?: unknown }).text === 'string'
      ) {
        return (entry as { text: string }).text.trim()
      }
      return ''
    })
    .filter((t) => t.length > 0)
}

export function readCachedPublicTicker(): {
  items: string[] | null
  tickerSpeed: number | null
  timestamp: number | null
} {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { items: null, tickerSpeed: null, timestamp: null }
    }
    const raw = window.localStorage.getItem(PUBLIC_TICKER_CACHE_KEY)
    if (!raw) return { items: null, tickerSpeed: null, timestamp: null }
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const clean = sanitizeTickerTexts(parsed)
      return { items: clean.length > 0 ? clean : null, tickerSpeed: null, timestamp: null }
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as { items?: unknown; ticker_speed?: unknown; timestamp?: unknown }
      const clean = sanitizeTickerTexts(obj.items)
      const rawSpeed = obj.ticker_speed
      const hasValidSpeed =
        rawSpeed !== undefined &&
        rawSpeed !== null &&
        rawSpeed !== '' &&
        typeof rawSpeed !== 'boolean' &&
        Number.isFinite(Number(rawSpeed)) &&
        Number(rawSpeed) >= 1 &&
        Number(rawSpeed) <= 10
      const ts =
        typeof obj.timestamp === 'number' && Number.isFinite(obj.timestamp)
          ? obj.timestamp
          : null
      return {
        items: clean.length > 0 ? clean : null,
        tickerSpeed: hasValidSpeed ? normalizeTickerSpeed(rawSpeed) : null,
        timestamp: ts
      }
    }
    return { items: null, tickerSpeed: null, timestamp: null }
  } catch {
    return { items: null, tickerSpeed: null, timestamp: null }
  }
}

export function writeCachedPublicTicker(items: string[], tickerSpeed?: unknown): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const existing = readCachedPublicTicker()
    const resolvedSpeed =
      tickerSpeed !== undefined && tickerSpeed !== null
        ? normalizeTickerSpeed(tickerSpeed)
        : existing.tickerSpeed ?? DEFAULT_TICKER_SPEED
    const payload: PublicTickerCachePayload = {
      items,
      ticker_speed: resolvedSpeed,
      timestamp: Date.now()
    }
    window.localStorage.setItem(PUBLIC_TICKER_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore localStorage errors
  }
}

function writeCachedTickerSpeed(tickerSpeed: unknown): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const existing = readCachedPublicTicker()
    const normalized = normalizeTickerSpeed(tickerSpeed)
    const payload: PublicTickerCachePayload = {
      items: existing.items ?? [],
      ticker_speed: normalized,
      timestamp: Date.now()
    }
    window.localStorage.setItem(PUBLIC_TICKER_CACHE_KEY, JSON.stringify(payload))

    const homeCached = readCachedPublicHome()
    if (homeCached) {
      writeCachedPublicHome({
        ...homeCached,
        tickerSpeed: normalized,
        timestamp: 0
      })
    }
  } catch {
    // Ignore localStorage errors
  }
}

export function removeCachedPublicTicker(tickerSpeed?: unknown): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const existing = readCachedPublicTicker()
    const speedToKeep =
      tickerSpeed !== undefined && tickerSpeed !== null
        ? normalizeTickerSpeed(tickerSpeed)
        : existing.tickerSpeed
    if (speedToKeep !== null) {
      window.localStorage.setItem(
        PUBLIC_TICKER_CACHE_KEY,
        JSON.stringify({ items: [], ticker_speed: speedToKeep, timestamp: Date.now() })
      )
    } else {
      window.localStorage.removeItem(PUBLIC_TICKER_CACHE_KEY)
    }
  } catch {
    // Ignore localStorage errors
  }
}

export function readCachedPublicHome(): PublicHomeCachePayload | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(PUBLIC_HOME_CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const obj = parsed as Partial<PublicHomeCachePayload>
    if (typeof obj.timestamp !== 'number' || !Number.isFinite(obj.timestamp)) {
      return null
    }

    let activeSeason: Season | null = null
    if (
      obj.activeSeason &&
      typeof obj.activeSeason === 'object' &&
      typeof obj.activeSeason.id === 'string' &&
      typeof obj.activeSeason.name === 'string'
    ) {
      activeSeason = {
        id: obj.activeSeason.id,
        name: obj.activeSeason.name,
        is_active: Boolean(obj.activeSeason.is_active),
        created_at:
          typeof obj.activeSeason.created_at === 'string'
            ? obj.activeSeason.created_at
            : ''
      }
    }

    const rawCounts = obj.playerCounts as Partial<Record<SportSlug, unknown>> | undefined
    const playerCounts: Record<SportSlug, number> = {
      cricket:
        rawCounts && typeof rawCounts.cricket === 'number' && Number.isFinite(rawCounts.cricket)
          ? Math.max(0, Math.floor(rawCounts.cricket))
          : 0,
      futsal:
        rawCounts && typeof rawCounts.futsal === 'number' && Number.isFinite(rawCounts.futsal)
          ? Math.max(0, Math.floor(rawCounts.futsal))
          : 0,
      volleyball:
        rawCounts &&
        typeof rawCounts.volleyball === 'number' &&
        Number.isFinite(rawCounts.volleyball)
          ? Math.max(0, Math.floor(rawCounts.volleyball))
          : 0
    }

    const sports: Sport[] = Array.isArray(obj.sports)
      ? obj.sports
          .filter(
            (s): s is Sport =>
              Boolean(
                s &&
                  typeof s === 'object' &&
                  typeof s.id === 'string' &&
                  typeof s.name === 'string' &&
                  Array.isArray(s.roles)
              )
          )
          .map((s) => ({
            id: s.id,
            name: s.name,
            roles: s.roles.filter((r): r is string => typeof r === 'string')
          }))
      : []

    const tickerItems = sanitizeTickerTexts(obj.tickerItems)
    const tickerSpeed = normalizeTickerSpeed(obj.tickerSpeed)

    return {
      version: 1,
      timestamp: obj.timestamp,
      activeSeason,
      playerCounts,
      sports,
      tickerItems,
      tickerSpeed
    }
  } catch {
    return null
  }
}

export function writeCachedPublicHome(
  data: Omit<PublicHomeCachePayload, 'version' | 'timestamp'> & { timestamp?: number }
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const payload: PublicHomeCachePayload = {
      version: 1,
      timestamp:
        typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)
          ? data.timestamp
          : Date.now(),
      activeSeason: data.activeSeason
        ? {
            id: data.activeSeason.id,
            name: data.activeSeason.name,
            is_active: Boolean(data.activeSeason.is_active),
            created_at: data.activeSeason.created_at || ''
          }
        : null,
      playerCounts: {
        cricket: Math.max(0, Math.floor(data.playerCounts.cricket || 0)),
        futsal: Math.max(0, Math.floor(data.playerCounts.futsal || 0)),
        volleyball: Math.max(0, Math.floor(data.playerCounts.volleyball || 0))
      },
      sports: Array.isArray(data.sports)
        ? data.sports.map((s) => ({
            id: String(s.id),
            name: String(s.name),
            roles: Array.isArray(s.roles) ? s.roles.map(String) : []
          }))
        : [],
      tickerItems: sanitizeTickerTexts(data.tickerItems),
      tickerSpeed: normalizeTickerSpeed(data.tickerSpeed)
    }
    window.localStorage.setItem(PUBLIC_HOME_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // Ignore localStorage errors
  }
}

export function invalidateCachedPublicHome(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    const existing = readCachedPublicHome()
    if (existing) {
      writeCachedPublicHome({
        ...existing,
        timestamp: 0
      })
    }
  } catch {
    // Ignore localStorage errors
  }
}

export function isHomeCacheFresh(cache: PublicHomeCachePayload | null): boolean {
  if (!cache || typeof cache.timestamp !== 'number' || cache.timestamp <= 0) {
    return false
  }
  return Date.now() - cache.timestamp < HOME_CACHE_TTL_MS
}

export const siteService: SiteService = supabaseSiteService

export const getCarouselItems = (activeOnly?: boolean) =>
  siteService.getCarouselItems(activeOnly)
export const createCarouselItem = (
  text: string,
  sortOrder: number,
  seasonId?: string
) => siteService.createCarouselItem(text, sortOrder, seasonId)
export const updateCarouselItem = (id: string, updates: Partial<CarouselItem>) =>
  siteService.updateCarouselItem(id, updates)
export const deleteCarouselItem = (id: string) => siteService.deleteCarouselItem(id)

// Backward-compatible swapCarouselItems accepting items or IDs
export async function swapCarouselItems(
  item1OrId1: { id: string; sort_order: number } | string,
  item2OrId2: { id: string; sort_order: number } | string
): Promise<void> {
  const id1 = typeof item1OrId1 === 'string' ? item1OrId1 : item1OrId1.id
  const id2 = typeof item2OrId2 === 'string' ? item2OrId2 : item2OrId2.id
  return siteService.swapCarouselItems(id1, id2)
}

export const getSiteSettings = () => siteService.getSiteSettings()
export const updateSiteSetting = async (key: string, value: unknown) => {
  await siteService.updateSiteSetting(key, value)
  if (key === 'ticker_speed') {
    writeCachedTickerSpeed(value)
  }
}
export { FALLBACK_CAROUSEL_TEXTS }

