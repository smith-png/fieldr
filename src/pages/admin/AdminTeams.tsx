import React, { useState } from 'react'
import {
  CheckCircle,
  DownloadSimple,
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  UploadSimple,
  User,
  Wallet,
  WarningCircle
} from '@phosphor-icons/react'
import type { Season, Sport, Team } from '../../types'
import {
  bulkCreateTeams,
  createTeam,
  deleteStorageAsset,
  deleteTeam,
  isDemoMode,
  updateTeam,
  uploadAsset
} from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog, EmptyState, PageHeader } from '../../components/ui'

interface AdminTeamsProps {
  activeSeason: Season | null
  teams: Team[]
  sports: Sport[]
  onRefresh: () => Promise<void>
}

export const AdminTeams: React.FC<AdminTeamsProps> = ({
  activeSeason,
  teams,
  sports,
  onRefresh
}) => {
  const { success, error } = useToast()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [deleteConfirmTeam, setDeleteConfirmTeam] = useState<Team | null>(null)

  // Form states
  const [name, setName] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [sport, setSport] = useState('')
  const [color, setColor] = useState('#047554')
  const [ownerDisplayName, setOwnerDisplayName] = useState('')
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState('')
  const [startingPurse, setStartingPurse] = useState('1000')
  const [logoUrl, setLogoUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isUploadingOwnerPhoto, setIsUploadingOwnerPhoto] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // CSV Import state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<
    Array<Omit<Team, 'id' | 'current_purse' | 'created_at'> & { valid: boolean; error?: string }>
  >([])
  const [isImporting, setIsImporting] = useState(false)

  const downloadTeamsTemplate = () => {
    const header = 'sport,name,short_code,color,starting_purse,owner_display_name\n'
    const example = 'Cricket,Stallions CC,SCC,#2F5233,10000,Marcus Vance\n'
    const blob = new Blob([header + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teams_template_${activeSeason?.name || 'season'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeSeason) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (!content) return

      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length <= 1) {
        error('CSV is empty or missing headers')
        return
      }

      const rows: Array<
        Omit<Team, 'id' | 'current_purse' | 'created_at'> & { valid: boolean; error?: string }
      > = []
      const existingCodes = new Set(teams.map((t) => t.short_code.toUpperCase()))

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim())
        if (parts.length < 3) continue

        const [sportVal, nameVal, codeVal, colorVal, purseVal, ownerVal] = parts
        const codeClean = (codeVal || '').toUpperCase()

        let rowError: string | undefined
        if (!nameVal) rowError = 'Name is required'
        else if (!codeClean || codeClean.length > 3) rowError = 'Short code must be 1-3 characters'
        else if (existingCodes.has(codeClean)) rowError = `Code "${codeClean}" already in use`

        rows.push({
          season_id: activeSeason.id,
          sport: sportVal || sports[0]?.name || 'Cricket',
          name: nameVal || 'Unnamed Team',
          short_code: codeClean,
          color: colorVal || '#047554',
          starting_purse: parseInt(purseVal, 10) || 1000,
          owner_display_name: ownerVal || undefined,
          valid: !rowError,
          error: rowError
        })
      }

      setCsvRows(rows)
      setIsCsvModalOpen(true)
    }
    reader.readAsText(file)
  }

  const confirmBulkImport = async () => {
    if (isDemoMode) {
      error('Modifications are disabled in demo mode.')
      return
    }
    const validRows = csvRows.filter((r) => r.valid)
    if (validRows.length === 0) return

    try {
      setIsImporting(true)
      await bulkCreateTeams(validRows)
      success(`Imported ${validRows.length} teams successfully`)
      setIsCsvModalOpen(false)
      setCsvRows([])
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      error(msg)
    } finally {
      setIsImporting(false)
    }
  }

  const openCreateModal = () => {
    setEditingTeam(null)
    setName('')
    setShortCode('')
    setSport(sports[0]?.name || 'Cricket')
    setColor('#047554')
    setOwnerDisplayName('')
    setOwnerPhotoUrl('')
    setStartingPurse('1000')
    setLogoUrl('')
    setIsModalOpen(true)
  }

  const openEditModal = (team: Team) => {
    setEditingTeam(team)
    setName(team.name)
    setShortCode(team.short_code)
    setSport(team.sport)
    setColor(team.color)
    setOwnerDisplayName(team.owner_display_name || '')
    setOwnerPhotoUrl(team.owner_photo_url || '')
    setStartingPurse(String(team.starting_purse))
    setLogoUrl(team.logo_url || '')
    setIsModalOpen(true)
  }

  const handleCloseModal = async () => {
    const initialLogo = editingTeam?.logo_url || ''
    const initialOwnerPhoto = editingTeam?.owner_photo_url || ''

    if (logoUrl && logoUrl !== initialLogo) {
      await deleteStorageAsset(logoUrl)
    }
    if (ownerPhotoUrl && ownerPhotoUrl !== initialOwnerPhoto) {
      await deleteStorageAsset(ownerPhotoUrl)
    }
    setIsModalOpen(false)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (isDemoMode) {
      error('Uploads are disabled in demo mode.')
      return
    }

    const previousLogo = logoUrl
    const initialLogo = editingTeam?.logo_url || ''

    try {
      setIsUploading(true)
      const url = await uploadAsset(file, 'team-logos', 400)
      if (previousLogo && previousLogo !== initialLogo && previousLogo !== url) {
        await deleteStorageAsset(previousLogo)
      }
      setLogoUrl(url)
      success('Logo compressed and uploaded successfully')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      error(msg)
    } finally {
      setIsUploading(false)
    }
  }

  const handleOwnerPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (isDemoMode) {
      error('Uploads are disabled in demo mode.')
      return
    }

    const previousOwnerPhoto = ownerPhotoUrl
    const initialOwnerPhoto = editingTeam?.owner_photo_url || ''

    try {
      setIsUploadingOwnerPhoto(true)
      const url = await uploadAsset(file, 'team-owners', 600)
      if (
        previousOwnerPhoto &&
        previousOwnerPhoto !== initialOwnerPhoto &&
        previousOwnerPhoto !== url
      ) {
        await deleteStorageAsset(previousOwnerPhoto)
      }
      setOwnerPhotoUrl(url)
      success('Owner photo compressed and uploaded successfully')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      error(msg)
    } finally {
      setIsUploadingOwnerPhoto(false)
    }
  }

  const handleRemoveOwnerPhoto = async () => {
    if (isDemoMode) {
      error('Modifications are disabled in demo mode.')
      return
    }
    const currentPhoto = ownerPhotoUrl
    const initialOwnerPhoto = editingTeam?.owner_photo_url || ''
    if (currentPhoto && currentPhoto !== initialOwnerPhoto) {
      await deleteStorageAsset(currentPhoto)
    }
    setOwnerPhotoUrl('')
  }

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isDemoMode) {
      error('Modifications are disabled in demo mode.')
      return
    }
    if (!activeSeason) {
      error('No active season found')
      return
    }

    if (shortCode.length > 3) {
      error('Short code must be at most 3 characters')
      return
    }

    const nextLogoUrl = logoUrl.trim() || null
    const nextOwnerPhotoUrl = ownerPhotoUrl.trim() || null
    const nextOwnerName = ownerDisplayName.trim() || null

    try {
      setIsSubmitting(true)
      if (editingTeam) {
        const previousSavedLogo = editingTeam.logo_url || null
        const previousSavedOwnerPhoto = editingTeam.owner_photo_url || null

        await updateTeam(editingTeam.id, {
          name: name.trim(),
          short_code: shortCode.trim().toUpperCase(),
          sport,
          color,
          owner_display_name: nextOwnerName,
          owner_photo_url: nextOwnerPhotoUrl,
          logo_url: nextLogoUrl
        })

        if (previousSavedLogo && previousSavedLogo !== nextLogoUrl) {
          await deleteStorageAsset(previousSavedLogo)
        }
        if (previousSavedOwnerPhoto && previousSavedOwnerPhoto !== nextOwnerPhotoUrl) {
          await deleteStorageAsset(previousSavedOwnerPhoto)
        }

        success(`Team "${name}" updated`)
      } else {
        await createTeam({
          season_id: activeSeason.id,
          name: name.trim(),
          short_code: shortCode.trim().toUpperCase(),
          sport,
          color,
          owner_display_name: nextOwnerName,
          owner_photo_url: nextOwnerPhotoUrl,
          starting_purse: Number(startingPurse) || 1000,
          logo_url: nextLogoUrl
        })
        success(`Team "${name}" created successfully`)
      }

      setIsModalOpen(false)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving team'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!deleteConfirmTeam) return
    if (isDemoMode) {
      error('Modifications are disabled in demo mode.')
      return
    }

    try {
      setIsSubmitting(true)
      const logoToDelete = deleteConfirmTeam.logo_url
      const ownerPhotoToDelete = deleteConfirmTeam.owner_photo_url
      await deleteTeam(deleteConfirmTeam.id)
      if (logoToDelete) {
        await deleteStorageAsset(logoToDelete)
      }
      if (ownerPhotoToDelete) {
        await deleteStorageAsset(ownerPhotoToDelete)
      }
      success(`Team "${deleteConfirmTeam.name}" deleted and assigned players released`)
      setDeleteConfirmTeam(null)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete team'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        label="Franchise Directory"
        title="Teams & Franchises"
        subtitle="Configure teams per sport, franchise colours, owners, and starting point budgets."
        actions={
          <>
            <label className="min-h-[40px] px-4 py-2 rounded-xl border border-border bg-surface-2 hover:bg-surface text-xs font-medium text-text cursor-pointer transition-colors flex items-center gap-2">
              <UploadSimple size={16} weight="bold" />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
              />
            </label>
            <Button
              variant="primary"
              size="md"
              leftIcon={Plus}
              onClick={openCreateModal}
            >
              Create Team
            </Button>
          </>
        }
      />

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No teams created yet"
          description="Create your first franchise team to start registering players and allocating purses."
          actionLabel="Create first team"
          onAction={openCreateModal}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <div
              key={team.id}
              className="p-6 rounded-2xl bg-surface border border-border hover:border-accent-bright transition-colors flex flex-col justify-between gap-4 shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Team Logo or Initial Badge */}
                    {team.logo_url ? (
                      <img
                        src={team.logo_url}
                        alt={`${team.name} emblem`}
                        referrerPolicy="no-referrer"
                        className="w-12 h-12 rounded-xl object-contain bg-surface-2 border border-border p-1 shrink-0"
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center border border-border shrink-0 font-syne font-bold text-base text-white shadow-inner"
                        style={{ backgroundColor: team.color || 'var(--accent-bright)' }}
                      >
                        {team.short_code}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs uppercase tracking-wider text-muted">
                          {team.sport}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block border border-border"
                          style={{ backgroundColor: team.color || 'var(--accent-bright)' }}
                          title={`Team color: ${team.color}`}
                        />
                      </div>
                      <h3 className="font-syne font-bold text-xl text-text tracking-tight truncate">
                        {team.name}
                      </h3>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(team)}
                      aria-label={`Edit ${team.name}`}
                      className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    >
                      <PencilSimple size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmTeam(team)}
                      aria-label={`Delete ${team.name}`}
                      className="p-2 rounded-lg border border-border text-muted hover:text-error hover:bg-error/10 transition-colors"
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                </div>

                {/* Owner Info */}
                <div className="py-3 border-y border-border text-xs flex items-center justify-between gap-2">
                  <div>
                    <span className="block text-[11px] font-mono uppercase tracking-wider text-muted">
                      Franchise Owner
                    </span>
                    <span className="text-text font-medium">
                      {team.owner_display_name || 'Unassigned'}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted">
                    {team.short_code}
                  </span>
                </div>
              </div>

              {/* Financial Metric */}
              <div className="bg-surface-2 rounded-xl p-3 border border-border flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Wallet size={15} className="text-points" />
                  <span>Current Purse</span>
                </div>
                <div className="font-mono text-sm font-bold text-points tabular-nums">
                  {team.current_purse.toLocaleString()} PTS
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Team Dialog */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTeam ? 'Edit Team Details' : 'Create Franchise Team'}
        size="lg"
      >
        <form onSubmit={handleSaveTeam} className="flex flex-col gap-4 text-xs">
          <div>
            <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
              Team Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Royal Strikers"
              required
              className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                Short Code (3 letters) *
              </label>
              <input
                type="text"
                maxLength={3}
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                placeholder="RST"
                required
                className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs font-mono text-text focus:outline-none focus:border-accent-bright"
              />
            </div>

            <div>
              <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                Sport *
              </label>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
              >
                {sports.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                Theme Color *
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1 px-3 py-2 bg-bg border border-border rounded-xl font-mono text-xs text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
            </div>

            {!editingTeam && (
              <div>
                <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                  Starting Purse Points
                </label>
                <input
                  type="number"
                  min={0}
                  value={startingPurse}
                  onChange={(e) => setStartingPurse(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs font-mono tabular-nums text-points focus:outline-none focus:border-accent-bright"
                />
              </div>
            )}
          </div>

          {/* Owner Name and Owner Photo side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div>
              <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                Team Owner Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={ownerDisplayName}
                  onChange={(e) => setOwnerDisplayName(e.target.value)}
                  placeholder="e.g. Marcus Vance"
                  className="w-full px-3.5 py-2.5 bg-bg border border-border rounded-xl text-xs text-text focus:outline-none focus:border-accent-bright"
                />
                <User size={16} className="absolute right-3.5 top-2.5 text-muted" />
              </div>
            </div>

            <div>
              <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
                Owner Photo
              </label>
              <div className="flex items-center gap-2.5">
                {ownerPhotoUrl ? (
                  <div className="w-10 h-10 rounded-xl overflow-hidden border border-border bg-surface-2 shrink-0">
                    <img
                      src={ownerPhotoUrl}
                      alt="Owner photo preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl border border-border bg-surface-2 flex items-center justify-center text-muted shrink-0">
                    <User size={18} />
                  </div>
                )}

                <label className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-surface-2 border border-border hover:border-accent-bright text-center cursor-pointer flex items-center justify-center gap-1.5 text-xs text-text transition-colors">
                  <UploadSimple size={15} />
                  <span>
                    {isUploadingOwnerPhoto
                      ? 'Compressing...'
                      : ownerPhotoUrl
                      ? 'Replace photo'
                      : 'Upload photo'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleOwnerPhotoUpload}
                    disabled={isUploadingOwnerPhoto || isSubmitting}
                    className="hidden"
                  />
                </label>

                {ownerPhotoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveOwnerPhoto}
                    disabled={isUploadingOwnerPhoto || isSubmitting}
                    className="min-h-[40px] px-2.5 py-2 rounded-xl border border-border bg-surface-2 hover:bg-error/10 text-muted hover:text-error text-xs transition-colors shrink-0"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Logo Upload with Preview */}
          <div>
            <label className="block font-mono text-muted uppercase tracking-wider mb-1.5">
              Team Crest / Logo
            </label>
            <div className="flex items-center gap-4">
              {logoUrl ? (
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-border bg-surface-2 shrink-0">
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center font-mono font-bold text-white shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {shortCode || 'LOGO'}
                </div>
              )}

              <label className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-surface-2 border border-border hover:border-accent-bright text-center cursor-pointer flex items-center justify-center gap-2 text-xs text-text transition-colors">
                <UploadSimple size={16} />
                <span>{isUploading ? 'Compressing...' : 'Upload crest image'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLogoUpload}
                  disabled={isUploading || isSubmitting}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border mt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCloseModal}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting || isUploading || isUploadingOwnerPhoto}
              isLoading={isSubmitting}
            >
              {editingTeam ? 'Update Team' : 'Create Team'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={!!deleteConfirmTeam}
        onClose={() => setDeleteConfirmTeam(null)}
        title={deleteConfirmTeam ? `Delete Team "${deleteConfirmTeam.name}"?` : 'Delete Team'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            This action cannot be undone. All players currently assigned to this team will automatically be released back to the available pool.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDeleteConfirmTeam(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeleteTeam}
              disabled={isSubmitting}
              isLoading={isSubmitting}
            >
              Confirm Delete & Release Players
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CSV Bulk Import Modal */}
      <Dialog
        isOpen={isCsvModalOpen}
        onClose={() => !isImporting && setIsCsvModalOpen(false)}
        title="CSV Franchise Teams Import"
        description={`Previewing ${csvRows.length} team entries.`}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">
              Valid teams: <strong className="text-text">{csvRows.filter((r) => r.valid).length}</strong> / {csvRows.length}
            </span>
            <button
              type="button"
              onClick={downloadTeamsTemplate}
              className="text-accent-bright hover:underline flex items-center gap-1"
            >
              <DownloadSimple size={14} />
              <span>Download Sample Template</span>
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto border border-border rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-muted font-mono uppercase text-[10px] sticky top-0">
                <tr>
                  <th className="p-2.5 font-normal">Sport</th>
                  <th className="p-2.5 font-normal">Team Name</th>
                  <th className="p-2.5 font-normal">Code</th>
                  <th className="p-2.5 font-normal">Starting Purse</th>
                  <th className="p-2.5 font-normal">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {csvRows.map((r, i) => (
                  <tr key={i} className={r.valid ? '' : 'bg-error/5'}>
                    <td className="p-2.5 font-medium">{r.sport}</td>
                    <td className="p-2.5">{r.name}</td>
                    <td className="p-2.5 font-mono">{r.short_code}</td>
                    <td className="p-2.5 font-mono tabular-nums text-points">{r.starting_purse} PTS</td>
                    <td className="p-2.5">
                      {r.valid ? (
                        <span className="text-accent-bright flex items-center gap-1 text-[11px]">
                          <CheckCircle size={14} /> Ready
                        </span>
                      ) : (
                        <span className="text-error flex items-center gap-1 text-[11px]">
                          <WarningCircle size={14} /> {r.error}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsCsvModalOpen(false)}
              disabled={isImporting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={confirmBulkImport}
              disabled={isImporting || csvRows.filter((r) => r.valid).length === 0}
              isLoading={isImporting}
            >
              Import {csvRows.filter((r) => r.valid).length} Teams
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
