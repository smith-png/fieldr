import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  ClockCounterClockwise,
  DownloadSimple,
  MagnifyingGlass
} from '@phosphor-icons/react'
import type { ActivityLogEntry, Season, Team } from '../../types'
import { getAdminActivityLog } from '../../lib/data'
import {
  getCachedQuery,
  isQueryFresh,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import { useToast } from '../../lib/ToastContext'
import { Button, EmptyState, SkeletonTableRow } from '../../components/ui'
import {
  ADMIN_CARD,
  ADMIN_INPUT,
  ADMIN_PAGE_HEADER,
  ADMIN_PAGE_TITLE,
  ADMIN_PAGE_WRAPPER,
  ADMIN_PILL_BAR,
  ADMIN_PILL_BAR_OUTER,
  ADMIN_SELECT,
  ADMIN_TABLE_SHELL
} from '../../components/admin/adminStyles'

interface AdminLogsProps {
  activeSeason: Season | null
  teams: Team[]
}

type LogFilterType = 'all' | 'bids' | 'sales' | 'reversals' | 'purse'

const LOG_PAGE_SIZE = 1000

const TYPE_FILTER_OPTIONS: readonly { value: LogFilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'bids', label: 'Bids' },
  { value: 'sales', label: 'Sales' },
  { value: 'reversals', label: 'Reversals' },
  { value: 'purse', label: 'Purse' }
]

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
] as const

