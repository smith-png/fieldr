import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShareNetwork } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_BTN_PRIMARY,
  PUBLIC_BTN_SECONDARY,
  PUBLIC_CARD,
  PUBLIC_COUNT_PILL,
  PUBLIC_ERROR_BANNER,
  PUBLIC_INPUT,
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
import { useToast } from '../../lib/ToastContext'
import { formatPoints, getInitials, getValidTeamColor } from '../../lib/utils'

const FEED_PAGE_SIZE = 20
const SPORT_ORDER = ['Cricket', 'Futsal', 'Volleyball']

type StatusFilter = 'sold' | 'unsold' | 'available' | 'all'

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'sold', label: 'Sold' },
  { value: 'unsold', label: 'Unsold' },
  { value: 'available', label: 'Remaining' },
  { value: 'all', label: 'All' }
]

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

function useVisibleNowMs(enabled: boolean): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  useEffect(() => {
    if (!enabled) return
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
  }, [enabled])

  return nowMs
}

const UpdatedAgoPill: React.FC<{ lastCheckedAt: number }> = ({ lastCheckedAt }) => {
  const nowMs = useVisibleNowMs(true)
  return (
    <span className={PUBLIC_COUNT_PILL}>
      Updated {formatElapsedClock(nowMs - lastCheckedAt)} ago
    </span>
  )
}

const SoldTimeAgo: React.FC<{ soldAt: string | null }> = ({ soldAt }) => {
  const nowMs = useVisibleNowMs(Boolean(soldAt))
  const label = formatTimeAgo(soldAt, nowMs)
  if (!label) return null
  return (
    <div className="font-mono text-[11px] tabular-nums text-muted min-h-[16px]">
      {label}
    </div>
  )
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
        className="w-13 h-13 rounded-2xl bg-surface-2 border border-border flex items-center justify-center shrink-0 font-mono text-sm font-bold text-muted select-none"
      >
        {getInitials(name) || '?'}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      width={52}
      height={52}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-13 h-13 rounded-2xl object-cover object-top bg-surface-2 border border-border shrink-0"
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
          className="min-h-[96px] rounded-3xl bg-surface border border-border p-3 min-[400px]:p-4 sm:p-6 flex flex-col justify-between"
        >
          <SkeletonText width="w-16" className="h-3" />
          <SkeletonBlock className="w-14 h-7 rounded-lg" />
        </div>
      ))}
    </div>

    {/* Per-sport progress card (reserved height) */}
    <div className={`${PUBLIC_CARD} min-h-[212px] space-y-5`}>
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-border">
        <SkeletonBlock className="w-40 h-6 rounded-lg" />
        <SkeletonBlock className="w-28 h-7 rounded-full" />
      </div>
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

    {/* Filters card (reserved height) */}
    <div className={`${PUBLIC_CARD} grid grid-cols-1 sm:grid-cols-3 gap-4`}>
      <div className="space-y-1.5">
        <SkeletonText width="w-12" className="h-3" />
        <SkeletonBlock className="h-[44px] rounded-2xl" />
      </div>
      <div className="space-y-1.5">
        <SkeletonText width="w-12" className="h-3" />
        <SkeletonBlock className="h-[44px] rounded-2xl" />
      </div>
      <div className="space-y-1.5">
        <SkeletonText width="w-12" className="h-3" />
        <SkeletonBlock className="h-[44px] rounded-2xl" />
      </div>
    </div>

    {/* Feed rows (reserved height 84px per row) */}
    <div className="space-y-3">
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <SkeletonBlock className="w-32 h-6 rounded-lg" />
        <SkeletonBlock className="w-10 h-7 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div
            key={idx}
            className="min-h-[84px] px-5 py-4 rounded-3xl bg-surface border border-border flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              <SkeletonBlock className="w-13 h-13 rounded-2xl shrink-0" />
              <div className="space-y-2 flex-1 min-w-0">
                <SkeletonText width="w-16" className="h-3" />
                <SkeletonText width="w-36" className="h-4" />
                <SkeletonText width="w-24" className="h-3" />
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <SkeletonBlock className="hidden sm:block w-24 h-7 rounded-full" />
              <div className="space-y-1.5 flex flex-col items-end">
                <SkeletonBlock className="w-16 h-4 rounded-md" />
                <SkeletonText width="w-12" className="h-2.5" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
)

