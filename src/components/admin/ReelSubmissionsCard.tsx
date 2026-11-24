import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowSquareOut,
  CaretDown,
  DownloadSimple,
  FilmSlate,
  MagnifyingGlass,
  Trash,
  WarningCircle
} from '@phosphor-icons/react'
import {
  deleteReelSubmissions,
  listReelSubmissions,
  reelSubmissionsToCsv,
  updateReelSubmission
} from '../../lib/data'
import { getAcademicYearLabel } from '../../lib/academicYears'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { Button, Dialog, EmptyState, Pagination, SkeletonBlock } from '../ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_DIALOG_CLASS,
  ADMIN_ICON_BTN,
  ADMIN_ICON_BTN_DANGER,
  ADMIN_INPUT,
  ADMIN_PILL_BAR,
  ADMIN_PILL_BAR_OUTER,
  ADMIN_TEXTAREA,
  ADMIN_WELL
} from './adminStyles'
import type { ReelSubmission, ReelSubmissionStatus } from '../../types'

type StatusFilter = 'all' | ReelSubmissionStatus

const PAGE_SIZE = 15

const STATUS_PILL: Record<ReelSubmissionStatus, string> = {
  pending: 'bg-surface-2 border-border text-muted',
  approved: 'bg-surface border-accent-bright text-accent-bright',
  rejected: 'bg-error/10 border-error/40 text-error'
}

const STATUS_LABEL: Record<ReelSubmissionStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected'
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

type ClearAction = { kind: 'delete-one'; row: ReelSubmission } | { kind: 'rejected' } | { kind: 'all' }

