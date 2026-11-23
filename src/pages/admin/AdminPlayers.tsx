import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowsLeftRight,
  DownloadSimple,
  Funnel,
  IdentificationBadge,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  User,
  UserMinus,
  UserPlus,
  Users,
  X
} from '@phosphor-icons/react'
import type {
  AcademicYear,
  AdminTab,
  Athlete,
  Player,
  PlayerStatus,
  Season,
  Sport,
  Team
} from '../../types'
import {
  assignPlayerToTeam,
  createPlayer,
  deletePlayer,
  exportPlayersForSport,
  formatAthleteCode,
  getPlayers,
  getPlayersPaged,
  getRolesForSport,
  markLocalMutation,
  searchAthletes,
  unassignPlayerFromTeam,
  updatePlayer
} from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { getAcademicYearLabel } from '../../lib/academicYears'
import { getErrorMessage } from '../../lib/errors'
import {
  getCachedQuery,
  isQueryFresh,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import {
  Button,
  Dialog,
  EmptyState,
  Pagination,
  SkeletonBlock,
  SkeletonTableRow
} from '../../components/ui'
import { BulkRegisterPanel } from '../../components/admin'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_DIALOG_CLASS,
  ADMIN_ICON_BTN,
  ADMIN_ICON_BTN_DANGER,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_SELECT,
  ADMIN_TABLE_SHELL,
  ADMIN_WELL
} from '../../components/admin/adminStyles'

interface AdminPlayersProps {
  activeSeason: Season | null
  players?: Player[]
  teams: Team[]
  sports: Sport[]
  onRefresh: () => Promise<void>
  onGoToTab?: (tab: AdminTab) => void
  externalRefreshTrigger?: number
  onCreateNewAthlete?: () => void
}

