import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUpRight } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { HomeBackdrop } from '../../components/home/HomeBackdrop'
import { HeroWord } from '../../components/home/HeroWord'
import { HeroBalls } from '../../components/home/HeroBalls'
import { TickerStrip } from '../../components/home/TickerStrip'
import { SportCardsGrid } from '../../components/home/SportCardsGrid'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { ErrorBoundary } from '../../components/layout/ErrorBoundary'
import {
  DEFAULT_TICKER_SPEED,
  FALLBACK_CAROUSEL_TEXTS,
  getCarouselItems,
  getTickerSpeedSetting,
  isHomeCacheFresh,
  normalizeTickerSpeed,
  readCachedPublicHome,
  readCachedPublicTicker,
  removeCachedPublicTicker,
  sanitizeTickerTexts,
  writeCachedPublicHome,
  writeCachedPublicTicker
} from '../../lib/data/site'
import { getActiveSeason } from '../../lib/data/seasons'
import { getPublicPlayerSportRows } from '../../lib/data/players'
import { getSports } from '../../lib/data/teams'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import { prefetchRoute } from '../../lib/queryCache'
import { matchesSport } from '../../lib/utils'
import type { Season, Sport } from '../../types'
import type { SportSlug } from '../../lib/sports'

const loadNavigationMenu = () =>
  import('../../components/layout/NavigationMenu').then((m) => ({
    default: m.NavigationMenu
  }))

const LazyNavigationMenu = React.lazy(loadNavigationMenu)

const DEFAULT_COUNTS: Record<SportSlug, number> = {
  cricket: 0,
  futsal: 0,
  volleyball: 0
}

const HERO_WORD = 'Fieldr'

let hasPlayedHomeHeroEntrance = false

