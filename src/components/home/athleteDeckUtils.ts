import { formatAthleteCode } from '../../lib/data/client'
import type { PublicPlayer } from '../../types'

export interface CardPose {
  x: number
  y: number
  rotate: number
  scale: number
  opacity: number
  zIndex: number
}

export interface StackEdgePose {
  x: number
  y: number
  opacity: number
}

export const MAX_HAND_SIZE = 5

// Closed deck decorative stack edges behind the top card (nearest to deepest, ~3px right and 4px down per layer)
export const CLOSED_STACK_EDGES: readonly StackEdgePose[] = [
  { x: 3, y: 4, opacity: 0.88 },
  { x: 6, y: 8, opacity: 0.72 },
  { x: 9, y: 12, opacity: 0.54 }
]

// Module-level session memory: resets on browser refresh, never reshuffles on in-app navigation
let chosenPlayerCodes: string[] | null = null
let chosenSeasonId: string | null = null
let cachedHandPlayers: PublicPlayer[] | null = null

export function getDeckSessionState(): {
  players: PublicPlayer[] | null
  seasonId: string | null
} {
  return {
    players: cachedHandPlayers,
    seasonId: chosenSeasonId
  }
}

export function setDeckEmpty(): void {
  chosenPlayerCodes = []
  chosenSeasonId = null
  cachedHandPlayers = []
}

export function getNormalizedCode(player: PublicPlayer): string {
  return formatAthleteCode(player.athlete_code ?? player.player_code)
}

function fisherYatesSample<T>(items: T[], count: number): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy.slice(0, count)
}

export function resolveHandForPageLoad(allPlayers: PublicPlayer[], seasonId: string): PublicPlayer[] {
  const byCode = new Map<string, PublicPlayer>()
  for (const player of allPlayers) {
    const code = getNormalizedCode(player)
    if (code && !byCode.has(code)) byCode.set(code, player)
  }

  if (chosenPlayerCodes === null) {
    const picked = fisherYatesSample(Array.from(byCode.values()), MAX_HAND_SIZE)
    chosenPlayerCodes = picked.map(getNormalizedCode)
    chosenSeasonId = seasonId
    cachedHandPlayers = picked
    return picked
  }

  const preserved: PublicPlayer[] = []
  for (const code of chosenPlayerCodes) {
    const match = byCode.get(code)
    if (match) preserved.push(match)
  }
  cachedHandPlayers = preserved
  return preserved
}

export function reshuffleHand(
  allPlayers: PublicPlayer[],
  seasonId: string,
  excludeCodes: string[]
): PublicPlayer[] {
  const byCode = new Map<string, PublicPlayer>()
  for (const player of allPlayers) {
    const code = getNormalizedCode(player)
    if (code && !byCode.has(code)) byCode.set(code, player)
  }

  const excluded = new Set(excludeCodes.filter(Boolean))
  const fresh: PublicPlayer[] = []
  const fallback: PublicPlayer[] = []
  for (const [code, player] of byCode.entries()) {
    if (excluded.has(code)) fallback.push(player)
    else fresh.push(player)
  }

  const picked =
    fresh.length >= MAX_HAND_SIZE
      ? fisherYatesSample(fresh, MAX_HAND_SIZE)
      : fisherYatesSample(
          [...fresh, ...fisherYatesSample(fallback, MAX_HAND_SIZE - fresh.length)],
          MAX_HAND_SIZE
        )

  chosenPlayerCodes = picked.map(getNormalizedCode)
  chosenSeasonId = seasonId
  cachedHandPlayers = picked
  return picked
}

export function getRelativeFanOffset(index: number, activeIndex: number, count: number): number {
  if (count <= 1) return 0
  let diff = (index - activeIndex + count) % count
  if (diff > Math.floor(count / 2)) diff -= count
  return diff
}

export function getStackStartPose(idx: number): { x: number; y: number; rotate: number; scale: number; opacity: number } {
  if (idx === 0) return { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }
  const edge = CLOSED_STACK_EDGES[Math.min(idx - 1, CLOSED_STACK_EDGES.length - 1)]
  return { x: edge.x, y: edge.y, rotate: 0, scale: 1, opacity: 1 }
}

export function getFanPose(rel: number, spacing: number): CardPose {
  const absRel = Math.abs(rel)
  return {
    x: rel * spacing,
    y: absRel === 0 ? -14 : absRel === 1 ? 6 : 30,
    rotate: rel * 7,
    scale: absRel === 0 ? 1 : absRel === 1 ? 0.93 : 0.86,
    opacity: absRel === 0 ? 1 : absRel === 1 ? 0.96 : 0.88,
    zIndex: 30 - absRel * 8
  }
}

export function getPhonePose(stackPos: number, dismissDir: number): CardPose {
  const isTop = stackPos === 0
  const visible = stackPos <= 2
  if (isTop && dismissDir !== 0) {
    return { x: dismissDir * 300, y: -6, rotate: dismissDir * 14, scale: 1, opacity: 0, zIndex: 30 }
  }
  return {
    x: stackPos === 1 ? 12 : stackPos === 2 ? -10 : 0,
    y: isTop ? -6 : stackPos === 1 ? 10 : stackPos === 2 ? 22 : 26,
    rotate: stackPos === 1 ? 3 : stackPos === 2 ? -3 : 0,
    scale: isTop ? 1 : stackPos === 1 ? 0.94 : stackPos === 2 ? 0.88 : 0.84,
    opacity: !visible ? 0 : isTop ? 1 : stackPos === 1 ? 0.94 : 0.84,
    zIndex: isTop ? 30 : stackPos === 1 ? 20 : stackPos === 2 ? 10 : 1
  }
}
