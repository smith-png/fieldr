import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Trophy } from '@phosphor-icons/react'
import { HeaderBar } from '../components/HeaderBar'
import { NavigationMenu } from '../components/NavigationMenu'
import { SiteFooter } from '../components/SiteFooter'
import { getActiveSeason, getSports, getTeams } from '../lib/data'
import type { Season, Sport, Team } from '../lib/types'

export const SeasonPage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [sports, setSports] = useState<Sport[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        setIsLoading(true)
        const season = await getActiveSeason()
        if (mounted) setActiveSeason(season)

        const sportsList = await getSports()
        if (mounted) setSports(sportsList)

        if (season) {
          const teamList = await getTeams(season.id)
          if (mounted) setTeams(teamList)
        }
      } catch {
        // demo fallback
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
        <div className="mb-10 pb-6 border-b border-border">
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
            TOURNAMENT SCHEDULE & ACTIVE CALENDAR
          </span>
          <h1 className="font-syne font-extrabold text-4xl sm:text-5xl text-text tracking-tight">
            Current Season
          </h1>
        </div>

        {isLoading ? (
          <div className="bg-surface border border-border rounded-2xl p-8 animate-pulse h-64 max-w-2xl" />
        ) : !activeSeason ? (
          <div className="bg-surface border border-border rounded-2xl p-16 text-center max-w-lg mx-auto shadow-sm">
            <Trophy size={42} weight="duotone" className="mx-auto text-muted mb-4" />
            <h3 className="font-syne font-bold text-2xl text-text mb-2">
              No Active Season Scheduled
            </h3>
            <p className="text-sm text-muted leading-relaxed mb-6">
              There is currently no live tournament season published. Stay tuned or log into the administrator dashboard to inaugurate the next tournament season.
            </p>
            <Link
              to="/rosters"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-btn-bg text-btn-fg font-medium text-xs hover:opacity-90 transition-opacity"
            >
              Browse Sports Rosters
            </Link>
          </div>
        ) : (
          <div className="space-y-8 max-w-3xl">
            {/* Season Details Card */}
            <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm">
              <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-accent-bright mb-3">
                <span className="w-2 h-2 rounded-full bg-accent-bright" />
                <span>Active Tournament</span>
              </div>
              <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-text mb-4">
                {activeSeason.name}
              </h2>

              <div className="flex flex-wrap items-center gap-6 py-4 border-y border-border text-xs text-muted">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-accent-bright" />
                  <span>
                    Start: {activeSeason.start_date ? new Date(activeSeason.start_date).toLocaleDateString() : 'Announced live'}
                  </span>
                </div>
                {activeSeason.end_date && (
                  <>
                    <span className="text-border">·</span>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-accent-bright" />
                      <span>End: {new Date(activeSeason.end_date).toLocaleDateString()}</span>
                    </div>
                  </>
                )}
                <span className="text-border">·</span>
                <span className="font-mono text-text">
                  {teams.length} {teams.length === 1 ? 'Franchise' : 'Franchises'}
                </span>
              </div>

              {/* Sports Included */}
              <div className="mt-6">
                <span className="text-xs font-mono uppercase tracking-wider text-muted block mb-3">
                  Sanctioned Athletic Disciplines
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {sports.map((sport) => (
                    <Link
                      key={sport.id}
                      to={`/rosters/${sport.id}`}
                      className="group bg-surface-2 border border-border hover:border-accent-bright p-4 rounded-xl transition-colors"
                    >
                      <h4 className="font-syne font-bold text-base text-text group-hover:text-accent-bright">
                        {sport.name}
                      </h4>
                      <p className="text-[11px] text-muted mt-1 font-mono">
                        {sport.roles.length} Playing roles
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
