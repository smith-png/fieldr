import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CaretRight, Shield, Users } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { getActiveSeason, getPlayers, getPublicTeams } from '../../lib/data'
import type { Player, PublicTeam, Season } from '../../types'

export const TeamsPage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [teams, setTeams] = useState<PublicTeam[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        setIsLoading(true)
        const season = await getActiveSeason()
        if (mounted) setActiveSeason(season)

        if (season) {
          const [teamList, playerList] = await Promise.all([
            getPublicTeams(season.id),
            getPlayers(season.id)
          ])
          if (mounted) {
            setTeams(teamList)
            setPlayers(playerList)
          }
        }
      } catch (err) {
        console.error(
          'Failed to load teams page data:',
          err instanceof Error ? err.message : err,
          err
        )
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-on-accent relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-16 lg:px-24 pt-32 sm:pt-40 pb-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 pb-6 border-b border-border">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
              FRANCHISE DIRECTORY · {activeSeason?.name || 'ACTIVE SEASON'}
            </span>
            <h1 className="font-syne font-extrabold text-4xl sm:text-5xl text-text tracking-tight">
              Registered Teams
            </h1>
          </div>
          <div className="text-sm font-mono text-muted">
            Total Franchises: <span className="text-text font-semibold">{teams.length}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface border border-border rounded-2xl p-6 animate-pulse h-60"
              />
            ))}
          </div>
        ) : !activeSeason || teams.length === 0 ? (
          <div className="bg-surface border border-border rounded-2xl p-16 text-center max-w-lg mx-auto shadow-sm">
            <Shield size={42} weight="duotone" className="mx-auto text-muted mb-4" />
            <h3 className="font-syne font-bold text-2xl text-text mb-2">
              No Active Teams Found
            </h3>
            <p className="text-sm text-muted leading-relaxed mb-6">
              There are no registered franchises in the current tournament season yet. Tournament administrators configure teams in the control panel.
            </p>
            <Link
              to="/rosters"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-btn-bg text-btn-fg font-medium text-xs hover:opacity-90 transition-opacity"
            >
              Browse Player Rosters
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => {
              const assignedCount = players.filter((p) => p.team_id === team.id).length
              return (
                <Link
                  key={team.id}
                  to={`/season/${team.season_id}/teams/${team.id}`}
                  className="group bg-surface border border-border hover:border-accent-bright rounded-2xl p-6 transition-colors flex flex-col justify-between shadow-sm"
                >
                  <div>
                    {/* Header with Logo and Color Badge */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        {team.logo_url ? (
                          <img
                            src={team.logo_url}
                            alt={team.name}
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-xl object-contain bg-surface-2 border border-border p-1"
                          />
                        ) : (
                          <div
                            className="w-12 h-12 rounded-xl border border-border flex items-center justify-center font-syne font-bold text-base text-white shadow-inner"
                            style={{ backgroundColor: team.color || 'var(--accent-bright)' }}
                          >
                            {team.short_code}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs uppercase tracking-wider text-muted">
                              {team.sport}
                            </span>
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block border border-border"
                              style={{ backgroundColor: team.color || 'var(--accent-bright)' }}
                              title={`Team color: ${team.color}`}
                            />
                          </div>
                          <h3 className="font-syne font-bold text-xl text-text group-hover:text-accent-bright transition-colors tracking-tight">
                            {team.name}
                          </h3>
                        </div>
                      </div>

                      <span className="font-mono text-xs px-2.5 py-1 rounded bg-surface-2 border border-border text-muted">
                        {team.short_code}
                      </span>
                    </div>

                    {/* Owner Info */}
                    <div className="py-3 border-y border-border text-xs text-muted">
                      <span className="block text-[11px] uppercase tracking-wider text-muted">
                        Franchise Owner
                      </span>
                      <span className="text-text font-medium">
                        {team.owner_display_name || 'Unassigned franchise'}
                      </span>
                    </div>
                  </div>

                  {/* Squad Metrics */}
                  <div className="flex items-center justify-between pt-4 mt-2">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Users size={16} className="text-accent-bright" />
                      <span>Roster Size:</span>
                      <span className="font-mono font-bold text-text tabular-nums">
                        {assignedCount} {assignedCount === 1 ? 'player' : 'players'}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-bright">
                      <span>View Squad</span>
                      <CaretRight size={14} weight="bold" className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
