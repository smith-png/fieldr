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
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { Season, Sport, Team } from '../../types'
import { bulkCreateTeams, createTeam, deleteTeam, updateTeam, uploadAsset } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog } from '../../components/ui'

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
  const [startingPurse, setStartingPurse] = useState('1000')
  const [logoUrl, setLogoUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // CSV Import state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<Array<Omit<Team, 'id' | 'current_purse' | 'created_at'> & { valid: boolean; error?: string }>>([])
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

      const rows: Array<Omit<Team, 'id' | 'current_purse' | 'created_at'> & { valid: boolean; error?: string }> = []
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
    setStartingPurse(String(team.starting_purse))
    setLogoUrl(team.logo_url || '')
    setIsModalOpen(true)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsUploading(true)
      const url = await uploadAsset(file, 'team-logos')
      setLogoUrl(url)
      success('Logo compressed and uploaded successfully')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      error(msg)
    } finally {
      setIsUploading(false)
    }
  }

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason) {
      error('No active season found')
      return
    }

    if (shortCode.length > 3) {
      error('Short code must be at most 3 characters')
      return
    }

    try {
      setIsSubmitting(true)
      if (editingTeam) {
        await updateTeam(editingTeam.id, {
          name: name.trim(),
          short_code: shortCode.trim().toUpperCase(),
          sport,
          color,
          owner_display_name: ownerDisplayName.trim() || undefined,
          logo_url: logoUrl || undefined
        })
        success(`Team "${name}" updated`)
      } else {
        await createTeam({
          season_id: activeSeason.id,
          name: name.trim(),
          short_code: shortCode.trim().toUpperCase(),
          sport,
          color,
          owner_display_name: ownerDisplayName.trim() || undefined,
          starting_purse: Number(startingPurse) || 1000,
          logo_url: logoUrl || undefined
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

    try {
      setIsSubmitting(true)
      await deleteTeam(deleteConfirmTeam.id)
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
            Franchise Directory
          </span>
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-text tracking-tight">
            Teams & Franchises
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Configure teams per sport, franchise colours, owners, and starting point budgets.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <label className="min-h-[44px] px-4 py-2.5 rounded-full border border-border bg-surface hover:bg-surface-2 text-xs font-medium text-text cursor-pointer transition-colors flex items-center gap-2">
            <UploadSimple size={16} />
            <span>Import CSV</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] px-6 py-2.5 rounded-full bg-btn-bg text-btn-fg font-medium text-xs sm:text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} weight="bold" />
            <span>Create Team</span>
          </button>
        </div>
      </div>

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-surface border border-border flex flex-col items-center justify-center gap-3">
          <ShieldCheck size={40} className="text-muted" />
          <div className="text-base font-syne font-bold text-text">No teams created yet</div>
          <p className="text-xs text-muted max-w-sm">
            Create your first college franchise team to start registering players and allocating purses.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-2 min-h-[44px] px-5 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-medium hover:opacity-90"
          >
            Create first team
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((team) => (
            <div
              key={team.id}
              className="p-5 rounded-3xl bg-surface border border-border hover:border-border/80 transition-all flex flex-col justify-between gap-5 relative overflow-hidden"
            >
              {/* Colored Top Accent Stripe */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ backgroundColor: team.color }}
              />

              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="flex items-center gap-3">
                  {/* Team Logo or Initial Badge */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden border border-border shrink-0 font-syne font-extrabold text-base text-white"
                    style={{ backgroundColor: team.color }}
                  >
                    {team.logo_url ? (
                      <img
                        src={team.logo_url}
                        alt={`${team.name} emblem`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{team.short_code}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-syne font-bold text-lg text-text">
                        {team.name}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-2 text-text border border-border">
                        {team.short_code}
                      </span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      Sport: <span className="text-text font-medium">{team.sport}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(team)}
                    aria-label={`Edit ${team.name}`}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  >
                    <PencilSimple size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTeam(team)}
                    aria-label={`Delete ${team.name}`}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-muted hover:text-error hover:bg-error/10 transition-colors"
                  >
                    <Trash size={18} />
                  </button>
                </div>
              </div>

              {/* Owner & Purse Metrics */}
              <div className="pt-4 border-t border-border grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted block text-[10px] uppercase font-mono tracking-wider">
                    Owner
                  </span>
                  <span className="font-medium text-text truncate block mt-0.5">
                    {team.owner_display_name || 'Unassigned'}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[10px] uppercase font-mono tracking-wider">
                    Current Purse
                  </span>
                  <span className="font-mono font-bold text-sm text-points tabular-nums mt-0.5 block">
                    {team.current_purse.toLocaleString()} PTS
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Team Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-surface border border-border rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="font-syne font-bold text-xl text-text">
                {editingTeam ? 'Edit Team Details' : 'Create Franchise Team'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-muted hover:text-text p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                  Team Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Royal Strikers"
                  required
                  className="w-full px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                    Short Code (3 letters) *
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                    placeholder="RST"
                    required
                    className="w-full px-4 py-2.5 bg-bg border border-border rounded-xl text-sm font-mono text-text focus:outline-none focus:border-accent-bright"
                  />
                </div>

                <div>
                  <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                    Sport *
                  </label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    className="w-full px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
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
                  <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
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
                      className="flex-1 px-3 py-2 bg-bg border border-border rounded-xl font-mono text-xs text-text"
                    />
                  </div>
                </div>

                {!editingTeam && (
                  <div>
                    <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                      Starting Purse Points
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={startingPurse}
                      onChange={(e) => setStartingPurse(e.target.value)}
                      className="w-full px-4 py-2.5 bg-bg border border-border rounded-xl text-sm font-mono text-points focus:outline-none focus:border-accent-bright"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                  Team Owner Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ownerDisplayName}
                    onChange={(e) => setOwnerDisplayName(e.target.value)}
                    placeholder="e.g. Dr. Rajesh Sharma"
                    className="w-full px-4 py-2.5 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                  />
                  <User size={18} className="absolute right-3.5 top-2.5 text-muted" />
                </div>
              </div>

              {/* Logo Upload with Preview */}
              <div>
                <label className="block text-muted uppercase tracking-wider mb-1.5 font-medium">
                  Team Crest / Logo
                </label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-border shrink-0">
                      <img src={logoUrl} alt="Logo preview" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center font-mono font-bold text-white shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {shortCode || 'LOGO'}
                    </div>
                  )}

                  <label className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-dashed border-border hover:border-accent-bright text-center cursor-pointer flex items-center justify-center gap-2 text-xs text-muted hover:text-text transition-colors">
                    <UploadSimple size={16} />
                    <span>{isUploading ? 'Compressing...' : 'Upload crest image'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={isUploading}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-btn-bg text-btn-fg font-medium text-xs hover:opacity-90 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingTeam ? 'Update Team' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTeam && (
        <div className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface border border-error/40 rounded-3xl p-6 sm:p-8 flex flex-col gap-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-error/15 border border-error/40 flex items-center justify-center text-error">
              <WarningCircle size={28} weight="bold" />
            </div>

            <div>
              <h2 className="font-syne font-bold text-xl text-text">
                Delete Team "{deleteConfirmTeam.name}"?
              </h2>
              <p className="text-xs text-muted mt-2 leading-relaxed">
                This action cannot be undone. All players currently assigned to this team will automatically be released back to the available pool.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmTeam(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTeam}
                disabled={isSubmitting}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-error text-white font-medium text-xs hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete & Release Players'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Bulk Import Modal */}
      {isCsvModalOpen && (
        <Dialog
          isOpen={true}
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
                    <th className="p-2.5">Sport</th>
                    <th className="p-2.5">Team Name</th>
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Starting Purse</th>
                    <th className="p-2.5">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {csvRows.map((r, i) => (
                    <tr key={i} className={r.valid ? '' : 'bg-error/5'}>
                      <td className="p-2.5 font-medium">{r.sport}</td>
                      <td className="p-2.5">{r.name}</td>
                      <td className="p-2.5 font-mono">{r.short_code}</td>
                      <td className="p-2.5 font-mono text-points">{r.starting_purse} PTS</td>
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
                onClick={() => setIsCsvModalOpen(false)}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={confirmBulkImport}
                disabled={isImporting || csvRows.filter((r) => r.valid).length === 0}
                isLoading={isImporting}
              >
                <span>Import {csvRows.filter((r) => r.valid).length} Teams</span>
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
