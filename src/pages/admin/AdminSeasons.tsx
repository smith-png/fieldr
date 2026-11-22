import React, { useRef, useState } from 'react'
import {
  Calendar,
  DownloadSimple,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  WarningCircle
} from '@phosphor-icons/react'
import type { Season, SeasonDeletionCounts } from '../../types'
import {
  createSeason,
  deleteSeason,
  getSeasonDeletionPreview,
  renameSeason,
  setActiveSeason
} from '../../lib/data'
import {
  exportSeasonBackup,
  formatBackupCountsSummary,
  parseAndValidateBackupFile,
  restoreSeasonFromBackup,
  type BackupProgress,
  type ValidatedSeasonBackup
} from '../../lib/seasonBackup'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog } from '../../components/ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_DIALOG_CLASS,
  ADMIN_ICON_BTN_DANGER,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_PAGE_HEADER,
  ADMIN_PAGE_TITLE,
  ADMIN_PAGE_WRAPPER,
  ADMIN_TEXTAREA,
  ADMIN_WELL
} from '../../components/admin/adminStyles'

interface AdminSeasonsProps {
  seasons: Season[]
  activeSeason: Season | null
  onRefresh: () => Promise<void>
}

export const AdminSeasons: React.FC<AdminSeasonsProps> = ({
  seasons,
  activeSeason,
  onRefresh
}) => {
  const { success, error } = useToast()

  // Form state
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Rename modal state
  const [seasonToRename, setSeasonToRename] = useState<Season | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)

  // Delete modal state
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null)
  const [deletionCounts, setDeletionCounts] = useState<SeasonDeletionCounts | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [confirmationName, setConfirmationName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const previewReqIdRef = useRef(0)

  // Backup state
  const [backingUpSeasonId, setBackingUpSeasonId] = useState<string | null>(null)
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null)

  // Restore state
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingRestore, setPendingRestore] = useState<ValidatedSeasonBackup | null>(null)
  const [isParsingBackup, setIsParsingBackup] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    if (startDate && endDate && endDate < startDate) {
      error('End date must be on or after start date')
      return
    }

    try {
      setIsSubmitting(true)
      const created = await createSeason(
        trimmedName,
        startDate || undefined,
        endDate || undefined,
        description || undefined
      )
      setName('')
      setStartDate('')
      setEndDate('')
      setDescription('')
      success(`Season "${created.name}" created successfully`)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create season'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSetActive = async (id: string, seasonName: string) => {
    try {
      await setActiveSeason(id)
      success(`"${seasonName}" is now the active tournament`)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set active season'
      error(msg)
    }
  }

  const openRenameDialog = (season: Season) => {
    setSeasonToRename(season)
    setRenameInput(season.name)
  }

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!seasonToRename) return
    const trimmed = renameInput.trim()
    if (trimmed.length < 1 || trimmed.length > 60) {
      error('Season name must be between 1 and 60 characters')
      return
    }

    try {
      setIsRenaming(true)
      await renameSeason(seasonToRename.id, trimmed)
      success(`Season renamed to "${trimmed}"`)
      setSeasonToRename(null)
      setRenameInput('')
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to rename season'
      error(msg)
    } finally {
      setIsRenaming(false)
    }
  }

  const openDeleteDialog = async (season: Season) => {
    setSeasonToDelete(season)
    setConfirmationName('')
    const reqId = ++previewReqIdRef.current
    setIsLoadingPreview(true)
    try {
      const counts = await getSeasonDeletionPreview(season.id)
      if (reqId === previewReqIdRef.current) {
        setDeletionCounts(counts)
      }
    } catch {
      if (reqId === previewReqIdRef.current) {
        setDeletionCounts({
          teams: 0,
          players: 0,
          purse_transactions: 0,
          carousel_items: 0
        })
      }
    } finally {
      if (reqId === previewReqIdRef.current) {
        setIsLoadingPreview(false)
      }
    }
  }

  const confirmDelete = async () => {
    if (!seasonToDelete) return
    if (confirmationName.trim() !== seasonToDelete.name.trim()) return

    try {
      setIsDeleting(true)
      await deleteSeason(seasonToDelete.id)
      success(`Season "${seasonToDelete.name}" deleted successfully`)
      setSeasonToDelete(null)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete season'
      error(msg)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBackupSeason = async (season: Season) => {
    if (backingUpSeasonId || isRestoring) return
    try {
      setBackingUpSeasonId(season.id)
      setBackupProgress({ step: 1, totalSteps: 9, label: 'Starting backup...' })
      const result = await exportSeasonBackup(season, (progress) => {
        setBackupProgress(progress)
      })
      success(`Backup downloaded: ${formatBackupCountsSummary(result.counts)}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to back up season'
      error(msg)
    } finally {
      setBackingUpSeasonId(null)
      setBackupProgress(null)
    }
  }

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      setIsParsingBackup(true)
      const validated = await parseAndValidateBackupFile(file)
      setPendingRestore(validated)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid backup file'
      error(msg)
    } finally {
      setIsParsingBackup(false)
    }
  }

  const confirmRestore = async () => {
    if (!pendingRestore || isRestoring) return
    try {
      setIsRestoring(true)
      const result = await restoreSeasonFromBackup(pendingRestore.backup)
      success(
        `Restored "${result.season_name}" (${result.counts.teams} teams, ${result.counts.players} players, ${result.counts.athletes_created} new / ${result.counts.athletes_matched} matched athletes)`
      )
      setPendingRestore(null)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to restore season backup'
      error(msg)
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className={ADMIN_PAGE_WRAPPER}>
      <header className={ADMIN_PAGE_HEADER}>
        <h1 className={ADMIN_PAGE_TITLE}>Tournament Seasons</h1>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={restoreFileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleRestoreFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={UploadSimple}
            onClick={() => restoreFileInputRef.current?.click()}
            disabled={isParsingBackup || isRestoring || Boolean(backingUpSeasonId)}
            isLoading={isParsingBackup}
            className="rounded-full"
          >
            Restore from backup
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Create Season Card */}
        <section className={ADMIN_CARD}>
          <div className={ADMIN_CARD_HEADER}>
            <h2 className={ADMIN_CARD_TITLE}>Create Season</h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="season-name-input" className={ADMIN_LABEL}>
                Season Name *
              </label>
              <input
                id="season-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Annual Athletic Championship 2027"
                required
                className={ADMIN_INPUT}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="season-start-date" className={ADMIN_LABEL}>
                  Start Date
                </label>
                <input
                  id="season-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={ADMIN_INPUT}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="season-end-date" className={ADMIN_LABEL}>
                  End Date
                </label>
                <input
                  id="season-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={ADMIN_INPUT}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="season-desc-input" className={ADMIN_LABEL}>
                Description
              </label>
              <textarea
                id="season-desc-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes"
                rows={3}
                className={ADMIN_TEXTAREA}
              />
            </div>

            <div className="flex justify-end pt-3 border-t border-border">
              <Button
                type="submit"
                variant="primary"
                size="md"
                leftIcon={Plus}
                disabled={isSubmitting || !name.trim()}
                isLoading={isSubmitting}
                className="rounded-full px-5"
              >
                Create Season
              </Button>
            </div>
          </form>
        </section>

        {/* Seasons List Card */}
        <section className={ADMIN_CARD}>
          <div className={ADMIN_CARD_HEADER}>
            <h2 className={ADMIN_CARD_TITLE}>All Seasons</h2>
            <span className={ADMIN_COUNT_PILL}>{seasons.length}</span>
          </div>

          <div className="space-y-3">
            {seasons.map((season) => {
              const isActive = season.is_active || season.id === activeSeason?.id
              const isOnlySeason = seasons.length <= 1
              const isBackingUpThis = backingUpSeasonId === season.id

              return (
                <div
                  key={season.id}
                  className={`p-4 sm:p-5 rounded-2xl border transition-colors flex flex-col gap-3 ${
                    isActive
                      ? 'bg-bg border-accent-bright'
                      : 'bg-bg border-border hover:border-accent-bright/60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                          isActive
                            ? 'bg-accent text-on-accent border-accent'
                            : 'bg-surface-2 text-muted border-border'
                        }`}
                      >
                        <Calendar size={18} weight="regular" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-syne font-bold text-base text-text truncate">
                            {season.name}
                          </span>
                          {isActive && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface border border-accent-bright text-accent-bright text-[11px] font-medium">
                              Active
                            </span>
                          )}
                        </div>
                        {season.description && (
                          <p className="text-xs text-muted mt-1 line-clamp-1">
                            {season.description}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted font-mono mt-1.5">
                          {season.start_date && (
                            <>
                              <span>
                                {season.start_date}{' '}
                                {season.end_date ? `to ${season.end_date}` : ''}
                              </span>
                              <span>·</span>
                            </>
                          )}
                          <span>Created {new Date(season.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                      {!isActive && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSetActive(season.id, season.name)}
                          className="rounded-full"
                        >
                          Set as Active
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leftIcon={DownloadSimple}
                        onClick={() => handleBackupSeason(season)}
                        disabled={Boolean(backingUpSeasonId) || isRestoring}
                        isLoading={isBackingUpThis}
                        className="rounded-full"
                      >
                        Backup
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leftIcon={PencilSimple}
                        onClick={() => openRenameDialog(season)}
                        className="rounded-full"
                      >
                        Rename
                      </Button>

                      <button
                        type="button"
                        onClick={() => openDeleteDialog(season)}
                        disabled={isActive || isOnlySeason}
                        aria-label={`Delete ${season.name}`}
                        title={
                          isActive
                            ? 'Make another season active first'
                            : isOnlySeason
                            ? 'Cannot delete the only remaining season'
                            : 'Delete season'
                        }
                        className={ADMIN_ICON_BTN_DANGER}
                      >
                        <Trash size={15} weight="regular" />
                      </button>
                    </div>
                  </div>

                  {isBackingUpThis && backupProgress && (
                    <div className="pt-2 border-t border-border space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs font-mono text-muted">
                        <span className="truncate">{backupProgress.label}</span>
                        <span className="tabular-nums shrink-0">
                          {backupProgress.step}/{backupProgress.totalSteps}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className="h-full bg-accent-bright transition-all duration-200"
                          style={{
                            width: `${Math.round(
                              (backupProgress.step / backupProgress.totalSteps) * 100
                            )}%`
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Rename Season Dialog */}
      {seasonToRename && (
        <Dialog
          isOpen={true}
          onClose={() => !isRenaming && setSeasonToRename(null)}
          title="Rename Season"
          size="sm"
          className={ADMIN_DIALOG_CLASS}
        >
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="rename-season-input" className={ADMIN_LABEL}>
                  Season Name
                </label>
                <span className="text-xs font-mono text-muted tabular-nums">1–60 chars</span>
              </div>
              <input
                id="rename-season-input"
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                maxLength={60}
                autoFocus
                required
                className={ADMIN_INPUT}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSeasonToRename(null)}
                disabled={isRenaming}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={
                  isRenaming ||
                  renameInput.trim().length < 1 ||
                  renameInput.trim().length > 60
                }
                isLoading={isRenaming}
                className="rounded-full px-4"
              >
                Save
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      {seasonToDelete && (
        <Dialog
          isOpen={true}
          onClose={() => !isDeleting && setSeasonToDelete(null)}
          title={`Delete "${seasonToDelete.name}"?`}
          size="md"
          className={ADMIN_DIALOG_CLASS}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-error/10 border border-error/25 flex items-start gap-3 text-xs text-text">
              <WarningCircle
                size={18}
                weight="regular"
                className="text-error shrink-0 mt-0.5"
              />
              <div className="space-y-1">
                <p className="font-semibold text-error">Permanent cascade deletion</p>
                <p className="text-muted">
                  Removes all teams, player tournament entries, and purse balances linked to this season.
                </p>
                <p className="font-mono text-accent-bright">
                  Universal athlete profiles will NOT be deleted.
                </p>
              </div>
            </div>

            {/* Counts Preview */}
            <div className={`${ADMIN_WELL} p-4 space-y-2.5`}>
              <span className="text-xs font-medium text-muted block">
                Records to be removed
              </span>
              {isLoadingPreview ? (
                <div className="text-xs text-muted font-mono py-2">
                  Loading records summary...
                </div>
              ) : deletionCounts ? (
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-surface border border-border">
                    <span className="text-muted block text-[11px]">Teams</span>
                    <span className="font-mono font-bold text-sm text-text tabular-nums">
                      {deletionCounts.teams}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border">
                    <span className="text-muted block text-[11px]">Player Entries</span>
                    <span className="font-mono font-bold text-sm text-text tabular-nums">
                      {deletionCounts.players}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border">
                    <span className="text-muted block text-[11px]">Purse Records</span>
                    <span className="font-mono font-bold text-sm text-text tabular-nums">
                      {deletionCounts.purse_transactions}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-surface border border-border">
                    <span className="text-muted block text-[11px]">Carousel Items</span>
                    <span className="font-mono font-bold text-sm text-text tabular-nums">
                      {deletionCounts.carousel_items}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Confirmation input */}
            <div className="space-y-1.5">
              <label htmlFor="delete-season-confirm" className="text-xs text-muted block">
                Type <strong className="text-text font-mono">{seasonToDelete.name}</strong> to confirm:
              </label>
              <input
                id="delete-season-confirm"
                type="text"
                value={confirmationName}
                onChange={(e) => setConfirmationName(e.target.value)}
                placeholder={seasonToDelete.name}
                className="w-full min-h-[42px] px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm font-mono text-text focus:outline-none focus:border-error"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSeasonToDelete(null)}
                disabled={isDeleting}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                leftIcon={Trash}
                onClick={confirmDelete}
                disabled={isDeleting || confirmationName.trim() !== seasonToDelete.name.trim()}
                isLoading={isDeleting}
                className="rounded-full px-4"
              >
                Delete Season
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Restore Backup Confirmation Dialog */}
      {pendingRestore && (
        <Dialog
          isOpen={true}
          onClose={() => !isRestoring && setPendingRestore(null)}
          title="Restore Season from Backup"
          size="md"
          className={ADMIN_DIALOG_CLASS}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-surface-2/70 border border-border space-y-1.5 text-xs">
              <p className="text-sm font-medium text-text leading-snug">
                {pendingRestore.previewSummary}
              </p>
              <p className="text-muted">
                Creates a new inactive season in a single transaction. Existing seasons are never modified, athletes are matched by code (creating only missing ones), and owner logins are not restored.
              </p>
              <p className="text-[11px] font-mono text-muted">
                Schema v{pendingRestore.backup.schema_version} · Exported{' '}
                {new Date(pendingRestore.backup.exported_at).toLocaleString()}
              </p>
            </div>

            <div className={`${ADMIN_WELL} p-4 space-y-2.5`}>
              <span className="text-xs font-medium text-muted block">
                Records in backup
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-muted block text-[11px]">Teams</span>
                  <span className="font-mono font-bold text-sm text-text tabular-nums">
                    {pendingRestore.backup.counts.teams}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-muted block text-[11px]">Players</span>
                  <span className="font-mono font-bold text-sm text-text tabular-nums">
                    {pendingRestore.backup.counts.players}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-muted block text-[11px]">Athletes</span>
                  <span className="font-mono font-bold text-sm text-text tabular-nums">
                    {pendingRestore.backup.counts.athletes}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-muted block text-[11px]">Purse Tx</span>
                  <span className="font-mono font-bold text-sm text-text tabular-nums">
                    {pendingRestore.backup.counts.purse_transactions}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-muted block text-[11px]">Queue</span>
                  <span className="font-mono font-bold text-sm text-text tabular-nums">
                    {pendingRestore.backup.counts.auction_queue}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-muted block text-[11px]">Bids</span>
                  <span className="font-mono font-bold text-sm text-text tabular-nums">
                    {pendingRestore.backup.counts.auction_bids}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-muted block text-[11px]">Sales</span>
                  <span className="font-mono font-bold text-sm text-text tabular-nums">
                    {pendingRestore.backup.counts.auction_sales}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-surface border border-border">
                  <span className="text-muted block text-[11px]">Settings</span>
                  <span className="font-mono font-bold text-sm text-text tabular-nums">
                    {pendingRestore.backup.counts.auction_settings}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setPendingRestore(null)}
                disabled={isRestoring}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                leftIcon={UploadSimple}
                onClick={confirmRestore}
                disabled={isRestoring}
                isLoading={isRestoring}
                className="rounded-full px-4"
              >
                Restore Season
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
