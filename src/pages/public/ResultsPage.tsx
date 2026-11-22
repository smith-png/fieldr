import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_BTN_SECONDARY,
  PUBLIC_CARD,
  PUBLIC_COUNT_PILL,
  PUBLIC_ERROR_BANNER,
  PUBLIC_MAIN,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_SECTION_TITLE
} from '../../components/public/publicStyles'
import { SkeletonBlock, SkeletonText } from '../../components/ui'
import { formatAthleteCode } from '../../lib/data/client'
import { prefetchRoute } from '../../lib/queryCache'
import {
  usePublicResults,
  type PublicResultRow,
  type PublicResultStatus
} from '../../lib/resultsPoller'
import { formatPoints, getInitials } from '../../lib/utils'
import type { Season } from '../../types'

const FEED_PAGE_SIZE = 20
const SPORT_ORDER = ['Cricket', 'Futsal', 'Volleyball']

type StatusFilter = 'sold' | 'unsold' | 'available' | 'all'

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'sold', label: 'Sold' },
  { value: 'unsold', label: 'Unsold' },
  { value: 'available', label: 'Remaining' },
  { value: 'all', label: 'All' }
]

const DISALLOWED_CSS_COLORS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer'
])

function getValidTeamColor(color?: string | null): string | null {
  const clean = color?.trim()
  if (!clean) return null
  if (DISALLOWED_CSS_COLORS.has(clean.toLowerCase())) return null
  if (/[;{}<>]/.test(clean)) return null
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', clean) ? clean : null
  }
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)
    ? clean
    : null
}

function parseStatusParam(raw: string | null): StatusFilter {
  const value = (raw || '').trim().toLowerCase()
  if (value === 'sold' || value === 'unsold' || value === 'available' || value === 'all') {
    return value
  }
  if (value === 'remaining') return 'available'
  return 'sold'
}

function formatElapsedClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatTimeAgo(iso: string | null, nowMs: number): string {
  if (!iso) return ''
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return ''
  const diffSeconds = Math.max(0, Math.floor((nowMs - ts) / 1000))
  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function sortSportsList(sports: string[]): string[] {
  return [...sports].sort((a, b) => {
    const ia = SPORT_ORDER.findIndex((s) => s.toLowerCase() === a.toLowerCase())
    const ib = SPORT_ORDER.findIndex((s) => s.toLowerCase() === b.toLowerCase())
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a.localeCompare(b)
  })
}

const ResultThumbnail: React.FC<{
  src: string | null
  name: string
}> = ({ src, name }) => {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return (
      <div
        aria-hidden="true"
        className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 font-syne font-bold text-xs text-muted select-none"
      >
        {getInitials(name) || '?'}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="w-12 h-12 rounded-xl object-cover object-top bg-surface-2 border border-border shrink-0"
    />
  )
}

const ResultsLoadingSkeleton: React.FC = () => (
  <div aria-hidden="true" className="space-y-8">
    {/* Summary stat tiles (reserved height matches loaded cards) */}
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[88px] rounded-2xl bg-surface border border-border p-4 sm:p-5 flex flex-col justify-between"
        >
          <SkeletonText width="w-16" className="h-3" />
          <SkeletonBlock className="w-14 h-7 rounded-lg" />
        </div>
      ))}
    </div>

    {/* Per-sport progress card (reserved height) */}
    <div className={`${PUBLIC_CARD} min-h-[196px] space-y-4`}>
      <SkeletonBlock className="w-36 h-5 rounded-lg" />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <SkeletonText width="w-24" className="h-3.5" />
              <SkeletonText width="w-40" className="h-3" />
            </div>
            <SkeletonBlock className="w-full h-2 rounded-full" />
          </div>
        ))}
      </div>
    </div>

    {/* Filters bar (reserved height) */}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-h-[44px]">
      <SkeletonBlock className="h-[44px] rounded-2xl" />
      <SkeletonBlock className="h-[44px] rounded-2xl" />
      <SkeletonBlock className="h-[44px] rounded-2xl" />
    </div>

    {/* Feed rows (reserved height 76px per row) */}
    <div className="space-y-2.5">
      <div className="flex items-center justify-between pb-1">
        <SkeletonBlock className="w-32 h-6 rounded-lg" />
        <SkeletonBlock className="w-10 h-7 rounded-full" />
      </div>
      {Array.from({ length: 8 }).map((_, idx) => (
        <div
          key={idx}
          className="h-[76px] px-4 rounded-2xl bg-surface border border-border flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <SkeletonBlock className="w-12 h-12 rounded-xl shrink-0" />
            <div className="space-y-2 flex-1 min-w-0">
              <SkeletonText width="w-36" className="h-4" />
              <SkeletonText width="w-24" className="h-3" />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <SkeletonBlock className="hidden sm:block w-24 h-6 rounded-full" />
            <div className="space-y-1.5 flex flex-col items-end">
              <SkeletonBlock className="w-16 h-4 rounded-md" />
              <SkeletonText width="w-12" className="h-2.5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
)

export const ResultsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const results = usePublicResults()

  // Live 1-second ticker for "Updated 0:12 ago" and relative sale times (paused while hidden)
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const startTick = () => {
      if (intervalId !== null) return
      setNowMs(Date.now())
      intervalId = setInterval(() => {
        setNowMs(Date.now())
      }, 1000)
    }

    const stopTick = () => {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stopTick()
      } else {
        startTick()
      }
    }

    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
      startTick()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      stopTick()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [])

  // URL-synced filters
  const rawSportParam = (searchParams.get('sport') || '').trim()
  const rawTeamParam = (searchParams.get('team') || '').trim()
  const selectedStatus = parseStatusParam(searchParams.get('status'))

  const availableSports = useMemo(() => {
    const set = new Set<string>()
    for (const row of results.rows) {
      if (row.sport) set.add(row.sport)
    }
    return sortSportsList(Array.from(set))
  }, [results.rows])

  const selectedSport = useMemo(() => {
    if (!rawSportParam || rawSportParam.toLowerCase() === 'all') return 'all'
    const matched = availableSports.find(
      (s) => s.toLowerCase() === rawSportParam.toLowerCase()
    )
    return matched || rawSportParam
  }, [rawSportParam, availableSports])

  const availableTeams = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const row of results.rows) {
      if (!row.team_name) continue
      if (
        selectedSport !== 'all' &&
        row.sport.toLowerCase() !== selectedSport.toLowerCase()
      ) {
        continue
      }
      if (!map.has(row.team_name)) {
        map.set(row.team_name, row.team_color)
      }
    }
    return Array.from(map.entries())
      .map(([name, color]) => ({ name, color }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [results.rows, selectedSport])

  const selectedTeam = useMemo(() => {
    if (!rawTeamParam || rawTeamParam.toLowerCase() === 'all') return 'all'
    const matched = availableTeams.find(
      (t) => t.name.toLowerCase() === rawTeamParam.toLowerCase()
    )
    return matched ? matched.name : rawTeamParam
  }, [rawTeamParam, availableTeams])

  const updateFilters = useCallback(
    (patch: { sport?: string; team?: string; status?: StatusFilter }) => {
      const nextSport = patch.sport !== undefined ? patch.sport : selectedSport
      let nextTeam = patch.team !== undefined ? patch.team : selectedTeam
      let nextStatus = patch.status !== undefined ? patch.status : selectedStatus

      // Clear team if switching sport makes it invalid
      if (patch.sport !== undefined && patch.team === undefined && nextTeam !== 'all') {
        const teamStillValid = results.rows.some(
          (r) =>
            r.team_name &&
            r.team_name.toLowerCase() === nextTeam.toLowerCase() &&
            (nextSport === 'all' || r.sport.toLowerCase() === nextSport.toLowerCase())
        )
        if (!teamStillValid) {
          nextTeam = 'all'
        }
      }

      // If filtering by a specific team while on unsold/remaining, switch to sold
      if (
        patch.team !== undefined &&
        nextTeam !== 'all' &&
        (nextStatus === 'unsold' || nextStatus === 'available')
      ) {
        nextStatus = 'sold'
      }

      // If switching to unsold/remaining, clear team filter
      if (
        patch.status !== undefined &&
        (nextStatus === 'unsold' || nextStatus === 'available')
      ) {
        nextTeam = 'all'
      }

      const nextParams = new URLSearchParams()
      if (nextSport && nextSport !== 'all') nextParams.set('sport', nextSport)
      if (nextTeam && nextTeam !== 'all') nextParams.set('team', nextTeam)
      if (nextStatus !== 'sold') nextParams.set('status', nextStatus)

      setVisibleCount(FEED_PAGE_SIZE)
      setSearchParams(nextParams, { replace: true })
    },
    [selectedSport, selectedTeam, selectedStatus, results.rows, setSearchParams]
  )

  const clearFilters = useCallback(() => {
    setVisibleCount(FEED_PAGE_SIZE)
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  // Summary counts & per-sport progress
  const summary = useMemo(() => {
    let sold = 0
    let unsold = 0
    let remaining = 0
    const bySport = new Map<
      string,
      { sport: string; sold: number; unsold: number; remaining: number; total: number }
    >()

    for (const row of results.rows) {
      const sportKey = row.sport || 'Other'
      let entry = bySport.get(sportKey)
      if (!entry) {
        entry = { sport: sportKey, sold: 0, unsold: 0, remaining: 0, total: 0 }
        bySport.set(sportKey, entry)
      }
      entry.total += 1
      if (row.status === 'sold') {
        sold += 1
        entry.sold += 1
      } else if (row.status === 'unsold') {
        unsold += 1
        entry.unsold += 1
      } else {
        remaining += 1
        entry.remaining += 1
      }
    }

    const orderedSports = sortSportsList(Array.from(bySport.keys())).map(
      (key) => bySport.get(key)!
    )

    return {
      sold,
      unsold,
      remaining,
      total: results.rows.length,
      perSport: orderedSports
    }
  }, [results.rows])

  // Filtered & sorted feed rows (newest sold first)
  const filteredRows = useMemo(() => {
    const statusRank: Record<PublicResultStatus, number> = {
      sold: 0,
      unsold: 1,
      available: 2
    }

    const matched = results.rows.filter((row) => {
      if (
        selectedSport !== 'all' &&
        row.sport.toLowerCase() !== selectedSport.toLowerCase()
      ) {
        return false
      }
      if (selectedTeam !== 'all') {
        if (!row.team_name || row.team_name.toLowerCase() !== selectedTeam.toLowerCase()) {
          return false
        }
      }
      if (selectedStatus !== 'all' && row.status !== selectedStatus) {
        return false
      }
      return true
    })

    return matched.sort((a, b) => {
      if (selectedStatus === 'all' && a.status !== b.status) {
        return statusRank[a.status] - statusRank[b.status]
      }
      if (a.status === 'sold' && b.status === 'sold') {
        const ta = a.sold_at ? Date.parse(a.sold_at) : 0
        const tb = b.sold_at ? Date.parse(b.sold_at) : 0
        if (tb !== ta) return tb - ta
      }
      return a.athlete_code - b.athlete_code
    })
  }, [results.rows, selectedSport, selectedTeam, selectedStatus])

  // Keep visibleCount bounded if filter shrinks list
  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE)
  }, [selectedSport, selectedTeam, selectedStatus])

  const visibleRows = useMemo(
    () => filteredRows.slice(0, visibleCount),
    [filteredRows, visibleCount]
  )
  const hasMore = visibleCount < filteredRows.length

  // Infinite scroll: load 20 more as user scrolls near sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => Math.min(prev + FEED_PAGE_SIZE, filteredRows.length))
        }
      },
      { rootMargin: '240px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, filteredRows.length])

  const hasActiveFilters =
    selectedSport !== 'all' || selectedTeam !== 'all' || selectedStatus !== 'sold'

  const auctionHasNotBegun =
    !results.isLoading &&
    !results.error &&
    summary.sold === 0 &&
    summary.unsold === 0

  const navSeason: Season | null = results.seasonId
    ? {
        id: results.seasonId,
        name: results.seasonName || '',
        is_active: true,
        created_at: ''
      }
    : null

  const feedTitle =
    selectedStatus === 'sold'
      ? 'Sold so far'
      : selectedStatus === 'unsold'
      ? 'Unsold'
      : selectedStatus === 'available'
      ? 'Remaining'
      : 'All players'

  const updatedLabel =
    results.lastCheckedAt !== null
      ? `Updated ${formatElapsedClock(nowMs - results.lastCheckedAt)} ago`
      : null

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={navSeason}
      />

      <main className={PUBLIC_MAIN}>
        {/* Page Header */}
        <header className={PUBLIC_PAGE_HEADER}>
          <div className="min-w-0 space-y-1.5">
            <h1 className={PUBLIC_PAGE_TITLE}>Results</h1>
            <div className="min-h-[20px] flex items-center">
              {results.isLoading ? (
                <SkeletonText width="w-44" className="h-3.5" />
              ) : results.seasonName ? (
                <p className="text-sm text-muted truncate">{results.seasonName}</p>
              ) : (
                <p className="text-sm text-muted">Active tournament auction</p>
              )}
            </div>
          </div>

          <div className="min-h-[24px] flex items-center sm:justify-end shrink-0">
            {results.isLoading && !updatedLabel ? (
              <SkeletonBlock className="w-32 h-5 rounded-md" />
            ) : updatedLabel ? (
              <span className="font-mono text-xs tabular-nums text-muted">
                {updatedLabel}
              </span>
            ) : null}
          </div>
        </header>

        {results.error && (
          <div className={`${PUBLIC_ERROR_BANNER} mb-6`} role="alert">
            <span>{results.error}</span>
          </div>
        )}

        {results.isLoading ? (
          <ResultsLoadingSkeleton />
        ) : auctionHasNotBegun && !hasActiveFilters ? (
          <div className="space-y-8">
            {summary.total > 0 && (
              <section aria-label="Auction summary" className="space-y-4">
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <div className="min-h-[88px] rounded-2xl bg-surface border border-border p-4 sm:p-5 flex flex-col justify-between">
                    <span className="text-xs font-medium text-muted">Sold</span>
                    <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                      0
                    </span>
                  </div>
                  <div className="min-h-[88px] rounded-2xl bg-surface border border-border p-4 sm:p-5 flex flex-col justify-between">
                    <span className="text-xs font-medium text-muted">Unsold</span>
                    <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                      0
                    </span>
                  </div>
                  <div className="min-h-[88px] rounded-2xl bg-surface border border-border p-4 sm:p-5 flex flex-col justify-between">
                    <span className="text-xs font-medium text-muted">Remaining</span>
                    <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                      {summary.remaining}
                    </span>
                  </div>
                </div>
              </section>
            )}

            <section className={`${PUBLIC_CARD} py-16 text-center`}>
              <p className="text-sm sm:text-base text-muted">
                Results will appear here once the auction begins.
              </p>
            </section>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Summary Counts & Sport Progress Bars */}
            <section aria-label="Auction progress summary" className="space-y-4">
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div className="min-h-[88px] rounded-2xl bg-surface border border-border p-4 sm:p-5 flex flex-col justify-between">
                  <span className="text-xs font-medium text-muted">Sold</span>
                  <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-accent-bright">
                    {summary.sold}
                  </span>
                </div>
                <div className="min-h-[88px] rounded-2xl bg-surface border border-border p-4 sm:p-5 flex flex-col justify-between">
                  <span className="text-xs font-medium text-muted">Unsold</span>
                  <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                    {summary.unsold}
                  </span>
                </div>
                <div className="min-h-[88px] rounded-2xl bg-surface border border-border p-4 sm:p-5 flex flex-col justify-between">
                  <span className="text-xs font-medium text-muted">Remaining</span>
                  <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                    {summary.remaining}
                  </span>
                </div>
              </div>

              {summary.perSport.length > 0 && (
                <div className={`${PUBLIC_CARD} space-y-5`}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className={PUBLIC_SECTION_TITLE}>Progress by sport</h2>
                    <span className="font-mono text-xs tabular-nums text-muted">
                      {summary.sold + summary.unsold} / {summary.total} decided
                    </span>
                  </div>

                  <div className="space-y-4">
                    {summary.perSport.map((sp) => {
                      const soldPct = sp.total > 0 ? (sp.sold / sp.total) * 100 : 0
                      const unsoldPct = sp.total > 0 ? (sp.unsold / sp.total) * 100 : 0

                      return (
                        <div key={sp.sport} className="space-y-2">
                          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                            <span className="font-syne font-bold text-sm text-text">
                              {sp.sport}
                            </span>
                            <div className="flex items-center gap-3 font-mono tabular-nums text-muted">
                              <span className="text-accent-bright font-medium">
                                {sp.sold} sold
                              </span>
                              <span>{sp.unsold} unsold</span>
                              <span>{sp.remaining} left</span>
                            </div>
                          </div>

                          <div
                            role="progressbar"
                            aria-label={`${sp.sport}: ${sp.sold} sold, ${sp.unsold} unsold, ${sp.remaining} remaining`}
                            aria-valuenow={sp.sold + sp.unsold}
                            aria-valuemin={0}
                            aria-valuemax={sp.total}
                            className="w-full h-2 rounded-full bg-surface-2 overflow-hidden flex"
                          >
                            {soldPct > 0 && (
                              <div
                                className="h-full bg-accent-bright transition-[width] duration-300"
                                style={{ width: `${soldPct}%` }}
                              />
                            )}
                            {unsoldPct > 0 && (
                              <div
                                className="h-full bg-muted/45 transition-[width] duration-300"
                                style={{ width: `${unsoldPct}%` }}
                              />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* URL-synced Filters */}
            <section aria-label="Filter results" className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label
                    htmlFor="results-filter-sport"
                    className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
                  >
                    Sport
                  </label>
                  <select
                    id="results-filter-sport"
                    value={selectedSport}
                    onChange={(e) => updateFilters({ sport: e.target.value })}
                    className="w-full min-h-[44px] bg-surface border border-border rounded-2xl px-3.5 py-2.5 text-sm text-text focus:outline-none focus:border-accent-bright"
                  >
                    <option value="all">All sports</option>
                    {availableSports.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="results-filter-team"
                    className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
                  >
                    Team
                  </label>
                  <select
                    id="results-filter-team"
                    value={selectedTeam}
                    onChange={(e) => updateFilters({ team: e.target.value })}
                    disabled={availableTeams.length === 0}
                    className="w-full min-h-[44px] bg-surface border border-border rounded-2xl px-3.5 py-2.5 text-sm text-text focus:outline-none focus:border-accent-bright disabled:opacity-50"
                  >
                    <option value="all">All teams</option>
                    {availableTeams.map((team) => (
                      <option key={team.name} value={team.name}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="results-filter-status"
                    className="block text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
                  >
                    Status
                  </label>
                  <select
                    id="results-filter-status"
                    value={selectedStatus}
                    onChange={(e) =>
                      updateFilters({ status: e.target.value as StatusFilter })
                    }
                    className="w-full min-h-[44px] bg-surface border border-border rounded-2xl px-3.5 py-2.5 text-sm text-text focus:outline-none focus:border-accent-bright"
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="text-xs font-medium text-muted hover:text-text transition-colors cursor-pointer"
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </section>

            {/* Sold So Far / Results Feed */}
            <section aria-label={feedTitle} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className={PUBLIC_SECTION_TITLE}>{feedTitle}</h2>
                <span className={PUBLIC_COUNT_PILL}>{filteredRows.length}</span>
              </div>

              {filteredRows.length === 0 ? (
                <div className={`${PUBLIC_CARD} py-12 text-center space-y-3`}>
                  <p className="text-sm text-muted">
                    {summary.sold === 0 && summary.unsold === 0
                      ? 'Results will appear here once the auction begins.'
                      : 'No players match the selected filters.'}
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className={`${PUBLIC_BTN_SECONDARY} h-9 px-4 text-xs`}
                    >
                      Reset filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visibleRows.map((row: PublicResultRow) => {
                    const code = formatAthleteCode(row.athlete_code)
                    const profilePath = `/players/${code}`
                    const validTeamColor = getValidTeamColor(row.team_color)
                    const timeAgo = row.status === 'sold' ? formatTimeAgo(row.sold_at, nowMs) : ''

                    return (
                      <Link
                        key={row.player_id}
                        to={profilePath}
                        onMouseEnter={() => prefetchRoute(profilePath)}
                        onFocus={() => prefetchRoute(profilePath)}
                        onTouchStart={() => prefetchRoute(profilePath)}
                        className="group min-h-[76px] px-4 py-3 rounded-2xl bg-surface border border-border hover:border-accent-bright/50 transition-colors flex items-center justify-between gap-3 sm:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <ResultThumbnail src={row.photo_thumb_url} name={row.name} />

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-syne font-bold text-sm sm:text-base text-text group-hover:text-accent-bright transition-colors truncate">
                                {row.name}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted mt-0.5">
                              {row.playing_role && (
                                <span className="truncate">{row.playing_role}</span>
                              )}
                              {selectedSport === 'all' && row.sport && (
                                <>
                                  {row.playing_role && <span className="text-border">·</span>}
                                  <span>{row.sport}</span>
                                </>
                              )}
                            </div>

                            {/* Mobile team chip / status */}
                            <div className="mt-1.5 sm:hidden">
                              {row.status === 'sold' && row.team_name ? (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-bg text-text max-w-full"
                                  style={
                                    validTeamColor
                                      ? { borderColor: validTeamColor }
                                      : undefined
                                  }
                                >
                                  <span
                                    aria-hidden="true"
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{
                                      backgroundColor: validTeamColor || 'var(--accent-bright)'
                                    }}
                                  />
                                  <span className="truncate">{row.team_name}</span>
                                </span>
                              ) : row.status === 'unsold' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 border border-border text-muted">
                                  Unsold
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 border border-border text-muted">
                                  Remaining
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Desktop team chip / status */}
                        <div className="hidden sm:flex items-center shrink-0">
                          {row.status === 'sold' && row.team_name ? (
                            <span
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border bg-bg text-text max-w-[200px]"
                              style={
                                validTeamColor
                                  ? { borderColor: validTeamColor }
                                  : undefined
                              }
                            >
                              <span
                                aria-hidden="true"
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: validTeamColor || 'var(--accent-bright)'
                                }}
                              />
                              <span className="truncate">{row.team_name}</span>
                            </span>
                          ) : row.status === 'unsold' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-2 border border-border text-muted">
                              Unsold
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-2 border border-border text-muted">
                              Remaining
                            </span>
                          )}
                        </div>

                        {/* Price in amber mono & time ago */}
                        <div className="text-right shrink-0 space-y-0.5 min-w-[76px]">
                          {row.status === 'sold' && row.sale_price !== null ? (
                            <div className="font-mono font-semibold text-sm sm:text-base tabular-nums text-points">
                              {formatPoints(row.sale_price)}
                            </div>
                          ) : (
                            <div className="font-mono text-xs tabular-nums text-muted">
                              Base {formatPoints(row.base_points)}
                            </div>
                          )}

                          <div className="font-mono text-[11px] tabular-nums text-muted min-h-[16px]">
                            {timeAgo || `#${code}`}
                          </div>
                        </div>
                      </Link>
                    )
                  })}

                  {/* Infinite scroll sentinel & accessible fallback */}
                  {hasMore && (
                    <div
                      ref={sentinelRef}
                      className="pt-4 flex items-center justify-center min-h-[48px]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleCount((prev) =>
                            Math.min(prev + FEED_PAGE_SIZE, filteredRows.length)
                          )
                        }
                        className={`${PUBLIC_BTN_SECONDARY} h-9 px-5 text-xs`}
                      >
                        Load more ({filteredRows.length - visibleCount} remaining)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
