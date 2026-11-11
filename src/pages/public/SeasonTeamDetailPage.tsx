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
import type { PublicPlayer, PublicTeam, Season } from '../../types'

export const SeasonTeamDetailPage: React.FC = () => {
  const { id, teamId } = useParams<{ id: string; teamId: string }>()
  const navigate = useNavigate()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [season, setSeason] = useState<Season | null>(null)
  const [team, setTeam] = useState<PublicTeam | null>(null)
  const [teamPlayers, setTeamPlayers] = useState<PublicPlayer[]>([])
  const [allPlayers, setAllPlayers] = useState<PublicPlayer[]>([])
  const [sportRoles, setSportRoles] = useState<string[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const loadData = async () => {
    if (!id || !teamId) return
    setIsLoading(true)
    setHasError(false)

    try {
      const active = await getActiveSeason()
      setActiveSeason(active)

      const s = await getSeason(id)
      setSeason(s)

      const publicTeams = await getPublicTeams(id)
      const foundTeam = publicTeams.find((t) => t.id === teamId)
      if (!foundTeam) {
        setTeam(null)
        return
      }

      setTeam(foundTeam)

      const [seasonPlayers, roles] = await Promise.all([
        getPublicPlayersBySeason(id),
        getRolesForSport(foundTeam.sport)
      ])

      setAllPlayers(seasonPlayers)
      setTeamPlayers(seasonPlayers.filter((p) => p.team_id === teamId))
      setSportRoles(roles)
    } catch (err) {
      console.error(
        'Failed to load season team detail data:',
        err instanceof Error ? err.message : err,
        err
      )
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id, teamId])

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
            <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border flex flex-col sm:flex-row items-center sm:items-start gap-6 shadow-sm">
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center overflow-hidden border border-border font-syne font-extrabold text-white text-2xl shrink-0"
                style={{ backgroundColor: team.color || 'var(--accent)' }}
              >
                {team.logo_url ? (
                  <img src={team.logo_url} alt={team.name} className="w-full h-full object-cover" />
                ) : (
                  <span>{team.short_code}</span>
                )}
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-surface-2 border border-border text-text">
                    {team.short_code} &bull; {team.sport}
                  </span>
                </div>

                <h1 className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight">
                  {team.name}
                </h1>

                <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-muted">
                  <span>Owner: <strong className="text-text">{team.owner_display_name || 'Unassigned'}</strong></span>
                  <span>&bull;</span>
                  <span>Roster Squad: {teamPlayers.length} Players</span>
                </div>
              </div>
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
