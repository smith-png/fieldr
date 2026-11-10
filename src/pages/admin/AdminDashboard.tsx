import React from 'react'
import {
  Coins,
  ShieldCheck,
  Television,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  ArrowsLeftRight
} from '@phosphor-icons/react'
import type { AdminTab, Player, PurseTransaction, Season, Team } from '../../types'

interface AdminDashboardProps {
  activeSeason: Season | null
  teams: Team[]
  players: Player[]
  transactions: PurseTransaction[]
  onGoToTab: (tab: AdminTab) => void
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  activeSeason,
  teams,
  players,
  transactions,
  onGoToTab
}) => {
  const totalPurse = teams.reduce((acc, t) => acc + (t.current_purse || 0), 0)
  const soldPlayers = players.filter((p) => p.status === 'sold')
  const availablePlayers = players.filter((p) => p.status === 'available')

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
            Tournament Control
          </span>
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-text tracking-tight">
            {activeSeason?.name || 'Tournament Dashboard'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => onGoToTab('projector')}
          className="min-h-[44px] px-5 py-2.5 rounded-full bg-btn-bg text-btn-fg font-medium text-xs sm:text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <Television size={18} weight="bold" />
          <span>Switch Projector Scene</span>
        </button>
      </div>

      {/* KPI Cards Grid (4 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Teams */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-4">
            <span className="text-xs font-mono uppercase tracking-wider">Registered Teams</span>
            <ShieldCheck size={20} className="text-accent-bright" />
          </div>
          <div>
            <div className="font-syne font-bold text-3xl text-text tabular-nums">
              {teams.length}
            </div>
            <div className="text-xs text-muted mt-1 flex items-center gap-2">
              <span>Across all sports</span>
              <button
                type="button"
                onClick={() => onGoToTab('teams')}
                className="text-accent-bright hover:underline"
              >
                View
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Total Players */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-4">
            <span className="text-xs font-mono uppercase tracking-wider">Player Pool</span>
            <Users size={20} className="text-accent-bright" />
          </div>
          <div>
            <div className="font-syne font-bold text-3xl text-text tabular-nums">
              {players.length}
            </div>
            <div className="text-xs text-muted mt-1 flex items-center gap-2">
              <span className="text-accent-bright font-medium">{soldPlayers.length} drafted</span>
              <span>·</span>
              <span>{availablePlayers.length} available</span>
            </div>
          </div>
        </div>

        {/* Card 3: Total Purse Points */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-4">
            <span className="text-xs font-mono uppercase tracking-wider">Total Active Purse</span>
            <Coins size={20} className="text-points" />
          </div>
          <div>
            <div className="font-syne font-bold text-3xl text-points tabular-nums">
              {totalPurse.toLocaleString()}
            </div>
            <div className="text-xs text-muted mt-1">
              Auction points remaining
            </div>
          </div>
        </div>

        {/* Card 4: Ledger Activity */}
        <div className="p-5 rounded-2xl bg-surface border border-border flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-4">
            <span className="text-xs font-mono uppercase tracking-wider">Purse Transactions</span>
            <ArrowsLeftRight size={20} className="text-muted" />
          </div>
          <div>
            <div className="font-syne font-bold text-3xl text-text tabular-nums">
              {transactions.length}
            </div>
            <div className="text-xs text-muted mt-1">
              Recorded audit events
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Section: Quick Actions & Recent Ledger Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Purse Activity */}
        <div className="lg:col-span-2 p-6 rounded-3xl bg-surface border border-border flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-syne font-bold text-xl text-text tracking-tight">
                Recent Purse Activity
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Real-time audit log of budget adjustments and player purchase deductions.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onGoToTab('purses')}
              className="text-xs font-medium text-accent-bright hover:text-text transition-colors"
            >
              Manage purses &rarr;
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted border border-dashed border-border rounded-2xl">
              No transactions recorded yet in this season.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted font-mono uppercase tracking-wider">
                    <th className="pb-3 font-medium">Team</th>
                    <th className="pb-3 font-medium">Type</th>
                    <th className="pb-3 font-medium text-right">Amount</th>
                    <th className="pb-3 font-medium text-right">Balance</th>
                    <th className="pb-3 font-medium pl-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.slice(0, 6).map((tx) => {
                    const team = teams.find((t) => t.id === tx.team_id)
                    return (
                      <tr key={tx.id} className="hover:bg-surface-2 transition-colors">
                        <td className="py-3 font-medium text-text">
                          <span className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: team?.color || 'var(--accent)' }}
                            />
                            <span>{team?.name || 'Team'}</span>
                          </span>
                        </td>
                        <td className="py-3 uppercase font-mono text-[11px]">
                          <span
                            className={`px-2 py-0.5 rounded ${
                              tx.type === 'deduct'
                                ? 'bg-error/15 text-error'
                                : tx.type === 'add'
                                ? 'bg-accent-bright/15 text-accent-bright'
                                : 'bg-surface-2 text-muted'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3 text-right font-mono font-semibold tabular-nums text-text">
                          {tx.type === 'deduct' ? '-' : '+'}
                          {tx.amount.toLocaleString()}
                        </td>
                        <td className="py-3 text-right font-mono tabular-nums text-points">
                          {tx.balance_after.toLocaleString()}
                        </td>
                        <td className="py-3 text-muted pl-4 truncate max-w-xs">
                          {tx.reason || 'Manual ledger action'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 1 Col: Quick Control Shortcuts */}
        <div className="p-6 rounded-3xl bg-surface border border-border flex flex-col gap-5">
          <div>
            <h2 className="font-syne font-bold text-xl text-text tracking-tight">
              Console Shortcuts
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Rapid operations during live tournament proceedings.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => onGoToTab('players')}
              className="p-3.5 rounded-2xl bg-surface-2 border border-border hover:border-accent-bright text-left transition-all flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-text group-hover:text-accent-bright">
                  Register New Player
                </div>
                <div className="text-[11px] text-muted">
                  Manual entry with photo and sport role
                </div>
              </div>
              <Users size={18} className="text-accent-bright" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('teams')}
              className="p-3.5 rounded-2xl bg-surface-2 border border-border hover:border-accent-bright text-left transition-all flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-text group-hover:text-accent-bright">
                  Create New Franchise Team
                </div>
                <div className="text-[11px] text-muted">
                  Set color, logo, owner, and purse
                </div>
              </div>
              <ShieldCheck size={18} className="text-accent-bright" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('purses')}
              className="p-3.5 rounded-2xl bg-surface-2 border border-border hover:border-accent-bright text-left transition-all flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-text group-hover:text-accent-bright">
                  Reset Starting Purses
                </div>
                <div className="text-[11px] text-muted">
                  Set uniform points for all teams
                </div>
              </div>
              <Coins size={18} className="text-points" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('projector')}
              className="p-3.5 rounded-2xl bg-surface-2 border border-border hover:border-accent-bright text-left transition-all flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-text group-hover:text-accent-bright">
                  Broadcast Player Spotlight
                </div>
                <div className="text-[11px] text-muted">
                  Show high-res card on stage display
                </div>
              </div>
              <Television size={18} className="text-accent-bright" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
