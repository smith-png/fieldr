import React, { useEffect, useState } from 'react'
import {
  Calendar,
  CheckCircle,
  Clock,
  DownloadSimple,
  PencilSimple,
  Plus,
  Trash,
  Trophy,
  UploadSimple,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { Match, MatchPlayerStats, MatchStatus, MatchWithTeams, Season, Sport, Team } from '../../types'
import {
  bulkCreateMatches,
  createMatch,
  deleteMatch,
  getMatches,
  getMatchStats,
  getPlayers,
  saveMatchStats,
  updateMatch
} from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog, EmptyState, SegmentedControl } from '../../components/ui'

interface AdminMatchesProps {
  season: Season | null
  teams: Team[]
  sports: Sport[]
  onRefresh: () => Promise<void>
}

export const AdminMatches: React.FC<AdminMatchesProps> = ({
  season,
  teams,
  sports,
  onRefresh
}) => {
  const { success, error } = useToast()
  const [matches, setMatches] = useState<MatchWithTeams[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Filters
  const [selectedSport, setSelectedSport] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Create / Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingMatch, setEditingMatch] = useState<MatchWithTeams | null>(null)
  const [sport, setSport] = useState<string>('Cricket')
  const [round, setRound] = useState('Regular Round')
  const [teamAId, setTeamAId] = useState('')
  const [teamBId, setTeamBId] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [venue, setVenue] = useState('')
  const [status, setStatus] = useState<MatchStatus>('scheduled')
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [winnerTeamId, setWinnerTeamId] = useState<string>('')
  const [resultSummary, setResultSummary] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Player Stats modal
  const [statsMatch, setStatsMatch] = useState<MatchWithTeams | null>(null)
  const [matchPlayers, setMatchPlayers] = useState<Array<{ id: string; name: string; teamName: string; teamId: string }>>([])
  const [playerStatsMap, setPlayerStatsMap] = useState<Record<string, Record<string, string | number>>>({})
  const [isSavingStats, setIsSavingStats] = useState(false)

  // CSV Import modal
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<Array<Omit<Match, 'id' | 'created_at'> & { valid: boolean; error?: string }>>([])
  const [isImporting, setIsImporting] = useState(false)

  const loadMatches = async () => {
    if (!season) return
    setIsLoading(true)
    try {
      const data = await getMatches(season.id, selectedSport)
      setMatches(data)
    } catch {
      setMatches([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadMatches()
  }, [season?.id, selectedSport])

  const openCreateModal = () => {
    setEditingMatch(null)
    const initialSport = sports[0]?.name || 'Cricket'
    setSport(initialSport)
    setRound('Regular Round')
    const sportTeams = teams.filter((t) => t.sport.toLowerCase() === initialSport.toLowerCase())
    setTeamAId(sportTeams[0]?.id || '')
    setTeamBId(sportTeams[1]?.id || '')
    setScheduledAt('')
    setVenue('')
    setStatus('scheduled')
    setScoreA('')
    setScoreB('')
    setWinnerTeamId('')
    setResultSummary('')
    setIsModalOpen(true)
  }

  const openEditModal = (match: MatchWithTeams) => {
    setEditingMatch(match)
    setSport(match.sport)
    setRound(match.round)
    setTeamAId(match.team_a_id)
    setTeamBId(match.team_b_id)
    setScheduledAt(match.scheduled_at ? match.scheduled_at.slice(0, 16) : '')
    setVenue(match.venue || '')
    setStatus(match.status)
    setScoreA(match.score_a || '')
    setScoreB(match.score_b || '')
    setWinnerTeamId(match.winner_team_id || '')
    setResultSummary(match.result_summary || '')
    setIsModalOpen(true)
  }

  const handleSaveMatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!season) return
    if (!teamAId || !teamBId) {
      error('Please select both teams')
      return
    }
    if (teamAId === teamBId) {
      error('Team A and Team B cannot be the same')
      return
    }

    try {
      setIsSubmitting(true)
      const payload: Omit<Match, 'id' | 'created_at'> = {
        season_id: season.id,
        sport,
        round: round.trim() || 'Regular',
        team_a_id: teamAId,
        team_b_id: teamBId,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        venue: venue.trim() || undefined,
        status,
        score_a: scoreA.trim() || undefined,
        score_b: scoreB.trim() || undefined,
        winner_team_id: winnerTeamId || null,
        result_summary: resultSummary.trim() || undefined
      }

      if (editingMatch) {
        await updateMatch(editingMatch.id, payload)
        success('Match updated successfully')
      } else {
        await createMatch(payload)
        success('Match created successfully')
      }
      setIsModalOpen(false)
      await loadMatches()
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save match'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this match?')) return
    try {
      await deleteMatch(id)
      success('Match deleted')
      await loadMatches()
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete match'
      error(msg)
    }
  }

  // Open player stats modal
  const openStatsModal = async (match: MatchWithTeams) => {
    setStatsMatch(match)
    try {
      const [allSeasonPlayers, existingStats] = await Promise.all([
        getPlayers(match.season_id),
        getMatchStats(match.id)
      ])

      const filtered = allSeasonPlayers
        .filter((p) => p.team_id === match.team_a_id || p.team_id === match.team_b_id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          teamName: p.team_id === match.team_a_id ? match.team_a?.name || 'Team A' : match.team_b?.name || 'Team B',
          teamId: p.team_id || ''
        }))

      setMatchPlayers(filtered)

      const initialMap: Record<string, Record<string, string | number>> = {}
      for (const s of existingStats) {
        initialMap[s.player_id] = (s.stats as Record<string, string | number>) || {}
      }
      setPlayerStatsMap(initialMap)
    } catch {
      setMatchPlayers([])
      setPlayerStatsMap({})
    }
  }

  const handleSaveStats = async () => {
    if (!statsMatch) return
    try {
      setIsSavingStats(true)
      const list = Object.entries(playerStatsMap).map(([playerId, stats]) => ({
        playerId,
        stats
      }))
      await saveMatchStats(statsMatch.id, list)
      success('Player match stats saved')
      setStatsMatch(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save stats'
      error(msg)
    } finally {
      setIsSavingStats(false)
    }
  }

  // CSV Template download
  const downloadTemplate = () => {
    const header = 'sport,round,team_a_code,team_b_code,scheduled_at,venue,status,score_a,score_b,winner_team_code,result_summary\n'
    const example = 'Cricket,Round 1,SCC,RTG,2026-03-05 14:00,Main Stadium,completed,184/5,172/8,SCC,Stallions CC won by 12 runs\n'
    const blob = new Blob([header + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matches_template_${season?.name || 'season'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !season) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (!content) return

      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length <= 1) {
        error('CSV is empty or missing headers')
        return
      }

      const rows: Array<Omit<Match, 'id' | 'created_at'> & { valid: boolean; error?: string }> = []
      const teamCodeMap = new Map<string, string>()
      for (const t of teams) {
        teamCodeMap.set(t.short_code.toUpperCase(), t.id)
      }

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim())
        if (parts.length < 4) continue

        const [
          sportVal,
          roundVal,
          tACode,
          tBCode,
          schedVal,
          venueVal,
          statusVal,
          scoreAVal,
          scoreBVal,
          winnerCode,
          resultVal
        ] = parts

        const tAId = teamCodeMap.get(tACode.toUpperCase())
        const tBId = teamCodeMap.get(tBCode.toUpperCase())
        const winId = winnerCode ? teamCodeMap.get(winnerCode.toUpperCase()) : null

        let rowError: string | undefined
        if (!tAId) rowError = `Unknown team code "${tACode}"`
        else if (!tBId) rowError = `Unknown team code "${tBCode}"`
        else if (tAId === tBId) rowError = 'Team A and Team B cannot be the same'

        const statusClean: MatchStatus =
          statusVal === 'completed' || statusVal === 'abandoned' ? statusVal : 'scheduled'

        rows.push({
          season_id: season.id,
          sport: sportVal || 'Cricket',
          round: roundVal || 'Regular',
          team_a_id: tAId || '',
          team_b_id: tBId || '',
          scheduled_at: schedVal ? new Date(schedVal).toISOString() : undefined,
          venue: venueVal || undefined,
          status: statusClean,
          score_a: scoreAVal || undefined,
          score_b: scoreBVal || undefined,
          winner_team_id: winId,
          result_summary: resultVal || undefined,
          valid: !rowError,
          error: rowError
        })
      }

      setCsvRows(rows)
      setIsCsvModalOpen(true)
    }
    reader.readAsText(file)
  }

  const confirmBulkImport = async () => {
    const validRows = csvRows.filter((r) => r.valid)
    if (validRows.length === 0) return

    try {
      setIsImporting(true)
      await bulkCreateMatches(validRows)
      success(`Imported ${validRows.length} matches successfully`)
      setIsCsvModalOpen(false)
      setCsvRows([])
      await loadMatches()
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      error(msg)
    } finally {
      setIsImporting(false)
    }
  }

  // Filtered teams for modal
  const eligibleTeams = teams.filter(
    (t) => t.sport.toLowerCase() === sport.toLowerCase()
  )

  const filteredMatches = matches.filter((m) => {
    if (statusFilter !== 'all' && m.status !== statusFilter) return false
    return true
  })

  return (
    <div className="flex flex-col gap-8 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
            Fixture & Results Management
          </span>
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-text tracking-tight">
            Tournament Matches
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Manage schedules, scores, venues, and individual player performance records for {season?.name}.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-border bg-surface hover:bg-surface-2 text-xs font-medium text-text cursor-pointer transition-colors flex items-center gap-2">
            <UploadSimple size={16} />
            <span>Import CSV</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          <Button variant="primary" onClick={openCreateModal}>
            <Plus size={16} weight="bold" />
            <span>New Match</span>
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-surface border border-border">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedSport('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              selectedSport === 'all'
                ? 'bg-accent/15 border border-accent-bright text-text font-semibold'
                : 'bg-surface-2 border border-border text-muted hover:text-text'
            }`}
          >
            All Sports
          </button>
          {sports.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedSport(s.name)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                selectedSport.toLowerCase() === s.name.toLowerCase()
                  ? 'bg-accent/15 border border-accent-bright text-text font-semibold'
                  : 'bg-surface-2 border border-border text-muted hover:text-text'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted font-mono uppercase text-[10px] mr-1">Status:</span>
          {(['all', 'scheduled', 'completed', 'abandoned'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`capitalize px-2.5 py-1 rounded-lg transition-colors ${
                statusFilter === st
                  ? 'bg-surface-2 text-text font-semibold border border-border'
                  : 'text-muted hover:text-text'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Matches List */}
      {isLoading ? (
        <div className="py-12 text-center text-xs font-mono text-muted">
          LOADING FIXTURES...
        </div>
      ) : filteredMatches.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No Matches Scheduled"
          description="Create a match fixture or import a CSV schedule for this season."
          actionLabel="Create First Match"
          onAction={openCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredMatches.map((m) => {
            const isCompleted = m.status === 'completed'
            const isScheduled = m.status === 'scheduled'

            return (
              <div
                key={m.id}
                className="p-5 rounded-2xl bg-surface border border-border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:border-border/80"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      isCompleted
                        ? 'bg-accent/15 text-accent-bright'
                        : isScheduled
                        ? 'bg-surface-2 text-muted'
                        : 'bg-error/10 text-error'
                    }`}
                  >
                    <Trophy size={22} weight={isCompleted ? 'fill' : 'regular'} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-2 border border-border text-muted">
                        {m.sport} &bull; {m.round}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${
                          isCompleted
                            ? 'bg-accent-bright/15 text-accent-bright border-accent-bright/40'
                            : isScheduled
                            ? 'bg-surface-2 text-muted border-border'
                            : 'bg-error/10 text-error border-error/30'
                        }`}
                      >
                        {m.status}
                      </span>
                      {m.venue && (
                        <span className="text-xs text-muted flex items-center gap-1">
                          &bull; {m.venue}
                        </span>
                      )}
                    </div>

                    {/* Team Matchup Lockup */}
                    <div className="flex flex-wrap items-center gap-3 my-1.5 font-syne font-bold text-base text-text">
                      <span className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: m.team_a?.color || 'currentColor' }}
                        />
                        <span>{m.team_a?.name || 'Team A'}</span>
                        {m.score_a && (
                          <span className="font-mono text-sm text-accent-bright ml-1">
                            ({m.score_a})
                          </span>
                        )}
                      </span>

                      <span className="text-xs font-mono text-muted uppercase">vs</span>

                      <span className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: m.team_b?.color || 'currentColor' }}
                        />
                        <span>{m.team_b?.name || 'Team B'}</span>
                        {m.score_b && (
                          <span className="font-mono text-sm text-accent-bright ml-1">
                            ({m.score_b})
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Result or Scheduled Date */}
                    <div className="text-xs text-muted mt-1 flex flex-wrap items-center gap-3">
                      {m.result_summary ? (
                        <span className="text-text font-medium">{m.result_summary}</span>
                      ) : m.scheduled_at ? (
                        <span className="flex items-center gap-1 text-muted">
                          <Clock size={14} />
                          {new Date(m.scheduled_at).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </span>
                      ) : (
                        <span>Date TBD</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                  {isCompleted && (
                    <button
                      type="button"
                      onClick={() => openStatsModal(m)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-border hover:border-accent-bright text-xs font-medium text-muted hover:text-text transition-colors"
                    >
                      Player Stats
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditModal(m)}
                    className="min-h-[38px] min-w-[38px] p-2 rounded-xl border border-border hover:border-accent-bright text-muted hover:text-text transition-colors flex items-center justify-center"
                    title="Edit Match"
                  >
                    <PencilSimple size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    className="min-h-[38px] min-w-[38px] p-2 rounded-xl border border-border hover:border-error hover:bg-error/10 hover:text-error text-muted transition-colors flex items-center justify-center"
                    title="Delete Match"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Match Form Modal */}
      {isModalOpen && (
        <Dialog
          isOpen={true}
          onClose={() => !isSubmitting && setIsModalOpen(false)}
          title={editingMatch ? 'Edit Match' : 'New Match Fixture'}
          description="Configure teams, schedule, scores, and status."
          size="lg"
        >
          <form onSubmit={handleSaveMatch} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Sport *</label>
                <select
                  value={sport}
                  onChange={(e) => {
                    const sp = e.target.value
                    setSport(sp)
                    const filtered = teams.filter((t) => t.sport.toLowerCase() === sp.toLowerCase())
                    setTeamAId(filtered[0]?.id || '')
                    setTeamBId(filtered[1]?.id || '')
                  }}
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                >
                  {sports.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Round / Stage *</label>
                <input
                  type="text"
                  value={round}
                  onChange={(e) => setRound(e.target.value)}
                  placeholder="e.g. Regular, Semi-final, Grand Final"
                  required
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Team A *</label>
                <select
                  value={teamAId}
                  onChange={(e) => setTeamAId(e.target.value)}
                  required
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                >
                  <option value="">Select Team A</option>
                  {eligibleTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.short_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Team B *</label>
                <select
                  value={teamBId}
                  onChange={(e) => setTeamBId(e.target.value)}
                  required
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                >
                  <option value="">Select Team B</option>
                  {eligibleTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.short_code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Date & Time</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Venue</label>
                <input
                  type="text"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="e.g. Main Oval, Court 2"
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as MatchStatus)}
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="abandoned">Abandoned</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Score Team A</label>
                <input
                  type="text"
                  value={scoreA}
                  onChange={(e) => setScoreA(e.target.value)}
                  placeholder="e.g. 184/5 (20.0)"
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Score Team B</label>
                <input
                  type="text"
                  value={scoreB}
                  onChange={(e) => setScoreB(e.target.value)}
                  placeholder="e.g. 172/8 (20.0)"
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Winner</label>
                <select
                  value={winnerTeamId}
                  onChange={(e) => setWinnerTeamId(e.target.value)}
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                >
                  <option value="">Draw / No Winner</option>
                  {eligibleTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase text-muted">Result Summary</label>
                <input
                  type="text"
                  value={resultSummary}
                  onChange={(e) => setResultSummary(e.target.value)}
                  placeholder="e.g. Stallions CC won by 12 runs"
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                isLoading={isSubmitting}
              >
                {editingMatch ? 'Save Changes' : 'Create Match'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Player Stats Modal */}
      {statsMatch && (
        <Dialog
          isOpen={true}
          onClose={() => !isSavingStats && setStatsMatch(null)}
          title={`Match Player Stats: ${statsMatch.round}`}
          description={`${statsMatch.team_a?.name || 'Team A'} vs ${statsMatch.team_b?.name || 'Team B'} (${statsMatch.sport})`}
          size="lg"
        >
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            {matchPlayers.length === 0 ? (
              <p className="text-xs text-muted py-4">No squad players assigned to either team yet.</p>
            ) : (
              matchPlayers.map((player) => {
                const currentStats = playerStatsMap[player.id] || {}

                return (
                  <div
                    key={player.id}
                    className="p-3.5 rounded-xl bg-surface-2 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-text block">{player.name}</span>
                      <span className="text-[11px] text-muted">{player.teamName}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {statsMatch.sport.toLowerCase() === 'cricket' && (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-muted text-[10px]">Runs</span>
                            <input
                              type="number"
                              value={currentStats.runs ?? ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10)
                                setPlayerStatsMap((prev) => ({
                                  ...prev,
                                  [player.id]: { ...prev[player.id], runs: isNaN(val) ? 0 : val }
                                }))
                              }}
                              className="w-14 px-2 py-1 bg-bg border border-border rounded font-mono text-xs text-text"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted text-[10px]">Wkts</span>
                            <input
                              type="number"
                              value={currentStats.wickets ?? ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10)
                                setPlayerStatsMap((prev) => ({
                                  ...prev,
                                  [player.id]: { ...prev[player.id], wickets: isNaN(val) ? 0 : val }
                                }))
                              }}
                              className="w-12 px-2 py-1 bg-bg border border-border rounded font-mono text-xs text-text"
                            />
                          </div>
                        </>
                      )}

                      {statsMatch.sport.toLowerCase() === 'futsal' && (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-muted text-[10px]">Goals</span>
                            <input
                              type="number"
                              value={currentStats.goals ?? ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10)
                                setPlayerStatsMap((prev) => ({
                                  ...prev,
                                  [player.id]: { ...prev[player.id], goals: isNaN(val) ? 0 : val }
                                }))
                              }}
                              className="w-12 px-2 py-1 bg-bg border border-border rounded font-mono text-xs text-text"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted text-[10px]">Assists</span>
                            <input
                              type="number"
                              value={currentStats.assists ?? ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10)
                                setPlayerStatsMap((prev) => ({
                                  ...prev,
                                  [player.id]: { ...prev[player.id], assists: isNaN(val) ? 0 : val }
                                }))
                              }}
                              className="w-12 px-2 py-1 bg-bg border border-border rounded font-mono text-xs text-text"
                            />
                          </div>
                        </>
                      )}

                      {statsMatch.sport.toLowerCase() === 'volleyball' && (
                        <>
                          <div className="flex items-center gap-1">
                            <span className="text-muted text-[10px]">Points</span>
                            <input
                              type="number"
                              value={currentStats.points ?? ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10)
                                setPlayerStatsMap((prev) => ({
                                  ...prev,
                                  [player.id]: { ...prev[player.id], points: isNaN(val) ? 0 : val }
                                }))
                              }}
                              className="w-14 px-2 py-1 bg-bg border border-border rounded font-mono text-xs text-text"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-muted text-[10px]">Aces</span>
                            <input
                              type="number"
                              value={currentStats.aces ?? ''}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10)
                                setPlayerStatsMap((prev) => ({
                                  ...prev,
                                  [player.id]: { ...prev[player.id], aces: isNaN(val) ? 0 : val }
                                }))
                              }}
                              className="w-12 px-2 py-1 bg-bg border border-border rounded font-mono text-xs text-text"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border mt-3">
            <Button
              variant="secondary"
              onClick={() => setStatsMatch(null)}
              disabled={isSavingStats}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveStats}
              disabled={isSavingStats}
              isLoading={isSavingStats}
            >
              Save Player Stats
            </Button>
          </div>
        </Dialog>
      )}

      {/* CSV Bulk Import Modal */}
      {isCsvModalOpen && (
        <Dialog
          isOpen={true}
          onClose={() => !isImporting && setIsCsvModalOpen(false)}
          title="CSV Match Fixtures Import"
          description={`Previewing ${csvRows.length} fixture entries.`}
          size="lg"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">
                Valid fixtures: <strong className="text-text">{csvRows.filter((r) => r.valid).length}</strong> / {csvRows.length}
              </span>
              <button
                type="button"
                onClick={downloadTemplate}
                className="text-accent-bright hover:underline flex items-center gap-1"
              >
                <DownloadSimple size={14} />
                <span>Download Sample Template</span>
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto border border-border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2 text-muted font-mono uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="p-2.5">Sport</th>
                    <th className="p-2.5">Round</th>
                    <th className="p-2.5">Matchup</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {csvRows.map((r, i) => (
                    <tr key={i} className={r.valid ? '' : 'bg-error/5'}>
                      <td className="p-2.5 font-medium">{r.sport}</td>
                      <td className="p-2.5">{r.round}</td>
                      <td className="p-2.5">
                        {teams.find((t) => t.id === r.team_a_id)?.name || 'Team A'} vs{' '}
                        {teams.find((t) => t.id === r.team_b_id)?.name || 'Team B'}
                      </td>
                      <td className="p-2.5 capitalize">{r.status}</td>
                      <td className="p-2.5">
                        {r.valid ? (
                          <span className="text-accent-bright flex items-center gap-1 text-[11px]">
                            <CheckCircle size={14} /> Ready
                          </span>
                        ) : (
                          <span className="text-error flex items-center gap-1 text-[11px]">
                            <WarningCircle size={14} /> {r.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                variant="secondary"
                onClick={() => setIsCsvModalOpen(false)}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={confirmBulkImport}
                disabled={isImporting || csvRows.filter((r) => r.valid).length === 0}
                isLoading={isImporting}
              >
                <span>Import {csvRows.filter((r) => r.valid).length} Matches</span>
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
