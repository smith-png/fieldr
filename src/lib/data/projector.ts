import type { ProjectorState } from '../../types'
import {
  PROJECTOR_AUTO_FILTERS,
  PROJECTOR_AUTO_INTERVAL,
  PROJECTOR_MODES
} from '../constants'
import { AppError } from '../errors'
import {
  isDemoMode,
  supabase,
  getLocal,
  setLocal,
  notifyChange,
  demoBroadcastChannel,
  STORAGE_KEYS
} from './client'
import type { ProjectorService, StartProjectorAutoParams } from './types'

const defaultState = (seasonId: string): ProjectorState => ({
  season_id: seasonId,
  mode: PROJECTOR_MODES.IDLE,
  player_id: null,
  team_id: null,
  auto_sport: null,
  auto_filter: PROJECTOR_AUTO_FILTERS.ALL,
  auto_interval_seconds: PROJECTOR_AUTO_INTERVAL.DEFAULT,
  auto_started_at: null,
  broadcast_message: null,
  confetti_at: null,
  updated_at: new Date().toISOString()
})

function clampIntervalSeconds(value: number): number {
  const num = Math.round(Number(value) || PROJECTOR_AUTO_INTERVAL.DEFAULT)
  return Math.min(PROJECTOR_AUTO_INTERVAL.MAX, Math.max(PROJECTOR_AUTO_INTERVAL.MIN, num))
}

const demoProjectorService: ProjectorService = {
  async getProjectorState(seasonId: string): Promise<ProjectorState> {
    const state = getLocal<ProjectorState>(
      STORAGE_KEYS.PROJECTOR,
      defaultState(seasonId)
    )
    return state.season_id === seasonId ? state : { ...state, season_id: seasonId }
  },

  async setProjectorState(state: ProjectorState): Promise<ProjectorState> {
    const isAuto =
      state.mode === PROJECTOR_MODES.PLAYER_AUTO ||
      state.mode === PROJECTOR_MODES.ROSTER_AUTO
    const updatedState: ProjectorState = {
      ...state,
      auto_sport: isAuto ? state.auto_sport ?? null : null,
      auto_started_at: isAuto ? state.auto_started_at ?? null : null,
      updated_at: new Date().toISOString()
    }
    setLocal(STORAGE_KEYS.PROJECTOR, updatedState)
    notifyChange('projector_change', updatedState)
    return updatedState
  },

  async startProjectorAuto(params: StartProjectorAutoParams): Promise<ProjectorState> {
    const nowIso = new Date().toISOString()
    const current = await demoProjectorService.getProjectorState(params.seasonId)
    const updatedState: ProjectorState = {
      ...current,
      season_id: params.seasonId,
      mode: params.mode,
      auto_sport: params.sport,
      auto_filter:
        params.mode === PROJECTOR_MODES.ROSTER_AUTO
          ? PROJECTOR_AUTO_FILTERS.ALL
          : params.filter || PROJECTOR_AUTO_FILTERS.ALL,
      auto_interval_seconds: clampIntervalSeconds(params.intervalSeconds),
      auto_started_at: nowIso,
      player_id: null,
      team_id: null,
      updated_at: nowIso
    }
    setLocal(STORAGE_KEYS.PROJECTOR, updatedState)
    notifyChange('projector_change', updatedState)
    return updatedState
  },

  async stopProjectorAuto(seasonId: string): Promise<ProjectorState> {
    const nowIso = new Date().toISOString()
    const current = await demoProjectorService.getProjectorState(seasonId)
    const updatedState: ProjectorState = {
      ...current,
      season_id: seasonId,
      mode: PROJECTOR_MODES.IDLE,
      auto_sport: null,
      auto_started_at: null,
      player_id: null,
      team_id: null,
      updated_at: nowIso
    }
    setLocal(STORAGE_KEYS.PROJECTOR, updatedState)
    notifyChange('projector_change', updatedState)
    return updatedState
  },

  subscribeToProjector(
    seasonId: string,
    callback: (state: ProjectorState) => void
  ): () => void {
    const handleBroadcast = (e: MessageEvent) => {
      if (e.data?.event === 'projector_change') {
        const state = getLocal<ProjectorState>(
          STORAGE_KEYS.PROJECTOR,
          defaultState(seasonId)
        )
        callback(state)
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.PROJECTOR && e.newValue) {
        try {
          callback(JSON.parse(e.newValue))
        } catch {
          // ignore parsing error
        }
      }
    }

    if (demoBroadcastChannel) demoBroadcastChannel.addEventListener('message', handleBroadcast)
    window.addEventListener('storage', handleStorage)

    demoProjectorService.getProjectorState(seasonId).then(callback).catch(() => {})

    return () => {
      if (demoBroadcastChannel) demoBroadcastChannel.removeEventListener('message', handleBroadcast)
      window.removeEventListener('storage', handleStorage)
    }
  }
}

const PROJECTOR_STATE_COLS =
  'season_id, mode, player_id, team_id, current_bid, sale_event_id, sale_player_id, sale_team_id, sale_price, sale_at, auto_sport, auto_filter, auto_interval_seconds, auto_started_at, broadcast_message, confetti_at, updated_at'

