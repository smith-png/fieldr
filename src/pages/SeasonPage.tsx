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
    <div className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex flex-col justify-between selection:bg-[#047554] selection:text-white relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-16 lg:px-24 pt-32 sm:pt-40 pb-20">
        <div className="mb-10 pb-6 border-b border-white/10">
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-2">
            TOURNAMENT SCHEDULE & ACTIVE CALENDAR
          </span>
          <h1 className="font-syne font-extrabold text-4xl sm:text-5xl text-[#F0F2EE] tracking-tight">
            Current Season
          </h1>
        </div>

        {isLoading ? (
          <div className="bg-[#111411] border border-white/5 rounded-2xl p-8 animate-pulse h-64 max-w-2xl" />
        ) : !activeSeason ? (
          <div className="bg-[#111411] border border-white/10 rounded-2xl p-16 text-center max-w-lg mx-auto">
            <Trophy size={42} weight="duotone" className="mx-auto text-[#8E928C] mb-4" />
            <h3 className="font-syne font-bold text-2xl text-white mb-2">
              No Active Season Scheduled
            </h3>
            <p className="text-sm text-[#8E928C] leading-relaxed mb-6">
              There is currently no live tournament season published. Stay tuned or log into the administrator dashboard to inaugurate the next tournament season.
            </p>
            <Link
              to="/rosters"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] transition-colors"
            >
              Browse Sports Rosters
            </Link>
          </div>
        ) : (
          <div className="space-y-8 max-w-3xl">
            {/* Season Details Card */}
            <div className="bg-[#111411] border border-white/10 rounded-2xl p-8">
              <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-[#047554] mb-3">
                <span className="w-2 h-2 rounded-full bg-[#047554]" />
                <span>Active Tournament</span>
              </div>
              <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-white mb-4">
                {activeSeason.name}
              </h2>

              <div className="flex flex-wrap items-center gap-6 py-4 border-y border-white/10 text-xs text-[#CBD1CB]">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-[#047554]" />
                  <span>
                    Start: {activeSeason.start_date ? new Date(activeSeason.start_date).toLocaleDateString() : 'Announced live'}
                  </span>
                </div>
                {activeSeason.end_date && (
                  <>
                    <span className="text-white/20">·</span>
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-[#047554]" />
                      <span>End: {new Date(activeSeason.end_date).toLocaleDateString()}</span>
                    </div>
                  </>
                )}
                <span className="text-white/20">·</span>
                <span className="font-mono text-white">
                  {teams.length} {teams.length === 1 ? 'Franchise' : 'Franchises'}
                </span>
              </div>

              {/* Sports Included */}
              <div className="mt-6">
                <span className="text-xs font-mono uppercase tracking-wider text-[#8E928C] block mb-3">
                  Sanctioned Athletic Disciplines
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {sports.map((sport) => (
                    <Link
                      key={sport.id}
                      to={`/rosters/${sport.id}`}
                      className="group bg-black/40 border border-white/5 hover:border-[#047554] p-4 rounded-xl transition-colors"
                    >
                      <h4 className="font-syne font-bold text-base text-white group-hover:text-[#CBD1CB]">
                        {sport.name}
                      </h4>
                      <p className="text-[11px] text-[#8E928C] mt-1 font-mono">
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