export const HomePage: React.FC = () => {
  const initialHomeCache = useMemo(() => readCachedPublicHome(), [])
  const initialTickerCache = useMemo(() => readCachedPublicTicker(), [])

  const initialSeason = useMemo<Season | null>(() => {
    if (initialHomeCache?.activeSeason) {
      if (!publicCache.activeSeason.loaded) {
        publicCache.activeSeason = {
          loaded: true,
          value: initialHomeCache.activeSeason
        }
      }
      return initialHomeCache.activeSeason
    }
    return publicCache.activeSeason.value
  }, [initialHomeCache])

  const initialCounts = useMemo<Record<SportSlug, number>>(() => {
    if (initialHomeCache?.playerCounts) {
      if (
        initialHomeCache.activeSeason?.id &&
        !publicCache.playerCountsBySeason.has(initialHomeCache.activeSeason.id)
      ) {
        publicCache.playerCountsBySeason.set(
          initialHomeCache.activeSeason.id,
          initialHomeCache.playerCounts
        )
      }
      return initialHomeCache.playerCounts
    }
    if (initialSeason && publicCache.playerCountsBySeason.has(initialSeason.id)) {
      return publicCache.playerCountsBySeason.get(initialSeason.id) || DEFAULT_COUNTS
    }
    return DEFAULT_COUNTS
  }, [initialHomeCache, initialSeason])

  const initialSports = useMemo<Sport[]>(() => {
    if (initialHomeCache && initialHomeCache.sports.length > 0) {
      if (!publicCache.sports.loaded) {
        publicCache.sports = { loaded: true, value: initialHomeCache.sports }
      }
      return initialHomeCache.sports
    }
    if (publicCache.sports.loaded && publicCache.sports.value.length > 0) {
      return publicCache.sports.value
    }
    return []
  }, [initialHomeCache])

  const initialCarousel = useMemo<string[] | null>(() => {
    if (initialHomeCache && initialHomeCache.tickerItems.length > 0) {
      if (!publicCache.carouselItems.loaded) {
        publicCache.carouselItems = {
          loaded: true,
          value: initialHomeCache.tickerItems
        }
      }
      return initialHomeCache.tickerItems
    }
    if (initialTickerCache.items && initialTickerCache.items.length > 0) {
      if (!publicCache.carouselItems.loaded) {
        publicCache.carouselItems = {
          loaded: true,
          value: initialTickerCache.items
        }
      }
      return initialTickerCache.items
    }
    if (publicCache.carouselItems.loaded && publicCache.carouselItems.value.length > 0) {
      return publicCache.carouselItems.value
    }
    return null
  }, [initialHomeCache, initialTickerCache])

  const initialTickerSpeed = useMemo<number>(() => {
    if (initialHomeCache !== null) {
      return initialHomeCache.tickerSpeed
    }
    if (initialTickerCache.tickerSpeed !== null) {
      return initialTickerCache.tickerSpeed
    }
    if (
      publicCache.siteSettings.loaded &&
      publicCache.siteSettings.value &&
      publicCache.siteSettings.value.ticker_speed !== undefined
    ) {
      return normalizeTickerSpeed(publicCache.siteSettings.value.ticker_speed)
    }
    return DEFAULT_TICKER_SPEED
  }, [initialHomeCache, initialTickerCache])

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [hasOpenedMenu, setHasOpenedMenu] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(initialSeason)
  const [hasLoadedSeason, setHasLoadedSeason] = useState<boolean>(() =>
    Boolean(initialHomeCache?.activeSeason || publicCache.activeSeason.loaded)
  )
  const [carouselItems, setCarouselItems] = useState<string[] | null>(initialCarousel)
  const [tickerSpeed, setTickerSpeed] = useState<number>(initialTickerSpeed)
  const [playerCounts, setPlayerCounts] = useState<Record<SportSlug, number>>(initialCounts)
  const [hasLoadedCounts, setHasLoadedCounts] = useState<boolean>(() =>
    Boolean(
      initialHomeCache?.playerCounts ||
        (initialSeason?.id && publicCache.playerCountsBySeason.has(initialSeason.id))
    )
  )
  const [sports, setSports] = useState<Sport[]>(initialSports)
  const [shouldReduceMotion, setShouldReduceMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setShouldReduceMotion(mq.matches)
    onChange()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  const [animateHeroEntrance] = useState<boolean>(() => !hasPlayedHomeHeroEntrance)
  useEffect(() => {
    hasPlayedHomeHeroEntrance = true
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const prefetchMenu = () => {
      void loadNavigationMenu().catch(() => {})
    }
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(prefetchMenu, { timeout: 2000 })
      return () => {
        if (typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(id)
        }
      }
    }
    const timer = window.setTimeout(prefetchMenu, 1200)
    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  const handleOpenMenu = useCallback(() => {
    setHasOpenedMenu(true)
    setIsMenuOpen(true)
  }, [])

  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false)
  }, [])

  const handleScrollToRosters = useCallback(() => {
    const el = document.getElementById('rosters-section')
    if (el) {
      el.scrollIntoView({ behavior: shouldReduceMotion ? 'auto' : 'smooth' })
    }
  }, [shouldReduceMotion])

  useEffect(() => {
    // Skip background refetch if cached public home page data is fresh (< 5 minutes old)
    if (
      isHomeCacheFresh(initialHomeCache) &&
      initialHomeCache &&
      initialHomeCache.tickerItems.length > 0
    ) {
      return
    }

    let mounted = true

    async function loadData() {
      // Start all independent home page requests in parallel while always scoping player rows to the active season
      const seasonPromise = getActiveSeason()
      const knownSeasonId = initialSeason?.id ?? null
      const playerRowsPromise = knownSeasonId
        ? getPublicPlayerSportRows(knownSeasonId)
        : seasonPromise.then((season) =>
            season?.id ? getPublicPlayerSportRows(season.id) : []
          )

      const [
        seasonResult,
        playerRowsResult,
        sportsResult,
        carouselResult,
        tickerSpeedResult
      ] = await Promise.allSettled([
        seasonPromise,
        playerRowsPromise,
        getSports(),
        getCarouselItems(true),
        getTickerSpeedSetting()
      ])

      if (!mounted) return

      // 1. Resolve active season (fallback to cached season if request failed)
      let resolvedSeason: Season | null = initialSeason
      if (seasonResult.status === 'fulfilled') {
        resolvedSeason = seasonResult.value
        const prevSeason = publicCache.activeSeason.value
        const seasonChanged =
          !publicCache.activeSeason.loaded || hasDataChanged(prevSeason, resolvedSeason)
        publicCache.activeSeason = { loaded: true, value: resolvedSeason }
        if (seasonChanged) {
          setActiveSeason((prev) =>
            hasDataChanged(prev, resolvedSeason) ? resolvedSeason : prev
          )
        }
        setHasLoadedSeason(true)
      }

      // 2. Resolve player counts per sport (fallback to cached counts or 0 if failed)
      let resolvedCounts: Record<SportSlug, number> = initialCounts
      if (resolvedSeason && resolvedSeason.id) {
        let fetchedPlayerRows =
          playerRowsResult.status === 'fulfilled' && Array.isArray(playerRowsResult.value)
            ? playerRowsResult.value
            : null

        // If the active season changed since the cached seasonId, fetch rows for the new active season
        if (knownSeasonId && resolvedSeason.id !== knownSeasonId) {
          fetchedPlayerRows = await getPublicPlayerSportRows(resolvedSeason.id)
          if (!mounted) return
        }

        if (Array.isArray(fetchedPlayerRows)) {
          const seasonRows = fetchedPlayerRows.filter(
            (r) => r && (!r.season_id || r.season_id === resolvedSeason!.id)
          )
          const nextCounts: Record<SportSlug, number> = {
            cricket: seasonRows.filter((p) => matchesSport(p.sport, 'cricket')).length,
            futsal: seasonRows.filter((p) => matchesSport(p.sport, 'futsal')).length,
            volleyball: seasonRows.filter((p) => matchesSport(p.sport, 'volleyball')).length
          }
          resolvedCounts = nextCounts
          const prevCounts = publicCache.playerCountsBySeason.get(resolvedSeason.id)
          const countsChanged = !prevCounts || hasDataChanged(prevCounts, nextCounts)
          publicCache.playerCountsBySeason.set(resolvedSeason.id, nextCounts)
          if (countsChanged) {
            setPlayerCounts((prev) =>
              hasDataChanged(prev, nextCounts) ? nextCounts : prev
            )
          }
          setHasLoadedCounts(true)
        }
      } else if (seasonResult.status === 'fulfilled' && !resolvedSeason) {
        resolvedCounts = DEFAULT_COUNTS
        setPlayerCounts((prev) =>
          hasDataChanged(prev, DEFAULT_COUNTS) ? DEFAULT_COUNTS : prev
        )
        setHasLoadedCounts(true)
      }

      // 3. Resolve sports roles
      let resolvedSports: Sport[] = initialSports
      if (
        sportsResult.status === 'fulfilled' &&
        Array.isArray(sportsResult.value) &&
        sportsResult.value.length > 0
      ) {
        resolvedSports = sportsResult.value
        const prevSports = publicCache.sports.value
        const sportsChanged =
          !publicCache.sports.loaded || hasDataChanged(prevSports, resolvedSports)
        publicCache.sports = { loaded: true, value: resolvedSports }
        if (sportsChanged) {
          setSports((prev) =>
            hasDataChanged(prev, resolvedSports) ? resolvedSports : prev
          )
        }
      }

      // 4. Resolve ticker speed
      let resolvedSpeed = initialTickerSpeed
      if (
        tickerSpeedResult.status === 'fulfilled' &&
        tickerSpeedResult.value !== null
      ) {
        resolvedSpeed = normalizeTickerSpeed(tickerSpeedResult.value)
        setTickerSpeed((prev) => (prev !== resolvedSpeed ? resolvedSpeed : prev))
      }

      // 5. Resolve ticker items
      let cacheableTickerItems: string[] = initialCarousel ?? []
      if (carouselResult.status === 'fulfilled') {
        const clean = sanitizeTickerTexts(carouselResult.value)
        if (clean.length > 0) {
          cacheableTickerItems = clean
          writeCachedPublicTicker(clean, resolvedSpeed)
          const prevTexts = publicCache.carouselItems.value
          const changed =
            !publicCache.carouselItems.loaded || hasDataChanged(prevTexts, clean)
          publicCache.carouselItems = { loaded: true, value: clean }
          if (changed) {
            setCarouselItems((prev) => (hasDataChanged(prev, clean) ? clean : prev))
          }
        } else {
          cacheableTickerItems = []
          removeCachedPublicTicker(resolvedSpeed)
          publicCache.carouselItems = { loaded: true, value: FALLBACK_CAROUSEL_TEXTS }
          setCarouselItems((prev) =>
            hasDataChanged(prev, FALLBACK_CAROUSEL_TEXTS)
              ? FALLBACK_CAROUSEL_TEXTS
              : prev
          )
        }
      } else if (!initialCarousel || initialCarousel.length === 0) {
        publicCache.carouselItems = { loaded: true, value: FALLBACK_CAROUSEL_TEXTS }
        setCarouselItems((prev) =>
          hasDataChanged(prev, FALLBACK_CAROUSEL_TEXTS)
            ? FALLBACK_CAROUSEL_TEXTS
            : prev
        )
      }

      // 6. Save combined public home page cache with current timestamp
      if (
        seasonResult.status === 'fulfilled' ||
        carouselResult.status === 'fulfilled' ||
        playerRowsResult.status === 'fulfilled'
      ) {
        writeCachedPublicHome({
          activeSeason: resolvedSeason,
          playerCounts: resolvedCounts,
          sports: resolvedSports,
          tickerItems: cacheableTickerItems,
          tickerSpeed: resolvedSpeed
        })
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [
    initialHomeCache,
    initialSeason,
    initialCounts,
    initialSports,
    initialCarousel,
    initialTickerSpeed
  ])

  const totalAthletes =
    (playerCounts.cricket || 0) +
    (playerCounts.futsal || 0) +
    (playerCounts.volleyball || 0)

  const cachedTeamsCount =
    activeSeason?.id && publicCache.teamsBySeason.has(activeSeason.id)
      ? publicCache.teamsBySeason.get(activeSeason.id)?.length ?? null
      : null

  const dataLineParts = useMemo(() => {
    if (!hasLoadedSeason && !hasLoadedCounts) return []
    const parts: React.ReactNode[] = []
    if (hasLoadedSeason && activeSeason?.name) {
      parts.push(<span key="season">{activeSeason.name}</span>)
    }
    if (hasLoadedCounts && totalAthletes > 0) {
      parts.push(
        <span key="athletes">
          <span className="font-mono tabular-nums text-text">
            {String(totalAthletes).padStart(2, '0')}
          </span>{' '}
          {totalAthletes === 1 ? 'athlete' : 'athletes'}
        </span>
      )
    }
    if (cachedTeamsCount !== null && cachedTeamsCount > 0) {
      parts.push(
        <span key="teams">
          <span className="font-mono tabular-nums text-text">
            {String(cachedTeamsCount).padStart(2, '0')}
          </span>{' '}
          {cachedTeamsCount === 1 ? 'team' : 'teams'}
        </span>
      )
    }
    return parts
  }, [hasLoadedSeason, hasLoadedCounts, activeSeason?.name, totalAthletes, cachedTeamsCount])

  const playHeroIntro = animateHeroEntrance && !shouldReduceMotion

  return (
    <div
      className="min-h-dvh bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-white relative overflow-x-clip"
    >
      {/* Muted inline vector sports backdrop */}
      <HomeBackdrop />

      {/* Scroll-aware sticky Header */}
      <HeaderBar onOpenMenu={handleOpenMenu} />

      {/* Public Navigation Menu (lazy-loaded until opened) */}
      <Suspense fallback={null}>
        {(isMenuOpen || hasOpenedMenu) && (
          <LazyNavigationMenu
            isOpen={isMenuOpen}
            onClose={handleCloseMenu}
          />
        )}
      </Suspense>

      {/* Main Hero Container wrapped in ErrorBoundary */}
      <ErrorBoundary name="HeroSection" fallback={null}>
        <main className="relative z-10 flex flex-col px-6 md:px-16 lg:px-24 pt-6 sm:pt-8 lg:pt-10 pb-10 sm:pb-12 lg:pb-14 max-w-7xl mx-auto w-full">
          {/* 1. Top Row with 1px hairline under it */}
          <div className="flex items-center justify-between gap-4 pb-3 sm:pb-3.5 border-b border-border/60 min-h-[2rem]">
            <div className="flex items-center gap-2.5 font-sans text-[11px] sm:text-xs font-medium uppercase tracking-[0.2em] text-muted shrink-0">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
              <span>LIVE PLAYER AUCTION</span>
            </div>
            <span className="font-sans text-[11px] sm:text-xs font-medium uppercase tracking-[0.18em] text-text truncate text-right min-h-[1rem]">
              {hasLoadedSeason && activeSeason?.name ? activeSeason.name : ''}
            </span>
          </div>

          {/* 2. Center: single hollow Syne ExtraBold word that fades to a sage fill, plus small decorative balls */}
          <div className="flex flex-col items-center py-8 sm:py-10 lg:py-12">
            <HeroWord word={HERO_WORD} playIntro={playHeroIntro} />
            <HeroBalls />
          </div>

          {/* 3. Bottom Row with 1px hairline above it */}
          <div className="pt-5 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-h-[1.25rem] flex items-center flex-wrap font-sans text-[11px] sm:text-xs font-medium uppercase tracking-[0.16em] text-muted">
              {dataLineParts.map((part, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && (
                    <span aria-hidden="true" className="mx-2 text-muted/60 font-mono">
                      //
                    </span>
                  )}
                  {part}
                </React.Fragment>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:flex items-center gap-3 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={handleScrollToRosters}
                className="min-h-[44px] px-6 py-2.5 rounded-full bg-btn-bg text-btn-fg font-sans font-semibold text-xs sm:text-sm hover:opacity-90 transition-opacity motion-reduce:transition-none inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright whitespace-nowrap"
              >
                <span>Rosters</span>
                <ArrowDown size={15} weight="bold" />
              </button>
              <Link
                to="/teams"
                onMouseEnter={() => prefetchRoute('/teams')}
                onFocus={() => prefetchRoute('/teams')}
                onTouchStart={() => prefetchRoute('/teams')}
                className="min-h-[44px] px-6 py-2.5 rounded-full bg-surface/85 hover:bg-surface-2 text-text border border-border font-sans font-semibold text-xs sm:text-sm transition-colors motion-reduce:transition-none inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright whitespace-nowrap"
              >
                <span>Teams</span>
                <ArrowUpRight size={15} weight="bold" />
              </Link>
            </div>
          </div>
        </main>
      </ErrorBoundary>

      {/* Stadium Dot-Matrix Ticker wrapped in ErrorBoundary */}
      <ErrorBoundary name="TickerSection" fallback={null}>
        <div className="relative z-10">
          <TickerStrip
            items={carouselItems ?? undefined}
            speed={tickerSpeed}
            disableSelfFetch
          />
        </div>
      </ErrorBoundary>

      {/* Rosters Section wrapped in ErrorBoundary */}
      <ErrorBoundary name="RostersSection" fallback={null}>
        <div className="relative z-10">
          <SportCardsGrid
            playerCounts={playerCounts}
            sports={sports}
            countsLoaded={hasLoadedCounts}
          />
        </div>
      </ErrorBoundary>

      {/* Calm, unpinned site footer wrapped in ErrorBoundary */}
      <ErrorBoundary name="FooterSection" fallback={null}>
        <div className="relative z-10">
          <SiteFooter />
        </div>
      </ErrorBoundary>
    </div>
  )
}



