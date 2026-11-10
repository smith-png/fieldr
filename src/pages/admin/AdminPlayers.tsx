import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowsLeftRight,
  CaretLeft,
  CaretRight,
  CheckCircle,
  DownloadSimple,
  FileCsv,
  Funnel,
  IdentificationBadge,
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
import type { AcademicYear, Athlete, Player, PlayerStatus, Season, Sport, Team } from '../../types'
import {
  assignPlayerToTeam,
  bulkCreatePlayers,
  createPlayer,
  deletePlayer,
  exportPlayersForSport,
  formatAthleteCode,
  getPlayersPaged,
  getRolesForSport,
  searchAthletes,
  unassignPlayerFromTeam,
  updatePlayer,
  uploadPlayerPhotos
} from '../../lib/data'
import { validateImageFile } from '../../lib/imageCompression'
import { useToast } from '../../lib/ToastContext'
import { ACADEMIC_YEAR_VALUES } from '../../lib/academicYears'
import { getErrorMessage } from '../../lib/errors'
import { Button, Dialog, Pagination } from '../../components/ui'

interface AdminPlayersProps {
  activeSeason: Season | null
  players?: Player[]
  teams: Team[]
  sports: Sport[]
  onRefresh: () => Promise<void>
}

const ACADEMIC_YEARS = ACADEMIC_YEAR_VALUES

