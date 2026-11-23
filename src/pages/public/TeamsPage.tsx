import { logError } from '../../lib/logger'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaretRight, Shield, Users } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_BTN_PRIMARY,
  PUBLIC_CARD,
  PUBLIC_COUNT_PILL,
  PUBLIC_MAIN,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_SECTION_TITLE
} from '../../components/public/publicStyles'
import { SkeletonCard } from '../../components/ui'
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
      <style>{`
        .public-team-card-tinted {
          background-color: var(--surface);
          background-color: color-mix(in srgb, var(--team-color) 4%, var(--surface));
          border-color: var(--border);
          border-color: color-mix(in srgb, var(--team-color) 65%, transparent);
        }
        .public-team-card-tinted:hover,
        .public-team-card-tinted:focus-visible {
          border-color: var(--team-color);
        }
      `}</style>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      <main className={PUBLIC_MAIN}>
        <header className={PUBLIC_PAGE_HEADER}>
          <h1 className={PUBLIC_PAGE_TITLE}>Registered Teams</h1>
          <div
            aria-hidden={isLoading ? true : undefined}
            className={`flex flex-wrap items-center gap-2 min-h-[1.75rem] ${
              isLoading ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {activeSeason?.name && (
              <span className={PUBLIC_COUNT_PILL}>{activeSeason.name}</span>
            )}
            <span className={PUBLIC_COUNT_PILL}>
              {teams.length} {teams.length === 1 ? 'team' : 'teams'}
            </span>
            <span className={PUBLIC_COUNT_PILL}>
              {players.length} {players.length === 1 ? 'player' : 'players'}
            </span>
          </div>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} className="rounded-3xl h-56" />
            ))}
          </div>
        ) : !activeSeason || teams.length === 0 ? (
          <div className={`${PUBLIC_CARD} py-14 text-center max-w-lg mx-auto`}>
            <div className="w-12 h-12 rounded-full bg-surface-2 border border-border flex items-center justify-center mx-auto text-muted mb-4">
              <Shield size={24} weight="regular" />
            </div>
            <h3 className="font-syne font-bold text-xl text-text mb-1.5">
              No Active Teams
            </h3>
            <p className="text-sm text-muted leading-relaxed mb-6">
              No teams have been registered for the current season yet.
            </p>
            <Link
              to="/rosters"
              onMouseEnter={() => prefetchRoute('/rosters')}
              onFocus={() => prefetchRoute('/rosters')}
              onTouchStart={() => prefetchRoute('/rosters')}
              className={`${PUBLIC_BTN_PRIMARY} px-5 py-2.5 text-xs`}
            >
              Browse Player Rosters
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {groupedSports.map((group) => (
              <section key={group.sport} className="space-y-4">
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
                  <h2 className={PUBLIC_SECTION_TITLE}>
                    {group.sport}
                  </h2>
                  <span className={PUBLIC_COUNT_PILL}>
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
                        className={`group relative overflow-hidden rounded-3xl border-[1.5px] border-solid p-6 transition-[border-color] duration-150 flex flex-col justify-between min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
                          teamColor
                            ? 'public-team-card-tinted'
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
                                  className="w-13 h-13 rounded-2xl border border-border flex items-center justify-center font-syne font-bold text-base text-white shrink-0"
                                  style={{ backgroundColor: team.color || 'var(--accent-bright)' }}
                                >
                                  {team.short_code}
                                </div>
                              )}
                              <div className="min-w-0">
                                <h3 className="font-syne font-bold text-lg sm:text-xl text-text group-hover:text-accent-bright transition-colors tracking-tight truncate">
                                  {team.name}
                                </h3>
                                <span className="text-xs text-muted block truncate mt-0.5">
                                  {team.sport}
                                </span>
                              </div>
                            </div>

                            <span className="font-mono text-xs px-3 py-1 rounded-full bg-surface-2 border border-border text-muted shrink-0">
                              {team.short_code}
                            </span>
                          </div>

                          {/* Owner Info */}
                          <div className="py-3 border-y border-border flex items-center justify-between gap-2 text-xs">
                            <span className="text-muted shrink-0">Owner</span>
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
                            <CaretRight size={14} weight="regular" className="group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
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
