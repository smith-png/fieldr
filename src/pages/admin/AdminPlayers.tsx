import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowsLeftRight,
  CheckCircle,
  DownloadSimple,
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
  Users,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { AcademicYear, AdminTab, Athlete, Player, PlayerStatus, Season, Sport, Team } from '../../types'
import {
  assignPlayerToTeam,
  bulkCreatePlayers,
  createPlayer,
  deletePlayer,
  exportPlayersForSport,
  formatAthleteCode,
  getPlayers,
  getPlayersPaged,
  getRolesForSport,
  markLocalMutation,
  searchAthletes,
  subscribeToAthletes,
  unassignPlayerFromTeam,
  updatePlayer
} from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { getAcademicYearLabel } from '../../lib/academicYears'
import { getErrorMessage } from '../../lib/errors'
import { Button, Dialog, EmptyState, PageHeader, Pagination } from '../../components/ui'
import { BulkRegisterPanel } from '../../components/admin'

interface AdminPlayersProps {
  activeSeason: Season | null
  players?: Player[]
  teams: Team[]
  sports: Sport[]
  onRefresh: () => Promise<void>
  onGoToTab?: (tab: AdminTab) => void
}

export const AdminPlayers: React.FC<AdminPlayersProps> = ({
  activeSeason,
  players = [],
  teams,
  sports,
  onRefresh,
  onGoToTab
}) => {
  const { showToast } = useToast()

  // Pagination & Filtering state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(15)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pagedPlayers, setPagedPlayers] = useState<Player[]>([])
  const [seasonPlayersList, setSeasonPlayersList] = useState<Player[]>(players)
  const [isLoading, setIsLoading] = useState(true)

  const activeSeasonId = activeSeason?.id || null
  const loadedSeasonIdRef = useRef<string | null>(null)
  const latestReqIdRef = useRef(0)
  const latestSeasonReqIdRef = useRef(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedSport, setSelectedSport] = useState<string>('all')
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [filterSportRoles, setFilterSportRoles] = useState<string[]>([])
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const prevFiltersRef = useRef({
    sport: 'all',
    role: 'all',
    status: 'all'
  })

  // Modals & Drawers
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isBulkDrawerOpen, setIsBulkDrawerOpen] = useState(false)
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

  // Register Player Form Fields (Editable: Sport, Role, Starting Points only)
  const [sport, setSport] = useState('')
  const [playingRole, setPlayingRole] = useState('')
  const [basePoints, setBasePoints] = useState('100')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Step 1: Athlete Profile Picker state
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null)
  const [athleteQuery, setAthleteQuery] = useState('')
  const [athleteResults, setAthleteResults] = useState<Athlete[]>([])
  const [isSearchingAthletes, setIsSearchingAthletes] = useState(false)

  // CSV Import state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<
    Array<Omit<Player, 'id' | 'player_code' | 'created_at'> & { valid: boolean; error?: string }>
  >([])
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    setSeasonPlayersList(players)
  }, [players])

  const refreshSeasonPlayers = useCallback(async () => {
    if (!activeSeasonId) return
    const reqId = ++latestSeasonReqIdRef.current
    try {
      const all = await getPlayers(activeSeasonId)
      if (isMountedRef.current && reqId === latestSeasonReqIdRef.current) {
        setSeasonPlayersList(all)
      }
    } catch {
      // ignore
    }
  }, [activeSeasonId])

  const isAthleteRegisteredForSport = useCallback(
    (athleteId: string | undefined, athleteCode: number | undefined, targetSport: string): boolean => {
      if (!targetSport) return false
      return seasonPlayersList.some(
        (p) =>
          (!editingPlayer || p.id !== editingPlayer.id) &&
          ((athleteId && p.athlete_id === athleteId) ||
            (athleteCode !== undefined && p.athlete_code === athleteCode)) &&
          p.sport.toLowerCase() === targetSport.toLowerCase()
      )
    },
    [seasonPlayersList, editingPlayer]
  )

  const downloadPlayersTemplate = () => {
    const header = 'athlete_code,sport,playing_role,base_points\n'
    const example = '0001,Cricket,Batter,500\n'
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
    reader.onload = async (event) => {
      const content = event.target?.result as string
      if (!content) return

      const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length <= 1) {
        showToast('CSV is empty or missing headers', 'error')
        return
      }

      const rows: Array<
        Omit<Player, 'id' | 'player_code' | 'created_at'> & { valid: boolean; error?: string }
      > = []

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim())
        if (parts.length < 3) continue

        const [codeOrName, sportVal, roleVal, pointsVal] = parts
        let matchedAth: Athlete | undefined
        try {
          const matches = await searchAthletes(codeOrName)
          const parsedCode = parseInt(codeOrName.replace(/^FLD-?/i, ''), 10)
          matchedAth =
            matches.find((a) => !isNaN(parsedCode) && a.athlete_code === parsedCode) ||
            matches.find((a) => a.name.toLowerCase() === codeOrName.toLowerCase())
        } catch {
          matchedAth = undefined
        }

        let rowError: string | undefined
        if (!matchedAth) rowError = 'Athlete profile not found'
        else if (!sportVal) rowError = 'Sport is required'
        else if (isAthleteRegisteredForSport(matchedAth.id, matchedAth.athlete_code, sportVal)) {
          rowError = 'Already registered for this sport in this season'
        }

        rows.push({
          season_id: activeSeason.id,
          athlete_id: matchedAth?.id,
          athlete_code: matchedAth?.athlete_code,
          name: matchedAth?.name || codeOrName,
          sport: sportVal || 'Cricket',
          playing_role: roleVal || 'Player',
          academic_year: (matchedAth?.academic_year || '1st') as AcademicYear,
          base_points: parseInt(pointsVal, 10) || 100,
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
      markLocalMutation(['players', 'athletes', 'auction'])
      await bulkCreatePlayers(validRows)
      showToast(`Imported ${validRows.length} players successfully`, 'success')
      setIsCsvModalOpen(false)
      setCsvRows([])
      await Promise.all([loadPagedPlayers(), onRefresh()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Import failed'), 'error')
    } finally {
      setIsImporting(false)
    }
  }

  const handleSearchAthletes = useCallback(
    async (q: string) => {
      setAthleteQuery(q)
      try {
        setIsSearchingAthletes(true)
        const res = await searchAthletes(q)
        setAthleteResults(res)
      } catch (err: unknown) {
        showToast(getErrorMessage(err, 'Failed to search athletes'), 'error')
        setAthleteResults([])
      } finally {
        setIsSearchingAthletes(false)
      }
    },
    [showToast]
  )

  // Debounce main table search query by 300ms; only reset page when search text actually changes
  useEffect(() => {
    const trimmed = searchQuery.trim()
    if (trimmed === debouncedSearch) return
    const handler = setTimeout(() => {
      setDebouncedSearch(trimmed)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchQuery, debouncedSearch])

  // Reset page only when sport, role or status filter actually changes
  useEffect(() => {
    const prev = prevFiltersRef.current
    if (
      prev.sport !== selectedSport ||
      prev.role !== selectedRole ||
      prev.status !== selectedStatus
    ) {
      prevFiltersRef.current = {
        sport: selectedSport,
        role: selectedRole,
        status: selectedStatus
      }
      setCurrentPage(1)
    }
  }, [selectedSport, selectedRole, selectedStatus])

  // Load filter roles when selectedSport changes
  useEffect(() => {
    let mounted = true
    async function loadFilterRoles() {
      if (selectedSport === 'all') {
        if (mounted) {
          setFilterSportRoles([])
          setSelectedRole('all')
        }
        return
      }
      const roles = await getRolesForSport(selectedSport)
      if (mounted) {
        setFilterSportRoles(roles)
        setSelectedRole((prev) => (prev !== 'all' && !roles.includes(prev) ? 'all' : prev))
      }
    }
    loadFilterRoles()
    return () => {
      mounted = false
    }
  }, [selectedSport, sports])

  // Load paged players: show skeleton ONLY on first load or when activeSeasonId changes
  const loadPagedPlayers = useCallback(async () => {
    if (!activeSeasonId) {
      setIsLoading(false)
      return
    }
    const reqId = ++latestReqIdRef.current
    const isInitialOrSeasonSwitch = loadedSeasonIdRef.current !== activeSeasonId
    try {
      if (isInitialOrSeasonSwitch) {
        setIsLoading(true)
      }
      const res = await getPlayersPaged({
        seasonId: activeSeasonId,
        page: currentPage,
        pageSize,
        sport: selectedSport === 'all' ? undefined : selectedSport,
        role: selectedRole === 'all' ? undefined : selectedRole,
        status: selectedStatus === 'all' ? undefined : (selectedStatus as PlayerStatus),
        search: debouncedSearch || undefined
      })
      if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
      loadedSeasonIdRef.current = activeSeasonId
      setPagedPlayers(res.players)
      setTotalPages(res.totalPages)
      setTotalCount(res.totalCount)
    } catch (err: unknown) {
      if (isMountedRef.current && reqId === latestReqIdRef.current) {
        showToast(getErrorMessage(err, 'Failed to load players'), 'error')
      }
    } finally {
      if (isMountedRef.current && reqId === latestReqIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [
    activeSeasonId,
    currentPage,
    pageSize,
    selectedSport,
    selectedRole,
    selectedStatus,
    debouncedSearch,
    showToast
  ])

  useEffect(() => {
    loadPagedPlayers()
  }, [loadPagedPlayers])

  // Debounced (500ms) realtime subscription for external changes; cancelled on unmount
  useEffect(() => {
    if (!activeSeasonId) return
    const unsubscribe = subscribeToAthletes(() => {
      loadPagedPlayers()
      refreshSeasonPlayers()
    })
    return () => {
      unsubscribe()
    }
  }, [activeSeasonId, loadPagedPlayers, refreshSeasonPlayers])

  // Available roles for currently selected form sport loaded from shared helper
  const [availableRoles, setAvailableRoles] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    async function loadRoles() {
      if (!sport) return
      const roles = await getRolesForSport(sport)
      if (mounted) {
        setAvailableRoles(roles)
        if (roles.length > 0) {
          setPlayingRole((prev) => (!prev || !roles.includes(prev) ? roles[0] : prev))
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
    setAthleteQuery('')
    const initialSport = sports[0]?.name || 'Cricket'
    setSport(initialSport)
    const initialRoles = await getRolesForSport(initialSport)
    setAvailableRoles(initialRoles)
    setPlayingRole(initialRoles[0] || '')
    setBasePoints('100')
    setIsDrawerOpen(true)
    await refreshSeasonPlayers()
    await handleSearchAthletes('')
  }

  const openEditDrawer = async (p: Player) => {
    setEditingPlayer(p)
    setSelectedAthlete(null)
    setSport(p.sport)
    const roles = await getRolesForSport(p.sport)
    setAvailableRoles(roles)
    setPlayingRole(p.playing_role)
    setBasePoints(String(p.base_points || 100))
    setIsDrawerOpen(true)
    await refreshSeasonPlayers()
  }

  const handleSportChange = async (newSport: string) => {
    setSport(newSport)
    const roles = await getRolesForSport(newSport)
    setAvailableRoles(roles)
    if (roles.length > 0) {
      setPlayingRole(roles[0])
    }
  }

  // Save Player (Create or Edit)
  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason) {
      showToast('No active tournament season', 'error')
      return
    }

    if (!editingPlayer && !selectedAthlete) {
      showToast('Please select an athlete profile first', 'error')
      return
    }

    const targetAthleteId = editingPlayer ? editingPlayer.athlete_id : selectedAthlete?.id
    const targetAthleteCode = editingPlayer ? editingPlayer.athlete_code : selectedAthlete?.athlete_code

    if (isAthleteRegisteredForSport(targetAthleteId, targetAthleteCode, sport)) {
      showToast('This athlete is already registered for this sport in this season.', 'error')
      return
    }

    try {
      setIsSubmitting(true)
      if (editingPlayer) {
        await updatePlayer(editingPlayer.id, {
          sport,
          playing_role: playingRole,
          base_points: parseInt(basePoints, 10) || 100
        })
        showToast('Player entry updated', 'success')
      } else if (selectedAthlete) {
        await createPlayer({
          athlete_id: selectedAthlete.id,
          season_id: activeSeason.id,
          sport,
          playing_role: playingRole,
          base_points: parseInt(basePoints, 10) || 100,
          academic_year: (selectedAthlete.academic_year || '1st') as AcademicYear,
          name: selectedAthlete.name,
          status: 'available'
        })
        showToast('Player registered', 'success')
      }
      markLocalMutation(['players', 'athletes', 'auction'])
      setIsDrawerOpen(false)
      await Promise.all([loadPagedPlayers(), onRefresh()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to save player'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete Player
  const handleDeletePlayer = async () => {
    if (!deleteConfirmPlayer) return
    try {
      markLocalMutation(['players', 'athletes', 'auction'])
      await deletePlayer(deleteConfirmPlayer.id)
      showToast('Player entry removed', 'success')
      setDeleteConfirmPlayer(null)
      await Promise.all([loadPagedPlayers(), onRefresh()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to delete player'), 'error')
    }
  }

  // Handle Team Assignment
  const handleExecuteAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignmentPlayer || !assignTeamId) return

    const priceNum = assignPrice ? parseInt(assignPrice, 10) : undefined
    try {
      markLocalMutation(['players', 'teams', 'auction'])
      await assignPlayerToTeam(assignmentPlayer.id, assignTeamId, priceNum)
      showToast('Player assigned to team', 'success')
      setAssignmentPlayer(null)
      setAssignTeamId('')
      setAssignPrice('')
      await Promise.all([loadPagedPlayers(), onRefresh()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Assignment failed'), 'error')
    }
  }

  // Handle Unassignment
  const handleExecuteUnassign = async () => {
    if (!assignmentPlayer) return
    try {
      markLocalMutation(['players', 'teams', 'auction'])
      await unassignPlayerFromTeam(assignmentPlayer.id, unassignRefund)
      showToast('Player unassigned and returned to available pool', 'success')
      setAssignmentPlayer(null)
      await Promise.all([loadPagedPlayers(), onRefresh()])
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Unassignment failed'), 'error')
    }
  }

  const sanitizeCsvValue = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""'
    let str = String(val).replace(/"/g, '""')
    if (/^[=+\-@]/.test(str)) {
      str = `'${str}`
    }
    return `"${str}"`
  }

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

      showToast(`Exported ${exportList.length} players to CSV`, 'success')
      setIsExportModalOpen(false)
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to export CSV'), 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const isProfileSelected = Boolean(selectedAthlete || editingPlayer)
  const displayProfileName = selectedAthlete
    ? selectedAthlete.name
    : editingPlayer
    ? editingPlayer.name
    : ''
  const displayProfileCode = selectedAthlete
    ? formatAthleteCode(selectedAthlete.athlete_code)
    : editingPlayer
    ? formatAthleteCode(editingPlayer.athlete_code || editingPlayer.player_code)
    : ''
  const displayProfileYear = selectedAthlete
    ? getAcademicYearLabel(selectedAthlete.academic_year || '1st')
    : editingPlayer
    ? getAcademicYearLabel(editingPlayer.academic_year || '1st')
    : ''

  const isSelectedDuplicateForSport = isProfileSelected
    ? isAthleteRegisteredForSport(
        editingPlayer ? editingPlayer.athlete_id : selectedAthlete?.id,
        editingPlayer ? editingPlayer.athlete_code : selectedAthlete?.athlete_code,
        sport
      )
    : false

  return (
    <div className="space-y-6">
      <PageHeader
        label="Athlete Roster Repository"
        title="Registered Players"
        subtitle="Manage per-season sport entries, base points, and franchise squad assignments."
        actions={
          <>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-2 border border-border text-text text-xs font-medium hover:bg-surface transition-colors cursor-pointer min-h-[40px]">
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
              variant="secondary"
              size="md"
              leftIcon={DownloadSimple}
              onClick={() => setIsExportModalOpen(true)}
            >
              Export CSV
            </Button>

            <Button
              variant="secondary"
              size="md"
              leftIcon={Users}
              onClick={() => setIsBulkDrawerOpen(true)}
            >
              Bulk Register
            </Button>

            <Button
              variant="primary"
              size="md"
              leftIcon={Plus}
              onClick={openCreateDrawer}
            >
              Register Athlete
            </Button>
          </>
        }
      />

      {/* Filter and Search Bar */}
      <div className="bg-surface border border-border rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm">
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
            className="w-full bg-bg border border-border rounded-xl pl-10 pr-4 py-2 text-xs text-text placeholder-muted focus:outline-none focus:border-accent-bright"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
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

          {selectedSport !== 'all' && filterSportRoles.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>Role:</span>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent-bright"
              >
                <option value="all">All Roles</option>
                {filterSportRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          )}

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

      {/* Players Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 font-normal">ID</th>
                <th className="py-3 px-4 font-normal">Name</th>
                <th className="py-3 px-4 font-normal">Sport</th>
                <th className="py-3 px-4 font-normal">Role</th>
                <th className="py-3 px-4 font-normal">Year</th>
                <th className="py-3 px-4 font-normal">Status</th>
                <th className="py-3 px-4 font-normal">Team</th>
                <th className="py-3 px-4 font-normal text-right">Actions</th>
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
                  <td colSpan={8} className="p-6">
                    <EmptyState
                      icon={User}
                      title="No players found"
                      description="Register an athlete for this season or adjust your filters."
                      actionLabel="Register Athlete"
                      onAction={openCreateDrawer}
                    />
                  </td>
                </tr>
              ) : (
                pagedPlayers.map((player) => {
                  const assignedTeam = teams.find((t) => t.id === player.team_id)
                  return (
                    <tr
                      key={player.id}
                      className="hover:bg-surface-2/60 transition-colors font-sans"
                    >
                      <td className="py-3.5 px-4 font-mono text-[11px] text-accent-bright font-semibold tabular-nums">
                        <Link
                          to={`/players/${player.athlete_code || formatAthleteCode(player.player_code)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {formatAthleteCode(player.athlete_code || player.player_code)}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-text">
                        {player.name}
                      </td>

                      <td className="py-3.5 px-4 text-text">
                        {player.sport}
                      </td>

                      <td className="py-3.5 px-4 text-muted">
                        {player.playing_role}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-muted">
                        {player.academic_year || '1st'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <span
                          className={
                            player.status === 'sold'
                              ? 'text-accent-bright font-semibold'
                              : 'text-muted'
                          }
                        >
                          {player.status === 'sold' ? 'Sold' : 'Available'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {assignedTeam ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="w-2 h-2 rounded-full inline-block border border-border"
                              style={{ backgroundColor: assignedTeam.color || 'var(--accent)' }}
                            />
                            <span className="text-text font-medium">
                              {assignedTeam.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAssignmentPlayer(player)
                              setAssignTeamId(player.team_id || '')
                              setAssignPrice(player.purchase_price ? String(player.purchase_price) : '')
                            }}
                            title={player.status === 'sold' ? 'Manage squad assignment' : 'Assign to franchise'}
                            className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                          >
                            <ArrowsLeftRight size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditDrawer(player)}
                            title="Edit sport entry"
                            className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                          >
                            <PencilSimple size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmPlayer(player)}
                            title="Delete player entry"
                            className="p-1.5 rounded-lg border border-border text-muted hover:text-error hover:bg-error/10 transition-colors"
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

      {/* Register Player Panel (Side Drawer) */}
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
                    {editingPlayer ? 'Update Sport Entry' : 'New Sport Entry'}
                  </span>
                  <h2 className="font-syne font-bold text-2xl text-text">
                    {editingPlayer ? 'Edit Player Entry' : 'Register Player'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <form onSubmit={handleSavePlayer} className="space-y-5">
                {/* STEP 1: Required Profile Picker */}
                {!editingPlayer && (
                  <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-mono uppercase tracking-wider text-text font-semibold flex items-center gap-1.5">
                        <IdentificationBadge size={16} className="text-accent-bright" />
                        <span>Step 1: Select Athlete Profile *</span>
                      </label>
                      {onGoToTab && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDrawerOpen(false)
                            onGoToTab('athletes')
                          }}
                          className="text-xs font-medium text-accent-bright hover:underline"
                        >
                          Create a new athlete
                        </button>
                      )}
                    </div>

                    {selectedAthlete ? (
                      <div className="p-3 rounded-xl bg-surface border border-accent-bright flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {selectedAthlete.photo_thumb_url || selectedAthlete.photo_url ? (
                            <img
                              src={selectedAthlete.photo_thumb_url || selectedAthlete.photo_url}
                              alt={selectedAthlete.name}
                              referrerPolicy="no-referrer"
                              className="w-9 h-9 rounded-lg object-cover bg-surface-2 border border-border shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                              <User size={16} />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-text truncate">
                              {selectedAthlete.name}
                            </div>
                            <div className="text-[11px] font-mono text-muted">
                              #{formatAthleteCode(selectedAthlete.athlete_code)} &middot;{' '}
                              {getAcademicYearLabel(selectedAthlete.academic_year || '1st')}
                              {selectedAthlete.roll_no ? ` · ${selectedAthlete.roll_no}` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedAthlete(null)}
                          className="text-xs font-medium text-muted hover:text-text px-2.5 py-1 rounded-lg border border-border bg-surface-2 shrink-0"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <MagnifyingGlass
                            size={15}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                          />
                          <input
                            type="text"
                            value={athleteQuery}
                            onChange={(e) => handleSearchAthletes(e.target.value)}
                            placeholder="Search by name, 4-digit code (e.g. 0001), or roll no..."
                            className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                          />
                        </div>

                        <div className="max-h-48 overflow-y-auto divide-y divide-border border border-border rounded-xl bg-bg">
                          {isSearchingAthletes ? (
                            <div className="py-4 px-3 text-center text-xs font-mono text-muted">
                              Searching profiles...
                            </div>
                          ) : athleteResults.length === 0 ? (
                            <div className="py-4 px-3 text-center text-xs text-muted">
                              No matching athletes found.
                            </div>
                          ) : (
                            athleteResults.map((ath) => {
                              const alreadyInSport = isAthleteRegisteredForSport(
                                ath.id,
                                ath.athlete_code,
                                sport
                              )
                              return (
                                <button
                                  key={ath.id}
                                  type="button"
                                  onClick={() => setSelectedAthlete(ath)}
                                  className="w-full text-left p-2.5 hover:bg-surface-2 transition-colors flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="font-mono font-bold text-[11px] text-accent-bright shrink-0 tabular-nums">
                                      {formatAthleteCode(ath.athlete_code)}
                                    </span>
                                    <div className="min-w-0">
                                      <span className="font-medium text-text block truncate">
                                        {ath.name}
                                      </span>
                                      <span className="text-[10px] font-mono text-muted">
                                        {getAcademicYearLabel(ath.academic_year || '1st')}
                                        {ath.roll_no ? ` · Roll: ${ath.roll_no}` : ''}
                                      </span>
                                    </div>
                                  </div>
                                  {alreadyInSport ? (
                                    <span className="text-[10px] font-mono text-points shrink-0">
                                      Registered in {sport}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-medium text-accent-bright shrink-0">
                                      Select
                                    </span>
                                  )}
                                </button>
                              )
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {isSelectedDuplicateForSport && (
                  <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-xs text-error font-medium">
                    This athlete is already registered for this sport in this season.
                  </div>
                )}

                {/* Read-Only, Greyed Profile Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Name (From Athlete Profile)
                    </label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={displayProfileName}
                      placeholder="Select a profile above"
                      className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2 text-xs text-muted cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Player Code
                    </label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={displayProfileCode}
                      placeholder="—"
                      className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2 text-xs font-mono text-muted cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Academic Year
                    </label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={displayProfileYear}
                      placeholder="—"
                      className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2 text-xs font-mono text-muted cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Editable Fields: Sport, Role, Starting Points (Disabled until profile is selected) */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Sport
                    </label>
                    <select
                      disabled={!isProfileSelected}
                      value={sport}
                      onChange={(e) => handleSportChange(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed"
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
                      disabled={!isProfileSelected}
                      value={playingRole}
                      onChange={(e) => setPlayingRole(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed"
                    >
                      {availableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Starting Points */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Starting Points (Purse Base)
                  </label>
                  <input
                    type="number"
                    disabled={!isProfileSelected}
                    value={basePoints}
                    onChange={(e) => setBasePoints(e.target.value)}
                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs text-text font-mono tabular-nums focus:outline-none focus:border-accent-bright disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed"
                  />
                </div>

                <div className="pt-4 border-t border-border flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsDrawerOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!isProfileSelected || isSubmitting}
                    isLoading={isSubmitting}
                  >
                    {editingPlayer ? 'Update Entry' : 'Register'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Register Panel */}
      <BulkRegisterPanel
        isOpen={isBulkDrawerOpen}
        onClose={() => setIsBulkDrawerOpen(false)}
        activeSeason={activeSeason}
        sports={sports}
        onSuccess={async () => {
          markLocalMutation(['players', 'athletes', 'auction'])
          await Promise.all([loadPagedPlayers(), onRefresh()])
        }}
        onCreateNewAthlete={
          onGoToTab
            ? () => {
                setIsBulkDrawerOpen(false)
                onGoToTab('athletes')
              }
            : undefined
        }
      />

      {/* CSV Export Modal */}
      <Dialog
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Export Players CSV"
        description="Download sanitized athlete records with UTF-8 BOM encoding."
        size="sm"
      >
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

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsExportModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              leftIcon={DownloadSimple}
              disabled={isExporting}
              isLoading={isExporting}
              onClick={handleDownloadCsv}
            >
              Download CSV
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Assignment Modal */}
      <Dialog
        isOpen={!!assignmentPlayer}
        onClose={() => setAssignmentPlayer(null)}
        title="Squad Assignment"
        size="md"
      >
        {assignmentPlayer && (
          <div>
            <div className="mb-4 p-3 rounded-xl bg-surface-2 border border-border text-xs">
              <span className="font-mono text-accent-bright block mb-0.5 tabular-nums">
                {formatAthleteCode(assignmentPlayer.athlete_code || assignmentPlayer.player_code)}
              </span>
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
                      className="rounded border-border bg-bg text-accent-bright accent-accent-bright"
                    />
                    <span>
                      Refund purchase price ({assignmentPlayer.purchase_price.toLocaleString()} pts) to franchise purse
                    </span>
                  </label>
                )}
                <div className="flex justify-end gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setAssignmentPlayer(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    leftIcon={UserMinus}
                    onClick={handleExecuteUnassign}
                  >
                    Unassign Athlete
                  </Button>
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
                    className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs font-mono tabular-nums text-text focus:outline-none focus:border-accent-bright"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setAssignmentPlayer(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    leftIcon={UserPlus}
                  >
                    Assign to Team
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={!!deleteConfirmPlayer}
        onClose={() => setDeleteConfirmPlayer(null)}
        title="Remove Entry?"
        size="sm"
      >
        {deleteConfirmPlayer && (
          <div>
            <p className="text-xs text-muted leading-relaxed mb-6">
              Are you sure you want to remove{' '}
              <span className="text-text font-semibold">{deleteConfirmPlayer.name}</span> (
              {formatAthleteCode(deleteConfirmPlayer.athlete_code || deleteConfirmPlayer.player_code)}) from this season&apos;s{' '}
              {deleteConfirmPlayer.sport} roster?
            </p>
            <div className="flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeleteConfirmPlayer(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDeletePlayer}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* CSV Bulk Import Modal */}
      <Dialog
        isOpen={isCsvModalOpen}
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
                  <th className="p-2.5 font-normal">Athlete Code</th>
                  <th className="p-2.5 font-normal">Name</th>
                  <th className="p-2.5 font-normal">Sport</th>
                  <th className="p-2.5 font-normal">Role</th>
                  <th className="p-2.5 font-normal">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {csvRows.map((r, i) => (
                  <tr key={i} className={r.valid ? '' : 'bg-error/5'}>
                    <td className="p-2.5 font-mono tabular-nums">{r.athlete_code ? formatAthleteCode(r.athlete_code) : '—'}</td>
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
              Import {csvRows.filter((r) => r.valid).length} Players
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
