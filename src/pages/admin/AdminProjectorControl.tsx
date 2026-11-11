import React, { useState } from 'react'
import {
  Broadcast,
  Eye,
  ShieldCheck,
  Television,
  User,
  Users
} from '@phosphor-icons/react'
import type { Player, ProjectorMode, ProjectorState, Season, Team } from '../../types'
import { setProjectorState } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { BrandMark } from '../../components/layout/BrandMark'
import { Button, PageHeader } from '../../components/ui'

interface AdminProjectorControlProps {
  activeSeason: Season | null
  projectorState: ProjectorState
  teams: Team[]
  players: Player[]
  onRefresh: () => Promise<void>
}

export const AdminProjectorControl: React.FC<AdminProjectorControlProps> = ({
  activeSeason,
  projectorState,
  teams,
  players,
  onRefresh
}) => {
  const { success, error } = useToast()

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    projectorState.player_id || (players[0]?.id ?? '')
  )
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    projectorState.team_id || (teams[0]?.id ?? '')
  )
  const [isUpdating, setIsUpdating] = useState(false)

  const handleSwitchMode = async (mode: ProjectorMode) => {
    if (!activeSeason) {
      error('No active season')
      return
    }

    try {
      setIsUpdating(true)
      const nextState: ProjectorState = {
        season_id: activeSeason.id,
        mode,
        player_id: mode === 'player' ? selectedPlayerId : null,
        team_id: mode === 'roster' ? selectedTeamId : null,
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

  const spotlightPlayer = players.find((p) => p.id === projectorState.player_id)
  const rosterTeam = teams.find((t) => t.id === projectorState.team_id)
  const rosterPlayers = rosterTeam ? players.filter((p) => p.team_id === rosterTeam.id) : []

  return (
    <div className="flex flex-col gap-8">
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
              projectorState.mode === 'idle'
                ? 'bg-surface border-accent-bright'
                : 'bg-surface border-border hover:border-accent-bright/60'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                  projectorState.mode === 'idle'
                    ? 'bg-accent text-on-accent'
                    : 'bg-surface-2 text-muted'
                }`}
              >
                <Broadcast size={22} weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-syne font-bold text-lg text-text">
                    1. Idle Welcome Screen
                  </h3>
                  {projectorState.mode === 'idle' && (
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
              variant={projectorState.mode === 'idle' ? 'secondary' : 'primary'}
              size="md"
              disabled={isUpdating || projectorState.mode === 'idle'}
              onClick={() => handleSwitchMode('idle')}
            >
              {projectorState.mode === 'idle' ? 'Currently Active' : 'Broadcast Scene'}
            </Button>
          </div>

          {/* Mode 2: Teams & Purses Leaderboard */}
          <div
            className={`p-5 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
              projectorState.mode === 'teams'
                ? 'bg-surface border-accent-bright'
                : 'bg-surface border-border hover:border-accent-bright/60'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                  projectorState.mode === 'teams'
                    ? 'bg-accent text-on-accent'
                    : 'bg-surface-2 text-muted'
                }`}
              >
                <ShieldCheck size={22} weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-syne font-bold text-lg text-text">
                    2. All Teams & Purses Leaderboard
                  </h3>
                  {projectorState.mode === 'teams' && (
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
              variant={projectorState.mode === 'teams' ? 'secondary' : 'primary'}
              size="md"
              disabled={isUpdating || projectorState.mode === 'teams'}
              onClick={() => handleSwitchMode('teams')}
            >
              {projectorState.mode === 'teams' ? 'Currently Active' : 'Broadcast Scene'}
            </Button>
          </div>

          {/* Mode 3: Player Spotlight */}
          <div
            className={`p-5 rounded-2xl border transition-colors flex flex-col gap-4 shadow-sm ${
              projectorState.mode === 'player'
                ? 'bg-surface border-accent-bright'
                : 'bg-surface border-border hover:border-accent-bright/60'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                    projectorState.mode === 'player'
                      ? 'bg-accent text-on-accent'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  <User size={22} weight="bold" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-syne font-bold text-lg text-text">
                      3. Player Spotlight Card
                    </h3>
                    {projectorState.mode === 'player' && (
                      <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                        · Live on Stage
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Cinematic player card with large typography, photo, sport, discipline, and base points.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={isUpdating || !selectedPlayerId}
                onClick={() => handleSwitchMode('player')}
              >
                {projectorState.mode === 'player' && projectorState.player_id === selectedPlayerId
                  ? 'Update Spotlight'
                  : 'Broadcast Player'}
              </Button>
            </div>

            {/* Player Selection Dropdown */}
            <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <span className="text-xs text-text font-medium shrink-0">
                Choose Player:
              </span>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="flex-1 px-3 py-2 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sport} - {p.playing_role}) [{p.status.toUpperCase()}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mode 4: Team Roster View */}
          <div
            className={`p-5 rounded-2xl border transition-colors flex flex-col gap-4 shadow-sm ${
              projectorState.mode === 'roster'
                ? 'bg-surface border-accent-bright'
                : 'bg-surface border-border hover:border-accent-bright/60'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                    projectorState.mode === 'roster'
                      ? 'bg-accent text-on-accent'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  <Users size={22} weight="bold" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-syne font-bold text-lg text-text">
                      4. Team Roster Showcase
                    </h3>
                    {projectorState.mode === 'roster' && (
                      <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                        · Live on Stage
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Display an individual team&apos;s franchise emblem, owner, purse, and all drafted players.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={isUpdating || !selectedTeamId}
                onClick={() => handleSwitchMode('roster')}
              >
                {projectorState.mode === 'roster' && projectorState.team_id === selectedTeamId
                  ? 'Update Roster'
                  : 'Broadcast Roster'}
              </Button>
            </div>

            {/* Team Selection Dropdown */}
            <div className="pt-3 border-t border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <span className="text-xs text-text font-medium shrink-0">
                Choose Team:
              </span>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="flex-1 px-3 py-2 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.short_code}) - {t.sport}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Live Stage Miniature Preview */}
        <div className="p-6 rounded-2xl bg-surface border border-border shadow-sm flex flex-col gap-4 self-start w-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-muted flex items-center gap-2">
              <Eye size={16} />
              <span>Live Stage Preview</span>
            </span>
            <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
              {projectorState.mode}
            </span>
          </div>

          {/* Miniature 16:9 Screen using semantic theme tokens */}
          <div className="aspect-video w-full rounded-xl bg-bg border border-border p-4 flex flex-col justify-between relative overflow-hidden select-none">
            {projectorState.mode === 'idle' && (
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

            {projectorState.mode === 'teams' && (
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

            {projectorState.mode === 'player' && spotlightPlayer && (
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

            {projectorState.mode === 'roster' && rosterTeam && (
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
          </div>

          <div className="text-[11px] text-muted leading-relaxed">
            Changes to the active scene broadcast instantaneously across all screens and open projector tabs.
          </div>
        </div>
      </div>
    </div>
  )
}
