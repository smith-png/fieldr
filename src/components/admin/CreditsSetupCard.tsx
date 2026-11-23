import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { validateImageFile } from '../../lib/imageCompression'
import {
  createCreditPerson,
  deleteCreditPerson,
  deleteCreditPhotoFromBucket,
  getCreditsPeople,
  reorderCreditsPeople,
  updateCreditPerson,
  uploadCreditPhoto
} from '../../lib/data'
import { Button, Dialog, EmptyState, ErrorState } from '../ui'
import { CreditAvatar } from '../credits/CreditsSection'
import type { CreditKind, CreditPerson } from '../../types'

const MAX_CORE_PEOPLE = 5

export const CreditsSetupCard: React.FC = () => {
  const { user } = useAuth()
  const { showToast } = useToast()

  const isAdmin = user?.role === 'admin'
  const canWrite = isAdmin

  const [people, setPeople] = useState<CreditPerson[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const hasLoadedOnceRef = useRef<boolean>(false)

  // Add / Edit Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false)
  const [editingPerson, setEditingPerson] = useState<CreditPerson | null>(null)
  const [formKind, setFormKind] = useState<CreditKind>('core')
  const [formName, setFormName] = useState<string>('')
  const [formRole, setFormRole] = useState<string>('')
  const [formDescription, setFormDescription] = useState<string>('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null)
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState<boolean>(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isReordering, setIsReordering] = useState<boolean>(false)

  // Delete confirmation Dialog state
  const [personToDelete, setPersonToDelete] = useState<CreditPerson | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isMountedRef = useRef(true)
  const latestReqIdRef = useRef(0)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadCredits = useCallback(
    async (options?: { silent?: boolean }) => {
      const reqId = ++latestReqIdRef.current
      const silent = Boolean(options?.silent) || hasLoadedOnceRef.current
      try {
        if (!silent) {
          setIsLoading(true)
        }
        setLoadError(null)
        const rows = await getCreditsPeople()
        if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
        setPeople(rows)
        hasLoadedOnceRef.current = true
      } catch (err) {
        if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
        const msg = getErrorMessage(err, 'Failed to load credits')
        if (!silent) {
          setLoadError(msg)
        }
        showToast(msg, 'error')
      } finally {
        if (!silent && isMountedRef.current && reqId === latestReqIdRef.current) {
          setIsLoading(false)
        }
      }
    },
    [showToast]
  )

  useEffect(() => {
    void loadCredits()
  }, [loadCredits])

  // Revoke object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl)
      }
    }
  }, [filePreviewUrl])

  const corePeople = useMemo(
    () =>
      people
        .filter((p) => p.kind === 'core')
        .sort(
          (a, b) =>
            a.sort_order - b.sort_order ||
            (a.created_at || '').localeCompare(b.created_at || '')
        ),
    [people]
  )

  const contributorPeople = useMemo(
    () =>
      people
        .filter((p) => p.kind === 'contributor')
        .sort(
          (a, b) =>
            a.sort_order - b.sort_order ||
            (a.created_at || '').localeCompare(b.created_at || '')
        ),
    [people]
  )

  const coreCount = corePeople.length
  const isCoreFull = coreCount >= MAX_CORE_PEOPLE

  // Number of OTHER core entries besides the one currently being edited
  const otherCoreCount = useMemo(
    () => corePeople.filter((p) => p.id !== editingPerson?.id).length,
    [corePeople, editingPerson?.id]
  )

  const clearSelectedFile = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl)
    }
    setSelectedFile(null)
    setFilePreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const openAddDialog = (kind: CreditKind) => {
    if (!canWrite) {
      showToast('Admin permissions required.', 'error')
      return
    }
    if (kind === 'core' && isCoreFull) {
      return
    }

    clearSelectedFile()
    setEditingPerson(null)
    setFormKind(kind)
    setFormName('')
    setFormRole('')
    setFormDescription('')
    setRemoveExistingPhoto(false)
    setDialogError(null)
    setIsDialogOpen(true)
  }

  const openEditDialog = (person: CreditPerson) => {
    if (!canWrite) {
      showToast('Admin permissions required.', 'error')
      return
    }

    clearSelectedFile()
    setEditingPerson(person)
    setFormKind(person.kind)
    setFormName(person.name || '')
    setFormRole(person.role || '')
    setFormDescription(person.description || '')
    setRemoveExistingPhoto(false)
    setDialogError(null)
    setIsDialogOpen(true)
  }

  const closeEditDialog = () => {
    if (isSaving) return
    clearSelectedFile()
    setIsDialogOpen(false)
    setEditingPerson(null)
    setDialogError(null)
  }

  const handleToggleFormKind = (nextKind: CreditKind) => {
    setDialogError(null)
    if (nextKind === 'core' && otherCoreCount >= MAX_CORE_PEOPLE) {
      setDialogError(
        `Main people is already at ${MAX_CORE_PEOPLE} of ${MAX_CORE_PEOPLE}. Remove or change an existing main person before switching this entry to Main.`
      )
      return
    }
    setFormKind(nextKind)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDialogError(null)
    const file = e.target.files?.[0]
    if (!file) return

    try {
      validateImageFile(file)
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl)
      }
      const nextPreview = URL.createObjectURL(file)
      setSelectedFile(file)
      setFilePreviewUrl(nextPreview)
      setRemoveExistingPhoto(false)
    } catch (err) {
      const msg = getErrorMessage(err, 'Invalid image file.')
      setDialogError(msg)
      showToast(msg, 'error')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSaving) return

    if (!canWrite) {
      const msg = 'Admin permissions required.'
      setDialogError(msg)
      showToast(msg, 'error')
      return
    }

    const trimmedName = formName.trim()
    if (!trimmedName) {
      setDialogError('Name is required.')
      return
    }
    if (trimmedName.length > 80) {
      setDialogError('Name must be 80 characters or fewer.')
      return
    }

    const trimmedRole = formRole.trim()
    if (trimmedRole.length > 80) {
      setDialogError('Role must be 80 characters or fewer.')
      return
    }

    const trimmedDescription = formKind === 'core' ? formDescription.trim() : ''
    if (trimmedDescription.length > 400) {
      setDialogError('Description must be 400 characters or fewer.')
      return
    }

    if (formKind === 'core' && otherCoreCount >= MAX_CORE_PEOPLE) {
      const msg = `Only ${MAX_CORE_PEOPLE} main people are allowed.`
      setDialogError(msg)
      showToast(msg, 'error')
      return
    }

    let uploadedNewPhotoUrl: string | null = null

    try {
      setIsSaving(true)
      setDialogError(null)

      const oldPhotoUrl = editingPerson?.photo_url || null
      let nextPhotoUrl: string | null = oldPhotoUrl

      if (selectedFile) {
        uploadedNewPhotoUrl = await uploadCreditPhoto(selectedFile, formKind)
        nextPhotoUrl = uploadedNewPhotoUrl
      } else if (removeExistingPhoto) {
        nextPhotoUrl = null
      }

      if (editingPerson) {
        const kindChanged = editingPerson.kind !== formKind
        const targetList = formKind === 'core' ? corePeople : contributorPeople
        const maxSortOrder =
          targetList.length > 0
            ? Math.max(...targetList.map((p) => p.sort_order ?? 0)) + 1
            : 0

        await updateCreditPerson(editingPerson.id, {
          kind: formKind,
          name: trimmedName,
          role: trimmedRole || null,
          description: formKind === 'core' ? trimmedDescription || null : null,
          photo_url: nextPhotoUrl,
          sort_order: kindChanged ? maxSortOrder : editingPerson.sort_order
        })

        // Delete old photo from bucket if it was replaced or removed
        if (oldPhotoUrl && oldPhotoUrl !== nextPhotoUrl) {
          await deleteCreditPhotoFromBucket(oldPhotoUrl)
        }

        showToast(`Updated "${trimmedName}"`, 'success')
      } else {
        const targetList = formKind === 'core' ? corePeople : contributorPeople
        const nextSortOrder =
          targetList.length > 0
            ? Math.max(...targetList.map((p) => p.sort_order ?? 0)) + 1
            : 0

        await createCreditPerson({
          kind: formKind,
          name: trimmedName,
          role: trimmedRole || null,
          description: formKind === 'core' ? trimmedDescription || null : null,
          photo_url: nextPhotoUrl,
          sort_order: nextSortOrder
        })

        showToast(`Added "${trimmedName}"`, 'success')
      }

      clearSelectedFile()
      setIsDialogOpen(false)
      setEditingPerson(null)
      await loadCredits({ silent: true })
    } catch (err) {
      // Clean up newly uploaded photo if database save failed
      if (uploadedNewPhotoUrl) {
        await deleteCreditPhotoFromBucket(uploadedNewPhotoUrl)
      }
      const msg = getErrorMessage(err, 'Failed to save credit entry')
      setDialogError(msg)
      showToast(msg, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleMovePerson = async (
    kind: CreditKind,
    index: number,
    direction: 'up' | 'down'
  ) => {
    if (!canWrite || isReordering) return

    const list = kind === 'core' ? [...corePeople] : [...contributorPeople]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= list.length) return

    const temp = list[index]
    list[index] = list[targetIndex]
    list[targetIndex] = temp

    const reorderedUpdates = list.map((item, idx) => ({
      id: item.id,
      sort_order: idx
    }))

    // Optimistic local state update without flashing
    const sortMap = new Map<string, number>()
    for (const u of reorderedUpdates) {
      sortMap.set(u.id, u.sort_order)
    }
    setPeople((prev) =>
      prev.map((p) => (sortMap.has(p.id) ? { ...p, sort_order: sortMap.get(p.id)! } : p))
    )

    try {
      setIsReordering(true)
      await reorderCreditsPeople(reorderedUpdates)
      await loadCredits({ silent: true })
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to reorder credits'), 'error')
      await loadCredits({ silent: true })
    } finally {
      setIsReordering(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!personToDelete || isDeleting) return
    if (!canWrite) {
      showToast('Admin permissions required.', 'error')
      return
    }

    try {
      setIsDeleting(true)
      const target = personToDelete
      await deleteCreditPerson(target.id, target.photo_url)
      setPersonToDelete(null)
      showToast(`Deleted "${target.name}"`, 'success')
      await loadCredits({ silent: true })
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete credit entry'), 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  const effectivePreviewUrl = filePreviewUrl
    ? filePreviewUrl
    : removeExistingPhoto
    ? null
    : editingPerson?.photo_url || null

  return (
    <section className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-border">
        <h2 className="font-syne font-bold text-xl text-text tracking-tight">Credits</h2>
      </div>

      {loadError ? (
        <ErrorState
          title="Failed to load credits"
          message={loadError}
          onRetry={() => loadCredits()}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 bg-bg border border-border rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Column 1: Main people (max 5) */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="text-sm font-medium text-text">Main people</h3>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {coreCount} / {MAX_CORE_PEOPLE}
                </span>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={Plus}
                disabled={isCoreFull || !canWrite}
                onClick={() => openAddDialog('core')}
                className="rounded-full"
              >
                Add main person
              </Button>
            </div>

            {corePeople.length === 0 ? (
              <EmptyState
                title="No main people"
                description="Add up to 5 main people."
              />
            ) : (
              <div className="bg-bg border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {corePeople.map((person, index) => (
                  <div
                    key={person.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3.5 min-w-0 flex-1">
                      <CreditAvatar
                        name={person.name}
                        photoUrl={person.photo_url}
                        className="w-12 h-12 rounded-2xl shrink-0"
                        initialsClassName="text-sm"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-syne font-bold text-sm text-text truncate">
                            {person.name}
                          </span>
                          {person.role && (
                            <span className="text-xs text-accent-bright truncate">
                              {person.role}
                            </span>
                          )}
                        </div>
                        {person.description && (
                          <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-relaxed">
                            {person.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        disabled={index === 0 || isReordering || !canWrite}
                        onClick={() => handleMovePerson('core', index, 'up')}
                        title="Move up"
                        aria-label={`Move ${person.name} up`}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <ArrowUp size={15} weight="regular" />
                      </button>
                      <button
                        type="button"
                        disabled={
                          index === corePeople.length - 1 || isReordering || !canWrite
                        }
                        onClick={() => handleMovePerson('core', index, 'down')}
                        title="Move down"
                        aria-label={`Move ${person.name} down`}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <ArrowDown size={15} weight="regular" />
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => openEditDialog(person)}
                        title="Edit entry"
                        aria-label={`Edit ${person.name}`}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <PencilSimple size={15} weight="regular" />
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => setPersonToDelete(person)}
                        title="Delete entry"
                        aria-label={`Delete ${person.name}`}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-error hover:bg-error/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <Trash size={15} weight="regular" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Contributors */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="text-sm font-medium text-text">Contributors</h3>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {contributorPeople.length}
                </span>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={Plus}
                disabled={!canWrite}
                onClick={() => openAddDialog('contributor')}
                className="rounded-full"
              >
                Add contributor
              </Button>
            </div>

            {contributorPeople.length === 0 ? (
              <EmptyState
                title="No contributors"
                description="Add contributors to appear on the About page."
              />
            ) : (
              <div className="bg-bg border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {contributorPeople.map((person, index) => (
                  <div
                    key={person.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <CreditAvatar
                        name={person.name}
                        photoUrl={person.photo_url}
                        className="w-10 h-10 rounded-2xl shrink-0"
                        initialsClassName="text-xs"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="font-syne font-bold text-sm text-text truncate">
                          {person.name}
                        </div>
                        {person.role && (
                          <div className="text-xs text-muted truncate mt-0.5">
                            {person.role}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        disabled={index === 0 || isReordering || !canWrite}
                        onClick={() => handleMovePerson('contributor', index, 'up')}
                        title="Move up"
                        aria-label={`Move ${person.name} up`}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <ArrowUp size={15} weight="regular" />
                      </button>
                      <button
                        type="button"
                        disabled={
                          index === contributorPeople.length - 1 ||
                          isReordering ||
                          !canWrite
                        }
                        onClick={() => handleMovePerson('contributor', index, 'down')}
                        title="Move down"
                        aria-label={`Move ${person.name} down`}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <ArrowDown size={15} weight="regular" />
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => openEditDialog(person)}
                        title="Edit entry"
                        aria-label={`Edit ${person.name}`}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <PencilSimple size={15} weight="regular" />
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => setPersonToDelete(person)}
                        title="Delete entry"
                        aria-label={`Delete ${person.name}`}
                        className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-error hover:bg-error/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      >
                        <Trash size={15} weight="regular" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Credit Person Dialog */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={closeEditDialog}
        title={editingPerson ? 'Edit Credit Entry' : 'Add Credit Entry'}
        size="lg"
      >
        <form onSubmit={handleSavePerson} className="space-y-5">
          {/* Group Toggle: Main vs Contributor */}
          <div>
            <label className="block text-sm font-medium text-text mb-2">Group</label>
            <div
              role="radiogroup"
              aria-label="Credit entry group"
              className="inline-flex items-center p-1 bg-surface-2 border border-border rounded-full gap-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={formKind === 'core'}
                onClick={() => handleToggleFormKind('core')}
                className={`min-h-[34px] px-4 py-1 rounded-full text-xs font-sans transition-colors cursor-pointer ${
                  formKind === 'core'
                    ? 'bg-btn-bg text-btn-fg font-medium'
                    : 'text-muted font-normal hover:text-text'
                }`}
              >
                Main ({otherCoreCount + (formKind === 'core' ? 1 : 0)}/{MAX_CORE_PEOPLE})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={formKind === 'contributor'}
                onClick={() => handleToggleFormKind('contributor')}
                className={`min-h-[34px] px-4 py-1 rounded-full text-xs font-sans transition-colors cursor-pointer ${
                  formKind === 'contributor'
                    ? 'bg-btn-bg text-btn-fg font-medium'
                    : 'text-muted font-normal hover:text-text'
                }`}
              >
                Contributor
              </button>
            </div>
          </div>

          {/* Photo Preview & Upload */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="text-sm font-medium text-text">Photo</label>
              <span className="text-xs text-muted">JPG, PNG, WebP · max 5 MB</span>
            </div>
            <div className="flex items-center gap-4">
              <CreditAvatar
                name={formName || 'Preview'}
                photoUrl={effectivePreviewUrl}
                className="w-18 h-18 rounded-2xl shrink-0"
                initialsClassName="text-lg"
              />

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  disabled={isSaving}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={UploadSimple}
                  disabled={isSaving}
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full"
                >
                  {effectivePreviewUrl ? 'Replace photo' : 'Upload photo'}
                </Button>

                {effectivePreviewUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    leftIcon={X}
                    disabled={isSaving}
                    onClick={() => {
                      clearSelectedFile()
                      setRemoveExistingPhoto(true)
                    }}
                    className="rounded-full"
                  >
                    Remove photo
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Name & Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="credit-person-name"
                  className="text-sm font-medium text-text"
                >
                  Name
                </label>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {formName.length} / 80
                </span>
              </div>
              <input
                id="credit-person-name"
                type="text"
                maxLength={80}
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Full name"
                disabled={isSaving}
                className="w-full min-h-[42px] bg-bg border border-border rounded-2xl px-4 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright disabled:opacity-50"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="credit-person-role"
                  className="text-sm font-medium text-text"
                >
                  Role
                </label>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {formRole.length} / 80
                </span>
              </div>
              <input
                id="credit-person-role"
                type="text"
                maxLength={80}
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                placeholder="Optional"
                disabled={isSaving}
                className="w-full min-h-[42px] bg-bg border border-border rounded-2xl px-4 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright disabled:opacity-50"
              />
            </div>
          </div>

          {/* Description (optional, max 400, only for Main people) */}
          {formKind === 'core' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="credit-person-description"
                  className="text-sm font-medium text-text"
                >
                  Description
                </label>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {formDescription.length} / 400
                </span>
              </div>
              <textarea
                id="credit-person-description"
                rows={4}
                maxLength={400}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional short bio"
                disabled={isSaving}
                className="w-full bg-bg border border-border rounded-2xl p-3.5 text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright leading-relaxed resize-y disabled:opacity-50"
              />
            </div>
          )}

          {dialogError && (
            <div
              role="alert"
              className="p-3 rounded-2xl bg-error/10 border border-error/30 flex items-start gap-2.5 text-xs text-error"
            >
              <WarningCircle size={16} weight="regular" className="shrink-0 mt-0.5" />
              <span>{dialogError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSaving}
              onClick={closeEditDialog}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSaving || !formName.trim()}
              isLoading={isSaving}
              className="rounded-full px-4"
            >
              {editingPerson ? 'Save changes' : 'Add entry'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(personToDelete)}
        onClose={() => {
          if (!isDeleting) setPersonToDelete(null)
        }}
        title="Delete Credit Entry"
        description={
          personToDelete
            ? `Remove "${personToDelete.name}" from Credits? This cannot be undone.`
            : undefined
        }
        size="sm"
      >
        <div className="flex justify-end gap-2.5 pt-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isDeleting}
            onClick={() => setPersonToDelete(null)}
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
            Delete
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
