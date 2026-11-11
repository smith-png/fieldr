import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CaretRight, Trophy } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { EmptyState, ErrorState, Spinner } from '../../components/ui'
import { getActiveSeason, getPublicPlayersBySeason, getPublicTeams, getSeasons } from '../../lib/data'
import { sortSeasons } from '../../lib/utils'
import type { Season } from '../../types'

interface SeasonCardData {
  season: Season
  teamCount: number
  playerCount: number
}

export const SeasonPage: React.FC = () => {
  const navigate = useNavigate()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [seasonCards, setSeasonCards] = useState<SeasonCardData[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hasError, setHasError] = useState<boolean>(false)

  const loadData = async () => {
    setIsLoading(true)
    setHasError(false)
    try {
      const active = await getActiveSeason()
      setActiveSeason(active)

      const allSeasons = sortSeasons(await getSeasons())

      const cardPromises = allSeasons.map(async (s) => {
        const [teams, players] = await Promise.all([
          getPublicTeams(s.id),
          getPublicPlayersBySeason(s.id)
        ])
        return {
          season: s,
          teamCount: teams.length,
          playerCount: players.length
        }
      })

      const cards = await Promise.all(cardPromises)
      setSeasonCards(cards)
    } catch (err) {
      console.error(
        'Failed to load seasons page data:',
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
  }, [])

  const activeCard = seasonCards.find((c) => c.season.is_active)
  const previousCards = seasonCards.filter((c) => !c.season.is_active)

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-on-accent relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 md:px-12 pt-32 sm:pt-40 pb-20">
        <div className="mb-10 pb-6 border-b border-border">
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
            TOURNAMENT HISTORY & ARCHIVES
          </span>
          <h1 className="font-syne font-extrabold text-4xl sm:text-5xl text-text tracking-tight">
            Tournament Seasons
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-2 max-w-xl">
            Explore current live drafting tournaments and past collegiate athletic season archives.
          </p>
        </div>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : hasError ? (
          <ErrorState
            title="Unable to Load Seasons"
            description="Failed to load tournament season records."
            onRetry={loadData}
          />
        ) : seasonCards.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No Seasons Found"
            description="There are currently no active or archived seasons available."
          />
        ) : (
          <div className="flex flex-col gap-10">
            {/* Active Season Featured Card */}
            {activeCard && (
              <div>
                <h2 className="text-xs font-mono uppercase tracking-wider text-accent-bright mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent-bright animate-pulse" />
                  <span>Current Active Season</span>
                </h2>

                <div
                  onClick={() => navigate(`/season/${activeCard.season.id}`)}
                  className="p-6 sm:p-8 rounded-3xl bg-surface border-2 border-accent-bright/60 hover:border-accent-bright cursor-pointer transition-all shadow-md group relative overflow-hidden"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-accent-bright/15 text-accent-bright border border-accent-bright/40">
                          Live Active Tournament
                        </span>
                      </div>
                      <h3 className="font-syne font-extrabold text-3xl sm:text-4xl text-text group-hover:text-accent-bright transition-colors">
                        {activeCard.season.name}
                      </h3>
                      {activeCard.season.description && (
                        <p className="text-xs sm:text-sm text-muted max-w-2xl line-clamp-2">
                          {activeCard.season.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-accent-bright font-medium text-xs self-end md:self-center shrink-0">
                      <span>Enter Tournament Hub</span>
                      <CaretRight size={18} weight="bold" className="group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-muted block text-[10px] font-mono uppercase">Dates</span>
                      <span className="font-semibold text-text mt-0.5 block">
                        {activeCard.season.start_date
                          ? `${activeCard.season.start_date} ${activeCard.season.end_date ? `to ${activeCard.season.end_date}` : ''}`
                          : 'Ongoing'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block text-[10px] font-mono uppercase">Franchises</span>
                      <span className="font-mono font-bold text-text mt-0.5 block">{activeCard.teamCount} Teams</span>
                    </div>
                    <div>
                      <span className="text-muted block text-[10px] font-mono uppercase">Roster Entries</span>
                      <span className="font-mono font-bold text-text mt-0.5 block">{activeCard.playerCount} Players</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Previous Seasons Grid */}
            {previousCards.length > 0 && (
              <div>
                <h2 className="text-xs font-mono uppercase tracking-wider text-muted mb-4">
                  Previous & Archived Seasons ({previousCards.length})
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {previousCards.map(({ season, teamCount, playerCount }) => (
                    <div
                      key={season.id}
                      onClick={() => navigate(`/season/${season.id}`)}
                      className="p-6 rounded-2xl bg-surface border border-border hover:border-border/80 cursor-pointer transition-all flex flex-col justify-between gap-4 group"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-2 text-points border border-border">
                            {season.is_archived ? 'Archived' : 'Past Season'}
                          </span>
                          <span className="text-xs text-muted font-mono">
                            {season.start_date || new Date(season.created_at).getFullYear()}
                          </span>
                        </div>
                        <h3 className="font-syne font-bold text-xl text-text group-hover:text-accent-bright transition-colors">
                          {season.name}
                        </h3>
                        {season.description && (
                          <p className="text-xs text-muted mt-1 line-clamp-2">
                            {season.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted">
                        <div className="flex items-center gap-4 font-mono">
                          <span>{teamCount} Teams</span>
                          <span>&bull;</span>
                          <span>{playerCount} Players</span>
                        </div>
                        <CaretRight size={16} className="group-hover:translate-x-1 transition-transform text-accent-bright" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
