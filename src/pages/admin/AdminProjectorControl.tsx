import React, { useEffect, useMemo, useState } from 'react'
import {
  Broadcast,
  MagnifyingGlass,
  Minus,
  Plus,
  ShieldCheck,
  Stop,
  Television,
  User,
  Warning
} from '@phosphor-icons/react'
import type {
  Player,
  ProjectorAutoFilter,
  ProjectorMode,
  ProjectorState,
  Season,
  Sport,
  Team
} from '../../types'
import {
  DEFAULT_SPORTS,
  formatAthleteCode,
  lookupSeasonPlayerByCode,
  parseAthleteCode,
  setProjectorState,
  startProjectorAuto,
  stopProjectorAuto,
  type SeasonPlayerLookupResult
} from '../../lib/data'
import {
  PROJECTOR_AUTO_FILTERS,
  PROJECTOR_AUTO_INTERVAL,
  PROJECTOR_MODES
} from '../../lib/constants'
import { getAcademicYearLabel } from '../../lib/academicYears'
import {
  getAutoSlideshowPlayers,
  getAutoSlideshowTeams
} from '../../hooks/useAutoSlideshow'
import { useToast } from '../../lib/ToastContext'
import {
  Button,
  Dialog,
  PageHeader,
  SegmentedControl,
  Spinner
} from '../../components/ui'

interface AdminProjectorControlProps {
  activeSeason: Season | null
  projectorState: ProjectorState
  sports?: Sport[]
  teams: Team[]
  players: Player[]
  onRefresh: () => Promise<void>
}

const AUTO_FILTER_OPTIONS: readonly { value: ProjectorAutoFilter; label: string }[] = [
  { value: PROJECTOR_AUTO_FILTERS.ALL, label: 'All' },
  { value: PROJECTOR_AUTO_FILTERS.AVAILABLE, label: 'Available' },
  { value: PROJECTOR_AUTO_FILTERS.SOLD, label: 'Sold' },
  { value: PROJECTOR_AUTO_FILTERS.UNSOLD, label: 'Unsold' }
]

function clampInterval(val: number): number {
  const rounded = Math.round(Number(val) || PROJECTOR_AUTO_INTERVAL.DEFAULT)
  return Math.min(PROJECTOR_AUTO_INTERVAL.MAX, Math.max(PROJECTOR_AUTO_INTERVAL.MIN, rounded))
}

