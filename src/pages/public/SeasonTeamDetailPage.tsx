import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowsClockwise, CaretLeft, ShieldCheck, SignOut, Users } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { EmptyState, ErrorState, Spinner } from '../../components/ui'
import { RosterPlayerCard } from '../../components/roster/RosterPlayerCard'
import {
  formatAthleteCode,
  getActiveSeason,
  getPublicPlayersBySeason,
  getPublicTeams,
  getRolesForSport,
  getSeason,
  supabase
} from '../../lib/data'
import {
  hasDataChanged,
  publicCache,
  type SeasonTeamDetailCacheEntry
} from '../../lib/publicCache'
import { formatPoints, getInitials } from '../../lib/utils'
import { useAuth } from '../../lib/AuthContext'
import type { PublicPlayer, PublicTeam, Season } from '../../types'

function getTeamCacheKey(seasonId?: string, teamId?: string): string {
  return `${seasonId || ''}::${teamId || ''}`
}

function getTeamCardTintStyle(color?: string | null): React.CSSProperties | undefined {
  const clean = color?.trim()
  if (!clean) return undefined

  const hexMatch = clean.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hexMatch) {
    const hex = hexMatch[1]
    const r =
      hex.length === 3
        ? parseInt(hex[0] + hex[0], 16)
        : parseInt(hex.slice(0, 2), 16)
    const g =
      hex.length === 3
        ? parseInt(hex[1] + hex[1], 16)
        : parseInt(hex.slice(2, 4), 16)
    const b =
      hex.length === 3
        ? parseInt(hex[2] + hex[2], 16)
        : parseInt(hex.slice(4, 6), 16)

    return {
      backgroundImage: `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.15) 0%, rgba(${r}, ${g}, ${b}, 0.05) 42%, rgba(${r}, ${g}, ${b}, 0) 72%)`
    }
  }

  return {
    backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${clean} 15%, transparent) 0%, color-mix(in srgb, ${clean} 5%, transparent) 42%, transparent 72%)`
  }
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
  const [isLoadingOverview, setIsLoadingOverview] = useState<boolean>(false)

  const fetchOwnerOverview = async () => {
    if (!user || user.role !== 'owner' || !teamId || !supabase) {
      setOwnerOverview(null)
      return
    }
    try {
      setIsLoadingOverview(true)
      const { data, error } = await supabase.rpc('owner_team_overview')
      if (error) {
        console.error('owner_team_overview error:', error)
        setOwnerOverview(null)
        return
      }
      const items = Array.isArray(data) ? data : data ? [data] : []
      const matched = items.find(
        (item: any) => String(item.team_id || item.id) === String(teamId)
      )
      setOwnerOverview(matched || null)
    } catch (err) {
      console.error('Failed to load owner overview:', err)
      setOwnerOverview(null)
    } finally {
      setIsLoadingOverview(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'owner' && teamId) {
      fetchOwnerOverview()
    } else {
      setOwnerOverview(null)
    }
  }, [user?.role, user?.id, teamId])

  const loadData = async () => {
    if (!id || !teamId) return
    const key = getTeamCacheKey(id, teamId)
    const cached = getCachedTeamDetail(id, teamId)

    if (cached) {
      setSeason(cached.season)
      setTeam(cached.team)
      setTeamPlayers(cached.teamPlayers)
      setAllPlayers(cached.allPlayers)
      setSportRoles(cached.sportRoles)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }
    setHasError(false)

    try {
      const active = await getActiveSeason()
      const prevActive = publicCache.activeSeason.value
      const activeChanged =
        !publicCache.activeSeason.loaded || hasDataChanged(prevActive, active)
      publicCache.activeSeason = { loaded: true, value: active }
      if (activeChanged) {
        setActiveSeason(active)
      }

      const [s, publicTeams] = await Promise.all([
        getSeason(id),
        getPublicTeams(id)
      ])
      publicCache.teamsBySeason.set(id, publicTeams)

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
        setSeason(s)
        setTeam(null)
        return
      }

      const [seasonPlayers, roles] = await Promise.all([
        getPublicPlayersBySeason(id),
        getRolesForSport(foundTeam.sport)
      ])
      publicCache.playersBySeason.set(id, seasonPlayers)

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
    loadData()
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
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <CaretLeft size={16} />
            <span>Back to Teams</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : hasError ? (
          <ErrorState
            title="Failed to Load Franchise Details"
            description="We encountered an issue loading this team's roster."
            onRetry={loadData}
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
            <div
              style={getTeamCardTintStyle(team.color)}
              className="p-6 sm:p-8 rounded-3xl bg-surface border border-border flex flex-col md:flex-row items-center md:items-center justify-between gap-6 shadow-sm"
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
            {ownerOverview && (() => {
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

              const boughtPlayers = list.map((p: any) => ({
                athlete_code: formatAthleteCode(p.athlete_code ?? p.player_code ?? p.code ?? p.id),
                name: String(p.name || p.player_name || 'Unnamed Player'),
                playing_role: String(p.playing_role || p.role || 'Player'),
                purchase_price: Number(p.purchase_price ?? p.price ?? p.amount ?? 0)
              }))

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

              return (
                <div className="bg-surface border border-accent-bright/35 rounded-2xl p-6 sm:p-8 mb-10 shadow-sm relative overflow-hidden font-dm-sans">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider bg-accent-bright/15 text-accent-bright font-semibold">
                          CONFIDENTIAL FRANCHISE PORTAL
                        </span>
                      </div>
                      <h2 className="font-syne font-bold text-2xl sm:text-3xl text-text tracking-tight">
                        Owner Panel
                      </h2>
                      <p className="text-xs text-muted mt-1">
                        Purse status and acquired roster for {team?.name || 'this team'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <button
                        type="button"
                        onClick={fetchOwnerOverview}
                        disabled={isLoadingOverview}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface border border-border text-xs font-medium text-text transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <ArrowsClockwise
                          size={14}
                          className={isLoadingOverview ? 'animate-spin' : ''}
                        />
                        <span>Refresh</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => logout()}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-2 hover:bg-surface border border-border text-xs font-medium text-muted hover:text-text transition-colors cursor-pointer"
                      >
                        <SignOut size={14} />
                        <span>Sign out</span>
                      </button>
                    </div>
                  </div>

                  {/* 3 Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-6">
                    <div className="bg-surface-2 border border-border rounded-xl p-4">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1">
                        Purse Spent
                      </span>
                      <span className="font-mono text-2xl font-bold text-text tabular-nums">
                        {formatPoints(purseSpent)}
                      </span>
                    </div>

                    <div className="bg-surface-2 border border-border rounded-xl p-4">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1">
                        Purse Remaining
                      </span>
                      <span className="font-mono text-2xl font-bold text-accent-bright tabular-nums">
                        {formatPoints(currentPurse)}
                      </span>
                    </div>

                    <div className="bg-surface-2 border border-border rounded-xl p-4">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-muted block mb-1">
                        Roster Count
                      </span>
                      <span className="font-mono text-2xl font-bold text-text tabular-nums">
                        {rosterCount}
                      </span>
                    </div>
                  </div>

                  {/* Players Bought */}
                  <div>
                    <h3 className="font-syne font-bold text-base text-text mb-3">
                      Players Bought ({boughtPlayers.length})
                    </h3>

                    {boughtPlayers.length === 0 ? (
                      <div className="p-6 text-center rounded-xl bg-surface-2 border border-border text-xs text-muted">
                        No players acquired yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-border bg-surface-2 font-mono text-[11px] text-muted uppercase tracking-wider">
                              <th className="py-2.5 px-4 font-medium">Code</th>
                              <th className="py-2.5 px-4 font-medium">Athlete Name</th>
                              <th className="py-2.5 px-4 font-medium">Role</th>
                              <th className="py-2.5 px-4 font-medium text-right">Purchase Price</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {boughtPlayers.map((bp, idx) => (
                              <tr
                                key={`${bp.athlete_code}-${idx}`}
                                className="hover:bg-surface-2/60 transition-colors"
                              >
                                <td className="py-3 px-4 font-mono font-bold text-accent-bright tabular-nums">
                                  {bp.athlete_code}
                                </td>
                                <td className="py-3 px-4 font-medium text-text">
                                  {bp.name}
                                </td>
                                <td className="py-3 px-4 text-muted">
                                  {bp.playing_role}
                                </td>
                                <td className="py-3 px-4 font-mono text-text font-semibold text-right tabular-nums">
                                  {formatPoints(bp.purchase_price)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
