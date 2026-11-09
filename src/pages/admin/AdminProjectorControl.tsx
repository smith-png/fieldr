import React, { useState } from 'react'
import {
  Broadcast,
  Eye,
  ProjectorScreen,
  ShieldCheck,
  Sparkle,
  Television,
  User,
  Users
} from '@phosphor-icons/react'
import type { Player, ProjectorMode, ProjectorState, Season, Team } from '../../lib/types'
import { setProjectorState } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-1">
            Stage Broadcast Control
          </span>
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Projector Command Studio
          </h1>
          <p className="text-xs sm:text-sm text-[#8E928C] mt-1">
            Choose what displays live on the hall auditorium big screen with instant synchronization.
          </p>
        </div>

        <a
          href="/projector"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] px-6 py-2.5 rounded-full bg-white text-[#0B0B0B] font-medium text-xs sm:text-sm hover:bg-[#F0F2EE] transition-all flex items-center justify-center gap-2 self-start sm:self-auto shadow-lg"
        >
          <Television size={18} weight="bold" />
          <span>Open Fullscreen Projector</span>
        </a>
      </div>

      {/* Main Grid: Left Controls (2 Cols) + Right Live Miniature Stage Preview (1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Mode Selection Cards */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="text-xs font-mono uppercase tracking-wider text-[#8E928C]">
            Select Active Stage Scene
          </div>

          {/* Mode 1: Idle Scene */}
          <div
            className={`p-5 rounded-3xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              projectorState.mode === 'idle'
                ? 'bg-[#19241B] border-[#047554]'
                : 'bg-[#141414] border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  projectorState.mode === 'idle'
                    ? 'bg-[#047554] text-white'
                    : 'bg-white/5 text-[#8E928C]'
                }`}
              >
                <Broadcast size={24} weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-syne font-bold text-lg text-white">
                    1. Idle Welcome Screen
                  </h3>
                  {projectorState.mode === 'idle' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#047554]/30 text-[#047554] border border-[#047554]/40">
                      Live on Stage
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#8E928C] mt-1 leading-relaxed">
                  Huge Fieldr wordmark, season title, and the tournament motto: "Draft. Bid. Win."
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isUpdating || projectorState.mode === 'idle'}
              onClick={() => handleSwitchMode('idle')}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-40 transition-all shrink-0 self-start sm:self-auto"
            >
              {projectorState.mode === 'idle' ? 'Currently Active' : 'Broadcast Scene'}
            </button>
          </div>

          {/* Mode 2: Teams & Purses Leaderboard */}
          <div
            className={`p-5 rounded-3xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              projectorState.mode === 'teams'
                ? 'bg-[#19241B] border-[#047554]'
                : 'bg-[#141414] border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  projectorState.mode === 'teams'
                    ? 'bg-[#047554] text-white'
                    : 'bg-white/5 text-[#8E928C]'
                }`}
              >
                <ShieldCheck size={24} weight="bold" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-syne font-bold text-lg text-white">
                    2. All Teams & Purses Leaderboard
                  </h3>
                  {projectorState.mode === 'teams' && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#047554]/30 text-[#047554] border border-[#047554]/40">
                      Live on Stage
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#8E928C] mt-1 leading-relaxed">
                  High-contrast grid of all franchise team cards, emblems, owners, and animated purse balances.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isUpdating || projectorState.mode === 'teams'}
              onClick={() => handleSwitchMode('teams')}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-40 transition-all shrink-0 self-start sm:self-auto"
            >
              {projectorState.mode === 'teams' ? 'Currently Active' : 'Broadcast Scene'}
            </button>
          </div>

          {/* Mode 3: Player Spotlight */}
          <div
            className={`p-5 rounded-3xl border transition-all flex flex-col gap-4 ${
              projectorState.mode === 'player'
                ? 'bg-[#19241B] border-[#047554]'
                : 'bg-[#141414] border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    projectorState.mode === 'player'
                      ? 'bg-[#047554] text-white'
                      : 'bg-white/5 text-[#8E928C]'
                  }`}
                >
                  <User size={24} weight="bold" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-syne font-bold text-lg text-white">
                      3. Player Spotlight Card
                    </h3>
                    {projectorState.mode === 'player' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#047554]/30 text-[#047554] border border-[#047554]/40">
                        Live on Stage
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8E928C] mt-1 leading-relaxed">
                    Cinematic player card with huge typography, photo, sport, discipline, and base points.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isUpdating || !selectedPlayerId}
                onClick={() => handleSwitchMode('player')}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-40 transition-all shrink-0 self-start sm:self-auto"
              >
                {projectorState.mode === 'player' && projectorState.player_id === selectedPlayerId
                  ? 'Update Spotlight'
                  : 'Broadcast Player'}
              </button>
            </div>

            {/* Player Selection Dropdown */}
            <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <span className="text-xs text-[#CBD1CB] font-medium shrink-0">
                Choose Player:
              </span>
              <select
                value={selectedPlayerId}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-[#047554]"
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
            className={`p-5 rounded-3xl border transition-all flex flex-col gap-4 ${
              projectorState.mode === 'roster'
                ? 'bg-[#19241B] border-[#047554]'
                : 'bg-[#141414] border-white/10 hover:border-white/20'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    projectorState.mode === 'roster'
                      ? 'bg-[#047554] text-white'
                      : 'bg-white/5 text-[#8E928C]'
                  }`}
                >
                  <Users size={24} weight="bold" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-syne font-bold text-lg text-white">
                      4. Team Roster Showcase
                    </h3>
                    {projectorState.mode === 'roster' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#047554]/30 text-[#047554] border border-[#047554]/40">
                        Live on Stage
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8E928C] mt-1 leading-relaxed">
                    Display an individual team's franchise emblem, owner, purse, and all drafted players.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isUpdating || !selectedTeamId}
                onClick={() => handleSwitchMode('roster')}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-40 transition-all shrink-0 self-start sm:self-auto"
              >
                {projectorState.mode === 'roster' && projectorState.team_id === selectedTeamId
                  ? 'Update Roster'
                  : 'Broadcast Roster'}
              </button>
            </div>

            {/* Team Selection Dropdown */}
            <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <span className="text-xs text-[#CBD1CB] font-medium shrink-0">
                Choose Team:
              </span>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-[#047554]"
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
        <div className="p-6 rounded-3xl bg-[#141414] border border-white/10 flex flex-col gap-4 self-start w-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-[#8E928C] flex items-center gap-2">
              <Eye size={16} />
              <span>Live Stage Preview</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-[#047554]/30 text-[#047554] border border-[#047554]/40">
              {projectorState.mode}
            </span>
          </div>

          {/* Miniature 16:9 Screen */}
          <div className="aspect-video w-full rounded-2xl bg-[#0B0B0B] border border-white/20 p-4 flex flex-col justify-between relative overflow-hidden select-none">
            {/* Ambient Back Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-[#047554]/20 blur-2xl pointer-events-none" />

            {/* Mini scene contents */}
            {projectorState.mode === 'idle' && (
              <div className="flex flex-col items-center justify-center my-auto text-center gap-1">
                <span className="font-syne font-extrabold text-2xl text-white tracking-tighter">
                  FIELDR
                </span>
                <span className="text-[10px] font-mono tracking-widest text-[#047554] uppercase">
                  Draft. Bid. Win.
                </span>
              </div>
            )}

            {projectorState.mode === 'teams' && (
              <div className="flex flex-col gap-2 my-auto">
                <div className="text-[10px] font-mono text-[#8E928C] uppercase">
                  All Franchises ({teams.length})
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {teams.slice(0, 4).map((t) => (
                    <div
                      key={t.id}
                      className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] flex items-center justify-between"
                    >
                      <span className="truncate max-w-[70px] text-white font-medium">
                        {t.short_code}
                      </span>
                      <span className="font-mono text-[#C88B0F]">
                        {t.current_purse}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {projectorState.mode === 'player' && spotlightPlayer && (
              <div className="flex items-center gap-3 my-auto">
                <div className="w-12 h-14 rounded-xl bg-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                  {spotlightPlayer.photo_url ? (
                    <img
                      src={spotlightPlayer.photo_url}
                      alt={spotlightPlayer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={18} className="text-[#8E928C]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-syne font-bold text-xs text-white truncate">
                    {spotlightPlayer.name}
                  </div>
                  <div className="text-[9px] text-[#047554] font-medium">
                    {spotlightPlayer.sport} · {spotlightPlayer.playing_role}
                  </div>
                  <div className="font-mono text-[9px] text-[#C88B0F] mt-0.5">
                    {spotlightPlayer.base_points} PTS
                  </div>
                </div>
              </div>
            )}

            {projectorState.mode === 'roster' && rosterTeam && (
              <div className="flex flex-col gap-1.5 my-auto">
                <div className="flex items-center justify-between">
                  <span className="font-syne font-bold text-xs text-white">
                    {rosterTeam.name}
                  </span>
                  <span className="font-mono text-[9px] text-[#C88B0F]">
                    {rosterTeam.current_purse} PTS
                  </span>
                </div>
                <div className="text-[9px] text-[#8E928C]">
                  {rosterPlayers.length} players assigned
                </div>
              </div>
            )}

            {/* Miniature Footer */}
            <div className="flex items-center justify-between text-[8px] text-[#8E928C] pt-2 border-t border-white/10">
              <span>DRGMC Auditorium</span>
              <span>1920x1080 Stage</span>
            </div>
          </div>

          <div className="text-[11px] text-[#8E928C] leading-relaxed">
            Changes to the active scene broadcast instantaneously across all screens and open projector tabs.
          </div>
        </div>
      </div>
    </div>
  )
}
