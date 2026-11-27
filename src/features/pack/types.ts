import type { PublicPlayer } from '../../types'

export interface PackCardItem {
  player: PublicPlayer
  code: string
  photoSrc: string
  isPremium: boolean
}

export type PackPhase =
  | 'loading'
  | 'empty'
  | 'idle'
  | 'charging'
  | 'tearing'
  | 'emerging'
  | 'stack'
  | 'reveal'
  | 'finale'
  | 'resetting'

export type RevealSubPhase = 'anticipation' | 'flipping' | 'settled'

export interface PackMachineSnapshot {
  phase: PackPhase
  revealIndex: number
  revealSubPhase: RevealSubPhase
  revealedCount: number
}

/** Shared live motion state read by rAF loops without per-frame React re-renders. */
export interface PackLiveMotion {
  phase: PackPhase
  revealIndex: number
  revealSubPhase: RevealSubPhase
  /** 0..1 continuous charge level along the top seam (relaxes smoothly on early release). */
  charge: number
  /** 0..1 progressive left-to-right tear progress. */
  tear: number
  /** 0..1 emerge sequence progress (cards slide up 40% while pack sinks & fades). */
  emerge: number
  /** Seconds elapsed inside the current phase or reveal sub-phase. */
  phaseElapsedSec: number
  /** 0..1 single-origin perimeter diffraction trace during premium anticipation. */
  premiumEdgeTrace: number
  /** 0..1 stage camera dolly-in & vignette deepen factor (4% dolly on premium anticipation). */
  stageFocus: number
  /** 0..1 reset collapse progress when R resets an open pack back to a stack. */
  resetCollapse: number
}

export const PACK_MAX_CARDS = 5

/** Single shared easing curve across the entire /pack experience */
export const PACK_EASE = [0.22, 1, 0.36, 1] as const

/** Opening & charging choreography durations (ms) */
export const CHARGE_DURATION_MS = 1050
export const CHARGE_RELAX_MS = 380
export const QUICK_TAP_MAX_MS = 210
export const TEAR_DURATION_MS = 820
export const EMERGE_DURATION_MS = 1150

/** Reveal choreography durations (ms) */
export const STANDARD_REVEAL_MS = 900
export const PREMIUM_ANTICIPATION_MS = 900
export const PREMIUM_FLIP_MS = 1300
export const PREMIUM_BLOOM_MS = 700

/** Finale & reset durations (ms) */
export const FINALE_SETTLE_MS = 920
export const RESET_COLLAPSE_MS = 520
