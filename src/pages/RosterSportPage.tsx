import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Funnel, User, X } from '@phosphor-icons/react'
import { HeaderBar } from '../components/HeaderBar'
import { NavigationMenu } from '../components/NavigationMenu'
import { SiteFooter } from '../components/SiteFooter'
import { getActiveSeason, getPublicPlayersPaged, getRolesForSport, getSports } from '../lib/data'
import type { PublicPlayer, Season } from '../lib/types'

const ACADEMIC_YEARS = ['All', '1st', '2nd', '3rd', 'Final'] as const

export const RosterSportPage: React.FC = () => {
  const { sport = '' } = useParams<{ sport: string }>()
  const normalizedSport = sport.toLowerCase().trim()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [selectedYear, setSelectedYear] = useState<string>('All')
  const [selectedRole, setSelectedRole] = useState<string>('All')

  // Dynamic sport & roles loaded from the sports table in database
  const [sportName, setSportName] = useState<string>('')
  const [roles, setRoles] = useState<string[]>([])
  const [isSportChecked, setIsSportChecked] = useState<boolean>(false)
  const [isSportValid, setIsSportValid] = useState<boolean>(true)

  const [players, setPlayers] = useState<PublicPlayer[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [hasMore, setHasMore] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)

  // Expanded modal player
  const [expandedPlayer, setExpandedPlayer] = useState<PublicPlayer | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Load initial season data
  useEffect(() => {
    let mounted = true
    async function init() {
      try {
        const season = await getActiveSeason()
        if (mounted) setActiveSeason(season)
      } catch {
        // demo fallback
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
        const found = allSports.find(
          (s) =>
            s.id.toLowerCase() === normalizedSport ||
            s.name.toLowerCase() === normalizedSport
        )
        if (mounted) {
          if (found) {
            setIsSportValid(true)
            setSportName(found.name)
            // Use shared helper getRolesForSport
            const sportRoles = await getRolesForSport(found.id)
            if (mounted) {
              setRoles(sportRoles)
            }
          } else {
            setIsSportValid(false)
          }
          setIsSportChecked(true)
        }
      } catch {
        if (mounted) {
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

  // Reset selected role when sport changes
  useEffect(() => {
    setSelectedRole('All')
    setSelectedYear('All')
  }, [normalizedSport])

  // Fetch players on filter change
  const fetchPlayers = useCallback(
    async (offset: number, append = false) => {
      if (!isSportValid || !isSportChecked) return

      try {
        if (!append) setIsLoading(true)
        else setIsLoadingMore(true)

        const result = await getPublicPlayersPaged({
          sport: normalizedSport,
          academicYear: selectedYear === 'All' ? undefined : selectedYear,
          playingRole: selectedRole === 'All' ? undefined : selectedRole,
          offset,
          limit: 20
        })

        setTotalCount(result.totalCount)
        setHasMore(result.hasMore)
        if (append) {
          setPlayers((prev) => [...prev, ...result.players])
        } else {
          setPlayers(result.players)
        }
      } catch {
        // demo fallback
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [isSportValid, isSportChecked, normalizedSport, selectedYear, selectedRole]
  )

  // Reset & refetch when filters change
  useEffect(() => {
    if (isSportChecked && isSportValid) {
      fetchPlayers(0, false)
    }
  }, [fetchPlayers, isSportChecked, isSportValid])

  // Endless scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoading || isLoadingMore) return

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
  }, [hasMore, isLoading, isLoadingMore, players.length, fetchPlayers])

  // Body scroll lock and Escape key listener for modal
  useEffect(() => {
    if (expandedPlayer) {
      document.body.style.overflow = 'hidden'
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setExpandedPlayer(null)
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => {
        document.body.style.overflow = ''
        window.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [expandedPlayer])

  // Trap focus in modal
  useEffect(() => {
    if (expandedPlayer && modalRef.current) {
      modalRef.current.focus()
    }
  }, [expandedPlayer])

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
              {ACADEMIC_YEARS.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
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
                  onClick={() => setSelectedRole(role)}
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
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface border border-border rounded-xl p-5 animate-pulse h-48"
              />
            ))}
          </div>
        ) : players.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-16 text-center max-w-lg mx-auto">
            <Funnel size={36} weight="duotone" className="mx-auto text-muted mb-4" />
            <h3 className="font-syne font-bold text-xl text-text mb-2">No Athletes Found</h3>
            <p className="text-sm text-muted">
              No registered athletes match the selected filter criteria. Try adjusting your academic year or playing role filter.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {players.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setExpandedPlayer(player)}
                  className="group bg-surface border border-border hover:border-accent-bright rounded-xl p-5 text-left transition-colors flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                >
                  <div className="flex items-start gap-3.5 mb-4">
                    {/* Small thumbnail or initials */}
                    {player.photo_thumb_url || player.photo_url ? (
                      <img
                        src={player.photo_thumb_url || player.photo_url}
                        alt={player.name}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-lg object-cover bg-surface-2 border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted font-mono text-sm font-bold shrink-0">
                        {player.name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </div>
                    )}

                    <div className="overflow-hidden">
                      <span className="font-mono text-[10px] tracking-wider text-accent-bright block uppercase">
                        {player.player_code}
                      </span>
                      <h3 className="font-syne font-bold text-base text-text group-hover:text-accent-bright truncate">
                        {player.name}
                      </h3>
                      <span className="text-xs text-muted block truncate">
                        {player.playing_role}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
                    <span className="text-text font-medium">{player.academic_year} Year</span>
                    <span className="text-[11px] font-mono text-accent-bright group-hover:underline">
                      Scout profile
                    </span>
                  </div>
                </button>
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
      {expandedPlayer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Athlete card for ${expandedPlayer.name}`}
          onClick={() => setExpandedPlayer(null)}
          className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4 sm:p-6"
        >
          <div
            ref={modalRef}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="bg-surface border border-border rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 outline-none"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setExpandedPlayer(null)}
              aria-label="Close modal"
              className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            >
              <X size={18} weight="bold" />
            </button>

            {/* Player Photo */}
            <div className="relative w-full h-72 bg-surface-2 flex items-center justify-center overflow-hidden border-b border-border">
              {expandedPlayer.photo_url || expandedPlayer.photo_thumb_url ? (
                <img
                  src={expandedPlayer.photo_url || expandedPlayer.photo_thumb_url}
                  alt={expandedPlayer.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-muted">
                  <User size={64} weight="thin" />
                  <span className="text-xs font-mono uppercase tracking-wider mt-2">
                    Official Photo Pending
                  </span>
                </div>
              )}
              <div className="absolute top-4 left-4 bg-black/75 border border-white/20 rounded-md px-2.5 py-1 text-xs font-mono text-white font-bold">
                {expandedPlayer.player_code}
              </div>
            </div>

            {/* Content Details */}
            <div className="p-6">
              <div className="mb-4">
                <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
                  {expandedPlayer.sport} · {expandedPlayer.playing_role}
                </span>
                <h2 className="font-syne font-extrabold text-2xl text-text tracking-tight">
                  {expandedPlayer.name}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-border text-xs">
                <div>
                  <span className="text-muted block mb-0.5">Academic Standing</span>
                  <span className="text-text font-medium">{expandedPlayer.academic_year} Year Student</span>
                </div>
                <div>
                  <span className="text-muted block mb-0.5">Primary Discipline</span>
                  <span className="text-text font-medium">{expandedPlayer.sport}</span>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setExpandedPlayer(null)}
                  className="px-6 py-2.5 rounded-full bg-btn-bg text-btn-fg font-medium text-xs hover:opacity-90 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SiteFooter />
    </div>
  )
}
