import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { AuthUser } from '../types'
import { supabase, REALTIME_DEBOUNCE_MS } from '../lib/data/client'
import {
  ADMIN_SYNC_CHANNEL_NAME,
  ADMIN_SYNC_EVENT_NAME,
  isAdminSyncEntity,
  setActiveAdminSyncChannel,
  type AdminRealtimeTopic,
  type OnlineAdmin
} from '../lib/adminRealtime'

interface AdminRealtimeContextValue {
  onlineAdmins: OnlineAdmin[]
  subscribe: (topics: AdminRealtimeTopic[], listener: () => void) => () => void
}

const AdminRealtimeContext = createContext<AdminRealtimeContextValue | null>(null)

interface AdminRealtimeProviderProps {
  seasonId: string | null
  user: AuthUser | null
  enabled: boolean
  children: React.ReactNode
}

const HIDDEN_RESYNC_THRESHOLD_MS = 20_000

function getAdminDisplayName(emailRaw: string): string {
  const email = emailRaw.trim()
  if (email.includes('@')) {
    const localPart = email.split('@')[0]?.trim()
    if (localPart) return localPart
  }
  return email || 'Admin'
}

export function AdminRealtimeProvider({
  seasonId,
  user,
  enabled,
  children
}: AdminRealtimeProviderProps) {
  const [onlineAdmins, setOnlineAdmins] = useState<OnlineAdmin[]>([])

  const listenersRef = useRef<Map<AdminRealtimeTopic, Set<() => void>>>(new Map())
  const timersRef = useRef<Map<AdminRealtimeTopic, ReturnType<typeof setTimeout>>>(new Map())
  const allTopicsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const emitTopic = useCallback((topic: AdminRealtimeTopic) => {
    const existingTimer = timersRef.current.get(topic)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      timersRef.current.delete(topic)
      const listeners = listenersRef.current.get(topic)
      if (!listeners || listeners.size === 0) return
      // Snapshot listeners so unsubscribes during callbacks are safe
      for (const listener of Array.from(listeners)) {
        try {
          listener()
        } catch {
          // Keep other subscribers running if one callback throws
        }
      }
    }, REALTIME_DEBOUNCE_MS)

    timersRef.current.set(topic, timer)
  }, [])

  const emitAllTopics = useCallback(() => {
    if (allTopicsTimerRef.current) {
      clearTimeout(allTopicsTimerRef.current)
    }

    allTopicsTimerRef.current = setTimeout(() => {
      allTopicsTimerRef.current = null
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
      timersRef.current.clear()

      const uniqueListeners = new Set<() => void>()
      for (const listeners of listenersRef.current.values()) {
        for (const listener of listeners) {
          uniqueListeners.add(listener)
        }
      }
      for (const listener of Array.from(uniqueListeners)) {
        try {
          listener()
        } catch {
          // Keep other subscribers running if one callback throws
        }
      }
    }, REALTIME_DEBOUNCE_MS)
  }, [])

  const subscribe = useCallback(
    (topics: AdminRealtimeTopic[], listener: () => void) => {
      for (const topic of topics) {
        let set = listenersRef.current.get(topic)
        if (!set) {
          set = new Set()
          listenersRef.current.set(topic, set)
        }
        set.add(listener)
      }

      return () => {
        for (const topic of topics) {
          const set = listenersRef.current.get(topic)
          if (set) {
            set.delete(listener)
            if (set.size === 0) {
              listenersRef.current.delete(topic)
            }
          }
        }
      }
    },
    []
  )

  // Clear pending debounce timers on provider unmount
  useEffect(() => {
    const timers = timersRef.current
    return () => {
      if (allTopicsTimerRef.current) {
        clearTimeout(allTopicsTimerRef.current)
        allTopicsTimerRef.current = null
      }
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  // Resync all topics once when returning to a tab hidden for >20s or regaining connectivity
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof document === 'undefined') return

    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible') {
        if (hiddenAt !== null && Date.now() - hiddenAt > HIDDEN_RESYNC_THRESHOLD_MS) {
          emitAllTopics()
        }
        hiddenAt = null
      }
    }

    const handleOnline = () => {
      emitAllTopics()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [enabled, emitAllTopics])

  // Channel 1: Single postgres_changes channel for all realtime-enabled tables used in admin
  useEffect(() => {
    if (!enabled || !supabase) return

    let isActive = true
    let hasSubscribedBefore = false

    const channelName = seasonId ? `admin_db_sync_${seasonId}` : 'admin_db_sync_global'
    let channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'seasons' },
        () => emitTopic('seasons')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carousel_items' },
        () => emitTopic('carousel_items')
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'site_settings' },
        () => emitTopic('site_settings')
      )

    if (seasonId) {
      const seasonFilter = `season_id=eq.${seasonId}`
      channel = channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'projector_state', filter: seasonFilter },
          () => emitTopic('projector_state')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: seasonFilter },
          () => emitTopic('players')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'teams', filter: seasonFilter },
          () => emitTopic('teams')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'purse_transactions', filter: seasonFilter },
          () => emitTopic('purse_transactions')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'auction_queue', filter: seasonFilter },
          () => emitTopic('auction_queue')
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'owner_announcements', filter: seasonFilter },
          () => emitTopic('owner_announcements')
        )
    }

    channel.subscribe((status) => {
      if (!isActive) return
      if (status === 'SUBSCRIBED') {
        if (hasSubscribedBefore) {
          emitAllTopics()
        } else {
          hasSubscribedBefore = true
        }
      }
    })

    return () => {
      isActive = false
      if (supabase) {
        void supabase.removeChannel(channel)
      }
    }
  }, [enabled, seasonId, emitTopic, emitAllTopics])

  const userId = user?.id ?? null
  const userEmail = user?.email ?? ''

  // Channel 2: Single admin-sync Broadcast + Presence channel (admin routes only)
  useEffect(() => {
    if (!enabled || !supabase || !userId) {
      setOnlineAdmins([])
      return
    }

    let isActive = true
    let hasSubscribedBefore = false
    const presenceKey = userId
    const initialEmail = userEmail.trim()
    const initialName = getAdminDisplayName(initialEmail)

    const channel = supabase.channel(ADMIN_SYNC_CHANNEL_NAME, {
      config: {
        broadcast: { self: false },
        presence: { key: presenceKey }
      }
    })

    const syncPresenceList = () => {
      if (!isActive) return
      const state = channel.presenceState()
      const byId = new Map<string, OnlineAdmin>()

      for (const [key, metas] of Object.entries(state)) {
        if (!Array.isArray(metas) || metas.length === 0) continue
        const latest = metas[metas.length - 1] as Record<string, unknown>
        const id = typeof latest.user_id === 'string' && latest.user_id ? latest.user_id : key
        const email = typeof latest.email === 'string' ? latest.email : ''
        const name =
          (typeof latest.name === 'string' && latest.name.trim()) ||
          email ||
          'Admin'
        const onlineAt =
          typeof latest.online_at === 'string' ? latest.online_at : new Date().toISOString()

        byId.set(id, { id, email, name, onlineAt })
      }

      const list = Array.from(byId.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
      setOnlineAdmins(list)
    }

    channel
      .on('broadcast', { event: ADMIN_SYNC_EVENT_NAME }, ({ payload }) => {
        if (!isActive || !payload || typeof payload !== 'object') return
        const entity = (payload as Record<string, unknown>).entity
        if (isAdminSyncEntity(entity)) {
          emitTopic(entity)
        }
      })
      .on('presence', { event: 'sync' }, syncPresenceList)
      .on('presence', { event: 'join' }, syncPresenceList)
      .on('presence', { event: 'leave' }, syncPresenceList)
      .subscribe(async (status) => {
        if (!isActive) return
        if (status === 'SUBSCRIBED') {
          if (hasSubscribedBefore) {
            emitAllTopics()
          } else {
            hasSubscribedBefore = true
          }
          setActiveAdminSyncChannel(channel)
          let resolvedName = initialName
          let resolvedEmail = initialEmail
          try {
            const { data } = await supabase!.auth.getSession()
            const authUser = data.session?.user
            const meta = authUser?.user_metadata as Record<string, unknown> | undefined
            const fullName =
              (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
              (typeof meta?.display_name === 'string' && meta.display_name.trim()) ||
              (typeof meta?.name === 'string' && meta.name.trim()) ||
              ''
            if (fullName) resolvedName = fullName
            if (typeof authUser?.email === 'string' && authUser.email.trim()) {
              resolvedEmail = authUser.email.trim()
            }
          } catch {
            // Use fallback values from AuthUser
          }

          if (!isActive) return
          try {
            await channel.track({
              user_id: userId,
              email: resolvedEmail,
              name: resolvedName,
              online_at: new Date().toISOString()
            })
          } catch {
            // Ignore transient presence track errors
          }
        }
      })

    return () => {
      isActive = false
      setActiveAdminSyncChannel(null)
      try {
        void channel.untrack()
      } catch {
        // Ignore untrack failures on teardown
      }
      if (supabase) {
        void supabase.removeChannel(channel)
      }
    }
  }, [enabled, userId, userEmail, emitTopic, emitAllTopics])

  const contextValue = useMemo<AdminRealtimeContextValue>(
    () => ({
      onlineAdmins,
      subscribe
    }),
    [onlineAdmins, subscribe]
  )

  return (
    <AdminRealtimeContext.Provider value={contextValue}>
      {children}
    </AdminRealtimeContext.Provider>
  )
}

const FALLBACK_SUBSCRIBE = () => () => {}

export function useAdminRealtime(): AdminRealtimeContextValue {
  const ctx = useContext(AdminRealtimeContext)
  if (!ctx) {
    return {
      onlineAdmins: [],
      subscribe: FALLBACK_SUBSCRIBE
    }
  }
  return ctx
}

export function useAdminRealtimeTopics(
  topics: readonly AdminRealtimeTopic[],
  onEvent: () => void,
  enabled = true
): void {
  const { subscribe } = useAdminRealtime()
  const callbackRef = useRef(onEvent)
  callbackRef.current = onEvent

  const topicsKey = topics.join(',')

  useEffect(() => {
    if (!enabled || !topicsKey) return
    const parsedTopics = topicsKey.split(',') as AdminRealtimeTopic[]
    return subscribe(parsedTopics, () => {
      callbackRef.current()
    })
  }, [enabled, topicsKey, subscribe])
}
