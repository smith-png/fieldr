import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowsClockwise,
  CaretDown,
  Check,
  CheckCircle,
  PencilSimple,
  Plus,
  Trash,
  User,
  UserCheck,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type {
  AcademicYear,
  AthleteRegistration,
  RegistrationSportEntry,
  Sport
} from '../../types'
import {
  approveRegistration,
  clearRegistrationHistory,
  deleteReviewedRegistrationEntry,
  formatAthleteCode,
  getPendingPhotoSignedUrls,
  listAdminRegistrations,
  purgeRejectedAndIncompleteRegistrations,
  rejectRegistration
} from '../../lib/data'
import { ACADEMIC_YEARS, getAcademicYearLabel } from '../../lib/academicYears'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { Button, Dialog, EmptyState, Pagination, SkeletonBlock } from '../ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_DIALOG_CLASS,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_PILL_BAR,
  ADMIN_PILL_BAR_OUTER,
  ADMIN_SELECT,
  ADMIN_TEXTAREA,
  ADMIN_WELL
} from './adminStyles'

interface AdminRegistrationsTabProps {
  sports: Sport[]
  onPendingCountChange: (count: number) => void
  onApprovedOrChanged: () => Promise<void>
}

interface EditRowDraft {
  key: string
  sport: string
  playing_role: string
}

const PAGE_SIZE = 10
const ROLL_NUMBER_REGEX = /^\d{1,5}$/
const ROLL_NUMBER_ERROR = 'Enter your roll number using digits only (for example 23131)'

function sanitizeRollNo(value: string): string {
  return value.replace(/\D/g, '').slice(0, 5)
}