export const ResultsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { success, error: showError } = useToast()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE)
  const [isSharingResults, setIsSharingResults] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const results = usePublicResults()

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

  const feedTitle =
    selectedStatus === 'sold'
      ? 'Sold so far'
      : selectedStatus === 'unsold'
      ? 'Unsold'
      : selectedStatus === 'available'
      ? 'Remaining'
      : 'All players'

  // Auction stats computed purely in browser from already-loaded results.rows
  const auctionStats = useMemo(() => {
    const soldRows = results.rows.filter((row) => row.status === 'sold')
    if (soldRows.length === 0) return null

    let totalSpent = 0
    for (const row of soldRows) {
      totalSpent += row.sale_price ?? 0
    }
    const averagePrice = totalSpent / soldRows.length

    const mostExpensive = [...soldRows]
      .sort((a, b) => {
        const pa = a.sale_price ?? 0
        const pb = b.sale_price ?? 0
        if (pb !== pa) return pb - pa
        const ta = a.sold_at ? Date.parse(a.sold_at) : 0
        const tb = b.sold_at ? Date.parse(b.sold_at) : 0
        if (tb !== ta) return tb - ta
        return a.athlete_code - b.athlete_code
      })
      .slice(0, 5)

    const biggestPremium = soldRows
      .map((row) => {
        const price = row.sale_price ?? 0
        const base = row.base_points ?? 0
        const premium = price - base
        const multiplier = base > 0 ? price / base : null
        return { row, price, base, premium, multiplier }
      })
      .filter((item) => item.premium > 0)
      .sort((a, b) => {
        if (b.premium !== a.premium) return b.premium - a.premium
        if (b.price !== a.price) return b.price - a.price
        return a.row.athlete_code - b.row.athlete_code
      })
      .slice(0, 3)

    // Average price by sport
    const sportMap = new Map<string, { total: number; count: number }>()
    for (const row of soldRows) {
      const key = row.sport || 'Other'
      const cur = sportMap.get(key) || { total: 0, count: 0 }
      cur.total += row.sale_price ?? 0
      cur.count += 1
      sportMap.set(key, cur)
    }
    const avgBySport = sortSportsList(Array.from(sportMap.keys())).map((sport) => {
      const entry = sportMap.get(sport)!
      return {
        sport,
        avgPrice: entry.total / entry.count,
        count: entry.count
      }
    })
    const maxSportAvg = Math.max(1, ...avgBySport.map((s) => s.avgPrice))

    // Average price by role
    const roleMap = new Map<string, { total: number; count: number }>()
    for (const row of soldRows) {
      const role = row.playing_role.trim()
      if (!role) continue
      const cur = roleMap.get(role) || { total: 0, count: 0 }
      cur.total += row.sale_price ?? 0
      cur.count += 1
      roleMap.set(role, cur)
    }
    const avgByRole = Array.from(roleMap.entries())
      .map(([role, entry]) => ({
        role,
        avgPrice: entry.total / entry.count,
        count: entry.count
      }))
      .sort((a, b) => b.avgPrice - a.avgPrice || a.role.localeCompare(b.role))
    const maxRoleAvg = Math.max(1, ...avgByRole.map((r) => r.avgPrice))

    // Spend per team
    const teamMap = new Map<
      string,
      { teamName: string; teamColor: string | null; totalSpend: number; playerCount: number }
    >()
    for (const row of soldRows) {
      if (!row.team_name) continue
      const cur = teamMap.get(row.team_name) || {
        teamName: row.team_name,
        teamColor: row.team_color,
        totalSpend: 0,
        playerCount: 0
      }
      cur.totalSpend += row.sale_price ?? 0
      cur.playerCount += 1
      if (!cur.teamColor && row.team_color) {
        cur.teamColor = row.team_color
      }
      teamMap.set(row.team_name, cur)
    }
    const spendPerTeam = Array.from(teamMap.values()).sort(
      (a, b) => b.totalSpend - a.totalSpend || a.teamName.localeCompare(b.teamName)
    )
    const maxTeamSpend = Math.max(1, ...spendPerTeam.map((t) => t.totalSpend))

    return {
      soldCount: soldRows.length,
      totalSpent,
      averagePrice,
      highestBuyPrice: mostExpensive[0]?.sale_price ?? 0,
      mostExpensive,
      biggestPremium,
      avgBySport,
      maxSportAvg,
      avgByRole,
      maxRoleAvg,
      spendPerTeam,
      maxTeamSpend,
      soldVsUnsoldBySport: summary.perSport
    }
  }, [results.rows, summary.perSport])

  const handleShareResults = useCallback(async () => {
    if (!auctionStats || isSharingResults) return
    try {
      setIsSharingResults(true)
      const { shareResultsImage } = await import('../../lib/shareResultsImage')
      const outcome = await shareResultsImage({
        seasonName: results.seasonName,
        totalSpent: auctionStats.totalSpent,
        soldCount: summary.sold,
        unsoldCount: summary.unsold,
        remainingCount: summary.remaining,
        averagePrice: auctionStats.averagePrice,
        topBuys: auctionStats.mostExpensive.slice(0, 3).map((row) => ({
          name: row.name,
          role: row.playing_role,
          sport: row.sport,
          teamName: row.team_name,
          teamColor: row.team_color,
          price: row.sale_price ?? 0,
          photoUrl: row.photo_thumb_url
        })),
        teamSpends: auctionStats.spendPerTeam
      })
      if (outcome.outcome === 'downloaded') {
        success('Results card downloaded')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to generate results card'
      showError(msg)
    } finally {
      setIsSharingResults(false)
    }
  }, [
    auctionStats,
    isSharingResults,
    results.seasonName,
    summary.sold,
    summary.unsold,
    summary.remaining,
    success,
    showError
  ])

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      <main className={PUBLIC_MAIN}>
        {/* Page Header */}
        <header className={PUBLIC_PAGE_HEADER}>
          <div className="min-w-0 space-y-1">
            <span className="block text-[11px] font-mono uppercase tracking-[0.16em] text-accent-bright font-semibold">
              LIVE AUCTION FEED
            </span>
            <h1 className={PUBLIC_PAGE_TITLE}>Results</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 min-h-[1.75rem] shrink-0">
            {results.isLoading ? (
              <>
                <SkeletonBlock className="w-36 h-7 rounded-full" />
                <SkeletonBlock className="w-32 h-7 rounded-full" />
              </>
            ) : (
              <>
                {results.seasonName && (
                  <span className={PUBLIC_COUNT_PILL}>{results.seasonName}</span>
                )}
                {results.lastCheckedAt !== null && (
                  <UpdatedAgoPill lastCheckedAt={results.lastCheckedAt} />
                )}
              </>
            )}
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
                  <div className="min-h-[96px] rounded-3xl bg-surface border border-border p-3 min-[400px]:p-4 sm:p-6 flex flex-col justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.04em] min-[400px]:tracking-[0.14em] text-muted">
                      Sold
                    </span>
                    <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                      0
                    </span>
                  </div>
                  <div className="min-h-[96px] rounded-3xl bg-surface border border-border p-3 min-[400px]:p-4 sm:p-6 flex flex-col justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.04em] min-[400px]:tracking-[0.14em] text-muted">
                      Unsold
                    </span>
                    <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                      0
                    </span>
                  </div>
                  <div className="min-h-[96px] rounded-3xl bg-surface border border-border p-3 min-[400px]:p-4 sm:p-6 flex flex-col justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.04em] min-[400px]:tracking-[0.14em] text-muted">
                      Remaining
                    </span>
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
            <section aria-label="Auction progress summary" className="space-y-5">
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div className="min-h-[96px] rounded-3xl bg-surface border border-border p-3 min-[400px]:p-4 sm:p-6 flex flex-col justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.04em] min-[400px]:tracking-[0.14em] text-muted">
                    Sold
                  </span>
                  <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-accent-bright">
                    {summary.sold}
                  </span>
                </div>
                <div className="min-h-[96px] rounded-3xl bg-surface border border-border p-3 min-[400px]:p-4 sm:p-6 flex flex-col justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.04em] min-[400px]:tracking-[0.14em] text-muted">
                    Unsold
                  </span>
                  <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                    {summary.unsold}
                  </span>
                </div>
                <div className="min-h-[96px] rounded-3xl bg-surface border border-border p-3 min-[400px]:p-4 sm:p-6 flex flex-col justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-[0.04em] min-[400px]:tracking-[0.14em] text-muted">
                    Remaining
                  </span>
                  <span className="font-mono font-bold text-2xl sm:text-3xl tabular-nums text-text">
                    {summary.remaining}
                  </span>
                </div>
              </div>

              {summary.perSport.length > 0 && (
                <div className={`${PUBLIC_CARD} space-y-5`}>
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
                    <h2 className={PUBLIC_SECTION_TITLE}>Progress by sport</h2>
                    <span className={PUBLIC_COUNT_PILL}>
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
                                className="h-full bg-accent-bright transition-[width] duration-300 motion-reduce:transition-none"
                                style={{ width: `${soldPct}%` }}
                              />
                            )}
                            {unsoldPct > 0 && (
                              <div
                                className="h-full bg-muted/45 transition-[width] duration-300 motion-reduce:transition-none"
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
            <section aria-label="Filter results" className={`${PUBLIC_CARD} space-y-4`}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="results-filter-sport"
                    className="block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
                  >
                    Sport
                  </label>
                  <select
                    id="results-filter-sport"
                    value={selectedSport}
                    onChange={(e) => updateFilters({ sport: e.target.value })}
                    className={PUBLIC_INPUT}
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
                    className="block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
                  >
                    Team
                  </label>
                  <select
                    id="results-filter-team"
                    value={selectedTeam}
                    onChange={(e) => updateFilters({ team: e.target.value })}
                    disabled={availableTeams.length === 0}
                    className={PUBLIC_INPUT}
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
                    className="block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
                  >
                    Status
                  </label>
                  <select
                    id="results-filter-status"
                    value={selectedStatus}
                    onChange={(e) =>
                      updateFilters({ status: e.target.value as StatusFilter })
                    }
                    className={PUBLIC_INPUT}
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
                <div className="flex justify-end pt-3 border-t border-border">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={`relative hit-44 ${PUBLIC_BTN_SECONDARY} h-8 px-3.5 text-xs`}
                  >
                    Reset filters
                  </button>
                </div>
              )}
            </section>

            {/* Sold So Far / Results Feed */}
            <section aria-label={feedTitle} className="space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
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
                      className={`relative hit-44 ${PUBLIC_BTN_SECONDARY} h-9 px-4 text-xs`}
                    >
                      Reset filters
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleRows.map((row: PublicResultRow) => {
                    const code = formatAthleteCode(row.athlete_code)
                    const profilePath = `/players/${code}`
                    const validTeamColor = getValidTeamColor(row.team_color)
                    const isSold = row.status === 'sold'

                    return (
                      <Link
                        key={row.player_id}
                        to={profilePath}
                        onMouseEnter={() => prefetchRoute(profilePath)}
                        onFocus={() => prefetchRoute(profilePath)}
                        onTouchStart={() => prefetchRoute(profilePath)}
                        style={
                          isSold && validTeamColor
                            ? ({ '--team-color': validTeamColor } as React.CSSProperties)
                            : undefined
                        }
                        className={`group min-h-[84px] px-4 sm:px-5 py-3.5 sm:py-4 rounded-3xl bg-surface border-[1.5px] border-solid transition-colors flex items-center justify-between gap-3 sm:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
                          isSold
                            ? validTeamColor
                              ? 'border-[color:color-mix(in_srgb,var(--team-color)_65%,transparent)] hover:border-[color:var(--team-color)]'
                              : 'border-[color:color-mix(in_srgb,var(--accent-bright)_65%,transparent)] hover:border-accent-bright'
                            : 'border-border hover:border-accent-bright'
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0 flex-1">
                          <ResultThumbnail src={row.photo_thumb_url} name={row.name} />

                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-[11px] tracking-wider text-accent-bright block uppercase font-semibold tabular-nums mb-0.5">
                              #{code}
                            </span>

                            <div className="font-syne font-bold text-base text-text group-hover:text-accent-bright transition-colors truncate">
                              {row.name}
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              {row.playing_role && (
                                <span className="font-syne font-bold text-sm text-text truncate">
                                  {row.playing_role}
                                </span>
                              )}
                              {selectedSport === 'all' && row.sport && (
                                <>
                                  {row.playing_role && (
                                    <span className="text-xs text-muted">·</span>
                                  )}
                                  <span className="text-xs text-muted">{row.sport}</span>
                                </>
                              )}
                            </div>

                            {/* Mobile team chip / status */}
                            <div className="mt-1.5 sm:hidden">
                              {isSold && row.team_name ? (
                                <span
                                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-bg text-text max-w-full"
                                  style={{
                                    borderColor: validTeamColor || 'var(--accent-bright)'
                                  }}
                                >
                                  <span className="truncate">{row.team_name}</span>
                                </span>
                              ) : row.status === 'unsold' ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 border border-border text-muted">
                                  <span
                                    aria-hidden="true"
                                    className="w-2 h-2 rounded-full shrink-0 bg-muted"
                                  />
                                  <span>Unsold</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 border border-border text-muted">
                                  <span
                                    aria-hidden="true"
                                    className="w-2 h-2 rounded-full shrink-0 bg-accent-bright"
                                  />
                                  <span>Remaining</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Desktop team chip / status */}
                        <div className="hidden sm:flex items-center shrink-0">
                          {isSold && row.team_name ? (
                            <span
                              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-bg text-text max-w-[200px]"
                              style={{
                                borderColor: validTeamColor || 'var(--accent-bright)'
                              }}
                            >
                              <span className="truncate">{row.team_name}</span>
                            </span>
                          ) : row.status === 'unsold' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-surface-2 border border-border text-muted">
                              <span
                                aria-hidden="true"
                                className="w-2 h-2 rounded-full shrink-0 bg-muted"
                              />
                              <span>Unsold</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-surface-2 border border-border text-muted">
                              <span
                                aria-hidden="true"
                                className="w-2 h-2 rounded-full shrink-0 bg-accent-bright"
                              />
                              <span>Remaining</span>
                            </span>
                          )}
                        </div>

                        {/* Price in amber mono & time ago */}
                        <div className="text-right shrink-0 space-y-0.5 min-w-[76px]">
                          {isSold && row.sale_price !== null ? (
                            <div className="font-mono font-semibold text-sm sm:text-base tabular-nums text-points">
                              {formatPoints(row.sale_price)}
                            </div>
                          ) : (
                            <div className="font-mono text-xs tabular-nums text-points font-semibold">
                              Base {formatPoints(row.base_points)}
                            </div>
                          )}

                          {isSold && <SoldTimeAgo soldAt={row.sold_at} />}
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

            {/* Auction Stats Section (shown when at least one sale exists) */}
            {auctionStats && (
              <section
                aria-label="Auction stats"
                className="pt-8 border-t border-border space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-border">
                  <div className="space-y-1">
                    <span className="block text-[11px] font-mono uppercase tracking-[0.16em] text-accent-bright font-semibold">
                      SEASON ANALYTICS
                    </span>
                    <h2 className="font-syne font-extrabold text-2xl sm:text-3xl tracking-tight text-text">
                      Auction stats
                    </h2>
                    <p className="text-xs text-muted">
                      Computed live from {auctionStats.soldCount}{' '}
                      {auctionStats.soldCount === 1 ? 'sale' : 'sales'} this season
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleShareResults()}
                    disabled={isSharingResults}
                    className={`${PUBLIC_BTN_PRIMARY} h-10 px-5 text-xs sm:text-sm whitespace-nowrap shrink-0 self-start sm:self-auto`}
                  >
                    <ShareNetwork size={15} weight="regular" />
                    <span>{isSharingResults ? 'Generating...' : 'Share results'}</span>
                  </button>
                </div>

                {/* Card 1: Total points spent */}
                <div className={`${PUBLIC_CARD} flex flex-col sm:flex-row sm:items-end justify-between gap-5`}>
                  <div className="space-y-1.5">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted block">
                      Total points spent
                    </span>
                    <div className="font-mono font-bold text-3xl sm:text-5xl tabular-nums text-points tracking-tight">
                      {formatPoints(auctionStats.totalSpent)}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-4 sm:pt-0 border-t sm:border-t-0 border-border">
                    <div>
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted block">
                        Sales
                      </span>
                      <span className="font-mono font-semibold text-base sm:text-lg tabular-nums text-text">
                        {auctionStats.soldCount}
                      </span>
                    </div>
                    <div>
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted block">
                        Avg price
                      </span>
                      <span className="font-mono font-semibold text-base sm:text-lg tabular-nums text-points">
                        {formatPoints(Math.round(auctionStats.averagePrice))}
                      </span>
                    </div>
                    <div>
                      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted block">
                        Top buy
                      </span>
                      <span className="font-mono font-semibold text-base sm:text-lg tabular-nums text-points">
                        {formatPoints(auctionStats.highestBuyPrice)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                  {/* Card 2: Most expensive buys (top 5) */}
                  <div className={`${PUBLIC_CARD} space-y-4`}>
                    <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-border">
                      <h3 className={PUBLIC_SECTION_TITLE}>Most expensive buys</h3>
                      <span className={PUBLIC_COUNT_PILL}>Top {auctionStats.mostExpensive.length}</span>
                    </div>

                    <div className="divide-y divide-border">
                      {auctionStats.mostExpensive.map((row, idx) => {
                        const code = formatAthleteCode(row.athlete_code)
                        const profilePath = `/players/${code}`
                        const validColor = getValidTeamColor(row.team_color)

                        return (
                          <Link
                            key={row.player_id}
                            to={profilePath}
                            onMouseEnter={() => prefetchRoute(profilePath)}
                            onFocus={() => prefetchRoute(profilePath)}
                            className="group py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-xl"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="font-mono text-xs tabular-nums text-muted w-5 shrink-0">
                                0{idx + 1}
                              </span>
                              <ResultThumbnail src={row.photo_thumb_url} name={row.name} />
                              <div className="min-w-0 flex-1">
                                <div className="font-syne font-bold text-sm sm:text-base text-text group-hover:text-accent-bright transition-colors truncate">
                                  {row.name}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted mt-1">
                                  {row.team_name && (
                                    <span
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-bg text-text max-w-full"
                                      style={{
                                        borderColor: validColor || 'var(--accent-bright)'
                                      }}
                                    >
                                      <span className="truncate">{row.team_name}</span>
                                    </span>
                                  )}
                                  {row.playing_role && (
                                    <span className="truncate">{row.playing_role}</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <span className="font-mono font-semibold text-sm sm:text-base tabular-nums text-points shrink-0">
                              {formatPoints(row.sale_price)}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>

                  {/* Card 3: Spend per team (horizontal bars in team colours) */}
                  <div className={`${PUBLIC_CARD} space-y-4`}>
                    <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-border">
                      <h3 className={PUBLIC_SECTION_TITLE}>Spend per team</h3>
                      <span className={PUBLIC_COUNT_PILL}>{auctionStats.spendPerTeam.length}</span>
                    </div>

                    {auctionStats.spendPerTeam.length === 0 ? (
                      <p className="text-xs text-muted py-4">No team spend recorded yet.</p>
                    ) : (
                      <div className="space-y-3.5">
                        {auctionStats.spendPerTeam.map((team) => {
                          const barColor = getValidTeamColor(team.teamColor) || 'var(--accent-bright)'
                          const pct = Math.max(
                            3,
                            Math.round((team.totalSpend / auctionStats.maxTeamSpend) * 100)
                          )

                          return (
                            <div key={team.teamName} className="space-y-1.5">
                              <div className="flex items-baseline justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium text-text truncate">
                                    {team.teamName}
                                  </span>
                                  <span className="font-mono text-[11px] text-muted tabular-nums shrink-0">
                                    ({team.playerCount})
                                  </span>
                                </div>
                                <span className="font-mono font-semibold tabular-nums text-points shrink-0">
                                  {formatPoints(team.totalSpend)}
                                </span>
                              </div>

                              <svg
                                role="img"
                                aria-label={`${team.teamName}: ${formatPoints(team.totalSpend)} points across ${team.playerCount} players`}
                                viewBox="0 0 100 6"
                                preserveAspectRatio="none"
                                className="w-full h-2 rounded-full overflow-hidden block"
                              >
                                <rect
                                  x="0"
                                  y="0"
                                  width="100"
                                  height="6"
                                  rx="3"
                                  fill="var(--surface-2)"
                                />
                                <rect
                                  x="0"
                                  y="0"
                                  width={pct}
                                  height="6"
                                  rx="3"
                                  fill={barColor}
                                />
                              </svg>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Card 4: Biggest premium over base points (top 3) */}
                  <div className={`${PUBLIC_CARD} space-y-4`}>
                    <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-border">
                      <h3 className={PUBLIC_SECTION_TITLE}>Biggest premium over base</h3>
                      <span className={PUBLIC_COUNT_PILL}>
                        Top {Math.max(1, auctionStats.biggestPremium.length)}
                      </span>
                    </div>

                    {auctionStats.biggestPremium.length === 0 ? (
                      <p className="text-xs text-muted py-4">
                        All sales so far closed at base points.
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {auctionStats.biggestPremium.map((item, idx) => {
                          const code = formatAthleteCode(item.row.athlete_code)
                          const profilePath = `/players/${code}`
                          const validColor = getValidTeamColor(item.row.team_color)

                          return (
                            <Link
                              key={item.row.player_id}
                              to={profilePath}
                              onMouseEnter={() => prefetchRoute(profilePath)}
                              onFocus={() => prefetchRoute(profilePath)}
                              className="group py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-xl"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="font-mono text-xs tabular-nums text-muted w-5 shrink-0">
                                  0{idx + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="font-syne font-bold text-sm sm:text-base text-text group-hover:text-accent-bright transition-colors truncate">
                                    {item.row.name}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted mt-1">
                                    {item.row.team_name && (
                                      <span
                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-bg text-text max-w-full"
                                        style={{
                                          borderColor: validColor || 'var(--accent-bright)'
                                        }}
                                      >
                                        <span className="truncate">{item.row.team_name}</span>
                                      </span>
                                    )}
                                    <span className="font-mono text-[11px] tabular-nums">
                                      {formatPoints(item.base)} to {formatPoints(item.price)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="font-mono font-semibold text-sm tabular-nums text-points">
                                  +{formatPoints(item.premium)}
                                </div>
                                {item.multiplier !== null && (
                                  <div className="font-mono text-[11px] tabular-nums text-muted">
                                    {item.multiplier.toFixed(1)}x base
                                  </div>
                                )}
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Card 5: Sold versus unsold per sport */}
                  <div className={`${PUBLIC_CARD} space-y-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-border">
                      <h3 className={PUBLIC_SECTION_TITLE}>Sold vs unsold by sport</h3>
                      <div className="flex items-center gap-3 text-[11px] font-mono text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="w-2 h-2 rounded-full bg-accent-bright"
                          />
                          Sold
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            aria-hidden="true"
                            className="w-2 h-2 rounded-full bg-muted/45"
                          />
                          Unsold
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {auctionStats.soldVsUnsoldBySport.map((sp) => {
                        const decided = sp.sold + sp.unsold
                        const soldWidth = decided > 0 ? (sp.sold / decided) * 100 : 0
                        const unsoldWidth = decided > 0 ? (sp.unsold / decided) * 100 : 0
                        const soldRate = decided > 0 ? Math.round((sp.sold / decided) * 100) : 0

                        return (
                          <div key={sp.sport} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2 text-xs">
                              <span className="font-medium text-text">{sp.sport}</span>
                              <div className="flex items-center gap-2.5 font-mono tabular-nums text-muted">
                                <span className="text-accent-bright font-medium">
                                  {sp.sold} sold
                                </span>
                                <span>{sp.unsold} unsold</span>
                                {decided > 0 && (
                                  <span className="text-[11px]">({soldRate}%)</span>
                                )}
                              </div>
                            </div>

                            <svg
                              role="img"
                              aria-label={`${sp.sport}: ${sp.sold} sold, ${sp.unsold} unsold`}
                              viewBox="0 0 100 8"
                              preserveAspectRatio="none"
                              className="w-full h-2.5 rounded-full overflow-hidden block"
                            >
                              <rect
                                x="0"
                                y="0"
                                width="100"
                                height="8"
                                rx="4"
                                fill="var(--surface-2)"
                              />
                              {soldWidth > 0 && (
                                <rect
                                  x="0"
                                  y="0"
                                  width={soldWidth}
                                  height="8"
                                  fill="var(--accent-bright)"
                                />
                              )}
                              {unsoldWidth > 0 && (
                                <rect
                                  x={soldWidth}
                                  y="0"
                                  width={unsoldWidth}
                                  height="8"
                                  fill="var(--text-muted)"
                                  fillOpacity="0.45"
                                />
                              )}
                            </svg>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Card 6: Average price by sport and by role (small bars, sage palette) */}
                <div className={`${PUBLIC_CARD} space-y-5`}>
                  <div className="pb-3.5 border-b border-border">
                    <h3 className={PUBLIC_SECTION_TITLE}>Average price by sport and role</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* By sport */}
                    <div className="space-y-3">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted block">
                        By sport
                      </span>
                      <div className="space-y-2.5">
                        {auctionStats.avgBySport.map((item) => {
                          const pct = Math.max(
                            4,
                            Math.round((item.avgPrice / auctionStats.maxSportAvg) * 100)
                          )
                          return (
                            <div key={item.sport} className="space-y-1">
                              <div className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-text font-medium truncate">
                                  {item.sport}{' '}
                                  <span className="font-mono text-[11px] text-muted">
                                    ({item.count})
                                  </span>
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-points shrink-0">
                                  {formatPoints(Math.round(item.avgPrice))}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-accent"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* By role */}
                    <div className="space-y-3">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted block">
                        By role
                      </span>
                      <div className="space-y-2.5">
                        {auctionStats.avgByRole.map((item) => {
                          const pct = Math.max(
                            4,
                            Math.round((item.avgPrice / auctionStats.maxRoleAvg) * 100)
                          )
                          return (
                            <div key={item.role} className="space-y-1">
                              <div className="flex items-baseline justify-between gap-2 text-xs">
                                <span className="text-text font-medium truncate">
                                  {item.role}{' '}
                                  <span className="font-mono text-[11px] text-muted">
                                    ({item.count})
                                  </span>
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-points shrink-0">
                                  {formatPoints(Math.round(item.avgPrice))}
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-surface-2 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-accent-bright"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