export const ReelSubmissionsCard: React.FC = () => {
  const { showToast } = useToast()

  const [rows, setRows] = useState<ReelSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [clearAction, setClearAction] = useState<ClearAction | null>(null)
  const [isClearing, setIsClearing] = useState(false)

  const load = useCallback(async () => {
    try {
      setIsLoading(true)
      setLoadError(null)
      setRows(await listReelSubmissions())
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err, 'Could not load submissions.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, approved: 0, rejected: 0 }
    for (const r of rows) c[r.status] += 1
    return c
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!q) return true
      return (
        r.full_name.toLowerCase().includes(q) ||
        r.roll_no.includes(q) ||
        r.reel_title.toLowerCase().includes(q) ||
        r.team_name.toLowerCase().includes(q)
      )
    })
  }, [rows, filter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const replaceRow = (next: ReelSubmission) =>
    setRows((prev) => prev.map((r) => (r.id === next.id ? next : r)))

  const setStatus = async (row: ReelSubmission, status: ReelSubmissionStatus) => {
    if (busyId || row.status === status) return
    try {
      setBusyId(row.id)
      replaceRow(await updateReelSubmission(row.id, { status }))
      showToast(`Marked ${STATUS_LABEL[status].toLowerCase()}`, 'success')
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Could not update the entry'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const saveNote = async (row: ReelSubmission) => {
    const note = (noteDrafts[row.id] ?? row.admin_note).trim()
    if (busyId || note === row.admin_note) return
    try {
      setBusyId(row.id)
      replaceRow(await updateReelSubmission(row.id, { admin_note: note }))
      showToast('Note saved', 'success')
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Could not save the note'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const exportCsv = () => {
    if (filtered.length === 0) return
    const blob = new Blob(['\uFEFF', reelSubmissionsToCsv(filtered)], {
      type: 'text/csv;charset=utf-8'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reel-submissions-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const confirmClear = async () => {
    if (!clearAction || isClearing) return
    let ids: string[] = []
    if (clearAction.kind === 'delete-one') ids = [clearAction.row.id]
    else if (clearAction.kind === 'rejected') ids = rows.filter((r) => r.status === 'rejected').map((r) => r.id)
    else ids = rows.map((r) => r.id)
    try {
      setIsClearing(true)
      await deleteReelSubmissions(ids)
      const gone = new Set(ids)
      setRows((prev) => prev.filter((r) => !gone.has(r.id)))
      setClearAction(null)
      showToast(ids.length === 1 ? 'Entry deleted' : `${ids.length} entries deleted`, 'success')
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Could not delete entries'), 'error')
    } finally {
      setIsClearing(false)
    }
  }

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' }
  ]

  return (
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <div className="space-y-1">
          <h2 className={ADMIN_CARD_TITLE}>Reel submissions</h2>
          <p className="text-xs text-muted">
            Review links, approve the ones that follow the rules, and export the list.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={DownloadSimple}
            disabled={filtered.length === 0}
            onClick={exportCsv}
            className="rounded-full"
          >
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-12 bg-bg border border-border rounded-2xl" />
          <SkeletonBlock className="h-20 bg-bg border border-border rounded-2xl" />
          <SkeletonBlock className="h-20 bg-bg border border-border rounded-2xl" />
        </div>
      ) : loadError ? (
        <div className="p-3.5 rounded-2xl bg-error/10 border border-error/40 flex items-start gap-2.5 text-xs text-text">
          <WarningCircle size={16} weight="regular" className="text-error shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className={ADMIN_PILL_BAR_OUTER}>
              <div role="radiogroup" aria-label="Filter by status" className={ADMIN_PILL_BAR}>
                {filterOptions.map((opt) => {
                  const selected = filter === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setFilter(opt.value)
                        setPage(1)
                      }}
                      className={`min-h-[32px] px-3.5 py-1 rounded-full text-xs whitespace-nowrap shrink-0 inline-flex items-center gap-2 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-btn-bg text-btn-fg font-medium'
                          : 'text-muted hover:text-text font-normal'
                      }`}
                    >
                      <span>{opt.label}</span>
                      <span className="font-mono tabular-nums opacity-80">{counts[opt.value]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="relative w-full lg:w-72">
              <MagnifyingGlass
                size={15}
                weight="regular"
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                type="search"
                aria-label="Search submissions"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                placeholder="Name, roll, title or team"
                className={`${ADMIN_INPUT} pl-9`}
              />
            </div>
          </div>

          {pageRows.length === 0 ? (
            <EmptyState
              icon={FilmSlate}
              title={rows.length === 0 ? 'No submissions yet' : 'No entries match'}
              description={
                rows.length === 0
                  ? 'Entries appear here as soon as someone submits the form.'
                  : 'Try a different filter or search.'
              }
            />
          ) : (
            <ul className="space-y-3">
              {pageRows.map((row) => {
                const isExpanded = expandedId === row.id
                const isBusy = busyId === row.id
                return (
                  <li key={row.id} className={`${ADMIN_WELL} p-4 space-y-3 min-w-0`}>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="font-syne font-bold text-base text-text leading-snug break-words">
                          {row.reel_title}
                        </p>
                        <p className="text-xs text-muted break-words">
                          {row.participation === 'team' && row.team_name
                            ? `${row.team_name} (team of ${row.team_members.length + 1}), lead ${row.full_name}`
                            : row.full_name}{' '}
                          <span className="font-mono">Roll {row.roll_no}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-2 border border-border text-[11px] text-muted">
                          {row.category}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${STATUS_PILL[row.status]}`}
                        >
                          {STATUS_LABEL[row.status]}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isBusy || row.status === 'approved'}
                          onClick={() => void setStatus(row, 'approved')}
                          className="rounded-full"
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isBusy || row.status === 'rejected'}
                          onClick={() => void setStatus(row, 'rejected')}
                          className="rounded-full"
                        >
                          Reject
                        </Button>
                        {row.status !== 'pending' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => void setStatus(row, 'pending')}
                            className="rounded-full"
                          >
                            Back to pending
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted tabular-nums">
                          {formatWhen(row.created_at)}
                        </span>
                        <a
                          href={row.reel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open reel link for ${row.reel_title}`}
                          className={ADMIN_ICON_BTN}
                        >
                          <ArrowSquareOut size={15} weight="regular" />
                        </a>
                        <button
                          type="button"
                          aria-label={`Delete entry ${row.reel_title}`}
                          onClick={() => setClearAction({ kind: 'delete-one', row })}
                          className={ADMIN_ICON_BTN_DANGER}
                        >
                          <Trash size={15} weight="regular" />
                        </button>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? 'Hide details' : 'Show details'}
                          onClick={() => setExpandedId(isExpanded ? null : row.id)}
                          className={ADMIN_ICON_BTN}
                        >
                          <CaretDown
                            size={15}
                            weight="regular"
                            className={`transition-transform motion-reduce:transition-none ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="pt-3 border-t border-border space-y-3">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
                          <div>
                            <dt className="text-muted">Year</dt>
                            <dd className="text-text">{getAcademicYearLabel(row.academic_year)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">WhatsApp</dt>
                            <dd className="text-text font-mono">{row.whatsapp}</dd>
                          </div>
                          <div className="sm:col-span-2 min-w-0">
                            <dt className="text-muted">Reel link</dt>
                            <dd className="text-text font-mono break-all">{row.reel_url}</dd>
                          </div>
                          {row.team_members.length > 0 && (
                            <div className="sm:col-span-2">
                              <dt className="text-muted">Team members</dt>
                              <dd className="text-text">
                                {row.team_members.map((m) => `${m.name} (${m.roll_no})`).join(', ')}
                              </dd>
                            </div>
                          )}
                          {row.description && (
                            <div className="sm:col-span-2">
                              <dt className="text-muted">Description</dt>
                              <dd className="text-text leading-relaxed whitespace-pre-line">
                                {row.description}
                              </dd>
                            </div>
                          )}
                          {row.music_credit && (
                            <div className="sm:col-span-2">
                              <dt className="text-muted">Credits</dt>
                              <dd className="text-text">{row.music_credit}</dd>
                            </div>
                          )}
                        </dl>

                        <div className="space-y-1.5">
                          <label
                            htmlFor={`reel-note-${row.id}`}
                            className="block text-xs font-medium text-muted"
                          >
                            Admin note (not shown publicly)
                          </label>
                          <textarea
                            id={`reel-note-${row.id}`}
                            rows={2}
                            maxLength={500}
                            value={noteDrafts[row.id] ?? row.admin_note}
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                            }
                            className={`${ADMIN_TEXTAREA} resize-y`}
                          />
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              isLoading={isBusy}
                              disabled={
                                isBusy || (noteDrafts[row.id] ?? row.admin_note).trim() === row.admin_note
                              }
                              onClick={() => void saveNote(row)}
                              className="rounded-full"
                            >
                              Save note
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {filtered.length > PAGE_SIZE && (
            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              totalCount={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          )}

          {rows.length > 0 && (
            <div className="pt-5 border-t border-border flex flex-wrap items-center justify-between gap-3">
              <span className={ADMIN_COUNT_PILL}>{rows.length} total</span>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={counts.rejected === 0}
                  onClick={() => setClearAction({ kind: 'rejected' })}
                  className="rounded-full"
                >
                  Clear rejected
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => setClearAction({ kind: 'all' })}
                  className="rounded-full"
                >
                  Clear all submissions
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog
        isOpen={Boolean(clearAction)}
        onClose={() => {
          if (!isClearing) setClearAction(null)
        }}
        title={
          clearAction?.kind === 'delete-one'
            ? 'Delete entry'
            : clearAction?.kind === 'rejected'
            ? 'Clear rejected entries'
            : 'Clear all submissions'
        }
        description={
          clearAction?.kind === 'delete-one'
            ? `Permanently delete "${clearAction.row.reel_title}" by ${clearAction.row.full_name}. This frees their roll number to submit again.`
            : clearAction?.kind === 'rejected'
            ? `Permanently delete ${counts.rejected} rejected ${counts.rejected === 1 ? 'entry' : 'entries'}.`
            : `Permanently delete all ${rows.length} submissions, including approved ones. Export the CSV first if you need a record.`
        }
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="pt-4 border-t border-border flex justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={isClearing}
            onClick={() => setClearAction(null)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="md"
            isLoading={isClearing}
            disabled={isClearing}
            onClick={() => void confirmClear()}
            className="rounded-full"
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
