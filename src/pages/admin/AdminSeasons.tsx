import React, { useState } from 'react'
import { Archive, Calendar, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import type { Season, SeasonDeletionCounts } from '../../types'
import { createSeason, deleteSeason, getSeasonDeletionPreview, setActiveSeason } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog, PageHeader } from '../../components/ui'

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
  const [isArchived, setIsArchived] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete modal state
  const [seasonToDelete, setSeasonToDelete] = useState<Season | null>(null)
  const [deletionCounts, setDeletionCounts] = useState<SeasonDeletionCounts | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [confirmationName, setConfirmationName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

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
        description || undefined,
        isArchived
      )
      setName('')
      setStartDate('')
      setEndDate('')
      setDescription('')
      setIsArchived(false)
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

  const openDeleteDialog = async (season: Season) => {
    setSeasonToDelete(season)
    setConfirmationName('')
    setIsLoadingPreview(true)
    try {
      const counts = await getSeasonDeletionPreview(season.id)
      setDeletionCounts(counts)
    } catch {
      setDeletionCounts({
        teams: 0,
        players: 0,
        purse_transactions: 0,
        carousel_items: 0
      })
    } finally {
      setIsLoadingPreview(false)
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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Season Management"
        title="Tournament Seasons"
        subtitle="Configure academic calendar sports seasons. The active season controls all live auctions, team purses, and projector views."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Create Season Card */}
        <div className="p-6 rounded-2xl bg-surface border border-border shadow-sm lg:col-span-1">
          <h2 className="font-syne font-bold text-lg text-text mb-4">
            Create New Season
          </h2>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                Season Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Annual Athletic Championship 2027"
                required
                className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs text-text placeholder-muted focus:outline-none focus:border-accent-bright"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-muted">
                  Start Date (Optional)
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-mono uppercase tracking-wider text-muted">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                Description (Optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary or guidelines for this tournament season..."
                rows={3}
                className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs text-text placeholder-muted focus:outline-none focus:border-accent-bright resize-none"
              />
            </div>

            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="is_archived"
                checked={isArchived}
                onChange={(e) => setIsArchived(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border text-accent-bright focus:ring-0 cursor-pointer accent-accent-bright"
              />
              <label htmlFor="is_archived" className="text-xs text-text cursor-pointer select-none leading-relaxed">
                Past season (archive) &mdash; <span className="text-muted">Preserves rosters without activating live auction mode</span>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                leftIcon={Plus}
                disabled={isSubmitting || !name.trim()}
                isLoading={isSubmitting}
              >
                Create Season
              </Button>
            </div>
          </form>
        </div>

        {/* Seasons List */}
        <div className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-xs font-mono uppercase tracking-wider text-muted">
            All Seasons ({seasons.length})
          </h2>

          {seasons.map((season) => {
            const isActive = season.is_active || season.id === activeSeason?.id
            const isArchivedSeason = !!season.is_archived
            const isOnlySeason = seasons.length <= 1

            return (
              <div
                key={season.id}
                className={`p-5 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm ${
                  isActive
                    ? 'bg-surface border-accent-bright'
                    : 'bg-surface border-border hover:border-accent-bright/60'
                }`}
              >
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-border ${
                      isActive
                        ? 'bg-accent text-on-accent'
                        : isArchivedSeason
                        ? 'bg-surface-2 text-points'
                        : 'bg-surface-2 text-muted'
                    }`}
                  >
                    {isArchivedSeason ? (
                      <Archive size={18} weight="regular" />
                    ) : (
                      <Calendar size={18} weight={isActive ? 'fill' : 'regular'} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-syne font-bold text-lg text-text truncate">
                        {season.name}
                      </span>
                      {isActive && (
                        <span className="text-[11px] font-mono uppercase text-accent-bright font-semibold">
                          · Active
                        </span>
                      )}
                      {isArchivedSeason && (
                        <span className="text-[11px] font-mono uppercase text-points font-semibold">
                          · Archived
                        </span>
                      )}
                    </div>
                    {season.description && (
                      <p className="text-xs text-muted mt-1 line-clamp-1">
                        {season.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted font-mono mt-1">
                      {season.start_date && (
                        <>
                          <span>
                            {season.start_date} {season.end_date ? `to ${season.end_date}` : ''}
                          </span>
                          <span>·</span>
                        </>
                      )}
                      <span>Created {new Date(season.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  {!isActive && !isArchivedSeason && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSetActive(season.id, season.name)}
                    >
                      Set as Active
                    </Button>
                  )}

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => openDeleteDialog(season)}
                    disabled={isActive || isOnlySeason}
                    title={
                      isActive
                        ? 'Make another season active first'
                        : isOnlySeason
                        ? 'Cannot delete the only remaining season'
                        : 'Delete season'
                    }
                    className="min-h-[36px] min-w-[36px] p-2 rounded-xl border border-border hover:border-error hover:bg-error/10 hover:text-error text-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {seasonToDelete && (
        <Dialog
          isOpen={true}
          onClose={() => !isDeleting && setSeasonToDelete(null)}
          title={`Delete "${seasonToDelete.name}"?`}
          description="This action is permanent and deletes all tournament data linked to this season."
          size="md"
        >
          <div className="flex flex-col gap-4">
            <div className="p-3.5 rounded-xl bg-error/10 border border-error/20 flex items-start gap-2.5 text-xs text-text">
              <WarningCircle size={18} className="text-error shrink-0 mt-0.5" weight="fill" />
              <div>
                <p className="font-medium text-error">Warning: Cascade Deletion</p>
                <p className="text-muted mt-0.5">
                  Deleting this season will remove all associated teams, player tournament entries, and purse balances.
                </p>
                <p className="font-mono text-accent-bright mt-1">
                  Universal athlete profiles will NOT be deleted.
                </p>
              </div>
            </div>

            {/* Counts Preview */}
            <div className="p-4 rounded-xl bg-surface-2 border border-border">
              <span className="text-[11px] font-mono uppercase text-muted block mb-2">
                Records to be removed:
              </span>
              {isLoadingPreview ? (
                <div className="text-xs text-muted font-mono py-2">Loading records summary...</div>
              ) : deletionCounts ? (
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg bg-surface border border-border">
                    <span className="text-muted block text-[10px] font-mono uppercase">Teams</span>
                    <span className="font-mono font-bold text-text tabular-nums">{deletionCounts.teams}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border">
                    <span className="text-muted block text-[10px] font-mono uppercase">Player Entries</span>
                    <span className="font-mono font-bold text-text tabular-nums">{deletionCounts.players}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border">
                    <span className="text-muted block text-[10px] font-mono uppercase">Purse Records</span>
                    <span className="font-mono font-bold text-text tabular-nums">{deletionCounts.purse_transactions}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border">
                    <span className="text-muted block text-[10px] font-mono uppercase">Carousel Items</span>
                    <span className="font-mono font-bold text-text tabular-nums">{deletionCounts.carousel_items}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Confirmation input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted">
                Type <strong className="text-text font-mono">{seasonToDelete.name}</strong> to confirm:
              </label>
              <input
                type="text"
                value={confirmationName}
                onChange={(e) => setConfirmationName(e.target.value)}
                placeholder={seasonToDelete.name}
                className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs font-mono text-text focus:outline-none focus:border-error"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSeasonToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                leftIcon={Trash}
                onClick={confirmDelete}
                disabled={isDeleting || confirmationName.trim() !== seasonToDelete.name.trim()}
                isLoading={isDeleting}
              >
                Delete Season
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
