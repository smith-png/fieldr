import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Funnel } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { RosterPlayerCard, RosterScoutModal } from '../../components/roster'
import {
  getActiveSeason,
  getPublicPlayersPaged,
  getPublicTeams,
  getRolesForSport,
  getSports
} from '../../lib/data'
import { ACADEMIC_YEAR_VALUES } from '../../lib/academicYears'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import type { PublicPlayer, PublicTeam, Season } from '../../types'

const ACADEMIC_YEAR_FILTER_OPTIONS = ['All', ...ACADEMIC_YEAR_VALUES] as const

function getRosterQueryKey(sport: string, year: string, role: string): string {
  return `${sport}::${year}::${role}`
}

export const RosterSportPage: React.FC = () => {
  const { sport = '' } = useParams<{ sport: string }>()
  const normalizedSport = sport.toLowerCase().trim()

  const initialSportInfo = publicCache.rosterSportInfo.get(normalizedSport)
  const initialQueryKey = getRosterQueryKey(normalizedSport, 'All', 'All')
  const initialCachedQuery = publicCache.rosterPagedQueries.get(initialQueryKey)
  const initialSeason = publicCache.activeSeason.value
  const initialTeams = initialSeason
    ? publicCache.teamsBySeason.get(initialSeason.id) || []
    : []

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(initialSeason)
  const [teams, setTeams] = useState<PublicTeam[]>(initialTeams)
  const [selectedYear, setSelectedYear] = useState<string>('All')
  const [selectedRole, setSelectedRole] = useState<string>('All')

  // Dynamic sport & roles loaded from the sports table in database
  const [sportName, setSportName] = useState<string>(initialSportInfo?.name || '')
  const [roles, setRoles] = useState<string[]>(initialSportInfo?.roles || [])
  const [isSportChecked, setIsSportChecked] = useState<boolean>(Boolean(initialSportInfo))
  const [isSportValid, setIsSportValid] = useState<boolean>(
    initialSportInfo ? initialSportInfo.valid : true
  )

  const [players, setPlayers] = useState<PublicPlayer[]>(
    initialCachedQuery ? initialCachedQuery.players : []
  )
  const [totalCount, setTotalCount] = useState<number>(
    initialCachedQuery ? initialCachedQuery.totalCount : 0
  )
  const [hasMore, setHasMore] = useState<boolean>(
    initialCachedQuery ? initialCachedQuery.hasMore : false
  )
  const [isLoading, setIsLoading] = useState<boolean>(!initialCachedQuery)
  const [isFilterLoading, setIsFilterLoading] = useState<boolean>(false)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [hasLoadedSportOnce, setHasLoadedSportOnce] = useState<boolean>(
    Boolean(initialCachedQuery)
  )

  // Expanded modal player
  const [expandedPlayer, setExpandedPlayer] = useState<PublicPlayer | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef<number>(0)
  const prevSportRef = useRef<string>(normalizedSport)

  const handleCloseModal = useCallback(() => {
    setExpandedPlayer(null)
  }, [])

  // Synchronize state when navigating between different sport routes
  useEffect(() => {
    if (prevSportRef.current === normalizedSport) return
    prevSportRef.current = normalizedSport

    setSelectedRole('All')
    setSelectedYear('All')
    setExpandedPlayer(null)

    const cachedInfo = publicCache.rosterSportInfo.get(normalizedSport)
    if (cachedInfo) {
      setSportName(cachedInfo.name)
      setRoles(cachedInfo.roles)
      setIsSportValid(cachedInfo.valid)
      setIsSportChecked(true)
    } else {
      setIsSportChecked(false)
      setIsSportValid(true)
    }

    const defaultKey = getRosterQueryKey(normalizedSport, 'All', 'All')
    const cachedQuery = publicCache.rosterPagedQueries.get(defaultKey)
    if (cachedQuery) {
      setPlayers(cachedQuery.players)
      setTotalCount(cachedQuery.totalCount)
      setHasMore(cachedQuery.hasMore)
      setIsLoading(false)
      setIsFilterLoading(false)
      setHasLoadedSportOnce(true)
    } else {
      setPlayers([])
      setTotalCount(0)
      setHasMore(false)
      setIsLoading(true)
      setIsFilterLoading(false)
      setHasLoadedSportOnce(false)
    }
  }, [normalizedSport])

  // Load initial season and public teams data
  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const season = await getActiveSeason()
        const prevSeason = publicCache.activeSeason.value
        const seasonChanged =
          !publicCache.activeSeason.loaded || hasDataChanged(prevSeason, season)
        publicCache.activeSeason = { loaded: true, value: season }
        if (mounted && seasonChanged) {
          setActiveSeason(season)
        }

        if (season) {
          const publicTeams = await getPublicTeams(season.id)
          const prevTeams = publicCache.teamsBySeason.get(season.id)
          const teamsChanged =
            !prevTeams || hasDataChanged(prevTeams, publicTeams)
          publicCache.teamsBySeason.set(season.id, publicTeams)
          if (mounted && teamsChanged) {
            setTeams(publicTeams)
          }
        }
      } catch (err) {
        console.error(
          'Failed to load active season or public teams on roster sport page:',
          err instanceof Error ? err.message : err,
          err
        )
      }
    }
    init()
    return () => {
      mounted = false
    }
  }, [])

  // Load sport definition and roles dynamically from the database
  useEffect(() => {
    let mounted = true
    async function loadSportInfo() {
      try {
        const allSports = await getSports()
        publicCache.sports = { loaded: true, value: allSports }
        const found = allSports.find(
          (s) =>
            s.id.toLowerCase() === normalizedSport ||
            s.name.toLowerCase() === normalizedSport
        )
        if (!mounted) return

        if (found) {
          const sportRoles = await getRolesForSport(found.id)
          if (!mounted) return
          const nextInfo = {
            valid: true,
            name: found.name,
            roles: sportRoles
          }
          const prevInfo = publicCache.rosterSportInfo.get(normalizedSport)
          publicCache.rosterSportInfo.set(normalizedSport, nextInfo)

          if (!prevInfo || hasDataChanged(prevInfo, nextInfo)) {
            setIsSportValid(true)
            setSportName(found.name)
            setRoles(sportRoles)
          }
          setIsSportChecked(true)
        } else {
          const nextInfo = { valid: false, name: '', roles: [] }
          publicCache.rosterSportInfo.set(normalizedSport, nextInfo)
          setIsSportValid(false)
          setIsSportChecked(true)
        }
      } catch (err) {
        console.error(
          'Failed to load sport roles on roster sport page:',
          err instanceof Error ? err.message : err,
          err
        )
        if (mounted && !publicCache.rosterSportInfo.has(normalizedSport)) {
          setIsSportChecked(true)
          setIsSportValid(false)
        }
      }
    }
    loadSportInfo()
    return () => {
      mounted = false
    }
  }, [normalizedSport])

  const handleSelectYear = (yr: string) => {
    if (yr === selectedYear) return
    const nextKey = getRosterQueryKey(normalizedSport, yr, selectedRole)
    const cached = publicCache.rosterPagedQueries.get(nextKey)
    setSelectedYear(yr)
    if (cached) {
      setPlayers(cached.players)
      setTotalCount(cached.totalCount)
      setHasMore(cached.hasMore)
      setIsLoading(false)
      setIsFilterLoading(false)
    } else if (hasLoadedSportOnce) {
      setIsFilterLoading(true)
    }
  }

  const handleSelectRole = (role: string) => {
    if (role === selectedRole) return
    const nextKey = getRosterQueryKey(normalizedSport, selectedYear, role)
    const cached = publicCache.rosterPagedQueries.get(nextKey)
    setSelectedRole(role)
    if (cached) {
      setPlayers(cached.players)
      setTotalCount(cached.totalCount)
      setHasMore(cached.hasMore)
      setIsLoading(false)
      setIsFilterLoading(false)
    } else if (hasLoadedSportOnce) {
      setIsFilterLoading(true)
    }
  }

  // Fetch players on filter change or pagination
  const fetchPlayers = useCallback(
    async (offset: number, append = false) => {
      if (!isSportValid || !isSportChecked) return

      const queryKey = getRosterQueryKey(normalizedSport, selectedYear, selectedRole)
      const cached = offset === 0 ? publicCache.rosterPagedQueries.get(queryKey) : undefined
      const currentRequestId = ++requestIdRef.current

      try {
        if (append) {
          setIsLoadingMore(true)
        } else if (cached) {
          // Cached query exists: ensure it is displayed immediately without placeholders
          setIsLoading(false)
          setIsFilterLoading(false)
        } else if (hasLoadedSportOnce) {
          // Filter change with no cache for this filter: keep current cards on screen
          setIsFilterLoading(true)
        } else {
          // Very first load of this sport when nothing is cached
          setIsLoading(true)
        }

        const result = await getPublicPlayersPaged({
          sport: normalizedSport,
          academicYear: selectedYear === 'All' ? undefined : selectedYear,
          playingRole: selectedRole === 'All' ? undefined : selectedRole,
          offset,
          limit: 20
        })

        if (currentRequestId !== requestIdRef.current) return

        if (append) {
          setTotalCount(result.totalCount)
          setHasMore(result.hasMore)
          setPlayers((prev) => [...prev, ...result.players])
        } else {
          const nextEntry = {
            players: result.players,
            totalCount: result.totalCount,
            hasMore: result.hasMore
          }
          const prevEntry = publicCache.rosterPagedQueries.get(queryKey)
          const changed = !prevEntry || hasDataChanged(prevEntry, nextEntry)
          publicCache.rosterPagedQueries.set(queryKey, nextEntry)

          if (changed) {
            setPlayers(result.players)
            setTotalCount(result.totalCount)
            setHasMore(result.hasMore)
          }
          setHasLoadedSportOnce(true)
        }
      } catch (err) {
        console.error(
          'Failed to load public players on roster sport page:',
          err instanceof Error ? err.message : err,
          err
        )
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false)
          setIsFilterLoading(false)
          setIsLoadingMore(false)
        }
      }
    },
    [isSportValid, isSportChecked, normalizedSport, selectedYear, selectedRole, hasLoadedSportOnce]
  )

  // Reset & refetch when filters change
  useEffect(() => {
    if (isSportChecked && isSportValid) {
      fetchPlayers(0, false)
    }
  }, [fetchPlayers, isSportChecked, isSportValid])

  // Endless scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoading || isFilterLoading || isLoadingMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          fetchPlayers(players.length, true)
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasMore, isLoading, isFilterLoading, isLoadingMore, players.length, fetchPlayers])

  if (isSportChecked && !isSportValid) {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col justify-between">
        <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
        <NavigationMenu
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          activeSeason={activeSeason}
        />

        <main className="flex-1 flex flex-col items-center justify-center px-6 pt-36 sm:pt-44 md:pt-48 pb-20 text-center max-w-xl mx-auto">
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-3">
            ROSTER NOT FOUND
          </span>
          <h1 className="font-syne font-extrabold text-4xl text-text tracking-tight mb-4">
            Sport Discipline Not Found
          </h1>
          <p className="text-sm text-muted leading-relaxed mb-8">
            We could not find an official tournament roster for &ldquo;{sport}&rdquo;. Explore one of our registered athletic sports to view athlete cards.
          </p>
          <Link
            to="/rosters"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-btn-bg text-btn-fg font-medium text-sm hover:opacity-90 transition-all"
          >
            <ArrowLeft size={16} weight="bold" />
            <span>Return to Rosters</span>
          </Link>
        </main>

        <SiteFooter />
      </div>
    )
  }

  const roleOptions = ['All', ...roles]
  const showPlaceholderBoxes = isLoading && !hasLoadedSportOnce && players.length === 0

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-on-accent relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      {/* Top padding clears the fixed logo tile completely plus 16px buffer */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-16 lg:px-24 pt-36 sm:pt-44 md:pt-48 pb-20">
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Link
            to="/rosters"
            className="inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <ArrowLeft size={14} weight="bold" />
            <span>All sports rosters</span>
          </Link>
        </div>

        {/* Page Heading */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 pb-6 border-b border-border">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
              ATHLETIC ROSTER · {activeSeason?.name || 'ACTIVE SEASON'}
            </span>
            <h1 className="font-syne font-extrabold text-4xl sm:text-5xl text-text tracking-tight">
              {sportName || normalizedSport} Squad
            </h1>
          </div>
          <div className="text-sm font-mono text-muted">
            Showing <span className="text-text font-semibold">{players.length}</span> of{' '}
            <span className="text-text font-semibold">{totalCount}</span> athletes
          </div>
        </div>

        {/* Filters Section */}
        <div className="bg-surface border border-border rounded-2xl p-5 mb-10 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
          {/* Academic Year Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-muted shrink-0">
              Academic Year:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {ACADEMIC_YEAR_FILTER_OPTIONS.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => handleSelectYear(yr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedYear === yr
                      ? 'bg-btn-bg text-btn-fg font-semibold'
                      : 'bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>

          {/* Playing Role Filter - Loaded from sports table */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-muted shrink-0">
              Role:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {roleOptions.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleSelectRole(role)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedRole === role
                      ? 'bg-btn-bg text-btn-fg font-semibold'
                      : 'bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Players Grid */}
        {showPlaceholderBoxes ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface border border-border rounded-xl p-5 animate-pulse h-48"
              />
            ))}
          </div>
        ) : players.length === 0 ? (
          <div
            className={`bg-surface border border-border rounded-2xl p-16 text-center max-w-lg mx-auto transition-opacity duration-150 ${
              isFilterLoading ? 'opacity-60' : 'opacity-100'
            }`}
          >
            <Funnel size={36} weight="duotone" className="mx-auto text-muted mb-4" />
            <h3 className="font-syne font-bold text-xl text-text mb-2">No Athletes Found</h3>
            <p className="text-sm text-muted">
              No registered athletes match the selected filter criteria. Try adjusting your academic year or playing role filter.
            </p>
          </div>
        ) : (
          <>
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 transition-opacity duration-150 ${
                isFilterLoading ? 'opacity-60' : 'opacity-100'
              }`}
            >
              {players.map((player) => (
                <RosterPlayerCard
                  key={player.id}
                  player={player}
                  team={teams.find((t) => t.id === player.team_id)}
                  onClick={() => setExpandedPlayer(player)}
                />
              ))}
            </div>

            {/* Endless scroll sentinel */}
            <div ref={sentinelRef} className="py-10 text-center">
              {isLoadingMore && (
                <div className="text-xs font-mono uppercase tracking-widest text-muted animate-pulse">
                  Loading more athletes...
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Expanded Player Floating Modal */}
      <RosterScoutModal
        player={expandedPlayer}
        team={expandedPlayer ? teams.find((t) => t.id === expandedPlayer.team_id) : null}
        onClose={handleCloseModal}
      />

      <SiteFooter />
    </div>
  )
}
