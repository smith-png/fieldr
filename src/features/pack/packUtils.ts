import { formatAthleteCode } from '../../lib/data/client'
import type { PublicPlayer } from '../../types'
import { PACK_MAX_CARDS, type PackCardItem } from './types'

const IMAGE_PRELOAD_TIMEOUT_MS = 4000
const DEMO_PREMIUM_COUNT = 2
const PREMIUM_SELECTION_WEIGHT = 3

const premiumPlayerIdSet = new Set<string>()

/** Set of player IDs that receive the premium pearlescent graphite treatment (empty by default). */
export const PREMIUM_PLAYER_IDS: ReadonlySet<string> = premiumPlayerIdSet

export function setPremiumPlayerIds(ids: readonly string[]): void {
  premiumPlayerIdSet.clear()
  for (const id of ids) {
    if (id) premiumPlayerIdSet.add(id)
  }
}

export function isPremiumPlayer(playerId: string): boolean {
  return premiumPlayerIdSet.has(playerId)
}

export function isDemoPremiumEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('demoPremium') === '1'
  } catch {
    return false
  }
}

function getNormalizedPlayerCode(player: PublicPlayer): string {
  const raw = player.player_code || player.athlete_code
  if (raw === undefined || raw === null || raw === '') return ''
  return formatAthleteCode(raw)
}

function fisherYatesShuffle<T>(items: readonly T[]): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

export interface BuildPackOptions {
  demoPremium?: boolean
  seenPremiumIds?: Set<string>
}

export function buildPackCards(
  allPlayers: readonly PublicPlayer[],
  options: BuildPackOptions = {}
): PackCardItem[] {
  const demoPremium = options.demoPremium ?? isDemoPremiumEnabled()

  const byCode = new Map<string, PublicPlayer>()
  for (const player of allPlayers) {
    const code = getNormalizedPlayerCode(player)
    if (code && !byCode.has(code)) {
      byCode.set(code, player)
    }
  }

  const pool = Array.from(byCode.entries())
  if (pool.length === 0) return []

  const targetCount = Math.min(PACK_MAX_CARDS, pool.length)

  if (demoPremium) {
    const sampled = fisherYatesShuffle(pool).slice(0, targetCount)
    const demoIndices = new Set<number>()
    const indices = fisherYatesShuffle(sampled.map((_, i) => i))
    for (const idx of indices.slice(0, Math.min(DEMO_PREMIUM_COUNT, sampled.length))) {
      demoIndices.add(idx)
    }

    const items: PackCardItem[] = sampled.map(([code, player], idx) => ({
      player,
      code,
      photoSrc: player.photo_url || '',
      isPremium: demoIndices.has(idx)
    }))

    const standardCards = items.filter((card) => !card.isPremium)
    const premiumCards = items.filter((card) => card.isPremium)
    return [...standardCards, ...premiumCards]
  }

  const poolPremiumIds = pool
    .filter(([, player]) => isPremiumPlayer(player.id))
    .map(([, player]) => player.id)

  // If no premium athletes exist for this season, draw uniformly and every card is standard
  if (poolPremiumIds.length === 0) {
    const sampled = fisherYatesShuffle(pool).slice(0, targetCount)
    return sampled.map(([code, player]) => ({
      player,
      code,
      // Always use full-resolution photo_url (never thumbnail); empty string renders outlined F placeholder
      photoSrc: player.photo_url || '',
      isPremium: false
    }))
  }

  const seenPremiumIds = options.seenPremiumIds ?? new Set<string>()
  // Reset session cycle once every premium athlete in the season has appeared
  if (poolPremiumIds.every((id) => seenPremiumIds.has(id))) {
    seenPremiumIds.clear()
  }

  const remaining = pool.slice()
  const sampled: Array<[string, PublicPlayer]> = []

  while (sampled.length < targetCount && remaining.length > 0) {
    let totalWeight = 0
    const weights = remaining.map(([, player]) => {
      if (isPremiumPlayer(player.id)) {
        const w = seenPremiumIds.has(player.id) ? 0 : PREMIUM_SELECTION_WEIGHT
        totalWeight += w
        return w
      }
      totalWeight += 1
      return 1
    })

    // Edge case: tiny roster where all remaining undrawn players are already-seen premiums
    if (totalWeight === 0) {
      seenPremiumIds.clear()
      for (let i = 0; i < remaining.length; i++) {
        const w = isPremiumPlayer(remaining[i][1].id) ? PREMIUM_SELECTION_WEIGHT : 1
        weights[i] = w
        totalWeight += w
      }
    }

    let roll = Math.random() * totalWeight
    let chosenIdx = remaining.length - 1
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i]
      if (w <= 0) continue
      roll -= w
      if (roll <= 0) {
        chosenIdx = i
        break
      }
    }

    const [chosen] = remaining.splice(chosenIdx, 1)
    sampled.push(chosen)
    if (isPremiumPlayer(chosen[1].id)) {
      seenPremiumIds.add(chosen[1].id)
    }
  }

  const items: PackCardItem[] = sampled.map(([code, player]) => ({
    player,
    code,
    // Always use full-resolution photo_url (never thumbnail); empty string renders outlined F placeholder
    photoSrc: player.photo_url || '',
    isPremium: isPremiumPlayer(player.id)
  }))

  // Premium cards are always revealed LAST (standard cards first)
  const standardCards = items.filter((card) => !card.isPremium)
  const premiumCards = items.filter((card) => card.isPremium)
  return [...standardCards, ...premiumCards]
}

function preloadSingleImage(url: string): Promise<void> {
  if (!url || typeof Image === 'undefined') return Promise.resolve()

  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve()
    }

    const timer = window.setTimeout(finish, IMAGE_PRELOAD_TIMEOUT_MS)
    const img = new Image()
    img.referrerPolicy = 'no-referrer'
    img.onload = () => {
      if (typeof img.decode === 'function') {
        void img.decode().catch(() => undefined).finally(finish)
      } else {
        finish()
      }
    }
    img.onerror = finish
    img.src = url
  })
}

export async function preloadPackImages(cards: readonly PackCardItem[]): Promise<void> {
  await Promise.all(cards.map((card) => preloadSingleImage(card.photoSrc)))
}
