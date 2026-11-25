import { logError } from '../../lib/logger'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { SportArt, useInViewOnce } from '../../components/home/SportArt'
import {
  PUBLIC_FOLIO,
  PUBLIC_KICKER,
  PUBLIC_MAIN,
  PUBLIC_META_ROW,
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

interface RosterSportCardProps {
  slug: SportSlug
  label: string
  index: number
  count: number
}

const RosterSportCard: React.FC<RosterSportCardProps> = ({ slug, label, index, count }) => {
  const [ref, seen] = useInViewOnce<HTMLAnchorElement>(0.3)
  const delay = index * 0.12
  const indexLabel = String(index + 1).padStart(2, '0')

  return (
    <Link
      ref={ref}
      to={`/rosters/${slug}`}
      onMouseEnter={() => prefetchRoute(`/rosters/${slug}`)}
      onFocus={() => prefetchRoute(`/rosters/${slug}`)}
      onTouchStart={() => prefetchRoute(`/rosters/${slug}`)}
      style={{ ['--sa-base' as string]: `${delay}s` } as React.CSSProperties}
      className={`sa-card ${
        seen ? 'sa-card-play' : ''
      } pub-card-lift group bg-surface border border-border hover:border-accent-bright rounded-2xl p-3 sm:p-5 flex flex-col gap-3 sm:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright min-w-0`}
    >
      <div className="relative w-full aspect-[16/7] sm:aspect-[16/10] rounded-2xl overflow-hidden bg-surface-2 border border-border">
        <SportArt slug={slug} play={seen} delay={delay} className="w-full h-full block" />
      </div>

      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="sa-text flex items-baseline gap-2.5">
            <span className={PUBLIC_FOLIO}>{indexLabel}</span>
            <h2 className="font-syne font-bold text-lg sm:text-xl text-text group-hover:text-accent-bright transition-colors tracking-tight truncate">
              {label}
            </h2>
          </div>
          <span className="sa-text block text-xs font-mono text-muted tabular-nums mt-0.5 pl-6">
            {count} {count === 1 ? 'athlete' : 'athletes'}
          </span>
        </div>

        <span
          aria-hidden="true"
          className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted group-hover:text-accent-bright group-hover:border-accent-bright/50 transition-colors shrink-0"
        >
          <ArrowUpRight
            size={17}
            weight="regular"
            className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-150 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0"
          />
        </span>
      </div>
    </Link>
  )
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
        logError(
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
      />

      <main className={PUBLIC_MAIN}>
        <header className={PUBLIC_PAGE_HEADER}>
          <div className="min-w-0">
            <span className={PUBLIC_KICKER}>TOURNAMENT SQUADS</span>
            <h1 className={PUBLIC_PAGE_TITLE}>Official Rosters</h1>
          </div>
          <div className={PUBLIC_META_ROW}>
            {activeSeason?.name && (
              <>
                <span className="text-text font-medium">{activeSeason.name}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{SPORTS.length} sports</span>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {SPORTS.map((sport, index) => (
            <RosterSportCard
              key={sport.slug}
              slug={sport.slug as SportSlug}
              label={sport.label}
              index={index}
              count={playerCounts[sport.slug as SportSlug] ?? 0}
            />
          ))}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
