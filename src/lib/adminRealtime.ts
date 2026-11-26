import type { RealtimeChannel } from '@supabase/supabase-js'

export type AdminSyncEntity =
  | 'athletes'
  | 'registrations'
  | 'credits'
  | 'handbooks'
  | 'reels'
  | 'auction_settings'
  | 'sports'
  | 'rules'

export type AdminRealtimeTableTopic =
  | 'projector_state'
  | 'players'
  | 'teams'
  | 'purse_transactions'
  | 'auction_queue'
  | 'seasons'
  | 'owner_announcements'
  | 'carousel_items'
  | 'site_settings'

export type AdminRealtimeTopic = AdminRealtimeTableTopic | AdminSyncEntity

export interface OnlineAdmin {
  id: string
  email: string
  name: string
  onlineAt: string
}

export const ADMIN_SYNC_CHANNEL_NAME = 'admin-sync'
export const ADMIN_SYNC_EVENT_NAME = 'entity_changed'

const VALID_SYNC_ENTITIES = new Set<AdminSyncEntity>([
  'athletes',
  'registrations',
  'credits',
  'handbooks',
  'reels',
  'auction_settings',
  'sports',
  'rules'
])

export function isAdminSyncEntity(value: unknown): value is AdminSyncEntity {
  return typeof value === 'string' && VALID_SYNC_ENTITIES.has(value as AdminSyncEntity)
}

let activeAdminSyncChannel: RealtimeChannel | null = null

export function setActiveAdminSyncChannel(channel: RealtimeChannel | null): void {
  activeAdminSyncChannel = channel
}

export function broadcastAdminSync(entity: AdminSyncEntity, action: string): void {
  if (!activeAdminSyncChannel) return
  try {
    void activeAdminSyncChannel.send({
      type: 'broadcast',
      event: ADMIN_SYNC_EVENT_NAME,
      payload: {
        entity,
        action,
        sentAt: Date.now()
      }
    })
  } catch {
    // Best-effort broadcast; ignore if channel is disconnecting
  }
}
