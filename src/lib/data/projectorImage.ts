import { AppError } from '../errors'
import { supabase } from './client'

export interface ProjectorImagePayload {
  id: string
  dataUrl: string
  caption: string | null
  durationSec: number | null
  sentAt: string
}

export interface ProjectorImageClearPayload {
  id: string
}

const CHANNEL_SUBSCRIBE_TIMEOUT_MS = 10_000

const CHANNEL_OPTIONS = {
  config: {
    private: true,
    broadcast: {
      self: false,
      ack: true
    }
  }
} as const

function getChannelName(seasonId: string): string {
  return `projector_image_${seasonId}`
}

function createBroadcastId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

async function ensureRealtimeAuth(client: NonNullable<typeof supabase>): Promise<void> {
  try {
    if (typeof client.realtime?.setAuth === 'function') {
      await client.realtime.setAuth()
    }
  } catch {
    // Allow subscribe to proceed and report any authorization error cleanly
  }
}

async function sendBroadcastEvent(
  seasonId: string,
  event: 'image_show' | 'image_clear',
  payload: ProjectorImagePayload | ProjectorImageClearPayload
): Promise<void> {
  if (!supabase) {
    throw new AppError('Supabase not configured')
  }
  if (!seasonId) {
    throw new AppError('No season selected')
  }

  const client = supabase
  await ensureRealtimeAuth(client)

  const channel = client.channel(getChannelName(seasonId), CHANNEL_OPTIONS)

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new AppError('Timed out connecting to projector image channel'))
        }
      }, CHANNEL_SUBSCRIBE_TIMEOUT_MS)

      channel.subscribe((status, err) => {
        if (settled) return
        if (status === 'SUBSCRIBED') {
          settled = true
          clearTimeout(timer)
          resolve()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          settled = true
          clearTimeout(timer)
          const detail = err instanceof Error && err.message ? `: ${err.message}` : ''
          reject(new AppError(`Failed to connect to projector channel (${status}${detail})`))
        }
      })
    })

    const sendResult = await channel.send({
      type: 'broadcast',
      event,
      payload
    })

    if (sendResult !== 'ok') {
      throw new AppError(`Projector broadcast failed (${sendResult})`)
    }
  } finally {
    await client.removeChannel(channel)
  }
}

export async function sendProjectorImage(
  seasonId: string,
  payload: ProjectorImagePayload
): Promise<void> {
  await sendBroadcastEvent(seasonId, 'image_show', payload)
}

export async function clearProjectorImage(
  seasonId: string,
  id?: string
): Promise<void> {
  const clearPayload: ProjectorImageClearPayload = {
    id: id && id.trim() ? id : createBroadcastId()
  }
  await sendBroadcastEvent(seasonId, 'image_clear', clearPayload)
}

export function subscribeProjectorImage(
  seasonId: string,
  onShow: (payload: ProjectorImagePayload) => void,
  onClear: (payload: ProjectorImageClearPayload) => void
): () => void {
  if (!supabase || !seasonId) {
    return () => {}
  }

  const client = supabase
  let isActive = true

  const channel = client
    .channel(getChannelName(seasonId), CHANNEL_OPTIONS)
    .on('broadcast', { event: 'image_show' }, (message) => {
      if (!isActive) return
      const raw = (message?.payload ?? null) as Partial<ProjectorImagePayload> | null
      if (!raw || typeof raw.dataUrl !== 'string' || !raw.dataUrl.startsWith('data:image/')) {
        return
      }

      const id = typeof raw.id === 'string' && raw.id ? raw.id : createBroadcastId()
      const caption =
        typeof raw.caption === 'string' && raw.caption.trim()
          ? raw.caption.trim()
          : null
      const durationSec =
        typeof raw.durationSec === 'number' &&
        Number.isFinite(raw.durationSec) &&
        raw.durationSec > 0
          ? raw.durationSec
          : null
      const sentAt =
        typeof raw.sentAt === 'string' && raw.sentAt
          ? raw.sentAt
          : new Date().toISOString()

      onShow({
        id,
        dataUrl: raw.dataUrl,
        caption,
        durationSec,
        sentAt
      })
    })
    .on('broadcast', { event: 'image_clear' }, (message) => {
      if (!isActive) return
      const raw = (message?.payload ?? null) as Partial<ProjectorImageClearPayload> | null
      const id = typeof raw?.id === 'string' ? raw.id : ''
      onClear({ id })
    })

  void (async () => {
    await ensureRealtimeAuth(client)
    if (!isActive) return
    channel.subscribe()
  })()

  return () => {
    isActive = false
    void client.removeChannel(channel)
  }
}
