import React, { useEffect, useState } from 'react'
import { HeaderBar } from '../components/HeaderBar'
import { NavigationMenu } from '../components/NavigationMenu'
import { SportCardsGrid } from '../components/SportCardsGrid'
import { SiteFooter } from '../components/SiteFooter'
import { getActiveSeason, getPlayers } from '../lib/data'
import type { Season } from '../lib/types'

export const RostersPage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [playerCounts, setPlayerCounts] = useState({
    cricket: 0,
    futsal: 0,
    volleyball: 0
  })

  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        const active = await getActiveSeason()
        if (mounted) setActiveSeason(active)
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

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex flex-col justify-between selection:bg-[#047554] selection:text-white relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-16 lg:px-24 pt-36 sm:pt-44 md:pt-48 pb-16">
        <div className="mb-10">
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-2">
            ATHLETIC DISCIPLINE DIRECTORY
          </span>
          <h1 className="font-syne font-extrabold text-4xl sm:text-5xl md:text-6xl text-[#F0F2EE] tracking-tight">
            Official Rosters
          </h1>
          <p className="text-[#8E928C] text-base md:text-lg mt-3 max-w-2xl leading-relaxed">
            Select a discipline below to view registered student athletes, squad rosters, playing roles, and academic batches.
          </p>
        </div>

        <SportCardsGrid playerCounts={playerCounts} />
      </main>

      <SiteFooter />
    </div>
  )
}
