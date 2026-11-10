import type { CarouselItem, SiteSettings } from '../../types'
import { AppError } from '../errors'
import {
  isDemoMode,
  supabase,
  getLocal,
  setLocal,
  notifyChange,
  demoBroadcastChannel,
  STORAGE_KEYS,
  DEFAULT_CAROUSEL,
  DEFAULT_SETTINGS,
  FALLBACK_CAROUSEL_TEXTS
} from './client'
import type { SiteService } from './types'

let activeCarouselCache: { data: CarouselItem[]; expiresAt: number } | null = null

export function invalidateCarouselCache(): void {
  activeCarouselCache = null
}

const demoSiteService: SiteService = {
  invalidateCarouselCache,

  async getCarouselItems(activeOnly = false): Promise<CarouselItem[]> {
    try {
      if (activeOnly && activeCarouselCache && Date.now() < activeCarouselCache.expiresAt) {
        return activeCarouselCache.data
      }

      const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
      if (!Array.isArray(all) || all.length === 0) {
        return DEFAULT_CAROUSEL
      }
      const sorted = [...all].sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          (a.created_at || '').localeCompare(b.created_at || '')
      )
      const result = activeOnly ? sorted.filter((item) => item.active) : sorted
      const safeResult = result.length > 0 ? result : DEFAULT_CAROUSEL
      if (activeOnly) {
        activeCarouselCache = { data: safeResult, expiresAt: Date.now() + 60_000 }
      }
      return safeResult
    } catch {
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

    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const newItem: CarouselItem = {
      id: `car-${Date.now()}`,
      text: trimmed,
      sort_order: sortOrder,
      active: true,
      season_id: seasonId || null,
      created_at: new Date().toISOString()
    }
    all.push(newItem)
    setLocal(STORAGE_KEYS.CAROUSEL, all)
    notifyChange('carousel_change')
    return newItem
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

    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const idx = all.findIndex((i) => i.id === id)
    if (idx === -1) throw new AppError('Carousel item not found')

    if (updates.active === false && all[idx].active) {
      const activeRemaining = all.filter((i) => i.id !== id && i.active)
      if (activeRemaining.length === 0) {
        throw new AppError('At least 1 active ticker item is required.')
      }
    }

    const updated = { ...all[idx], ...updates }
    all[idx] = updated
    setLocal(STORAGE_KEYS.CAROUSEL, all)
    notifyChange('carousel_change')
    return updated
  },

  async deleteCarouselItem(id: string): Promise<void> {
    invalidateCarouselCache()

    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const target = all.find((i) => i.id === id)
    if (target?.active) {
      const activeRemaining = all.filter((i) => i.id !== id && i.active)
      if (activeRemaining.length === 0) {
        throw new AppError('At least 1 active ticker item is required.')
      }
    }
    setLocal(STORAGE_KEYS.CAROUSEL, all.filter((i) => i.id !== id))
    notifyChange('carousel_change')
  },

  async swapCarouselItems(id1: string, id2: string): Promise<void> {
    invalidateCarouselCache()

    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    const match1 = all.find((i) => i.id === id1)
    const match2 = all.find((i) => i.id === id2)
    if (match1 && match2) {
      const tmp = match1.sort_order
      match1.sort_order = match2.sort_order
      match2.sort_order = tmp
      setLocal(STORAGE_KEYS.CAROUSEL, all)
      notifyChange('carousel_change')
    }
  },

  async reorderCarouselItems(
    orderedItems: { id: string; sort_order: number }[]
  ): Promise<void> {
    invalidateCarouselCache()

    const all = getLocal<CarouselItem[]>(STORAGE_KEYS.CAROUSEL, DEFAULT_CAROUSEL)
    for (const item of orderedItems) {
      const match = all.find((i) => i.id === item.id)
      if (match) match.sort_order = item.sort_order
    }
    setLocal(STORAGE_KEYS.CAROUSEL, all)
    notifyChange('carousel_change')
  },

  subscribeToCarouselItems(callback: (items: CarouselItem[]) => void): () => void {
    let isUnsubscribed = false

    const refresh = async () => {
      try {
        invalidateCarouselCache()
        const items = await demoSiteService.getCarouselItems(true)
        if (!isUnsubscribed) {
          callback(items)
        }
      } catch {
        // ignore background refresh failure
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.CAROUSEL) {
        refresh()
      }
    }
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.event === 'carousel_change') {
        refresh()
      }
    }
    window.addEventListener('storage', handleStorage)
    if (demoBroadcastChannel) {
      demoBroadcastChannel.addEventListener('message', handleMessage)
    }

    refresh()

    return () => {
      isUnsubscribed = true
      window.removeEventListener('storage', handleStorage)
      if (demoBroadcastChannel) {
        demoBroadcastChannel.removeEventListener('message', handleMessage)
      }
    }
  },

  async getSiteSettings(): Promise<SiteSettings> {
    return getLocal<SiteSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
  },

  async updateSiteSetting(key: string, value: unknown): Promise<void> {
    const current = getLocal<SiteSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS)
    current[key] = value
    setLocal(STORAGE_KEYS.SETTINGS, current)
    notifyChange('settings_change')
  }
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
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (activeOnly) {
        query = query.eq('active', true)
      }

      const { data, error } = await query
      if (error || !data || !Array.isArray(data) || data.length === 0) {
        if (error) console.error('getCarouselItems error from Supabase:', error)
        return activeOnly ? DEFAULT_CAROUSEL.filter((i) => i.active) : DEFAULT_CAROUSEL
      }

      const result: CarouselItem[] = data as CarouselItem[]
      if (activeOnly) {
        activeCarouselCache = { data: result, expiresAt: Date.now() + 60_000 }
      }
      return result
    } catch (err) {
      console.error('getCarouselItems caught unexpected error:', err)
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
      .select()
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

      if (activeItems && activeItems.filter((i) => i.id !== id).length === 0) {
        throw new AppError('At least 1 active ticker item is required.')
      }
    }

    const { data, error } = await supabase
      .from('carousel_items')
      .update(updates)
      .eq('id', id)
      .select()
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

  async reorderCarouselItems(
    orderedItems: { id: string; sort_order: number }[]
  ): Promise<void> {
    invalidateCarouselCache()

    if (!supabase) return

    for (const item of orderedItems) {
      const { error } = await supabase
        .from('carousel_items')
        .update({ sort_order: item.sort_order })
        .eq('id', item.id)
      if (error) throw new AppError(error.message, { original: error })
    }
  },

  subscribeToCarouselItems(callback: (items: CarouselItem[]) => void): () => void {
    let isUnsubscribed = false

    const refresh = async () => {
      try {
        invalidateCarouselCache()
        const items = await supabaseSiteService.getCarouselItems(true)
        if (!isUnsubscribed) {
          callback(items)
        }
      } catch {
        // ignore background refresh failure
      }
    }

    if (!supabase) return () => {}

    const realtimeChannel = supabase
      .channel('fieldr-carousel-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carousel_items' },
        () => {
          refresh()
        }
      )
      .subscribe()

    refresh()

    return () => {
      isUnsubscribed = true
      if (supabase) {
        supabase.removeChannel(realtimeChannel)
      }
    }
  },

  async getSiteSettings(): Promise<SiteSettings> {
    if (!supabase) return DEFAULT_SETTINGS

    const { data, error } = await supabase.from('site_settings').select('*')
    if (error || !data) return DEFAULT_SETTINGS

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

export const siteService: SiteService = isDemoMode
  ? demoSiteService
  : supabaseSiteService

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

export const reorderCarouselItems = (
  orderedItems: { id: string; sort_order: number }[]
) => siteService.reorderCarouselItems(orderedItems)
export const subscribeToCarouselItems = (
  callback: (items: CarouselItem[]) => void
) => siteService.subscribeToCarouselItems(callback)
export const getSiteSettings = () => siteService.getSiteSettings()
export const updateSiteSetting = (key: string, value: unknown) =>
  siteService.updateSiteSetting(key, value)
export { FALLBACK_CAROUSEL_TEXTS }
