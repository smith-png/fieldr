import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_COUNT_PILL,
  PUBLIC_MAIN,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE
} from '../../components/public/publicStyles'
import { getActiveSeason } from '../../lib/data/seasons'
import { getPublicPlayerSportRows } from '../../lib/data/players'
import { getSports } from '../../lib/data/teams'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import { SPORTS, type SportSlug } from '../../lib/sports'
import { matchesSport } from '../../lib/utils'
import type { Season } from '../../types'

const DEFAULT_COUNTS: Record<SportSlug, number> = {
  cricket: 0,
  futsal: 0,
  volleyball: 0
}

const SPORT_PHOTOS: Record<
  SportSlug,
  { src: string; alt: string; objectPosition: string; width: number; height: number }
> = {
  cricket: {
    src: '/images/rosters/cricket.jpg',
    alt: 'Cricket ball resting on grass',
    objectPosition: '70% 70%',
    width: 900,
    height: 602
  },
  futsal: {
    src: '/images/rosters/futsal.jpg',
    alt: 'Futsal ball on grass pitch',
    objectPosition: '75% 45%',
    width: 900,
    height: 526
  },
  volleyball: {
    src: '/images/rosters/volleyball.jpg',
    alt: 'Volleyball players at the net',
    objectPosition: '50% 50%',
    width: 900,
    height: 519
  }
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
          publicCache.activeSeason.loaded
            ? Promise.resolve(publicCache.activeSeason.value)
            : getActiveSeason(),
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
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className={PUBLIC_MAIN}>
        <header className={PUBLIC_PAGE_HEADER}>
          <h1 className={PUBLIC_PAGE_TITLE}>Official Rosters</h1>
          {activeSeason?.name && (
            <span className={PUBLIC_COUNT_PILL}>{activeSeason.name}</span>
          )}
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SPORTS.map((sport) => {
            const slug = sport.slug as SportSlug
            const photo = SPORT_PHOTOS[slug]
            const count = playerCounts[slug] ?? 0

            return (
              <Link
                key={sport.slug}
                to={`/rosters/${sport.slug}`}
                onMouseEnter={() => prefetchRoute(`/rosters/${sport.slug}`)}
                onFocus={() => prefetchRoute(`/rosters/${sport.slug}`)}
                onTouchStart={() => prefetchRoute(`/rosters/${sport.slug}`)}
                className="group bg-surface border border-border hover:border-accent-bright rounded-3xl p-4 sm:p-5 flex flex-col gap-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright min-w-0"
              >
                <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-surface-2 border border-border">
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                    style={{ objectPosition: photo.objectPosition }}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <h2 className="font-syne font-bold text-xl text-text group-hover:text-accent-bright transition-colors tracking-tight truncate">
                      {sport.label}
                    </h2>
                    <span className="text-xs font-mono text-muted tabular-nums">
                      {count} {count === 1 ? 'athlete' : 'athletes'}
                    </span>
                  </div>

                  <span
                    aria-hidden="true"
                    className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted group-hover:text-accent-bright group-hover:border-accent-bright/40 transition-colors shrink-0"
                  >
                    <ArrowUpRight size={17} weight="regular" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