export const AdminPlayers: React.FC<AdminPlayersProps> = ({
  activeSeason,
  players = [],
  teams,
  sports,
  onRefresh,
  onGoToTab,
  externalRefreshTrigger = 0,
  onCreateNewAthlete
}) => {
  const { showToast } = useToast()

  // Pagination & Filtering state
  const activeSeasonId = activeSeason?.id || null
  const initialCache = activeSeasonId
    ? getCachedQuery<{
        players: Player[]
        totalPages: number
        totalCount: number
      }>(`admin:players:${activeSeasonId}:1:15:all:all:all:`)
    : null
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(15)
  const [totalPages, setTotalPages] = useState(() => initialCache?.data.totalPages || 1)
  const [totalCount, setTotalCount] = useState(() => initialCache?.data.totalCount || 0)
  const [pagedPlayers, setPagedPlayers] = useState<Player[]>(
    () => initialCache?.data.players || []
  )
  const [seasonPlayersList, setSeasonPlayersList] = useState<Player[]>(players)
  const [isLoading, setIsLoading] = useState(() => !initialCache)

  const loadedSeasonIdRef = useRef<string | null>(initialCache ? activeSeasonId : null)
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
  const loadPagedPlayers = useCallback(
    async (options?: { force?: boolean }) => {
      if (!activeSeasonId) {
        setIsLoading(false)
        return
      }
      const cacheKey = `admin:players:${activeSeasonId}:${currentPage}:${pageSize}:${selectedSport}:${selectedRole}:${selectedStatus}:${debouncedSearch}`
      const cached = getCachedQuery<{
        players: Player[]
        totalPages: number
        totalCount: number
      }>(cacheKey)

      if (cached && !options?.force) {
        loadedSeasonIdRef.current = activeSeasonId
        setPagedPlayers(cached.data.players)
        setTotalPages(cached.data.totalPages)
        setTotalCount(cached.data.totalCount)
        setIsLoading(false)
        if (isQueryFresh(cacheKey) && !shouldRevalidateQuery(cacheKey)) {
          return
        }
      }

      const reqId = ++latestReqIdRef.current
      const isInitialOrSeasonSwitch =
        loadedSeasonIdRef.current !== activeSeasonId && !cached
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
        setCachedQuery(cacheKey, {
          players: res.players,
          totalPages: res.totalPages,
          totalCount: res.totalCount
        })
      } catch (err: unknown) {
        if (isMountedRef.current && reqId === latestReqIdRef.current) {
          showToast(getErrorMessage(err, 'Failed to load players'), 'error')
        }
      } finally {
        if (isMountedRef.current && reqId === latestReqIdRef.current) {
          setIsLoading(false)
        }
      }
    },
    [
      activeSeasonId,
      currentPage,
      pageSize,
      selectedSport,
      selectedRole,
      selectedStatus,
      debouncedSearch,
      showToast
    ]
  )

  useEffect(() => {
    void loadPagedPlayers()
  }, [loadPagedPlayers])

  // Refresh when parent athletes section signals an athlete update/realtime event
  useEffect(() => {
    if (!activeSeasonId || externalRefreshTrigger === 0) return
    void loadPagedPlayers({ force: true })
    void refreshSeasonPlayers()
  }, [activeSeasonId, externalRefreshTrigger, loadPagedPlayers, refreshSeasonPlayers])

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
      await Promise.all([loadPagedPlayers({ force: true }), onRefresh()])
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
      await Promise.all([loadPagedPlayers({ force: true }), onRefresh()])
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
      await Promise.all([loadPagedPlayers({ force: true }), onRefresh()])
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
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <h2 className={ADMIN_CARD_TITLE}>Registered Players</h2>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={DownloadSimple}
            onClick={() => setIsExportModalOpen(true)}
            className="rounded-full"
          >
            Export CSV
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={Users}
            onClick={() => setIsBulkDrawerOpen(true)}
            className="rounded-full"
          >
            Bulk Register
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            leftIcon={Plus}
            onClick={openCreateDrawer}
            className="rounded-full px-4"
          >
            Register Athlete
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass
            size={16}
            weight="regular"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or code (0001)..."
            className={`${ADMIN_INPUT} pl-10`}
          />
        </div>

        {/* Single horizontally scrollable filter row on mobile — never wraps */}
        <div className="max-w-full overflow-x-auto pb-1 -mb-1">
          <div className="inline-flex flex-nowrap items-center gap-2.5 w-max">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted shrink-0">
              <Funnel size={14} weight="regular" />
              <span>Filters</span>
            </span>

            <select
              aria-label="Filter by sport"
              value={selectedSport}
              onChange={(e) => setSelectedSport(e.target.value)}
              className="min-h-[38px] bg-bg border border-border rounded-full px-3.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent-bright whitespace-nowrap shrink-0"
            >
              <option value="all">All Sports</option>
              {sports.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            {selectedSport !== 'all' && filterSportRoles.length > 0 && (
              <select
                aria-label="Filter by role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="min-h-[38px] bg-bg border border-border rounded-full px-3.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent-bright whitespace-nowrap shrink-0"
              >
                <option value="all">All Roles</option>
                {filterSportRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="Filter by status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="min-h-[38px] bg-bg border border-border rounded-full px-3.5 py-1.5 text-xs text-text focus:outline-none focus:border-accent-bright whitespace-nowrap shrink-0"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="sold">Sold</option>
            </select>
          </div>
        </div>
      </div>

      {/* Players Table */}
      <div className={ADMIN_TABLE_SHELL}>
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full min-w-[780px] text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-muted font-mono uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 font-normal whitespace-nowrap">ID</th>
                <th className="py-3.5 px-4 font-normal whitespace-nowrap">Name</th>
                <th className="py-3.5 px-4 font-normal whitespace-nowrap">Sport</th>
                <th className="py-3.5 px-4 font-normal whitespace-nowrap">Role</th>
                <th className="py-3.5 px-4 font-normal whitespace-nowrap">Year</th>
                <th className="py-3.5 px-4 font-normal whitespace-nowrap">Status</th>
                <th className="py-3.5 px-4 font-normal whitespace-nowrap">Team</th>
                <th className="py-3.5 px-4 font-normal text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonTableRow key={i} columns={8} />
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
                      className="hover:bg-surface-2/50 transition-colors font-sans"
                    >
                      <td className="py-3.5 px-4 font-mono text-xs text-accent-bright font-semibold tabular-nums whitespace-nowrap">
                        <Link
                          to={`/players/${player.athlete_code || formatAthleteCode(player.player_code)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {formatAthleteCode(player.athlete_code || player.player_code)}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-text whitespace-nowrap">
                        {player.name}
                      </td>

                      <td className="py-3.5 px-4 text-text whitespace-nowrap">{player.sport}</td>

                      <td className="py-3.5 px-4 text-muted whitespace-nowrap">
                        {player.playing_role}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-muted whitespace-nowrap">
                        {player.academic_year || '1st'}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full border font-mono text-[11px] ${
                            player.status === 'sold'
                              ? 'bg-accent/10 border-accent-bright/30 text-accent-bright font-medium'
                              : 'bg-surface-2 border-border text-muted'
                          }`}
                        >
                          {player.status === 'sold' ? 'Sold' : 'Available'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {assignedTeam ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block border border-border shrink-0"
                              style={{ backgroundColor: assignedTeam.color || 'var(--accent)' }}
                            />
                            <span className="text-text font-medium">{assignedTeam.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setAssignmentPlayer(player)
                              setAssignTeamId(player.team_id || '')
                              setAssignPrice(
                                player.purchase_price ? String(player.purchase_price) : ''
                              )
                            }}
                            aria-label={
                              player.status === 'sold'
                                ? `Manage squad assignment for ${player.name}`
                                : `Assign ${player.name} to franchise`
                            }
                            title={
                              player.status === 'sold'
                                ? 'Manage squad assignment'
                                : 'Assign to franchise'
                            }
                            className={ADMIN_ICON_BTN}
                          >
                            <ArrowsLeftRight size={15} weight="regular" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditDrawer(player)}
                            aria-label={`Edit ${player.name}`}
                            title="Edit sport entry"
                            className={ADMIN_ICON_BTN}
                          >
                            <PencilSimple size={15} weight="regular" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmPlayer(player)}
                            aria-label={`Delete ${player.name}`}
                            title="Delete player entry"
                            className={ADMIN_ICON_BTN_DANGER}
                          >
                            <Trash size={15} weight="regular" />
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
        <div className="py-3.5 px-4 border-t border-border bg-surface-2/60">
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
          <div className="fixed inset-0 bg-scrim" onClick={() => setIsDrawerOpen(false)} />
          <div className="relative w-full max-w-lg frost-strong border-l border-border rounded-l-3xl h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between z-10 shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-border mb-6">
                <h2 className="font-syne font-bold text-2xl text-text tracking-tight">
                  {editingPlayer ? 'Edit Player Entry' : 'Register Player'}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label="Close drawer"
                  className="relative hit-44 w-9 h-9 rounded-full border border-border bg-surface-2 flex items-center justify-center text-muted hover:text-text hover:bg-surface transition-colors cursor-pointer"
                >
                  <X size={18} weight="regular" />
                </button>
              </div>

              <form onSubmit={handleSavePlayer} className="space-y-5">
                {/* Required Profile Picker */}
                {!editingPlayer && (
                  <div className={`${ADMIN_WELL} p-4 space-y-3`}>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium text-text flex items-center gap-2">
                        <IdentificationBadge
                          size={16}
                          weight="regular"
                          className="text-accent-bright"
                        />
                        <span>Select Athlete *</span>
                      </label>
                      {(onCreateNewAthlete || onGoToTab) && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDrawerOpen(false)
                            if (onCreateNewAthlete) {
                              onCreateNewAthlete()
                            } else {
                              onGoToTab?.('athletes')
                            }
                          }}
                          className="text-xs font-medium text-accent-bright hover:underline cursor-pointer"
                        >
                          Create new athlete
                        </button>
                      )}
                    </div>

                    {selectedAthlete ? (
                      <div className="p-3.5 rounded-2xl bg-surface border border-accent-bright flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {selectedAthlete.photo_thumb_url || selectedAthlete.photo_url ? (
                            <img
                              src={selectedAthlete.photo_thumb_url || selectedAthlete.photo_url}
                              alt={selectedAthlete.name}
                              width={36}
                              height={36}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-xl object-cover bg-surface-2 border border-border shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                              <User size={16} weight="regular" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text truncate">
                              {selectedAthlete.name}
                            </div>
                            <div className="text-xs font-mono text-muted">
                              #{formatAthleteCode(selectedAthlete.athlete_code)} &middot;{' '}
                              {getAcademicYearLabel(selectedAthlete.academic_year || '1st')}
                              {selectedAthlete.roll_no ? ` · ${selectedAthlete.roll_no}` : ''}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedAthlete(null)}
                          className="relative hit-44 h-8 px-3 rounded-full text-xs font-medium text-muted hover:text-text border border-border bg-surface-2 shrink-0 cursor-pointer"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <MagnifyingGlass
                            size={15}
                            weight="regular"
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                          />
                          <input
                            type="text"
                            value={athleteQuery}
                            onChange={(e) => handleSearchAthletes(e.target.value)}
                            placeholder="Search by name, code (0001), or roll no..."
                            className={`${ADMIN_INPUT} bg-surface pl-10`}
                          />
                        </div>

                        <div className="max-h-48 overflow-y-auto divide-y divide-border border border-border rounded-2xl bg-surface thin-scrollbar">
                          {isSearchingAthletes ? (
                            <div className="p-3 space-y-2">
                              <SkeletonBlock className="h-9 w-full rounded-xl" />
                              <SkeletonBlock className="h-9 w-full rounded-xl" />
                            </div>
                          ) : athleteResults.length === 0 ? (
                            <div className="py-5 px-3 text-center text-xs text-muted">
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
                                  className="w-full text-left px-3.5 py-2.5 hover:bg-surface-2 transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="font-mono font-semibold text-xs text-accent-bright shrink-0 tabular-nums">
                                      {formatAthleteCode(ath.athlete_code)}
                                    </span>
                                    <div className="min-w-0">
                                      <span className="font-medium text-text block truncate">
                                        {ath.name}
                                      </span>
                                      <span className="text-[11px] font-mono text-muted">
                                        {getAcademicYearLabel(ath.academic_year || '1st')}
                                        {ath.roll_no ? ` · ${ath.roll_no}` : ''}
                                      </span>
                                    </div>
                                  </div>
                                  {alreadyInSport ? (
                                    <span className="px-2 py-0.5 rounded-full bg-points/10 border border-points/25 text-[10px] font-mono text-points shrink-0">
                                      In {sport}
                                    </span>
                                  ) : (
                                    <span className="text-xs font-medium text-accent-bright shrink-0">
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
                  <div className="p-3.5 rounded-2xl bg-error/10 border border-error/30 text-xs text-error font-medium">
                    This athlete is already registered for this sport in this season.
                  </div>
                )}

                {/* Read-Only, Greyed Profile Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className={ADMIN_LABEL}>Name</label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={displayProfileName}
                      placeholder="Select a profile above"
                      className={ADMIN_INPUT}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={ADMIN_LABEL}>Player Code</label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={displayProfileCode}
                      placeholder="—"
                      className={`${ADMIN_INPUT} font-mono`}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className={ADMIN_LABEL}>Academic Year</label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={displayProfileYear}
                      placeholder="—"
                      className={`${ADMIN_INPUT} font-mono`}
                    />
                  </div>
                </div>

                {/* Editable Fields: Sport, Role, Starting Points */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className={ADMIN_LABEL}>Sport</label>
                    <select
                      disabled={!isProfileSelected}
                      value={sport}
                      onChange={(e) => handleSportChange(e.target.value)}
                      className={`${ADMIN_SELECT} w-full`}
                    >
                      {sports.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className={ADMIN_LABEL}>Role</label>
                    <select
                      disabled={!isProfileSelected}
                      value={playingRole}
                      onChange={(e) => setPlayingRole(e.target.value)}
                      className={`${ADMIN_SELECT} w-full`}
                    >
                      {availableRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className={ADMIN_LABEL}>Starting Points</label>
                    <span className="text-xs font-mono text-muted">PTS</span>
                  </div>
                  <input
                    type="number"
                    disabled={!isProfileSelected}
                    value={basePoints}
                    onChange={(e) => setBasePoints(e.target.value)}
                    className={`${ADMIN_INPUT} font-mono tabular-nums`}
                  />
                </div>

                <div className="pt-4 border-t border-border flex justify-end gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsDrawerOpen(false)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!isProfileSelected || isSubmitting}
                    isLoading={isSubmitting}
                    className="rounded-full px-4"
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
          onCreateNewAthlete || onGoToTab
            ? () => {
                setIsBulkDrawerOpen(false)
                if (onCreateNewAthlete) {
                  onCreateNewAthlete()
                } else {
                  onGoToTab?.('athletes')
                }
              }
            : undefined
        }
      />

      {/* CSV Export Modal */}
      <Dialog
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Export Players CSV"
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className={ADMIN_LABEL}>Sport</label>
            <select
              value={exportSport}
              onChange={(e) => setExportSport(e.target.value)}
              className={`${ADMIN_SELECT} w-full`}
            >
              <option value="all">All Sports</option>
              {sports.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsExportModalOpen(false)}
              className="rounded-full"
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
              className="rounded-full px-4"
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
        className={ADMIN_DIALOG_CLASS}
      >
        {assignmentPlayer && (
          <div className="space-y-4">
            <div className={`${ADMIN_WELL} p-4 text-xs`}>
              <span className="font-mono text-accent-bright block mb-0.5 tabular-nums">
                {formatAthleteCode(assignmentPlayer.athlete_code || assignmentPlayer.player_code)}
              </span>
              <div className="font-syne font-bold text-text text-base">
                {assignmentPlayer.name}
              </div>
              <div className="text-muted mt-0.5">
                {assignmentPlayer.sport} · {assignmentPlayer.playing_role}
              </div>
            </div>

            {assignmentPlayer.status === 'sold' ? (
              <div className="space-y-4">
                <p className="text-sm text-muted">
                  Currently drafted. Unassigning returns this player to the available pool.
                </p>
                {assignmentPlayer.purchase_price && (
                  <label className="flex items-center gap-2.5 text-sm text-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={unassignRefund}
                      onChange={(e) => setUnassignRefund(e.target.checked)}
                      className="rounded border-border bg-bg text-accent-bright accent-accent-bright"
                    />
                    <span>
                      Refund purchase price ({assignmentPlayer.purchase_price.toLocaleString()} PTS)
                    </span>
                  </label>
                )}
                <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setAssignmentPlayer(null)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    leftIcon={UserMinus}
                    onClick={handleExecuteUnassign}
                    className="rounded-full px-4"
                  >
                    Unassign Athlete
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteAssign} className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className={ADMIN_LABEL}>Team</label>
                    <span className="text-xs font-mono text-muted">{assignmentPlayer.sport}</span>
                  </div>
                  <select
                    required
                    value={assignTeamId}
                    onChange={(e) => setAssignTeamId(e.target.value)}
                    className={`${ADMIN_SELECT} w-full`}
                  >
                    <option value="">Select a team...</option>
                    {teams
                      .filter(
                        (t) =>
                          t.sport.toLowerCase() === assignmentPlayer.sport.toLowerCase()
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.current_purse.toLocaleString()} PTS)
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className={ADMIN_LABEL}>Draft Price</label>
                    <span className="text-xs font-mono text-muted">PTS · Optional</span>
                  </div>
                  <input
                    type="number"
                    value={assignPrice}
                    onChange={(e) => setAssignPrice(e.target.value)}
                    placeholder="Defaults to base points"
                    className={`${ADMIN_INPUT} font-mono tabular-nums`}
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setAssignmentPlayer(null)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    leftIcon={UserPlus}
                    className="rounded-full px-4"
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
        className={ADMIN_DIALOG_CLASS}
      >
        {deleteConfirmPlayer && (
          <div className="space-y-4">
            <p className="text-sm text-muted leading-relaxed">
              Remove{' '}
              <span className="text-text font-semibold">{deleteConfirmPlayer.name}</span> (
              {formatAthleteCode(
                deleteConfirmPlayer.athlete_code || deleteConfirmPlayer.player_code
              )}
              ) from this season&apos;s {deleteConfirmPlayer.sport} roster?
            </p>
            <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDeleteConfirmPlayer(null)}
                className="rounded-full"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleDeletePlayer}
                className="rounded-full px-4"
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  )
}
