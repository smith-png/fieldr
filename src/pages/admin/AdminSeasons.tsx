import React, { useState } from 'react'
import { Calendar, CheckCircle, Plus, Trash, WarningCircle, Archive } from '@phosphor-icons/react'
import type { Season, SeasonDeletionCounts } from '../../types'
import { createSeason, setActiveSeason, deleteSeason, getSeasonDeletionPreview } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { Dialog, Button } from '../../components/ui'

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
        matches: 0,
        match_stats: 0,
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
    <div className="flex flex-col gap-8 max-w-4xl">
      {/* Header */}
      <div>
        <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
          Season Management
        </span>
        <h1 className="font-syne font-bold text-3xl sm:text-4xl text-text tracking-tight">
          Tournament Seasons
        </h1>
        <p className="text-xs sm:text-sm text-muted mt-1">
          Configure academic calendar sports seasons. The active season controls all live auctions, team purses, and projector views.
        </p>
      </div>

      {/* Create Season Card */}
      <div className="p-6 rounded-3xl bg-surface border border-border">
        <h2 className="font-syne font-bold text-lg text-text mb-4">
          Create New Season
        </h2>
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono uppercase text-muted">
              Season Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Annual Athletic Championship 2027"
              required
              className="px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder-muted/60 focus:outline-none focus:border-accent-bright"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase text-muted">
                Start Date (Optional)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase text-muted">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-mono uppercase text-muted">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary or guidelines for this tournament season..."
              rows={2}
              className="px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder-muted/60 focus:outline-none focus:border-accent-bright resize-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <input
              type="checkbox"
              id="is_archived"
              checked={isArchived}
              onChange={(e) => setIsArchived(e.target.checked)}
              className="w-4 h-4 rounded border-border text-accent-bright focus:ring-0 cursor-pointer accent-accent-bright"
            />
            <label htmlFor="is_archived" className="text-xs sm:text-sm text-text cursor-pointer select-none">
              Past season (archive) &mdash; <span className="text-muted">Preserves match history and rosters without activating live auction mode</span>
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !name.trim()}
              isLoading={isSubmitting}
            >
              <Plus size={16} weight="bold" />
              <span>Create Season</span>
            </Button>
          </div>
        </form>
      </div>

      {/* Seasons List */}
      <div className="flex flex-col gap-3">
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
              className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                isActive
                  ? 'bg-accent/15 border-accent-bright'
                  : 'bg-surface border-border hover:border-border/80'
              }`}
            >
              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-accent-bright text-on-accent'
                      : isArchivedSeason
                      ? 'bg-surface-2 text-points'
                      : 'bg-surface-2 text-muted'
                  }`}
                >
                  {isArchivedSeason ? (
                    <Archive size={20} weight="regular" />
                  ) : (
                    <Calendar size={20} weight={isActive ? 'fill' : 'regular'} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-syne font-bold text-base text-text truncate">
                      {season.name}
                    </span>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-accent-bright/15 text-accent-bright border border-accent-bright/40">
                        Active
                      </span>
                    )}
                    {isArchivedSeason && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-2 text-points border border-border">
                        Archived
                      </span>
                    )}
                  </div>
                  {season.description && (
                    <p className="text-xs text-muted mt-1 line-clamp-1">
                      {season.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted mt-1">
                    {season.start_date && (
                      <span>
                        Dates: {season.start_date} {season.end_date ? `to ${season.end_date}` : ''}
                      </span>
                    )}
                    <span>Created: {new Date(season.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                {!isActive && !isArchivedSeason && (
                  <button
                    type="button"
                    onClick={() => handleSetActive(season.id, season.name)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-border hover:border-accent-bright text-xs font-medium text-muted hover:text-text transition-colors"
                  >
                    Set as Active
                  </button>
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
                  className="min-h-[38px] min-w-[38px] p-2 rounded-xl border border-border hover:border-error hover:bg-error/10 hover:text-error text-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <Trash size={17} />
                </button>
              </div>
            </div>
          )
        })}
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
                  Deleting this season will remove all associated teams, player tournament entries, match records, and purse balances.
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="p-2 rounded bg-surface border border-border/60">
                    <span className="text-muted block text-[10px]">Teams</span>
                    <span className="font-mono font-bold text-text">{deletionCounts.teams}</span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border/60">
                    <span className="text-muted block text-[10px]">Player Entries</span>
                    <span className="font-mono font-bold text-text">{deletionCounts.players}</span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border/60">
                    <span className="text-muted block text-[10px]">Matches</span>
                    <span className="font-mono font-bold text-text">{deletionCounts.matches}</span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border/60">
                    <span className="text-muted block text-[10px]">Purse Records</span>
                    <span className="font-mono font-bold text-text">{deletionCounts.purse_transactions}</span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border/60">
                    <span className="text-muted block text-[10px]">Carousel Items</span>
                    <span className="font-mono font-bold text-text">{deletionCounts.carousel_items}</span>
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
                className="px-3.5 py-2.5 bg-bg border border-border rounded-xl text-sm font-mono text-text focus:outline-none focus:border-error"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                variant="secondary"
                onClick={() => setSeasonToDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmDelete}
                disabled={isDeleting || confirmationName.trim() !== seasonToDelete.name.trim()}
                isLoading={isDeleting}
              >
                <Trash size={16} />
                <span>Delete Season</span>
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
