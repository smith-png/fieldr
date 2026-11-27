/**
 * Pure math & spring helpers for /pack 60fps rAF choreography.
 * Single shared easing curve: cubic-bezier(0.22, 1, 0.36, 1).
 */

const P1X = 0.22
const P1Y = 1.0
const P2X = 0.36
const P2Y = 1.0

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function sampleBezier(a1: number, a2: number, t: number): number {
  const inv = 1 - t
  return 3 * inv * inv * t * a1 + 3 * inv * t * t * a2 + t * t * t
}

function sampleBezierSlope(a1: number, a2: number, t: number): number {
  const inv = 1 - t
  return 3 * inv * inv * a1 + 6 * inv * t * (a2 - a1) + 3 * t * t * (1 - a2)
}

/** Exact evaluation of cubic-bezier(0.22, 1, 0.36, 1) for t in [0, 1]. */
export function easePack(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  let t = x
  for (let i = 0; i < 6; i++) {
    const err = sampleBezier(P1X, P2X, t) - x
    if (Math.abs(err) < 1e-5) break
    const slope = sampleBezierSlope(P1X, P2X, t)
    if (Math.abs(slope) < 1e-6) break
    t = clamp(t - err / slope, 0, 1)
  }

  return clamp(sampleBezier(P1Y, P2Y, t), 0, 1)
}

export interface Spring1D {
  value: number
  velocity: number
}

/** Semi-implicit Euler spring step for low-bounce weighty settling. */
export function stepSpring(
  spring: Spring1D,
  target: number,
  stiffness: number,
  damping: number,
  dt: number
): number {
  const accel = (target - spring.value) * stiffness - spring.velocity * damping
  spring.velocity += accel * dt
  spring.value += spring.velocity * dt
  return spring.value
}

const DISCARD_TILTS = [-4.2, 2.7, -2.1, 3.6, -1.6] as const
const DISCARD_OFFSET_X = [-5, 4, -2, 5, 0] as const
const DISCARD_OFFSET_Y = [4, -2, 3, -1, 2] as const

export function getDiscardPoseOffset(index: number): {
  tiltDeg: number
  dx: number
  dy: number
} {
  const i = ((index % DISCARD_TILTS.length) + DISCARD_TILTS.length) % DISCARD_TILTS.length
  return {
    tiltDeg: DISCARD_TILTS[i],
    dx: DISCARD_OFFSET_X[i],
    dy: DISCARD_OFFSET_Y[i]
  }
}
