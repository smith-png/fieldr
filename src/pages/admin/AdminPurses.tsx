import React, { useState } from 'react'
import {
  ArrowsClockwise,
  Coins,
  Minus,
  PencilSimple,
  Plus,
  ShieldCheck,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { PurseTransaction, PurseTransactionType, Season, Team } from '../../types'
import { executePurseTransaction, resetAllPurses } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'

interface AdminPursesProps {
  activeSeason: Season | null
  teams: Team[]
  transactions: PurseTransaction[]
  onRefresh: () => Promise<void>
}

export const AdminPurses: React.FC<AdminPursesProps> = ({
  activeSeason,
  teams,
  transactions,
  onRefresh
}) => {
  const { success, error } = useToast()

  // Global reset modal
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [globalStartingAmount, setGlobalStartingAmount] = useState('1000')

  // Per team transaction modal
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [txType, setTxType] = useState<PurseTransactionType>('add')
  const [txAmount, setTxAmount] = useState('')
  const [txReason, setTxReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Selected team history view
  const [historyTeam, setHistoryTeam] = useState<Team | null>(null)

  const openTxModal = (team: Team, type: PurseTransactionType) => {
    setSelectedTeam(team)
    setTxType(type)
    setTxAmount(type === 'set' ? String(team.current_purse) : '')
    setTxReason('')
  }

  const handleExecuteTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason || !selectedTeam) return

    const amountNum = Number(txAmount)
    if (isNaN(amountNum) || amountNum < 0) {
      error('Please enter a valid non-negative number')
      return
    }

    try {
      setIsSubmitting(true)
      const res = await executePurseTransaction(
        activeSeason.id,
        selectedTeam.id,
        txType,
        amountNum,
        txReason.trim() || undefined
      )
      success(
        `Purse updated for "${selectedTeam.name}". New Balance: ${res.newBalance.toLocaleString()} PTS`
      )
      setSelectedTeam(null)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGlobalReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason) return

    const amountNum = Number(globalStartingAmount)
    if (isNaN(amountNum) || amountNum < 0) {
      error('Please enter a valid starting amount')
      return
    }

    try {
      setIsSubmitting(true)
      await resetAllPurses(
        activeSeason.id,
        amountNum,
        `Global purse initialized to ${amountNum.toLocaleString()} PTS`
      )
      success(`All franchise purses set to ${amountNum.toLocaleString()} PTS`)
      setIsResetModalOpen(false)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Global reset failed'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const teamTransactions = historyTeam
    ? transactions.filter((tx) => tx.team_id === historyTeam.id)
    : []

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
            Financial Ledger
          </span>
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-text tracking-tight">
            Purses & Balances
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Manage franchise points, credit/debit balances with audit logs, and enforce strict zero-deficit rules.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsResetModalOpen(true)}
          className="min-h-[44px] px-6 py-2.5 rounded-full border border-border hover:border-accent-bright text-text font-medium text-xs sm:text-sm transition-all flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <ArrowsClockwise size={18} />
          <span>Reset All Purses</span>
        </button>
      </div>

      {/* Purses Table */}
      {teams.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-surface border border-border flex flex-col items-center justify-center gap-3">
          <ShieldCheck size={40} className="text-muted" />
          <div className="text-base font-syne font-bold text-text">No teams available</div>
          <p className="text-xs text-muted max-w-sm">
            Please register franchise teams in the Teams tab before allocating purse points.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl bg-surface border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted font-mono uppercase tracking-wider bg-surface-2/50">
                  <th className="py-3.5 px-4 font-medium">Team</th>
                  <th className="py-3.5 px-3 font-medium">Sport</th>
                  <th className="py-3.5 px-3 font-medium text-right">Starting Purse</th>
                  <th className="py-3.5 px-3 font-medium text-right">Current Balance</th>
                  <th className="py-3.5 px-4 font-medium text-right">Purse Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-surface-2 transition-colors">
                    {/* Team */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: team.color }}
                        />
                        <div>
                          <span className="font-syne font-bold text-sm text-text">
                            {team.name}
                          </span>
                          <span className="text-[11px] font-mono text-muted ml-2">
                            ({team.short_code})
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Sport */}
                    <td className="py-3.5 px-3 text-text font-medium">
                      {team.sport}
                    </td>

                    {/* Starting Purse */}
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-muted">
                      {team.starting_purse.toLocaleString()} PTS
                    </td>

                    {/* Current Balance */}
                    <td className="py-3.5 px-3 text-right">
                      <span className="font-syne font-bold text-base text-points font-mono tabular-nums">
                        {team.current_purse.toLocaleString()} PTS
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openTxModal(team, 'add')}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-accent-bright/15 border border-accent-bright/40 text-accent-bright hover:bg-accent-bright hover:text-on-accent transition-colors flex items-center gap-1 font-medium text-[11px]"
                        >
                          <Plus size={14} weight="bold" />
                          <span>Add</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openTxModal(team, 'deduct')}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-error/15 border border-error/40 text-error hover:bg-error hover:text-white transition-colors flex items-center gap-1 font-medium text-[11px]"
                        >
                          <Minus size={14} weight="bold" />
                          <span>Deduct</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openTxModal(team, 'set')}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-surface-2 border border-border text-text hover:border-accent-bright transition-colors flex items-center gap-1 font-medium text-[11px]"
                        >
                          <PencilSimple size={14} />
                          <span>Set</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setHistoryTeam(team)}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-muted hover:text-text hover:underline transition-colors text-[11px]"
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Deduct / Set Modal */}
      {selectedTeam && (
        <div className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-accent-bright">
                  Ledger Modification
                </span>
                <h2 className="font-syne font-bold text-xl text-text capitalize">
                  {txType} Points · {selectedTeam.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeam(null)}
                className="text-muted hover:text-text p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-surface-2 border border-border flex items-center justify-between text-xs">
              <span className="text-muted">Current Available Purse</span>
              <span className="font-mono font-bold text-sm text-points tabular-nums">
                {selectedTeam.current_purse.toLocaleString()} PTS
              </span>
            </div>

            <form onSubmit={handleExecuteTransaction} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                  {txType === 'set' ? 'New Target Balance *' : 'Points Amount *'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="e.g. 150"
                  required
                  className="w-full px-4 py-2.5 bg-bg border border-border rounded-xl text-sm font-mono text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div>
                <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                  Reason for Adjustment (Optional)
                </label>
                <input
                  type="text"
                  value={txReason}
                  onChange={(e) => setTxReason(e.target.value)}
                  placeholder="e.g. Penalty deduction, Sponsor bonus, Auction correction"
                  className="w-full px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setSelectedTeam(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !txAmount}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-btn-bg text-btn-fg font-medium text-xs hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Recording...' : `Execute ${txType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Starting Purse Reset Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="font-syne font-bold text-xl text-text">
                Reset All Team Purses
              </h2>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="text-muted hover:text-text p-1"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              This will update the starting purse and current purse for <strong>all {teams.length} teams</strong> in this season to the specified uniform value. Every change will be recorded in the audit ledger.
            </p>

            <form onSubmit={handleGlobalReset} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                  Uniform Purse Points *
                </label>
                <input
                  type="number"
                  min={0}
                  value={globalStartingAmount}
                  onChange={(e) => setGlobalStartingAmount(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-bg border border-border rounded-xl text-sm font-mono text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !globalStartingAmount}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-btn-bg text-btn-fg font-medium text-xs hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Resetting...' : 'Apply Global Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Team Transaction History Drawer */}
      {historyTeam && (
        <div className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-surface border border-border rounded-3xl p-6 sm:p-8 flex flex-col gap-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-accent-bright">
                  Audit Ledger
                </span>
                <h2 className="font-syne font-bold text-xl text-text">
                  Purse History · {historyTeam.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTeam(null)}
                className="text-muted hover:text-text p-1"
              >
                <X size={20} />
              </button>
            </div>

            {teamTransactions.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted">
                No recorded transactions for this franchise yet.
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {teamTransactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                            tx.type === 'deduct'
                              ? 'bg-error/15 text-error'
                              : tx.type === 'add'
                              ? 'bg-accent-bright/15 text-accent-bright'
                              : 'bg-surface-2 text-muted'
                          }`}
                        >
                          {tx.type}
                        </span>
                        <span className="font-medium text-text">{tx.reason || 'Ledger adjustment'}</span>
                      </div>
                      <span className="text-[10px] text-muted mt-0.5 block">
                        {new Date(tx.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-semibold tabular-nums text-text text-sm block">
                        {tx.type === 'deduct' ? '-' : '+'}
                        {tx.amount.toLocaleString()} PTS
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-points">
                        Bal: {tx.balance_after.toLocaleString()} PTS
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryTeam(null)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-surface-2 text-text text-xs font-medium hover:bg-border/40"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