const supabaseProjectorService: ProjectorService = {
  async getProjectorState(seasonId: string): Promise<ProjectorState> {
    if (!supabase) return defaultState(seasonId)

    const { data, error } = await supabase
      .from('projector_state')
      .select(PROJECTOR_STATE_COLS)
      .eq('season_id', seasonId)
      .single()

    if (error || !data) {
      return defaultState(seasonId)
    }

    return data as ProjectorState
  },

  async setProjectorState(state: ProjectorState): Promise<ProjectorState> {
    if (!supabase) throw new AppError('Supabase not configured')

    const isAuto =
      state.mode === PROJECTOR_MODES.PLAYER_AUTO ||
      state.mode === PROJECTOR_MODES.ROSTER_AUTO
    const updatedState: ProjectorState = {
      ...state,
      auto_sport: isAuto ? state.auto_sport ?? null : null,
      auto_started_at: isAuto ? state.auto_started_at ?? null : null,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('projector_state')
      .upsert(updatedState)
      .select(PROJECTOR_STATE_COLS)
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as ProjectorState
  },

  async startProjectorAuto(params: StartProjectorAutoParams): Promise<ProjectorState> {
    if (!supabase) throw new AppError('Supabase not configured')

    const nowIso = new Date().toISOString()
    const payload = {
      season_id: params.seasonId,
      mode: params.mode,
      auto_sport: params.sport,
      auto_filter:
        params.mode === PROJECTOR_MODES.ROSTER_AUTO
          ? PROJECTOR_AUTO_FILTERS.ALL
          : params.filter || PROJECTOR_AUTO_FILTERS.ALL,
      auto_interval_seconds: clampIntervalSeconds(params.intervalSeconds),
      auto_started_at: nowIso,
      player_id: null,
      team_id: null,
      updated_at: nowIso
    }

    const { data, error } = await supabase
      .from('projector_state')
      .upsert(payload)
      .select(PROJECTOR_STATE_COLS)
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as ProjectorState
  },

  async stopProjectorAuto(seasonId: string): Promise<ProjectorState> {
    if (!supabase) throw new AppError('Supabase not configured')

    const nowIso = new Date().toISOString()
    const payload = {
      season_id: seasonId,
      mode: PROJECTOR_MODES.IDLE,
      auto_sport: null,
      auto_started_at: null,
      player_id: null,
      team_id: null,
      updated_at: nowIso
    }

    const { data, error } = await supabase
      .from('projector_state')
      .upsert(payload)
      .select(PROJECTOR_STATE_COLS)
      .single()

    if (error) throw new AppError(error.message, { original: error })
    return data as ProjectorState
  },

  subscribeToProjector(
    seasonId: string,
    callback: (state: ProjectorState) => void
  ): () => void {
    if (!supabase) return () => {}

    supabaseProjectorService.getProjectorState(seasonId).then(callback).catch(() => {})

    const sbChannel = supabase
      .channel(`projector_state_${seasonId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projector_state',
          filter: `season_id=eq.${seasonId}`
        },
        (payload) => {
          if (payload.new) {
            callback(payload.new as ProjectorState)
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          supabaseProjectorService.getProjectorState(seasonId).then(callback).catch(() => {})
        }
      })

    return () => {
      if (supabase) {
        supabase.removeChannel(sbChannel)
      }
    }
  }
}

export const projectorService: ProjectorService = isDemoMode
  ? demoProjectorService
  : supabaseProjectorService

export const getProjectorState = (seasonId: string) =>
  projectorService.getProjectorState(seasonId)
export const setProjectorState = (state: ProjectorState) =>
  projectorService.setProjectorState(state)
export const startProjectorAuto = (params: StartProjectorAutoParams) =>
  projectorService.startProjectorAuto(params)
export const stopProjectorAuto = (seasonId: string) =>
  projectorService.stopProjectorAuto(seasonId)
export const subscribeToProjector = (
  seasonId: string,
  callback: (state: ProjectorState) => void
) => projectorService.subscribeToProjector(seasonId, callback)

export const setBroadcastMessage = async (
  seasonId: string,
  message: string | null
): Promise<void> => {
  const normalized =
    typeof message === 'string' && message.trim().length > 0
      ? message.trim().slice(0, 200)
      : null

  if (isDemoMode) {
    const current = await demoProjectorService.getProjectorState(seasonId)
    const updatedState: ProjectorState = {
      ...current,
      season_id: seasonId,
      broadcast_message: normalized,
      updated_at: new Date().toISOString()
    }
    setLocal(STORAGE_KEYS.PROJECTOR, updatedState)
    notifyChange('projector_change', updatedState)
    return
  }

  if (!supabase) throw new AppError('Supabase not configured')

  const { error } = await supabase.rpc('set_broadcast_message', {
    p_season_id: seasonId,
    p_message: normalized
  })

  if (error) throw new AppError(error.message, { original: error })
}

export const triggerConfetti = async (seasonId: string): Promise<void> => {
  if (isDemoMode) {
    const nowIso = new Date().toISOString()
    const current = await demoProjectorService.getProjectorState(seasonId)
    const updatedState: ProjectorState = {
      ...current,
      season_id: seasonId,
      confetti_at: nowIso,
      updated_at: nowIso
    }
    setLocal(STORAGE_KEYS.PROJECTOR, updatedState)
    notifyChange('projector_change', updatedState)
    return
  }

  if (!supabase) throw new AppError('Supabase not configured')

  const { error } = await supabase.rpc('trigger_confetti', {
    p_season_id: seasonId
  })

  if (error) throw new AppError(error.message, { original: error })
}
