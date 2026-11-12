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
  markLocalMutation,
  subscribeToAthletes,
  updateAthlete,
  uploadPlayerPhotos
} from '../../lib/data'
import { ACADEMIC_YEARS, getAcademicYearLabel } from '../../lib/academicYears'
import { validateImageFile } from '../../lib/imageCompression'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { Button, Dialog, EmptyState, PageHeader, Pagination } from '../../components/ui'
import { BulkRegisterPanel } from '../../components/admin'

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

  // Pagination & Search state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(15)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const hasLoadedOnceRef = useRef(false)
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

  const loadAthletes = useCallback(async () => {
    const reqId = ++latestReqIdRef.current
    try {
      if (!hasLoadedOnceRef.current) {
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
    } catch (err: unknown) {
      if (isMountedRef.current && reqId === latestReqIdRef.current) {
        showToast(getErrorMessage(err, 'Failed to load athletes'), 'error')
      }
    } finally {
      if (isMountedRef.current && reqId === latestReqIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [currentPage, pageSize, debouncedSearch, showToast])

  useEffect(() => {
    loadAthletes()
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

  useEffect(() => {
    const unsubscribe = subscribeToAthletes(() => {
      loadAthletes()
      if (selectedAthleteRef.current) {
        openAthleteDetail(selectedAthleteRef.current, { silent: true })
      }
      onRealtimeUpdateRef.current?.()
    })
    return () => {
      unsubscribe()
    }
  }, [loadAthletes, openAthleteDetail])

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
      await Promise.all([loadAthletes(), onRefresh()])
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
      await Promise.all([loadAthletes(), onRefresh()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to delete athlete'), 'error')
      setDeleteTarget(null)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {selectedAthlete ? (
        /* ATHLETE DETAIL VIEW */
        <div className="space-y-6">
          <PageHeader
            label={`Athlete Profile #${formatAthleteCode(selectedAthlete.athlete_code)}`}
            title={selectedAthlete.name}
            backAction={
              <Button
                variant="secondary"
                size="icon"
                onClick={() => setSelectedAthlete(null)}
                aria-label="Back to Athletes"
              >
                <ArrowLeft size={18} weight="bold" />
              </Button>
            }
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={UserPlus}
                  onClick={() => setIsRegisterToSportOpen(true)}
                >
                  Register to sport
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={PencilSimple}
                  onClick={() => openEditForm(selectedAthlete)}
                >
                  Edit Athlete
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={Trash}
                  onClick={() =>
                    handleRequestDelete({
                      ...selectedAthlete,
                      entries_count: athleteEntries.length
                    })
                  }
                  className="hover:text-error hover:border-error/40"
                >
                  Delete
                </Button>
              </>
            }
          />

          {/* Athlete Profile Card */}
          <div className="bg-surface border border-border rounded-2xl p-6 flex flex-col sm:flex-row items-start gap-6 shadow-sm">
            {selectedAthlete.photo_thumb_url || selectedAthlete.photo_url ? (
              <img
                src={selectedAthlete.photo_thumb_url || selectedAthlete.photo_url}
                alt={selectedAthlete.name}
                referrerPolicy="no-referrer"
                className="w-24 h-24 rounded-2xl object-cover bg-surface-2 border border-border shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                <User size={36} />
              </div>
            )}

            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full text-xs">
              <div>
                <span className="font-mono uppercase text-[10px] tracking-wider text-muted block mb-1">
                  Athlete Code
                </span>
                <span className="font-mono font-bold text-sm text-accent-bright tabular-nums">
                  {formatAthleteCode(selectedAthlete.athlete_code)}
                </span>
              </div>

              <div>
                <span className="font-mono uppercase text-[10px] tracking-wider text-muted block mb-1">
                  Academic Year
                </span>
                <span className="font-mono font-semibold text-sm text-text">
                  {getAcademicYearLabel(selectedAthlete.academic_year || '1st')}
                </span>
              </div>

              <div>
                <span className="font-mono uppercase text-[10px] tracking-wider text-muted block mb-1">
                  Roll No
                </span>
                <span className="font-mono text-sm text-text">
                  {selectedAthlete.roll_no || '—'}
                </span>
              </div>

              <div>
                <span className="font-mono uppercase text-[10px] tracking-wider text-muted block mb-1">
                  Sport Entries
                </span>
                <span className="font-mono font-semibold text-sm text-text tabular-nums">
                  {athleteEntries.length}
                </span>
              </div>

              <div className="col-span-2 sm:col-span-4 pt-3 border-t border-border">
                <span className="font-mono uppercase text-[10px] tracking-wider text-muted block mb-1">
                  Notes
                </span>
                <p className="text-xs text-text whitespace-pre-wrap">
                  {selectedAthlete.notes || 'No notes recorded.'}
                </p>
              </div>
            </div>
          </div>

          {/* Sport Entries Across Seasons Table */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IdentificationBadge size={18} className="text-accent-bright" />
                <h2 className="font-syne font-bold text-base text-text">
                  Sport Entries Across Seasons
                </h2>
              </div>
              <span className="text-xs font-mono text-muted tabular-nums">
                {athleteEntries.length} {athleteEntries.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 font-normal">Season Name</th>
                    <th className="py-3 px-4 font-normal">Sport</th>
                    <th className="py-3 px-4 font-normal">Role</th>
                    <th className="py-3 px-4 font-normal">Academic Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoadingDetail ? (
                    Array.from({ length: 3 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td colSpan={4} className="py-4 px-4 h-12 bg-surface-2/40" />
                      </tr>
                    ))
                  ) : athleteEntries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-10 px-4 text-center text-muted">
                        This athlete has no sport entries in any season yet.
                      </td>
                    </tr>
                  ) : (
                    athleteEntries.map((entry) => (
                      <tr key={entry.player_id} className="hover:bg-surface-2/60 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-text">
                          <div className="flex items-center gap-2">
                            <span>{entry.season_name}</span>
                            {entry.is_season_active && (
                              <span className="font-mono text-[10px] uppercase text-accent-bright font-semibold">
                                · Active
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-text">{entry.sport}</td>
                        <td className="py-3.5 px-4 text-muted">{entry.playing_role}</td>
                        <td className="py-3.5 px-4 font-mono text-muted">
                          {getAcademicYearLabel(entry.academic_year || '1st')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ATHLETES LIST VIEW */
        <>
          <PageHeader
            label="Universal Athlete Directory"
            title="Athletes"
            subtitle="Manage universal student athlete profiles shared across all tournament seasons."
            actions={
              <Button
                variant="primary"
                size="md"
                leftIcon={Plus}
                onClick={openCreateForm}
              >
                New Athlete
              </Button>
            }
          />

          {/* Search Bar */}
          <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <MagnifyingGlass
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, 4-digit code (e.g. 0001), or roll no..."
                className="w-full bg-bg border border-border rounded-xl pl-10 pr-4 py-2 text-xs text-text placeholder-muted focus:outline-none focus:border-accent-bright"
              />
            </div>

            <div className="text-xs font-mono text-muted tabular-nums">
              Total Athletes: <span className="text-text font-semibold">{totalCount}</span>
            </div>
          </div>

          {/* Athletes Table */}
          <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 font-normal">Name</th>
                    <th className="py-3 px-4 font-normal">Code</th>
                    <th className="py-3 px-4 font-normal">Academic Year</th>
                    <th className="py-3 px-4 font-normal">Roll No</th>
                    <th className="py-3 px-4 font-normal">Sport Entries</th>
                    <th className="py-3 px-4 font-normal text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={6} className="py-4 px-4 h-12 bg-surface-2/40" />
                      </tr>
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
                          className="hover:bg-surface-2/60 transition-colors cursor-pointer font-sans"
                        >
                          {/* Name */}
                          <td className="py-3.5 px-4 font-medium text-text">
                            <span className="hover:text-accent-bright transition-colors">
                              {athlete.name}
                            </span>
                          </td>

                          {/* 4-digit Code */}
                          <td className="py-3.5 px-4 font-mono text-[11px] text-accent-bright font-semibold tabular-nums">
                            {formatAthleteCode(athlete.athlete_code)}
                          </td>

                          {/* Academic Year */}
                          <td className="py-3.5 px-4 font-mono text-muted">
                            {getAcademicYearLabel(athlete.academic_year || '1st')}
                          </td>

                          {/* Roll No */}
                          <td className="py-3.5 px-4 font-mono text-muted">
                            {athlete.roll_no || '—'}
                          </td>

                          {/* Count of Sport Entries */}
                          <td className="py-3.5 px-4 font-mono text-text tabular-nums">
                            {entriesCount}
                          </td>

                          {/* Actions */}
                          <td
                            className="py-3.5 px-4 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditForm(athlete)}
                                title="Edit athlete"
                                className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                              >
                                <PencilSimple size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRequestDelete(athlete)}
                                title={
                                  entriesCount > 0
                                    ? 'This athlete has sport entries and cannot be deleted.'
                                    : 'Delete athlete'
                                }
                                className="p-1.5 rounded-lg border border-border text-muted hover:text-error hover:bg-error/10 transition-colors"
                              >
                                <Trash size={14} />
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
            <div className="py-3 px-4 border-t border-border bg-surface-2">
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
        </>
      )}

      {/* New / Edit Athlete Side Panel */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-scrim"
            onClick={() => setIsFormOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-surface border-l border-border h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between z-10 shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border mb-6">
                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
                    {editingAthlete ? 'Update Athlete' : 'New Athlete'}
                  </span>
                  <h2 className="font-syne font-bold text-2xl text-text">
                    {editingAthlete ? 'Edit Athlete' : 'New Athlete'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="p-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <form onSubmit={handleSaveAthlete} className="space-y-4">
                {/* Read-Only Auto-Assigned Athlete Code */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Athlete Code (4-Digit ID)
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={
                      editingAthlete
                        ? formatAthleteCode(editingAthlete.athlete_code)
                        : 'Auto-assigned on save'
                    }
                    className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2 text-xs font-mono text-accent-bright font-semibold cursor-not-allowed"
                  />
                </div>

                {/* Name (Required) */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  />
                </div>

                {/* Academic Year Dropdown (Required) */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Academic Year *
                  </label>
                  <select
                    required
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value as AcademicYear)}
                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  >
                    {ACADEMIC_YEARS.map((yr) => (
                      <option key={yr.value} value={yr.value}>
                        {yr.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Roll No */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Roll No
                  </label>
                  <input
                    type="text"
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    placeholder="Optional roll number"
                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  />
                </div>

                {/* Photo Upload */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Athlete Photo (Max 5 MB, JPG/PNG/WebP)
                  </label>
                  <div className="flex items-center gap-3">
                    {photoThumbUrl || photoUrl ? (
                      <img
                        src={photoThumbUrl || photoUrl}
                        alt="Preview"
                        referrerPolicy="no-referrer"
                        className="w-14 h-14 rounded-xl object-cover bg-surface-2 border border-border shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                        <User size={24} />
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
                      <div className="w-full bg-surface-2 border border-border hover:border-accent-bright rounded-xl px-3.5 py-2 text-xs text-text flex items-center justify-center gap-2 transition-colors">
                        <UploadSimple size={16} />
                        <span>
                          {isUploadingPhoto
                            ? 'Processing & generating thumbnail...'
                            : photoUrl
                            ? 'Change photo'
                            : 'Upload photo'}
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes..."
                    className="w-full bg-bg border border-border rounded-xl p-3 text-xs text-text focus:outline-none focus:border-accent-bright resize-none"
                  />
                </div>

                <div className="pt-4 border-t border-border flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsFormOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting || isUploadingPhoto}
                    isLoading={isSubmitting}
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
            ? `Are you sure you want to permanently delete ${deleteTarget.name} (#${formatAthleteCode(deleteTarget.athlete_code)})?`
            : ''
        }
        size="sm"
      >
        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setDeleteTarget(null)}
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
