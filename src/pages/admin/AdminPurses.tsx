import React, { useState } from 'react'
import {
  ArrowsClockwise,
  Minus,
  PencilSimple,
  Plus,
  ShieldCheck
} from '@phosphor-icons/react'
import type { PurseTransaction, PurseTransactionType, Season, Team } from '../../types'
import { executePurseTransaction, resetAllPurses } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog, EmptyState, PageHeader } from '../../components/ui'

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
      <PageHeader
        label="Financial Ledger"
        title="Purses & Balances"
        subtitle="Manage franchise points, credit/debit balances with audit logs, and enforce strict zero-deficit rules."
        actions={
          <Button
            variant="secondary"
            size="md"
            leftIcon={ArrowsClockwise}
            onClick={() => setIsResetModalOpen(true)}
          >
            Reset All Purses
          </Button>
        }
      />

      {/* Purses Table */}
      {teams.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No teams available"
          description="Please register franchise teams in the Teams tab before allocating purse points."
        />
      ) : (
        <div className="rounded-2xl bg-surface border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted font-mono uppercase tracking-wider bg-surface-2 text-[11px]">
                  <th className="py-3 px-4 font-medium">Team</th>
                  <th className="py-3 px-4 font-medium">Sport</th>
                  <th className="py-3 px-4 font-medium text-right">Starting Purse</th>
                  <th className="py-3 px-4 font-medium text-right">Current Balance</th>
                  <th className="py-3 px-4 font-medium text-right">Purse Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teams.map((team) => (
                  <tr key={team.id} className="hover:bg-surface-2/60 transition-colors">
                    {/* Team */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-border"
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
                    <td className="py-3.5 px-4 text-text font-medium">
                      {team.sport}
                    </td>

                    {/* Starting Purse */}
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-muted">
                      {team.starting_purse.toLocaleString()} PTS
                    </td>

                    {/* Current Balance */}
                    <td className="py-3.5 px-4 text-right">
                      <span className="font-mono font-bold text-sm text-points tabular-nums">
                        {team.current_purse.toLocaleString()} PTS
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={Plus}
                          onClick={() => openTxModal(team, 'add')}
                          className="text-accent-bright"
                        >
                          Add
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={Minus}
                          onClick={() => openTxModal(team, 'deduct')}
                          className="text-error"
                        >
                          Deduct
                        </Button>

                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={PencilSimple}
                          onClick={() => openTxModal(team, 'set')}
                        >
                          Set
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryTeam(team)}
                        >
                          History
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Deduct / Set Dialog */}
      <Dialog
        isOpen={!!selectedTeam}
        onClose={() => setSelectedTeam(null)}
        title={
          selectedTeam
            ? `${txType.charAt(0).toUpperCase() + txType.slice(1)} Points · ${selectedTeam.name}`
            : 'Update Purse'
        }
        description="Ledger Modification"
        size="md"
      >
        {selectedTeam && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border flex items-center justify-between text-xs">
              <span className="text-muted">Current Available Purse</span>
              <span className="font-mono font-bold text-sm text-points tabular-nums">
                {selectedTeam.current_purse.toLocaleString()} PTS
              </span>
            </div>

            <form onSubmit={handleExecuteTransaction} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                  {txType === 'set' ? 'New Target Balance *' : 'Points Amount *'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="e.g. 150"
                  required
                  className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs font-mono tabular-nums text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div>
                <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                  Reason for Adjustment (Optional)
                </label>
                <input
                  type="text"
                  value={txReason}
                  onChange={(e) => setTxReason(e.target.value)}
                  placeholder="e.g. Penalty deduction, Sponsor bonus, Auction correction"
                  className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedTeam(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting || !txAmount}
                  isLoading={isSubmitting}
                >
                  Execute {txType}
                </Button>
              </div>
            </form>
          </div>
        )}
      </Dialog>

      {/* Global Starting Purse Reset Dialog */}
      <Dialog
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Reset All Team Purses"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            This will update the starting purse and current purse for{' '}
            <strong className="text-text">all {teams.length} teams</strong> in this season to the specified uniform value. Every change will be recorded in the audit ledger.
          </p>

          <form onSubmit={handleGlobalReset} className="flex flex-col gap-4 text-xs">
            <div>
              <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                Uniform Purse Points *
              </label>
              <input
                type="number"
                min={0}
                value={globalStartingAmount}
                onChange={(e) => setGlobalStartingAmount(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs font-mono tabular-nums text-text focus:outline-none focus:border-accent-bright"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsResetModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting || !globalStartingAmount}
                isLoading={isSubmitting}
              >
                Apply Global Reset
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      {/* Team Transaction History Dialog */}
      <Dialog
        isOpen={!!historyTeam}
        onClose={() => setHistoryTeam(null)}
        title={historyTeam ? `Purse History · ${historyTeam.name}` : 'Purse History'}
        description="Audit Ledger"
        size="lg"
      >
        <div className="space-y-4">
          {teamTransactions.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted border border-dashed border-border rounded-xl">
              No recorded transactions for this franchise yet.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border max-h-80 overflow-y-auto">
              {teamTransactions.map((tx) => (
                <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono uppercase text-[10px] font-semibold ${
                          tx.type === 'deduct'
                            ? 'text-error'
                            : tx.type === 'add'
                            ? 'text-accent-bright'
                            : 'text-muted'
                        }`}
                      >
                        {tx.type}
                      </span>
                      <span>·</span>
                      <span className="font-medium text-text">{tx.reason || 'Ledger adjustment'}</span>
                    </div>
                    <span className="text-[10px] font-mono text-muted mt-0.5 block">
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

          <div className="pt-3 border-t border-border flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setHistoryTeam(null)}
            >
              Close History
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
