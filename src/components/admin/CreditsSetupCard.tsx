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
  isDemoMode,
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
  const canWrite = isAdmin && !isDemoMode

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

  const loadCredits = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent) || hasLoadedOnceRef.current
      try {
        if (!silent) {
          setIsLoading(true)
        }
        setLoadError(null)
        const rows = await getCreditsPeople()
        setPeople(rows)
        hasLoadedOnceRef.current = true
      } catch (err) {
        const msg = getErrorMessage(err, 'Failed to load credits')
        if (!silent) {
          setLoadError(msg)
        }
        showToast(msg, 'error')
      } finally {
        if (!silent) {
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
      showToast(
        isDemoMode
          ? 'Credits cannot be modified in demo mode.'
          : 'Admin permissions required.',
        'error'
      )
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
      showToast(
        isDemoMode
          ? 'Credits cannot be modified in demo mode.'
          : 'Admin permissions required.',
        'error'
      )
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
      const msg = isDemoMode
        ? 'Credits cannot be modified in demo mode.'
        : 'Admin permissions required.'
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
      showToast(
        isDemoMode
          ? 'Credits cannot be modified in demo mode.'
          : 'Admin permissions required.',
        'error'
      )
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
    <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 space-y-8 shadow-sm">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h2 className="font-syne font-bold text-xl text-text">Credits</h2>
          <p className="text-xs text-muted mt-1">
            Manage main organizers and contributors displayed in the Credits section on the public About page.
          </p>
        </div>

        {isDemoMode && (
          <div className="px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs font-mono text-muted shrink-0">
            Read-only in demo mode
          </div>
        )}
      </div>

      {loadError ? (
        <ErrorState
          title="Failed to load credits"
          message={loadError}
          onRetry={() => loadCredits()}
        />
      ) : isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 bg-surface-2/60 border border-border rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {/* LIST 1: Main people (max 5) */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="font-syne font-bold text-lg text-text">
                  Main people (max 5)
                </h3>
                <span className="px-2.5 py-1 rounded-lg bg-surface-2 border border-border font-mono text-xs text-text tabular-nums">
                  {coreCount} of {MAX_CORE_PEOPLE}
                </span>
                {isCoreFull && (
                  <span className="text-xs text-muted font-sans">
                    Maximum of 5 main people reached.
                  </span>
                )}
              </div>

              <Button
                type="button"
                variant="primary"
                size="sm"
                leftIcon={Plus}
                disabled={isCoreFull || !canWrite}
                onClick={() => openAddDialog('core')}
              >
                Add main person
              </Button>
            </div>

            {corePeople.length === 0 ? (
              <EmptyState
                title="No main people added"
                description="Add up to 5 main people with large photos, roles, and descriptions."
              />
            ) : (
              <div className="bg-bg border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {corePeople.map((person, index) => (
                  <div
                    key={person.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-2/50 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1">
                      <span className="font-mono text-xs text-muted w-6 shrink-0 tabular-nums pt-1 sm:pt-0">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <CreditAvatar
                        name={person.name}
                        photoUrl={person.photo_url}
                        className="w-14 h-14 rounded-xl shrink-0"
                        initialsClassName="text-base"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-syne font-bold text-sm sm:text-base text-text truncate">
                            {person.name}
                          </span>
                          {person.role && (
                            <span className="text-xs font-sans font-normal text-accent-bright">
                              {person.role}
                            </span>
                          )}
                        </div>
                        {person.description && (
                          <p className="text-xs text-muted mt-1 line-clamp-2 leading-relaxed">
                            {person.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        disabled={index === 0 || isReordering || !canWrite}
                        onClick={() => handleMovePerson('core', index, 'up')}
                        title="Move up"
                        aria-label={`Move ${person.name} up`}
                        className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <ArrowUp size={14} weight="bold" />
                      </button>
                      <button
                        type="button"
                        disabled={
                          index === corePeople.length - 1 || isReordering || !canWrite
                        }
                        onClick={() => handleMovePerson('core', index, 'down')}
                        title="Move down"
                        aria-label={`Move ${person.name} down`}
                        className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <ArrowDown size={14} weight="bold" />
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => openEditDialog(person)}
                        title="Edit entry"
                        aria-label={`Edit ${person.name}`}
                        className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <PencilSimple size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => setPersonToDelete(person)}
                        title="Delete entry"
                        aria-label={`Delete ${person.name}`}
                        className="p-2 rounded-lg border border-border text-muted hover:text-error hover:bg-error/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* LIST 2: Contributors */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="font-syne font-bold text-lg text-text">Contributors</h3>
                <span className="px-2.5 py-1 rounded-lg bg-surface-2 border border-border font-mono text-xs text-muted tabular-nums">
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
              >
                Add contributor
              </Button>
            </div>

            {contributorPeople.length === 0 ? (
              <EmptyState
                title="No contributors added"
                description="Add contributors to appear under 'Also thanks to' on the About page."
              />
            ) : (
              <div className="bg-bg border border-border rounded-2xl overflow-hidden divide-y divide-border">
                {contributorPeople.map((person, index) => (
                  <div
                    key={person.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-2/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <span className="font-mono text-xs text-muted w-6 shrink-0 tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </span>

                      <CreditAvatar
                        name={person.name}
                        photoUrl={person.photo_url}
                        className="w-11 h-11 rounded-xl shrink-0"
                        initialsClassName="text-sm"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="font-syne font-bold text-sm text-text truncate">
                          {person.name}
                        </div>
                        {person.role && (
                          <div className="text-xs font-sans font-normal text-muted truncate mt-0.5">
                            {person.role}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        disabled={index === 0 || isReordering || !canWrite}
                        onClick={() => handleMovePerson('contributor', index, 'up')}
                        title="Move up"
                        aria-label={`Move ${person.name} up`}
                        className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <ArrowUp size={14} weight="bold" />
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
                        className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <ArrowDown size={14} weight="bold" />
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => openEditDialog(person)}
                        title="Edit entry"
                        aria-label={`Edit ${person.name}`}
                        className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <PencilSimple size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => setPersonToDelete(person)}
                        title="Delete entry"
                        aria-label={`Delete ${person.name}`}
                        className="p-2 rounded-lg border border-border text-muted hover:text-error hover:bg-error/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <Trash size={14} />
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
        description="Configure name, role, photo, and group placement for the public Credits section."
        size="lg"
      >
        <form onSubmit={handleSavePerson} className="space-y-5">
          {/* Group Toggle: Main vs Contributor */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-2">
              Group
            </label>
            <div
              role="radiogroup"
              aria-label="Credit entry group"
              className="inline-flex items-center p-1 bg-surface-2 border border-border rounded-xl gap-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={formKind === 'core'}
                onClick={() => handleToggleFormKind('core')}
                className={`min-h-[36px] px-4 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                  formKind === 'core'
                    ? 'bg-surface text-text font-medium border border-border shadow-sm'
                    : 'text-muted font-normal hover:text-text border border-transparent'
                }`}
              >
                Main ({otherCoreCount + (formKind === 'core' ? 1 : 0)}/{MAX_CORE_PEOPLE})
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={formKind === 'contributor'}
                onClick={() => handleToggleFormKind('contributor')}
                className={`min-h-[36px] px-4 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                  formKind === 'contributor'
                    ? 'bg-surface text-text font-medium border border-border shadow-sm'
                    : 'text-muted font-normal hover:text-text border border-transparent'
                }`}
              >
                Contributor
              </button>
            </div>
          </div>

          {/* Photo Preview & Upload */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-2">
              Photo (JPG, PNG, or WebP, max 5 MB)
            </label>
            <div className="flex items-center gap-4">
              <CreditAvatar
                name={formName || 'Preview'}
                photoUrl={effectivePreviewUrl}
                className="w-20 h-20 rounded-2xl shrink-0"
                initialsClassName="text-xl"
              />

              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  disabled={isSaving}
                  className="hidden"
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={UploadSimple}
                    disabled={isSaving}
                    onClick={() => fileInputRef.current?.click()}
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
                    >
                      Remove photo
                    </Button>
                  )}
                </div>
                <span className="text-[11px] text-muted">
                  Resized automatically before upload ({formKind === 'core' ? 'max 900 px' : 'max 400 px'}).
                </span>
              </div>
            </div>
          </div>

          {/* Name (required, max 80) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="credit-person-name"
                className="text-xs font-mono uppercase tracking-wider text-muted"
              >
                Name *
              </label>
              <span className="font-mono text-[11px] text-muted tabular-nums">
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
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright disabled:opacity-50"
            />
          </div>

          {/* Role (optional, max 80) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="credit-person-role"
                className="text-xs font-mono uppercase tracking-wider text-muted"
              >
                Role (optional)
              </label>
              <span className="font-mono text-[11px] text-muted tabular-nums">
                {formRole.length} / 80
              </span>
            </div>
            <input
              id="credit-person-role"
              type="text"
              maxLength={80}
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              placeholder="e.g. Tournament Director, Lead Organizer, Developer"
              disabled={isSaving}
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright disabled:opacity-50"
            />
          </div>

          {/* Description (optional, max 400, only for Main people) */}
          {formKind === 'core' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="credit-person-description"
                  className="text-xs font-mono uppercase tracking-wider text-muted"
                >
                  Description (optional)
                </label>
                <span className="font-mono text-[11px] text-muted tabular-nums">
                  {formDescription.length} / 400
                </span>
              </div>
              <textarea
                id="credit-person-description"
                rows={4}
                maxLength={400}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Short bio or contribution summary..."
                disabled={isSaving}
                className="w-full bg-bg border border-border rounded-xl p-3.5 text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright leading-relaxed resize-y disabled:opacity-50"
              />
            </div>
          )}

          {dialogError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-error/10 border border-error/30 flex items-start gap-2.5 text-xs text-error"
            >
              <WarningCircle size={16} weight="bold" className="shrink-0 mt-0.5" />
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
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSaving || !formName.trim()}
              isLoading={isSaving}
            >
              {editingPerson ? 'Save Changes' : 'Add Entry'}
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
            ? `Are you sure you want to remove "${personToDelete.name}" from Credits? This action cannot be undone.`
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
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
