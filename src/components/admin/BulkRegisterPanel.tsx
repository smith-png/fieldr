import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle,
  MagnifyingGlass,
  User,
  Users,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import type { AcademicYear, Athlete, Player, Season, Sport } from '../../types'
import {
  bulkRegisterPlayers,
  formatAthleteCode,
  getAllAthletes,
  getPlayers,
  getRolesForSport,
  markLocalMutation,
  parseAthleteCode,
  type BulkRegisterResult
} from '../../lib/data'
import { ACADEMIC_YEAR_VALUES, getAcademicYearLabel } from '../../lib/academicYears'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { Button, Dialog } from '../ui'

const YEAR_CHIPS: ReadonlyArray<'All' | AcademicYear> = ['All', ...ACADEMIC_YEAR_VALUES]

export interface BulkRegisterPanelProps {
  isOpen: boolean
  onClose: () => void
  activeSeason: Season | null
  sports: Sport[]
  initialAthlete?: Athlete | null
  onSuccess: () => Promise<void>
  onCreateNewAthlete?: () => void
}

export const BulkRegisterPanel: React.FC<BulkRegisterPanelProps> = ({
  isOpen,
  onClose,
  activeSeason,
  sports,
  initialAthlete = null,
  onSuccess,
  onCreateNewAthlete
}) => {
  const { showToast } = useToast()

  const [sport, setSport] = useState<string>('')
  const [availableRoles, setAvailableRoles] = useState<string[]>([])
  const [defaultRole, setDefaultRole] = useState<string>('')
  const [basePoints, setBasePoints] = useState<string>('100')

  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [seasonPlayers, setSeasonPlayers] = useState<Player[]>([])
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false)
  const hasLoadedOnceRef = useRef(false)
  const latestReqIdRef = useRef(0)

  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedYearChip, setSelectedYearChip] = useState<'All' | AcademicYear>('All')

  // Selected athlete IDs & per-athlete role overrides
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [roleOverrides, setRoleOverrides] = useState<Record<string, string>>({})

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [summaryResult, setSummaryResult] = useState<BulkRegisterResult | null>(null)

  const activeSeasonId = activeSeason?.id || null

  const loadPanelData = useCallback(async () => {
    if (!activeSeasonId) return
    const reqId = ++latestReqIdRef.current
    try {
      if (!hasLoadedOnceRef.current) {
        setIsLoadingData(true)
      }
      const [allAthletes, currentPlayers] = await Promise.all([
        getAllAthletes(),
        getPlayers(activeSeasonId)
      ])
      if (reqId !== latestReqIdRef.current) return
      hasLoadedOnceRef.current = true
      setAthletes(allAthletes)
      setSeasonPlayers(currentPlayers)
    } catch (err: unknown) {
      if (reqId === latestReqIdRef.current) {
        showToast(getErrorMessage(err, 'Failed to load athletes for bulk registration'), 'error')
      }
    } finally {
      if (reqId === latestReqIdRef.current) {
        setIsLoadingData(false)
      }
    }
  }, [activeSeasonId, showToast])

  // Initialize state when panel opens
  useEffect(() => {
    if (!isOpen) return
    setSport('')
    setAvailableRoles([])
    setDefaultRole('')
    setBasePoints('100')
    setSearchQuery(initialAthlete ? formatAthleteCode(initialAthlete.athlete_code) : '')
    setSelectedYearChip('All')
    setRoleOverrides({})
    setSelectedIds(initialAthlete ? new Set([initialAthlete.id]) : new Set())
    loadPanelData()
  }, [isOpen, initialAthlete, loadPanelData])

  // Load roles when sport changes
  useEffect(() => {
    let mounted = true
    async function fetchRoles() {
      if (!sport) {
        if (mounted) {
          setAvailableRoles([])
          setDefaultRole('')
          setRoleOverrides({})
        }
        return
      }
      try {
        const roles = await getRolesForSport(sport)
        if (mounted) {
          setAvailableRoles(roles)
          setDefaultRole(roles[0] || '')
          setRoleOverrides({})
        }
      } catch (err: unknown) {
        if (mounted) {
          showToast(getErrorMessage(err, 'Failed to load sport roles'), 'error')
          setAvailableRoles([])
          setDefaultRole('')
        }
      }
    }
    fetchRoles()
    return () => {
      mounted = false
    }
  }, [sport, showToast])

  // Set of athlete IDs and codes already registered in the selected sport for the active season
  const registeredInSportSet = useMemo(() => {
    const ids = new Set<string>()
    const codes = new Set<number>()
    if (!sport) return { ids, codes }
    const target = sport.toLowerCase()
    for (const p of seasonPlayers) {
      if (p.sport.toLowerCase() === target) {
        if (p.athlete_id) ids.add(p.athlete_id)
        if (typeof p.athlete_code === 'number') codes.add(p.athlete_code)
      }
    }
    return { ids, codes }
  }, [seasonPlayers, sport])

  const isAlreadyRegistered = useCallback(
    (athlete: Athlete): boolean => {
      if (!sport) return false
      return (
        registeredInSportSet.ids.has(athlete.id) ||
        registeredInSportSet.codes.has(athlete.athlete_code)
      )
    },
    [sport, registeredInSportSet]
  )

  // Whenever sport changes, deselect any athlete who is already registered for that sport
  // and if initialAthlete is provided and eligible, keep them selected
  useEffect(() => {
    if (!sport) return
    setSelectedIds((prev) => {
      const next = new Set<string>()
      for (const id of prev) {
        const ath = athletes.find((a) => a.id === id)
        if (ath && !isAlreadyRegistered(ath)) {
          next.add(id)
        }
      }
      if (
        initialAthlete &&
        next.size === 0 &&
        prev.size === 0 &&
        !isAlreadyRegistered(initialAthlete)
      ) {
        next.add(initialAthlete.id)
      }
      return next
    })
  }, [sport, athletes, initialAthlete, isAlreadyRegistered])

  // Filtered athletes by search query and academic year chip
  const filteredAthletes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const parsedCode = q ? parseAthleteCode(q) : null

    return athletes.filter((athlete) => {
      const year = athlete.academic_year || '1st'
      if (selectedYearChip !== 'All' && year !== selectedYearChip) {
        return false
      }
      if (!q) return true

      if (parsedCode !== null && athlete.athlete_code === parsedCode) return true
      if (formatAthleteCode(athlete.athlete_code).toLowerCase().includes(q)) return true
      if (athlete.name.toLowerCase().includes(q)) return true
      if (athlete.roll_no && athlete.roll_no.toLowerCase().includes(q)) return true
      return false
    })
  }, [athletes, searchQuery, selectedYearChip])

  const toggleSelectAthlete = (athlete: Athlete) => {
    if (isAlreadyRegistered(athlete)) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(athlete.id)) {
        next.delete(athlete.id)
      } else {
        next.add(athlete.id)
      }
      return next
    })
  }

  const handleSelectAllShown = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const ath of filteredAthletes) {
        if (!isAlreadyRegistered(ath)) {
          next.add(ath.id)
        }
      }
      return next
    })
  }

  const handleClearSelection = () => {
    setSelectedIds(new Set())
    setRoleOverrides({})
  }

  const handleRoleOverrideChange = (athleteId: string, role: string) => {
    setRoleOverrides((prev) => ({
      ...prev,
      [athleteId]: role
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason) {
      showToast('No active tournament season selected', 'error')
      return
    }
    if (!sport) {
      showToast('Please select a sport', 'error')
      return
    }
    if (selectedIds.size === 0) {
      showToast('Please select at least one athlete', 'error')
      return
    }

    const parsedPoints = parseInt(basePoints, 10)
    const effectiveBasePoints = !isNaN(parsedPoints) && parsedPoints >= 0 ? parsedPoints : 100

    const selectedAthletesList = athletes.filter((a) => selectedIds.has(a.id))
    const entries = selectedAthletesList.map((a) => ({
      athlete_id: a.id,
      athlete_name: a.name,
      athlete_code: a.athlete_code,
      academic_year: (a.academic_year || '1st') as AcademicYear,
      playing_role: roleOverrides[a.id] || defaultRole || availableRoles[0] || ''
    }))

    try {
      setIsSubmitting(true)
      markLocalMutation(['players', 'athletes', 'auction'])
      const result = await bulkRegisterPlayers({
        seasonId: activeSeason.id,
        sport,
        basePoints: effectiveBasePoints,
        entries
      })

      const regCount = result.registered.length
      const skipCount = result.skipped.length

      if (skipCount > 0) {
        showToast(`Registered ${regCount}, skipped ${skipCount}`, regCount > 0 ? 'info' : 'error')
        setSummaryResult(result)
      } else {
        showToast(
          `Registered ${regCount} ${regCount === 1 ? 'athlete' : 'athletes'} to ${sport}`,
          'success'
        )
      }

      markLocalMutation(['players', 'athletes', 'auction'])
      onClose()
      await onSuccess()
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Bulk registration failed'), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canRegister =
    Boolean(activeSeason) &&
    Boolean(sport) &&
    Boolean(defaultRole) &&
    selectedIds.size > 0 &&
    !isSubmitting

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-scrim" onClick={onClose} />
          <div className="relative w-full max-w-xl bg-surface border-l border-border h-full overflow-y-auto p-6 sm:p-8 flex flex-col justify-between z-10 shadow-2xl">
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div>
                  <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
                    {initialAthlete ? 'Register Athlete to Sport' : 'Batch Roster Entry'}
                  </span>
                  <h2 className="font-syne font-bold text-2xl text-text">
                    {initialAthlete ? 'Register to Sport' : 'Bulk Register'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              {/* Read-Only Selected Tournament Season & Sport / Role / Points */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                    Tournament Season
                  </label>
                  <input
                    type="text"
                    disabled
                    readOnly
                    value={activeSeason ? activeSeason.name : 'No active season'}
                    className="w-full bg-surface-2 border border-border rounded-xl px-3.5 py-2 text-xs font-mono text-muted cursor-not-allowed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Sport *
                    </label>
                    <select
                      required
                      value={sport}
                      onChange={(e) => setSport(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                    >
                      <option value="">Select sport...</option>
                      {sports.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Default Role
                    </label>
                    <select
                      disabled={!sport || availableRoles.length === 0}
                      value={defaultRole}
                      onChange={(e) => setDefaultRole(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright disabled:bg-surface-2 disabled:text-muted disabled:cursor-not-allowed"
                    >
                      {availableRoles.length === 0 ? (
                        <option value="">Select sport first</option>
                      ) : (
                        availableRoles.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1.5">
                      Starting Points
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={basePoints}
                      onChange={(e) => setBasePoints(e.target.value)}
                      className="w-full bg-bg border border-border rounded-xl px-3.5 py-2 text-xs font-mono tabular-nums text-text focus:outline-none focus:border-accent-bright"
                    />
                  </div>
                </div>
              </div>

              {/* Search, Academic Year Filter Chips, Select All / Clear, Live Count */}
              <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-3 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-text font-semibold">
                    <Users size={16} className="text-accent-bright" />
                    <span>Select Athletes</span>
                  </div>
                  {onCreateNewAthlete && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        onCreateNewAthlete()
                      }}
                      className="text-xs font-medium text-accent-bright hover:underline"
                    >
                      Create a new athlete
                    </button>
                  )}
                </div>

                {/* Search Input */}
                <div className="relative">
                  <MagnifyingGlass
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, 4-digit code (e.g. 0001), or roll no..."
                    className="w-full bg-bg border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-text focus:outline-none focus:border-accent-bright"
                  />
                </div>

                {/* Academic Year Chips + Bulk Selection Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <div className="flex flex-wrap items-center gap-1">
                    {YEAR_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setSelectedYearChip(chip)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                          selectedYearChip === chip
                            ? 'bg-btn-bg text-btn-fg font-semibold'
                            : 'bg-surface border border-border text-muted hover:text-text'
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleSelectAllShown}
                      className="text-accent-bright hover:underline font-medium text-[11px]"
                    >
                      Select all shown
                    </button>
                    <span className="text-border">·</span>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="text-muted hover:text-text font-medium text-[11px]"
                    >
                      Clear
                    </button>
                    <span className="text-border">·</span>
                    <span className="font-mono text-[11px] font-semibold text-text tabular-nums">
                      {selectedIds.size} selected
                    </span>
                  </div>
                </div>

                {/* Athlete Rows List */}
                <div className="flex-1 min-h-[260px] max-h-[380px] overflow-y-auto divide-y divide-border border border-border rounded-xl bg-bg">
                  {isLoadingData ? (
                    <div className="py-8 px-4 text-center text-xs font-mono text-muted">
                      Loading athletes...
                    </div>
                  ) : filteredAthletes.length === 0 ? (
                    <div className="py-8 px-4 text-center text-xs text-muted">
                      No athletes match the current filters.
                    </div>
                  ) : (
                    filteredAthletes.map((athlete) => {
                      const alreadyRegistered = isAlreadyRegistered(athlete)
                      const isSelected = !alreadyRegistered && selectedIds.has(athlete.id)
                      const effectiveRole = roleOverrides[athlete.id] || defaultRole

                      return (
                        <div
                          key={athlete.id}
                          onClick={() => {
                            if (!alreadyRegistered) toggleSelectAthlete(athlete)
                          }}
                          className={`p-2.5 flex items-center justify-between gap-3 text-xs transition-colors ${
                            alreadyRegistered
                              ? 'opacity-50 bg-surface-2/50 cursor-not-allowed'
                              : isSelected
                              ? 'bg-accent-bright/5 hover:bg-accent-bright/10 cursor-pointer'
                              : 'hover:bg-surface-2 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={alreadyRegistered}
                              onChange={() => toggleSelectAthlete(athlete)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-border bg-surface text-accent-bright accent-accent-bright shrink-0 disabled:cursor-not-allowed"
                            />

                            {athlete.photo_thumb_url || athlete.photo_url ? (
                              <img
                                src={athlete.photo_thumb_url || athlete.photo_url}
                                alt={athlete.name}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-lg object-cover bg-surface-2 border border-border shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                                <User size={14} />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-text truncate">
                                {athlete.name}
                              </div>
                              <div className="text-[11px] font-mono text-muted truncate">
                                #{formatAthleteCode(athlete.athlete_code)} &middot;{' '}
                                {getAcademicYearLabel(athlete.academic_year || '1st')}
                                {athlete.roll_no ? ` · ${athlete.roll_no}` : ''}
                              </div>
                            </div>
                          </div>

                          <div
                            className="shrink-0 flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {alreadyRegistered ? (
                              <span className="text-[11px] font-mono text-muted px-2 py-0.5 rounded-md bg-surface-2 border border-border">
                                Already registered
                              </span>
                            ) : isSelected && sport && availableRoles.length > 0 ? (
                              <select
                                value={effectiveRole}
                                onChange={(e) =>
                                  handleRoleOverrideChange(athlete.id, e.target.value)
                                }
                                aria-label={`Playing role for ${athlete.name}`}
                                className="bg-surface border border-border rounded-lg px-2 py-1 text-[11px] text-text focus:outline-none focus:border-accent-bright"
                              >
                                {availableRoles.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-4 border-t border-border flex items-center justify-between gap-3">
                <span className="text-xs font-mono text-muted tabular-nums">
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onClose}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={!canRegister}
                    isLoading={isSubmitting}
                  >
                    Register
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Partial Failure / Skipped Summary Dialog */}
      <Dialog
        isOpen={!!summaryResult}
        onClose={() => setSummaryResult(null)}
        title="Bulk Registration Summary"
        description={
          summaryResult
            ? `Registered ${summaryResult.registered.length}, skipped ${summaryResult.skipped.length}`
            : ''
        }
        size="md"
      >
        {summaryResult && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-surface-2 border border-border flex items-center justify-between text-xs font-mono">
              <span className="text-accent-bright flex items-center gap-1.5 font-semibold">
                <CheckCircle size={16} />
                Registered {summaryResult.registered.length}
              </span>
              <span className="text-error flex items-center gap-1.5 font-semibold">
                <WarningCircle size={16} />
                Skipped {summaryResult.skipped.length}
              </span>
            </div>

            {summaryResult.skipped.length > 0 && (
              <div className="max-h-60 overflow-y-auto divide-y divide-border border border-border rounded-xl bg-bg">
                {summaryResult.skipped.map((item, idx) => (
                  <div key={`${item.athlete_id}-${idx}`} className="p-3 text-xs space-y-1">
                    <div className="font-medium text-text flex items-center justify-between">
                      <span>{item.athlete_name}</span>
                      {item.athlete_code !== undefined && (
                        <span className="font-mono text-[11px] text-muted">
                          #{formatAthleteCode(item.athlete_code)}
                        </span>
                      )}
                    </div>
                    <div className="text-error text-[11px] font-mono">{item.reason}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setSummaryResult(null)}
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}
