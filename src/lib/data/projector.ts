import type { ProjectorState } from '../../types'
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
import type { ProjectorService } from './types'

const defaultState = (seasonId: string): ProjectorState => ({
  season_id: seasonId,
  mode: 'idle',
  player_id: null,
  team_id: null,
  updated_at: new Date().toISOString()
})

const demoProjectorService: ProjectorService = {
  async getProjectorState(seasonId: string): Promise<ProjectorState> {
    const state = getLocal<ProjectorState>(
      STORAGE_KEYS.PROJECTOR,
      defaultState(seasonId)
    )
    return state.season_id === seasonId ? state : { ...state, season_id: seasonId }
  },

  async setProjectorState(state: ProjectorState): Promise<ProjectorState> {
    const updatedState: ProjectorState = {
      ...state,
      updated_at: new Date().toISOString()
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

const supabaseProjectorService: ProjectorService = {
  async getProjectorState(seasonId: string): Promise<ProjectorState> {
    if (!supabase) return defaultState(seasonId)

    const { data, error } = await supabase
      .from('projector_state')
      .select('*')
      .eq('season_id', seasonId)
      .single()

    if (error || !data) {
      return defaultState(seasonId)
    }

    return data as ProjectorState
  },

  async setProjectorState(state: ProjectorState): Promise<ProjectorState> {
    if (!supabase) throw new AppError('Supabase not configured')

    const updatedState: ProjectorState = {
      ...state,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('projector_state')
      .upsert(updatedState)
      .select()
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
export const subscribeToProjector = (
  seasonId: string,
  callback: (state: ProjectorState) => void
) => projectorService.subscribeToProjector(seasonId, callback)
