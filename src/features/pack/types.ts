import type { PublicPlayer } from '../../types'

export interface PackCardItem {
  player: PublicPlayer
  code: string
  photoSrc: string
  isPremium: boolean
}

export type PackStagePhase =
  | 'loading'
  | 'empty'
  | 'sealed'
  | 'opening'
  | 'stack'
  | 'suspense'
  | 'revealing'
  | 'revealed'
  | 'finale'

export type OpeningStep = 'idle' | 'anticipation' | 'tear' | 'release' | 'settle'

export const PACK_MAX_CARDS = 5

/** Single unified easing curve for the entire /pack experience */
export const PACK_EASE = [0.22, 1, 0.36, 1] as const

/** Opening choreography (~3.2s total): 800 + 700 + 900 + 800 */
export const OPENING_ANTICIPATION_MS = 800
export const OPENING_TEAR_MS = 700
export const OPENING_RELEASE_MS = 900
export const OPENING_SETTLE_MS = 800
export const OPENING_TOTAL_MS =
  OPENING_ANTICIPATION_MS + OPENING_TEAR_MS + OPENING_RELEASE_MS + OPENING_SETTLE_MS

/** Reveal timings */
export const STANDARD_FLIP_MS = 900
export const PREMIUM_ANTICIPATION_MS = 900
export const PREMIUM_FLIP_MS = 1300
export const PREMIUM_FOIL_FADE_MS = 700
export const CARD_SETTLE_MS = 320
