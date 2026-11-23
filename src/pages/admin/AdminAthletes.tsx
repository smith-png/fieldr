import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  IdentificationBadge,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  User,
  UserPlus,
  X
} from '@phosphor-icons/react'
import type { AcademicYear, Athlete, AthleteCareerEntry, Season, Sport } from '../../types'
import {
  createAthlete,
  deleteAthlete,
  formatAthleteCode,
  getAthleteById,
  getAthleteEntries,
  getAthletesPaged,
  getPendingRegistrationsCount,
  markLocalMutation,
  subscribeToAthletes,
  updateAthlete,
  uploadPlayerPhotos
} from '../../lib/data'
import { useAuth } from '../../lib/AuthContext'
import { ACADEMIC_YEARS, getAcademicYearLabel } from '../../lib/academicYears'
import { validateImageFile } from '../../lib/imageCompression'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import {
  getCachedQuery,
  isQueryFresh,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import {
  Button,
  Dialog,
  EmptyState,
  Pagination,
  SkeletonTableRow
} from '../../components/ui'
import { BulkRegisterPanel } from '../../components/admin'
import { AdminRegistrationsTab } from '../../components/admin/AdminRegistrationsTab'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_DIALOG_CLASS,
  ADMIN_ICON_BTN,
  ADMIN_ICON_BTN_DANGER,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_PAGE_HEADER,
  ADMIN_PAGE_TITLE,
  ADMIN_PAGE_WRAPPER,
  ADMIN_PILL_BAR,
  ADMIN_PILL_BAR_OUTER,
  ADMIN_SELECT,
  ADMIN_TABLE_SHELL,
  ADMIN_TEXTAREA,
  ADMIN_WELL
} from '../../components/admin/adminStyles'

interface AdminAthletesProps {
  activeSeason: Season | null
  sports: Sport[]
  onRefresh: () => Promise<void>
  onRealtimeUpdate?: () => void
  createRequestTrigger?: number
}

