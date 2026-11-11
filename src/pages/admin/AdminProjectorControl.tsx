import React, { useEffect, useMemo, useState } from 'react'
import {
  Broadcast,
  Eye,
  MagnifyingGlass,
  Minus,
  Play,
  Plus,
  ShieldCheck,
  Stop,
  Television,
  User,
  Users,
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
  getAutoSlideshowTeams,
  useAutoSlideshow
} from '../../hooks/useAutoSlideshow'
import { useToast } from '../../lib/ToastContext'
import { BrandMark } from '../../components/layout/BrandMark'
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

  // Card 4 (Team Roster Showcase) state
  const [rosterSport, setRosterSport] = useState<string>(() =>
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO
      ? resolveSportName(projectorState.auto_sport)
      : availableSports[0]?.name || 'Cricket'
  )
  const rosterSportTeams = useMemo(
    () => getAutoSlideshowTeams(teams, rosterSport),
    [teams, rosterSport]
  )
  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => {
    if (projectorState.team_id) {
      const currentTeam = teams.find((t) => t.id === projectorState.team_id)
      if (currentTeam) return currentTeam.id
    }
    return rosterSportTeams[0]?.id ?? ''
  })
  const [rosterAutoInterval, setRosterAutoInterval] = useState<number>(() =>
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO && projectorState.auto_interval_seconds
      ? clampInterval(projectorState.auto_interval_seconds)
      : PROJECTOR_AUTO_INTERVAL.DEFAULT
  )

  // Keep selectedTeamId synced to teams of the selected rosterSport
  useEffect(() => {
    if (rosterSportTeams.length === 0) {
      setSelectedTeamId('')
      return
    }
    const existsInSport = rosterSportTeams.some((t) => t.id === selectedTeamId)
    if (!existsInSport) {
      setSelectedTeamId(rosterSportTeams[0].id)
    }
  }, [rosterSportTeams, selectedTeamId])

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
  const isRosterAutoLive = projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO

  const runningAutoPlayers = useMemo(
    () =>
      isPlayerAutoLive
        ? getAutoSlideshowPlayers(
            players,
            projectorState.auto_sport,
            projectorState.auto_filter
          )
        : [],
    [isPlayerAutoLive, players, projectorState.auto_sport, projectorState.auto_filter]
  )

  const runningAutoTeams = useMemo(
    () =>
      isRosterAutoLive
        ? getAutoSlideshowTeams(teams, projectorState.auto_sport)
        : [],
    [isRosterAutoLive, teams, projectorState.auto_sport]
  )

  const playerAutoSlideshow = useAutoSlideshow(
    runningAutoPlayers,
    projectorState.auto_interval_seconds,
    isPlayerAutoLive ? projectorState.auto_started_at : null
  )

  const rosterAutoSlideshow = useAutoSlideshow(
    runningAutoTeams,
    projectorState.auto_interval_seconds,
    isRosterAutoLive ? projectorState.auto_started_at : null
  )

  // Detect whether form values on a live auto card differ from the running projectorState
  const hasPlayerAutoFormChanges =
    isPlayerAutoLive &&
    ((projectorState.auto_sport || '').trim().toLowerCase() !==
      playerSport.trim().toLowerCase() ||
      (projectorState.auto_filter || PROJECTOR_AUTO_FILTERS.ALL) !== playerAutoFilter ||
      clampInterval(projectorState.auto_interval_seconds || PROJECTOR_AUTO_INTERVAL.DEFAULT) !==
        clampInterval(playerAutoInterval))

  const hasRosterAutoFormChanges =
    isRosterAutoLive &&
    ((projectorState.auto_sport || '').trim().toLowerCase() !==
      rosterSport.trim().toLowerCase() ||
      clampInterval(projectorState.auto_interval_seconds || PROJECTOR_AUTO_INTERVAL.DEFAULT) !==
        clampInterval(rosterAutoInterval))

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

  const performStartPlayerAuto = async () => {
    if (!activeSeason) {
      error('No active season')
      return
    }
    const interval = clampInterval(playerAutoInterval)
    setPlayerAutoInterval(interval)

    try {
      setIsUpdating(true)
      await startProjectorAuto({
        seasonId: activeSeason.id,
        mode: PROJECTOR_MODES.PLAYER_AUTO,
        sport: playerSport,
        filter: playerAutoFilter,
        intervalSeconds: interval
      })
      success(`Player Spotlight Auto started for ${playerSport} (every ${interval}s)`)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start Player Auto'
      error(msg)
    } finally {
      setIsUpdating(false)
    }
  }

  const performStartRosterAuto = async () => {
    if (!activeSeason) {
      error('No active season')
      return
    }
    const interval = clampInterval(rosterAutoInterval)
    setRosterAutoInterval(interval)

    try {
      setIsUpdating(true)
      await startProjectorAuto({
        seasonId: activeSeason.id,
        mode: PROJECTOR_MODES.ROSTER_AUTO,
        sport: rosterSport,
        filter: PROJECTOR_AUTO_FILTERS.ALL,
        intervalSeconds: interval
      })
      success(`Team Roster Auto started for ${rosterSport} (every ${interval}s)`)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start Roster Auto'
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

  // Preview entities
  const spotlightPlayer = players.find((p) => p.id === projectorState.player_id)
  const rosterTeam = teams.find((t) => t.id === projectorState.team_id)
  const rosterPlayers = rosterTeam ? players.filter((p) => p.team_id === rosterTeam.id) : []

  const previewAutoPlayer = playerAutoSlideshow.currentItem
  const previewAutoTeam = rosterAutoSlideshow.currentItem
  const previewAutoTeamPlayers = previewAutoTeam
    ? players.filter((p) => p.team_id === previewAutoTeam.id)
    : []

  const matchedPlayer = lookupResult?.match || null
  const formattedLookupCode =
    lookupCodeNormalized !== null ? formatAthleteCode(lookupCodeNormalized) : ''

  const playerAutoDisabledReason =
    matchingFormAutoPlayers.length === 0
      ? playerAutoFilter === PROJECTOR_AUTO_FILTERS.ALL
        ? `No players registered in ${playerSport}`
        : `No ${playerAutoFilter} players in ${playerSport}`
      : null

  const rosterAutoDisabledReason =
    rosterSportTeams.length === 0 ? `No teams registered in ${rosterSport}` : null

  const isCard3Live =
    projectorState.mode === PROJECTOR_MODES.PLAYER || isPlayerAutoLive
  const isCard4Live =
    projectorState.mode === PROJECTOR_MODES.ROSTER || isRosterAutoLive

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

      {/* Main Grid: Left Controls (2 Cols) + Right Live Miniature Stage Preview (1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Mode Selection Cards */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="text-xs font-mono uppercase tracking-wider text-muted">
            Select Active Stage Scene
          </div>

          {/* Mode 1: Idle Scene */}
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
                    1. Idle Welcome Screen
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
                executeOrConfirm('Idle Welcome Screen', () =>
                  performSwitchScene(PROJECTOR_MODES.IDLE)
                )
              }
            >
              {projectorState.mode === PROJECTOR_MODES.IDLE
                ? 'Currently Active'
                : 'Broadcast Scene'}
            </Button>
          </div>

          {/* Mode 2: Teams & Purses Leaderboard */}
          <div
            className={`p-5 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
              projectorState.mode === PROJECTOR_MODES.TEAMS
                ? 'bg-surface border-accent-bright'
                : 'bg-surface border-border hover:border-accent-bright/60'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                  projectorState.mode === PROJECTOR_MODES.TEAMS
                    ? 'bg-accent text-on-accent'
                    : 'bg-surface-2 text-muted'
                }`}
              >
                <ShieldCheck size={22} weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-syne font-bold text-lg text-text">
                    2. All Teams & Purses Leaderboard
                  </h3>
                  {projectorState.mode === PROJECTOR_MODES.TEAMS && (
                    <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                      · Live on Stage
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  High-contrast grid of all franchise team cards, emblems, owners, and animated purse balances.
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant={projectorState.mode === PROJECTOR_MODES.TEAMS ? 'secondary' : 'primary'}
              size="md"
              disabled={isUpdating || projectorState.mode === PROJECTOR_MODES.TEAMS}
              onClick={() =>
                executeOrConfirm('All Teams & Purses Leaderboard', () =>
                  performSwitchScene(PROJECTOR_MODES.TEAMS)
                )
              }
            >
              {projectorState.mode === PROJECTOR_MODES.TEAMS
                ? 'Currently Active'
                : 'Broadcast Scene'}
            </Button>
          </div>

          {/* Mode 3: Player Spotlight Card */}
          <div
            className={`p-5 rounded-2xl border transition-colors flex flex-col gap-4 shadow-sm ${
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
                      3. Player Spotlight Card
                    </h3>
                    {isCard3Live && (
                      <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                        · LIVE ON STAGE
                      </span>
                    )}
                    {isPlayerAutoLive && (
                      <span className="px-2 py-0.5 rounded-md bg-accent text-on-accent font-mono text-[10px] uppercase font-bold tracking-wider">
                        AUTO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Cinematic player card with large typography, photo, sport, discipline, and base points.
                  </p>
                  {isPlayerAutoLive && (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 border border-border font-mono text-xs text-accent-bright font-medium">
                      <span>
                        Auto: {projectorState.auto_sport}, every{' '}
                        {projectorState.auto_interval_seconds}s, {runningAutoPlayers.length}{' '}
                        {runningAutoPlayers.length === 1 ? 'player' : 'players'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={isUpdating || !matchedPlayer}
                  onClick={() => {
                    if (!matchedPlayer) return
                    executeOrConfirm(`Player Spotlight (${matchedPlayer.name})`, () =>
                      performSwitchScene(PROJECTOR_MODES.PLAYER, {
                        playerId: matchedPlayer.id
                      })
                    )
                  }}
                >
                  {projectorState.mode === PROJECTOR_MODES.PLAYER &&
                  matchedPlayer &&
                  projectorState.player_id === matchedPlayer.id
                    ? 'Update Spotlight'
                    : 'Broadcast Player'}
                </Button>

                {isPlayerAutoLive ? (
                  <>
                    {hasPlayerAutoFormChanges && (
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        disabled={isUpdating || matchingFormAutoPlayers.length === 0}
                        onClick={() => void performStartPlayerAuto()}
                      >
                        Apply changes
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      leftIcon={Stop}
                      disabled={isUpdating}
                      onClick={() => void handleStopAuto()}
                    >
                      Stop auto
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    leftIcon={Play}
                    disabled={isUpdating || matchingFormAutoPlayers.length === 0}
                    onClick={() =>
                      executeOrConfirm(`Player Spotlight Auto (${playerSport})`, () =>
                        performStartPlayerAuto()
                      )
                    }
                  >
                    Auto
                  </Button>
                )}
              </div>
            </div>

            {/* Sport Segmented Control (Card 3) */}
            <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-medium text-text shrink-0">Sport:</span>
              <SegmentedControl
                options={sportSegmentedOptions}
                value={playerSport}
                onChange={setPlayerSport}
                ariaLabel="Player Spotlight Sport"
                size="sm"
              />
            </div>

            {/* Player ID Lookup Input + Result Row */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <label
                  htmlFor="projector-player-code-input"
                  className="text-xs text-text font-medium shrink-0"
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
                    className="w-full pl-9 pr-8 py-2 bg-bg border border-border rounded-xl text-xs font-mono text-text placeholder:text-muted focus:outline-none focus:border-accent-bright"
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
                <div className="p-3 rounded-xl bg-surface-2 border border-border">
                  {matchedPlayer ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-surface border border-border overflow-hidden shrink-0 flex items-center justify-center">
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
                            ? 'border-border text-muted bg-surface'
                            : 'border-accent-bright/40 text-accent-bright bg-accent-bright/10'
                        }`}
                      >
                        {matchedPlayer.status.toUpperCase()}
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

            {/* Auto Slideshow Controls for Card 3 */}
            <div className="pt-3 border-t border-border flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-text">Show:</span>
                  <div className="inline-flex items-center p-0.5 bg-surface-2 border border-border rounded-xl gap-0.5">
                    {AUTO_FILTER_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPlayerAutoFilter(opt.value)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                          playerAutoFilter === opt.value
                            ? 'bg-surface text-text font-bold border border-border shadow-sm'
                            : 'text-muted hover:text-text border border-transparent'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
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

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="player-auto-interval"
                    className="text-xs font-medium text-text"
                  >
                    Seconds per player:
                  </label>
                  <div className="inline-flex items-center rounded-xl border border-border bg-bg overflow-hidden">
                    <button
                      type="button"
                      aria-label="Decrease seconds per player"
                      onClick={() =>
                        setPlayerAutoInterval((prev) =>
                          clampInterval(prev - 1)
                        )
                      }
                      disabled={playerAutoInterval <= PROJECTOR_AUTO_INTERVAL.MIN}
                      className="px-2.5 py-1.5 text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 transition-colors"
                    >
                      <Minus size={12} weight="bold" />
                    </button>
                    <input
                      id="player-auto-interval"
                      type="number"
                      min={PROJECTOR_AUTO_INTERVAL.MIN}
                      max={PROJECTOR_AUTO_INTERVAL.MAX}
                      value={playerAutoInterval}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10)
                        if (!isNaN(raw)) {
                          setPlayerAutoInterval(raw)
                        }
                      }}
                      onBlur={() => setPlayerAutoInterval((prev) => clampInterval(prev))}
                      className="w-14 text-center py-1 bg-transparent font-mono text-xs text-text focus:outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      aria-label="Increase seconds per player"
                      onClick={() =>
                        setPlayerAutoInterval((prev) =>
                          clampInterval(prev + 1)
                        )
                      }
                      disabled={playerAutoInterval >= PROJECTOR_AUTO_INTERVAL.MAX}
                      className="px-2.5 py-1.5 text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 transition-colors"
                    >
                      <Plus size={12} weight="bold" />
                    </button>
                  </div>
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
                          : 'bg-surface-2 text-muted border-border hover:text-text'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Mode 4: Team Roster Showcase */}
          <div
            className={`p-5 rounded-2xl border transition-colors flex flex-col gap-4 shadow-sm ${
              isCard4Live
                ? 'bg-surface border-accent-bright'
                : 'bg-surface border-border hover:border-accent-bright/60'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                    isCard4Live ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'
                  }`}
                >
                  <Users size={22} weight="bold" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-syne font-bold text-lg text-text">
                      4. Team Roster Showcase
                    </h3>
                    {isCard4Live && (
                      <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                        · LIVE ON STAGE
                      </span>
                    )}
                    {isRosterAutoLive && (
                      <span className="px-2 py-0.5 rounded-md bg-accent text-on-accent font-mono text-[10px] uppercase font-bold tracking-wider">
                        AUTO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Display an individual team&apos;s franchise emblem, owner, purse, and all drafted players.
                  </p>
                  {isRosterAutoLive && (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-surface-2 border border-border font-mono text-xs text-accent-bright font-medium">
                      <span>
                        Auto: {projectorState.auto_sport}, every{' '}
                        {projectorState.auto_interval_seconds}s, {runningAutoTeams.length}{' '}
                        {runningAutoTeams.length === 1 ? 'team' : 'teams'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  disabled={isUpdating || !selectedTeamId}
                  onClick={() => {
                    const team = rosterSportTeams.find((t) => t.id === selectedTeamId)
                    executeOrConfirm(
                      `Team Roster (${team?.name || 'Selected Team'})`,
                      () =>
                        performSwitchScene(PROJECTOR_MODES.ROSTER, {
                          teamId: selectedTeamId
                        })
                    )
                  }}
                >
                  {projectorState.mode === PROJECTOR_MODES.ROSTER &&
                  projectorState.team_id === selectedTeamId
                    ? 'Update Roster'
                    : 'Broadcast Roster'}
                </Button>

                {isRosterAutoLive ? (
                  <>
                    {hasRosterAutoFormChanges && (
                      <Button
                        type="button"
                        variant="primary"
                        size="md"
                        disabled={isUpdating || rosterSportTeams.length === 0}
                        onClick={() => void performStartRosterAuto()}
                      >
                        Apply changes
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      leftIcon={Stop}
                      disabled={isUpdating}
                      onClick={() => void handleStopAuto()}
                    >
                      Stop auto
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    leftIcon={Play}
                    disabled={isUpdating || rosterSportTeams.length === 0}
                    onClick={() =>
                      executeOrConfirm(`Team Roster Auto (${rosterSport})`, () =>
                        performStartRosterAuto()
                      )
                    }
                  >
                    Auto
                  </Button>
                )}
              </div>
            </div>

            {/* Sport Segmented Control (Card 4) */}
            <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs font-medium text-text shrink-0">Sport:</span>
              <SegmentedControl
                options={sportSegmentedOptions}
                value={rosterSport}
                onChange={setRosterSport}
                ariaLabel="Team Roster Sport"
                size="sm"
              />
            </div>

            {/* Team Selection Dropdown (filtered by selected sport) */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <span className="text-xs text-text font-medium shrink-0">
                Choose Team:
              </span>
              {rosterSportTeams.length === 0 ? (
                <div className="flex-1 px-3 py-2 bg-surface-2 border border-border rounded-xl text-xs font-mono text-muted">
                  No teams registered for {rosterSport}
                </div>
              ) : (
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="flex-1 px-3 py-2 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
                >
                  {rosterSportTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.short_code}) - {t.sport}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Auto Slideshow Controls for Card 4 */}
            <div className="pt-3 border-t border-border flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 font-mono text-xs">
                <span className="text-muted">Matching franchises in {rosterSport}:</span>
                <div className="flex items-center gap-2">
                  <span className="text-text font-semibold tabular-nums">
                    {rosterSportTeams.length}{' '}
                    {rosterSportTeams.length === 1 ? 'team' : 'teams'}
                  </span>
                  {rosterAutoDisabledReason && (
                    <span className="text-error text-[11px]">
                      ({rosterAutoDisabledReason})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <label
                    htmlFor="roster-auto-interval"
                    className="text-xs font-medium text-text"
                  >
                    Seconds per team:
                  </label>
                  <div className="inline-flex items-center rounded-xl border border-border bg-bg overflow-hidden">
                    <button
                      type="button"
                      aria-label="Decrease seconds per team"
                      onClick={() =>
                        setRosterAutoInterval((prev) =>
                          clampInterval(prev - 1)
                        )
                      }
                      disabled={rosterAutoInterval <= PROJECTOR_AUTO_INTERVAL.MIN}
                      className="px-2.5 py-1.5 text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 transition-colors"
                    >
                      <Minus size={12} weight="bold" />
                    </button>
                    <input
                      id="roster-auto-interval"
                      type="number"
                      min={PROJECTOR_AUTO_INTERVAL.MIN}
                      max={PROJECTOR_AUTO_INTERVAL.MAX}
                      value={rosterAutoInterval}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10)
                        if (!isNaN(raw)) {
                          setRosterAutoInterval(raw)
                        }
                      }}
                      onBlur={() => setRosterAutoInterval((prev) => clampInterval(prev))}
                      className="w-14 text-center py-1 bg-transparent font-mono text-xs text-text focus:outline-none tabular-nums"
                    />
                    <button
                      type="button"
                      aria-label="Increase seconds per team"
                      onClick={() =>
                        setRosterAutoInterval((prev) =>
                          clampInterval(prev + 1)
                        )
                      }
                      disabled={rosterAutoInterval >= PROJECTOR_AUTO_INTERVAL.MAX}
                      className="px-2.5 py-1.5 text-muted hover:text-text hover:bg-surface-2 disabled:opacity-40 transition-colors"
                    >
                      <Plus size={12} weight="bold" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {PROJECTOR_AUTO_INTERVAL.CHIPS.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setRosterAutoInterval(sec)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-[11px] border transition-colors ${
                        rosterAutoInterval === sec
                          ? 'bg-accent text-on-accent border-accent font-bold'
                          : 'bg-surface-2 text-muted border-border hover:text-text'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Live Stage Miniature Preview */}
        <div className="p-6 rounded-2xl bg-surface border border-border shadow-sm flex flex-col gap-4 self-start w-full">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-muted flex items-center gap-2">
              <Eye size={16} />
              <span>Live Stage Preview</span>
            </span>
            <span className="text-[11px] font-mono text-accent-bright font-semibold">
              {isPlayerAutoLive
                ? `Auto, slide ${
                    playerAutoSlideshow.total > 0 ? playerAutoSlideshow.currentIndex + 1 : 0
                  } of ${playerAutoSlideshow.total}`
                : isRosterAutoLive
                ? `Auto, slide ${
                    rosterAutoSlideshow.total > 0 ? rosterAutoSlideshow.currentIndex + 1 : 0
                  } of ${rosterAutoSlideshow.total}`
                : projectorState.mode.toUpperCase()}
            </span>
          </div>

          {/* Miniature 16:9 Screen using semantic theme tokens */}
          <div className="aspect-video w-full rounded-xl bg-bg border border-border p-4 flex flex-col justify-between relative overflow-hidden select-none">
            {projectorState.mode === PROJECTOR_MODES.IDLE && (
              <>
                <div className="flex-1 flex items-center justify-center text-center px-2">
                  <span className="font-syne font-extrabold text-base text-text tracking-tight leading-tight">
                    {activeSeason?.name || 'Annual Sports Tournament'}
                  </span>
                </div>
                <div className="flex items-center justify-center pt-2 scale-75 origin-bottom">
                  <BrandMark size="sm" showWordmark={true} />
                </div>
              </>
            )}

            {projectorState.mode === PROJECTOR_MODES.TEAMS && (
              <div className="flex flex-col gap-2 my-auto">
                <div className="text-[10px] font-mono text-muted uppercase">
                  All Franchises ({teams.length})
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {teams.slice(0, 4).map((t) => (
                    <div
                      key={t.id}
                      className="p-1.5 rounded-lg bg-surface border border-border text-[9px] flex items-center justify-between"
                    >
                      <span className="truncate max-w-[70px] text-text font-medium">
                        {t.short_code}
                      </span>
                      <span className="font-mono text-points tabular-nums">
                        {t.current_purse}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {projectorState.mode === PROJECTOR_MODES.PLAYER && spotlightPlayer && (
              <div className="flex items-center gap-3 my-auto">
                <div className="w-12 h-14 rounded-xl bg-surface border border-border overflow-hidden shrink-0 flex items-center justify-center">
                  {spotlightPlayer.photo_url ? (
                    <img
                      src={spotlightPlayer.photo_url}
                      alt={spotlightPlayer.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={18} className="text-muted" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-syne font-bold text-xs text-text truncate">
                    {spotlightPlayer.name}
                  </div>
                  <div className="text-[9px] text-accent-bright font-medium">
                    {spotlightPlayer.sport} · {spotlightPlayer.playing_role}
                  </div>
                  <div className="font-mono text-[9px] text-points tabular-nums mt-0.5">
                    {spotlightPlayer.base_points} PTS
                  </div>
                </div>
              </div>
            )}

            {isPlayerAutoLive && (
              <div className="flex flex-col justify-center my-auto gap-2">
                {previewAutoPlayer ? (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-14 rounded-xl bg-surface border border-border overflow-hidden shrink-0 flex items-center justify-center">
                      {previewAutoPlayer.photo_url || previewAutoPlayer.photo_thumb_url ? (
                        <img
                          src={previewAutoPlayer.photo_url || previewAutoPlayer.photo_thumb_url}
                          alt={previewAutoPlayer.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User size={18} className="text-muted" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-[9px] text-accent-bright font-semibold">
                        #{formatAthleteCode(previewAutoPlayer.athlete_code ?? previewAutoPlayer.player_code)} · {previewAutoPlayer.sport}
                      </div>
                      <div className="font-syne font-bold text-xs text-text truncate">
                        {previewAutoPlayer.name}
                      </div>
                      <div className="text-[9px] text-muted">
                        {previewAutoPlayer.playing_role} · {previewAutoPlayer.base_points} PTS
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center font-mono text-[10px] text-muted">
                    No players to show for {projectorState.auto_sport || 'Sport'}
                  </div>
                )}
              </div>
            )}

            {projectorState.mode === PROJECTOR_MODES.ROSTER && rosterTeam && (
              <div className="flex flex-col gap-1.5 my-auto">
                <div className="flex items-center justify-between">
                  <span className="font-syne font-bold text-xs text-text">
                    {rosterTeam.name}
                  </span>
                  <span className="font-mono text-[9px] text-points tabular-nums">
                    {rosterTeam.current_purse} PTS
                  </span>
                </div>
                <div className="text-[9px] text-muted">
                  {rosterPlayers.length} players assigned
                </div>
              </div>
            )}

            {isRosterAutoLive && (
              <div className="flex flex-col gap-1.5 my-auto">
                {previewAutoTeam ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-syne font-bold text-xs text-text truncate">
                        {previewAutoTeam.name}
                      </span>
                      <span className="font-mono text-[9px] text-points tabular-nums shrink-0">
                        {previewAutoTeam.current_purse} PTS
                      </span>
                    </div>
                    <div className="text-[9px] text-muted">
                      {previewAutoTeam.sport} · {previewAutoTeamPlayers.length} players assigned
                    </div>
                  </>
                ) : (
                  <div className="text-center font-mono text-[10px] text-muted">
                    No teams for {projectorState.auto_sport || 'Sport'}
                  </div>
                )}
              </div>
            )}

            {isAuctionModeOnStage && (
              <div className="flex flex-col gap-1.5 my-auto">
                <div className="text-[9px] font-mono uppercase tracking-wider text-accent-bright font-bold">
                  Live Auction ({projectorState.mode.toUpperCase()})
                </div>
                <div className="font-syne font-bold text-xs text-text truncate">
                  {auctionStagePlayerName}
                </div>
                {projectorState.current_bid != null && (
                  <div className="font-mono text-[10px] text-points tabular-nums">
                    {projectorState.current_bid.toLocaleString()} PTS
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-[11px] text-muted leading-relaxed">
            Changes to the active scene broadcast instantaneously across all screens and open projector tabs.
          </div>
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
