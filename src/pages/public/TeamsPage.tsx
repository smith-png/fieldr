import { logError } from '../../lib/logger'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaretRight, Shield, Users } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_BTN_PRIMARY,
  PUBLIC_FOLIO,
  PUBLIC_KICKER,
  PUBLIC_MAIN,
  PUBLIC_META_ROW,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_SECTION_HEADER,
  PUBLIC_SECTION_TITLE
} from '../../components/public/publicStyles'
import { EmptyState, SkeletonCard } from '../../components/ui'
import { getActiveSeason } from '../../lib/data/seasons'
import { getPublicPlayersBySeason } from '../../lib/data/players'
import { getPublicTeams } from '../../lib/data/teams'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import { getValidTeamColor } from '../../lib/utils'
import type { PublicPlayer, PublicTeam, Season } from '../../types'

function getCachedTeamsPageState(): {
  hasCache: boolean
  season: Season | null
  teams: PublicTeam[]
  players: PublicPlayer[]
} {
  if (!publicCache.activeSeason.loaded) {
    return { hasCache: false, season: null, teams: [], players: [] }
  }
  const season = publicCache.activeSeason.value
  if (!season) {
    return { hasCache: true, season: null, teams: [], players: [] }
  }
  const cachedTeams = publicCache.teamsBySeason.get(season.id)
  const cachedPlayers = publicCache.playersBySeason.get(season.id)
  if (cachedTeams && cachedPlayers) {
    return {
      hasCache: true,
      season,
      teams: cachedTeams,
      players: cachedPlayers
    }
  }
  return {
    hasCache: false,
    season,
    teams: cachedTeams || [],
    players: cachedPlayers || []
  }
}

const SPORT_ORDER = ['Cricket', 'Futsal', 'Volleyball']