export const AdminPlayers: React.FC<AdminPlayersProps> = ({
  activeSeason,
  teams,
  sports,
  onRefresh
}) => {
  const { showToast } = useToast()

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(15)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pagedPlayers, setPagedPlayers] = useState<Player[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedSport, setSelectedSport] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')

  // Modals & Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)
  const [deleteConfirmPlayer, setDeleteConfirmPlayer] = useState<Player | null>(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportSport, setExportSport] = useState('all')
  const [isExporting, setIsExporting] = useState(false)

  // Assignment Modal
  const [assignmentPlayer, setAssignmentPlayer] = useState<Player | null>(null)
  const [assignTeamId, setAssignTeamId] = useState<string>('')
  const [assignPrice, setAssignPrice] = useState<string>('')
  const [unassignRefund, setUnassignRefund] = useState<boolean>(true)

  // Form Fields
  const [name, setName] = useState('')
  const [sport, setSport] = useState('')
  const [playingRole, setPlayingRole] = useState('')
  const [academicYear, setAcademicYear] = useState<AcademicYear>('1st')
  const [basePoints, setBasePoints] = useState('100')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoThumbUrl, setPhotoThumbUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Athlete linking state
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null)
  const [isAthleteModalOpen, setIsAthleteModalOpen] = useState(false)
  const [athleteQuery, setAthleteQuery] = useState('')
  const [athleteResults, setAthleteResults] = useState<Athlete[]>([])
  const [isSearchingAthletes, setIsSearchingAthletes] = useState(false)
  const [similarAthleteWarning, setSimilarAthleteWarning] = useState<Athlete | null>(null)

  // CSV Import state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<Array<Omit<Player, 'id' | 'player_code' | 'created_at'> & { valid: boolean; error?: string }>>([])
  const [isImporting, setIsImporting] = useState(false)

  const downloadPlayersTemplate = () => {
    const header = 'name,sport,playing_role,academic_year,base_points,athlete_code,notes\n'
    const example = 'Aiden Reed,Cricket,Batter,3rd,500,1,Top-order aggressive stroke maker\n'
    const blob = new Blob([header + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `players_template_${activeSeason?.name || 'season'}.csv`
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
        showToast('CSV is empty or missing headers', 'error')
        return
      }

      const rows: Array<Omit<Player, 'id' | 'player_code' | 'created_at'> & { valid: boolean; error?: string }> = []

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim())
        if (parts.length < 3) continue

        const [nameVal, sportVal, roleVal, yearVal, pointsVal, codeVal, notesVal] = parts

        let rowError: string | undefined
        if (!nameVal) rowError = 'Name is required'
        else if (!sportVal) rowError = 'Sport is required'

        const parsedCode = codeVal ? parseInt(codeVal.replace(/^FLD-?/i, ''), 10) : undefined

        rows.push({
          season_id: activeSeason.id,
          name: nameVal || 'Unnamed Player',
          sport: sportVal || 'Cricket',
          playing_role: roleVal || 'Player',
          academic_year: (yearVal as AcademicYear) || '1st',
          base_points: parseInt(pointsVal, 10) || 100,
          athlete_code: parsedCode && !isNaN(parsedCode) ? parsedCode : undefined,
          notes: notesVal || undefined,
          status: 'available',
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
      await bulkCreatePlayers(validRows)
      showToast(`Imported ${validRows.length} players successfully`, 'success')
      setIsCsvModalOpen(false)
      setCsvRows([])
      await loadPagedPlayers()
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      showToast(msg, 'error')
    } finally {
      setIsImporting(false)
    }
  }

  const handleNameChange = async (newName: string) => {
    setName(newName)
    if (selectedAthlete || !newName.trim() || newName.length < 3) {
      setSimilarAthleteWarning(null)
      return
    }
    try {
      const found = await searchAthletes(newName.trim())
      const match = found.find(
        (a) => a.name.toLowerCase() === newName.trim().toLowerCase()
      )
      setSimilarAthleteWarning(match || null)
    } catch {
      setSimilarAthleteWarning(null)
    }
  }

  const handleSearchAthletes = async (q: string) => {
    setAthleteQuery(q)
    try {
      setIsSearchingAthletes(true)
      const res = await searchAthletes(q)
      setAthleteResults(res)
    } catch {
      setAthleteResults([])
    } finally {
      setIsSearchingAthletes(false)
    }
  }

  const handleSelectAthlete = (athlete: Athlete) => {
    setSelectedAthlete(athlete)
    setName(athlete.name)
    setPhotoUrl(athlete.photo_url || '')
    setPhotoThumbUrl(athlete.photo_thumb_url || '')
    setSimilarAthleteWarning(null)
    setIsAthleteModalOpen(false)
  }

  // Debounce search query by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setCurrentPage(1) // reset to first page on search change
    }, 300)
    return () => clearTimeout(handler)
  }, [searchQuery])

  // Reset page when sport or status filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedSport, selectedStatus])

  // Load paged players from server-side query
  const loadPagedPlayers = useCallback(async () => {
    if (!activeSeason) return
    try {
      setIsLoading(true)
      const res = await getPlayersPaged({
        seasonId: activeSeason.id,
        page: currentPage,
        pageSize,
        sport: selectedSport === 'all' ? undefined : selectedSport,
        status: selectedStatus === 'all' ? undefined : (selectedStatus as PlayerStatus),
        search: debouncedSearch || undefined
      })
      setPagedPlayers(res.players)
      setTotalPages(res.totalPages)
      setTotalCount(res.totalCount)
    } catch {
      showToast('Failed to load players', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [activeSeason, currentPage, pageSize, selectedSport, selectedStatus, debouncedSearch, showToast])

  useEffect(() => {
    loadPagedPlayers()
  }, [loadPagedPlayers])

  // Available roles for currently selected form sport loaded from shared helper
  const [availableRoles, setAvailableRoles] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    async function loadRoles() {
      if (!sport) return
      const roles = await getRolesForSport(sport)
      if (mounted) {
        setAvailableRoles(roles)
        if (roles.length > 0 && (!playingRole || !roles.includes(playingRole))) {
          setPlayingRole(roles[0])
        }
      }
    }
    loadRoles()
    return () => {
      mounted = false
    }
  }, [sport])

  const openCreateDrawer = async () => {
    setEditingPlayer(null)
    setSelectedAthlete(null)
    setSimilarAthleteWarning(null)
    setName('')
    const initialSport = sports[0]?.name || 'Cricket'
    setSport(initialSport)
    const initialRoles = await getRolesForSport(initialSport)
    setAvailableRoles(initialRoles)
    setPlayingRole(initialRoles[0] || '')
    setAcademicYear('1st')
    setBasePoints('100')
    setPhotoUrl('')
    setPhotoThumbUrl('')
    setNotes('')
    setIsDrawerOpen(true)
  }

  const openEditDrawer = async (p: Player) => {
    setEditingPlayer(p)
    setName(p.name)
    setSport(p.sport)
    const roles = await getRolesForSport(p.sport)
    setAvailableRoles(roles)
    setPlayingRole(p.playing_role)
    setAcademicYear(p.academic_year || '1st')
    setBasePoints(String(p.base_points || 100))
    setPhotoUrl(p.photo_url || '')
    setPhotoThumbUrl(p.photo_thumb_url || '')
    setNotes(p.notes || '')
    setIsDrawerOpen(true)
  }

  const handleSportChange = async (newSport: string) => {
    setSport(newSport)
    const roles = await getRolesForSport(newSport)
    setAvailableRoles(roles)
    if (roles.length > 0) {
      setPlayingRole(roles[0])
    }
  }

  // Handle client validation and original+thumbnail photo upload
  const handlePhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeSeason) return

    try {
      validateImageFile(file)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid photo file'
      showToast(msg, 'error')
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
      const msg = err instanceof Error ? err.message : 'Photo upload failed'
      showToast(msg, 'error')
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  // Save Player (Create or Edit)
  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason) {
      showToast('No active tournament season', 'error')
      return
    }

    if (!name.trim()) {
      showToast('Player name is required', 'error')
      return
    }

    try {
      setIsSubmitting(true)
      if (editingPlayer) {
        await updatePlayer(editingPlayer.id, {
          name: name.trim(),
          sport,
          playing_role: playingRole,
          academic_year: academicYear,
          base_points: parseInt(basePoints, 10) || 100,
          photo_url: photoUrl,
          photo_thumb_url: photoThumbUrl,
          notes: notes.trim()
        })
        showToast('Player profile updated', 'success')
      } else {
        await createPlayer({
          season_id: activeSeason.id,
          athlete_id: selectedAthlete?.id,
          name: name.trim(),
          sport,
          playing_role: playingRole,
          academic_year: academicYear,
          base_points: parseInt(basePoints, 10) || 100,
          photo_url: photoUrl,
          photo_thumb_url: photoThumbUrl,
          notes: notes.trim(),
          status: 'available'
        })
        showToast('Player registered with assigned code', 'success')
      }
      setIsDrawerOpen(false)
      loadPagedPlayers()
      onRefresh()
    } catch {
      showToast('Failed to save athlete', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete Player
  const handleDeletePlayer = async () => {
    if (!deleteConfirmPlayer) return
    try {
      await deletePlayer(deleteConfirmPlayer.id)
      showToast('Athlete removed', 'success')
      setDeleteConfirmPlayer(null)
      loadPagedPlayers()
      onRefresh()
    } catch {
      showToast('Failed to delete athlete', 'error')
    }
  }

  // Handle Team Assignment
  const handleExecuteAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignmentPlayer || !assignTeamId) return

    const priceNum = assignPrice ? parseInt(assignPrice, 10) : undefined
    try {
      await assignPlayerToTeam(assignmentPlayer.id, assignTeamId, priceNum)
      showToast('Player assigned to team', 'success')
      setAssignmentPlayer(null)
      setAssignTeamId('')
      setAssignPrice('')
      loadPagedPlayers()
      onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Assignment failed'
      showToast(msg, 'error')
    }
  }

  // Handle Unassignment
  const handleExecuteUnassign = async () => {
    if (!assignmentPlayer) return
    try {
      await unassignPlayerFromTeam(assignmentPlayer.id, unassignRefund)
      showToast('Player unassigned and returned to available pool', 'success')
      setAssignmentPlayer(null)
      loadPagedPlayers()
      onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unassignment failed'
      showToast(msg, 'error')
    }
  }

  // Escape CSV value against spreadsheet injection (=, +, -, @)
  const sanitizeCsvValue = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""'
    let str = String(val).replace(/"/g, '""')
    // Escape injection formula triggers
    if (/^[=+\-@]/.test(str)) {
      str = `'${str}`
    }
    return `"${str}"`
  }

  // Export CSV Handler (1000-row batch, UTF-8 BOM, sanitized against injection)
  const handleDownloadCsv = async () => {
    if (!activeSeason) return
    try {
      setIsExporting(true)
      const sportArg = exportSport === 'all' ? undefined : exportSport
      const exportList = await exportPlayersForSport(activeSeason.id, sportArg)

      const headers = [
        'Player Code',
        'Name',
        'Sport',
        'Playing Role',
        'Academic Year',
        'Status',
        'Team ID',
        'Purchase Price',
        'Base Points'
      ]

      const rows = exportList.map((p) => [
        sanitizeCsvValue(p.player_code),
        sanitizeCsvValue(p.name),
        sanitizeCsvValue(p.sport),
        sanitizeCsvValue(p.playing_role),
        sanitizeCsvValue(p.academic_year),
        sanitizeCsvValue(p.status),
        sanitizeCsvValue(p.team_id || ''),
        sanitizeCsvValue(p.purchase_price || ''),
        sanitizeCsvValue(p.base_points)
      ])

      const csvContent =
        '\uFEFF' +
        headers.join(',') +
        '\n' +
        rows.map((row) => row.join(',')).join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const today = new Date().toISOString().split('T')[0]
      const sportSlug = exportSport === 'all' ? 'all-sports' : exportSport.toLowerCase()
      a.href = url
      a.download = `fieldr-players-${sportSlug}-${today}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast(`Exported ${exportList.length} athletes to CSV`, 'success')
      setIsExportModalOpen(false)
    } catch {
      showToast('Failed to export CSV', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-1">
            ATHLETE ROSTER REPOSITORY
          </span>
          <h1 className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight">
            Registered Players
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-2 border border-border text-text text-xs font-medium hover:border-accent-bright transition-colors cursor-pointer">
            <UploadSimple size={16} weight="bold" />
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
            onClick={() => setIsExportModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-surface-2 border border-border text-text text-xs font-medium hover:border-accent-bright transition-colors"
          >
            <DownloadSimple size={16} weight="bold" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={openCreateDrawer}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90 transition-colors"
          >
            <Plus size={16} weight="bold" />
            <span>Register Athlete</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Debounced Search (Name or Player Code) */}
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or code (e.g. 0001, 1)..."
            className="w-full bg-bg border border-border rounded-xl pl-10 pr-4 py-2 text-xs text-text placeholder-muted/60 focus:outline-none focus:border-accent-bright"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Funnel size={14} />
            <span>Sport:</span>
            <select
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent-bright"
            >
              <option value="all">All Sports</option>
              {sports.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent-bright"
            >
              <option value="all">All</option>
              <option value="available">Available</option>
              <option value="sold">Sold</option>
            </select>
          </div>
        </div>
      </div>

      {/* Players Table (Columns: ID, Name, Sport, Role, Year, Status, Team, Actions) */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Sport</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Year</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Team</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={8} className="py-4 px-4 h-12 bg-surface-2/40" />
                  </tr>
                ))
              ) : pagedPlayers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center text-muted">
                    No players found matching current query or filters.
                  </td>
                </tr>
              ) : (
                pagedPlayers.map((player) => {
                  const assignedTeam = teams.find((t) => t.id === player.team_id)
                  return (
                    <tr
                      key={player.id}
                      className="hover:bg-surface-2/50 transition-colors font-sans"
                    >
                      {/* ID / Code */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-accent-bright font-semibold">
                        <Link
                          to={`/players/${player.athlete_code || formatAthleteCode(player.player_code)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {formatAthleteCode(player.athlete_code || player.player_code)}
                        </Link>
                      </td>

                      {/* Name */}
                      <td className="py-3.5 px-4 font-medium text-text">
                        {player.name}
                      </td>

                      {/* Sport */}
                      <td className="py-3.5 px-4 text-text/80">
                        {player.sport}
                      </td>

                      {/* Role */}
                      <td className="py-3.5 px-4 text-muted">
                        {player.playing_role}
                      </td>

                      {/* Year */}
                      <td className="py-3.5 px-4 font-mono text-muted">
                        {player.academic_year || '1st'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-mono text-[11px] px-2 py-0.5 rounded ${
                            player.status === 'sold'
                              ? 'bg-accent-bright/15 text-accent-bright border border-accent-bright/40'
                              : 'bg-surface-2 text-muted border border-border'
                          }`}
                        >
                          {player.status === 'sold' ? 'Sold' : 'Available'}
                        </span>
                      </td>

                      {/* Team */}
                      <td className="py-3.5 px-4">
                        {assignedTeam ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full inline-block"
                              style={{ backgroundColor: assignedTeam.color || 'var(--accent)' }}
                            />
                            <span className="text-text font-medium">
                              {assignedTeam.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted italic">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Assign / Unassign */}
                          <button
                            type="button"
                            onClick={() => {
                              setAssignmentPlayer(player)
                              setAssignTeamId(player.team_id || '')
                              setAssignPrice(player.purchase_price ? String(player.purchase_price) : '')
                            }}
                            title={player.status === 'sold' ? 'Manage squad assignment' : 'Assign to franchise'}
                            className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:border-accent-bright transition-colors"
                          >
                            <ArrowsLeftRight size={14} />
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => openEditDrawer(player)}
                            title="Edit athlete profile"
                            className="p-1.5 rounded-lg border border-border text-muted hover:text-text transition-colors"
                          >
                            <PencilSimple size={14} />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmPlayer(player)}
                            title="Delete player"
                            className="p-1.5 rounded-lg border border-border text-muted hover:text-error transition-colors"
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

        {/* Server-Side Pagination Bar */}
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

      {/* Player Registration & Edit Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-scrim"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-surface border-l border-border h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between z-10 shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border mb-6">
                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
                    {editingPlayer ? 'UPDATE PROFILE' : 'NEW REGISTRATION'}
                  </span>
                  <h2 className="font-syne font-bold text-2xl text-text">
                    {editingPlayer ? 'Edit Athlete' : 'Register Player'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 rounded-xl border border-border text-muted hover:text-text"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <form onSubmit={handleSavePlayer} className="space-y-4">
                {/* Search / Link Existing Profile Button */}
                {!editingPlayer && (
                  <div>
                    {selectedAthlete ? (
                      <div className="p-3 rounded-xl bg-accent/15 border border-accent-bright text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2 text-text font-medium">
                          <IdentificationBadge size={18} className="text-accent-bright" />
                          <span>Linked Profile: #{formatAthleteCode(selectedAthlete.athlete_code)} ({selectedAthlete.name})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAthlete(null)
                            setName('')
                          }}
                          className="text-[11px] text-muted hover:text-error font-medium"
                        >
                          Unlink
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAthleteQuery('')
                          handleSearchAthletes('')
                          setIsAthleteModalOpen(true)
                        }}
                        className="w-full py-2.5 px-4 rounded-xl border border-dashed border-border hover:border-accent-bright bg-surface-2 text-xs font-semibold text-accent-bright flex items-center justify-center gap-2 transition-colors"
                      >
                        <IdentificationBadge size={18} />
                        <span>Add existing profile...</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Read-Only Player Code */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Player Code (Sequential ID)
                  </label>
                  <input
                    type="text"
                    disabled
                    value={
                      selectedAthlete
                        ? formatAthleteCode(selectedAthlete.athlete_code)
                        : editingPlayer
                        ? formatAthleteCode(editingPlayer.athlete_code || editingPlayer.player_code)
                        : 'Assigned automatically'
                    }
                    className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2 text-xs font-mono text-accent-bright font-semibold cursor-not-allowed"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Full Athlete Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Liam Henderson"
                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  />

                  {similarAthleteWarning && !selectedAthlete && (
                    <div className="mt-2 p-3 rounded-xl bg-points/10 border border-points/30 text-xs text-text flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-points">Similar profile found:</span>{' '}
                        {similarAthleteWarning.name} (#{formatAthleteCode(similarAthleteWarning.athlete_code)})
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectAthlete(similarAthleteWarning)}
                        className="text-xs text-accent-bright font-semibold hover:underline shrink-0"
                      >
                        Link Profile
                      </button>
                    </div>
                  )}
                </div>

                {/* Sport & Playing Role */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Sport
                    </label>
                    <select
                      value={sport}
                      onChange={(e) => handleSportChange(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                    >
                      {sports.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Role
                    </label>
                    <select
                      value={playingRole}
                      onChange={(e) => setPlayingRole(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                    >
                      {availableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Academic Year Dropdown */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Academic Year
                  </label>
                  <select
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value as AcademicYear)}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  >
                    {ACADEMIC_YEARS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr} Year
                      </option>
                    ))}
                  </select>
                </div>

                {/* Base Points */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Starting Points (Purse Base)
                  </label>
                  <input
                    type="number"
                    value={basePoints}
                    onChange={(e) => setBasePoints(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  />
                </div>

                {/* Photo Upload: JPG, PNG, WebP up to 5 MB with 400px client thumbnail generation */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Athlete Photo (Max 5 MB, JPG/PNG/WebP)
                  </label>
                  <div className="flex items-center gap-3">
                    {photoThumbUrl || photoUrl ? (
                      <img
                        src={photoThumbUrl || photoUrl}
                        alt="Preview"
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
                  {editingPlayer && (
                    <span className="text-[10px] text-muted block mt-1 font-mono">
                      Existing photo will be preserved unless a replacement is uploaded.
                    </span>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Scout Notes
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Athletic traits, jersey number, secondary position..."
                    className="w-full bg-bg border border-border rounded-xl p-3 text-xs text-text focus:outline-none focus:border-accent-bright resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || isUploadingPhoto}
                    className="px-5 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Saving...' : editingPlayer ? 'Update Athlete' : 'Register Athlete'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* CSV Export Modal */}
      {isExportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4"
        >
          <div className="bg-surface border border-border rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2 text-text">
                <FileCsv size={20} className="text-accent-bright" />
                <h3 className="font-syne font-bold text-base">Export Players CSV</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-text"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <p className="text-xs text-muted mb-4">
              Download sanitized athlete records with UTF-8 BOM encoding.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                  Filter by Sport
                </label>
                <select
                  value={exportSport}
                  onChange={(e) => setExportSport(e.target.value)}
                  className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                >
                  <option value="all">All Sports</option>
                  {sports.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleDownloadCsv}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  <DownloadSimple size={14} weight="bold" />
                  <span>{isExporting ? 'Exporting...' : 'Download CSV'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {assignmentPlayer && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4"
        >
          <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <h3 className="font-syne font-bold text-lg text-text">
                Squad Assignment
              </h3>
              <button
                type="button"
                onClick={() => setAssignmentPlayer(null)}
                className="p-1 rounded-lg text-muted hover:text-text"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-xl bg-surface-2 border border-border text-xs">
              <span className="font-mono text-accent-bright block mb-0.5">{assignmentPlayer.player_code}</span>
              <div className="font-bold text-text text-sm">{assignmentPlayer.name}</div>
              <div className="text-muted mt-0.5">
                {assignmentPlayer.sport} · {assignmentPlayer.playing_role}
              </div>
            </div>

            {assignmentPlayer.status === 'sold' ? (
              <div className="space-y-4">
                <p className="text-xs text-muted">
                  This athlete is currently drafted. You can unassign them and return them to the available pool.
                </p>
                {assignmentPlayer.purchase_price && (
                  <label className="flex items-center gap-2 text-xs text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={unassignRefund}
                      onChange={(e) => setUnassignRefund(e.target.checked)}
                      className="rounded border-border bg-bg text-accent-bright"
                    />
                    <span>Refund purchase price ({assignmentPlayer.purchase_price.toLocaleString()} pts) to franchise purse</span>
                  </label>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAssignmentPlayer(null)}
                    className="px-3 py-2 rounded-xl text-xs text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteUnassign}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-error text-white text-xs font-semibold hover:opacity-90"
                  >
                    <UserMinus size={14} weight="bold" />
                    <span>Unassign Athlete</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteAssign} className="space-y-4">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Select Franchise (Same Sport: {assignmentPlayer.sport})
                  </label>
                  <select
                    required
                    value={assignTeamId}
                    onChange={(e) => setAssignTeamId(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  >
                    <option value="">Select a team...</option>
                    {teams
                      .filter(
                        (t) =>
                          t.sport.toLowerCase() === assignmentPlayer.sport.toLowerCase()
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (Balance: {t.current_purse.toLocaleString()} pts)
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Draft Price (Deducted from Purse)
                  </label>
                  <input
                    type="number"
                    value={assignPrice}
                    onChange={(e) => setAssignPrice(e.target.value)}
                    placeholder="Optional (defaults to base points)"
                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAssignmentPlayer(null)}
                    className="px-3 py-2 rounded-xl text-xs text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90"
                  >
                    <UserPlus size={14} weight="bold" />
                    <span>Assign to Team</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmPlayer && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4"
        >
          <div className="bg-surface border border-error/40 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="font-syne font-bold text-lg text-text mb-2">
              Remove Athlete?
            </h3>
            <p className="text-xs text-muted leading-relaxed mb-6">
              Are you sure you want to remove <span className="text-text font-semibold">{deleteConfirmPlayer.name}</span> ({deleteConfirmPlayer.player_code}) from tournament rosters?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmPlayer(null)}
                className="px-3 py-2 rounded-xl text-xs text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePlayer}
                className="px-4 py-2 rounded-xl bg-error text-white text-xs font-semibold hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Existing Athlete Modal */}
      {isAthleteModalOpen && (
        <Dialog
          isOpen={true}
          onClose={() => setIsAthleteModalOpen(false)}
          title="Search Universal Athlete Profiles"
          description="Search by name, roll number, or numeric ID (e.g. 1, 0001, or FLD-0001)."
          size="md"
        >
          <div className="flex flex-col gap-4">
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={athleteQuery}
                onChange={(e) => handleSearchAthletes(e.target.value)}
                placeholder="Type name, roll number, or code..."
                className="w-full bg-bg border border-border rounded-xl pl-10 pr-4 py-2.5 text-xs text-text focus:outline-none focus:border-accent-bright font-mono"
              />
            </div>

            <div className="max-h-60 overflow-y-auto flex flex-col gap-2">
              {isSearchingAthletes ? (
                <div className="py-6 text-center text-xs font-mono text-muted">Searching athletes...</div>
              ) : athleteResults.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted">No matching profiles found.</div>
              ) : (
                athleteResults.map((ath) => (
                  <div
                    key={ath.id}
                    onClick={() => handleSelectAthlete(ath)}
                    className="p-3 rounded-xl bg-surface-2 hover:bg-surface border border-border hover:border-accent-bright cursor-pointer transition-colors flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center font-mono text-accent-bright font-bold text-xs shrink-0">
                        #{formatAthleteCode(ath.athlete_code)}
                      </div>
                      <div>
                        <span className="font-semibold text-text block">{ath.name}</span>
                        {ath.roll_no && <span className="text-[11px] text-muted">Roll: {ath.roll_no}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-accent-bright font-medium">Select Profile</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Dialog>
      )}

      {/* CSV Bulk Import Modal */}
      {isCsvModalOpen && (
        <Dialog
          isOpen={true}
          onClose={() => !isImporting && setIsCsvModalOpen(false)}
          title="CSV Roster Players Import"
          description={`Previewing ${csvRows.length} player entries.`}
          size="lg"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">
                Valid entries: <strong className="text-text">{csvRows.filter((r) => r.valid).length}</strong> / {csvRows.length}
              </span>
              <button
                type="button"
                onClick={downloadPlayersTemplate}
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
                    <th className="p-2.5">Athlete Code</th>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Sport</th>
                    <th className="p-2.5">Role</th>
                    <th className="p-2.5">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {csvRows.map((r, i) => (
                    <tr key={i} className={r.valid ? '' : 'bg-error/5'}>
                      <td className="p-2.5 font-mono">{r.athlete_code ? formatAthleteCode(r.athlete_code) : 'New Profile'}</td>
                      <td className="p-2.5 font-medium">{r.name}</td>
                      <td className="p-2.5">{r.sport}</td>
                      <td className="p-2.5">{r.playing_role}</td>
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
                <span>Import {csvRows.filter((r) => r.valid).length} Players</span>
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
