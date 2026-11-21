import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowsClockwise, SignOut, Trash } from '@phosphor-icons/react'
import { supabase } from '../../lib/data/client'
import {
  getCachedQuery,
  isQueryFresh,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog, SkeletonBlock, SkeletonTableRow } from '../../components/ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_DIALOG_CLASS,
  ADMIN_PAGE_HEADER,
  ADMIN_PAGE_TITLE,
  ADMIN_PAGE_WRAPPER,
  ADMIN_TABLE_SHELL
} from '../../components/admin/adminStyles'

interface AdminAccountRow {
  user_id: string
  login_id: string
  role: string
  team_id: string | null
  team_name: string | null
  created_at: string | null
  last_sign_in_at: string | null
}

interface AdminSessionRow {
  session_id: string
  user_agent: string | null
  created_at: string | null
  last_active_at: string | null
}

interface AccountsCachePayload {
  accounts: AdminAccountRow[]
  sessions: AdminSessionRow[]
}

const ACCOUNTS_CACHE_KEY = 'admin:accounts'

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

function formatLocalDateTime(isoString: string | null | undefined): string {
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

function parseUserAgentDevice(userAgent: string | null | undefined): string {
  const ua = (userAgent || '').trim()
  if (!ua) return 'Unknown device'

  let browser: string | null = null
  if (/\b(?:Edg|EdgA|EdgiOS|Edge)\//i.test(ua)) {
    browser = 'Edge'
  } else if (/\b(?:OPR|Opera)\//i.test(ua)) {
    browser = 'Opera'
  } else if (/\bSamsungBrowser\//i.test(ua)) {
    browser = 'Samsung Internet'
  } else if (/\b(?:Firefox|FxiOS)\//i.test(ua)) {
    browser = 'Firefox'
  } else if (/\b(?:Chrome|CriOS)\//i.test(ua)) {
    browser = 'Chrome'
  } else if (/\bSafari\//i.test(ua)) {
    browser = 'Safari'
  }

  let os: string | null = null
  if (/iPhone|iPad|iPod|CPU (?:iPhone )?OS/i.test(ua)) {
    os = 'iOS'
  } else if (/Android/i.test(ua)) {
    os = 'Android'
  } else if (/Windows/i.test(ua)) {
    os = 'Windows'
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS'
  } else if (/Mac OS X|Macintosh/i.test(ua)) {
    os = 'macOS'
  } else if (/Linux/i.test(ua)) {
    os = 'Linux'
  }

  if (browser && os) return `${browser}, ${os}`
  if (browser) return browser
  if (os) return os
  return 'Unknown device'
}

function getRoleSortRank(role: string): number {
  const normalized = (role || '').trim().toLowerCase()
  if (normalized === 'admin') return 0
  if (normalized === 'projector') return 1
  if (normalized === 'owner') return 2
  return 3
}

function formatRoleLabel(role: string): string {
  const normalized = (role || '').trim().toLowerCase()
  if (!normalized) return '—'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function getRoleBadgeClass(role: string): string {
  const normalized = (role || '').trim().toLowerCase()
  if (normalized === 'admin') {
    return 'bg-accent/15 border-accent-bright/30 text-accent-bright'
  }
  if (normalized === 'projector') {
    return 'bg-surface-2 border-border text-text'
  }
  return 'bg-surface-2 border-border text-muted'
}

function mapAccountRow(raw: Record<string, unknown>): AdminAccountRow {
  return {
    user_id: String(raw.user_id ?? ''),
    login_id: String(raw.login_id ?? ''),
    role: String(raw.role ?? ''),
    team_id: raw.team_id ? String(raw.team_id) : null,
    team_name: raw.team_name ? String(raw.team_name) : null,
    created_at: raw.created_at ? String(raw.created_at) : null,
    last_sign_in_at: raw.last_sign_in_at ? String(raw.last_sign_in_at) : null
  }
}

function mapSessionRow(raw: Record<string, unknown>): AdminSessionRow {
  return {
    session_id: String(raw.session_id ?? ''),
    user_agent: raw.user_agent ? String(raw.user_agent) : null,
    created_at: raw.created_at ? String(raw.created_at) : null,
    last_active_at: raw.last_active_at ? String(raw.last_active_at) : null
  }
}

function decodeJwtSessionId(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    const payload = JSON.parse(decoded) as Record<string, unknown>
    const sessionId = payload.session_id
    return typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null
  } catch {
    return null
  }
}

export const AdminAccounts: React.FC = () => {
  const { success, error: showError } = useToast()

  const cached = getCachedQuery<AccountsCachePayload>(ACCOUNTS_CACHE_KEY)

  const [accounts, setAccounts] = useState<AdminAccountRow[]>(() => cached?.data.accounts || [])
  const [sessions, setSessions] = useState<AdminSessionRow[]>(() => cached?.data.sessions || [])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(() => !cached)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)

  const [accountToDelete, setAccountToDelete] = useState<AdminAccountRow | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [isSignOutOthersOpen, setIsSignOutOthersOpen] = useState<boolean>(false)
  const [isSigningOutOthers, setIsSigningOutOthers] = useState<boolean>(false)

  const resolveCurrentSessionId = useCallback(async () => {
    if (!supabase) return
    try {
      const { data } = await supabase.auth.getSession()
      setCurrentSessionId(decodeJwtSessionId(data.session?.access_token))
    } catch {
      // Leave currentSessionId unchanged on transient read failure
    }
  }, [])

  const loadData = useCallback(
    async (options?: { force?: boolean }) => {
      const existingCache = getCachedQuery<AccountsCachePayload>(ACCOUNTS_CACHE_KEY)
      if (existingCache && !options?.force) {
        setAccounts(existingCache.data.accounts)
        setSessions(existingCache.data.sessions)
        setIsLoading(false)
        if (isQueryFresh(ACCOUNTS_CACHE_KEY) && !shouldRevalidateQuery(ACCOUNTS_CACHE_KEY)) {
          return
        }
      }

      if (!supabase) {
        setIsLoading(false)
        setIsRefreshing(false)
        showError('Accounts service is unavailable.')
        return
      }

      try {
        if (existingCache) {
          setIsRefreshing(true)
        } else {
          setIsLoading(true)
        }

        const [accountsRes, sessionsRes, sessionRes] = await Promise.all([
          supabase.rpc('admin_list_accounts'),
          supabase.rpc('admin_list_admin_sessions'),
          supabase.auth.getSession()
        ])

        setCurrentSessionId(decodeJwtSessionId(sessionRes.data.session?.access_token))

        let nextAccounts = existingCache?.data.accounts || []
        let nextSessions = existingCache?.data.sessions || []

        if (accountsRes.error) {
          showError(accountsRes.error.message || 'Failed to load accounts')
        } else {
          nextAccounts = Array.isArray(accountsRes.data)
            ? (accountsRes.data as Array<Record<string, unknown>>).map(mapAccountRow)
            : []
          setAccounts(nextAccounts)
        }

        if (sessionsRes.error) {
          showError(sessionsRes.error.message || 'Failed to load admin sessions')
        } else {
          nextSessions = Array.isArray(sessionsRes.data)
            ? (sessionsRes.data as Array<Record<string, unknown>>).map(mapSessionRow)
            : []
          setSessions(nextSessions)
        }

        if (!accountsRes.error && !sessionsRes.error) {
          setCachedQuery<AccountsCachePayload>(ACCOUNTS_CACHE_KEY, {
            accounts: nextAccounts,
            sessions: nextSessions
          })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load accounts'
        showError(msg)
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [showError]
  )

  useEffect(() => {
    void resolveCurrentSessionId()
    void loadData()
  }, [loadData, resolveCurrentSessionId])

  const sortedAccounts = useMemo(() => {
    return accounts.slice().sort((a, b) => {
      const rankDiff = getRoleSortRank(a.role) - getRoleSortRank(b.role)
      if (rankDiff !== 0) return rankDiff
      return a.login_id.localeCompare(b.login_id, undefined, { sensitivity: 'base' })
    })
  }, [accounts])

  const normalizedCurrentSessionId = currentSessionId
    ? currentSessionId.trim().toLowerCase()
    : null

  const sortedSessions = useMemo(() => {
    return sessions.slice().sort((a, b) => {
      if (normalizedCurrentSessionId) {
        const aIsCurrent = a.session_id.trim().toLowerCase() === normalizedCurrentSessionId
        const bIsCurrent = b.session_id.trim().toLowerCase() === normalizedCurrentSessionId
        if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1
      }
      const aTime = new Date(a.last_active_at || a.created_at || 0).getTime()
      const bTime = new Date(b.last_active_at || b.created_at || 0).getTime()
      return bTime - aTime
    })
  }, [sessions, normalizedCurrentSessionId])

  const handleConfirmSignOutOthers = async () => {
    if (isSigningOutOthers) return

    if (!supabase) {
      showError('Accounts service is unavailable.')
      return
    }

    try {
      setIsSigningOutOthers(true)
      const { error } = await supabase.auth.signOut({ scope: 'others' })

      if (error) {
        showError(error.message || 'Failed to sign out other sessions')
        return
      }

      setIsSignOutOthersOpen(false)
      await loadData({ force: true })
      success('Signed out all other sessions')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to sign out other sessions'
      showError(msg)
    } finally {
      setIsSigningOutOthers(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!accountToDelete || isDeleting) return

    if (!supabase) {
      showError('Accounts service is unavailable.')
      return
    }

    try {
      setIsDeleting(true)
      const target = accountToDelete

      const { error } = await supabase.rpc('admin_delete_account', {
        p_user_id: target.user_id
      })

      if (error) {
        showError(error.message || 'Failed to delete account')
        return
      }

      setAccountToDelete(null)
      success(`Deleted ${target.login_id}`)
      await loadData({ force: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete account'
      showError(msg)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className={ADMIN_PAGE_WRAPPER}>
      {/* Page Header */}
      <header className={ADMIN_PAGE_HEADER}>
        <h1 className={ADMIN_PAGE_TITLE}>Accounts</h1>

        <Button
          type="button"
          variant="secondary"
          size="md"
          leftIcon={ArrowsClockwise}
          isLoading={isRefreshing}
          disabled={isLoading || isRefreshing}
          onClick={() => void loadData({ force: true })}
          className="rounded-full self-start sm:self-auto"
        >
          Refresh
        </Button>
      </header>

      {/* Admin Sessions Card */}
      <section aria-label="Admin sessions" className={ADMIN_CARD}>
        <div className={ADMIN_CARD_HEADER}>
          <div className="flex items-center gap-3 min-w-0">
            <h2 className={ADMIN_CARD_TITLE}>Admin Sessions</h2>
            {isLoading ? (
              <SkeletonBlock className="h-7 w-10 rounded-full" />
            ) : (
              <span className={ADMIN_COUNT_PILL}>{sortedSessions.length}</span>
            )}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="md"
            leftIcon={SignOut}
            disabled={isLoading || isSigningOutOthers || sortedSessions.length <= 1}
            onClick={() => setIsSignOutOthersOpen(true)}
            className="rounded-full self-start sm:self-auto"
          >
            Sign out other sessions
          </Button>
        </div>

        <div className={ADMIN_TABLE_SHELL}>
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="px-5 py-4 flex items-center justify-between gap-4">
                  <SkeletonBlock className="h-4 w-36 rounded-full" />
                  <SkeletonBlock className="h-4 w-28 rounded-full" />
                </div>
              ))}
            </div>
          ) : sortedSessions.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted text-center">No active sessions</div>
          ) : (
            <ul className="divide-y divide-border">
              {sortedSessions.map((session) => {
                const isCurrent =
                  Boolean(normalizedCurrentSessionId) &&
                  session.session_id.trim().toLowerCase() === normalizedCurrentSessionId

                return (
                  <li
                    key={session.session_id}
                    className="px-5 py-4 flex items-center justify-between gap-4 text-sm hover:bg-surface-2/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="font-medium text-text truncate">
                        {parseUserAgentDevice(session.user_agent)}
                      </span>
                      {isCurrent && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-mono uppercase tracking-wider bg-accent/15 border-accent-bright/30 text-accent-bright shrink-0">
                          This device
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-mono tabular-nums text-muted shrink-0">
                      {formatLocalDateTime(session.last_active_at || session.created_at)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Accounts List Card */}
      <section aria-label="Accounts list" className={ADMIN_CARD}>
        <div className={ADMIN_CARD_HEADER}>
          <h2 className={ADMIN_CARD_TITLE}>Accounts</h2>
          {isLoading ? (
            <SkeletonBlock className="h-7 w-10 rounded-full" />
          ) : (
            <span className={ADMIN_COUNT_PILL}>{sortedAccounts.length}</span>
          )}
        </div>

        {/* Desktop Table */}
        <div className={`hidden md:block ${ADMIN_TABLE_SHELL}`}>
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full min-w-[720px] text-left border-collapse text-sm font-sans">
              <thead className="bg-surface-2 border-b border-border text-muted uppercase tracking-wider text-[11px] font-mono">
                <tr>
                  <th className="py-3.5 px-5 font-normal whitespace-nowrap">Login ID</th>
                  <th className="py-3.5 px-4 font-normal whitespace-nowrap">Role</th>
                  <th className="py-3.5 px-4 font-normal whitespace-nowrap">Team</th>
                  <th className="py-3.5 px-4 font-normal whitespace-nowrap">Created</th>
                  <th className="py-3.5 px-4 font-normal whitespace-nowrap">Last sign-in</th>
                  <th className="py-3.5 px-5 font-normal text-right whitespace-nowrap">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonTableRow key={i} columns={6} />
                  ))
                ) : sortedAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 px-5 text-center text-sm text-muted">
                      No accounts
                    </td>
                  </tr>
                ) : (
                  sortedAccounts.map((account) => {
                    const isOwner = account.role.trim().toLowerCase() === 'owner'
                    const teamName = (account.team_name || '').trim()
                    const isUnlinkedOwner = isOwner && !account.team_id && !teamName

                    return (
                      <tr
                        key={account.user_id}
                        className="hover:bg-surface-2/50 transition-colors"
                      >
                        <td className="py-3.5 px-5 font-mono text-xs sm:text-sm font-medium text-text whitespace-nowrap">
                          {account.login_id}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-mono uppercase tracking-wider ${getRoleBadgeClass(
                              account.role
                            )}`}
                          >
                            {formatRoleLabel(account.role)}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-text whitespace-nowrap">
                          {teamName ? (
                            <span>{teamName}</span>
                          ) : isUnlinkedOwner ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-points/10 border border-points/25 text-points text-[11px] font-mono whitespace-nowrap">
                              No team
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-muted whitespace-nowrap">
                          {formatLocalDateTime(account.created_at)}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-muted whitespace-nowrap">
                          {formatLocalDateTime(account.last_sign_in_at)}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          {isOwner && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              leftIcon={Trash}
                              onClick={() => setAccountToDelete(account)}
                              className="rounded-full text-error hover:text-error hover:bg-error/10"
                            >
                              Delete
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Cards */}
        <div className={`md:hidden ${ADMIN_TABLE_SHELL} divide-y divide-border`}>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <SkeletonBlock className="h-4 w-32 rounded-full" />
                  <SkeletonBlock className="h-5 w-16 rounded-full" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <SkeletonBlock className="h-3.5 w-24 rounded-full" />
                  <SkeletonBlock className="h-3.5 w-28 rounded-full" />
                </div>
              </div>
            ))
          ) : sortedAccounts.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">No accounts</div>
          ) : (
            sortedAccounts.map((account) => {
              const isOwner = account.role.trim().toLowerCase() === 'owner'
              const teamName = (account.team_name || '').trim()
              const isUnlinkedOwner = isOwner && !account.team_id && !teamName

              return (
                <div key={account.user_id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-sm font-medium text-text truncate">
                        {account.login_id}
                      </span>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-wider shrink-0 ${getRoleBadgeClass(
                          account.role
                        )}`}
                      >
                        {formatRoleLabel(account.role)}
                      </span>
                    </div>

                    {isOwner && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={Trash}
                        onClick={() => setAccountToDelete(account)}
                        className="rounded-full text-error hover:text-error hover:bg-error/10 shrink-0"
                      >
                        Delete
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="col-span-2 flex items-center justify-between gap-2">
                      <span className="text-muted">Team</span>
                      {teamName ? (
                        <span className="text-text font-medium truncate">{teamName}</span>
                      ) : isUnlinkedOwner ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-points/10 border border-points/25 text-points text-[11px] font-mono whitespace-nowrap">
                          No team
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted">Created</span>
                      <span className="font-mono tabular-nums text-muted">
                        {formatLocalDateTime(account.created_at)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-0.5 text-right">
                      <span className="text-muted">Last sign-in</span>
                      <span className="font-mono tabular-nums text-muted">
                        {formatLocalDateTime(account.last_sign_in_at)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* Frosted Sign Out Other Sessions Confirm Dialog */}
      <Dialog
        isOpen={isSignOutOthersOpen}
        onClose={() => {
          if (!isSigningOutOthers) setIsSignOutOthersOpen(false)
        }}
        title="Sign out other sessions"
        size="sm"
        frosted={true}
        className={ADMIN_DIALOG_CLASS}
      >
        <p className="text-sm text-text">
          Sign out all other sessions? This device stays signed in.
        </p>

        <div className="mt-6 pt-4 border-t border-border flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isSigningOutOthers}
            onClick={() => setIsSignOutOthersOpen(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isSigningOutOthers}
            disabled={isSigningOutOthers}
            onClick={() => void handleConfirmSignOutOthers()}
            className="rounded-full px-4"
          >
            Confirm
          </Button>
        </div>
      </Dialog>

      {/* Frosted Delete Confirm Dialog */}
      <Dialog
        isOpen={Boolean(accountToDelete)}
        onClose={() => {
          if (!isDeleting) setAccountToDelete(null)
        }}
        title="Delete account"
        size="sm"
        frosted={true}
        className={ADMIN_DIALOG_CLASS}
      >
        <p className="text-sm text-text">
          Delete{' '}
          <span className="font-mono font-semibold text-text">
            {accountToDelete?.login_id}
          </span>
          ?
        </p>

        <div className="mt-6 pt-4 border-t border-border flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isDeleting}
            onClick={() => setAccountToDelete(null)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            isLoading={isDeleting}
            disabled={isDeleting}
            onClick={() => void handleConfirmDelete()}
            className="rounded-full px-4"
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