export const AdminAthletes: React.FC<AdminAthletesProps> = ({
  activeSeason,
  sports,
  onRefresh,
  onRealtimeUpdate,
  createRequestTrigger = 0
}) => {
  const { showToast } = useToast()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  // Section tabs: Directory vs Self-Registrations (admin-only)
  const [activeTab, setActiveTab] = useState<'directory' | 'registrations'>('directory')
  const [pendingRegistrationsCount, setPendingRegistrationsCount] = useState<number>(0)

  // Pagination & Search state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(15)
  const initialCache = getCachedQuery<{
    athletes: Athlete[]
    totalPages: number
    totalCount: number
  }>('admin:athletes:1:15:')
  const [totalPages, setTotalPages] = useState(() => initialCache?.data.totalPages || 1)
  const [totalCount, setTotalCount] = useState(() => initialCache?.data.totalCount || 0)
  const [athletes, setAthletes] = useState<Athlete[]>(() => initialCache?.data.athletes || [])
  const [isLoading, setIsLoading] = useState(() => !initialCache)
  const hasLoadedOnceRef = useRef(Boolean(initialCache))
  const latestReqIdRef = useRef(0)
  const detailReqIdRef = useRef(0)
  const isMountedRef = useRef(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Detail View state
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null)
  const selectedAthleteRef = useRef<Athlete | null>(null)
  selectedAthleteRef.current = selectedAthlete
  const [athleteEntries, setAthleteEntries] = useState<AthleteCareerEntry[]>([])
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  // New / Edit Form Drawer state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAthlete, setEditingAthlete] = useState<Athlete | null>(null)
  const [name, setName] = useState('')
  const [academicYear, setAcademicYear] = useState<AcademicYear>('1st')
  const [rollNo, setRollNo] = useState('')
  const [notes, setNotes] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoThumbUrl, setPhotoThumbUrl] = useState('')
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<Athlete | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Register to sport panel state (single-athlete case of BulkRegisterPanel)
  const [isRegisterToSportOpen, setIsRegisterToSportOpen] = useState(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Load pending self-registration count once on page open (no realtime)
  useEffect(() => {
    if (!isAdmin) return
    let active = true
    getPendingRegistrationsCount()
      .then((count) => {
        if (active) setPendingRegistrationsCount(count)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [isAdmin])

  // Debounce search input by 300ms; only reset page when search text actually changes
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed === debouncedSearch) return
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, debouncedSearch])

  const loadAthletes = useCallback(
    async (options?: { force?: boolean }) => {
      const cacheKey = `admin:athletes:${currentPage}:${pageSize}:${debouncedSearch}`
      const cached = getCachedQuery<{
        athletes: Athlete[]
        totalPages: number
        totalCount: number
      }>(cacheKey)

      if (cached && !options?.force) {
        hasLoadedOnceRef.current = true
        setAthletes(cached.data.athletes)
        setTotalPages(cached.data.totalPages)
        setTotalCount(cached.data.totalCount)
        setIsLoading(false)
        if (isQueryFresh(cacheKey) && !shouldRevalidateQuery(cacheKey)) {
          return
        }
      }

      const reqId = ++latestReqIdRef.current
      try {
        if (!hasLoadedOnceRef.current && !cached) {
          setIsLoading(true)
        }
        const res = await getAthletesPaged({
          page: currentPage,
          pageSize,
          search: debouncedSearch || undefined
        })
        if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
        hasLoadedOnceRef.current = true
        setAthletes(res.athletes)
        setTotalPages(res.totalPages)
        setTotalCount(res.totalCount)
        setCachedQuery(cacheKey, {
          athletes: res.athletes,
          totalPages: res.totalPages,
          totalCount: res.totalCount
        })
      } catch (err: unknown) {
        if (isMountedRef.current && reqId === latestReqIdRef.current) {
          showToast(getErrorMessage(err, 'Failed to load athletes'), 'error')
        }
      } finally {
        if (isMountedRef.current && reqId === latestReqIdRef.current) {
          setIsLoading(false)
        }
      }
    },
    [currentPage, pageSize, debouncedSearch, showToast]
  )

  useEffect(() => {
    void loadAthletes()
  }, [loadAthletes])

  const openAthleteDetail = useCallback(
    async (athlete: Athlete, options?: { silent?: boolean }) => {
      const isSameAthlete = selectedAthleteRef.current?.id === athlete.id
      const showSkeleton = !options?.silent && !isSameAthlete
      setSelectedAthlete(athlete)
      const reqId = ++detailReqIdRef.current
      try {
        if (showSkeleton) {
          setIsLoadingDetail(true)
        }
        const [freshProfile, entries] = await Promise.all([
          getAthleteById(athlete.id),
          getAthleteEntries(athlete.id)
        ])
        if (!isMountedRef.current || reqId !== detailReqIdRef.current) return
        if (freshProfile) {
          setSelectedAthlete(freshProfile)
        }
        setAthleteEntries(entries)
      } catch (err: unknown) {
        if (isMountedRef.current && reqId === detailReqIdRef.current) {
          showToast(getErrorMessage(err, 'Failed to load athlete details'), 'error')
        }
      } finally {
        if (isMountedRef.current && reqId === detailReqIdRef.current) {
          setIsLoadingDetail(false)
        }
      }
    },
    [showToast]
  )

  // Debounced (500ms) realtime subscription for external changes; cancelled on unmount
  const onRealtimeUpdateRef = useRef(onRealtimeUpdate)
  onRealtimeUpdateRef.current = onRealtimeUpdate
  const loadAthletesRef = useRef(loadAthletes)
  loadAthletesRef.current = loadAthletes
  const openAthleteDetailRef = useRef(openAthleteDetail)
  openAthleteDetailRef.current = openAthleteDetail

  useEffect(() => {
    const unsubscribe = subscribeToAthletes(() => {
      void loadAthletesRef.current({ force: true })
      if (selectedAthleteRef.current) {
        void openAthleteDetailRef.current(selectedAthleteRef.current, { silent: true })
      }
      onRealtimeUpdateRef.current?.()
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const openCreateForm = useCallback(() => {
    setEditingAthlete(null)
    setName('')
    setAcademicYear('1st')
    setRollNo('')
    setNotes('')
    setPhotoUrl('')
    setPhotoThumbUrl('')
    setIsFormOpen(true)
  }, [])

  useEffect(() => {
    if (createRequestTrigger > 0) {
      setSelectedAthlete(null)
      openCreateForm()
    }
  }, [createRequestTrigger, openCreateForm])

  const openEditForm = (athlete: Athlete) => {
    setEditingAthlete(athlete)
    setName(athlete.name)
    setAcademicYear(athlete.academic_year || '1st')
    setRollNo(athlete.roll_no || '')
    setNotes(athlete.notes || '')
    setPhotoUrl(athlete.photo_url || '')
    setPhotoThumbUrl(athlete.photo_thumb_url || '')
    setIsFormOpen(true)
  }

  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      validateImageFile(file)
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Invalid photo file'), 'error')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    try {
      setIsUploadingPhoto(true)
      const { photo_url, photo_thumb_url } = await uploadPlayerPhotos(file)
      setPhotoUrl(photo_url)
      setPhotoThumbUrl(photo_thumb_url)
      showToast('Photo and thumbnail processed', 'success')
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Photo upload failed'), 'error')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleSaveAthlete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      showToast('Athlete name is required', 'error')
      return
    }

    try {
      setIsSubmitting(true)
      if (editingAthlete) {
        const updated = await updateAthlete(editingAthlete.id, {
          name: name.trim(),
          academic_year: academicYear,
          roll_no: rollNo.trim() || undefined,
          notes: notes.trim() || undefined,
          photo_url: photoUrl || undefined,
          photo_thumb_url: photoThumbUrl || undefined
        })
        showToast('Athlete updated', 'success')
        if (selectedAthlete && selectedAthlete.id === editingAthlete.id) {
          setSelectedAthlete({
            ...updated,
            entries_count: selectedAthlete.entries_count
          })
          const entries = await getAthleteEntries(editingAthlete.id)
          setAthleteEntries(entries)
        }
      } else {
        await createAthlete({
          name: name.trim(),
          academic_year: academicYear,
          roll_no: rollNo.trim() || undefined,
          notes: notes.trim() || undefined,
          photo_url: photoUrl || undefined,
          photo_thumb_url: photoThumbUrl || undefined
        })
        showToast('Athlete created', 'success')
      }
      markLocalMutation(['athletes', 'players'])
      setIsFormOpen(false)
      onRealtimeUpdateRef.current?.()
      await Promise.all([loadAthletes({ force: true }), onRefresh()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to save athlete'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRequestDelete = (athlete: Athlete) => {
    if ((athlete.entries_count ?? 0) > 0) {
      showToast('This athlete has sport entries and cannot be deleted.', 'error')
      return
    }
    setDeleteTarget(athlete)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    try {
      setIsDeleting(true)
      markLocalMutation(['athletes', 'players'])
      await deleteAthlete(deleteTarget.id)
      showToast('Athlete deleted', 'success')
      if (selectedAthlete?.id === deleteTarget.id) {
        setSelectedAthlete(null)
      }
      setDeleteTarget(null)
      onRealtimeUpdateRef.current?.()
      await Promise.all([loadAthletes({ force: true }), onRefresh()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to delete athlete'), 'error')
      setDeleteTarget(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className={ADMIN_PAGE_WRAPPER}>
      {selectedAthlete ? (
        /* ATHLETE DETAIL VIEW */
        <div className="space-y-6">
          <header className={ADMIN_PAGE_HEADER}>
            <div className="flex items-center gap-3.5 min-w-0">
              <button
                type="button"
                onClick={() => setSelectedAthlete(null)}
                aria-label="Back to Athletes"
                className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0 cursor-pointer"
              >
                <ArrowLeft size={18} weight="regular" />
              </button>
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <h1 className={`${ADMIN_PAGE_TITLE} truncate`}>{selectedAthlete.name}</h1>
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-2 border border-border font-mono text-xs font-semibold text-accent-bright tabular-nums shrink-0">
                  #{formatAthleteCode(selectedAthlete.athlete_code)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={UserPlus}
                onClick={() => setIsRegisterToSportOpen(true)}
                className="rounded-full"
              >
                Register to sport
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                leftIcon={PencilSimple}
                onClick={() => openEditForm(selectedAthlete)}
                className="rounded-full px-4"
              >
                Edit Athlete
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={Trash}
                onClick={() =>
                  handleRequestDelete({
                    ...selectedAthlete,
                    entries_count: athleteEntries.length
                  })
                }
                className="rounded-full text-error hover:text-error hover:bg-error/10"
              >
                Delete
              </Button>
            </div>
          </header>

          {/* Athlete Profile Card */}
          <section className={ADMIN_CARD}>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              {selectedAthlete.photo_thumb_url || selectedAthlete.photo_url ? (
                <img
                  src={selectedAthlete.photo_thumb_url || selectedAthlete.photo_url}
                  alt={selectedAthlete.name}
                  width={96}
                  height={96}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-24 h-24 rounded-2xl object-cover bg-surface-2 border border-border shrink-0"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-bg border border-border flex items-center justify-center text-muted shrink-0">
                  <User size={36} weight="regular" />
                </div>
              )}

              <div className="flex-1 w-full space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  <div className={`${ADMIN_WELL} p-4`}>
                    <span className="text-xs text-muted block mb-1">Athlete Code</span>
                    <span className="font-mono font-bold text-base text-accent-bright tabular-nums">
                      {formatAthleteCode(selectedAthlete.athlete_code)}
                    </span>
                  </div>

                  <div className={`${ADMIN_WELL} p-4`}>
                    <span className="text-xs text-muted block mb-1">Academic Year</span>
                    <span className="font-mono font-semibold text-sm text-text">
                      {getAcademicYearLabel(selectedAthlete.academic_year || '1st')}
                    </span>
                  </div>

                  <div className={`${ADMIN_WELL} p-4`}>
                    <span className="text-xs text-muted block mb-1">Roll No</span>
                    <span className="font-mono text-sm text-text">
                      {selectedAthlete.roll_no || '—'}
                    </span>
                  </div>

                  <div className={`${ADMIN_WELL} p-4`}>
                    <span className="text-xs text-muted block mb-1">Sport Entries</span>
                    <span className="font-mono font-semibold text-base text-text tabular-nums">
                      {athleteEntries.length}
                    </span>
                  </div>
                </div>

                <div className={`${ADMIN_WELL} p-4`}>
                  <span className="text-xs text-muted block mb-1">Notes</span>
                  <p className="text-sm text-text whitespace-pre-wrap">
                    {selectedAthlete.notes || 'No notes recorded.'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Sport Entries Across Seasons Card */}
          <section className={ADMIN_CARD}>
            <div className={ADMIN_CARD_HEADER}>
              <h2 className={ADMIN_CARD_TITLE}>Sport Entries Across Seasons</h2>
              <span className={ADMIN_COUNT_PILL}>
                {athleteEntries.length} {athleteEntries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            <div className={ADMIN_TABLE_SHELL}>
              <div className="overflow-x-auto thin-scrollbar">
                <table className="w-full min-w-[540px] text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Season Name</th>
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Sport</th>
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Role</th>
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Academic Year</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLoadingDetail ? (
                      Array.from({ length: 3 }).map((_, idx) => (
                        <SkeletonTableRow key={idx} columns={4} />
                      ))
                    ) : athleteEntries.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 px-4 text-center text-sm text-muted">
                          This athlete has no sport entries in any season yet.
                        </td>
                      </tr>
                    ) : (
                      athleteEntries.map((entry) => (
                        <tr
                          key={entry.player_id}
                          className="hover:bg-surface-2/50 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-medium text-text whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span>{entry.season_name}</span>
                              {entry.is_season_active && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-surface border border-accent-bright text-accent-bright text-[11px] font-medium">
                                  Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-text whitespace-nowrap">{entry.sport}</td>
                          <td className="py-3.5 px-4 text-muted whitespace-nowrap">
                            {entry.playing_role}
                          </td>
                          <td className="py-3.5 px-4 text-xs font-mono text-muted whitespace-nowrap">
                            {getAcademicYearLabel(entry.academic_year || '1st')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : (
        /* ATHLETES LIST VIEW */
        <>
          <header className={ADMIN_PAGE_HEADER}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
              <h1 className={ADMIN_PAGE_TITLE}>Athletes</h1>

              {isAdmin && (
                <div className={ADMIN_PILL_BAR_OUTER}>
                  <div
                    role="tablist"
                    aria-label="Athletes views"
                    className={ADMIN_PILL_BAR}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'directory'}
                      onClick={() => setActiveTab('directory')}
                      className={`min-h-[34px] px-4 py-1 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        activeTab === 'directory'
                          ? 'bg-btn-bg text-btn-fg font-medium'
                          : 'text-muted hover:text-text'
                      }`}
                    >
                      Directory
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'registrations'}
                      onClick={() => setActiveTab('registrations')}
                      className={`min-h-[34px] px-4 py-1 rounded-full text-xs whitespace-nowrap shrink-0 inline-flex items-center gap-2 transition-colors cursor-pointer ${
                        activeTab === 'registrations'
                          ? 'bg-btn-bg text-btn-fg font-medium'
                          : 'text-muted hover:text-text'
                      }`}
                    >
                      <span>Registrations</span>
                      {pendingRegistrationsCount > 0 && (
                        <span
                          className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full font-mono text-[11px] tabular-nums ${
                            activeTab === 'registrations'
                              ? 'bg-bg/20 text-btn-fg'
                              : 'bg-accent-bright text-on-accent font-semibold'
                          }`}
                        >
                          {pendingRegistrationsCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              leftIcon={Plus}
              onClick={openCreateForm}
              className="rounded-full px-5 self-start sm:self-auto"
            >
              New Athlete
            </Button>
          </header>

          {isAdmin && activeTab === 'registrations' ? (
            <AdminRegistrationsTab
              sports={sports}
              onPendingCountChange={setPendingRegistrationsCount}
              onApprovedOrChanged={async () => {
                onRealtimeUpdateRef.current?.()
                await Promise.all([loadAthletes({ force: true }), onRefresh()])
              }}
            />
          ) : (
            /* Search & Directory Card */
            <section className={ADMIN_CARD}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-border">
              <div className="relative flex-1 max-w-md">
                <MagnifyingGlass
                  size={16}
                  weight="regular"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, 4-digit code (0001), or roll no..."
                  className={`${ADMIN_INPUT} pl-10`}
                />
              </div>

              <span className={ADMIN_COUNT_PILL}>{totalCount} athletes</span>
            </div>

            {/* Athletes Table */}
            <div className={ADMIN_TABLE_SHELL}>
              <div className="overflow-x-auto thin-scrollbar">
                <table className="w-full min-w-[680px] text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Name</th>
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Code</th>
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Academic Year</th>
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Roll No</th>
                      <th className="py-3.5 px-4 font-normal whitespace-nowrap">Sport Entries</th>
                      <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <SkeletonTableRow key={i} columns={6} />
                      ))
                    ) : athletes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6">
                          <EmptyState
                            icon={IdentificationBadge}
                            title="No athletes found"
                            description="Create a new athlete profile or adjust your search query."
                            actionLabel="New Athlete"
                            onAction={openCreateForm}
                          />
                        </td>
                      </tr>
                    ) : (
                      athletes.map((athlete) => {
                        const entriesCount = athlete.entries_count ?? 0
                        return (
                          <tr
                            key={athlete.id}
                            onClick={() => openAthleteDetail(athlete)}
                            className="hover:bg-surface-2/50 transition-colors cursor-pointer font-sans"
                          >
                            {/* Name */}
                            <td className="py-3.5 px-4 font-medium text-text whitespace-nowrap">
                              <span className="hover:text-accent-bright transition-colors">
                                {athlete.name}
                              </span>
                            </td>

                            {/* 4-digit Code */}
                            <td className="py-3.5 px-4 font-mono text-xs text-accent-bright font-semibold tabular-nums whitespace-nowrap">
                              {formatAthleteCode(athlete.athlete_code)}
                            </td>

                            {/* Academic Year */}
                            <td className="py-3.5 px-4 font-mono text-xs text-muted whitespace-nowrap">
                              {getAcademicYearLabel(athlete.academic_year || '1st')}
                            </td>

                            {/* Roll No */}
                            <td className="py-3.5 px-4 font-mono text-xs text-muted whitespace-nowrap">
                              {athlete.roll_no || '—'}
                            </td>

                            {/* Count of Sport Entries */}
                            <td className="py-3.5 px-4 font-mono text-xs text-text tabular-nums whitespace-nowrap">
                              {entriesCount}
                            </td>

                            {/* Actions */}
                            <td
                              className="py-3.5 px-4 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditForm(athlete)}
                                  aria-label={`Edit ${athlete.name}`}
                                  title="Edit athlete"
                                  className={ADMIN_ICON_BTN}
                                >
                                  <PencilSimple size={15} weight="regular" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRequestDelete(athlete)}
                                  aria-label={`Delete ${athlete.name}`}
                                  title={
                                    entriesCount > 0
                                      ? 'This athlete has sport entries and cannot be deleted.'
                                      : 'Delete athlete'
                                  }
                                  className={ADMIN_ICON_BTN_DANGER}
                                >
                                  <Trash size={15} weight="regular" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* 15 per page Pagination */}
              <div className="py-3.5 px-4 border-t border-border bg-surface-2/60">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalCount={totalCount}
                  pageSize={pageSize}
                  onPageChange={(page) => setCurrentPage(page)}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </section>
          )}
        </>
      )}

      {/* New / Edit Athlete Side Panel */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-scrim" onClick={() => setIsFormOpen(false)} />
          <div className="relative w-full max-w-lg frost-strong border-l border-border rounded-l-3xl h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between z-10 shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-border mb-6">
                <h2 className="font-syne font-bold text-2xl text-text tracking-tight">
                  {editingAthlete ? 'Edit Athlete' : 'New Athlete'}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  aria-label="Close drawer"
                  className="relative hit-44 w-9 h-9 rounded-full border border-border bg-surface-2 flex items-center justify-center text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
                >
                  <X size={18} weight="regular" />
                </button>
              </div>

              <form onSubmit={handleSaveAthlete} className="space-y-4">
                {/* Read-Only Auto-Assigned Athlete Code */}
                <div className="space-y-1.5">
                  <label className={ADMIN_LABEL}>Athlete Code</label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={
                      editingAthlete
                        ? formatAthleteCode(editingAthlete.athlete_code)
                        : 'Auto-assigned on save'
                    }
                    className={`${ADMIN_INPUT} font-mono text-accent-bright font-semibold`}
                  />
                </div>

                {/* Name (Required) */}
                <div className="space-y-1.5">
                  <label className={ADMIN_LABEL}>Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className={ADMIN_INPUT}
                  />
                </div>

                {/* Academic Year & Roll No */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={ADMIN_LABEL}>Academic Year *</label>
                    <select
                      required
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value as AcademicYear)}
                      className={`${ADMIN_SELECT} w-full`}
                    >
                      {ACADEMIC_YEARS.map((yr) => (
                        <option key={yr.value} value={yr.value}>
                          {yr.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={ADMIN_LABEL}>Roll No</label>
                    <input
                      type="text"
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value)}
                      placeholder="Optional"
                      className={ADMIN_INPUT}
                    />
                  </div>
                </div>

                {/* Photo Upload */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className={ADMIN_LABEL}>Athlete Photo</label>
                    <span className="text-xs font-mono text-muted">Max 5 MB · JPG, PNG, WebP</span>
                  </div>
                  <div className="flex items-center gap-3.5">
                    {photoThumbUrl || photoUrl ? (
                      <img
                        src={photoThumbUrl || photoUrl}
                        alt="Preview"
                        width={56}
                        height={56}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-2xl object-cover bg-surface-2 border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                        <User size={24} weight="regular" />
                      </div>
                    )}
                    <label className="flex-1 cursor-pointer">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handlePhotoFile}
                        className="hidden"
                      />
                      <div className="w-full min-h-[42px] bg-surface-2 border border-border hover:border-accent-bright rounded-full px-4 py-2 text-xs text-text flex items-center justify-center gap-2 transition-colors">
                        <UploadSimple size={16} weight="regular" />
                        <span>
                          {isUploadingPhoto
                            ? 'Processing...'
                            : photoUrl
                            ? 'Change photo'
                            : 'Upload photo'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className={ADMIN_LABEL}>Notes</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes"
                    className={ADMIN_TEXTAREA}
                  />
                </div>

                <div className="pt-4 border-t border-border flex justify-end gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsFormOpen(false)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting || isUploadingPhoto}
                    isLoading={isSubmitting}
                    className="rounded-full px-4"
                  >
                    {editingAthlete ? 'Save Changes' : 'Create Athlete'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Athlete Confirmation Dialog */}
      <Dialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Athlete"
        description={
          deleteTarget
            ? `Permanently delete ${deleteTarget.name} (#${formatAthleteCode(deleteTarget.athlete_code)})?`
            : ''
        }
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDeleteTarget(null)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={isDeleting}
            isLoading={isDeleting}
            onClick={handleConfirmDelete}
            className="rounded-full px-4"
          >
            Delete Athlete
          </Button>
        </div>
      </Dialog>

      {/* Register to Sport Panel (Single-Athlete Case of Bulk Register Flow) */}
      <BulkRegisterPanel
        isOpen={isRegisterToSportOpen}
        onClose={() => setIsRegisterToSportOpen(false)}
        activeSeason={activeSeason}
        sports={sports}
        initialAthlete={selectedAthlete}
        onSuccess={async () => {
          markLocalMutation(['athletes', 'players'])
          onRealtimeUpdateRef.current?.()
          await Promise.all([
            selectedAthlete
              ? openAthleteDetail(selectedAthlete, { silent: true })
              : Promise.resolve(),
            loadAthletes(),
            onRefresh()
          ])
        }}
        onCreateNewAthlete={() => {
          setIsRegisterToSportOpen(false)
          setSelectedAthlete(null)
          openCreateForm()
        }}
      />
    </div>
  )
}
