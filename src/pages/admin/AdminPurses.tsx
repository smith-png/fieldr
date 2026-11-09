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
import type { PurseTransaction, PurseTransactionType, Season, Team } from '../../lib/types'
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-1">
            Financial Ledger
          </span>
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Purses & Balances
          </h1>
          <p className="text-xs sm:text-sm text-[#8E928C] mt-1">
            Manage franchise points, credit/debit balances with audit logs, and enforce strict zero-deficit rules.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsResetModalOpen(true)}
          className="min-h-[44px] px-6 py-2.5 rounded-full border border-white/20 hover:border-[#047554] text-[#CBD1CB] hover:text-white font-medium text-xs sm:text-sm transition-all flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <ArrowsClockwise size={18} />
          <span>Reset All Purses</span>
        </button>
      </div>

      {/* Purses Table */}
      {teams.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-[#141414] border border-white/10 flex flex-col items-center justify-center gap-3">
          <ShieldCheck size={40} className="text-[#8E928C]" />
          <div className="text-base font-syne font-bold text-white">No teams available</div>
          <p className="text-xs text-[#8E928C] max-w-sm">
            Please register franchise teams in the Teams tab before allocating purse points.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl bg-[#141414] border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[#8E928C] font-mono uppercase tracking-wider bg-white/[0.02]">
                  <th className="py-3.5 px-4 font-medium">Team</th>
                  <th className="py-3.5 px-3 font-medium">Sport</th>
                  <th className="py-3.5 px-3 font-medium text-right">Starting Purse</th>
                  <th className="py-3.5 px-3 font-medium text-right">Current Balance</th>
                  <th className="py-3.5 px-4 font-medium text-right">Purse Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-white/5 transition-colors">
                    {/* Team */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: team.color }}
                        />
                        <div>
                          <span className="font-syne font-bold text-sm text-white">
                            {team.name}
                          </span>
                          <span className="text-[11px] font-mono text-[#8E928C] ml-2">
                            ({team.short_code})
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Sport */}
                    <td className="py-3.5 px-3 text-[#CBD1CB] font-medium">
                      {team.sport}
                    </td>

                    {/* Starting Purse */}
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-[#8E928C]">
                      {team.starting_purse.toLocaleString()} PTS
                    </td>

                    {/* Current Balance */}
                    <td className="py-3.5 px-3 text-right">
                      <span className="font-syne font-bold text-base text-[#C88B0F] font-mono tabular-nums">
                        {team.current_purse.toLocaleString()} PTS
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openTxModal(team, 'add')}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#047554]/20 border border-[#047554]/40 text-[#047554] hover:bg-[#047554] hover:text-white transition-colors flex items-center gap-1 font-medium text-[11px]"
                        >
                          <Plus size={14} weight="bold" />
                          <span>Add</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openTxModal(team, 'deduct')}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-[#B91C1C]/20 border border-[#B91C1C]/40 text-[#B91C1C] hover:bg-[#B91C1C] hover:text-white transition-colors flex items-center gap-1 font-medium text-[11px]"
                        >
                          <Minus size={14} weight="bold" />
                          <span>Deduct</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openTxModal(team, 'set')}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[#CBD1CB] hover:text-white hover:border-[#047554] transition-colors flex items-center gap-1 font-medium text-[11px]"
                        >
                          <PencilSimple size={14} />
                          <span>Set</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setHistoryTeam(team)}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-[#8E928C] hover:text-white hover:underline transition-colors text-[11px]"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#047554]">
                  Ledger Modification
                </span>
                <h2 className="font-syne font-bold text-xl text-white capitalize">
                  {txType} Points · {selectedTeam.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeam(null)}
                className="text-[#8E928C] hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0B0B0B] border border-white/10 flex items-center justify-between text-xs">
              <span className="text-[#8E928C]">Current Available Purse</span>
              <span className="font-mono font-bold text-sm text-[#C88B0F] tabular-nums">
                {selectedTeam.current_purse.toLocaleString()} PTS
              </span>
            </div>

            <form onSubmit={handleExecuteTransaction} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  {txType === 'set' ? 'New Target Balance *' : 'Points Amount *'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="e.g. 150"
                  required
                  className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-[#047554]"
                />
              </div>

              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Reason for Adjustment (Optional)
                </label>
                <input
                  type="text"
                  value={txReason}
                  onChange={(e) => setTxReason(e.target.value)}
                  placeholder="e.g. Penalty deduction, Sponsor bonus, Auction correction"
                  className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setSelectedTeam(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !txAmount}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h2 className="font-syne font-bold text-xl text-white">
                Reset All Team Purses
              </h2>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="text-[#8E928C] hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-[#8E928C] leading-relaxed">
              This will update the starting purse and current purse for <strong>all {teams.length} teams</strong> in this season to the specified uniform value. Every change will be recorded in the audit ledger.
            </p>

            <form onSubmit={handleGlobalReset} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Uniform Purse Points *
                </label>
                <input
                  type="number"
                  min={0}
                  value={globalStartingAmount}
                  onChange={(e) => setGlobalStartingAmount(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-[#047554]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsResetModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !globalStartingAmount}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-5 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#047554]">
                  Audit Ledger
                </span>
                <h2 className="font-syne font-bold text-xl text-white">
                  Purse History · {historyTeam.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTeam(null)}
                className="text-[#8E928C] hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            {teamTransactions.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#8E928C]">
                No recorded transactions for this franchise yet.
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-white/5">
                {teamTransactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${
                            tx.type === 'deduct'
                              ? 'bg-[#B91C1C]/20 text-[#B91C1C]'
                              : tx.type === 'add'
                              ? 'bg-[#047554]/20 text-[#047554]'
                              : 'bg-white/10 text-[#CBD1CB]'
                          }`}
                        >
                          {tx.type}
                        </span>
                        <span className="font-medium text-white">{tx.reason || 'Ledger adjustment'}</span>
                      </div>
                      <span className="text-[10px] text-[#8E928C] mt-0.5 block">
                        {new Date(tx.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-semibold tabular-nums text-white text-sm block">
                        {tx.type === 'deduct' ? '-' : '+'}
                        {tx.amount.toLocaleString()} PTS
                      </span>
                      <span className="text-[10px] font-mono tabular-nums text-[#C88B0F]">
                        Bal: {tx.balance_after.toLocaleString()} PTS
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryTeam(null)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-white/10 text-white text-xs font-medium hover:bg-white/15"
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
