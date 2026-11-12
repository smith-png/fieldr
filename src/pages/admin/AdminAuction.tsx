import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  ClockCounterClockwise,
  Coins,
  Gavel,
  MagnifyingGlass,
  Plus,
  Prohibit,
  ShieldCheck,
  Sparkle,
  Trash,
  User,
  Users,
  X,
  XCircle
} from '@phosphor-icons/react'
import type {
  AuctionBid,
  AuctionSale,
  AuctionSettings,
  Player,
  ProjectorState,
  Season,
  Sport,
  Team
} from '../../types'
import {
  type AuctionQueueEntry,
  auctionBackToIdle,
  auctionBringToStage,
  auctionClearBid,
  auctionMarkUnsold,
  auctionPlaceBid,
  auctionSecure,
  auctionUndoLastSale,
  formatAthleteCode,
  getAuctionBidsForPlayer,
  getAuctionQueue,
  getAuctionSettings,
  getDefaultAuctionSettings,
  getPlayers,
  getProjectorState,
  getRecentAuctionSales,
  getTeams,
  queueAddByCodes,
  queueAddPlayer,
  queueClear,
  queueMove,
  queueRemove,
  subscribeToAuctionRealtime
} from '../../lib/data'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog, EmptyState } from '../../components/ui'

interface AdminAuctionProps {
  activeSeason: Season | null
  sports: Sport[]
  players: Player[]
  teams: Team[]
  projectorState: ProjectorState
  onRefresh: () => Promise<void>
}

type QueueTab = 'queue' | 'sold'

