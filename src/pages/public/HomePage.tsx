import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { TickerStrip } from '../../components/home/TickerStrip'
import { SportCardsGrid } from '../../components/home/SportCardsGrid'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { ErrorBoundary } from '../../components/layout/ErrorBoundary'
import {
  FALLBACK_CAROUSEL_TEXTS,
  getActiveSeason,
  getCarouselItems,
  getPlayers,
  subscribeToCarouselItems
} from '../../lib/data'
import type { CarouselItem, Season } from '../../types'
import type { SportSlug } from '../../lib/sports'

export const HomePage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [carouselItems, setCarouselItems] = useState<string[] | null>(FALLBACK_CAROUSEL_TEXTS)
  const [playerCounts, setPlayerCounts] = useState<Record<SportSlug, number>>({
    cricket: 0,
    futsal: 0,
    volleyball: 0
  })
  const shouldReduceMotion = useReducedMotion()
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let mounted = true

    async function loadData() {
      // 1. Load active season (safe fallback null)
      let active: Season | null = null
      try {
        active = await getActiveSeason()
        if (mounted) setActiveSeason(active)
      } catch (err) {
        console.error('Failed to load active season on home page:', err)
        if (mounted) setActiveSeason(null)
      }

      // 2. Load player counts (safe fallback 0)
      if (active && active.id) {
        try {
          const players = await getPlayers(active.id)
          if (mounted) {
            const list = Array.isArray(players) ? players : []
            setPlayerCounts({
              cricket: list.filter((p) => p && typeof p.sport === 'string' && p.sport.toLowerCase() === 'cricket').length,
              futsal: list.filter((p) => p && typeof p.sport === 'string' && p.sport.toLowerCase() === 'futsal').length,
              volleyball: list.filter((p) => p && typeof p.sport === 'string' && p.sport.toLowerCase() === 'volleyball').length
            })
          }
        } catch (err) {
          console.error('Failed to load player counts on home page:', err)
          if (mounted) {
            setPlayerCounts({ cricket: 0, futsal: 0, volleyball: 0 })
          }
        }
      } else {
        if (mounted) {
          setPlayerCounts({ cricket: 0, futsal: 0, volleyball: 0 })
        }
      }

      // 3. Load carousel items with fallback on failure/empty/malformed result
      try {
        const items = await getCarouselItems(true)
        if (mounted) {
          if (!items || !Array.isArray(items) || items.length === 0) {
            setCarouselItems(FALLBACK_CAROUSEL_TEXTS)
          } else {
            const texts = items
              .map((i: CarouselItem) => (i && typeof i.text === 'string' ? i.text.trim() : ''))
              .filter((t: string) => t.length > 0)
            setCarouselItems(texts.length > 0 ? texts : FALLBACK_CAROUSEL_TEXTS)
          }
        }
      } catch (err) {
        console.error('Home page ticker load error, applying fallback:', err)
        if (mounted) {
          setCarouselItems(FALLBACK_CAROUSEL_TEXTS)
        }
      }
    }

    loadData()

    // Subscribe to realtime changes with defensive parsing and fallback
    const unsubscribeCarousel = subscribeToCarouselItems((items) => {
      if (!mounted) return
      try {
        if (!items || !Array.isArray(items) || items.length === 0) {
          setCarouselItems(FALLBACK_CAROUSEL_TEXTS)
        } else {
          const texts = items
            .map((i: CarouselItem) => (i && typeof i.text === 'string' ? i.text.trim() : ''))
            .filter((t: string) => t.length > 0)
          setCarouselItems(texts.length > 0 ? texts : FALLBACK_CAROUSEL_TEXTS)
        }
      } catch (err) {
        console.error('Error in realtime carousel update, applying fallback:', err)
        setCarouselItems(FALLBACK_CAROUSEL_TEXTS)
      }
    })

    return () => {
      mounted = false
      unsubscribeCarousel()
    }
  }, [])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return
    const { innerWidth, innerHeight } = window
    const x = (e.clientX / innerWidth - 0.5) * 16
    const y = (e.clientY / innerHeight - 0.5) * 16
    setMousePos({ x, y })
  }

  const heroLines = ['DRAFT.', 'BID.', 'WIN.']

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-white relative overflow-x-hidden"
    >
      {/* Scroll-aware fixed Header tile */}
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />

      {/* Fullscreen Circular Menu */}
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      {/* Main Hero Container wrapped in ErrorBoundary */}
      <ErrorBoundary name="HeroSection" fallback={null}>
        <main className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:px-24 pt-32 sm:pt-40 pb-16 max-w-7xl mx-auto w-full">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
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
          <motion.div
            style={
              !shouldReduceMotion
                ? {
                    transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0)`
                  }
                : undefined
            }
            className="flex flex-col gap-0 select-none my-2 transition-transform duration-200 ease-out"
          >
            {heroLines.map((line, index) => (
              <div key={line} className="overflow-hidden">
                <motion.h1
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    duration: 0.8,
                    delay: 0.1 + index * 0.12,
                    ease: [0.22, 1, 0.36, 1]
                  }}
                  className={`font-syne font-extrabold text-6xl sm:text-8xl md:text-9xl lg:text-[10.5rem] tracking-tighter leading-[0.88] ${
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
          </motion.div>

          {/* Supporting Copy */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-base sm:text-lg md:text-xl text-muted max-w-xl mt-6 leading-relaxed"
          >
            Teams, purses and players, run from one control room and shown live on the big screen.
          </motion.p>
        </main>
      </ErrorBoundary>

      {/* Stadium Dot-Matrix Ticker wrapped in ErrorBoundary */}
      <ErrorBoundary name="TickerSection" fallback={null}>
        <TickerStrip items={carouselItems ?? undefined} />
      </ErrorBoundary>

      {/* Rosters Section wrapped in ErrorBoundary */}
      <ErrorBoundary name="RostersSection" fallback={null}>
        <SportCardsGrid playerCounts={playerCounts} />
      </ErrorBoundary>

      {/* Calm, unpinned site footer wrapped in ErrorBoundary */}
      <ErrorBoundary name="FooterSection" fallback={null}>
        <SiteFooter />
      </ErrorBoundary>
    </div>
  )
}