function formatLocalLogTime(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return '—'

  const day = date.getDate()
  const month = MONTHS_SHORT[date.getMonth()]
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day} ${month} ${year}, ${hours}:${minutes}`
}

function matchesLogTypeFilter(action: string, filterType: LogFilterType): boolean {
  if (filterType === 'all') return true
  const norm = (action || '').trim().toLowerCase()

  if (filterType === 'bids') {
    return norm === 'bid placed' || norm === 'bid cleared' || norm.startsWith('bid')
  }
  if (filterType === 'sales') {
    return norm === 'sold'
  }
  if (filterType === 'reversals') {
    return norm === 'sale reversed' || norm.includes('revers')
  }
  if (filterType === 'purse') {
    return norm.startsWith('purse')
  }
  return true
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function getLocalDateSlug(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export const AdminLogs: React.FC<AdminLogsProps> = ({ activeSeason, teams }) => {
  const { error } = useToast()

  const cacheKey = activeSeason?.id ? `admin:logs:${activeSeason.id}` : ''
  const cachedLogs = cacheKey ? getCachedQuery<ActivityLogEntry[]>(cacheKey) : null

  const [entries, setEntries] = useState<ActivityLogEntry[]>(
    () => cachedLogs?.data || []
  )
  const [isLoading, setIsLoading] = useState<boolean>(
    () => Boolean(activeSeason?.id && !cachedLogs)
  )
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)
  const [hasMore, setHasMore] = useState<boolean>(
    () => (cachedLogs?.data.length || 0) === LOG_PAGE_SIZE
  )

  // Client-side filters
  const [typeFilter, setTypeFilter] = useState<LogFilterType>('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [playerSearch, setPlayerSearch] = useState<string>('')

  const loadInitialLogs = useCallback(
    async (options?: { force?: boolean }) => {
      if (!activeSeason?.id) {
        setEntries([])
        setHasMore(false)
        setIsLoading(false)
        return
      }

      const key = `admin:logs:${activeSeason.id}`
      const cached = getCachedQuery<ActivityLogEntry[]>(key)
      if (cached && !options?.force) {
        setEntries(cached.data)
        setHasMore(cached.data.length === LOG_PAGE_SIZE)
        setIsLoading(false)
        if (isQueryFresh(key) && !shouldRevalidateQuery(key)) {
          return
        }
      }

      try {
        if (!cached) {
          setIsLoading(true)
        }
        const rows = await getAdminActivityLog(activeSeason.id, LOG_PAGE_SIZE, 0)
        setEntries(rows)
        setHasMore(rows.length === LOG_PAGE_SIZE)
        setCachedQuery(key, rows)
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load activity log'
        error(msg)
      } finally {
        setIsLoading(false)
      }
    },
    [activeSeason?.id, error]
  )

  useEffect(() => {
    setTeamFilter('all')
    void loadInitialLogs()
  }, [activeSeason?.id, loadInitialLogs])

  const handleLoadMore = async () => {
    if (!activeSeason?.id || isLoadingMore || isLoading) return

    try {
      setIsLoadingMore(true)
      const nextOffset = entries.length
      const nextBatch = await getAdminActivityLog(
        activeSeason.id,
        LOG_PAGE_SIZE,
        nextOffset
      )
      setEntries((prev) => {
        const merged = [...prev, ...nextBatch]
        merged.sort(
          (a, b) =>
            new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
        )
        return merged
      })
      setHasMore(nextBatch.length === LOG_PAGE_SIZE)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load more activity entries'
      error(msg)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const sortedTeams = useMemo(
    () =>
      teams
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name) || a.sport.localeCompare(b.sport)),
    [teams]
  )

  const filteredEntries = useMemo(() => {
    const searchNorm = playerSearch.trim().toLowerCase()
    const teamNorm = teamFilter === 'all' ? null : teamFilter.trim().toLowerCase()

    return entries.filter((row) => {
      if (!matchesLogTypeFilter(row.action, typeFilter)) return false

      if (teamNorm) {
        const rowTeam = (row.team_name || '').trim().toLowerCase()
        if (rowTeam !== teamNorm) return false
      }

      if (searchNorm) {
        const rowPlayer = (row.player_name || '').toLowerCase()
        if (!rowPlayer.includes(searchNorm)) return false
      }

      return true
    })
  }, [entries, typeFilter, teamFilter, playerSearch])

  const handleDownloadCsv = () => {
    const headers = [
      'occurred_at',
      'action',
      'player_name',
      'team_name',
      'amount',
      'balance_after',
      'note',
      'actor'
    ]

    const lines = [
      headers.join(','),
      ...filteredEntries.map((row) =>
        [
          escapeCsvCell(row.occurred_at),
          escapeCsvCell(row.action),
          escapeCsvCell(row.player_name ?? ''),
          escapeCsvCell(row.team_name ?? ''),
          escapeCsvCell(row.amount ?? ''),
          escapeCsvCell(row.balance_after ?? ''),
          escapeCsvCell(row.note ?? ''),
          escapeCsvCell(row.actor ?? '')
        ].join(',')
      )
    ]

    const csvContent = lines.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const seasonSlug = (activeSeason?.name || 'season')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const filename = `fieldr-activity-log-${seasonSlug || 'season'}-${getLocalDateSlug()}.csv`

    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className={ADMIN_PAGE_WRAPPER}>
      {/* Page Header */}
      <header className={ADMIN_PAGE_HEADER}>
        <h1 className={ADMIN_PAGE_TITLE}>Activity Log</h1>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="md"
            leftIcon={ArrowsClockwise}
            disabled={isLoading || isLoadingMore || !activeSeason}
            onClick={() => void loadInitialLogs({ force: true })}
            className="rounded-full"
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={DownloadSimple}
            disabled={isLoading || filteredEntries.length === 0}
            onClick={handleDownloadCsv}
            className="rounded-full px-5"
          >
            Download CSV
          </Button>
        </div>
      </header>

      {/* Filters & Log Table Card */}
      <section className={ADMIN_CARD}>
        {/* Filters Bar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-border">
          {/* Type Filter — single horizontally scrollable row on mobile */}
          <div className={`${ADMIN_PILL_BAR_OUTER} xl:w-auto`}>
            <div
              role="radiogroup"
              aria-label="Filter by activity type"
              className={ADMIN_PILL_BAR}
            >
              {TYPE_FILTER_OPTIONS.map((opt) => {
                const isSelected = typeFilter === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setTypeFilter(opt.value)}
                    className={`min-h-[36px] px-4 py-1.5 rounded-full text-xs sm:text-sm font-sans whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
                      isSelected
                        ? 'bg-btn-bg text-btn-fg font-medium'
                        : 'text-muted hover:text-text font-normal'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Team Dropdown + Player Name Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 xl:max-w-xl xl:justify-end">
            <select
              id="log-team-filter"
              aria-label="Filter by team"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className={`${ADMIN_SELECT} sm:max-w-[220px]`}
            >
              <option value="all">All Teams</option>
              {sortedTeams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name} ({t.sport})
                </option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlass
                size={16}
                weight="regular"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search player name..."
                aria-label="Search player name"
                className={`${ADMIN_INPUT} pl-10`}
              />
            </div>
          </div>
        </div>

        {/* Table Shell */}
        {isLoading ? (
          <div className={ADMIN_TABLE_SHELL}>
            <div className="max-h-[600px] overflow-y-auto overflow-x-auto thin-scrollbar">
              <table className="w-full min-w-[780px] text-left border-collapse text-xs font-sans">
                <thead className="sticky top-0 z-10 bg-surface-2 border-b border-border text-muted uppercase tracking-wider text-[11px] font-mono">
                  <tr>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Time</th>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Action</th>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Player</th>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Team</th>
                    <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">
                      Amount
                    </th>
                    <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">
                      Balance
                    </th>
                    <th className="py-3.5 px-4 font-normal">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonTableRow key={i} columns={7} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={ClockCounterClockwise}
            title="No activity yet for this season"
            description="Auction bids, player sales, reversals, and purse adjustments will appear here."
          />
        ) : filteredEntries.length === 0 ? (
          <div className="py-14 px-6 text-center text-sm text-muted bg-bg border border-border rounded-2xl">
            No activity log entries match the selected filters.
          </div>
        ) : (
          <div className={ADMIN_TABLE_SHELL}>
            <div className="max-h-[600px] overflow-y-auto overflow-x-auto thin-scrollbar">
              <table className="w-full min-w-[780px] text-left border-collapse text-xs sm:text-sm font-sans">
                <thead className="sticky top-0 z-10 bg-surface-2 border-b border-border text-muted uppercase tracking-wider text-[11px] font-mono">
                  <tr>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Time</th>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Action</th>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Player</th>
                    <th className="py-3.5 px-4 font-normal whitespace-nowrap">Team</th>
                    <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">
                      Amount
                    </th>
                    <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">
                      Balance
                    </th>
                    <th className="py-3.5 px-4 font-normal">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredEntries.map((row, idx) => {
                    const hasPlayer = Boolean(row.player_name && row.player_name.trim())
                    const hasTeam = Boolean(row.team_name && row.team_name.trim())
                    const hasNote = Boolean(row.note && row.note.trim())
                    const hasAmount = row.amount !== null && row.amount !== undefined
                    const hasBalance =
                      row.balance_after !== null && row.balance_after !== undefined

                    return (
                      <tr
                        key={`${row.occurred_at}-${row.action}-${idx}`}
                        className="hover:bg-surface-2/50 transition-colors"
                      >
                        <td className="py-3.5 px-4 text-xs font-mono text-muted whitespace-nowrap">
                          {formatLocalLogTime(row.occurred_at)}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-text whitespace-nowrap">
                          {row.action || '—'}
                        </td>
                        <td className="py-3.5 px-4 text-text whitespace-nowrap">
                          {hasPlayer ? row.player_name : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-text whitespace-nowrap">
                          {hasTeam ? row.team_name : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-text whitespace-nowrap">
                          {hasAmount ? Number(row.amount).toLocaleString() : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-points whitespace-nowrap">
                          {hasBalance ? Number(row.balance_after).toLocaleString() : '—'}
                        </td>
                        <td
                          className="py-3.5 px-4 text-xs text-muted max-w-xs truncate"
                          title={hasNote ? row.note || undefined : undefined}
                        >
                          {hasNote ? row.note : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer for 1000-row pagination / Load More */}
            {hasMore && (
              <div className="px-4 py-3.5 border-t border-border bg-surface-2/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-xs text-muted">
                  {entries.length === LOG_PAGE_SIZE
                    ? 'Showing the latest 1000 entries'
                    : `Showing the latest ${entries.length.toLocaleString()} entries`}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  isLoading={isLoadingMore}
                  disabled={isLoadingMore}
                  onClick={() => void handleLoadMore()}
                  className="rounded-full"
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