export const AdminAuction: React.FC<AdminAuctionProps> = ({
  activeSeason,
  sports,
  players: initialPlayers,
  teams: initialTeams,
  projectorState: initialProjectorState,
  onRefresh
}) => {
  const { success, error } = useToast()

  // Live synced state for the active season
  const [players, setPlayers] = useState<Player[]>(initialPlayers)
  const [teams, setTeams] = useState<Team[]>(initialTeams)
  const [projectorState, setProjectorState] = useState<ProjectorState>(initialProjectorState)
  const [auctionSettings, setAuctionSettings] = useState<AuctionSettings>(() =>
    getDefaultAuctionSettings(activeSeason?.id || '')
  )
  const [playerBids, setPlayerBids] = useState<AuctionBid[]>([])
  const [recentSales, setRecentSales] = useState<AuctionSale[]>([])

  // Selected sport tab (case-insensitive match with sports table)
  const [selectedSportName, setSelectedSportName] = useState<string>(() => {
    return sports[0]?.name || 'Cricket'
  })

  // Queue state & controls
  const [queueEntries, setQueueEntries] = useState<AuctionQueueEntry[]>([])
  const [queueTab, setQueueTab] = useState<QueueTab>('queue')
  const [addPlayerSearch, setAddPlayerSearch] = useState<string>('')
  const [bulkCodesInput, setBulkCodesInput] = useState<string>('')
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null)
  const [soldSearch, setSoldSearch] = useState<string>('')
  const queueListRef = useRef<HTMLDivElement | null>(null)
  const queueScrollTopRef = useRef<number>(0)

  // Bid input field
  const [bidAmountInput, setBidAmountInput] = useState<string>('')

  // Pending state to prevent double taps
  const [isPending, setIsPending] = useState<boolean>(false)

  // Confirmation dialogs
  const [isSecureConfirmOpen, setIsSecureConfirmOpen] = useState<boolean>(false)
  const [isUnsoldConfirmOpen, setIsUnsoldConfirmOpen] = useState<boolean>(false)
  const [isUndoSaleConfirmOpen, setIsUndoSaleConfirmOpen] = useState<boolean>(false)
  const [isClearQueueConfirmOpen, setIsClearQueueConfirmOpen] = useState<boolean>(false)

  // Keep props synced if parent refreshes
  useEffect(() => {
    setPlayers(initialPlayers)
  }, [initialPlayers])

  useEffect(() => {
    setTeams(initialTeams)
  }, [initialTeams])

  useEffect(() => {
    setProjectorState(initialProjectorState)
  }, [initialProjectorState])

  // Ensure selectedSportName is valid when sports list loads
  useEffect(() => {
    if (sports.length > 0) {
      const exists = sports.some(
        (s) => s.name.toLowerCase() === selectedSportName.toLowerCase()
      )
      if (!exists) {
        setSelectedSportName(sports[0].name)
      }
    }
  }, [sports, selectedSportName])

  const latestFetchReqIdRef = useRef(0)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Fetch all auction data for the current season (silent background refresh, guarded against out-of-order responses)
  const fetchLiveAuctionState = useCallback(async () => {
    if (!activeSeason?.id) return
    const reqId = ++latestFetchReqIdRef.current
    try {
      const [freshState, freshPlayers, freshTeams, freshSettings, freshSales, freshQueue] =
        await Promise.all([
          getProjectorState(activeSeason.id),
          getPlayers(activeSeason.id),
          getTeams(activeSeason.id),
          getAuctionSettings(activeSeason.id),
          getRecentAuctionSales(activeSeason.id, 10),
          getAuctionQueue(activeSeason.id).catch((err) => {
            console.error('Failed to fetch auction queue:', err)
            return [] as AuctionQueueEntry[]
          })
        ])
      if (!isMountedRef.current || reqId !== latestFetchReqIdRef.current) return

      const bids = freshState.player_id
        ? await getAuctionBidsForPlayer(freshState.player_id)
        : []
      if (!isMountedRef.current || reqId !== latestFetchReqIdRef.current) return

      setProjectorState(freshState)
      setPlayers(freshPlayers)
      setTeams(freshTeams)
      setAuctionSettings(freshSettings)
      setRecentSales(freshSales)
      setQueueEntries(freshQueue)
      setPlayerBids(bids)
    } catch (err) {
      if (isMountedRef.current && reqId === latestFetchReqIdRef.current) {
        console.error(
          'Failed to refresh live auction state:',
          err instanceof Error ? err.message : err,
          err
        )
      }
    }
  }, [activeSeason?.id])

  // Initial load and 500ms-debounced realtime subscription (cleaned up on unmount)
  useEffect(() => {
    if (!activeSeason?.id) return

    fetchLiveAuctionState()

    const unsubscribe = subscribeToAuctionRealtime(activeSeason.id, () => {
      fetchLiveAuctionState()
    })

    return () => {
      unsubscribe()
    }
  }, [activeSeason?.id, fetchLiveAuctionState])

  // Resolve stage player and leading team
  const stagePlayerId = projectorState.player_id || projectorState.sale_player_id || null
  const stagePlayer = useMemo(
    () => (stagePlayerId ? players.find((p) => p.id === stagePlayerId) || null : null),
    [players, stagePlayerId]
  )

  const leadingTeamId =
    projectorState.mode === 'sold'
      ? projectorState.sale_team_id || projectorState.team_id || stagePlayer?.team_id || null
      : projectorState.team_id || null

  const leadingTeam = useMemo(
    () => (leadingTeamId ? teams.find((t) => t.id === leadingTeamId) || null : null),
    [teams, leadingTeamId]
  )

  // Automatically switch sport tab when a new player is brought to stage
  const prevStagePlayerIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (stagePlayer && stagePlayer.id !== prevStagePlayerIdRef.current) {
      prevStagePlayerIdRef.current = stagePlayer.id
      const matchingSport = sports.find(
        (s) =>
          s.name.toLowerCase() === stagePlayer.sport.toLowerCase() ||
          s.id.toLowerCase() === stagePlayer.sport.toLowerCase()
      )
      if (matchingSport) {
        setSelectedSportName(matchingSport.name)
      }
    } else if (!stagePlayer) {
      prevStagePlayerIdRef.current = null
    }
  }, [stagePlayer, sports])

  // Smallest increment from auction_settings (default 5)
  const smallestIncrement = useMemo(() => {
    if (!auctionSettings.bid_increments || auctionSettings.bid_increments.length === 0) {
      return 5
    }
    return Math.min(...auctionSettings.bid_increments)
  }, [auctionSettings.bid_increments])

  // Suggested next bid:
  // Opening bid = base points when there is no leading team, otherwise current bid + smallest increment
  const suggestedNextBid = useMemo(() => {
    if (!stagePlayer) return 0
    if (!projectorState.team_id) {
      return Number(stagePlayer.base_points || 0)
    }
    const current = Number(projectorState.current_bid ?? stagePlayer.base_points ?? 0)
    return current + smallestIncrement
  }, [stagePlayer, projectorState.team_id, projectorState.current_bid, smallestIncrement])

  // Pre-fill amount field whenever stage player, leading team, or current bid changes
  useEffect(() => {
    if (stagePlayer) {
      setBidAmountInput(String(suggestedNextBid))
    } else {
      setBidAmountInput('')
    }
  }, [
    stagePlayer?.id,
    stagePlayer?.base_points,
    projectorState.team_id,
    projectorState.current_bid,
    suggestedNextBid
  ])

  // Players for the selected sport (case-insensitive match)
  const sportPlayers = useMemo(() => {
    const target = selectedSportName.toLowerCase()
    const matchedSportObj = sports.find(
      (s) => s.name.toLowerCase() === target || s.id.toLowerCase() === target
    )
    const targetId = matchedSportObj?.id.toLowerCase() || target

    return players.filter((p) => {
      const ps = p.sport.toLowerCase()
      return ps === target || ps === targetId
    })
  }, [players, selectedSportName, sports])

  // Queued players for the active season and selected sport, ordered by sort_order
  const queuedPlayersForSport = useMemo(() => {
    const target = selectedSportName.toLowerCase()
    const matchedSportObj = sports.find(
      (s) => s.name.toLowerCase() === target || s.id.toLowerCase() === target
    )
    const targetId = matchedSportObj?.id.toLowerCase() || target
    const playerById = new Map<string, Player>()
    for (const p of players) {
      playerById.set(p.id, p)
    }

    return queueEntries
      .filter((entry) => {
        if (activeSeason?.id && entry.season_id && entry.season_id !== activeSeason.id) {
          return false
        }
        const entrySport = (entry.sport || entry.player?.sport || '').toLowerCase()
        return entrySport === target || entrySport === targetId
      })
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((entry) => {
        const enriched = playerById.get(entry.player_id)
        if (enriched && entry.player) {
          return {
            ...entry.player,
            ...enriched
          }
        }
        return enriched || entry.player
      })
      .filter((p): p is Player => Boolean(p))
  }, [queueEntries, activeSeason?.id, selectedSportName, sports, players])

  const queuedPlayerIds = useMemo(
    () => new Set(queuedPlayersForSport.map((p) => p.id)),
    [queuedPlayersForSport]
  )

  // Matching players for the "Add player" search box (same season & sport, available or unsold, not already queued)
  const matchingAddablePlayers = useMemo(() => {
    const q = addPlayerSearch.trim().toLowerCase().replace(/^#/, '')
    if (!q) return []

    return sportPlayers
      .filter((p) => {
        if (p.status !== 'available' && p.status !== 'unsold') return false
        if (queuedPlayerIds.has(p.id)) return false
        const formattedCode = formatAthleteCode(p.player_code || p.athlete_code).toLowerCase()
        const rawCode = String(p.player_code || '').toLowerCase()
        return (
          p.name.toLowerCase().includes(q) ||
          formattedCode.includes(q) ||
          rawCode.includes(q)
        )
      })
      .slice(0, 8)
  }, [addPlayerSearch, sportPlayers, queuedPlayerIds])

  const queueSoldPlayers = useMemo(
    () => sportPlayers.filter((p) => p.status === 'sold'),
    [sportPlayers]
  )

  const displayedQueuePlayers = useMemo(() => {
    if (queueTab === 'queue') {
      return queuedPlayersForSport
    }
    const q = soldSearch.trim().toLowerCase()
    if (!q) return queueSoldPlayers

    return queueSoldPlayers.filter((p) => {
      const code = formatAthleteCode(p.athlete_code || p.player_code).toLowerCase()
      return p.name.toLowerCase().includes(q) || code.includes(q)
    })
  }, [queueTab, queuedPlayersForSport, queueSoldPlayers, soldSearch])

  // Preserve Queue list scroll position across stage updates and realtime refreshes
  useLayoutEffect(() => {
    const el = queueListRef.current
    if (!el) return
    if (Math.abs(el.scrollTop - queueScrollTopRef.current) > 1) {
      el.scrollTop = queueScrollTopRef.current
    }
  }, [displayedQueuePlayers, stagePlayerId, projectorState])

  // Teams for the selected sport (or stage player's sport if a player is on stage)
  const activeSportForTeams = stagePlayer ? stagePlayer.sport : selectedSportName
  const sportTeams = useMemo(() => {
    const target = activeSportForTeams.toLowerCase()
    const matchedSportObj = sports.find(
      (s) => s.name.toLowerCase() === target || s.id.toLowerCase() === target
    )
    const targetId = matchedSportObj?.id.toLowerCase() || target

    return teams.filter((t) => {
      const ts = t.sport.toLowerCase()
      return ts === target || ts === targetId
    })
  }, [teams, activeSportForTeams, sports])

  // Squad count per team
  const squadCountsByTeam = useMemo(() => {
    const map: Record<string, number> = {}
    for (const p of players) {
      if (p.status === 'sold' && p.team_id) {
        map[p.team_id] = (map[p.team_id] || 0) + 1
      }
    }
    return map
  }, [players])

  const parsedBidAmount = Number(bidAmountInput)
  const isBidAmountValid = !isNaN(parsedBidAmount) && parsedBidAmount > 0

  // Handlers for all auction actions
  const handleBringToStage = async (player: Player) => {
    if (isPending) return
    try {
      setIsPending(true)
      await auctionBringToStage(player.id)
      await Promise.all([fetchLiveAuctionState(), onRefresh()])
      success(`${player.name} brought to stage`)
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to bring player to stage')
    } finally {
      setIsPending(false)
    }
  }

  const handleAddIncrement = (inc: number) => {
    const currentVal = Number(bidAmountInput)
    const baseVal = isNaN(currentVal) ? suggestedNextBid : currentVal
    setBidAmountInput(String(baseVal + inc))
  }

  const handlePlaceBid = async (team: Team) => {
    if (isPending) return
    if (!isBidAmountValid) {
      error('Please enter a valid bid amount')
      return
    }
    try {
      setIsPending(true)
      await auctionPlaceBid(team.id, parsedBidAmount)
      await Promise.all([fetchLiveAuctionState(), onRefresh()])
      success(`Bid placed: ${team.short_code} at ${parsedBidAmount.toLocaleString()} PTS`)
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to place bid')
    } finally {
      setIsPending(false)
    }
  }

  const handleClearBid = async () => {
    if (!activeSeason || isPending) return
    try {
      setIsPending(true)
      await auctionClearBid(activeSeason.id)
      await Promise.all([fetchLiveAuctionState(), onRefresh()])
      success('Current bid cleared')
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to clear bid')
    } finally {
      setIsPending(false)
    }
  }

  const handleConfirmSecure = async () => {
    if (!activeSeason || isPending) return
    try {
      setIsPending(true)
      await auctionSecure(activeSeason.id)
      setIsSecureConfirmOpen(false)
      await Promise.all([fetchLiveAuctionState(), onRefresh()])
      success(
        stagePlayer && leadingTeam
          ? `Secured ${stagePlayer.name} for ${leadingTeam.name}`
          : 'Player sale secured'
      )
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to secure sale')
    } finally {
      setIsPending(false)
    }
  }

  const handleConfirmMarkUnsold = async () => {
    if (!activeSeason || isPending) return
    try {
      setIsPending(true)
      await auctionMarkUnsold(activeSeason.id)
      setIsUnsoldConfirmOpen(false)
      await Promise.all([fetchLiveAuctionState(), onRefresh()])
      success(stagePlayer ? `Marked ${stagePlayer.name} as unsold` : 'Player marked unsold')
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to mark player unsold')
    } finally {
      setIsPending(false)
    }
  }

  const handleBackToIdle = async () => {
    if (!activeSeason || isPending) return
    try {
      setIsPending(true)
      await auctionBackToIdle(activeSeason.id)
      await Promise.all([fetchLiveAuctionState(), onRefresh()])
      success('Stage reset to idle')
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to reset stage to idle')
    } finally {
      setIsPending(false)
    }
  }

  const handleConfirmUndoLastSale = async () => {
    if (!activeSeason || isPending) return
    try {
      setIsPending(true)
      await auctionUndoLastSale(activeSeason.id)
      setIsUndoSaleConfirmOpen(false)
      await Promise.all([fetchLiveAuctionState(), onRefresh()])
      success('Last sale reversed')
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to undo last sale')
    } finally {
      setIsPending(false)
    }
  }

  // Queue RPC handlers
  const handleQueueAddSinglePlayer = async (player: Player) => {
    if (isPending) return
    try {
      setIsPending(true)
      await queueAddPlayer(player.id)
      setAddPlayerSearch('')
      await fetchLiveAuctionState()
      success(`Added ${player.name} to queue`)
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to add player to queue')
    } finally {
      setIsPending(false)
    }
  }

  const handleQueueBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason || isPending) return

    const codes = bulkCodesInput
      .split(',')
      .map((s) => s.trim().replace(/^#/, ''))
      .filter(Boolean)

    if (codes.length === 0) return

    // Pre-compute client-side classification in case the RPC returns only a count or minimal payload
    const preNotFound: string[] = []
    const preAlreadyQueued: string[] = []
    const preNotAvailable: string[] = []
    let preAdded = 0
    const seenInBatch = new Set<string>()

    for (const rawCode of codes) {
      const normCode = rawCode.toLowerCase()
      const matched = sportPlayers.find(
        (p) =>
          (p.player_code || '').toLowerCase() === normCode ||
          formatAthleteCode(p.player_code || p.athlete_code).toLowerCase() === normCode
      )
      if (!matched) {
        preNotFound.push(rawCode)
      } else if (queuedPlayerIds.has(matched.id) || seenInBatch.has(matched.id)) {
        preAlreadyQueued.push(rawCode)
      } else if (matched.status !== 'available' && matched.status !== 'unsold') {
        preNotAvailable.push(rawCode)
      } else {
        seenInBatch.add(matched.id)
        preAdded++
      }
    }

    try {
      setIsPending(true)
      const res = await queueAddByCodes(activeSeason.id, selectedSportName, codes)
      await fetchLiveAuctionState()

      const hasDetailedRpcBreakdown =
        res.notFound.length > 0 ||
        res.alreadyQueued.length > 0 ||
        res.notAvailable.length > 0 ||
        res.addedCount > 0

      const finalAdded = hasDetailedRpcBreakdown ? res.addedCount : preAdded
      const finalNotFound =
        res.notFound.length > 0 || hasDetailedRpcBreakdown ? res.notFound : preNotFound
      const finalAlreadyQueued =
        res.alreadyQueued.length > 0 || hasDetailedRpcBreakdown
          ? res.alreadyQueued
          : preAlreadyQueued
      const finalNotAvailable =
        res.notAvailable.length > 0 || hasDetailedRpcBreakdown
          ? res.notAvailable
          : preNotAvailable

      const parts: string[] = []
      if (
        finalAdded > 0 ||
        (finalNotFound.length === 0 &&
          finalAlreadyQueued.length === 0 &&
          finalNotAvailable.length === 0)
      ) {
        parts.push(`${finalAdded} added.`)
      }
      if (finalNotFound.length > 0) {
        parts.push(`Not found: ${finalNotFound.join(', ')}.`)
      }
      if (finalAlreadyQueued.length > 0) {
        parts.push(`Already queued: ${finalAlreadyQueued.join(', ')}.`)
      }
      if (finalNotAvailable.length > 0) {
        parts.push(`Not available: ${finalNotAvailable.join(', ')}.`)
      }

      const summary = parts.join(' ')
      setBulkResultMessage(summary)
      if (finalAdded > 0) {
        setBulkCodesInput('')
        success(summary)
      } else {
        error(summary)
      }
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to bulk add players to queue')
    } finally {
      setIsPending(false)
    }
  }

  const handleQueueRemovePlayer = async (playerId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPending) return
    try {
      setIsPending(true)
      await queueRemove(playerId)
      await fetchLiveAuctionState()
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to remove player from queue')
    } finally {
      setIsPending(false)
    }
  }

  const handleQueueMovePlayer = async (
    playerId: string,
    direction: 'up' | 'down',
    e: React.MouseEvent
  ) => {
    e.stopPropagation()
    if (isPending) return
    try {
      setIsPending(true)
      await queueMove(playerId, direction)
      await fetchLiveAuctionState()
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to reorder queue')
    } finally {
      setIsPending(false)
    }
  }

  const handleConfirmClearQueue = async () => {
    if (!activeSeason || isPending) return
    try {
      setIsPending(true)
      await queueClear(activeSeason.id, selectedSportName)
      setIsClearQueueConfirmOpen(false)
      await fetchLiveAuctionState()
      success(`Cleared ${selectedSportName} queue`)
    } catch (err: unknown) {
      error(err instanceof Error ? err.message : 'Failed to clear queue')
    } finally {
      setIsPending(false)
    }
  }

  if (!activeSeason) {
    return (
      <EmptyState
        icon={Gavel}
        title="No Active Season Selected"
        description="Select or activate a tournament season in the Seasons tab to run the live auction."
      />
    )
  }

  const effectiveMode = projectorState.mode
  const isAuctionActive = effectiveMode === 'auction' && !!stagePlayer
  const isSoldState = effectiveMode === 'sold' && !!stagePlayer
  const isUnsoldState = effectiveMode === 'unsold' && !!stagePlayer
  const isIdleState =
    effectiveMode === 'idle' || (!isAuctionActive && !isSoldState && !isUnsoldState)

  const displayedPrice =
    effectiveMode === 'sold'
      ? Number(
          projectorState.sale_price ??
            projectorState.current_bid ??
            stagePlayer?.purchase_price ??
            stagePlayer?.base_points ??
            0
        )
      : projectorState.current_bid != null
      ? Number(projectorState.current_bid)
      : null

  const newestSale = recentSales[0] || null
  const newestSalePlayer = newestSale
    ? players.find((p) => p.id === newestSale.player_id)
    : null
  const newestSaleTeam = newestSale ? teams.find((t) => t.id === newestSale.team_id) : null

  return (
    <div className="flex flex-col gap-6">
      {/* 1. HEADER: Selected season (read-only) & Sport tabs from sports table */}
      <div className="p-5 sm:p-6 rounded-2xl bg-surface border border-border flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
            <span className="text-[11px] font-mono uppercase tracking-widest text-accent-bright font-semibold">
              LIVE AUCTION CONTROL
            </span>
            <span className="text-border">·</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-surface-2 border border-border text-xs font-mono font-semibold text-text">
              Season: {activeSeason.name}
            </span>
          </div>
          <h1 className="font-syne font-extrabold text-2xl sm:text-3xl text-text tracking-tight">
            Auction Room
          </h1>
        </div>

        {/* Sport Tabs (from sports table, min-h-[48px] tap targets) */}
        <div
          role="tablist"
          aria-label="Select Auction Sport"
          className="flex flex-wrap items-center gap-2 bg-surface-2 p-1.5 rounded-xl border border-border"
        >
          {sports.map((sport) => {
            const isSelected =
              sport.name.toLowerCase() === selectedSportName.toLowerCase() ||
              sport.id.toLowerCase() === selectedSportName.toLowerCase()
            const availableCount = players.filter(
              (p) =>
                (p.sport.toLowerCase() === sport.name.toLowerCase() ||
                  p.sport.toLowerCase() === sport.id.toLowerCase()) &&
                (p.status === 'available' || p.status === 'unsold')
            ).length

            return (
              <button
                key={sport.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedSportName(sport.name)}
                className={`min-h-[48px] px-4 py-2 rounded-lg text-xs sm:text-sm font-['DM_Sans',sans-serif] transition-colors flex items-center gap-2 ${
                  isSelected
                    ? 'bg-btn-bg text-btn-fg font-medium shadow-sm'
                    : 'text-muted hover:text-text hover:bg-surface font-normal'
                }`}
              >
                <span>{sport.name}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono tabular-nums ${
                    isSelected
                      ? 'bg-black/20 text-btn-fg'
                      : 'bg-surface border border-border text-muted'
                  }`}
                >
                  {availableCount}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* MAIN GRID: Tablet landscape first (12 cols on lg), stacks on narrow screens */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 2. LEFT COLUMN: QUEUE */}
        <div className="lg:col-span-5 rounded-2xl bg-surface border border-border flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-border flex flex-col gap-3.5 shrink-0 bg-surface z-10">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-accent-bright" weight="bold" />
                <h2 className="font-syne font-bold text-base sm:text-lg text-text">
                  {selectedSportName} Queue
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {queueTab === 'queue' && queuedPlayersForSport.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={Trash}
                    disabled={isPending}
                    onClick={() => setIsClearQueueConfirmOpen(true)}
                    className="min-h-[40px] px-3 text-xs"
                  >
                    Clear queue
                  </Button>
                )}

                {/* Queue vs Sold Sub-tabs */}
                <div className="flex items-center gap-1 bg-surface-2 p-1 rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setQueueTab('queue')}
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-['DM_Sans',sans-serif] transition-colors ${
                      queueTab === 'queue'
                        ? 'bg-surface text-text font-medium border border-border shadow-sm'
                        : 'text-muted hover:text-text font-normal'
                    }`}
                  >
                    Queue ({queuedPlayersForSport.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueTab('sold')}
                    className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-['DM_Sans',sans-serif] transition-colors ${
                      queueTab === 'sold'
                        ? 'bg-surface text-text font-medium border border-border shadow-sm'
                        : 'text-muted hover:text-text font-normal'
                    }`}
                  >
                    Sold ({queueSoldPlayers.length})
                  </button>
                </div>
              </div>
            </div>

            {queueTab === 'queue' ? (
              <div className="flex flex-col gap-3">
                {/* Add player search box */}
                <div>
                  <div className="relative">
                    <MagnifyingGlass
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                    />
                    <input
                      type="text"
                      value={addPlayerSearch}
                      onChange={(e) => setAddPlayerSearch(e.target.value)}
                      placeholder="Add player by name or code..."
                      disabled={isPending}
                      className="w-full min-h-[44px] pl-10 pr-9 py-2 bg-bg border border-border rounded-xl text-xs sm:text-sm text-text focus:outline-none focus:border-accent-bright"
                    />
                    {addPlayerSearch && (
                      <button
                        type="button"
                        onClick={() => setAddPlayerSearch('')}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    )}
                  </div>

                  {addPlayerSearch.trim().length > 0 && (
                    <div className="mt-1.5 rounded-xl bg-bg border border-border shadow-lg overflow-hidden divide-y divide-border max-h-56 overflow-y-auto">
                      {matchingAddablePlayers.length === 0 ? (
                        <div className="px-3.5 py-3 text-xs text-muted text-center">
                          No matching available or unsold players to add.
                        </div>
                      ) : (
                        matchingAddablePlayers.map((candidate) => {
                          const candidateCode = formatAthleteCode(
                            candidate.player_code || candidate.athlete_code
                          )
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              disabled={isPending}
                              onClick={() => handleQueueAddSinglePlayer(candidate)}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-surface-2 flex items-center justify-between gap-3 transition-colors disabled:opacity-50"
                            >
                              <div className="min-w-0 flex-1 flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-accent-bright shrink-0">
                                  #{candidateCode}
                                </span>
                                <span className="font-syne font-bold text-xs sm:text-sm text-text truncate">
                                  {candidate.name}
                                </span>
                                <span className="text-xs text-muted truncate">
                                  · {candidate.playing_role}
                                </span>
                              </div>
                              <span className="inline-flex items-center gap-1 text-xs font-mono text-accent-bright shrink-0">
                                <Plus size={12} weight="bold" />
                                <span>Queue</span>
                              </span>
                            </button>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Bulk add single-line input for IDs separated by commas */}
                <form onSubmit={handleQueueBulkAdd} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={bulkCodesInput}
                      onChange={(e) => {
                        setBulkCodesInput(e.target.value)
                        if (bulkResultMessage) setBulkResultMessage(null)
                      }}
                      placeholder="Bulk add IDs (e.g. 0002, 0003, 0005)"
                      disabled={isPending}
                      className="flex-1 min-h-[44px] px-3.5 py-2 bg-bg border border-border rounded-xl font-mono text-xs sm:text-sm text-text focus:outline-none focus:border-accent-bright"
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      size="md"
                      disabled={isPending || !bulkCodesInput.trim()}
                      className="min-h-[44px] px-4 shrink-0 text-xs"
                    >
                      Add
                    </Button>
                  </div>
                  {bulkResultMessage && (
                    <div className="text-xs font-mono text-muted px-1">
                      {bulkResultMessage}
                    </div>
                  )}
                </form>
              </div>
            ) : (
              /* Sold Tab Search Box */
              <div className="relative">
                <MagnifyingGlass
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <input
                  type="text"
                  value={soldSearch}
                  onChange={(e) => setSoldSearch(e.target.value)}
                  placeholder="Search sold players by name or code..."
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-bg border border-border rounded-xl text-xs sm:text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
            )}
          </div>

          {/* Queue Player List */}
          <div
            ref={queueListRef}
            onScroll={(e) => {
              queueScrollTopRef.current = e.currentTarget.scrollTop
            }}
            className="divide-y divide-border max-h-[50vh] lg:max-h-[60vh] overflow-y-auto overscroll-contain thin-scrollbar"
          >
            {displayedQueuePlayers.length === 0 ? (
              <div className="p-10 text-center text-xs text-muted">
                {queueTab === 'queue'
                  ? 'Queue is empty. Add players above.'
                  : 'No sold athletes in this sport yet.'}
              </div>
            ) : (
              displayedQueuePlayers.map((player, index) => {
                const code = formatAthleteCode(player.player_code || player.athlete_code)
                const isOnStage = stagePlayer?.id === player.id && !isIdleState
                const soldTeam = player.team_id
                  ? teams.find((t) => t.id === player.team_id)
                  : null

                return (
                  <div
                    key={player.id}
                    onClick={() => {
                      if (queueTab === 'queue' && !isPending && !isOnStage) {
                        void handleBringToStage(player)
                      }
                    }}
                    className={`p-4 flex items-center justify-between gap-3 transition-colors ${
                      queueTab === 'queue' && !isOnStage ? 'cursor-pointer' : ''
                    } ${isOnStage ? 'bg-accent-bright/10' : 'hover:bg-surface-2/60'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Photo thumbnail */}
                      {player.photo_thumb_url || player.photo_url ? (
                        <img
                          src={player.photo_thumb_url || player.photo_url}
                          alt={player.name}
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 rounded-xl object-cover bg-surface-2 border border-border shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-muted font-mono text-xs font-bold shrink-0">
                          {player.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] font-bold text-accent-bright">
                            #{code}
                          </span>
                          <span className="font-syne font-bold text-sm text-text truncate">
                            {player.name}
                          </span>
                          {player.status === 'unsold' && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-surface-2 border border-border text-muted">
                              Unsold
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted mt-0.5 flex-wrap">
                          <span>{player.playing_role}</span>
                          <span>·</span>
                          <span>{player.academic_year} Yr</span>
                          <span>·</span>
                          <span className="font-mono font-semibold text-points tabular-nums">
                            Base: {player.base_points.toLocaleString()} PTS
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action / Sold Status */}
                    {queueTab === 'queue' ? (
                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          title="Move up"
                          aria-label={`Move ${player.name} up`}
                          disabled={isPending || index === 0}
                          onClick={(e) => handleQueueMovePlayer(player.id, 'up', e)}
                          className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <ArrowUp size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          title="Move down"
                          aria-label={`Move ${player.name} down`}
                          disabled={isPending || index === displayedQueuePlayers.length - 1}
                          onClick={(e) => handleQueueMovePlayer(player.id, 'down', e)}
                          className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <ArrowDown size={14} weight="bold" />
                        </button>
                        <button
                          type="button"
                          title="Remove from queue"
                          aria-label={`Remove ${player.name} from queue`}
                          disabled={isPending}
                          onClick={(e) => handleQueueRemovePlayer(player.id, e)}
                          className="p-2 rounded-lg border border-border text-muted hover:text-error hover:border-error/40 hover:bg-error/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <X size={14} weight="bold" />
                        </button>
                        <Button
                          type="button"
                          variant={isOnStage ? 'secondary' : 'primary'}
                          size="lg"
                          disabled={isPending || isOnStage}
                          onClick={() => handleBringToStage(player)}
                          className="shrink-0 min-h-[44px] px-3.5 text-xs font-['DM_Sans',sans-serif] !font-normal"
                        >
                          {isOnStage ? 'On Stage' : 'Bring to stage'}
                        </Button>
                      </div>
                    ) : (
                      <div className="text-right shrink-0">
                        {soldTeam && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-2 border border-border text-xs font-semibold text-text">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: soldTeam.color }}
                            />
                            <span>{soldTeam.short_code}</span>
                          </div>
                        )}
                        <div className="font-mono font-bold text-xs text-points tabular-nums mt-1">
                          {(player.purchase_price ?? player.base_points).toLocaleString()} PTS
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 3, 4, 5. CENTRE / RIGHT COLUMN: STAGE, BID CONTROLS, ACTION BUTTONS */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* 3. STAGE CARD */}
          <div className="rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-sm flex flex-col gap-6">
            {/* Stage Mode Bar */}
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isAuctionActive
                      ? 'bg-accent-bright animate-pulse'
                      : isSoldState
                      ? 'bg-points'
                      : isUnsoldState
                      ? 'bg-error'
                      : 'bg-muted'
                  }`}
                />
                <span className="font-mono text-xs uppercase tracking-widest font-bold text-text">
                  Stage Status:{' '}
                  {isAuctionActive
                    ? 'LIVE AUCTION'
                    : isSoldState
                    ? 'SOLD'
                    : isUnsoldState
                    ? 'UNSOLD'
                    : 'IDLE'}
                </span>
              </div>

              {!isIdleState && (
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  disabled={isPending}
                  onClick={handleBackToIdle}
                  className="min-h-[48px] px-4 text-xs"
                >
                  Back to idle
                </Button>
              )}
            </div>

            {/* IDLE STATE */}
            {isIdleState || !stagePlayer ? (
              <div className="py-14 px-6 text-center rounded-2xl bg-surface-2/60 border border-dashed border-border flex flex-col items-center justify-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-muted">
                  <Gavel size={28} weight="duotone" />
                </div>
                <h3 className="font-syne font-bold text-xl text-text">
                  No Player Currently on Stage
                </h3>
                <p className="text-xs sm:text-sm text-muted max-w-md leading-relaxed">
                  Select an available or unsold athlete from the {selectedSportName} Queue on the left and tap &ldquo;Bring to stage&rdquo; to open bidding.
                </p>
              </div>
            ) : (
              <>
                {/* SOLD BANNER */}
                {isSoldState && (
                  <div className="p-5 rounded-2xl bg-accent-bright/15 border-2 border-accent-bright flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <CheckCircle size={32} weight="fill" className="text-accent-bright shrink-0" />
                      <div>
                        <span className="text-[11px] font-mono uppercase tracking-widest text-accent-bright font-bold block">
                          PLAYER SOLD
                        </span>
                        <div className="font-syne font-extrabold text-xl sm:text-2xl text-text flex items-center gap-2 flex-wrap mt-0.5">
                          <span>Sold to</span>
                          {leadingTeam && (
                            <span className="inline-flex items-center gap-2 px-3 py-0.5 rounded-lg bg-surface border border-border text-base">
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: leadingTeam.color }}
                              />
                              <span>{leadingTeam.name}</span>
                            </span>
                          )}
                          <span>for</span>
                          <span className="font-mono text-points tabular-nums">
                            {(displayedPrice ?? 0).toLocaleString()} PTS
                          </span>
                        </div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="primary"
                      size="lg"
                      rightIcon={ArrowRight}
                      disabled={isPending}
                      onClick={handleBackToIdle}
                      className="min-h-[48px] shrink-0"
                    >
                      Next player
                    </Button>
                  </div>
                )}

                {/* UNSOLD BANNER */}
                {isUnsoldState && (
                  <div className="p-5 rounded-2xl bg-error/10 border-2 border-error/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <XCircle size={32} weight="fill" className="text-error shrink-0" />
                      <div>
                        <span className="text-[11px] font-mono uppercase tracking-widest text-error font-bold block">
                          MARKED UNSOLD
                        </span>
                        <p className="font-syne font-bold text-lg text-text mt-0.5">
                          {stagePlayer.name} passed without a winning bid.
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      rightIcon={ArrowRight}
                      disabled={isPending}
                      onClick={handleBackToIdle}
                      className="min-h-[48px] shrink-0"
                    >
                      Next player
                    </Button>
                  </div>
                )}

                {/* PLAYER ON STAGE + CURRENT BID & LEADING TEAM */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                  {/* Player Profile Spotlight */}
                  <div className="md:col-span-7 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                    <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-surface-2 border border-border shrink-0 flex items-center justify-center">
                      {stagePlayer.photo_url || stagePlayer.photo_thumb_url ? (
                        <img
                          src={stagePlayer.photo_url || stagePlayer.photo_thumb_url}
                          alt={stagePlayer.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <User size={48} className="text-muted" />
                      )}
                    </div>

                    <div className="text-center sm:text-left min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
                        <span className="px-2.5 py-0.5 rounded-lg bg-accent-bright/15 border border-accent-bright/40 font-mono text-xs font-bold text-accent-bright">
                          #{formatAthleteCode(stagePlayer.athlete_code || stagePlayer.player_code)}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-surface-2 border border-border font-mono text-xs text-muted uppercase">
                          {stagePlayer.sport}
                        </span>
                      </div>

                      <h2 className="font-syne font-extrabold text-2xl sm:text-3xl text-text tracking-tight break-words">
                        {stagePlayer.name}
                      </h2>

                      {/* Large Role Label directly under player name */}
                      <div className="font-syne font-bold text-lg sm:text-xl text-text mt-1 tracking-tight">
                        {stagePlayer.playing_role}
                      </div>

                      {/* Small monospace line below role in amber */}
                      <div className="font-mono text-xs text-points font-semibold tabular-nums mt-0.5">
                        Base: {stagePlayer.base_points.toLocaleString()} PTS
                      </div>

                      <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs text-muted">
                        <span>{stagePlayer.academic_year} Year</span>
                      </div>
                    </div>
                  </div>

                  {/* Current Bid & Leading Team Box */}
                  <div className="md:col-span-5 p-5 rounded-2xl bg-surface-2 border border-border flex flex-col justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-widest text-muted block">
                        {isSoldState ? 'Final Sold Price' : 'Current Highest Bid'}
                      </span>
                      {displayedPrice !== null ? (
                        <div className="font-mono font-extrabold text-4xl sm:text-5xl text-points tabular-nums tracking-tight mt-1">
                          {displayedPrice.toLocaleString()}
                          <span className="text-base font-normal text-muted ml-1.5">PTS</span>
                        </div>
                      ) : (
                        <div className="mt-1">
                          <div className="font-mono font-extrabold text-3xl sm:text-4xl text-muted tabular-nums">
                            {stagePlayer.base_points.toLocaleString()}
                            <span className="text-sm font-normal text-muted ml-1.5">PTS</span>
                          </div>
                          <span className="text-[11px] font-mono text-muted">
                            Opening base points (no bids yet)
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-border">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted block mb-1.5">
                        Leading Team
                      </span>
                      {leadingTeam ? (
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-4 h-4 rounded-full shrink-0 border border-border"
                            style={{ backgroundColor: leadingTeam.color }}
                          />
                          <span className="font-syne font-bold text-base text-text truncate">
                            {leadingTeam.name}
                          </span>
                          <span className="font-mono text-xs text-muted ml-auto">
                            {leadingTeam.short_code}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-mono text-muted">
                          No leading team yet
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 4. BID CONTROLS & 5. ACTION BUTTONS */}
          {stagePlayer && isAuctionActive && (
            <div className="rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-sm flex flex-col gap-6">
              {/* Amount Input + Quick Increment Buttons */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="auction-bid-amount"
                    className="text-xs font-mono uppercase tracking-wider text-muted font-semibold"
                  >
                    Next Bid Amount (PTS) — Suggested: {suggestedNextBid.toLocaleString()} PTS
                  </label>
                  {Number(bidAmountInput) !== suggestedNextBid && (
                    <button
                      type="button"
                      onClick={() => setBidAmountInput(String(suggestedNextBid))}
                      className="text-xs font-mono text-accent-bright hover:underline"
                    >
                      Reset to {suggestedNextBid.toLocaleString()} PTS
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Coins
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-points pointer-events-none"
                    />
                    <input
                      id="auction-bid-amount"
                      type="number"
                      min={0}
                      step={1}
                      value={bidAmountInput}
                      onChange={(e) => setBidAmountInput(e.target.value)}
                      disabled={isPending}
                      className="w-full min-h-[48px] pl-11 pr-14 py-2.5 bg-bg border border-border rounded-xl font-mono font-bold text-lg text-text tabular-nums focus:outline-none focus:border-accent-bright"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-muted">
                      PTS
                    </span>
                  </div>

                  {/* Quick buttons for each increment from auction_settings */}
                  <div className="flex flex-wrap items-center gap-2">
                    {auctionSettings.bid_increments.map((inc) => (
                      <Button
                        key={inc}
                        type="button"
                        variant="secondary"
                        size="lg"
                        disabled={isPending}
                        onClick={() => handleAddIncrement(inc)}
                        className="min-h-[48px] px-4 font-mono font-bold text-xs sm:text-sm tabular-nums"
                      >
                        +{inc.toLocaleString()}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Team Tiles Grid for Selected Sport */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-wider text-muted font-semibold">
                    Tap a {stagePlayer.sport} Team to Place Bid at{' '}
                    {isBidAmountValid ? `${parsedBidAmount.toLocaleString()} PTS` : '—'}
                  </span>
                  {auctionSettings.max_squad_size && (
                    <span className="text-xs font-mono text-muted">
                      Squad Limit: {auctionSettings.max_squad_size}
                    </span>
                  )}
                </div>

                {sportTeams.length === 0 ? (
                  <div className="p-6 rounded-xl bg-surface-2 border border-border text-center text-xs text-muted">
                    No franchise teams configured for {stagePlayer.sport}.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sportTeams.map((team) => {
                      const squadCount = squadCountsByTeam[team.id] || 0
                      const maxSquad = auctionSettings.max_squad_size
                      const isSquadFull =
                        maxSquad !== null && maxSquad !== undefined && maxSquad > 0 && squadCount >= maxSquad
                      const isPurseTooLow =
                        isBidAmountValid && team.current_purse < parsedBidAmount
                      const isLeading = leadingTeam?.id === team.id

                      let disableReason: string | null = null
                      if (isSquadFull) {
                        disableReason = 'Squad full'
                      } else if (isPurseTooLow) {
                        disableReason = 'Purse too low'
                      }

                      const isTileDisabled =
                        isPending || !isBidAmountValid || isSquadFull || isPurseTooLow

                      return (
                        <button
                          key={team.id}
                          type="button"
                          disabled={isTileDisabled}
                          onClick={() => handlePlaceBid(team)}
                          className={`min-h-[76px] p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2.5 ${
                            isLeading
                              ? 'bg-accent-bright/10 border-accent-bright shadow-sm'
                              : 'bg-surface-2/70 hover:bg-surface-2 border-border hover:border-accent-bright'
                          } disabled:opacity-45 disabled:pointer-events-none`}
                        >
                          <div className="flex items-center justify-between gap-2 w-full">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className="w-3.5 h-3.5 rounded-full shrink-0 border border-border"
                                style={{ backgroundColor: team.color }}
                              />
                              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-surface border border-border text-text shrink-0">
                                {team.short_code}
                              </span>
                              <span className="font-syne font-bold text-sm sm:text-base text-text truncate">
                                {team.name}
                              </span>
                            </div>

                            {disableReason ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-error/15 text-error border border-error/30 shrink-0">
                                {disableReason}
                              </span>
                            ) : isLeading ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-accent-bright/20 text-accent-bright border border-accent-bright/40 shrink-0">
                                Leading
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center justify-between text-xs text-muted w-full pt-1 border-t border-border/60">
                            <span>
                              Purse:{' '}
                              <strong className="font-mono text-points tabular-nums">
                                {team.current_purse.toLocaleString()} PTS
                              </strong>
                            </span>
                            <span className="font-mono tabular-nums">
                              Squad:{' '}
                              <strong className="text-text">
                                {squadCount}
                                {maxSquad ? ` / ${maxSquad}` : ''}
                              </strong>
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 5. ACTION BUTTONS */}
              <div className="pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  leftIcon={ShieldCheck}
                  disabled={isPending || !leadingTeam}
                  onClick={() => setIsSecureConfirmOpen(true)}
                  className="min-h-[48px] w-full"
                >
                  Secure
                </Button>

                <Button
                  type="button"
                  variant="danger"
                  size="lg"
                  leftIcon={Prohibit}
                  disabled={isPending}
                  onClick={() => setIsUnsoldConfirmOpen(true)}
                  className="min-h-[48px] w-full"
                >
                  Mark unsold
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  leftIcon={Trash}
                  disabled={isPending || (!projectorState.team_id && projectorState.current_bid == null)}
                  onClick={handleClearBid}
                  className="min-h-[48px] w-full"
                >
                  Clear bid
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={isPending}
                  onClick={handleBackToIdle}
                  className="min-h-[48px] w-full"
                >
                  Back to idle
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. BELOW: BID HISTORY & RECENT SALES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bid History for Current Player */}
        <div className="rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <ClockCounterClockwise size={18} className="text-accent-bright" weight="bold" />
              <h3 className="font-syne font-bold text-base sm:text-lg text-text">
                Bid History {stagePlayer ? `· ${stagePlayer.name}` : ''}
              </h3>
            </div>
            <span className="text-xs font-mono text-muted">
              {playerBids.length} {playerBids.length === 1 ? 'bid' : 'bids'}
            </span>
          </div>

          {!stagePlayer ? (
            <div className="py-8 text-center text-xs text-muted">
              Bring a player to stage to view live bid history.
            </div>
          ) : playerBids.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              No active bids recorded for {stagePlayer.name} yet.
            </div>
          ) : (
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {playerBids.map((bid, idx) => {
                const bidTeam = teams.find((t) => t.id === bid.team_id)
                return (
                  <div
                    key={bid.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-border"
                        style={{ backgroundColor: bidTeam?.color || 'var(--accent-bright)' }}
                      />
                      <span className="font-syne font-bold text-sm text-text truncate">
                        {bidTeam?.name || 'Team'}
                      </span>
                      {bidTeam && (
                        <span className="font-mono text-[11px] text-muted">
                          ({bidTeam.short_code})
                        </span>
                      )}
                      {idx === 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-accent-bright/15 text-accent-bright">
                          Top
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono font-bold text-sm text-points tabular-nums">
                        {bid.amount.toLocaleString()} PTS
                      </span>
                      <span className="font-mono text-[10px] text-muted">
                        {new Date(bid.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Sales (Last 10 where reversed_at is null) */}
        <div className="rounded-2xl bg-surface border border-border p-5 sm:p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkle size={18} className="text-points" weight="bold" />
              <h3 className="font-syne font-bold text-base sm:text-lg text-text">
                Recent Sales
              </h3>
            </div>
            <span className="text-xs font-mono text-muted">
              Last {recentSales.length} completed
            </span>
          </div>

          {recentSales.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              No completed sales recorded in this season yet.
            </div>
          ) : (
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {recentSales.map((sale, idx) => {
                const soldPlayer = players.find((p) => p.id === sale.player_id)
                const buyerTeam = teams.find((t) => t.id === sale.team_id)
                const isNewest = idx === 0

                return (
                  <div
                    key={sale.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {soldPlayer && (
                          <span className="font-mono text-[11px] font-bold text-accent-bright">
                            #{formatAthleteCode(soldPlayer.athlete_code || soldPlayer.player_code)}
                          </span>
                        )}
                        <span className="font-syne font-bold text-sm text-text">
                          {soldPlayer?.name || 'Athlete'}
                        </span>
                        <span className="text-muted">to</span>
                        {buyerTeam && (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-text">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: buyerTeam.color }}
                            />
                            <span>
                              {buyerTeam.name} ({buyerTeam.short_code})
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-muted mt-0.5">
                        {soldPlayer && <span>{soldPlayer.sport}</span>}
                        <span>·</span>
                        <span>
                          {new Date(sale.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                      <span className="font-mono font-bold text-sm text-points tabular-nums">
                        {sale.price.toLocaleString()} PTS
                      </span>
                      {isNewest && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="md"
                          leftIcon={ArrowCounterClockwise}
                          disabled={isPending}
                          onClick={() => setIsUndoSaleConfirmOpen(true)}
                          className="min-h-[48px] px-3.5 text-xs"
                        >
                          Undo last sale
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* CONFIRM DIALOG: SECURE SALE */}
      <Dialog
        isOpen={isSecureConfirmOpen}
        onClose={() => !isPending && setIsSecureConfirmOpen(false)}
        title="Confirm Player Sale"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-text leading-relaxed">
            Secure{' '}
            <strong className="font-semibold">{stagePlayer?.name || 'Player'}</strong> for{' '}
            <strong className="font-semibold">{leadingTeam?.name || 'Team'}</strong> at{' '}
            <strong className="font-mono text-points tabular-nums">
              {Number(projectorState.current_bid ?? stagePlayer?.base_points ?? 0).toLocaleString()}{' '}
              PTS
            </strong>
            ?
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={isPending}
              onClick={() => setIsSecureConfirmOpen(false)}
              className="min-h-[48px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              isLoading={isPending}
              disabled={isPending}
              onClick={handleConfirmSecure}
              className="min-h-[48px]"
            >
              Confirm Secure
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CONFIRM DIALOG: MARK UNSOLD */}
      <Dialog
        isOpen={isUnsoldConfirmOpen}
        onClose={() => !isPending && setIsUnsoldConfirmOpen(false)}
        title="Mark Player Unsold"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-text leading-relaxed">
            Mark <strong className="font-semibold">{stagePlayer?.name || 'this player'}</strong> as
            unsold? Any active bids on stage will be cleared.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={isPending}
              onClick={() => setIsUnsoldConfirmOpen(false)}
              className="min-h-[48px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="lg"
              isLoading={isPending}
              disabled={isPending}
              onClick={handleConfirmMarkUnsold}
              className="min-h-[48px]"
            >
              Mark Unsold
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CONFIRM DIALOG: UNDO LAST SALE */}
      <Dialog
        isOpen={isUndoSaleConfirmOpen}
        onClose={() => !isPending && setIsUndoSaleConfirmOpen(false)}
        title="Undo Last Sale"
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-text leading-relaxed">
            Reverse the sale of{' '}
            <strong className="font-semibold">{newestSalePlayer?.name || 'the last player'}</strong>{' '}
            {newestSaleTeam ? (
              <>
                to <strong className="font-semibold">{newestSaleTeam.name}</strong>{' '}
              </>
            ) : null}
            {newestSale ? (
              <>
                for{' '}
                <strong className="font-mono text-points tabular-nums">
                  {newestSale.price.toLocaleString()} PTS
                </strong>
              </>
            ) : null}
            ? This will refund the team purse and return the player to the queue.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={isPending}
              onClick={() => setIsUndoSaleConfirmOpen(false)}
              className="min-h-[48px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="lg"
              isLoading={isPending}
              disabled={isPending}
              onClick={handleConfirmUndoLastSale}
              className="min-h-[48px]"
            >
              Undo Last Sale
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CONFIRM DIALOG: CLEAR QUEUE */}
      <Dialog
        isOpen={isClearQueueConfirmOpen}
        onClose={() => !isPending && setIsClearQueueConfirmOpen(false)}
        title={`Clear ${selectedSportName} Queue`}
        size="sm"
      >
        <div className="space-y-5">
          <p className="text-sm text-text leading-relaxed">
            Clear all <strong className="font-semibold">{queuedPlayersForSport.length}</strong>{' '}
            players from the <strong className="font-semibold">{selectedSportName}</strong> queue?
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={isPending}
              onClick={() => setIsClearQueueConfirmOpen(false)}
              className="min-h-[48px]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="lg"
              isLoading={isPending}
              disabled={isPending}
              onClick={handleConfirmClearQueue}
              className="min-h-[48px]"
            >
              Clear Queue
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
