import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { HomeBackdrop } from '../../components/home/HomeBackdrop'
import { TickerStrip } from '../../components/home/TickerStrip'
import { ErrorBoundary } from '../../components/layout/ErrorBoundary'
import {
  DEFAULT_TICKER_SPEED,
  FALLBACK_CAROUSEL_TEXTS,
  getActiveSeason,
  getCarouselItems,
  getPublicPlayerSportRows,
  getSports,
  getTickerSpeedSetting,
  isHomeCacheFresh,
  normalizeTickerSpeed,
  readCachedPublicHome,
  readCachedPublicTicker,
  removeCachedPublicTicker,
  sanitizeTickerTexts,
  writeCachedPublicHome,
  writeCachedPublicTicker
} from '../../lib/data'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import { matchesSport } from '../../lib/utils'
import type { Season, Sport } from '../../types'
import type { SportSlug } from '../../lib/sports'

const LazyNavigationMenu = React.lazy(() =>
  import('../../components/layout/NavigationMenu').then((m) => ({
    default: m.NavigationMenu
  }))
)

const LazySportCardsGrid = React.lazy(() =>
  import('../../components/home/SportCardsGrid').then((m) => ({
    default: m.SportCardsGrid
  }))
)

const LazySiteFooter = React.lazy(() =>
  import('../../components/layout/SiteFooter').then((m) => ({
    default: m.SiteFooter
  }))
)

const DEFAULT_COUNTS: Record<SportSlug, number> = {
  cricket: 0,
  futsal: 0,
  volleyball: 0
}

const HERO_LINES = ['DRAFT.', 'BID.', 'WIN.'] as const

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
  const [carouselItems, setCarouselItems] = useState<string[] | null>(initialCarousel)
  const [tickerSpeed, setTickerSpeed] = useState<number>(initialTickerSpeed)
  const [playerCounts, setPlayerCounts] = useState<Record<SportSlug, number>>(initialCounts)
  const [sports, setSports] = useState<Sport[]>(initialSports)
  const shouldReduceMotion = useReducedMotion()

  const [animateHeroEntrance] = useState<boolean>(() => !hasPlayedHomeHeroEntrance)
  useEffect(() => {
    hasPlayedHomeHeroEntrance = true
  }, [])

  const heroParallaxRef = useRef<HTMLDivElement>(null)
  const parallaxFrameRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (parallaxFrameRef.current !== null) {
        cancelAnimationFrame(parallaxFrameRef.current)
      }
    }
  }, [])

  const handleOpenMenu = useCallback(() => {
    setHasOpenedMenu(true)
    setIsMenuOpen(true)
  }, [])

  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false)
  }, [])

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
      // Start all independent home page requests at the exact same time in parallel
      const [
        seasonResult,
        playerRowsResult,
        sportsResult,
        carouselResult,
        tickerSpeedResult
      ] = await Promise.allSettled([
        getActiveSeason(),
        getPublicPlayerSportRows(),
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
      }

      // 2. Resolve player counts per sport (fallback to cached counts or 0 if failed)
      let resolvedCounts: Record<SportSlug, number> = initialCounts
      if (resolvedSeason && resolvedSeason.id) {
        if (
          playerRowsResult.status === 'fulfilled' &&
          Array.isArray(playerRowsResult.value)
        ) {
          const seasonRows = playerRowsResult.value.filter(
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
        }
      } else if (seasonResult.status === 'fulfilled' && !resolvedSeason) {
        resolvedCounts = DEFAULT_COUNTS
        setPlayerCounts((prev) =>
          hasDataChanged(prev, DEFAULT_COUNTS) ? DEFAULT_COUNTS : prev
        )
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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (shouldReduceMotion || !heroParallaxRef.current) return
      const clientX = e.clientX
      const clientY = e.clientY
      if (parallaxFrameRef.current !== null) {
        cancelAnimationFrame(parallaxFrameRef.current)
      }
      parallaxFrameRef.current = requestAnimationFrame(() => {
        parallaxFrameRef.current = null
        if (!heroParallaxRef.current) return
        const { innerWidth, innerHeight } = window
        const x = (clientX / innerWidth - 0.5) * 16
        const y = (clientY / innerHeight - 0.5) * 16
        heroParallaxRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      })
    },
    [shouldReduceMotion]
  )

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-white relative overflow-x-hidden"
    >
      {/* Muted inline vector sports backdrop */}
      <HomeBackdrop />

      {/* Scroll-aware fixed Header tile */}
      <HeaderBar onOpenMenu={handleOpenMenu} />

      {/* Fullscreen Circular Menu (lazy-loaded until opened) */}
      <Suspense fallback={null}>
        {(isMenuOpen || hasOpenedMenu) && (
          <LazyNavigationMenu
            isOpen={isMenuOpen}
            onClose={handleCloseMenu}
            activeSeason={activeSeason}
          />
        )}
      </Suspense>

      {/* Main Hero Container wrapped in ErrorBoundary */}
      <ErrorBoundary name="HeroSection" fallback={null}>
        <main className="relative z-10 flex-1 flex flex-col justify-center px-6 md:px-16 lg:px-24 pt-32 sm:pt-40 pb-16 max-w-7xl mx-auto w-full">
          {/* Eyebrow */}
          <motion.div
            initial={animateHeroEntrance ? { opacity: 0, y: 15 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 text-xs md:text-sm font-medium tracking-widest text-muted uppercase mb-4"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent-bright" />
            <span>Live sports player auction platform</span>
            {activeSeason && (
              <>
                <span className="text-border">·</span>
                <span className="text-text font-semibold">{activeSeason.name}</span>
              </>
            )}
          </motion.div>

          {/* 3-Line Massive Headline with light/dark tonal hierarchy */}
          <div
            ref={heroParallaxRef}
            className="flex flex-col gap-0 select-none my-2 w-full max-w-full transition-transform duration-200 ease-out"
          >
            {HERO_LINES.map((line, index) => (
              <div key={line} className="overflow-hidden w-full max-w-full py-1 pr-2">
                <motion.h1
                  initial={animateHeroEntrance ? { y: '100%', opacity: 0 } : false}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    duration: 0.8,
                    delay: 0.1 + index * 0.12,
                    ease: [0.22, 1, 0.36, 1]
                  }}
                  className={`font-syne font-extrabold text-[clamp(2.25rem,11vw,8.25rem)] tracking-tight leading-[0.95] whitespace-nowrap ${
                    index === 2
                      ? 'text-text'
                      : index === 1
                      ? 'text-text/70'
                      : 'text-muted'
                  }`}
                >
                  {line}
                </motion.h1>
              </div>
            ))}
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
          <Suspense
            fallback={
              <section
                aria-hidden="true"
                className="w-full max-w-7xl mx-auto px-6 md:px-16 lg:px-24 py-16 md:py-24 min-h-[1120px] md:min-h-[540px]"
              />
            }
          >
            <LazySportCardsGrid playerCounts={playerCounts} sports={sports} />
          </Suspense>
        </div>
      </ErrorBoundary>

      {/* Calm, unpinned site footer wrapped in ErrorBoundary */}
      <ErrorBoundary name="FooterSection" fallback={null}>
        <div className="relative z-10">
          <Suspense
            fallback={
              <footer
                aria-hidden="true"
                className="border-t border-border py-12 px-6 md:px-16 lg:px-24 bg-[#F1F1F2] dark:bg-[#171817] min-h-[148px] md:min-h-[121px]"
              />
            }
          >
            <LazySiteFooter />
          </Suspense>
        </div>
      </ErrorBoundary>
    </div>
  )
}


