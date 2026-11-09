import React, { useState } from 'react'
import {
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  UploadSimple,
  User,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { Season, Sport, Team } from '../../lib/types'
import { createTeam, deleteTeam, updateTeam, uploadAsset } from '../../lib/data'
import { useToast } from '../../lib/ToastContext'

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-1">
            Franchise Directory
          </span>
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Teams & Franchises
          </h1>
          <p className="text-xs sm:text-sm text-[#8E928C] mt-1">
            Configure teams per sport, franchise colours, owners, and starting point budgets.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="min-h-[44px] px-6 py-2.5 rounded-full bg-white text-[#0B0B0B] font-medium text-xs sm:text-sm hover:bg-[#F0F2EE] transition-all flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <Plus size={18} weight="bold" />
          <span>Create Team</span>
        </button>
      </div>

      {/* Teams Grid */}
      {teams.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-[#141414] border border-white/10 flex flex-col items-center justify-center gap-3">
          <ShieldCheck size={40} className="text-[#8E928C]" />
          <div className="text-base font-syne font-bold text-white">No teams created yet</div>
          <p className="text-xs text-[#8E928C] max-w-sm">
            Create your first college franchise team to start registering players and allocating purses.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-2 min-h-[44px] px-5 py-2 rounded-xl bg-white text-[#0B0B0B] text-xs font-medium hover:bg-[#F0F2EE]"
          >
            Create first team
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {teams.map((team) => (
            <div
              key={team.id}
              className="p-5 rounded-3xl bg-[#141414] border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between gap-5 relative overflow-hidden"
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
                    className="w-12 h-12 rounded-2xl flex items-center justify-center overflow-hidden border border-white/10 shrink-0 font-syne font-extrabold text-base text-white"
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
                      <span className="font-syne font-bold text-lg text-white">
                        {team.name}
                      </span>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/10 text-[#CBD1CB]">
                        {team.short_code}
                      </span>
                    </div>
                    <div className="text-xs text-[#8E928C] mt-0.5">
                      Sport: <span className="text-[#CBD1CB]">{team.sport}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditModal(team)}
                    aria-label={`Edit ${team.name}`}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#8E928C] hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <PencilSimple size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTeam(team)}
                    aria-label={`Delete ${team.name}`}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#8E928C] hover:text-[#B91C1C] hover:bg-[#B91C1C]/10 transition-colors"
                  >
                    <Trash size={18} />
                  </button>
                </div>
              </div>

              {/* Owner & Purse Metrics */}
              <div className="pt-4 border-t border-white/5 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[#8E928C] block text-[10px] uppercase font-mono tracking-wider">
                    Owner
                  </span>
                  <span className="font-medium text-white truncate block mt-0.5">
                    {team.owner_display_name || 'Unassigned'}
                  </span>
                </div>
                <div>
                  <span className="text-[#8E928C] block text-[10px] uppercase font-mono tracking-wider">
                    Current Purse
                  </span>
                  <span className="font-mono font-bold text-sm text-[#C88B0F] tabular-nums mt-0.5 block">
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h2 className="font-syne font-bold text-xl text-white">
                {editingTeam ? 'Edit Team Details' : 'Create Franchise Team'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-[#8E928C] hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveTeam} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Team Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Royal Strikers"
                  required
                  className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                    Short Code (3 letters) *
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={shortCode}
                    onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                    placeholder="RST"
                    required
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-[#047554]"
                  />
                </div>

                <div>
                  <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                    Sport *
                  </label>
                  <select
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
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
                  <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
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
                      className="flex-1 px-3 py-2 bg-[#0B0B0B] border border-white/10 rounded-xl font-mono text-xs text-white"
                    />
                  </div>
                </div>

                {!editingTeam && (
                  <div>
                    <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                      Starting Purse Points
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={startingPurse}
                      onChange={(e) => setStartingPurse(e.target.value)}
                      className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm font-mono text-[#C88B0F] focus:outline-none focus:border-[#047554]"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Team Owner Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={ownerDisplayName}
                    onChange={(e) => setOwnerDisplayName(e.target.value)}
                    placeholder="e.g. Dr. Rajesh Sharma"
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                  />
                  <User size={18} className="absolute right-3.5 top-2.5 text-[#8E928C]" />
                </div>
              </div>

              {/* Logo Upload with Preview */}
              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Team Crest / Logo
                </label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/10 shrink-0">
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

                  <label className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-dashed border-white/20 hover:border-[#047554] text-center cursor-pointer flex items-center justify-center gap-2 text-xs text-[#CBD1CB] transition-colors">
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

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#141414] border border-[#B91C1C]/40 rounded-3xl p-6 sm:p-8 flex flex-col gap-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-[#B91C1C]/20 border border-[#B91C1C]/40 flex items-center justify-center text-[#B91C1C]">
              <WarningCircle size={28} weight="bold" />
            </div>

            <div>
              <h2 className="font-syne font-bold text-xl text-white">
                Delete Team "{deleteConfirmTeam.name}"?
              </h2>
              <p className="text-xs text-[#8E928C] mt-2 leading-relaxed">
                This action cannot be undone. All players currently assigned to this team will automatically be released back to the available pool.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmTeam(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTeam}
                disabled={isSubmitting}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-[#B91C1C] text-white font-medium text-xs hover:bg-[#991B1B] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete & Release Players'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
