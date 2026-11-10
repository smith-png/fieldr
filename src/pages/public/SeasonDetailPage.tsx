import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Calendar,
  CaretLeft,
  CaretRight,
  Clock,
  Funnel,
  MagnifyingGlass,
  ShieldCheck,
  Trophy,
  Users
} from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { EmptyState, ErrorState, SegmentedControl, Spinner } from '../../components/ui'
import { RosterPlayerCard } from '../../components/roster/RosterPlayerCard'
import {
  getActiveSeason,
  getMatches,
  getPlayers,
  getPublicTeams,
  getSeason,
  getSports
} from '../../lib/data'
import type { MatchWithTeams, Player, PublicTeam, Season, Sport } from '../../types'

type SeasonTab = 'overview' | 'teams' | 'players' | 'matches'

export const SeasonDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [season, setSeason] = useState<Season | null>(null)
  const [sports, setSports] = useState<Sport[]>([])
  const [teams, setTeams] = useState<PublicTeam[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [matches, setMatches] = useState<MatchWithTeams[]>([])

  const [activeTab, setActiveTab] = useState<SeasonTab>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Filters for players & matches
  const [playerSportFilter, setPlayerSportFilter] = useState('all')
  const [playerSearch, setPlayerSearch] = useState('')
  const [matchSportFilter, setMatchSportFilter] = useState('all')

  const loadData = async () => {
    if (!id) return
    setIsLoading(true)
    setHasError(false)

    try {
      const active = await getActiveSeason()
      setActiveSeason(active)

      const s = await getSeason(id)
      if (!s) {
        setSeason(null)
        return
      }

      setSeason(s)

      const [sportsData, teamsData, playersData, matchesData] = await Promise.all([
        getSports(),
        getPublicTeams(id),
        getPlayers(id),
        getMatches(id)
      ])

      setSports(sportsData)
      setTeams(teamsData)
      setPlayers(playersData)
      setMatches(matchesData)
    } catch {
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  // Filter players
  const filteredPlayers = players.filter((p) => {
    if (playerSportFilter !== 'all' && p.sport.toLowerCase() !== playerSportFilter.toLowerCase()) {
      return false
    }
    if (playerSearch.trim()) {
      const q = playerSearch.trim().toLowerCase()
      const matchesName = p.name.toLowerCase().includes(q)
      const matchesCode = String(p.athlete_code || p.player_code).toLowerCase().includes(q)
      if (!matchesName && !matchesCode) return false
    }
    return true
  })

  // Filter matches
  const filteredMatches = matches.filter((m) => {
    if (matchSportFilter !== 'all' && m.sport.toLowerCase() !== matchSportFilter.toLowerCase()) {
      return false
    }
    return true
  })

  // Group matches by round
  const matchesByRound = filteredMatches.reduce<Record<string, MatchWithTeams[]>>((acc, m) => {
    const r = m.round || 'Regular Round'
    if (!acc[r]) acc[r] = []
    acc[r].push(m)
    return acc
  }, {})

  // Calculate Standings Table per sport
  const calculateStandings = (sportName: string) => {
    const sportMatches = matches.filter(
      (m) => m.sport.toLowerCase() === sportName.toLowerCase() && m.status === 'completed'
    )
    const sportTeams = teams.filter((t) => t.sport.toLowerCase() === sportName.toLowerCase())

    const statsMap: Record<string, { team: PublicTeam; played: number; won: number; lost: number; points: number }> = {}

    for (const t of sportTeams) {
      statsMap[t.id] = { team: t, played: 0, won: 0, lost: 0, points: 0 }
    }

    for (const m of sportMatches) {
      if (!m.team_a_id || !m.team_b_id) continue
      if (!statsMap[m.team_a_id]) {
        const teamObj = teams.find((t) => t.id === m.team_a_id)
        if (teamObj) statsMap[m.team_a_id] = { team: teamObj, played: 0, won: 0, lost: 0, points: 0 }
      }
      if (!statsMap[m.team_b_id]) {
        const teamObj = teams.find((t) => t.id === m.team_b_id)
        if (teamObj) statsMap[m.team_b_id] = { team: teamObj, played: 0, won: 0, lost: 0, points: 0 }
      }

      if (statsMap[m.team_a_id]) statsMap[m.team_a_id].played += 1
      if (statsMap[m.team_b_id]) statsMap[m.team_b_id].played += 1

      if (m.winner_team_id) {
        if (statsMap[m.winner_team_id]) {
          statsMap[m.winner_team_id].won += 1
          statsMap[m.winner_team_id].points += 2
        }
        const loserId = m.winner_team_id === m.team_a_id ? m.team_b_id : m.team_a_id
        if (statsMap[loserId]) {
          statsMap[loserId].lost += 1
        }
      }
    }

    return Object.values(statsMap).sort((a, b) => b.points - a.points || b.won - a.won)
  }

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-on-accent relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 md:px-12 pt-32 sm:pt-40 pb-20">
        <div className="mb-6">
          <Link
            to="/season"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <CaretLeft size={16} />
            <span>All seasons</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : hasError ? (
          <ErrorState
            title="Failed to Load Season Details"
            description="We encountered an issue retrieving this season's information."
            onRetry={loadData}
          />
        ) : !season ? (
          <EmptyState
            icon={Trophy}
            title="Season Not Found"
            description="The requested tournament season does not exist."
            actionLabel="View All Seasons"
            onAction={() => navigate('/season')}
          />
        ) : (
          <div className="flex flex-col gap-8">
            {/* Season Header */}
            <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border shadow-sm">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-mono uppercase border ${
                    season.is_active
                      ? 'bg-accent-bright/15 text-accent-bright border-accent-bright/40'
                      : 'bg-surface-2 text-points border-border'
                  }`}
                >
                  {season.is_active ? 'Active Season' : season.is_archived ? 'Archived Season' : 'Past Season'}
                </span>
                {season.start_date && (
                  <span className="text-xs text-muted font-mono">
                    {season.start_date} {season.end_date ? `to ${season.end_date}` : ''}
                  </span>
                )}
              </div>

              <h1 className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight">
                {season.name}
              </h1>

              {season.description && (
                <p className="text-xs sm:text-sm text-muted mt-2 max-w-3xl">
                  {season.description}
                </p>
              )}

              {/* Tabs Navigation */}
              <div className="mt-8 border-b border-border flex items-center gap-6 text-xs font-medium overflow-x-auto">
                {(['overview', 'teams', 'players', 'matches'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={`capitalize pb-3 border-b-2 transition-colors whitespace-nowrap ${
                      activeTab === tab
                        ? 'border-accent-bright text-accent-bright font-bold'
                        : 'border-transparent text-muted hover:text-text'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Contents */}
            {activeTab === 'overview' && (
              <div className="flex flex-col gap-8">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 rounded-2xl bg-surface border border-border">
                    <span className="text-xs text-muted font-mono uppercase">Participating Teams</span>
                    <span className="font-syne font-bold text-3xl text-text block mt-1">{teams.length}</span>
                  </div>
                  <div className="p-5 rounded-2xl bg-surface border border-border">
                    <span className="text-xs text-muted font-mono uppercase">Registered Roster Players</span>
                    <span className="font-syne font-bold text-3xl text-text block mt-1">{players.length}</span>
                  </div>
                  <div className="p-5 rounded-2xl bg-surface border border-border">
                    <span className="text-xs text-muted font-mono uppercase">Fixtures & Matches</span>
                    <span className="font-syne font-bold text-3xl text-text block mt-1">{matches.length}</span>
                  </div>
                </div>

                {/* Standings Summary */}
                {sports.map((sport) => {
                  const standings = calculateStandings(sport.name)
                  if (standings.length === 0) return null

                  return (
                    <div key={sport.id} className="p-6 rounded-3xl bg-surface border border-border space-y-4">
                      <h3 className="font-syne font-bold text-lg text-text flex items-center gap-2">
                        <Trophy size={18} className="text-accent-bright" />
                        <span>{sport.name} Standings</span>
                      </h3>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-surface-2 text-muted font-mono uppercase text-[10px]">
                            <tr>
                              <th className="p-3">Rank</th>
                              <th className="p-3">Team</th>
                              <th className="p-3 text-center">Played</th>
                              <th className="p-3 text-center">Won</th>
                              <th className="p-3 text-center">Lost</th>
                              <th className="p-3 text-right">Points</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border font-sans">
                            {standings.map((st, idx) => (
                              <tr key={st.team.id} className="hover:bg-surface-2/40">
                                <td className="p-3 font-mono text-muted">{idx + 1}</td>
                                <td className="p-3 font-medium text-text">
                                  <Link
                                    to={`/season/${id}/teams/${st.team.id}`}
                                    className="flex items-center gap-2 hover:text-accent-bright transition-colors"
                                  >
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.team.color || 'currentColor' }} />
                                    <span>{st.team.name}</span>
                                  </Link>
                                </td>
                                <td className="p-3 text-center font-mono">{st.played}</td>
                                <td className="p-3 text-center font-mono text-accent-bright">{st.won}</td>
                                <td className="p-3 text-center font-mono text-muted">{st.lost}</td>
                                <td className="p-3 text-right font-mono font-bold text-text">{st.points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {activeTab === 'teams' && (
              <div>
                {teams.length === 0 ? (
                  <EmptyState
                    icon={ShieldCheck}
                    title="No Teams Configured"
                    description="No franchise teams have been created for this season yet."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {teams.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => navigate(`/season/${id}/teams/${t.id}`)}
                        className="p-5 rounded-2xl bg-surface border border-border hover:border-accent-bright cursor-pointer transition-all group flex flex-col justify-between gap-4"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center font-syne font-bold text-white text-sm shrink-0"
                            style={{ backgroundColor: t.color || 'var(--accent)' }}
                          >
                            {t.short_code}
                          </div>
                          <div>
                            <h4 className="font-syne font-bold text-base text-text group-hover:text-accent-bright transition-colors">
                              {t.name}
                            </h4>
                            <span className="text-xs text-muted">{t.sport}</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
                          <span>Owner: {t.owner_display_name || 'Unassigned'}</span>
                          <CaretRight size={16} className="group-hover:translate-x-1 transition-transform text-accent-bright" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'players' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-border">
                  <div className="relative flex-1 max-w-md">
                    <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      placeholder="Search player by name or ID..."
                      className="w-full bg-bg border border-border rounded-xl pl-10 pr-4 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <Funnel size={14} className="text-muted" />
                    <select
                      value={playerSportFilter}
                      onChange={(e) => setPlayerSportFilter(e.target.value)}
                      className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent-bright"
                    >
                      <option value="all">All Sports</option>
                      {sports.map((s) => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {filteredPlayers.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No Players Found"
                    description="No player roster entries match your search criteria."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {filteredPlayers.map((p) => {
                      const athleteEntries = players.filter((other) => other.athlete_id && other.athlete_id === p.athlete_id)
                      const otherSports = athleteEntries.filter((other) => other.sport !== p.sport).map((other) => other.sport)

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
                          team={teams.find((t) => t.id === p.team_id)}
                          otherSports={otherSports}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'matches' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-border">
                  <span className="text-xs text-muted font-mono uppercase">Filter Fixtures</span>
                  <select
                    value={matchSportFilter}
                    onChange={(e) => setMatchSportFilter(e.target.value)}
                    className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent-bright"
                  >
                    <option value="all">All Sports</option>
                    {sports.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {filteredMatches.length === 0 ? (
                  <EmptyState
                    icon={Trophy}
                    title="No Fixtures Scheduled"
                    description="No matches have been added for this season yet."
                  />
                ) : (
                  <div className="space-y-6">
                    {Object.entries(matchesByRound).map(([roundName, roundMatches]) => (
                      <div key={roundName} className="space-y-3">
                        <h3 className="text-xs font-mono uppercase tracking-wider text-accent-bright border-b border-border pb-1">
                          {roundName}
                        </h3>
                        <div className="grid grid-cols-1 gap-3">
                          {roundMatches.map((m) => (
                            <div key={m.id} className="p-4 rounded-xl bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                              <div className="flex items-center gap-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-2 text-muted">
                                  {m.sport}
                                </span>
                                <div className="font-semibold text-text flex items-center gap-2">
                                  <span>{m.team_a?.name || 'Team A'}</span>
                                  {m.score_a && <span className="text-accent-bright font-mono">({m.score_a})</span>}
                                  <span className="text-muted font-mono text-[10px]">VS</span>
                                  <span>{m.team_b?.name || 'Team B'}</span>
                                  {m.score_b && <span className="text-accent-bright font-mono">({m.score_b})</span>}
                                </div>
                              </div>

                              <div className="text-muted">
                                {m.result_summary ? (
                                  <span className="text-text font-medium">{m.result_summary}</span>
                                ) : m.scheduled_at ? (
                                  <span className="flex items-center gap-1">
                                    <Clock size={14} />
                                    {new Date(m.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                  </span>
                                ) : (
                                  <span>Scheduled</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