export const TeamsPage: React.FC = () => {
  const initial = getCachedTeamsPageState()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(initial.season)
  const [teams, setTeams] = useState<PublicTeam[]>(initial.teams)
  const [players, setPlayers] = useState<PublicPlayer[]>(initial.players)
  const [isLoading, setIsLoading] = useState<boolean>(!initial.hasCache)

  useEffect(() => {
    let mounted = true
    const cacheKey = 'public:teamsPage'
    const cached = getCachedTeamsPageState()
    if (cached.hasCache) {
      setIsLoading(false)
      if (isQueryFresh(cacheKey) && !shouldRevalidateQuery(cacheKey)) {
        return () => {
          mounted = false
        }
      }
    } else {
      setIsLoading(true)
    }

    async function loadData() {
      try {
        const knownSeasonId = publicCache.activeSeason.value?.id
        const [season, preloadedTeams, preloadedPlayers] = await Promise.all([
          publicCache.activeSeason.loaded
            ? Promise.resolve(publicCache.activeSeason.value)
            : getActiveSeason(),
          knownSeasonId ? getPublicTeams(knownSeasonId) : Promise.resolve(null),
          knownSeasonId ? getPublicPlayersBySeason(knownSeasonId) : Promise.resolve(null)
        ])

        const prevSeason = publicCache.activeSeason.value
        const seasonChanged =
          !publicCache.activeSeason.loaded || hasDataChanged(prevSeason, season)
        publicCache.activeSeason = { loaded: true, value: season }
        if (mounted && seasonChanged) {
          setActiveSeason(season)
        }

        if (season) {
          const [teamList, playerList] =
            knownSeasonId === season.id && preloadedTeams && preloadedPlayers
              ? [preloadedTeams, preloadedPlayers]
              : await Promise.all([
                  getPublicTeams(season.id),
                  getPublicPlayersBySeason(season.id)
                ])
          const prevTeams = publicCache.teamsBySeason.get(season.id)
          const prevPlayers = publicCache.playersBySeason.get(season.id)
          const teamsChanged = !prevTeams || hasDataChanged(prevTeams, teamList)
          const playersChanged =
            !prevPlayers || hasDataChanged(prevPlayers, playerList)

          publicCache.teamsBySeason.set(season.id, teamList)
          publicCache.playersBySeason.set(season.id, playerList)
          setCachedQuery(cacheKey, true)

          if (mounted) {
            if (teamsChanged) setTeams(teamList)
            if (playersChanged) setPlayers(playerList)
          }
        } else if (mounted && teams.length > 0) {
          setTeams([])
          setPlayers([])
        }
      } catch (err) {
        logError(
          'Failed to load teams page data:',
          err instanceof Error ? err.message : err,
          err
        )
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void loadData()
    return () => {
      mounted = false
    }
  }, [])

  const groupedSports = SPORT_ORDER.map((sportName) => ({
    sport: sportName,
    teams: teams.filter(
      (t) => t.sport.trim().toLowerCase() === sportName.toLowerCase()
    )
  })).filter((group) => group.teams.length > 0)

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
            <span className={PUBLIC_KICKER}>FRANCHISE DIRECTORY</span>
            <h1 className={PUBLIC_PAGE_TITLE}>Registered Teams</h1>
          </div>
          <div
            aria-hidden={isLoading ? true : undefined}
            className={`${PUBLIC_META_ROW} min-h-[1.5rem] ${
              isLoading ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {activeSeason?.name && (
              <>
                <span className="text-text font-medium">{activeSeason.name}</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>
              {teams.length} {teams.length === 1 ? 'team' : 'teams'}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {players.length} {players.length === 1 ? 'player' : 'players'}
            </span>
          </div>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="rounded-2xl h-56" />
            ))}
          </div>
        ) : !activeSeason || teams.length === 0 ? (
          <EmptyState
            icon={Shield}
            statusLabel="AWAITING LOT"
            title="No Active Teams"
            description="No teams have been registered for the current season yet."
            action={
              <Link
                to="/rosters"
                onMouseEnter={() => prefetchRoute('/rosters')}
                onFocus={() => prefetchRoute('/rosters')}
                onTouchStart={() => prefetchRoute('/rosters')}
                className={`${PUBLIC_BTN_PRIMARY} px-5 py-2.5 text-xs`}
              >
                Browse Player Rosters
              </Link>
            }
            className="max-w-lg mx-auto"
          />
        ) : (
          <div className="space-y-12">
            {groupedSports.map((group, groupIndex) => (
              <section key={group.sport} className="space-y-5">
                <div className={PUBLIC_SECTION_HEADER}>
                  <div className="flex items-baseline gap-3">
                    <span className={PUBLIC_FOLIO}>
                      {String(groupIndex + 1).padStart(2, '0')}
                    </span>
                    <h2 className={PUBLIC_SECTION_TITLE}>
                      {group.sport}
                    </h2>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {group.teams.length} {group.teams.length === 1 ? 'team' : 'teams'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {group.teams.map((team) => {
                    const assignedCount = players.filter((p) => p.team_id === team.id).length
                    const teamPath = `/season/${team.season_id}/teams/${team.id}`
                    const teamColor = getValidTeamColor(team.color)
                    return (
                      <Link
                        key={team.id}
                        to={teamPath}
                        onMouseEnter={() => prefetchRoute(teamPath)}
                        onFocus={() => prefetchRoute(teamPath)}
                        onTouchStart={() => prefetchRoute(teamPath)}
                        style={
                          teamColor
                            ? ({ '--team-color': teamColor } as React.CSSProperties)
                            : undefined
                        }
                        className={`pub-card-lift group relative overflow-hidden rounded-2xl border border-solid p-6 flex flex-col justify-between min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
                          teamColor
                            ? 'pub-team-card'
                            : 'bg-surface border-border hover:border-accent-bright focus-visible:border-accent-bright'
                        }`}
                      >
                        <div>
                          {/* Header with Logo and Team Name */}
                          <div className="flex items-start justify-between gap-3 mb-5">
                            <div className="flex items-center gap-3.5 min-w-0">
                              {team.logo_url ? (
                                <img
                                  src={team.logo_url}
                                  alt={team.name}
                                  width={52}
                                  height={52}
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  className="w-13 h-13 rounded-2xl object-contain bg-surface-2 border border-border p-1 shrink-0"
                                />
                              ) : (
                                <div
                                  className="w-13 h-13 rounded-2xl border border-border flex items-center justify-center font-syne font-bold text-base text-on-accent shrink-0"
                                  style={{ backgroundColor: team.color || 'var(--accent-bright)' }}
                                >
                                  {team.short_code}
                                </div>
                              )}
                              <div className="min-w-0">
                                <h3 className="font-syne font-bold text-lg sm:text-xl text-text group-hover:text-accent-bright transition-colors tracking-tight leading-tight line-clamp-2 break-words text-balance">
                                  {team.name}
                                </h3>
                                <span className="text-xs text-muted block truncate mt-0.5">
                                  {team.sport}
                                </span>
                              </div>
                            </div>

                            <span className="font-mono text-xs tracking-[0.12em] uppercase text-muted tabular-nums shrink-0 pt-0.5">
                              {team.short_code}
                            </span>
                          </div>

                          {/* Owner Info */}
                          <div className="py-3 border-y border-border flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted shrink-0">
                              Owner
                            </span>
                            <span className="text-text font-medium truncate">
                              {team.owner_display_name || 'Unassigned'}
                            </span>
                          </div>
                        </div>

                        {/* Squad Metrics */}
                        <div className="flex items-center justify-between gap-2 pt-4 mt-1">
                          <div className="flex items-center gap-2 text-xs text-muted">
                            <Users size={15} weight="regular" className="text-accent-bright shrink-0" />
                            <span className="font-mono font-semibold text-text tabular-nums">
                              {assignedCount} {assignedCount === 1 ? 'player' : 'players'}
                            </span>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-bright shrink-0">
                            <span>View Squad</span>
                            <CaretRight size={14} weight="regular" className="group-hover:translate-x-0.5 transition-transform duration-150 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
