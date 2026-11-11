import { useEffect, useState } from 'react'
import { PROJECTOR_AUTO_FILTERS, PROJECTOR_AUTO_INTERVAL } from '../lib/constants'
import { parseAthleteCode } from '../lib/data'
import type { Player, Team } from '../types'

export interface AutoSlideshowResult<T> {
  currentIndex: number
  currentItem: T | null
  total: number
}

/**
 * Filters and sorts players for `player_auto`:
 * - Sport matches `sport` case-insensitively
 * - Status matches `filter` ('all' means no status filter)
 * - Sorted ascending by athlete_code
 */
export function getAutoSlideshowPlayers(
  players: readonly Player[],
  sport?: string | null,
  filter?: string | null
): Player[] {
  const sportNorm = (sport || '').trim().toLowerCase()
  if (!sportNorm) return []

  const filterNorm = (filter || PROJECTOR_AUTO_FILTERS.ALL).trim().toLowerCase()

  return players
    .filter((p) => {
      if ((p.sport || '').trim().toLowerCase() !== sportNorm) return false
      if (filterNorm !== PROJECTOR_AUTO_FILTERS.ALL && p.status !== filterNorm) {
        return false
      }
      return true
    })
    .slice()
    .sort((a, b) => {
      const codeA = a.athlete_code ?? parseAthleteCode(a.player_code) ?? 0
      const codeB = b.athlete_code ?? parseAthleteCode(b.player_code) ?? 0
      if (codeA !== codeB) return codeA - codeB
      return a.id.localeCompare(b.id)
    })
}

/**
 * Filters and sorts teams for `roster_auto`:
 * - Sport matches `sport` case-insensitively
 * - Sorted ascending by name
 */
export function getAutoSlideshowTeams(
  teams: readonly Team[],
  sport?: string | null
): Team[] {
  const sportNorm = (sport || '').trim().toLowerCase()
  if (!sportNorm) return []

  return teams
    .filter((t) => (t.sport || '').trim().toLowerCase() === sportNorm)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/**
 * Deterministic time-aligned slideshow hook shared by ProjectorPage and AdminProjectorControl.
 * - Current slide index = floor((Date.now() - auto_started_at) / (auto_interval_seconds * 1000)) mod items.length
 * - Schedules next change via timeout aligned to the next slide boundary (no drift)
 * - Runs no timers when items.length <= 1 or startedAt is null/empty
 */
export function useAutoSlideshow<T>(
  items: readonly T[],
  intervalSeconds: number | null | undefined,
  startedAt: string | null | undefined
): AutoSlideshowResult<T> {
  const [, setTick] = useState(0)

  const total = items.length
  const safeIntervalSec = Math.min(
    PROJECTOR_AUTO_INTERVAL.MAX,
    Math.max(
      PROJECTOR_AUTO_INTERVAL.MIN,
      Math.round(Number(intervalSeconds) || PROJECTOR_AUTO_INTERVAL.DEFAULT)
    )
  )
  const intervalMs = safeIntervalSec * 1000
  const parsedStartMs = startedAt ? new Date(startedAt).getTime() : NaN
  const hasValidStart = Number.isFinite(parsedStartMs) && parsedStartMs > 0

  useEffect(() => {
    // Do not run any timers when empty, single item, or not in an active auto mode (startedAt null)
    if (total <= 1 || !hasValidStart) {
      return
    }

    let timerId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const scheduleNextBoundary = () => {
      if (cancelled) return
      const now = Date.now()
      const elapsedMs = Math.max(0, now - parsedStartMs)
      const currentStep = Math.floor(elapsedMs / intervalMs)
      const nextBoundaryMs = parsedStartMs + (currentStep + 1) * intervalMs
      const delayMs = Math.max(20, nextBoundaryMs - now)

      timerId = setTimeout(() => {
        if (cancelled) return
        setTick((t) => t + 1)
        scheduleNextBoundary()
      }, delayMs)
    }

    scheduleNextBoundary()

    return () => {
      cancelled = true
      if (timerId !== null) {
        clearTimeout(timerId)
      }
    }
  }, [total, intervalMs, hasValidStart, parsedStartMs])

  if (total === 0) {
    return {
      currentIndex: 0,
      currentItem: null,
      total: 0
    }
  }

  if (total === 1 || !hasValidStart) {
    return {
      currentIndex: 0,
      currentItem: items[0],
      total
    }
  }

  const elapsedMs = Math.max(0, Date.now() - parsedStartMs)
  const step = Math.floor(elapsedMs / intervalMs)
  const currentIndex = ((step % total) + total) % total

  return {
    currentIndex,
    currentItem: items[currentIndex] ?? items[0],
    total
  }
}