function formatDateTimeShort(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export const AdminRegistrationsTab: React.FC<AdminRegistrationsTabProps> = ({
  sports,
  onPendingCountChange,
  onApprovedOrChanged
}) => {
  const { showToast } = useToast()

  const [subView, setSubView] = useState<'pending' | 'history'>('pending')
  const [currentPage, setCurrentPage] = useState(1)
  const [registrations, setRegistrations] = useState<AthleteRegistration[]>([])
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Selection for bulk approve
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [isBulkApproveDialogOpen, setIsBulkApproveDialogOpen] = useState(false)
  const [isBulkApproving, setIsBulkApproving] = useState(false)

  // Photo lightbox preview
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; name: string } | null>(null)

  // Edit then Approve dialog state
  const [editTarget, setEditTarget] = useState<AthleteRegistration | null>(null)
  const [editFullName, setEditFullName] = useState('')
  const [editRollNo, setEditRollNo] = useState('')
  const [editRollError, setEditRollError] = useState<string | null>(null)
  const [editAcademicYear, setEditAcademicYear] = useState<AcademicYear>('1st')
  const [editSportRows, setEditSportRows] = useState<EditRowDraft[]>([])
  const [editReplacePhoto, setEditReplacePhoto] = useState(false)
  const [isSavingEditApprove, setIsSavingEditApprove] = useState(false)

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState<AthleteRegistration | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [isRejecting, setIsRejecting] = useState(false)

  // Clear menu & confirmation dialog state
  const [isClearMenuOpen, setIsClearMenuOpen] = useState(false)
  const [clearAction, setClearAction] = useState<
    'approved' | 'rejected_incomplete' | 'all' | null
  >(null)
  const [isClearing, setIsClearing] = useState(false)
  const clearMenuRef = useRef<HTMLDivElement | null>(null)

  // Single history-row delete confirmation state
  const [deleteHistoryTarget, setDeleteHistoryTarget] = useState<AthleteRegistration | null>(null)
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null)

  const isMountedRef = useRef(true)
  const latestReqIdRef = useRef(0)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!isClearMenuOpen) return
    const handlePointerDown = (e: MouseEvent) => {
      if (clearMenuRef.current && !clearMenuRef.current.contains(e.target as Node)) {
        setIsClearMenuOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsClearMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isClearMenuOpen])

  const loadRegistrations = useCallback(
    async (options?: { manual?: boolean; resetPage?: boolean }) => {
      const reqId = ++latestReqIdRef.current
      try {
        if (options?.manual) {
          setIsRefreshing(true)
        } else {
          setIsLoading(true)
        }
        const rows = await listAdminRegistrations()
        if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
        setRegistrations(rows)
        if (options?.resetPage) {
          setCurrentPage(1)
        }

        const pendingRows = rows.filter((r) => r.status === 'pending')
        onPendingCountChange(pendingRows.length)

        // Batch-fetch signed URLs for all pending photos & thumbnails in one storage request
        const pathsToSign: string[] = []
        for (const r of pendingRows) {
          if (r.pending_thumb_path) pathsToSign.push(r.pending_thumb_path)
          if (r.pending_photo_path) pathsToSign.push(r.pending_photo_path)
        }
        if (pathsToSign.length > 0) {
          const urls = await getPendingPhotoSignedUrls(pathsToSign)
          if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
          setSignedUrls(urls)
        } else {
          setSignedUrls({})
        }

        // Drop any selected IDs that are no longer pending
        const validPendingIds = new Set(
          pendingRows.filter((r) => r.photo_uploaded).map((r) => r.id)
        )
        setSelectedIds((prev) => {
          const next = new Set<string>()
          for (const id of prev) {
            if (validPendingIds.has(id)) next.add(id)
          }
          return next
        })
      } catch (err: unknown) {
        if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
        showToast(getErrorMessage(err, 'Failed to load registrations'), 'error')
      } finally {
        if (isMountedRef.current && reqId === latestReqIdRef.current) {
          setIsLoading(false)
          setIsRefreshing(false)
        }
      }
    },
    [onPendingCountChange, showToast]
  )

  useEffect(() => {
    void loadRegistrations()
  }, [loadRegistrations])

  const pendingList = useMemo(
    () => registrations.filter((r) => r.status === 'pending'),
    [registrations]
  )

  const historyList = useMemo(
    () => registrations.filter((r) => r.status !== 'pending'),
    [registrations]
  )

  const approvedHistoryCount = useMemo(
    () => historyList.filter((r) => r.status === 'approved').length,
    [historyList]
  )

  const rejectedAndIncompleteCount = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    let count = 0
    for (const reg of registrations) {
      if (reg.status === 'rejected') {
        count += 1
      } else if (reg.status === 'pending' && !reg.photo_uploaded) {
        const createdMs = Date.parse(reg.created_at)
        if (Number.isFinite(createdMs) && createdMs <= oneHourAgo) {
          count += 1
        }
      }
    }
    return count
  }, [registrations])

  const approvablePending = useMemo(
    () => pendingList.filter((r) => r.photo_uploaded),
    [pendingList]
  )

  const selectedApprovableCount = useMemo(
    () => approvablePending.filter((r) => selectedIds.has(r.id)).length,
    [approvablePending, selectedIds]
  )

  const pendingTotalPages = Math.max(1, Math.ceil(pendingList.length / PAGE_SIZE))
  const historyTotalPages = Math.max(1, Math.ceil(historyList.length / PAGE_SIZE))
  const activeTotalPages = subView === 'pending' ? pendingTotalPages : historyTotalPages
  const effectivePage = Math.min(currentPage, activeTotalPages)

  useEffect(() => {
    if (currentPage > activeTotalPages) {
      setCurrentPage(activeTotalPages)
    }
  }, [currentPage, activeTotalPages])

  const pagedPendingList = useMemo(() => {
    const start = (effectivePage - 1) * PAGE_SIZE
    return pendingList.slice(start, start + PAGE_SIZE)
  }, [pendingList, effectivePage])

  const pagedHistoryList = useMemo(() => {
    const start = (effectivePage - 1) * PAGE_SIZE
    return historyList.slice(start, start + PAGE_SIZE)
  }, [historyList, effectivePage])

  const handleSwitchSubView = (nextView: 'pending' | 'history') => {
    if (nextView !== subView) {
      setSubView(nextView)
      setCurrentPage(1)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllPending = () => {
    setSelectedIds(new Set(approvablePending.map((r) => r.id)))
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
  }

  const getRolesForSport = (sportName: string): string[] => {
    const found = sports.find((s) => s.name.toLowerCase() === sportName.toLowerCase())
    return found?.roles ?? []
  }

  const handleQuickApprove = async (reg: AthleteRegistration) => {
    if (!reg.photo_uploaded) {
      showToast('Photo upload has not completed yet for this entry.', 'error')
      return
    }
    try {
      setBusyId(reg.id)
      const replaceExistingPhoto =
        !reg.existing_athlete_id || !reg.existing_athlete_photo_url
      const res = await approveRegistration({
        registration: reg,
        replacePhoto: replaceExistingPhoto
      })
      showToast(
        res.created_athlete
          ? `Approved ${reg.full_name} (#${formatAthleteCode(res.athlete_code)}) · ${res.players_created} ${
              res.players_created === 1 ? 'sport' : 'sports'
            }`
          : `Matched existing #${formatAthleteCode(res.athlete_code)} · added ${res.players_created} ${
              res.players_created === 1 ? 'entry' : 'entries'
            }`,
        'success'
      )
      await Promise.all([loadRegistrations({ manual: true }), onApprovedOrChanged()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Approval failed'), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const openEditApproveDialog = (reg: AthleteRegistration) => {
    setEditTarget(reg)
    setEditFullName(reg.full_name)
    setEditRollNo(sanitizeRollNo(reg.roll_no))
    setEditRollError(null)
    setEditAcademicYear(reg.academic_year)
    setEditSportRows(
      reg.sport_entries.map((entry, idx) => ({
        key: `${reg.id}-sp-${idx}`,
        sport: entry.sport,
        playing_role: entry.playing_role
      }))
    )
    setEditReplacePhoto(Boolean(reg.existing_athlete_id && !reg.existing_athlete_photo_url))
  }

  const handleEditSportChange = (rowKey: string, nextSport: string) => {
    const roles = getRolesForSport(nextSport)
    setEditSportRows((prev) =>
      prev.map((row) =>
        row.key === rowKey
          ? { ...row, sport: nextSport, playing_role: roles[0] || '' }
          : row
      )
    )
  }

  const handleEditRoleChange = (rowKey: string, nextRole: string) => {
    setEditSportRows((prev) =>
      prev.map((row) => (row.key === rowKey ? { ...row, playing_role: nextRole } : row))
    )
  }

  const handleAddEditSportRow = () => {
    const used = new Set(editSportRows.map((r) => r.sport.toLowerCase()))
    const available = sports.find((s) => !used.has(s.name.toLowerCase()))
    if (!available) return
    setEditSportRows((prev) => [
      ...prev,
      {
        key: `add-${Date.now()}-${prev.length}`,
        sport: available.name,
        playing_role: available.roles[0] || ''
      }
    ])
  }

  const handleRemoveEditSportRow = (rowKey: string) => {
    setEditSportRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== rowKey)))
  }

  const handleConfirmEditApprove = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTarget || isSavingEditApprove) return

    const trimmedName = editFullName.trim()
    const trimmedRoll = sanitizeRollNo(editRollNo)
    if (!trimmedName) {
      showToast('Name is required.', 'error')
      return
    }
    if (!ROLL_NUMBER_REGEX.test(trimmedRoll)) {
      setEditRollError(ROLL_NUMBER_ERROR)
      showToast(ROLL_NUMBER_ERROR, 'error')
      return
    }
    setEditRollError(null)

    const validEntries: RegistrationSportEntry[] = []
    const seen = new Set<string>()
    for (const row of editSportRows) {
      const sp = row.sport.trim()
      const rl = row.playing_role.trim()
      if (!sp || !rl) {
        showToast('Every sport row needs a sport and playing role.', 'error')
        return
      }
      if (seen.has(sp.toLowerCase())) {
        showToast('Duplicate sport entries are not allowed.', 'error')
        return
      }
      seen.add(sp.toLowerCase())
      validEntries.push({ sport: sp, playing_role: rl })
    }

    if (validEntries.length === 0) {
      showToast('At least one sport entry is required.', 'error')
      return
    }

    try {
      setIsSavingEditApprove(true)
      const res = await approveRegistration({
        registration: editTarget,
        overrides: {
          fullName: trimmedName,
          rollNo: trimmedRoll,
          academicYear: editAcademicYear,
          sportEntries: validEntries
        },
        replacePhoto: editTarget.existing_athlete_id ? editReplacePhoto : true
      })
      showToast(
        `Approved ${trimmedName} (#${formatAthleteCode(res.athlete_code)}) · ${res.players_created} ${
          res.players_created === 1 ? 'sport' : 'sports'
        }`,
        'success'
      )
      setEditTarget(null)
      await Promise.all([loadRegistrations({ manual: true }), onApprovedOrChanged()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to approve registration'), 'error')
    } finally {
      setIsSavingEditApprove(false)
    }
  }

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rejectTarget || isRejecting) return
    try {
      setIsRejecting(true)
      await rejectRegistration(rejectTarget.id, rejectReason.trim() || undefined)
      showToast(`Rejected ${rejectTarget.full_name}`, 'info')
      setRejectTarget(null)
      setRejectReason('')
      await loadRegistrations({ manual: true })
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to reject registration'), 'error')
    } finally {
      setIsRejecting(false)
    }
  }

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0 || isBulkApproving) return
    const targets = approvablePending.filter((r) => selectedIds.has(r.id))
    if (targets.length === 0) {
      setIsBulkApproveDialogOpen(false)
      return
    }

    setIsBulkApproving(true)
    let approved = 0
    let failed = 0
    for (const reg of targets) {
      try {
        const replaceExistingPhoto =
          !reg.existing_athlete_id || !reg.existing_athlete_photo_url
        await approveRegistration({
          registration: reg,
          replacePhoto: replaceExistingPhoto
        })
        approved += 1
      } catch {
        failed += 1
      }
    }
    setIsBulkApproving(false)
    setIsBulkApproveDialogOpen(false)
    setSelectedIds(new Set())

    if (failed > 0) {
      showToast(`Approved ${approved}, failed ${failed}.`, approved > 0 ? 'info' : 'error')
    } else {
      showToast(
        `Approved ${approved} ${approved === 1 ? 'registration' : 'registrations'}`,
        'success'
      )
    }

    await Promise.all([loadRegistrations({ manual: true }), onApprovedOrChanged()])
  }

  const openClearDialog = (action: 'approved' | 'rejected_incomplete' | 'all') => {
    setIsClearMenuOpen(false)
    setClearAction(action)
  }

  const handleConfirmClear = async () => {
    if (!clearAction || isClearing) return
    const action = clearAction
    try {
      setIsClearing(true)
      const res =
        action === 'approved'
          ? await clearRegistrationHistory('approved')
          : action === 'all'
          ? await clearRegistrationHistory('all')
          : await purgeRejectedAndIncompleteRegistrations()
      setClearAction(null)
      await loadRegistrations({ manual: true })
      showToast(
        res.deletedCount > 0
          ? `Cleared ${res.deletedCount} ${res.deletedCount === 1 ? 'entry' : 'entries'}`
          : 'No matching entries to clear.',
        res.deletedCount > 0 ? 'success' : 'info'
      )
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Clear failed'), 'error')
    } finally {
      setIsClearing(false)
    }
  }

  const handleConfirmDeleteHistoryEntry = async () => {
    if (!deleteHistoryTarget || deletingHistoryId) return
    const target = deleteHistoryTarget
    try {
      setDeletingHistoryId(target.id)
      await deleteReviewedRegistrationEntry(target)
      setDeleteHistoryTarget(null)
      await loadRegistrations({ manual: true })
      showToast(`Cleared 1 entry (${target.full_name})`, 'success')
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to clear history entry'), 'error')
    } finally {
      setDeletingHistoryId(null)
    }
  }

  return (
    <section className={ADMIN_CARD}>
      {/* Top Toolbar */}
      <div className={ADMIN_CARD_HEADER}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className={ADMIN_CARD_TITLE}>Self-Registrations</h2>
          <div className={ADMIN_PILL_BAR_OUTER}>
            <div className={ADMIN_PILL_BAR} role="tablist" aria-label="Registrations filter">
              <button
                type="button"
                role="tab"
                aria-selected={subView === 'pending'}
                onClick={() => handleSwitchSubView('pending')}
                className={`min-h-[30px] px-3.5 py-1 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  subView === 'pending'
                    ? 'bg-btn-bg text-btn-fg font-medium'
                    : 'text-muted hover:text-text'
                }`}
              >
                Pending ({pendingList.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={subView === 'history'}
                onClick={() => handleSwitchSubView('history')}
                className={`min-h-[30px] px-3.5 py-1 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  subView === 'history'
                    ? 'bg-btn-bg text-btn-fg font-medium'
                    : 'text-muted hover:text-text'
                }`}
              >
                History ({historyList.length})
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={ArrowsClockwise}
            isLoading={isRefreshing}
            disabled={isRefreshing || isBulkApproving}
            onClick={() => void loadRegistrations({ manual: true, resetPage: true })}
            className="rounded-full"
          >
            Refresh
          </Button>
          <div ref={clearMenuRef} className="relative">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={Trash}
              rightIcon={CaretDown}
              aria-haspopup="menu"
              aria-expanded={isClearMenuOpen}
              disabled={isClearing || isBulkApproving || Boolean(deletingHistoryId)}
              onClick={() => setIsClearMenuOpen((prev) => !prev)}
              className="rounded-full text-muted hover:text-error hover:bg-error/10"
            >
              Clear
            </Button>

            {isClearMenuOpen && (
              <div
                role="menu"
                aria-label="Clear registration history"
                className="absolute right-0 mt-1.5 w-64 rounded-2xl border border-border bg-surface shadow-xl p-1.5 z-30"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openClearDialog('approved')}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-xs text-text hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  <span>Clear approved history</span>
                  <span className="font-mono text-[11px] text-muted tabular-nums">
                    {approvedHistoryCount}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openClearDialog('rejected_incomplete')}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-xs text-text hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  <span>Clear rejected and incomplete</span>
                  <span className="font-mono text-[11px] text-muted tabular-nums">
                    {rejectedAndIncompleteCount}
                  </span>
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openClearDialog('all')}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left text-xs text-error hover:bg-error/10 transition-colors cursor-pointer"
                >
                  <span>Clear all reviewed history</span>
                  <span className="font-mono text-[11px] text-error/80 tabular-nums">
                    {historyList.length}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk Action Bar (Pending view only) */}
      {subView === 'pending' && !isLoading && pendingList.length > 0 && (
        <div className={`${ADMIN_WELL} px-4 py-3 flex flex-wrap items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={handleSelectAllPending}
              disabled={approvablePending.length === 0 || isBulkApproving}
              className="text-accent-bright hover:underline font-medium cursor-pointer disabled:opacity-40"
            >
              Select all ({approvablePending.length})
            </button>
            <span className="text-border">·</span>
            <button
              type="button"
              onClick={handleClearSelection}
              disabled={selectedIds.size === 0 || isBulkApproving}
              className="text-muted hover:text-text font-medium cursor-pointer disabled:opacity-40"
            >
              Clear
            </button>
            <span className="font-mono text-muted tabular-nums">
              {selectedApprovableCount} selected
            </span>
          </div>

          <Button
            type="button"
            variant="primary"
            size="sm"
            leftIcon={CheckCircle}
            disabled={selectedApprovableCount === 0 || isBulkApproving || Boolean(busyId)}
            isLoading={isBulkApproving}
            onClick={() => setIsBulkApproveDialogOpen(true)}
            className="rounded-full px-4"
          >
            Bulk approve selected ({selectedApprovableCount})
          </Button>
        </div>
      )}

      {/* List Body */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <SkeletonBlock
              key={n}
              className="h-28 bg-bg border border-border rounded-2xl"
            />
          ))}
        </div>
      ) : subView === 'pending' ? (
        pendingList.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No pending registrations"
            description="New self-registrations will appear here once submitted. Use Refresh to check for updates."
          />
        ) : (
          <div className="space-y-3">
            {pagedPendingList.map((reg) => {
              const thumbUrl =
                (reg.pending_thumb_path && signedUrls[reg.pending_thumb_path]) ||
                (reg.pending_photo_path && signedUrls[reg.pending_photo_path]) ||
                null
              const fullUrl =
                (reg.pending_photo_path && signedUrls[reg.pending_photo_path]) || thumbUrl
              const isSelected = selectedIds.has(reg.id)
              const isRowBusy = busyId === reg.id || isBulkApproving

              return (
                <div
                  key={reg.id}
                  className={`${ADMIN_WELL} p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4`}
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!reg.photo_uploaded || isRowBusy}
                      onChange={() => toggleSelect(reg.id)}
                      aria-label={`Select ${reg.full_name}`}
                      className="mt-1.5 h-4 w-4 rounded border-border bg-surface accent-accent-bright shrink-0 cursor-pointer disabled:opacity-40"
                    />

                    {/* Photo thumbnail */}
                    {thumbUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          fullUrl && setPreviewPhoto({ url: fullUrl, name: reg.full_name })
                        }
                        title="View submitted photo"
                        className="w-16 aspect-[4/5] rounded-xl overflow-hidden bg-surface-2 border border-border shrink-0 cursor-pointer hover:border-accent-bright transition-colors"
                      >
                        <img
                          src={thumbUrl}
                          alt={reg.full_name}
                          width={64}
                          height={80}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="w-16 aspect-[4/5] rounded-xl bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                        <User size={22} weight="regular" />
                      </div>
                    )}

                    {/* Info column */}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-base text-text break-words">
                          {reg.full_name}
                        </span>
                        {reg.existing_athlete_id && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface border border-accent-bright text-accent-bright text-[11px] font-medium whitespace-nowrap">
                            Existing athlete
                            {reg.existing_athlete_code != null && (
                              <span className="font-mono">
                                #{formatAthleteCode(reg.existing_athlete_code)}
                              </span>
                            )}
                          </span>
                        )}
                        {!reg.photo_uploaded && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-2 border border-border text-muted text-[11px] font-mono">
                            Photo pending
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-muted">
                        <span>{getAcademicYearLabel(reg.academic_year)}</span>
                        <span aria-hidden="true">·</span>
                        <span>Roll {reg.roll_no}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatDateTimeShort(reg.created_at)}</span>
                      </div>

                      {reg.existing_athlete_id && reg.existing_athlete_name && (
                        <p className="text-xs text-muted">
                          Matches existing profile: <span className="text-text">{reg.existing_athlete_name}</span>
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {reg.sport_entries.map((entry) => (
                          <span
                            key={`${reg.id}-${entry.sport}`}
                            className="inline-flex items-center px-2.5 py-1 rounded-full bg-surface-2 border border-border text-xs text-text"
                          >
                            <span className="font-medium">{entry.sport}</span>
                            <span className="mx-1.5 text-muted">·</span>
                            <span className="text-muted">{entry.playing_role}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-border shrink-0">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      leftIcon={Check}
                      disabled={!reg.photo_uploaded || isRowBusy}
                      isLoading={busyId === reg.id}
                      onClick={() => void handleQuickApprove(reg)}
                      className="rounded-full px-4"
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={PencilSimple}
                      disabled={!reg.photo_uploaded || isRowBusy}
                      onClick={() => openEditApproveDialog(reg)}
                      className="rounded-full"
                    >
                      Edit &amp; Approve
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon={X}
                      disabled={isRowBusy}
                      onClick={() => {
                        setRejectTarget(reg)
                        setRejectReason('')
                      }}
                      className="rounded-full text-error hover:text-error hover:bg-error/10"
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )
            })}
            {pendingTotalPages > 1 && (
              <div className="py-3.5 px-4 rounded-2xl border border-border bg-surface-2/60">
                <Pagination
                  currentPage={effectivePage}
                  totalPages={pendingTotalPages}
                  totalCount={pendingList.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                  isLoading={isRefreshing || isBulkApproving}
                />
              </div>
            )}
          </div>
        )
      ) : historyList.length === 0 ? (
        <EmptyState
          title="No reviewed registrations yet"
          description="Approved and rejected submissions will be listed here."
        />
      ) : (
        <div className="space-y-2.5">
          {pagedHistoryList.map((reg) => (
            <div
              key={reg.id}
              className={`${ADMIN_WELL} px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm text-text">{reg.full_name}</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                      reg.status === 'approved'
                        ? 'bg-surface border-accent-bright text-accent-bright'
                        : 'bg-error/10 border-error/40 text-error'
                    }`}
                  >
                    {reg.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                  {reg.existing_athlete_code != null && reg.status === 'approved' && (
                    <span className={ADMIN_COUNT_PILL}>
                      #{formatAthleteCode(reg.existing_athlete_code)}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono text-muted">
                  <span>{getAcademicYearLabel(reg.academic_year)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Roll {reg.roll_no}</span>
                  <span aria-hidden="true">·</span>
                  <span>Reviewed {formatDateTimeShort(reg.reviewed_at || reg.created_at)}</span>
                </div>

                {reg.status === 'rejected' && reg.rejection_reason && (
                  <p className="text-xs text-error">Reason: {reg.rejection_reason}</p>
                )}
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                <div className="flex flex-wrap gap-1.5">
                  {reg.sport_entries.map((entry) => (
                    <span
                      key={`${reg.id}-hist-${entry.sport}`}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-2 border border-border text-[11px] text-muted"
                    >
                      {entry.sport} · {entry.playing_role}
                    </span>
                  ))}
                </div>
                {(reg.status === 'approved' || reg.status === 'rejected') && (
                  <button
                    type="button"
                    disabled={isClearing || Boolean(deletingHistoryId)}
                    onClick={() => setDeleteHistoryTarget(reg)}
                    aria-label={`Clear ${reg.full_name} from history`}
                    title="Clear entry from history"
                    className="h-8 w-8 rounded-full text-muted hover:text-error hover:bg-error/10 flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                  >
                    <Trash size={15} weight="regular" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {historyTotalPages > 1 && (
            <div className="py-3.5 px-4 rounded-2xl border border-border bg-surface-2/60">
              <Pagination
                currentPage={effectivePage}
                totalPages={historyTotalPages}
                totalCount={historyList.length}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
                isLoading={isRefreshing}
              />
            </div>
          )}
        </div>
      )}

      {/* Photo Preview Dialog */}
      <Dialog
        isOpen={Boolean(previewPhoto)}
        onClose={() => setPreviewPhoto(null)}
        title={previewPhoto?.name || 'Submitted Photo'}
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        {previewPhoto && (
          <div className="space-y-4">
            <div className="w-full max-w-[320px] mx-auto aspect-[4/5] rounded-2xl overflow-hidden bg-bg border border-border">
              <img
                src={previewPhoto.url}
                alt={previewPhoto.name}
                width={320}
                height={400}
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPreviewPhoto(null)}
                className="rounded-full"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Edit then Approve Dialog */}
      <Dialog
        isOpen={Boolean(editTarget)}
        onClose={() => {
          if (!isSavingEditApprove) setEditTarget(null)
        }}
        title="Edit & Approve Registration"
        size="md"
        className={ADMIN_DIALOG_CLASS}
      >
        {editTarget && (
          <form onSubmit={handleConfirmEditApprove} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="edit-reg-name" className={ADMIN_LABEL}>
                Full Name *
              </label>
              <input
                id="edit-reg-name"
                type="text"
                required
                maxLength={100}
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className={ADMIN_INPUT}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label htmlFor="edit-reg-roll" className={ADMIN_LABEL}>
                  Roll Number *
                </label>
                <input
                  id="edit-reg-roll"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  maxLength={5}
                  autoComplete="off"
                  placeholder="e.g. 23131"
                  value={editRollNo}
                  onChange={(e) => {
                    const raw = e.target.value
                    const cleaned = sanitizeRollNo(raw)
                    setEditRollNo(cleaned)
                    if (ROLL_NUMBER_REGEX.test(cleaned)) {
                      setEditRollError(null)
                    } else if (raw !== cleaned || editRollError) {
                      setEditRollError(ROLL_NUMBER_ERROR)
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault()
                    const pasted = e.clipboardData.getData('text')
                    const start = e.currentTarget.selectionStart ?? editRollNo.length
                    const end = e.currentTarget.selectionEnd ?? editRollNo.length
                    const raw = editRollNo.slice(0, start) + pasted + editRollNo.slice(end)
                    const cleaned = sanitizeRollNo(raw)
                    setEditRollNo(cleaned)
                    if (ROLL_NUMBER_REGEX.test(cleaned)) {
                      setEditRollError(null)
                    } else {
                      setEditRollError(ROLL_NUMBER_ERROR)
                    }
                  }}
                  onBlur={() => {
                    if (!ROLL_NUMBER_REGEX.test(editRollNo)) {
                      setEditRollError(ROLL_NUMBER_ERROR)
                    }
                  }}
                  aria-invalid={Boolean(editRollError)}
                  className={`${ADMIN_INPUT} font-mono${
                    editRollError ? ' border-error focus:border-error' : ''
                  }`}
                />
                {editRollError && (
                  <p role="alert" className="text-xs text-error">
                    {editRollError}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="edit-reg-year" className={ADMIN_LABEL}>
                  Academic Year *
                </label>
                <select
                  id="edit-reg-year"
                  value={editAcademicYear}
                  onChange={(e) => setEditAcademicYear(e.target.value as AcademicYear)}
                  className={`${ADMIN_SELECT} w-full`}
                >
                  {ACADEMIC_YEARS.map((yr) => (
                    <option key={yr.value} value={yr.value}>
                      {yr.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Editable sport entries */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={ADMIN_LABEL}>Sport entries</span>
                {editSportRows.length < sports.length && (
                  <button
                    type="button"
                    onClick={handleAddEditSportRow}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent-bright hover:underline cursor-pointer"
                  >
                    <Plus size={13} weight="bold" />
                    <span>Add sport</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {editSportRows.map((row) => {
                  const usedByOthers = new Set(
                    editSportRows
                      .filter((r) => r.key !== row.key)
                      .map((r) => r.sport.toLowerCase())
                  )
                  const sportOptions = sports.filter(
                    (s) =>
                      s.name.toLowerCase() === row.sport.toLowerCase() ||
                      !usedByOthers.has(s.name.toLowerCase())
                  )
                  const roles = getRolesForSport(row.sport)

                  return (
                    <div
                      key={row.key}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center"
                    >
                      <select
                        value={row.sport}
                        onChange={(e) => handleEditSportChange(row.key, e.target.value)}
                        className={`${ADMIN_SELECT} w-full`}
                      >
                        {sportOptions.map((s) => (
                          <option key={s.id} value={s.name}>
                            {s.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={row.playing_role}
                        onChange={(e) => handleEditRoleChange(row.key, e.target.value)}
                        className={`${ADMIN_SELECT} w-full`}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>

                      {editSportRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEditSportRow(row.key)}
                          aria-label={`Remove ${row.sport}`}
                          className="h-10 w-10 rounded-xl border border-border bg-bg text-muted hover:text-error hover:bg-error/10 flex items-center justify-center cursor-pointer"
                        >
                          <Trash size={15} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Existing athlete photo replacement choice */}
            {editTarget.existing_athlete_id && (
              <div className={`${ADMIN_WELL} p-3.5 space-y-2.5`}>
                <div className="flex items-center gap-2 text-xs text-accent-bright font-medium">
                  <WarningCircle size={15} weight="regular" />
                  <span>
                    Matches existing athlete #{formatAthleteCode(editTarget.existing_athlete_code ?? 0)} (
                    {editTarget.existing_athlete_name})
                  </span>
                </div>
                <label className="flex items-center gap-2.5 text-xs text-text cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editReplacePhoto}
                    onChange={(e) => setEditReplacePhoto(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-surface accent-accent-bright cursor-pointer"
                  />
                  <span>Replace existing athlete photo with submitted photo</span>
                </label>
              </div>
            )}

            <div className="pt-4 border-t border-border flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSavingEditApprove}
                onClick={() => setEditTarget(null)}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                leftIcon={Check}
                disabled={isSavingEditApprove}
                isLoading={isSavingEditApprove}
                className="rounded-full px-4"
              >
                Save &amp; Approve
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        isOpen={Boolean(rejectTarget)}
        onClose={() => {
          if (!isRejecting) setRejectTarget(null)
        }}
        title="Reject Registration"
        description={
          rejectTarget
            ? `Reject registration for ${rejectTarget.full_name} (Roll ${rejectTarget.roll_no})?`
            : ''
        }
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <form onSubmit={handleConfirmReject} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="reject-reg-reason" className={ADMIN_LABEL}>
              Reason (optional)
            </label>
            <textarea
              id="reject-reg-reason"
              rows={3}
              maxLength={240}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Blurry photo, duplicate entry, invalid roll number..."
              className={ADMIN_TEXTAREA}
            />
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isRejecting}
              onClick={() => setRejectTarget(null)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={isRejecting}
              isLoading={isRejecting}
              className="rounded-full px-4"
            >
              Reject
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Bulk Approve Confirmation Dialog */}
      <Dialog
        isOpen={isBulkApproveDialogOpen}
        onClose={() => {
          if (!isBulkApproving) setIsBulkApproveDialogOpen(false)
        }}
        title="Bulk Approve Registrations"
        description={`Approve ${selectedApprovableCount} selected ${
          selectedApprovableCount === 1 ? 'registration' : 'registrations'
        }? Each approved entry will be added to the athlete directory and registered for its selected sports.`}
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="pt-4 border-t border-border flex justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isBulkApproving}
            onClick={() => setIsBulkApproveDialogOpen(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            leftIcon={CheckCircle}
            disabled={selectedApprovableCount === 0 || isBulkApproving}
            isLoading={isBulkApproving}
            onClick={() => void handleBulkApprove()}
            className="rounded-full px-4"
          >
            Approve {selectedApprovableCount}
          </Button>
        </div>
      </Dialog>

      {/* Clear History / Purge Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(clearAction)}
        onClose={() => {
          if (!isClearing) setClearAction(null)
        }}
        title={
          clearAction === 'approved'
            ? 'Clear approved history'
            : clearAction === 'all'
            ? 'Clear all reviewed history'
            : 'Clear rejected and incomplete'
        }
        description={
          clearAction === 'approved'
            ? `Permanently remove ${approvedHistoryCount} approved registration ${
                approvedHistoryCount === 1 ? 'entry' : 'entries'
              } from history and any remaining temporary photo files. Pending entries and athletes are never deleted.`
            : clearAction === 'all'
            ? `Permanently remove all ${historyList.length} reviewed registration ${
                historyList.length === 1 ? 'entry' : 'entries'
              } (approved and rejected) from history and any remaining temporary photo files. Pending entries and athletes are never deleted.`
            : `Permanently remove ${rejectedAndIncompleteCount} rejected and incomplete ${
                rejectedAndIncompleteCount === 1 ? 'entry' : 'entries'
              } (rejected registrations and incomplete entries older than 1 hour without a photo) and their temporary photo files. Pending entries and athletes are never deleted.`
        }
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="pt-4 border-t border-border flex justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isClearing}
            onClick={() => setClearAction(null)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={isClearing}
            isLoading={isClearing}
            onClick={() => void handleConfirmClear()}
            className="rounded-full px-4"
          >
            {clearAction === 'approved'
              ? 'Clear approved'
              : clearAction === 'all'
              ? 'Clear all reviewed'
              : 'Clear now'}
          </Button>
        </div>
      </Dialog>

      {/* Single History Entry Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(deleteHistoryTarget)}
        onClose={() => {
          if (!deletingHistoryId) setDeleteHistoryTarget(null)
        }}
        title="Clear history entry"
        description={
          deleteHistoryTarget
            ? `Permanently remove the ${deleteHistoryTarget.status} registration entry for ${deleteHistoryTarget.full_name} (Roll ${deleteHistoryTarget.roll_no}) from history and any leftover temporary photo files. Pending entries and athletes are never deleted.`
            : ''
        }
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="pt-4 border-t border-border flex justify-end gap-2.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={Boolean(deletingHistoryId)}
            onClick={() => setDeleteHistoryTarget(null)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={Boolean(deletingHistoryId)}
            isLoading={Boolean(deletingHistoryId)}
            onClick={() => void handleConfirmDeleteHistoryEntry()}
            className="rounded-full px-4"
          >
            Clear entry
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
