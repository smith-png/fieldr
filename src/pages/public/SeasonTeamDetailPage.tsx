import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CaretLeft, ShieldCheck, Users } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { EmptyState, ErrorState, Spinner } from '../../components/ui'
import { RosterPlayerCard } from '../../components/roster/RosterPlayerCard'
import {
  getActiveSeason,
  getPublicPlayersBySeason,
  getPublicTeams,
  getRolesForSport,
  getSeason
} from '../../lib/data'
import {
  hasDataChanged,
  publicCache,
  type SeasonTeamDetailCacheEntry
} from '../../lib/publicCache'
import { getInitials } from '../../lib/utils'
import type { PublicPlayer, PublicTeam, Season } from '../../types'

function getTeamCacheKey(seasonId?: string, teamId?: string): string {
  return `${seasonId || ''}::${teamId || ''}`
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

  const [isLoading, setIsLoading] = useState<boolean>(!initialCached)
  const [hasError, setHasError] = useState<boolean>(false)

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
            to={`/season/${id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <CaretLeft size={16} />
            <span>Back to {season?.name || 'Season'}</span>
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
            actionLabel="Return to Season"
            onAction={() => navigate(`/season/${id}`)}
          />
        ) : (
          <div className="flex flex-col gap-8">
            {/* Team Header */}
            <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border flex flex-col md:flex-row items-center md:items-center justify-between gap-6 shadow-sm">
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
                <div className="flex flex-col sm:flex-row items-center gap-4 pt-5 md:pt-0 border-t md:border-t-0 md:border-l border-border md:pl-8 w-full md:w-auto justify-center md:justify-start shrink-0">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden bg-surface-2 border border-border flex items-center justify-center shrink-0 select-none">
                    {showOwnerPhoto ? (
                      <img
                        src={ownerPhotoUrl}
                        alt={ownerName || 'Franchise Owner'}
                        referrerPolicy="no-referrer"
                        onError={() => setFailedOwnerPhotoUrl(ownerPhotoUrl)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="font-syne font-bold text-2xl text-muted tracking-tight uppercase"
                      >
                        {getInitials(ownerName)}
                      </span>
                    )}
                  </div>

                  <div className="text-center sm:text-left">
                    <span className="block text-[11px] font-mono uppercase tracking-wider text-muted">
                      Franchise Owner
                    </span>
                    {ownerName && (
                      <span className="font-syne font-bold text-lg text-text tracking-tight block mt-0.5">
                        {ownerName}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

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
                                  photo_thumb_url: p.photo_thumb_url
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
