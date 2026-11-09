import React, { useState } from 'react'
import {
  ArrowsLeftRight,
  CheckCircle,
  FileCsv,
  Funnel,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  UploadSimple,
  User,
  UserMinus,
  UserPlus,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { Player, Season, Sport, Team } from '../../lib/types'
import {
  assignPlayerToTeam,
  bulkCreatePlayers,
  createPlayer,
  deletePlayer,
  unassignPlayerFromTeam,
  updatePlayer,
  uploadAsset
} from '../../lib/data'
import { useToast } from '../../lib/ToastContext'

interface AdminPlayersProps {
  activeSeason: Season | null
  players: Player[]
  teams: Team[]
  sports: Sport[]
  onRefresh: () => Promise<void>
}

export const AdminPlayers: React.FC<AdminPlayersProps> = ({
  activeSeason,
  players,
  teams,
  sports,
  onRefresh
}) => {
  const { success, error } = useToast()

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSport, setSelectedSport] = useState<string>('all')
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  // Modals & Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [deleteConfirmPlayer, setDeleteConfirmPlayer] = useState<Player | null>(null)
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)

  // Assignment Modal
  const [assignmentPlayer, setAssignmentPlayer] = useState<Player | null>(null)
  const [assignTeamId, setAssignTeamId] = useState<string>('')
  const [assignPrice, setAssignPrice] = useState<string>('')
  const [unassignRefund, setUnassignRefund] = useState<boolean>(true)

  // Player Form Fields
  const [name, setName] = useState('')
  const [sport, setSport] = useState('')
  const [playingRole, setPlayingRole] = useState('')
  const [yearBatch, setYearBatch] = useState('2026')
  const [rollNo, setRollNo] = useState('')
  const [basePoints, setBasePoints] = useState('100')
  const [photoUrl, setPhotoUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // CSV bulk text
  const [csvText, setCsvText] = useState('')

  // Roles available for currently selected form sport
  const currentSportConfig = sports.find((s) => s.name.toLowerCase() === (sport || sports[0]?.name || '').toLowerCase())
  const availableRoles = currentSportConfig?.roles || []

  const openCreateDrawer = () => {
    setEditingPlayer(null)
    setName('')
    const initialSport = sports[0]?.name || 'Cricket'
    setSport(initialSport)
    const sportCfg = sports.find((s) => s.name === initialSport)
    setPlayingRole(sportCfg?.roles[0] || 'Batter')
    setYearBatch('2026')
    setRollNo('')
    setBasePoints('100')
    setPhotoUrl('')
    setNotes('')
    setIsDrawerOpen(true)
  }

  const openEditDrawer = (player: Player) => {
    setEditingPlayer(player)
    setName(player.name)
    setSport(player.sport)
    setPlayingRole(player.playing_role)
    setYearBatch(player.year_batch)
    setRollNo(player.roll_no || '')
    setBasePoints(String(player.base_points))
    setPhotoUrl(player.photo_url || '')
    setNotes(player.notes || '')
    setIsDrawerOpen(true)
  }

  const handleSportChange = (newSport: string) => {
    setSport(newSport)
    const cfg = sports.find((s) => s.name.toLowerCase() === newSport.toLowerCase())
    if (cfg && cfg.roles.length > 0) {
      setPlayingRole(cfg.roles[0])
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setIsUploadingPhoto(true)
      const url = await uploadAsset(file, 'player-photos')
      setPhotoUrl(url)
      success('Player photo compressed and stored')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Photo upload failed'
      error(msg)
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason) {
      error('No active season')
      return
    }

    try {
      setIsSubmitting(true)
      if (editingPlayer) {
        await updatePlayer(editingPlayer.id, {
          name: name.trim(),
          sport,
          playing_role: playingRole,
          year_batch: yearBatch.trim(),
          roll_no: rollNo.trim() || undefined,
          base_points: Number(basePoints) || 100,
          photo_url: photoUrl || undefined,
          notes: notes.trim() || undefined
        })
        success(`Player "${name}" updated`)
      } else {
        await createPlayer({
          season_id: activeSeason.id,
          name: name.trim(),
          sport,
          playing_role: playingRole,
          year_batch: yearBatch.trim(),
          roll_no: rollNo.trim() || undefined,
          base_points: Number(basePoints) || 100,
          status: 'available',
          team_id: null,
          photo_url: photoUrl || undefined,
          notes: notes.trim() || undefined
        })
        success(`Player "${name}" registered`)
      }

      setIsDrawerOpen(false)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving player'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeletePlayer = async () => {
    if (!deleteConfirmPlayer) return

    try {
      setIsSubmitting(true)
      await deletePlayer(deleteConfirmPlayer.id)
      success(`Player "${deleteConfirmPlayer.name}" removed`)
      setDeleteConfirmPlayer(null)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete player'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open Assignment Dialog
  const openAssignModal = (player: Player) => {
    setAssignmentPlayer(player)
    // Find eligible teams for this player's sport
    const eligible = teams.filter((t) => t.sport.toLowerCase() === player.sport.toLowerCase())
    setAssignTeamId(player.team_id || (eligible[0]?.id ?? ''))
    setAssignPrice(player.purchase_price ? String(player.purchase_price) : String(player.base_points))
    setUnassignRefund(true)
  }

  const handleExecuteAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignmentPlayer) return

    try {
      setIsSubmitting(true)
      const priceNum = assignPrice ? Number(assignPrice) : 0
      await assignPlayerToTeam(assignmentPlayer.id, assignTeamId, priceNum)
      success(`Player assigned to team with price ${priceNum} points`)
      setAssignmentPlayer(null)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Assignment failed'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExecuteUnassign = async () => {
    if (!assignmentPlayer) return

    try {
      setIsSubmitting(true)
      await unassignPlayerFromTeam(assignmentPlayer.id, unassignRefund)
      success(`Player unassigned and released to available pool`)
      setAssignmentPlayer(null)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unassignment failed'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // CSV Bulk Import
  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason || !csvText.trim()) return

    try {
      setIsSubmitting(true)
      const lines = csvText.trim().split('\n')
      const newPlayers: Omit<Player, 'id' | 'created_at'>[] = []

      // Expected headers: name, sport, playing_role, year_batch, roll_no, base_points
      const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0
      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim())
        if (parts.length >= 3 && parts[0]) {
          newPlayers.push({
            season_id: activeSeason.id,
            name: parts[0],
            sport: parts[1] || 'Cricket',
            playing_role: parts[2] || 'All-rounder',
            year_batch: parts[3] || '2026',
            roll_no: parts[4] || undefined,
            base_points: Number(parts[5]) || 100,
            status: 'available',
            team_id: null
          })
        }
      }

      if (newPlayers.length === 0) {
        error('No valid player rows found in CSV text')
        return
      }

      await bulkCreatePlayers(newPlayers)
      success(`Imported ${newPlayers.length} players successfully`)
      setCsvText('')
      setIsCsvModalOpen(false)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'CSV Import failed'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filtered Players
  const filteredPlayers = players.filter((player) => {
    const matchesSearch =
      searchQuery === '' ||
      player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (player.roll_no && player.roll_no.toLowerCase().includes(searchQuery.toLowerCase())) ||
      player.year_batch.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesSport =
      selectedSport === 'all' ||
      player.sport.toLowerCase() === selectedSport.toLowerCase()

    const matchesRole =
      selectedRole === 'all' ||
      player.playing_role.toLowerCase() === selectedRole.toLowerCase()

    const matchesStatus =
      selectedStatus === 'all' ||
      player.status === selectedStatus

    return matchesSearch && matchesSport && matchesRole && matchesStatus
  })

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-1">
            Student Athletes
          </span>
          <h1 className="font-syne font-bold text-3xl sm:text-4xl text-white tracking-tight">
            Player Registration & Roster
          </h1>
          <p className="text-xs sm:text-sm text-[#8E928C] mt-1">
            Register students, filter by sport and discipline, draft into franchise teams, and adjust auction purchase prices.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsCsvModalOpen(true)}
            className="min-h-[44px] px-4 py-2.5 rounded-full border border-white/10 hover:border-white/30 text-[#CBD1CB] hover:text-white font-medium text-xs sm:text-sm transition-all flex items-center gap-2"
          >
            <FileCsv size={18} />
            <span>CSV Import</span>
          </button>
          <button
            type="button"
            onClick={openCreateDrawer}
            className="min-h-[44px] px-6 py-2.5 rounded-full bg-white text-[#0B0B0B] font-medium text-xs sm:text-sm hover:bg-[#F0F2EE] transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <Plus size={18} weight="bold" />
            <span>Register Player</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-[#141414] border border-white/10 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, roll number, or batch..."
            className="w-full pl-9 pr-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:border-[#047554]"
          />
          <MagnifyingGlass size={16} className="absolute left-3 top-3 text-[#8E928C]" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sport filter */}
          <select
            value={selectedSport}
            onChange={(e) => {
              setSelectedSport(e.target.value)
              setSelectedRole('all')
            }}
            aria-label="Filter by sport"
            className="min-h-[40px] px-3 py-2 bg-[#0B0B0B] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#047554]"
          >
            <option value="all">All Sports</option>
            {sports.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Role filter */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            aria-label="Filter by role"
            className="min-h-[40px] px-3 py-2 bg-[#0B0B0B] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#047554]"
          >
            <option value="all">All Roles</option>
            {selectedSport !== 'all'
              ? sports
                  .find((s) => s.name.toLowerCase() === selectedSport.toLowerCase())
                  ?.roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))
              : Array.from(new Set(sports.flatMap((s) => s.roles))).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            aria-label="Filter by status"
            className="min-h-[40px] px-3 py-2 bg-[#0B0B0B] border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#047554]"
          >
            <option value="all">All Statuses</option>
            <option value="available">Available</option>
            <option value="sold">Sold / Drafted</option>
          </select>
        </div>
      </div>

      {/* Players Table */}
      {filteredPlayers.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-[#141414] border border-white/10 flex flex-col items-center justify-center gap-3">
          <User size={40} className="text-[#8E928C]" />
          <div className="text-base font-syne font-bold text-white">No players found</div>
          <p className="text-xs text-[#8E928C] max-w-sm">
            {players.length === 0
              ? 'Register student athletes manually or upload a batch CSV list to populate your tournament draft pool.'
              : 'No players match your active search and filter criteria.'}
          </p>
          {players.length === 0 && (
            <button
              type="button"
              onClick={openCreateDrawer}
              className="mt-2 min-h-[44px] px-5 py-2 rounded-xl bg-white text-[#0B0B0B] text-xs font-medium hover:bg-[#F0F2EE]"
            >
              Register first player
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-3xl bg-[#141414] border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[#8E928C] font-mono uppercase tracking-wider bg-white/[0.02]">
                  <th className="py-3.5 px-4 font-medium">Player</th>
                  <th className="py-3.5 px-3 font-medium">Sport & Role</th>
                  <th className="py-3.5 px-3 font-medium">Batch / Roll</th>
                  <th className="py-3.5 px-3 font-medium text-right">Base Pts</th>
                  <th className="py-3.5 px-3 font-medium">Status & Team</th>
                  <th className="py-3.5 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredPlayers.map((player) => {
                  const assignedTeam = teams.find((t) => t.id === player.team_id)
                  return (
                    <tr key={player.id} className="hover:bg-white/5 transition-colors">
                      {/* Name & Photo */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#202020] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                            {player.photo_url ? (
                              <img
                                src={player.photo_url}
                                alt={player.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User size={18} className="text-[#8E928C]" />
                            )}
                          </div>
                          <div>
                            <span className="font-syne font-bold text-sm text-white block">
                              {player.name}
                            </span>
                            {player.notes && (
                              <span className="text-[11px] text-[#8E928C] truncate max-w-xs block">
                                {player.notes}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Sport & Role */}
                      <td className="py-3 px-3">
                        <span className="font-medium text-white block">{player.sport}</span>
                        <span className="text-[#8E928C] text-[11px]">{player.playing_role}</span>
                      </td>

                      {/* Batch & Roll */}
                      <td className="py-3 px-3 font-mono text-xs text-[#CBD1CB]">
                        <div>Batch: {player.year_batch}</div>
                        {player.roll_no && (
                          <div className="text-[10px] text-[#8E928C]">#{player.roll_no}</div>
                        )}
                      </td>

                      {/* Base Points */}
                      <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-[#C88B0F]">
                        {player.base_points.toLocaleString()}
                      </td>

                      {/* Status & Team */}
                      <td className="py-3 px-3">
                        {player.status === 'sold' && assignedTeam ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: assignedTeam.color }}
                            />
                            <div>
                              <span className="font-medium text-white">
                                {assignedTeam.name}
                              </span>
                              {player.purchase_price ? (
                                <span className="font-mono text-[10px] text-[#C88B0F] block">
                                  Price: {player.purchase_price.toLocaleString()} PTS
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-[#047554]/20 text-[#047554] border border-[#047554]/40">
                            Available
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Assign or Unassign */}
                          <button
                            type="button"
                            onClick={() => openAssignModal(player)}
                            title={player.status === 'sold' ? 'Manage Team Assignment' : 'Assign to Team'}
                            aria-label={`Assign or manage team for ${player.name}`}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#047554] hover:bg-[#047554]/10 transition-colors"
                          >
                            {player.status === 'sold' ? (
                              <ArrowsLeftRight size={18} />
                            ) : (
                              <UserPlus size={18} />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditDrawer(player)}
                            title="Edit Player"
                            aria-label={`Edit ${player.name}`}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#8E928C] hover:text-white hover:bg-white/5 transition-colors"
                          >
                            <PencilSimple size={18} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmPlayer(player)}
                            title="Delete Player"
                            aria-label={`Delete ${player.name}`}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#8E928C] hover:text-[#B91C1C] hover:bg-[#B91C1C]/10 transition-colors"
                          >
                            <Trash size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Registration Drawer / Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h2 className="font-syne font-bold text-xl text-white">
                {editingPlayer ? 'Edit Player Record' : 'Register New Student Athlete'}
              </h2>
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="text-[#8E928C] hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePlayer} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Smit Bhute"
                  required
                  className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                    Sport *
                  </label>
                  <select
                    value={sport}
                    onChange={(e) => handleSportChange(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                  >
                    {sports.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                    Playing Role *
                  </label>
                  <select
                    value={playingRole}
                    onChange={(e) => setPlayingRole(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                    Batch / Year *
                  </label>
                  <input
                    type="text"
                    value={yearBatch}
                    onChange={(e) => setYearBatch(e.target.value)}
                    placeholder="2026"
                    required
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                  />
                </div>

                <div>
                  <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                    Roll No
                  </label>
                  <input
                    type="text"
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    placeholder="MED-042"
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                  />
                </div>

                <div>
                  <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                    Base Points *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={basePoints}
                    onChange={(e) => setBasePoints(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm font-mono text-[#C88B0F] focus:outline-none focus:border-[#047554]"
                  />
                </div>
              </div>

              {/* Photo Upload with Compression */}
              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Player Headshot (Auto-Compressed to 400px)
                </label>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[#0B0B0B] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    {photoUrl ? (
                      <img src={photoUrl} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <User size={22} className="text-[#8E928C]" />
                    )}
                  </div>

                  <label className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl border border-dashed border-white/20 hover:border-[#047554] text-center cursor-pointer flex items-center justify-center gap-2 text-xs text-[#CBD1CB] transition-colors">
                    <UploadSimple size={16} />
                    <span>{isUploadingPhoto ? 'Compressing image...' : 'Upload player photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={isUploadingPhoto}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Scouting Notes / Bio
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Fast-paced right-arm bowler, previous college captain..."
                  rows={2}
                  className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingPhoto}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingPlayer ? 'Update Player' : 'Register Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Player Team Assignment / Unassignment Modal */}
      {assignmentPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#047554]">
                  Draft Roster Assignment
                </span>
                <h2 className="font-syne font-bold text-xl text-white mt-0.5">
                  Assign "{assignmentPlayer.name}"
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setAssignmentPlayer(null)}
                className="text-[#8E928C] hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0B0B0B] border border-white/10 flex items-center justify-between text-xs">
              <div>
                <span className="text-[#8E928C] block text-[10px] uppercase font-mono">
                  Sport & Role
                </span>
                <span className="text-white font-medium">
                  {assignmentPlayer.sport} · {assignmentPlayer.playing_role}
                </span>
              </div>
              <div>
                <span className="text-[#8E928C] block text-[10px] uppercase font-mono text-right">
                  Base Points
                </span>
                <span className="text-[#C88B0F] font-mono font-bold tabular-nums">
                  {assignmentPlayer.base_points.toLocaleString()} PTS
                </span>
              </div>
            </div>

            {/* If player already assigned: Show Unassign Option */}
            {assignmentPlayer.status === 'sold' && (
              <div className="p-4 rounded-2xl bg-[#1A1A1A] border border-white/10 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white font-medium">
                    Currently assigned to:{' '}
                    <span className="text-[#047554]">
                      {teams.find((t) => t.id === assignmentPlayer.team_id)?.name || 'Team'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={handleExecuteUnassign}
                    disabled={isSubmitting}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#B91C1C]/20 border border-[#B91C1C]/40 text-[#B91C1C] hover:bg-[#B91C1C] hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
                  >
                    <UserMinus size={16} />
                    <span>Unassign Player</span>
                  </button>
                </div>

                {assignmentPlayer.purchase_price ? (
                  <label className="flex items-center gap-2 text-xs text-[#CBD1CB] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={unassignRefund}
                      onChange={(e) => setUnassignRefund(e.target.checked)}
                      className="rounded accent-[#047554]"
                    />
                    <span>
                      Refund {assignmentPlayer.purchase_price.toLocaleString()} points back to team's purse
                    </span>
                  </label>
                ) : null}
              </div>
            )}

            {/* Assign Form */}
            <form onSubmit={handleExecuteAssignment} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Select Franchise Team ({assignmentPlayer.sport} only) *
                </label>
                {teams.filter((t) => t.sport.toLowerCase() === assignmentPlayer.sport.toLowerCase()).length === 0 ? (
                  <div className="p-3 rounded-xl bg-[#1F0E0E] text-[#B91C1C] border border-[#B91C1C]/30 text-xs">
                    No teams registered for {assignmentPlayer.sport} yet. Create a team in the Teams tab first.
                  </div>
                ) : (
                  <select
                    value={assignTeamId}
                    onChange={(e) => setAssignTeamId(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[#047554]"
                  >
                    {teams
                      .filter((t) => t.sport.toLowerCase() === assignmentPlayer.sport.toLowerCase())
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.short_code}) — Available Purse: {t.current_purse.toLocaleString()} PTS
                        </option>
                      ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[#CBD1CB] uppercase tracking-wider mb-1.5 font-medium">
                  Auction Purchase Price (Points to deduct from team purse)
                </label>
                <input
                  type="number"
                  min={0}
                  value={assignPrice}
                  onChange={(e) => setAssignPrice(e.target.value)}
                  placeholder="e.g. 250"
                  className="w-full px-4 py-2.5 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm font-mono text-[#C88B0F] focus:outline-none focus:border-[#047554]"
                />
                <span className="text-[11px] text-[#8E928C] mt-1 block">
                  Leave 0 or empty for no purse deduction. If greater than zero, balance is verified and logged.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setAssignmentPlayer(null)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    teams.filter((t) => t.sport.toLowerCase() === assignmentPlayer.sport.toLowerCase()).length === 0
                  }
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-50"
                >
                  {isSubmitting ? 'Processing...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-[#141414] border border-white/10 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div>
                <h2 className="font-syne font-bold text-xl text-white">
                  Bulk CSV Import
                </h2>
                <p className="text-xs text-[#8E928C] mt-0.5">
                  Paste comma-separated rows of players.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(false)}
                className="text-[#8E928C] hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="text-[11px] font-mono text-[#8E928C] p-3 rounded-xl bg-[#0B0B0B] border border-white/10">
              Format: name, sport, playing_role, year_batch, roll_no, base_points
              <br />
              Example: Aarav Sharma, Cricket, Batter, 2026, 101, 150
            </div>

            <form onSubmit={handleCsvImport} className="flex flex-col gap-4">
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Aarav Sharma, Cricket, Batter, 2026, 101, 150&#10;Kavita Patil, Volleyball, Spiker, 2027, 102, 120"
                rows={7}
                required
                className="w-full px-4 py-3 bg-[#0B0B0B] border border-white/10 rounded-xl text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:border-[#047554]"
              />

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCsvModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !csvText.trim()}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#0B0B0B] font-medium text-xs hover:bg-[#F0F2EE] disabled:opacity-50"
                >
                  {isSubmitting ? 'Importing...' : 'Parse & Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Player Confirmation */}
      {deleteConfirmPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#141414] border border-[#B91C1C]/40 rounded-3xl p-6 sm:p-8 flex flex-col gap-5 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-[#B91C1C]/20 border border-[#B91C1C]/40 flex items-center justify-center text-[#B91C1C]">
              <WarningCircle size={28} weight="bold" />
            </div>

            <div>
              <h2 className="font-syne font-bold text-xl text-white">
                Delete Player "{deleteConfirmPlayer.name}"?
              </h2>
              <p className="text-xs text-[#8E928C] mt-2 leading-relaxed">
                This will remove the player from the draft pool and any team roster. If this player is currently projected on stage, the screen will switch to Idle.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmPlayer(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePlayer}
                disabled={isSubmitting}
                className="min-h-[44px] px-6 py-2 rounded-xl bg-[#B91C1C] text-white font-medium text-xs hover:bg-[#991B1B] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Deleting...' : 'Delete Player'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
