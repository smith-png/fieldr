import React, { useEffect, useRef, useState } from 'react'
import {
  ArrowsLeftRight,
  Coins,
  ShieldCheck,
  Television,
  Users
} from '@phosphor-icons/react'
import { Button, EmptyState, PageHeader } from '../../components/ui'
import { triggerConfetti } from '../../lib/data'
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

  const [isConfettiDisabled, setIsConfettiDisabled] = useState(false)
  const [confettiError, setConfettiError] = useState<string | null>(null)
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current)
      }
    }
  }, [])

  const handleTriggerConfetti = async () => {
    if (isConfettiDisabled) return
    if (!activeSeason?.id) {
      setConfettiError('No active season')
      return
    }

    setIsConfettiDisabled(true)
    setConfettiError(null)

    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current)
    }
    cooldownTimerRef.current = setTimeout(() => {
      setIsConfettiDisabled(false)
      cooldownTimerRef.current = null
    }, 4000)

    try {
      await triggerConfetti(activeSeason.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger confetti'
      setConfettiError(msg)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Tournament Control"
        title={activeSeason?.name || 'Tournament Dashboard'}
        actions={
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isConfettiDisabled || !activeSeason?.id}
                onClick={() => void handleTriggerConfetti()}
              >
                Confetti
              </Button>
              <Button
                variant="primary"
                leftIcon={Television}
                onClick={() => onGoToTab('projector')}
              >
                Switch Projector Scene
              </Button>
            </div>
            {confettiError && (
              <span role="alert" className="text-xs font-mono text-error">
                {confettiError}
              </span>
            )}
          </div>
        }
      />

      {/* KPI Cards Grid (4 Columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Teams */}
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-col justify-between">
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
                className="text-accent-bright font-medium hover:underline"
              >
                View
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Total Players */}
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-col justify-between">
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
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-col justify-between">
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
        <div className="p-5 rounded-2xl bg-surface border border-border shadow-sm flex flex-col justify-between">
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

      {/* Two Column Section: Recent Ledger Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Purse Activity */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-6 border-b border-border flex items-center justify-between gap-4">
            <div>
              <h2 className="font-syne font-bold text-xl text-text tracking-tight">
                Recent Purse Activity
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Real-time audit log of budget adjustments and player purchase deductions.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onGoToTab('purses')}
              className="text-accent-bright hover:text-text"
            >
              Manage purses
            </Button>
          </div>

          {transactions.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Coins}
                title="No transactions recorded yet"
                description="Purse adjustments and player auction deductions for this season will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 font-normal">Team</th>
                    <th className="py-3 px-4 font-normal">Type</th>
                    <th className="py-3 px-4 font-normal text-right">Amount</th>
                    <th className="py-3 px-4 font-normal text-right">Balance</th>
                    <th className="py-3 px-4 font-normal">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.slice(0, 6).map((tx) => {
                    const team = teams.find((t) => t.id === tx.team_id)
                    return (
                      <tr key={tx.id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-text">
                          <span className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
                              style={{ backgroundColor: team?.color || 'var(--accent)' }}
                            />
                            <span>{team?.name || 'Team'}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 uppercase font-mono text-[11px]">
                          <span
                            className={
                              tx.type === 'deduct' || tx.type === 'purchase'
                                ? 'text-error font-semibold'
                                : tx.type === 'add' || tx.type === 'refund'
                                ? 'text-accent-bright font-semibold'
                                : 'text-muted'
                            }
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-text">
                          {tx.type === 'deduct' || tx.type === 'purchase' ? '-' : '+'}
                          {Math.abs(tx.amount).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-points font-semibold">
                          {tx.balance_after.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-muted truncate max-w-xs">
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
        <div className="p-6 rounded-2xl bg-surface border border-border shadow-sm flex flex-col gap-5 self-start">
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
              className="p-3.5 rounded-xl bg-surface-2 border border-border hover:border-accent-bright text-left transition-colors flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-text group-hover:text-accent-bright transition-colors">
                  Register New Player
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Assign athlete profile to a sport role
                </div>
              </div>
              <Users size={18} className="text-accent-bright shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('teams')}
              className="p-3.5 rounded-xl bg-surface-2 border border-border hover:border-accent-bright text-left transition-colors flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-text group-hover:text-accent-bright transition-colors">
                  Create New Franchise Team
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Set color, logo, owner, and purse
                </div>
              </div>
              <ShieldCheck size={18} className="text-accent-bright shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('purses')}
              className="p-3.5 rounded-xl bg-surface-2 border border-border hover:border-accent-bright text-left transition-colors flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-text group-hover:text-accent-bright transition-colors">
                  Reset Starting Purses
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Set uniform points for all teams
                </div>
              </div>
              <Coins size={18} className="text-points shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('projector')}
              className="p-3.5 rounded-xl bg-surface-2 border border-border hover:border-accent-bright text-left transition-colors flex items-center justify-between group"
            >
              <div>
                <div className="text-xs font-semibold text-text group-hover:text-accent-bright transition-colors">
                  Broadcast Player Spotlight
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Show high-res card on stage display
                </div>
              </div>
              <Television size={18} className="text-accent-bright shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
