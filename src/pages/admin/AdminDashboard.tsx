import React, { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  ArrowsLeftRight,
  CircleNotch,
  Coins,
  EyeSlash,
  Megaphone,
  PaperPlaneTilt,
  ShieldCheck,
  Television,
  Users
} from '@phosphor-icons/react'
import { Button, EmptyState } from '../../components/ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_PAGE_HEADER,
  ADMIN_PAGE_TITLE,
  ADMIN_PAGE_WRAPPER,
  ADMIN_TABLE_SHELL,
  ADMIN_TEXTAREA,
  ADMIN_WELL
} from '../../components/admin/adminStyles'
import { supabase } from '../../lib/data/client'
import { useToast } from '../../lib/ToastContext'
import type { AdminTab, Player, PurseTransaction, Season, Team } from '../../types'

interface OwnerAnnouncementRow {
  id: string
  season_id: string
  message: string
  is_active: boolean
  created_at: string
}

const MAX_ANNOUNCEMENT_LENGTH = 200

function formatAnnouncementTime(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

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
  const toast = useToast()
  const totalPurse = teams.reduce((acc, t) => acc + (t.current_purse || 0), 0)
  const soldPlayers = players.filter((p) => p.status === 'sold')
  const availablePlayers = players.filter((p) => p.status === 'available')

  // Owner Announcements state
  const [announcementText, setAnnouncementText] = useState('')
  const [recentAnnouncements, setRecentAnnouncements] = useState<OwnerAnnouncementRow[]>([])
  const [isLoadingAnnouncements, setIsLoadingAnnouncements] = useState(false)
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false)
  const [hidingAnnouncementId, setHidingAnnouncementId] = useState<string | null>(null)

  const loadAnnouncements = useCallback(async () => {
    if (!supabase || !activeSeason?.id) {
      setRecentAnnouncements([])
      return
    }
    setIsLoadingAnnouncements(true)
    try {
      const { data, error } = await supabase
        .from('owner_announcements')
        .select('id, season_id, message, is_active, created_at')
        .eq('season_id', activeSeason.id)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) {
        console.error('Failed to load owner announcements:', error.message)
        return
      }

      setRecentAnnouncements((data as OwnerAnnouncementRow[]) || [])
    } catch (err) {
      console.error('Failed to load owner announcements:', err)
    } finally {
      setIsLoadingAnnouncements(false)
    }
  }, [activeSeason?.id])

  useEffect(() => {
    void loadAnnouncements()
  }, [loadAnnouncements])

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !activeSeason?.id || isSendingAnnouncement) return

    const trimmed = announcementText.trim()
    if (!trimmed) return
    if (trimmed.length > MAX_ANNOUNCEMENT_LENGTH) {
      toast.error(`Announcement must be ${MAX_ANNOUNCEMENT_LENGTH} characters or fewer.`)
      return
    }

    setIsSendingAnnouncement(true)
    try {
      const { error } = await supabase.from('owner_announcements').insert({
        season_id: activeSeason.id,
        message: trimmed,
        is_active: true
      })

      if (error) {
        toast.error(error.message || 'Could not send announcement.')
        return
      }

      setAnnouncementText('')
      toast.success('Announcement sent to owners.')
      await loadAnnouncements()
    } catch (err) {
      console.error('Failed to send announcement:', err)
      toast.error('Could not send announcement.')
    } finally {
      setIsSendingAnnouncement(false)
    }
  }

  const handleHideAnnouncement = async (announcementId: string) => {
    if (!supabase || !activeSeason?.id || hidingAnnouncementId) return

    setHidingAnnouncementId(announcementId)
    try {
      const { error } = await supabase
        .from('owner_announcements')
        .update({ is_active: false })
        .eq('id', announcementId)
        .eq('season_id', activeSeason.id)

      if (error) {
        toast.error(error.message || 'Could not hide announcement.')
        return
      }

      setRecentAnnouncements((prev) =>
        prev.map((item) =>
          item.id === announcementId ? { ...item, is_active: false } : item
        )
      )
      toast.success('Announcement hidden.')
    } catch (err) {
      console.error('Failed to hide announcement:', err)
      toast.error('Could not hide announcement.')
    } finally {
      setHidingAnnouncementId(null)
    }
  }

  const trimmedAnnouncement = announcementText.trim()
  const canSendAnnouncement =
    Boolean(supabase && activeSeason?.id) &&
    trimmedAnnouncement.length > 0 &&
    announcementText.length <= MAX_ANNOUNCEMENT_LENGTH &&
    !isSendingAnnouncement

  return (
    <div className={ADMIN_PAGE_WRAPPER}>
      <header className={ADMIN_PAGE_HEADER}>
        <h1 className={ADMIN_PAGE_TITLE}>
          {activeSeason?.name || 'Tournament Dashboard'}
        </h1>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={Television}
            onClick={() => onGoToTab('projector')}
            className="rounded-full px-5"
          >
            Switch Projector Scene
          </Button>
        </div>
      </header>

      {/* Top Two-Column Row: Season Overview & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Season Overview Stats Card */}
        <section className={ADMIN_CARD}>
          <div className={ADMIN_CARD_HEADER}>
            <h2 className={ADMIN_CARD_TITLE}>Overview</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Registered Teams */}
            <div className={`${ADMIN_WELL} p-5 flex flex-col justify-between gap-4`}>
              <div className="flex items-center justify-between gap-2 text-muted">
                <span className="text-sm font-medium text-muted">Registered Teams</span>
                <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} weight="regular" className="text-accent-bright" />
                </span>
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="font-syne font-bold text-3xl text-text tabular-nums">
                  {teams.length}
                </div>
                <button
                  type="button"
                  onClick={() => onGoToTab('teams')}
                  className="h-7 px-3 rounded-full bg-surface-2 border border-border text-xs font-medium text-accent-bright hover:border-accent-bright transition-colors cursor-pointer"
                >
                  View
                </button>
              </div>
            </div>

            {/* Player Pool */}
            <div className={`${ADMIN_WELL} p-5 flex flex-col justify-between gap-4`}>
              <div className="flex items-center justify-between gap-2 text-muted">
                <span className="text-sm font-medium text-muted">Player Pool</span>
                <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <Users size={18} weight="regular" className="text-accent-bright" />
                </span>
              </div>
              <div>
                <div className="font-syne font-bold text-3xl text-text tabular-nums">
                  {players.length}
                </div>
                <div className="text-xs text-muted mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="text-accent-bright font-medium tabular-nums">
                    {soldPlayers.length} drafted
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">{availablePlayers.length} available</span>
                </div>
              </div>
            </div>

            {/* Total Active Purse */}
            <div className={`${ADMIN_WELL} p-5 flex flex-col justify-between gap-4`}>
              <div className="flex items-center justify-between gap-2 text-muted">
                <span className="text-sm font-medium text-muted">Total Active Purse</span>
                <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <Coins size={18} weight="regular" className="text-points" />
                </span>
              </div>
              <div className="font-syne font-bold text-3xl text-points tabular-nums">
                {totalPurse.toLocaleString()}
              </div>
            </div>

            {/* Purse Transactions */}
            <div className={`${ADMIN_WELL} p-5 flex flex-col justify-between gap-4`}>
              <div className="flex items-center justify-between gap-2 text-muted">
                <span className="text-sm font-medium text-muted">Purse Transactions</span>
                <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <ArrowsLeftRight size={18} weight="regular" className="text-muted" />
                </span>
              </div>
              <div className="font-syne font-bold text-3xl text-text tabular-nums">
                {transactions.length}
              </div>
            </div>
          </div>
        </section>

        {/* Quick Actions Card */}
        <section className={ADMIN_CARD}>
          <div className={ADMIN_CARD_HEADER}>
            <h2 className={ADMIN_CARD_TITLE}>Quick Actions</h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={() => onGoToTab('players')}
              className={`${ADMIN_WELL} px-4 py-3.5 hover:border-accent-bright text-left transition-colors flex items-center justify-between gap-3 group cursor-pointer`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <Users size={18} weight="regular" className="text-accent-bright" />
                </span>
                <span className="text-sm font-medium text-text group-hover:text-accent-bright transition-colors truncate">
                  Register New Player
                </span>
              </div>
              <ArrowRight size={16} weight="regular" className="text-muted group-hover:text-accent-bright shrink-0 transition-colors" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('teams')}
              className={`${ADMIN_WELL} px-4 py-3.5 hover:border-accent-bright text-left transition-colors flex items-center justify-between gap-3 group cursor-pointer`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} weight="regular" className="text-accent-bright" />
                </span>
                <span className="text-sm font-medium text-text group-hover:text-accent-bright transition-colors truncate">
                  Create New Franchise Team
                </span>
              </div>
              <ArrowRight size={16} weight="regular" className="text-muted group-hover:text-accent-bright shrink-0 transition-colors" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('purses')}
              className={`${ADMIN_WELL} px-4 py-3.5 hover:border-accent-bright text-left transition-colors flex items-center justify-between gap-3 group cursor-pointer`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <Coins size={18} weight="regular" className="text-points" />
                </span>
                <span className="text-sm font-medium text-text group-hover:text-accent-bright transition-colors truncate">
                  Reset Starting Purses
                </span>
              </div>
              <ArrowRight size={16} weight="regular" className="text-muted group-hover:text-accent-bright shrink-0 transition-colors" />
            </button>

            <button
              type="button"
              onClick={() => onGoToTab('projector')}
              className={`${ADMIN_WELL} px-4 py-3.5 hover:border-accent-bright text-left transition-colors flex items-center justify-between gap-3 group cursor-pointer`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <Television size={18} weight="regular" className="text-accent-bright" />
                </span>
                <span className="text-sm font-medium text-text group-hover:text-accent-bright transition-colors truncate">
                  Broadcast Player Spotlight
                </span>
              </div>
              <ArrowRight size={16} weight="regular" className="text-muted group-hover:text-accent-bright shrink-0 transition-colors" />
            </button>
          </div>
        </section>
      </div>

      {/* Owner Announcements Card */}
      <section className={ADMIN_CARD}>
        <div className={ADMIN_CARD_HEADER}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
              <Megaphone size={18} weight="regular" className="text-accent-bright" />
            </span>
            <div className="min-w-0">
              <h2 className={ADMIN_CARD_TITLE}>Owner announcements</h2>
              <p className="text-xs text-muted mt-0.5">
                Broadcast a live banner update to team owners in this season.
              </p>
            </div>
          </div>
          <span className={ADMIN_COUNT_PILL}>{recentAnnouncements.length}</span>
        </div>

        <form onSubmit={handleSendAnnouncement} className="space-y-3">
          <div>
            <label htmlFor="owner-announcement-input" className="sr-only">
              Announcement message
            </label>
            <textarea
              id="owner-announcement-input"
              rows={2}
              maxLength={MAX_ANNOUNCEMENT_LENGTH}
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              disabled={!supabase || !activeSeason?.id || isSendingAnnouncement}
              placeholder={
                activeSeason
                  ? 'Write a short update for team owners...'
                  : 'Select an active season to send announcements.'
              }
              className={ADMIN_TEXTAREA}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs tabular-nums text-muted">
              {announcementText.length} / {MAX_ANNOUNCEMENT_LENGTH}
            </span>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              leftIcon={PaperPlaneTilt}
              isLoading={isSendingAnnouncement}
              disabled={!canSendAnnouncement}
              className="rounded-full px-5"
            >
              Send
            </Button>
          </div>
        </form>

        <div className="pt-4 border-t border-border space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
              Recent announcements
            </span>
            {isLoadingAnnouncements && (
              <CircleNotch
                size={14}
                weight="regular"
                className="text-muted animate-spin motion-reduce:animate-none"
              />
            )}
          </div>

          {recentAnnouncements.length === 0 ? (
            <p className={`${ADMIN_WELL} px-4 py-4 text-xs text-muted text-center`}>
              No announcements sent for this season yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentAnnouncements.map((item) => {
                const isHiding = hidingAnnouncementId === item.id
                return (
                  <li
                    key={item.id}
                    className={`${ADMIN_WELL} px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      item.is_active ? '' : 'opacity-60'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm text-text break-words leading-snug">
                        {item.message}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-muted tabular-nums">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full border ${
                            item.is_active
                              ? 'bg-accent/10 border-accent-bright/30 text-accent-bright font-medium'
                              : 'bg-surface-2 border-border text-muted'
                          }`}
                        >
                          {item.is_active ? 'Active' : 'Hidden'}
                        </span>
                        <span>{formatAnnouncementTime(item.created_at)}</span>
                      </div>
                    </div>

                    {item.is_active && (
                      <button
                        type="button"
                        onClick={() => void handleHideAnnouncement(item.id)}
                        disabled={Boolean(hidingAnnouncementId)}
                        className="frost self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted hover:text-text hover:border-accent-bright/50 transition-colors disabled:opacity-45 cursor-pointer shrink-0"
                      >
                        {isHiding ? (
                          <CircleNotch
                            size={13}
                            weight="regular"
                            className="animate-spin motion-reduce:animate-none"
                          />
                        ) : (
                          <EyeSlash size={13} weight="regular" />
                        )}
                        <span>Hide</span>
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Recent Purse Activity Card */}
      <section className={ADMIN_CARD}>
        <div className={ADMIN_CARD_HEADER}>
          <h2 className={ADMIN_CARD_TITLE}>Recent Purse Activity</h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onGoToTab('purses')}
            className="rounded-full self-start sm:self-auto"
          >
            Manage purses
          </Button>
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No transactions recorded yet"
            description="Purse adjustments and player auction deductions for this season will appear here."
          />
        ) : (
          <div className={ADMIN_TABLE_SHELL}>
            <div className="overflow-x-auto thin-scrollbar">
              <table className="w-full min-w-[640px] text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Team</th>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Type</th>
                    <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">Amount</th>
                    <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">Balance</th>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {transactions.slice(0, 6).map((tx) => {
                    const team = teams.find((t) => t.id === tx.team_id)
                    const isDebit = tx.type === 'deduct' || tx.type === 'purchase'
                    const isCredit = tx.type === 'add' || tx.type === 'refund'
                    return (
                      <tr key={tx.id} className="hover:bg-surface-2/50 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-text whitespace-nowrap">
                          <span className="flex items-center gap-2.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-border"
                              style={{ backgroundColor: team?.color || 'var(--accent)' }}
                            />
                            <span>{team?.name || 'Team'}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full border font-mono uppercase text-[11px] ${
                              isDebit
                                ? 'bg-error/10 border-error/25 text-error font-medium'
                                : isCredit
                                ? 'bg-accent/10 border-accent-bright/30 text-accent-bright font-medium'
                                : 'bg-surface-2 border-border text-muted'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-text whitespace-nowrap">
                          {isDebit ? '-' : '+'}
                          {Math.abs(tx.amount).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-points font-semibold whitespace-nowrap">
                          {tx.balance_after.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 text-muted text-xs truncate max-w-xs">
                          {tx.reason || 'Manual ledger action'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
