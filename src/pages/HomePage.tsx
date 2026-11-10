import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { HeaderBar } from '../components/HeaderBar'
import { NavigationMenu } from '../components/NavigationMenu'
import { TickerStrip } from '../components/TickerStrip'
import { SportCardsGrid } from '../components/SportCardsGrid'
import { SiteFooter } from '../components/SiteFooter'
import {
  getActiveSeason,
  getCarouselItems,
  getPlayers
} from '../lib/data'
import type { CarouselItem, Season } from '../lib/types'

export const HomePage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [carouselItems, setCarouselItems] = useState<string[]>([])
  const [playerCounts, setPlayerCounts] = useState({
    cricket: 0,
    futsal: 0,
    volleyball: 0
  })
  const shouldReduceMotion = useReducedMotion()
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        const active = await getActiveSeason()
        if (mounted) setActiveSeason(active)

        const items = await getCarouselItems(true)
        if (mounted && items.length > 0) {
          setCarouselItems(items.map((i: CarouselItem) => i.text))
        }

        if (active) {
          const players = await getPlayers(active.id)
          if (mounted) {
            setPlayerCounts({
              cricket: players.filter((p) => p.sport.toLowerCase() === 'cricket').length,
              futsal: players.filter((p) => p.sport.toLowerCase() === 'futsal').length,
              volleyball: players.filter((p) => p.sport.toLowerCase() === 'volleyball').length
            })
          }
        }
      } catch {
        // demo fallback
      }
    }
    loadData()
    return () => {
      mounted = false
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
      className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex flex-col justify-between selection:bg-[#047554] selection:text-white relative overflow-x-hidden"
    >
      {/* Scroll-aware fixed Header tile */}
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />

      {/* Fullscreen Circular Menu */}
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      {/* Main Hero Container */}
      <main className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:px-24 pt-32 sm:pt-40 pb-16 max-w-7xl mx-auto w-full">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-3 text-xs md:text-sm font-medium tracking-widest text-[#8E928C] uppercase mb-4"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#047554]" />
          <span>Live sports player auction platform</span>
          {activeSeason && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-[#CBD1CB]">{activeSeason.name}</span>
            </>
          )}
        </motion.div>

        {/* 3-Line Massive Headline */}
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
                  index === 1 ? 'text-[#CBD1CB]' : index === 2 ? 'text-white' : 'text-[#8E928C]'
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
          className="text-base sm:text-lg md:text-xl text-[#8E928C] max-w-xl mt-6 leading-relaxed"
        >
          Teams, purses and players, run from one control room and shown live on the big screen.
        </motion.p>
      </main>

      {/* Stadium Dot-Matrix Ticker fed from database with +15% font */}
      <TickerStrip items={carouselItems} />

      {/* Rosters Section with 3 sport cards */}
      <SportCardsGrid playerCounts={playerCounts} />

      {/* Calm, unpinned site footer */}
      <SiteFooter />
    </div>
  )
}
