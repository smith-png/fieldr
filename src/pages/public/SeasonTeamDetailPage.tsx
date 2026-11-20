import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowsClockwise,
  CaretLeft,
  CircleNotch,
  ShieldCheck,
  SignOut,
  Users
} from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  EmptyState,
  ErrorState,
  SkeletonBlock,
  SkeletonCard,
  SkeletonText
} from '../../components/ui'
import { RosterPlayerCard } from '../../components/roster/RosterPlayerCard'
import {
  formatAthleteCode,
  getActiveSeason,
  getPublicPlayersBySeason,
  getPublicTeams,
  getRolesForSport,
  getSeason,
  getSports,
  supabase
} from '../../lib/data'
import {
  hasDataChanged,
  publicCache,
  type SeasonTeamDetailCacheEntry
} from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import { formatPoints, getInitials } from '../../lib/utils'
import { useAuth } from '../../lib/AuthContext'
import type { PublicPlayer, PublicTeam, Season } from '../../types'

function getTeamCacheKey(seasonId?: string, teamId?: string): string {
  return `${seasonId || ''}::${teamId || ''}`
}

const DISALLOWED_CSS_COLORS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer'
])

function getValidTeamColor(color?: string | null): string | null {
  const clean = color?.trim()
  if (!clean) return null
  if (DISALLOWED_CSS_COLORS.has(clean.toLowerCase())) return null
  if (/[;{}<>]/.test(clean)) return null

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', clean) ? clean : null
  }

  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)
    ? clean
    : null
}

function getCachedTeamDetail(
  seasonId?: string,
  teamId?: string
): SeasonTeamDetailCacheEntry | undefined {
  if (!seasonId || !teamId) return undefined
  const key = getTeamCacheKey(seasonId, teamId)
  const direct = publicCache.seasonTeamDetails.get(key)
  if (direct) return direct

  const cachedTeams = publicCache.teamsBySeason.get(seasonId)
  const cachedPlayers = publicCache.playersBySeason.get(seasonId)
  const foundTeam = cachedTeams?.find((t) => t.id === teamId)
  if (foundTeam && cachedPlayers) {
    const knownSeason =
      publicCache.seasonDetails.get(seasonId)?.season ||
      publicCache.seasonCards.value.find((c) => c.season.id === seasonId)?.season ||
      (publicCache.activeSeason.value?.id === seasonId
        ? publicCache.activeSeason.value
        : null)
    const cachedSportRoles =
      publicCache.rosterSportInfo.get(foundTeam.sport.toLowerCase())?.roles || []
    return {
      season: knownSeason,
      team: foundTeam,
      teamPlayers: cachedPlayers.filter((p) => p.team_id === teamId),
      allPlayers: cachedPlayers,
      sportRoles: cachedSportRoles
    }
  }
  return undefined
}

