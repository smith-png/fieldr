import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Funnel } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_BACK_LINK,
  PUBLIC_BTN_PRIMARY,
  PUBLIC_CARD,
  PUBLIC_COUNT_PILL,
  PUBLIC_MAIN,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_PILL_BAR,
  PUBLIC_PILL_BAR_OUTER
} from '../../components/public/publicStyles'
import { RosterPlayerCard, RosterScoutModal } from '../../components/roster'
import { SkeletonCard } from '../../components/ui'
import { getActiveSeason } from '../../lib/data/seasons'
import { getPublicPlayersPaged } from '../../lib/data/players'
import { getPublicTeams, getRolesForSport, getSports } from '../../lib/data/teams'
import { ACADEMIC_YEAR_VALUES } from '../../lib/academicYears'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import type { PublicPlayer, PublicTeam, Season } from '../../types'

const ACADEMIC_YEAR_FILTER_OPTIONS = ['All', ...ACADEMIC_YEAR_VALUES] as const
const KNOWN_SPORT_SLUGS = new Set(['cricket', 'futsal', 'volleyball'])

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

  // Load initial season and public teams data in parallel
  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const knownSeasonId = publicCache.activeSeason.value?.id
        const [season, preloadedTeams] = await Promise.all([
          publicCache.activeSeason.loaded
            ? Promise.resolve(publicCache.activeSeason.value)
            : getActiveSeason(),
          knownSeasonId ? getPublicTeams(knownSeasonId) : Promise.resolve(null)
        ])
        const prevSeason = publicCache.activeSeason.value
        const seasonChanged =
          !publicCache.activeSeason.loaded || hasDataChanged(prevSeason, season)
        publicCache.activeSeason = { loaded: true, value: season }
        if (mounted && seasonChanged) {
          setActiveSeason(season)
        }

        if (season) {
          const publicTeams =
            knownSeasonId === season.id && preloadedTeams
              ? preloadedTeams
              : await getPublicTeams(season.id)
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
    void init()
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
          const sportRoles =
            found.roles && found.roles.length > 0
              ? found.roles
              : await getRolesForSport(found.id)
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
      const canFetchImmediately =
        KNOWN_SPORT_SLUGS.has(normalizedSport) || (isSportChecked && isSportValid)
      if (!canFetchImmediately || (isSportChecked && !isSportValid)) return

      const queryKey = getRosterQueryKey(normalizedSport, selectedYear, selectedRole)
      const cacheKey = `public:rosterSport:${queryKey}`
      const cached = offset === 0 ? publicCache.rosterPagedQueries.get(queryKey) : undefined

      if (!append && cached) {
        setIsLoading(false)
        setIsFilterLoading(false)
        if (isQueryFresh(cacheKey) && !shouldRevalidateQuery(cacheKey)) {
          return
        }
      }

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
          setCachedQuery(cacheKey, nextEntry)

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

  // Reset & refetch when filters change (or immediately on mount for known sports)
  useEffect(() => {
    if (KNOWN_SPORT_SLUGS.has(normalizedSport) || (isSportChecked && isSportValid)) {
      void fetchPlayers(0, false)
    }
  }, [fetchPlayers, isSportChecked, isSportValid, normalizedSport])

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

  const teamsById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  )

  const handleSelectPlayer = useCallback((player: PublicPlayer) => {
    setExpandedPlayer(player)
  }, [])

  if (isSportChecked && !isSportValid) {
    return (
      <div className={PUBLIC_PAGE_SHELL}>
        <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
        <NavigationMenu
          isOpen={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          activeSeason={activeSeason}
        />

        <main className={`${PUBLIC_MAIN} flex items-center justify-center`}>
          <div className={`${PUBLIC_CARD} max-w-md w-full text-center space-y-4`}>
            <h1 className="font-syne font-extrabold text-2xl sm:text-3xl text-text tracking-tight">
              Sport Not Found
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              No roster was found for &ldquo;{sport}&rdquo;.
            </p>
            <div className="pt-2">
              <Link
                to="/rosters"
                className={`${PUBLIC_BTN_PRIMARY} px-5 py-2.5 text-sm`}
              >
                <ArrowLeft size={16} weight="regular" />
                <span>Return to Rosters</span>
              </Link>
            </div>
          </div>
        </main>

        <SiteFooter />
      </div>
    )
  }

  const roleOptions = ['All', ...roles]
  const showPlaceholderBoxes = isLoading && !hasLoadedSportOnce && players.length === 0

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className={PUBLIC_MAIN}>
        {/* Back Link */}
        <div className="mb-6">
          <Link
            to="/rosters"
            onMouseEnter={() => prefetchRoute('/rosters')}
            onFocus={() => prefetchRoute('/rosters')}
            onTouchStart={() => prefetchRoute('/rosters')}
            className={PUBLIC_BACK_LINK}
          >
            <ArrowLeft size={14} weight="regular" />
            <span>All sports rosters</span>
          </Link>
        </div>

        {/* Page Heading */}
        <header className={PUBLIC_PAGE_HEADER}>
          <h1 className={`${PUBLIC_PAGE_TITLE} capitalize`}>
            {sportName || normalizedSport} Squad
          </h1>
          <span className={PUBLIC_COUNT_PILL}>
            {players.length} / {totalCount} athletes
          </span>
        </header>

        {/* Filters Section: single horizontally scrollable rows on mobile, never wrapping */}
        <div className={`${PUBLIC_CARD} mb-8 space-y-4`}>
          {/* Academic Year Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 min-w-0">
            <span className="text-sm font-medium text-text shrink-0 sm:w-14">
              Year
            </span>
            <div className={`${PUBLIC_PILL_BAR_OUTER} flex-1 min-w-0`}>
              <div className={PUBLIC_PILL_BAR}>
                {ACADEMIC_YEAR_FILTER_OPTIONS.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => handleSelectYear(yr)}
                    className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      selectedYear === yr
                        ? 'bg-btn-bg text-btn-fg'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Playing Role Filter - Loaded from sports table */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4 min-w-0">
            <span className="text-sm font-medium text-text shrink-0 sm:w-14">
              Role
            </span>
            <div className={`${PUBLIC_PILL_BAR_OUTER} flex-1 min-w-0`}>
              <div className={PUBLIC_PILL_BAR}>
                {roleOptions.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => handleSelectRole(role)}
                    className={`min-h-[34px] px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      selectedRole === role
                        ? 'bg-btn-bg text-btn-fg'
                        : 'text-muted hover:text-text'
                    }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Players Grid */}
        {showPlaceholderBoxes ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} className="rounded-3xl h-48" />
            ))}
          </div>
        ) : players.length === 0 ? (
          <div
            className={`${PUBLIC_CARD} py-14 text-center max-w-lg mx-auto transition-opacity duration-150 ${
              isFilterLoading ? 'opacity-60' : 'opacity-100'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-surface-2 border border-border flex items-center justify-center mx-auto text-muted mb-4">
              <Funnel size={22} weight="regular" />
            </div>
            <h3 className="font-syne font-bold text-xl text-text mb-1.5">No Athletes Found</h3>
            <p className="text-sm text-muted">
              No athletes match the selected filters.
            </p>
          </div>
        ) : (
          <>
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 transition-opacity duration-150 ${
                isFilterLoading ? 'opacity-60' : 'opacity-100'
              }`}
            >
              {players.map((player) => (
                <RosterPlayerCard
                  key={player.id}
                  player={player}
                  team={player.team_id ? teamsById.get(player.team_id) : undefined}
                  onSelect={handleSelectPlayer}
                />
              ))}
            </div>

            {/* Endless scroll sentinel */}
            <div ref={sentinelRef} className="py-10">
              {isLoadingMore && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <SkeletonCard key={i} className="rounded-3xl h-44" />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Expanded Player Floating Modal */}
      <RosterScoutModal
        player={expandedPlayer}
        team={expandedPlayer?.team_id ? teamsById.get(expandedPlayer.team_id) ?? null : null}
        onClose={handleCloseModal}
      />

      <SiteFooter />
    </div>
  )
}
