import React, { useEffect, useState } from 'react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SportCardsGrid } from '../../components/home/SportCardsGrid'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  getActiveSeason,
  getPublicPlayerSportRows,
  getSports
} from '../../lib/data'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import {
  isQueryFresh,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import { matchesSport } from '../../lib/utils'
import type { Season } from '../../types'
import type { SportSlug } from '../../lib/sports'

const DEFAULT_COUNTS: Record<SportSlug, number> = {
  cricket: 0,
  futsal: 0,
  volleyball: 0
}

export const RostersPage: React.FC = () => {
  const initialSeason = publicCache.activeSeason.value
  const initialCounts =
    (initialSeason && publicCache.playerCountsBySeason.get(initialSeason.id)) ||
    DEFAULT_COUNTS

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(initialSeason)
  const [playerCounts, setPlayerCounts] = useState<Record<SportSlug, number>>(initialCounts)

  useEffect(() => {
    let mounted = true
    const cacheKey = 'public:rostersPage'
    if (
      publicCache.activeSeason.loaded &&
      isQueryFresh(cacheKey) &&
      !shouldRevalidateQuery(cacheKey)
    ) {
      return () => {
        mounted = false
      }
    }

    async function loadData() {
      try {
        const [active, sportRows, sports] = await Promise.all([
          getActiveSeason(),
          getPublicPlayerSportRows(),
          getSports()
        ])
        if (Array.isArray(sports)) {
          publicCache.sports = { loaded: true, value: sports }
        }
        const prevSeason = publicCache.activeSeason.value
        const seasonChanged =
          !publicCache.activeSeason.loaded || hasDataChanged(prevSeason, active)
        publicCache.activeSeason = { loaded: true, value: active }
        if (mounted && seasonChanged) {
          setActiveSeason(active)
        }

        if (active) {
          const seasonRows = (sportRows ?? []).filter((r) => r.season_id === active.id)
          const nextCounts: Record<SportSlug, number> = {
            cricket: seasonRows.filter((p) => matchesSport(p.sport, 'cricket')).length,
            futsal: seasonRows.filter((p) => matchesSport(p.sport, 'futsal')).length,
            volleyball: seasonRows.filter((p) => matchesSport(p.sport, 'volleyball')).length
          }
          const prevCounts = publicCache.playerCountsBySeason.get(active.id)
          const countsChanged = !prevCounts || hasDataChanged(prevCounts, nextCounts)
          publicCache.playerCountsBySeason.set(active.id, nextCounts)
          setCachedQuery(cacheKey, nextCounts)
          if (mounted && countsChanged) {
            setPlayerCounts(nextCounts)
          }
        }
      } catch (err) {
        console.error(
          'Failed to load rosters page data:',
          err instanceof Error ? err.message : err,
          err
        )
      }
    }
    void loadData()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-on-accent relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-16 lg:px-24 pt-36 sm:pt-44 md:pt-48 pb-16">
        <div className="mb-10">
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
            ATHLETIC DISCIPLINE DIRECTORY
          </span>
          <h1 className="font-syne font-extrabold text-4xl sm:text-5xl md:text-6xl text-text tracking-tight">
            Official Rosters
          </h1>
          <p className="text-muted text-base md:text-lg mt-3 max-w-2xl leading-relaxed">
            Select a discipline below to view registered student athletes, squad rosters, playing roles, and academic batches.
          </p>
        </div>

        <SportCardsGrid playerCounts={playerCounts} />
      </main>

      <SiteFooter />
    </div>
  )
}
