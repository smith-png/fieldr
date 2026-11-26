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
import { Button, Dialog, EmptyState } from '../../components/ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_DIALOG_CLASS,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_TABLE_SHELL,
  ADMIN_WELL
} from '../../components/admin/adminStyles'

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
  const safeTeams = Array.isArray(teams) ? teams : []
  const safeTransactions = Array.isArray(transactions) ? transactions : []

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
        `Purse updated for "${selectedTeam.name}". New Balance: ${Number(res?.newBalance ?? 0).toLocaleString()} PTS`
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
    ? safeTransactions.filter((tx) => tx?.team_id === historyTeam.id)
    : []

  return (
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <h2 className={ADMIN_CARD_TITLE}>Purses &amp; Balances</h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={ArrowsClockwise}
          onClick={() => setIsResetModalOpen(true)}
          className="rounded-full self-start sm:self-auto"
        >
          Reset All Purses
        </Button>
      </div>

      {/* Purses Table */}
      {safeTeams.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No teams available"
          description="Register franchise teams before allocating purse points."
        />
      ) : (
        <div className={ADMIN_TABLE_SHELL}>
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full min-w-[700px] text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-muted font-mono uppercase tracking-wider bg-surface-2 text-[11px]">
                  <th className="py-3.5 px-4 font-normal whitespace-nowrap">Team</th>
                  <th className="py-3.5 px-4 font-normal whitespace-nowrap">Sport</th>
                  <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">
                    Starting Purse
                  </th>
                  <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">
                    Current Balance
                  </th>
                  <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">
                    Purse Controls
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {safeTeams.map((team) => (
                  <tr key={team.id} className="hover:bg-surface-2/50 transition-colors">
                    {/* Team */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
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
                    <td className="py-3.5 px-4 text-text font-medium whitespace-nowrap">
                      {team.sport}
                    </td>

                    {/* Starting Purse */}
                    <td className="py-3.5 px-4 text-right font-mono text-xs sm:text-sm tabular-nums text-muted whitespace-nowrap">
                      {Number(team?.starting_purse ?? 0).toLocaleString()} PTS
                    </td>

                    {/* Current Balance */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span className="font-mono font-bold text-sm text-points tabular-nums">
                        {Number(team?.current_purse ?? 0).toLocaleString()} PTS
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          leftIcon={Plus}
                          onClick={() => openTxModal(team, 'add')}
                          className="rounded-full text-accent-bright"
                        >
                          Add
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          leftIcon={Minus}
                          onClick={() => openTxModal(team, 'deduct')}
                          className="rounded-full text-error"
                        >
                          Deduct
                        </Button>

                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          leftIcon={PencilSimple}
                          onClick={() => openTxModal(team, 'set')}
                          className="rounded-full"
                        >
                          Set
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryTeam(team)}
                          className="rounded-full"
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
        size="md"
        className={ADMIN_DIALOG_CLASS}
      >
        {selectedTeam && (
          <div className="space-y-4">
            <div className={`${ADMIN_WELL} p-4 flex items-center justify-between text-xs`}>
              <span className="text-muted">Current Balance</span>
              <span className="font-mono font-bold text-sm text-points tabular-nums">
                {Number(selectedTeam?.current_purse ?? 0).toLocaleString()} PTS
              </span>
            </div>

            <form onSubmit={handleExecuteTransaction} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className={ADMIN_LABEL}>
                    {txType === 'set' ? 'New Target Balance *' : 'Amount *'}
                  </label>
                  <span className="text-xs font-mono text-muted">PTS</span>
                </div>
                <input
                  type="number"
                  min={0}
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  placeholder="150"
                  required
                  className={`${ADMIN_INPUT} font-mono tabular-nums`}
                />
              </div>

              <div className="space-y-1.5">
                <label className={ADMIN_LABEL}>Reason</label>
                <input
                  type="text"
                  value={txReason}
                  onChange={(e) => setTxReason(e.target.value)}
                  placeholder="Optional note"
                  className={ADMIN_INPUT}
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedTeam(null)}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting || !txAmount}
                  isLoading={isSubmitting}
                  className="rounded-full px-4"
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
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            Resets starting and current purse for{' '}
            <strong className="text-text">all {safeTeams.length} teams</strong> in this season. Every
            change is logged.
          </p>

          <form onSubmit={handleGlobalReset} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className={ADMIN_LABEL}>Uniform Purse *</label>
                <span className="text-xs font-mono text-muted">PTS</span>
              </div>
              <input
                type="number"
                min={0}
                value={globalStartingAmount}
                onChange={(e) => setGlobalStartingAmount(e.target.value)}
                required
                className={`${ADMIN_INPUT} font-mono tabular-nums`}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsResetModalOpen(false)}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isSubmitting || !globalStartingAmount}
                isLoading={isSubmitting}
                className="rounded-full px-4"
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
        size="lg"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="space-y-4">
          {teamTransactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted border border-dashed border-border rounded-2xl">
              No recorded transactions for this franchise yet.
            </div>
          ) : (
            <div className={`${ADMIN_TABLE_SHELL} divide-y divide-border max-h-80 overflow-y-auto thin-scrollbar`}>
              {teamTransactions.map((tx) => {
                const isDebit = tx.type === 'deduct' || tx.type === 'purchase'
                const isCredit = tx.type === 'add' || tx.type === 'refund'
                return (
                  <div
                    key={tx.id}
                    className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full border font-mono uppercase text-[10px] font-medium ${
                            isDebit
                              ? 'bg-error/10 border-error/25 text-error'
                              : isCredit
                              ? 'bg-accent/10 border-accent-bright/30 text-accent-bright'
                              : 'bg-surface-2 border-border text-muted'
                          }`}
                        >
                          {tx.type}
                        </span>
                        <span className="font-medium text-text truncate">
                          {tx.reason || 'Ledger adjustment'}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-muted mt-1 block">
                        {new Date(tx.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-semibold tabular-nums text-text text-sm block">
                        {isDebit ? '-' : '+'}
                        {Math.abs(Number(tx?.amount ?? 0)).toLocaleString()} PTS
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-points">
                        Bal: {Number(tx?.balance_after ?? 0).toLocaleString()} PTS
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="pt-4 border-t border-border flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setHistoryTeam(null)}
              className="rounded-full"
            >
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  )
}