export const AdminProjectorControl: React.FC<AdminProjectorControlProps> = ({
  activeSeason,
  projectorState,
  sports: sportsProp,
  teams,
  players,
  onRefresh
}) => {
  const { success, error } = useToast()

  const availableSports = useMemo(
    () => (sportsProp && sportsProp.length > 0 ? sportsProp : DEFAULT_SPORTS),
    [sportsProp]
  )

  const resolveSportName = (raw?: string | null): string => {
    if (!raw) return availableSports[0]?.name || 'Cricket'
    const matched = availableSports.find(
      (s) => s.name.trim().toLowerCase() === raw.trim().toLowerCase()
    )
    return matched ? matched.name : availableSports[0]?.name || 'Cricket'
  }

  const sportSegmentedOptions = useMemo(
    () =>
      availableSports.map((s) => ({
        value: s.name,
        label: s.name
      })),
    [availableSports]
  )

  // Card 2 (Teams and Purses) state
  const [teamSport, setTeamSport] = useState<string>(() =>
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO ||
    projectorState.mode === PROJECTOR_MODES.ROSTER
      ? resolveSportName(projectorState.auto_sport)
      : availableSports[0]?.name || 'Cricket'
  )
  const [teamMode, setTeamMode] = useState<'auto' | 'single'>(() =>
    projectorState.mode === PROJECTOR_MODES.ROSTER ? 'single' : 'auto'
  )
  const [teamAnimation, setTeamAnimation] = useState<'fade' | 'slide' | 'zoom'>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('fieldr_projector_team_animation')
      if (saved === 'slide' || saved === 'zoom' || saved === 'fade') return saved
    }
    return 'fade'
  })
  const [teamInterval, setTeamInterval] = useState<number>(() =>
    projectorState.auto_interval_seconds
      ? clampInterval(projectorState.auto_interval_seconds)
      : PROJECTOR_AUTO_INTERVAL.DEFAULT
  )

  const teamSportTeams = useMemo(
    () =>
      teams.filter(
        (t) => (t.sport || '').trim().toLowerCase() === teamSport.trim().toLowerCase()
      ),
    [teams, teamSport]
  )

  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => {
    if (projectorState.team_id) {
      const current = teams.find((t) => t.id === projectorState.team_id)
      if (current) return current.id
    }
    const initialSportTeams = teams.filter(
      (t) => (t.sport || '').trim().toLowerCase() === teamSport.trim().toLowerCase()
    )
    return initialSportTeams[0]?.id || ''
  })

  // Ensure selectedTeamId belongs to teamSportTeams when teamSport changes
  useEffect(() => {
    if (teamSportTeams.length > 0) {
      const exists = teamSportTeams.some((t) => t.id === selectedTeamId)
      if (!exists) {
        setSelectedTeamId(teamSportTeams[0].id)
      }
    } else {
      setSelectedTeamId('')
    }
  }, [teamSportTeams, selectedTeamId])

  // Card 3 (Player Spotlight) state
  const [playerSport, setPlayerSport] = useState<string>(() =>
    projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO
      ? resolveSportName(projectorState.auto_sport)
      : availableSports[0]?.name || 'Cricket'
  )
  const [playerCodeInput, setPlayerCodeInput] = useState<string>(() => {
    if (projectorState.player_id) {
      const current = players.find((p) => p.id === projectorState.player_id)
      if (current) {
        return formatAthleteCode(current.athlete_code ?? current.player_code)
      }
    }
    return ''
  })
  const [isLookingUpPlayer, setIsLookingUpPlayer] = useState(false)
  const [lookupResult, setLookupResult] = useState<SeasonPlayerLookupResult | null>(null)
  const [lookupCodeNormalized, setLookupCodeNormalized] = useState<number | null>(null)

  const [playerAutoInterval, setPlayerAutoInterval] = useState<number>(() =>
    projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO && projectorState.auto_interval_seconds
      ? clampInterval(projectorState.auto_interval_seconds)
      : PROJECTOR_AUTO_INTERVAL.DEFAULT
  )
  const [playerAutoFilter, setPlayerAutoFilter] = useState<ProjectorAutoFilter>(() =>
    projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO && projectorState.auto_filter
      ? projectorState.auto_filter
      : PROJECTOR_AUTO_FILTERS.ALL
  )
  const [playerMode, setPlayerMode] = useState<'auto' | 'single'>(() =>
    projectorState.mode === PROJECTOR_MODES.PLAYER ? 'single' : 'auto'
  )
  const [playerAnimation, setPlayerAnimation] = useState<'fade' | 'slide' | 'zoom'>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('fieldr_projector_player_animation')
      if (saved === 'slide' || saved === 'zoom' || saved === 'fade') return saved
    }
    return 'fade'
  })

  // Debounced lookup (300ms) in public_players for selected season, selected sport and athlete_code
  useEffect(() => {
    const cleanDigits = playerCodeInput.replace(/\D/g, '')
    if (!cleanDigits || !activeSeason?.id) {
      setLookupResult(null)
      setLookupCodeNormalized(null)
      setIsLookingUpPlayer(false)
      return
    }

    const parsedCode = parseAthleteCode(cleanDigits)
    if (!parsedCode) {
      setLookupResult({ match: null, otherSports: [] })
      setLookupCodeNormalized(0)
      setIsLookingUpPlayer(false)
      return
    }

    let cancelled = false
    setIsLookingUpPlayer(true)

    const timer = setTimeout(async () => {
      try {
        const res = await lookupSeasonPlayerByCode(
          activeSeason.id,
          playerSport,
          parsedCode
        )
        if (!cancelled) {
          setLookupResult(res)
          setLookupCodeNormalized(parsedCode)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Player lookup failed'
          error(msg)
          setLookupResult(null)
          setLookupCodeNormalized(null)
        }
      } finally {
        if (!cancelled) {
          setIsLookingUpPlayer(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [playerCodeInput, playerSport, activeSeason?.id, error])

  const [isUpdating, setIsUpdating] = useState(false)

  // Auction stage guard
  const isAuctionModeOnStage =
    projectorState.mode === PROJECTOR_MODES.AUCTION ||
    projectorState.mode === PROJECTOR_MODES.SOLD ||
    projectorState.mode === PROJECTOR_MODES.UNSOLD

  const auctionStagePlayer = useMemo(() => {
    const targetId = projectorState.sale_player_id || projectorState.player_id
    if (!targetId) return null
    return players.find((p) => p.id === targetId) || null
  }, [players, projectorState.player_id, projectorState.sale_player_id])

  const auctionStagePlayerName = auctionStagePlayer?.name || 'Active Player'

  const [pendingAction, setPendingAction] = useState<{
    label: string
    run: () => Promise<void>
  } | null>(null)

  const executeOrConfirm = (label: string, action: () => Promise<void>) => {
    if (isAuctionModeOnStage) {
      setPendingAction({ label, run: action })
      return
    }
    void action()
  }

  // Player Auto matching list for Card 3 form
  const matchingFormAutoPlayers = useMemo(
    () => getAutoSlideshowPlayers(players, playerSport, playerAutoFilter),
    [players, playerSport, playerAutoFilter]
  )

  // Running Auto lists (for live summary & Live Stage Preview)
  const isPlayerAutoLive = projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO


  // Scene actions
  const performSwitchScene = async (
    mode: ProjectorMode,
    options?: { playerId?: string | null; teamId?: string | null }
  ) => {
    if (!activeSeason) {
      error('No active season')
      return
    }

    try {
      setIsUpdating(true)
      const nextState: ProjectorState = {
        season_id: activeSeason.id,
        mode,
        player_id: mode === PROJECTOR_MODES.PLAYER ? options?.playerId ?? null : null,
        team_id: mode === PROJECTOR_MODES.ROSTER ? options?.teamId ?? null : null,
        auto_sport: null,
        auto_started_at: null,
        updated_at: new Date().toISOString()
      }

      await setProjectorState(nextState)
      success(`Projector scene switched to ${mode.toUpperCase()}`)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update projector scene'
      error(msg)
    } finally {
      setIsUpdating(false)
    }
  }

  const performBroadcastPlayer = async () => {
    if (!activeSeason) {
      error('No active season')
      return
    }

    try {
      setIsUpdating(true)
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('fieldr_projector_player_animation', playerAnimation)
      }
      if (playerMode === 'auto') {
        if (matchingFormAutoPlayers.length === 0) {
          error(playerAutoDisabledReason || 'No matching players to broadcast')
          return
        }
        const interval = clampInterval(playerAutoInterval)
        setPlayerAutoInterval(interval)
        await startProjectorAuto({
          seasonId: activeSeason.id,
          mode: PROJECTOR_MODES.PLAYER_AUTO,
          sport: playerSport,
          filter: playerAutoFilter,
          intervalSeconds: interval
        })
        success(
          `Player Spotlight Auto started for ${playerSport} (${playerAnimation}, every ${interval}s)`
        )
      } else {
        if (!matchedPlayer) {
          error('Please look up a valid player ID first')
          return
        }
        const nextState: ProjectorState = {
          season_id: activeSeason.id,
          mode: PROJECTOR_MODES.PLAYER,
          player_id: matchedPlayer.id,
          team_id: null,
          auto_sport: playerSport,
          auto_filter: PROJECTOR_AUTO_FILTERS.ALL,
          auto_interval_seconds: null,
          auto_started_at: null,
          updated_at: new Date().toISOString()
        }
        await setProjectorState(nextState)
        success(
          `Broadcasted player: #${formattedLookupCode} ${matchedPlayer.name} (${playerAnimation})`
        )
      }
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to broadcast player'
      error(msg)
    } finally {
      setIsUpdating(false)
    }
  }

  const handleStopAuto = async () => {
    if (!activeSeason) {
      error('No active season')
      return
    }
    try {
      setIsUpdating(true)
      await stopProjectorAuto(activeSeason.id)
      success('Auto slideshow stopped. Projector returned to Idle.')
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to stop auto slideshow'
      error(msg)
    } finally {
      setIsUpdating(false)
    }
  }

  const matchedPlayer = lookupResult?.match || null
  const formattedLookupCode =
    lookupCodeNormalized !== null ? formatAthleteCode(lookupCodeNormalized) : ''

  const playerAutoDisabledReason =
    matchingFormAutoPlayers.length === 0
      ? playerAutoFilter === PROJECTOR_AUTO_FILTERS.ALL
        ? `No players registered in ${playerSport}`
        : `No ${playerAutoFilter} players in ${playerSport}`
      : null

  const performBroadcastTeams = async () => {
    if (!activeSeason) {
      error('No active season')
      return
    }

    try {
      setIsUpdating(true)
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('fieldr_projector_team_animation', teamAnimation)
      }
      if (teamMode === 'auto') {
        if (teamSportTeams.length === 0) {
          error(`No teams found for ${teamSport}`)
          return
        }
        const interval = clampInterval(teamInterval)
        setTeamInterval(interval)
        const nextState: ProjectorState = {
          season_id: activeSeason.id,
          mode: PROJECTOR_MODES.ROSTER_AUTO,
          player_id: null,
          team_id: null,
          auto_sport: teamSport,
          auto_filter: PROJECTOR_AUTO_FILTERS.ALL,
          auto_interval_seconds: interval,
          auto_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        await setProjectorState(nextState)
        success(`Teams slideshow started for ${teamSport} (${teamAnimation}, every ${interval}s)`)
      } else {
        if (!selectedTeamId) {
          error('Please select a team')
          return
        }
        const targetTeam = teams.find((t) => t.id === selectedTeamId)
        const nextState: ProjectorState = {
          season_id: activeSeason.id,
          mode: PROJECTOR_MODES.ROSTER,
          player_id: null,
          team_id: selectedTeamId,
          auto_sport: teamSport,
          auto_filter: PROJECTOR_AUTO_FILTERS.ALL,
          auto_interval_seconds: null,
          auto_started_at: null,
          updated_at: new Date().toISOString()
        }
        await setProjectorState(nextState)
        success(`Broadcasted team: ${targetTeam?.name || 'Selected Team'} (${teamAnimation})`)
      }
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to broadcast teams'
      error(msg)
    } finally {
      setIsUpdating(false)
    }
  }

  const isCard2Live =
    projectorState.mode === PROJECTOR_MODES.TEAMS ||
    projectorState.mode === PROJECTOR_MODES.ROSTER ||
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO

  const isTeamAutoLive =
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO ||
    (projectorState.mode === PROJECTOR_MODES.TEAMS && !projectorState.team_id)

  const runningAutoTeams = useMemo(
    () =>
      isTeamAutoLive
        ? getAutoSlideshowTeams(teams, projectorState.auto_sport)
        : [],
    [isTeamAutoLive, teams, projectorState.auto_sport]
  )

  const liveTeam = useMemo(
    () => (projectorState.team_id ? teams.find((t) => t.id === projectorState.team_id) : null),
    [projectorState.team_id, teams]
  )

  const livePlayer = useMemo(
    () =>
      projectorState.player_id
        ? players.find((p) => p.id === projectorState.player_id)
        : null,
    [projectorState.player_id, players]
  )

  const isCard3Live =
    projectorState.mode === PROJECTOR_MODES.PLAYER || isPlayerAutoLive

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        label="Stage Broadcast Control"
        title="Projector Command Studio"
        subtitle="Choose what displays live on the hall auditorium big screen with instant synchronization."
        actions={
          <a
            href="/projector"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[40px] px-4 py-2 rounded-xl bg-btn-bg text-btn-fg font-semibold text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm"
          >
            <Television size={18} weight="bold" />
            <span>Open Fullscreen Projector</span>
          </a>
        }
      />

      {/* Auction Guard Warning Banner */}
      {isAuctionModeOnStage && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-error/10 border border-error/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-center gap-3 text-text font-medium">
            <Warning size={20} weight="fill" className="text-error shrink-0" />
            <span>
              An auction is on stage: <strong className="font-bold">{auctionStagePlayerName}</strong>. Broadcasting a scene will replace it.
            </span>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-wider text-error font-semibold shrink-0">
            Stage Guard Active ({projectorState.mode})
          </span>
        </div>
      )}

      {/* Mode Selection Cards */}
      <div className="flex flex-col gap-4">
        <div className="text-xs font-mono uppercase tracking-wider text-muted">
          Select Active Stage Scene
        </div>

        {/* Mode 1: Idle */}
        <div
          className={`p-5 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
            projectorState.mode === PROJECTOR_MODES.IDLE
              ? 'bg-surface border-accent-bright'
              : 'bg-surface border-border hover:border-accent-bright/60'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                projectorState.mode === PROJECTOR_MODES.IDLE
                  ? 'bg-accent text-on-accent'
                  : 'bg-surface-2 text-muted'
              }`}
            >
              <Broadcast size={22} weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-syne font-bold text-lg text-text">
                  1 Idle
                </h3>
                {projectorState.mode === PROJECTOR_MODES.IDLE && (
                  <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                    · Live on Stage
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Displays the centered tournament season title and subtle Fieldr branding at the bottom.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant={projectorState.mode === PROJECTOR_MODES.IDLE ? 'secondary' : 'primary'}
            size="md"
            disabled={isUpdating || projectorState.mode === PROJECTOR_MODES.IDLE}
            onClick={() =>
              executeOrConfirm('1 Idle', () =>
                performSwitchScene(PROJECTOR_MODES.IDLE)
              )
            }
          >
            {projectorState.mode === PROJECTOR_MODES.IDLE
              ? 'Currently Active'
              : 'Broadcast Scene'}
          </Button>
        </div>

        {/* Mode 2: Teams and Purses */}
        <div
          className={`p-5 rounded-2xl border transition-colors flex flex-col gap-5 shadow-sm ${
            isCard2Live
              ? 'bg-surface border-accent-bright'
              : 'bg-surface border-border hover:border-accent-bright/60'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                  isCard2Live ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'
                }`}
              >
                <ShieldCheck size={22} weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-syne font-bold text-lg text-text">
                    2 Teams and Purses
                  </h3>
                  {isCard2Live && (
                    <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                      · LIVE ON STAGE
                    </span>
                  )}
                  {isCard2Live && isTeamAutoLive && (
                    <span className="px-2 py-0.5 rounded-md bg-accent text-on-accent font-mono text-[10px] uppercase font-bold tracking-wider">
                      AUTO
                    </span>
                  )}
                  {isCard2Live && !isTeamAutoLive && (
                    <span className="px-2 py-0.5 rounded-md bg-surface-2 text-text border border-border font-mono text-[10px] uppercase font-bold tracking-wider">
                      SINGLE TEAM
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Single team or rotating slideshow showcasing team emblem, remaining purse, and acquired roster.
                </p>
                {isCard2Live && isTeamAutoLive && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 border border-border font-mono text-xs text-accent-bright font-medium">
                    <span>
                      Auto: {projectorState.auto_sport}, every {projectorState.auto_interval_seconds}s, {runningAutoTeams.length}{' '}
                      {runningAutoTeams.length === 1 ? 'team' : 'teams'} ({teamAnimation})
                    </span>
                  </div>
                )}
                {isCard2Live && !isTeamAutoLive && liveTeam && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 border border-border font-mono text-xs text-accent-bright font-medium">
                    <span>
                      Team: {liveTeam.name} ({liveTeam.short_code}) · {liveTeam.sport} ({teamAnimation})
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {isCard2Live && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={isUpdating}
                  onClick={() => executeOrConfirm('Stop Stage', handleStopAuto)}
                >
                  <Stop size={16} weight="bold" />
                  <span>Stop</span>
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={
                  isUpdating ||
                  (teamMode === 'single' && !selectedTeamId) ||
                  (teamMode === 'auto' && teamSportTeams.length === 0)
                }
                onClick={() =>
                  executeOrConfirm('2 Teams and Purses', performBroadcastTeams)
                }
              >
                {isCard2Live ? 'Update Broadcast' : 'Broadcast Scene'}
              </Button>
            </div>
          </div>

          {/* Form Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
            {/* 1. Sport select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                1. Sport
              </label>
              <SegmentedControl
                options={sportSegmentedOptions}
                value={teamSport}
                onChange={(val) => setTeamSport(val)}
                ariaLabel="Teams and Purses Sport"
                size="sm"
              />
            </div>

            {/* 2. Mode select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                2. Mode
              </label>
              <SegmentedControl
                options={[
                  { value: 'auto', label: 'Auto slideshow' },
                  { value: 'single', label: 'Single team' }
                ]}
                value={teamMode}
                onChange={(val) => setTeamMode(val as 'auto' | 'single')}
                ariaLabel="Teams and Purses Mode"
                size="sm"
              />
            </div>

            {/* 3. Animation select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                3. Animation
              </label>
              <SegmentedControl
                options={[
                  { value: 'fade', label: 'Fade' },
                  { value: 'slide', label: 'Slide' },
                  { value: 'zoom', label: 'Zoom' }
                ]}
                value={teamAnimation}
                onChange={(val) => {
                  const anim = val as 'fade' | 'slide' | 'zoom'
                  setTeamAnimation(anim)
                  if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem('fieldr_projector_team_animation', anim)
                  }
                }}
                ariaLabel="Teams and Purses Animation"
                size="sm"
              />
            </div>
          </div>

          {/* Mode-specific detail panel */}
          {teamMode === 'single' ? (
            <div className="p-4 rounded-xl bg-surface-2 border border-border flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                Select Team ({teamSportTeams.length} available in {teamSport})
              </label>
              {teamSportTeams.length === 0 ? (
                <div className="text-xs font-mono text-muted py-2">
                  No teams registered for {teamSport} in this season.
                </div>
              ) : (
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-surface border border-border text-sm font-sans text-text focus:outline-none focus:border-accent-bright"
                >
                  {teamSportTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.short_code}) - {t.current_purse.toLocaleString()} PTS
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-surface-2 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-text">
                  Looping slideshow across {teamSportTeams.length} {teamSportTeams.length === 1 ? 'team' : 'teams'} in {teamSport}
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Cycles automatically and loops continuously on the big screen
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <span className="text-xs font-mono uppercase tracking-wider text-muted">
                  Interval
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTeamInterval((prev) => clampInterval(prev - 1))}
                    className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-text hover:bg-surface-3 transition-colors"
                  >
                    <Minus size={14} weight="bold" />
                  </button>
                  <span className="font-mono text-sm font-bold w-12 text-center text-text tabular-nums">
                    {teamInterval}s
                  </span>
                  <button
                    type="button"
                    onClick={() => setTeamInterval((prev) => clampInterval(prev + 1))}
                    className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-text hover:bg-surface-3 transition-colors"
                  >
                    <Plus size={14} weight="bold" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mode 3: Player Spotlight */}
        <div
          className={`p-5 rounded-2xl border transition-colors flex flex-col gap-5 shadow-sm ${
            isCard3Live
              ? 'bg-surface border-accent-bright'
              : 'bg-surface border-border hover:border-accent-bright/60'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                  isCard3Live ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'
                }`}
              >
                <User size={22} weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-syne font-bold text-lg text-text">
                    3 Player Spotlight
                  </h3>
                  {isCard3Live && (
                    <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                      · LIVE ON STAGE
                    </span>
                  )}
                  {isCard3Live && isPlayerAutoLive && (
                    <span className="px-2 py-0.5 rounded-md bg-accent text-on-accent font-mono text-[10px] uppercase font-bold tracking-wider">
                      AUTO
                    </span>
                  )}
                  {isCard3Live && !isPlayerAutoLive && (
                    <span className="px-2 py-0.5 rounded-md bg-surface-2 text-text border border-border font-mono text-[10px] uppercase font-bold tracking-wider">
                      SINGLE PLAYER
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Cinematic player card with large typography, photo, sport, discipline, and base points.
                </p>
                {isCard3Live && isPlayerAutoLive && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 border border-border font-mono text-xs text-accent-bright font-medium">
                    <span>
                      Auto: {projectorState.auto_sport}, {projectorState.auto_filter || 'all'}, every{' '}
                      {projectorState.auto_interval_seconds}s ({playerAnimation})
                    </span>
                  </div>
                )}
                {isCard3Live && !isPlayerAutoLive && livePlayer && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 border border-border font-mono text-xs text-accent-bright font-medium">
                    <span>
                      Player: #{formatAthleteCode(livePlayer.athlete_code ?? livePlayer.player_code)}{' '}
                      {livePlayer.name} · {livePlayer.sport} ({playerAnimation})
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {isCard3Live && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={isUpdating}
                  onClick={() => executeOrConfirm('Stop Stage', handleStopAuto)}
                >
                  <Stop size={16} weight="bold" />
                  <span>Stop</span>
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={
                  isUpdating ||
                  (playerMode === 'single' && !matchedPlayer) ||
                  (playerMode === 'auto' && matchingFormAutoPlayers.length === 0)
                }
                onClick={() =>
                  executeOrConfirm('3 Player Spotlight', performBroadcastPlayer)
                }
              >
                {isCard3Live ? 'Update Broadcast' : 'Broadcast Player'}
              </Button>
            </div>
          </div>

          {/* Form Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
            {/* 1. Sport select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                1. Sport
              </label>
              <SegmentedControl
                options={sportSegmentedOptions}
                value={playerSport}
                onChange={(val) => setPlayerSport(val)}
                ariaLabel="Player Spotlight Sport"
                size="sm"
              />
            </div>

            {/* 2. Mode select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                2. Mode
              </label>
              <SegmentedControl
                options={[
                  { value: 'auto', label: 'Auto slideshow' },
                  { value: 'single', label: 'Single player' }
                ]}
                value={playerMode}
                onChange={(val) => setPlayerMode(val as 'auto' | 'single')}
                ariaLabel="Player Spotlight Mode"
                size="sm"
              />
            </div>

            {/* 3. Animation select */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                3. Animation
              </label>
              <SegmentedControl
                options={[
                  { value: 'fade', label: 'Fade' },
                  { value: 'slide', label: 'Slide' },
                  { value: 'zoom', label: 'Zoom' }
                ]}
                value={playerAnimation}
                onChange={(val) => {
                  const anim = val as 'fade' | 'slide' | 'zoom'
                  setPlayerAnimation(anim)
                  if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem('fieldr_projector_player_animation', anim)
                  }
                }}
                ariaLabel="Player Spotlight Animation"
                size="sm"
              />
            </div>
          </div>

          {/* Mode-specific detail panel */}
          {playerMode === 'single' ? (
            <div className="p-4 rounded-xl bg-surface-2 border border-border flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label
                  htmlFor="projector-player-code-input"
                  className="text-xs font-mono uppercase tracking-wider text-muted shrink-0"
                >
                  Player ID:
                </label>
                <div className="relative flex-1 max-w-xs">
                  <MagnifyingGlass
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                  />
                  <input
                    id="projector-player-code-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={playerCodeInput}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6)
                      setPlayerCodeInput(digitsOnly)
                    }}
                    placeholder="Enter ID (e.g. 1, 01, 0001)"
                    className="w-full pl-9 pr-8 py-2 bg-surface border border-border rounded-xl text-xs font-mono text-text placeholder:text-muted focus:outline-none focus:border-accent-bright"
                  />
                  {isLookingUpPlayer && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Spinner size="sm" />
                    </div>
                  )}
                </div>
                <span className="text-[11px] font-mono text-muted">
                  Digits only, up to 6 digits
                </span>
              </div>

              {/* Lookup Result Feedback */}
              {playerCodeInput.trim().length > 0 && !isLookingUpPlayer && lookupResult && (
                <div className="p-3 rounded-xl bg-surface border border-border">
                  {matchedPlayer ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                          {matchedPlayer.photo_thumb_url || matchedPlayer.photo_url ? (
                            <img
                              src={matchedPlayer.photo_thumb_url || matchedPlayer.photo_url}
                              alt={matchedPlayer.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User size={18} className="text-muted" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-accent-bright">
                              #{formatAthleteCode(matchedPlayer.athlete_code ?? matchedPlayer.player_code)}
                            </span>
                            <span className="font-syne font-bold text-sm text-text truncate">
                              {matchedPlayer.name}
                            </span>
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            {matchedPlayer.playing_role} ·{' '}
                            {getAcademicYearLabel(matchedPlayer.academic_year || '1st')}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-lg font-mono text-[10px] uppercase tracking-wider font-bold border ${
                          matchedPlayer.status === 'sold'
                            ? 'border-error/40 text-error bg-error/10'
                            : matchedPlayer.status === 'unsold'
                            ? 'border-border text-muted bg-surface-2'
                            : 'border-accent-bright/40 text-accent-bright bg-accent-bright/10'
                        }`}
                      >
                        {(matchedPlayer.status || 'available').toUpperCase()}
                      </span>
                    </div>
                  ) : lookupResult.otherSports.length > 0 ? (
                    <div className="text-xs font-mono text-text flex items-center justify-between gap-3 flex-wrap">
                      <span>
                        {formattedLookupCode} is registered for {lookupResult.otherSports[0]}. Switch sport to broadcast him.
                      </span>
                      <button
                        type="button"
                        onClick={() => setPlayerSport(resolveSportName(lookupResult.otherSports[0]))}
                        className="text-xs font-mono font-semibold text-accent-bright hover:underline"
                      >
                        Switch to {lookupResult.otherSports[0]}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs font-mono text-muted">
                      No player with code {formattedLookupCode} in {playerSport} this season
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-surface-2 border border-border flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-mono uppercase tracking-wider text-muted">
                  Show:
                </span>
                <div className="inline-flex items-center p-0.5 bg-surface border border-border rounded-xl gap-0.5">
                  {AUTO_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPlayerAutoFilter(opt.value)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                        playerAutoFilter === opt.value
                          ? 'bg-surface-2 text-text font-bold border border-border shadow-sm'
                          : 'text-muted hover:text-text border border-transparent'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-text font-semibold tabular-nums">
                    {matchingFormAutoPlayers.length}{' '}
                    {matchingFormAutoPlayers.length === 1 ? 'player' : 'players'}
                  </span>
                  {playerAutoDisabledReason && (
                    <span className="text-error text-[11px]">
                      ({playerAutoDisabledReason})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap self-end lg:self-center">
                <span className="text-xs font-mono uppercase tracking-wider text-muted">
                  Interval
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease seconds per player"
                    onClick={() =>
                      setPlayerAutoInterval((prev) => clampInterval(prev - 1))
                    }
                    disabled={playerAutoInterval <= PROJECTOR_AUTO_INTERVAL.MIN}
                    className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-text hover:bg-surface-3 disabled:opacity-40 transition-colors"
                  >
                    <Minus size={14} weight="bold" />
                  </button>
                  <span className="font-mono text-sm font-bold w-12 text-center text-text tabular-nums">
                    {playerAutoInterval}s
                  </span>
                  <button
                    type="button"
                    aria-label="Increase seconds per player"
                    onClick={() =>
                      setPlayerAutoInterval((prev) => clampInterval(prev + 1))
                    }
                    disabled={playerAutoInterval >= PROJECTOR_AUTO_INTERVAL.MAX}
                    className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center text-text hover:bg-surface-3 disabled:opacity-40 transition-colors"
                  >
                    <Plus size={14} weight="bold" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {PROJECTOR_AUTO_INTERVAL.CHIPS.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setPlayerAutoInterval(sec)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition-colors ${
                        playerAutoInterval === sec
                          ? 'bg-accent text-on-accent border-accent font-bold'
                          : 'bg-surface text-muted border-border hover:text-text'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Auction Stage Guard Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(pendingAction)}
        onClose={() => {
          if (!isUpdating) setPendingAction(null)
        }}
        title="Replace Active Auction Scene?"
        description={`An auction is on stage: ${auctionStagePlayerName}. Broadcasting "${
          pendingAction?.label || 'this scene'
        }" will replace the auction display on all connected projectors.`}
        size="sm"
      >
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isUpdating}
            onClick={() => setPendingAction(null)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            isLoading={isUpdating}
            disabled={isUpdating}
            onClick={async () => {
              if (!pendingAction) return
              const actionToRun = pendingAction.run
              setPendingAction(null)
              await actionToRun()
            }}
          >
            Replace Stage
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