export const SeasonTeamDetailPage: React.FC = () => {
  const { id, teamId } = useParams<{ id: string; teamId: string }>()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const initialCached = getCachedTeamDetail(id, teamId)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(
    publicCache.activeSeason.value
  )
  const [season, setSeason] = useState<Season | null>(initialCached?.season ?? null)
  const [team, setTeam] = useState<PublicTeam | null>(initialCached?.team ?? null)
  const [teamPlayers, setTeamPlayers] = useState<PublicPlayer[]>(
    initialCached?.teamPlayers ?? []
  )
  const [allPlayers, setAllPlayers] = useState<PublicPlayer[]>(
    initialCached?.allPlayers ?? []
  )
  const [sportRoles, setSportRoles] = useState<string[]>(
    initialCached?.sportRoles ?? []
  )
  const [failedOwnerPhotoUrl, setFailedOwnerPhotoUrl] = useState<string | null>(null)
  const [isOwnerPhotoOpen, setIsOwnerPhotoOpen] = useState<boolean>(false)

  const [isLoading, setIsLoading] = useState<boolean>(!initialCached)
  const [hasError, setHasError] = useState<boolean>(false)

  // Owner Panel State
  const [ownerOverview, setOwnerOverview] = useState<any | null>(null)
  const [isLoadingOverview, setIsLoadingOverview] = useState<boolean>(() =>
    Boolean(user?.role === 'owner' && teamId && supabase)
  )
  const [overviewUpdatedAt, setOverviewUpdatedAt] = useState<Date | null>(null)
  const [failedBoughtPhotoUrls, setFailedBoughtPhotoUrls] = useState<Record<string, true>>({})

  const fetchOwnerOverview = async () => {
    if (!user || user.role !== 'owner' || !teamId || !supabase) {
      setOwnerOverview(null)
      setOverviewUpdatedAt(null)
      return
    }
    try {
      setIsLoadingOverview(true)
      const { data, error } = await supabase.rpc('owner_team_overview')
      if (error) {
        console.error('owner_team_overview error:', error)
        setOwnerOverview(null)
        setOverviewUpdatedAt(null)
        return
      }
      const items = Array.isArray(data) ? data : data ? [data] : []
      const matched = items.find(
        (item: any) => String(item.team_id || item.id) === String(teamId)
      )
      setOwnerOverview(matched || null)
      setOverviewUpdatedAt(matched ? new Date() : null)
    } catch (err) {
      console.error('Failed to load owner overview:', err)
      setOwnerOverview(null)
      setOverviewUpdatedAt(null)
    } finally {
      setIsLoadingOverview(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'owner' && teamId) {
      setOwnerOverview(null)
      setOverviewUpdatedAt(null)
      fetchOwnerOverview()
    } else {
      setOwnerOverview(null)
      setOverviewUpdatedAt(null)
      setIsLoadingOverview(false)
    }
  }, [user?.role, user?.id, teamId])

  const loadData = async (options?: { force?: boolean }) => {
    if (!id || !teamId) return
    const key = getTeamCacheKey(id, teamId)
    const queryKey = `public:teamDetail:${key}`
    const cached = getCachedTeamDetail(id, teamId)

    if (cached && !options?.force) {
      setSeason(cached.season)
      setTeam(cached.team)
      setTeamPlayers(cached.teamPlayers)
      setAllPlayers(cached.allPlayers)
      setSportRoles(cached.sportRoles)
      setIsLoading(false)
      if (isQueryFresh(queryKey) && !shouldRevalidateQuery(queryKey)) {
        return
      }
    } else if (!cached) {
      setIsLoading(true)
    }
    setHasError(false)

    try {
      const [active, s, publicTeams, seasonPlayers, allSports] = await Promise.all([
        getActiveSeason(),
        getSeason(id),
        getPublicTeams(id),
        getPublicPlayersBySeason(id),
        getSports()
      ])

      const prevActive = publicCache.activeSeason.value
      const activeChanged =
        !publicCache.activeSeason.loaded || hasDataChanged(prevActive, active)
      publicCache.activeSeason = { loaded: true, value: active }
      if (activeChanged) {
        setActiveSeason(active)
      }

      publicCache.teamsBySeason.set(id, publicTeams)
      publicCache.playersBySeason.set(id, seasonPlayers)
      if (Array.isArray(allSports)) {
        publicCache.sports = { loaded: true, value: allSports }
      }

      const foundTeam = publicTeams.find((t) => t.id === teamId) || null
      if (!foundTeam) {
        const notFoundEntry: SeasonTeamDetailCacheEntry = {
          season: s,
          team: null,
          teamPlayers: [],
          allPlayers: [],
          sportRoles: []
        }
        publicCache.seasonTeamDetails.set(key, notFoundEntry)
        setCachedQuery(queryKey, notFoundEntry)
        setSeason(s)
        setTeam(null)
        return
      }

      const matchedSport = Array.isArray(allSports)
        ? allSports.find(
            (sp) =>
              sp.id.toLowerCase() === foundTeam.sport.toLowerCase() ||
              sp.name.toLowerCase() === foundTeam.sport.toLowerCase()
          )
        : undefined
      const roles =
        matchedSport && matchedSport.roles.length > 0
          ? matchedSport.roles
          : await getRolesForSport(foundTeam.sport)

      const nextEntry: SeasonTeamDetailCacheEntry = {
        season: s,
        team: foundTeam,
        teamPlayers: seasonPlayers.filter((p) => p.team_id === teamId),
        allPlayers: seasonPlayers,
        sportRoles: roles
      }
      const prevEntry = publicCache.seasonTeamDetails.get(key) ?? cached
      const changed = !prevEntry || hasDataChanged(prevEntry, nextEntry)
      publicCache.seasonTeamDetails.set(key, nextEntry)
      setCachedQuery(queryKey, nextEntry)

      if (changed) {
        setSeason(s)
        setTeam(foundTeam)
        setAllPlayers(seasonPlayers)
        setTeamPlayers(nextEntry.teamPlayers)
        setSportRoles(roles)
      }
    } catch (err) {
      console.error(
        'Failed to load season team detail data:',
        err instanceof Error ? err.message : err,
        err
      )
      if (!cached) {
        setHasError(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [id, teamId])

  const ownerName = team?.owner_display_name?.trim() || ''
  const ownerPhotoUrl = team?.owner_photo_url?.trim() || ''
  const showOwnerPhoto =
    Boolean(ownerPhotoUrl) && failedOwnerPhotoUrl !== ownerPhotoUrl
  const showOwnerSection = Boolean(ownerName) || showOwnerPhoto

  useEffect(() => {
    if (!isOwnerPhotoOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOwnerPhotoOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOwnerPhotoOpen])

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-on-accent relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 md:px-12 pt-32 sm:pt-40 pb-20">
        <div className="mb-6">
          <Link
            to="/teams"
            onMouseEnter={() => prefetchRoute('/teams')}
            onFocus={() => prefetchRoute('/teams')}
            onTouchStart={() => prefetchRoute('/teams')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <CaretLeft size={16} />
            <span>Back to Teams</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-8">
            <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 flex-1 w-full">
                <SkeletonBlock className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl shrink-0" />
                <div className="space-y-3 flex-1 w-full">
                  <SkeletonBlock className="w-28 h-6 rounded-full" />
                  <SkeletonBlock className="w-64 h-10 rounded-xl" />
                  <SkeletonText width="w-40" />
                </div>
              </div>
              <SkeletonBlock className="w-44 h-52 rounded-2xl shrink-0" />
            </div>
            <div className="space-y-4">
              <SkeletonBlock className="w-48 h-7 rounded-lg" />
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <SkeletonCard key={idx} className="min-h-[150px]" />
                ))}
              </div>
            </div>
          </div>
        ) : hasError ? (
          <ErrorState
            title="Failed to Load Franchise Details"
            description="We encountered an issue loading this team's roster."
            onRetry={() => void loadData({ force: true })}
          />
        ) : !team ? (
          <EmptyState
            icon={ShieldCheck}
            title="Team Not Found"
            description="The requested franchise team does not exist for this season."
            actionLabel="Return to Teams"
            onAction={() => navigate('/teams')}
          />
        ) : (
          <div className="flex flex-col gap-8">
            {/* Team Header */}
            {(() => {
              const teamColor = getValidTeamColor(team.color)
              return (
                <div
                  style={
                    teamColor
                      ? ({ '--team-color': teamColor } as React.CSSProperties)
                      : undefined
                  }
                  className={`p-6 sm:p-8 rounded-3xl bg-surface border-[1.5px] border-solid flex flex-col md:flex-row items-center md:items-center justify-between gap-6 shadow-sm ${
                    teamColor
                      ? 'border-[color:color-mix(in_srgb,var(--team-color)_75%,transparent)]'
                      : 'border-border'
                  }`}
                >
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 flex-1 min-w-0">
                <div
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center overflow-hidden border border-border font-syne font-extrabold text-white text-2xl shrink-0"
                  style={{ backgroundColor: team.color || 'var(--accent)' }}
                >
                  {team.logo_url ? (
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      width={96}
                      height={96}
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{team.short_code}</span>
                  )}
                </div>

                <div className="flex-1 text-center sm:text-left min-w-0">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-surface-2 border border-border text-text">
                      {team.short_code} &bull; {team.sport}
                    </span>
                  </div>

                  <h1 className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight">
                    {team.name}
                  </h1>

                  <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-muted">
                    <span>Roster Squad: {teamPlayers.length} Players</span>
                  </div>
                </div>
              </div>

              {showOwnerSection && (
                <div className="flex flex-col md:flex-row items-center gap-5 md:gap-6 pt-6 md:pt-0 border-t md:border-t-0 md:border-l border-border md:pl-8 w-full md:w-auto justify-center md:justify-start shrink-0">
                  {showOwnerPhoto ? (
                    <button
                      type="button"
                      onClick={() => setIsOwnerPhotoOpen(true)}
                      aria-label={`View full size photo of ${ownerName || 'Franchise Owner'}`}
                      className="w-44 md:w-56 aspect-[4/5] rounded-2xl overflow-hidden bg-surface-2 border border-border flex items-center justify-center shrink-0 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                    >
                      <img
                        src={ownerPhotoUrl}
                        alt={ownerName || 'Franchise Owner'}
                        width={224}
                        height={280}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => {
                          setIsOwnerPhotoOpen(false)
                          setFailedOwnerPhotoUrl(ownerPhotoUrl)
                        }}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="w-44 md:w-56 aspect-[4/5] rounded-2xl overflow-hidden bg-surface-2 border border-border flex items-center justify-center shrink-0 select-none">
                      <span
                        aria-hidden="true"
                        className="font-syne font-bold text-4xl md:text-5xl text-muted tracking-tight uppercase"
                      >
                        {getInitials(ownerName)}
                      </span>
                    </div>
                  )}

                  <div className="text-center md:text-left">
                    <span className="block text-[11px] font-mono uppercase tracking-wider text-muted">
                      FRANCHISE OWNER
                    </span>
                    {ownerName && (
                      <span className="font-syne font-bold text-xl md:text-2xl text-text tracking-tight block mt-1">
                        {ownerName}
                      </span>
                    )}
                  </div>
                </div>
              )}
                </div>
              )
            })()}

            {isOwnerPhotoOpen && showOwnerPhoto && (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={ownerName || 'Franchise Owner photo'}
                onClick={() => setIsOwnerPhotoOpen(false)}
                className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 sm:p-8 cursor-pointer"
              >
                <img
                  src={ownerPhotoUrl}
                  alt={ownerName || 'Franchise Owner'}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-2xl border border-border"
                />
              </div>
            )}

            {/* Owner Panel (Visible ONLY to signed-in owner of this specific franchise) */}
            {user?.role === 'owner' && isLoadingOverview && !ownerOverview ? (
              <div
                aria-busy="true"
                aria-label="Loading Owner Panel"
                className="bg-surface border border-border rounded-3xl p-5 sm:p-8 shadow-sm relative overflow-hidden font-dm-sans"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-border">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-3.5 w-48 rounded-full" />
                    <SkeletonBlock className="h-8 sm:h-9 w-44 rounded-xl" />
                    <SkeletonBlock className="h-3.5 w-28 rounded-full" />
                  </div>
                  <div className="flex items-center gap-2 self-start shrink-0">
                    <SkeletonBlock className="h-9 w-24 rounded-full" />
                    <SkeletonBlock className="h-9 w-24 rounded-full" />
                  </div>
                </div>

                <div className="py-6 border-b border-border flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div className="flex-1 min-w-0">
                    <SkeletonBlock className="h-3.5 w-28 rounded-full mb-2" />
                    <SkeletonBlock className="h-9 sm:h-10 w-44 rounded-xl" />
                    <SkeletonBlock className="mt-4 h-1.5 w-full max-w-md rounded-full" />
                  </div>
                  <div className="flex flex-wrap items-start gap-x-8 gap-y-4 md:shrink-0">
                    <div className="space-y-1.5">
                      <SkeletonBlock className="h-3.5 w-20 rounded-full" />
                      <SkeletonBlock className="h-6 w-24 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                      <SkeletonBlock className="h-3.5 w-24 rounded-full" />
                      <SkeletonBlock className="h-6 w-12 rounded-lg" />
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <SkeletonBlock className="h-5 w-36 rounded-lg mb-3" />
                  <div className="space-y-2.5">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl bg-surface-2 border border-border px-3.5 py-3 sm:px-4 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <SkeletonBlock className="h-5 w-12 rounded-full shrink-0" />
                          <div className="space-y-1.5 min-w-0 flex-1 max-w-xs">
                            <SkeletonBlock className="h-4 w-36 rounded-md" />
                            <SkeletonBlock className="h-3 w-20 rounded-md" />
                          </div>
                        </div>
                        <SkeletonBlock className="h-4 w-16 rounded-md shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : ownerOverview && (() => {
              const rawPlayers =
                ownerOverview.players ??
                ownerOverview.players_bought ??
                ownerOverview.bought_players ??
                ownerOverview.squad ??
                []
              let list: any[] = []
              if (typeof rawPlayers === 'string') {
                try {
                  list = JSON.parse(rawPlayers)
                } catch {
                  list = []
                }
              } else if (Array.isArray(rawPlayers)) {
                list = rawPlayers
              }

              const boughtPlayers = list.map((p: any) => {
                const rawPhoto = p.photo_thumb_url ?? p.photo_url ?? null
                const photoUrl =
                  typeof rawPhoto === 'string' && rawPhoto.trim() ? rawPhoto.trim() : null
                return {
                  athlete_code: formatAthleteCode(p.athlete_code ?? p.player_code ?? p.code ?? p.id),
                  name: String(p.name || p.player_name || 'Unnamed Player'),
                  playing_role: String(p.playing_role || p.role || 'Player'),
                  purchase_price: Number(p.purchase_price ?? p.price ?? p.amount ?? 0),
                  photo_url: photoUrl
                }
              })

              const purseSpent =
                ownerOverview.purse_spent ??
                ownerOverview.spent ??
                ownerOverview.spent_purse ??
                (ownerOverview.initial_purse != null && ownerOverview.current_purse != null
                  ? Math.max(0, Number(ownerOverview.initial_purse) - Number(ownerOverview.current_purse))
                  : boughtPlayers.reduce((sum, p) => sum + p.purchase_price, 0))

              const currentPurse =
                ownerOverview.current_purse ??
                ownerOverview.purse_remaining ??
                ownerOverview.remaining_purse ??
                0

              const rosterCount =
                ownerOverview.roster_count ??
                ownerOverview.player_count ??
                boughtPlayers.length

              const safeSpent = Math.max(0, Number(purseSpent) || 0)
              const safeRemaining = Math.max(0, Number(currentPurse) || 0)
              const totalPurse = safeSpent + safeRemaining
              const spentRatio =
                totalPurse > 0 ? Math.min(1, Math.max(0, safeSpent / totalPurse)) : 0
              const updatedTimeLabel = overviewUpdatedAt
                ? overviewUpdatedAt.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit'
                  })
                : null

              return (
                <div className="bg-surface border border-border rounded-3xl p-5 sm:p-8 shadow-sm relative overflow-hidden font-dm-sans">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-border">
                    <div>
                      <span className="block text-[11px] font-mono uppercase tracking-[0.16em] text-accent-bright font-semibold mb-1.5">
                        CONFIDENTIAL FRANCHISE PORTAL
                      </span>
                      <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text tracking-tight">
                        Owner Panel
                      </h2>
                      {updatedTimeLabel && (
                        <span className="block font-mono text-[11px] text-muted mt-1.5 tabular-nums">
                          Updated {updatedTimeLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start shrink-0">
                      <button
                        type="button"
                        onClick={fetchOwnerOverview}
                        disabled={isLoadingOverview}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-2 hover:opacity-85 active:scale-[0.98] border border-border text-xs font-medium text-text transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-50 cursor-pointer"
                      >
                        {isLoadingOverview ? (
                          <CircleNotch
                            size={14}
                            className="animate-spin motion-reduce:animate-none"
                          />
                        ) : (
                          <ArrowsClockwise size={14} />
                        )}
                        <span>Refresh</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => logout()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface-2 hover:opacity-85 active:scale-[0.98] border border-border text-xs font-medium text-muted hover:text-text transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 cursor-pointer"
                      >
                        <SignOut size={14} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>

                  {/* Purse Block */}
                  <div className="py-6 border-b border-border flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-1.5">
                        PURSE REMAINING
                      </span>
                      <div className="font-mono text-3xl sm:text-4xl font-bold text-accent-bright tabular-nums tracking-tight leading-none">
                        {formatPoints(currentPurse)}
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Purse spent"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(spentRatio * 100)}
                        className="mt-4 h-1.5 w-full max-w-md rounded-full bg-surface-2 overflow-hidden"
                      >
                        <div
                          className="h-full w-full rounded-full bg-accent-bright origin-left transition-transform duration-300 motion-reduce:transition-none"
                          style={{ transform: `scaleX(${spentRatio})` }}
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start gap-x-8 gap-y-4 md:shrink-0 md:pb-0.5">
                      <div>
                        <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-1">
                          PURSE SPENT
                        </span>
                        <span className="font-mono text-lg sm:text-xl font-bold text-text tabular-nums">
                          {formatPoints(purseSpent)}
                        </span>
                      </div>

                      <div>
                        <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-1">
                          ROSTER COUNT
                        </span>
                        <span className="font-mono text-lg sm:text-xl font-bold text-text tabular-nums">
                          {rosterCount}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Players Bought */}
                  <div className="pt-6">
                    <h3 className="font-syne font-bold text-base text-text mb-3">
                      Players Bought ({boughtPlayers.length})
                    </h3>

                    {boughtPlayers.length === 0 ? (
                      <p className="px-4 py-5 rounded-2xl bg-surface-2 border border-border text-xs text-muted text-center">
                        No players acquired yet.
                      </p>
                    ) : (
                      <ul className="space-y-2.5">
                        {boughtPlayers.map((bp, idx) => {
                          const showPhoto =
                            Boolean(bp.photo_url) &&
                            !failedBoughtPhotoUrls[bp.photo_url as string]
                          return (
                            <li
                              key={`${bp.athlete_code}-${idx}`}
                              className="rounded-2xl bg-surface-2 border border-border px-3.5 py-3 sm:px-4 flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {showPhoto && (
                                  <img
                                    src={bp.photo_url as string}
                                    alt={bp.name}
                                    width={40}
                                    height={40}
                                    loading="lazy"
                                    decoding="async"
                                    referrerPolicy="no-referrer"
                                    onError={() => {
                                      if (bp.photo_url) {
                                        setFailedBoughtPhotoUrls((prev) =>
                                          prev[bp.photo_url as string]
                                            ? prev
                                            : { ...prev, [bp.photo_url as string]: true }
                                        )
                                      }
                                    }}
                                    className="w-10 h-10 rounded-xl object-cover border border-border shrink-0"
                                  />
                                )}
                                <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface border border-border font-mono text-[11px] font-bold text-accent-bright tabular-nums shrink-0">
                                      {bp.athlete_code}
                                    </span>
                                    <span className="font-medium text-sm text-text truncate">
                                      {bp.name}
                                    </span>
                                  </div>
                                  <span className="text-xs text-muted truncate">
                                    {bp.playing_role}
                                  </span>
                                </div>
                              </div>

                              <span className="font-mono text-xs sm:text-sm font-semibold text-text tabular-nums shrink-0 text-right">
                                {formatPoints(bp.purchase_price)}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Team Roster Squad */}
            <div>
              <h2 className="font-syne font-bold text-xl text-text mb-4 flex items-center gap-2">
                <Users size={20} className="text-accent-bright" />
                <span>Squad Roster ({teamPlayers.length})</span>
              </h2>

              {teamPlayers.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-surface border border-border text-xs text-muted">
                  No players drafted into this team roster yet.
                </div>
              ) : (
                <div className="space-y-8">
                  {(() => {
                    const orderedRoleKeys = [
                      ...sportRoles,
                      ...Array.from(
                        new Set(
                          teamPlayers
                            .map((p) => p.playing_role)
                            .filter(
                              (r) =>
                                !sportRoles.some(
                                  (sr) => sr.toLowerCase() === r.toLowerCase()
                                )
                            )
                        )
                      )
                    ]

                    const groups = orderedRoleKeys
                      .map((role) => ({
                        role,
                        players: teamPlayers.filter(
                          (p) => p.playing_role.toLowerCase() === role.toLowerCase()
                        )
                      }))
                      .filter((g) => g.players.length > 0)

                    return groups.map((group) => (
                      <div key={group.role} className="space-y-3">
                        <div className="flex items-center justify-between border-b border-border pb-2">
                          <span className="font-mono text-xs uppercase tracking-wider text-accent-bright font-semibold">
                            {group.role}
                          </span>
                          <span className="font-mono text-xs text-muted tabular-nums">
                            {group.players.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                          {group.players.map((p) => {
                            const athleteEntries = allPlayers.filter(
                              (other) => other.athlete_id && other.athlete_id === p.athlete_id
                            )
                            const otherSports = athleteEntries
                              .filter((other) => other.sport !== p.sport)
                              .map((other) => other.sport)

                            return (
                              <RosterPlayerCard
                                key={p.id}
                                player={{
                                  id: p.id,
                                  player_code: p.player_code,
                                  athlete_code: p.athlete_code,
                                  name: p.name,
                                  sport: p.sport,
                                  playing_role: p.playing_role,
                                  academic_year: p.academic_year,
                                  season_id: p.season_id,
                                  photo_url: p.photo_url,
                                  photo_thumb_url: p.photo_thumb_url,
                                  purchase_price: p.purchase_price,
                                  base_points: p.base_points
                                }}
                                team={team}
                                otherSports={otherSports}
                              />
                            )
                          })}
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
