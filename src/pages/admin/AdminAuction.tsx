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

const DISALLOWED_CSS_COLORS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer'
])

function getValidTeamColor(color?: string | null): string | null {
  const clean = color?.trim()
  if (!clean) return null
  if (DISALLOWED_CSS_COLORS.has(clean.toLowerCase())) return null
  if (/[;{}<>]/.test(clean)) return null

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', clean) ? clean : null
  }

  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)
    ? clean
    : null
}

function formatBalancedName(name: string): string {
  return name.replace(/\s+(\d+)$/, '\u00A0$1')
}

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

  const stageStatusLabel = isAuctionActive
    ? 'LIVE'
    : isSoldState
    ? 'SOLD'
    : isUnsoldState
    ? 'UNSOLD'
    : 'IDLE'

  const stageStatusDotClass = isAuctionActive
    ? 'bg-accent-bright'
    : isSoldState
    ? 'bg-points'
    : isUnsoldState
    ? 'bg-error'
    : 'bg-muted'

  const leadingTeamColor = getValidTeamColor(leadingTeam?.color)
  const priceDisplayValue =
    displayedPrice !== null ? displayedPrice : stagePlayer ? stagePlayer.base_points : 0
  const priceAnimKey = `${stagePlayer?.id || 'idle'}-${effectiveMode}-${displayedPrice ?? 'base'}`

  return (
    <div className="font-sans">
      <style>{`
        @keyframes auctionPricePop {
          0% {
            opacity: 0.55;
            transform: translateY(3px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .auction-price-pop {
          animation: auctionPricePop 180ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .auction-price-pop {
            animation: none;
          }
        }
      `}</style>

      {/* Two zones on 768px+: Main zone (2/3) + Sticky Queue right rail (1/3).
          Below 768px: single column in order Header -> Stage -> Queue -> Bid History -> Recent Sales. */}
      <div className="grid grid-cols-1 md:grid-cols-12 md:grid-rows-[auto_auto_1fr] gap-5 lg:gap-6 items-start">
        {/* 1. HEADER */}
        <header className="md:col-start-1 md:col-span-8 md:row-start-1 min-w-0 rounded-3xl bg-surface border border-border p-5 sm:p-6 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h1 className="font-syne font-extrabold text-2xl sm:text-3xl text-text tracking-tight">
              Auction Room
            </h1>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 border border-border font-mono text-xs uppercase tracking-[0.14em] font-semibold text-text shrink-0">
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full shrink-0 ${stageStatusDotClass}`}
              />
              <span>{stageStatusLabel}</span>
            </span>
          </div>

          {/* Sport Tabs Segmented Control */}
          <div
            role="tablist"
            aria-label="Select Auction Sport"
            className="inline-flex flex-wrap items-center gap-1 bg-surface-2 p-1.5 rounded-full border border-border self-start xl:self-auto"
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
                  className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-sans transition-[opacity,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 inline-flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-btn-bg text-btn-fg font-medium'
                      : 'text-muted hover:text-text font-normal'
                  }`}
                >
                  <span>{sport.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-mono tabular-nums ${
                      isSelected
                        ? 'bg-surface/20 text-btn-fg'
                        : 'bg-surface border border-border text-muted'
                    }`}
                  >
                    {availableCount}
                  </span>
                </button>
              )
            })}
          </div>
        </header>

        {/* 2. STAGE PANEL */}
        <section
          aria-label="Auction Stage"
          className="md:col-start-1 md:col-span-8 md:row-start-2 min-w-0 rounded-3xl bg-surface border border-border p-5 sm:p-6 shadow-sm min-h-[540px] flex flex-col gap-6"
        >
          {/* Stage Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`w-2 h-2 rounded-full shrink-0 ${stageStatusDotClass}`}
              />
              <span className="font-mono text-xs uppercase tracking-[0.14em] font-semibold text-muted">
                STAGE STATUS:{' '}
                <strong className="text-text font-bold">
                  {isAuctionActive
                    ? 'LIVE AUCTION'
                    : isSoldState
                    ? 'SOLD'
                    : isUnsoldState
                    ? 'UNSOLD'
                    : 'IDLE'}
                </strong>
              </span>
            </div>

            {!isIdleState && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleBackToIdle}
                className="min-h-[44px] px-4 rounded-full bg-transparent border border-border text-xs font-medium text-text hover:bg-surface-2 transition-[opacity,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Back to idle
              </button>
            )}
          </div>

          {/* IDLE STATE */}
          {isIdleState || !stagePlayer ? (
            <div className="flex-1 py-12 px-6 text-center rounded-2xl bg-surface-2 border border-border flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-muted">
                <Gavel size={28} weight="duotone" />
              </div>
              <h2 className="font-syne font-bold text-xl text-text">
                No Player Currently on Stage
              </h2>
              <p className="text-sm text-muted">
                Bring a player to stage from the queue.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6">
              {/* SOLD BANNER */}
              {isSoldState && (
                <div className="p-4 sm:p-5 rounded-2xl bg-accent/15 border border-accent-bright/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-1 min-w-0">
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-accent-bright/40 font-mono text-xs uppercase tracking-[0.14em] text-accent-bright font-bold mb-1.5">
                        <CheckCircle size={14} weight="fill" />
                        <span>SOLD</span>
                      </span>
                      <div
                        title={leadingTeam?.name || 'Sold'}
                        className="font-syne font-extrabold text-xl sm:text-2xl text-text tracking-tight line-clamp-2 min-w-0"
                      >
                        {leadingTeam?.name || 'Sold'}
                      </div>
                    </div>

                    <div className="font-mono font-extrabold text-2xl sm:text-3xl text-points tabular-nums shrink-0">
                      {(displayedPrice ?? 0).toLocaleString()}
                      <span className="text-xs font-semibold text-muted ml-1.5">PTS</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleBackToIdle}
                    className="w-full sm:w-auto min-h-[48px] px-5 rounded-full bg-btn-bg text-btn-fg hover:opacity-90 active:scale-[0.98] font-medium text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  >
                    <span>Next player</span>
                    <ArrowRight size={16} weight="bold" />
                  </button>
                </div>
              )}

              {/* UNSOLD BANNER */}
              {isUnsoldState && (
                <div className="p-4 sm:p-5 rounded-2xl bg-error/10 border border-error/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface border border-error/40 font-mono text-xs uppercase tracking-[0.14em] text-error font-bold mb-1.5">
                      <XCircle size={14} weight="fill" />
                      <span>UNSOLD</span>
                    </span>
                    <p className="font-syne font-bold text-lg sm:text-xl text-text tracking-tight">
                      {stagePlayer.name} passed without a winning bid.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleBackToIdle}
                    className="w-full sm:w-auto min-h-[48px] px-5 rounded-full bg-surface border border-border text-text hover:bg-surface-2 active:scale-[0.98] font-medium text-sm inline-flex items-center justify-center gap-2 shrink-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                  >
                    <span>Next player</span>
                    <ArrowRight size={16} weight="bold" />
                  </button>
                </div>
              )}

              {/* PLAYER BLOCK + PRICE BLOCK */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
                {/* Player Block */}
                <div className="xl:col-span-7 flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5 min-w-0">
                  <div className="w-36 sm:w-40 aspect-[4/5] rounded-2xl overflow-hidden bg-surface-2 border border-border shrink-0 flex items-center justify-center">
                    {stagePlayer.photo_url || stagePlayer.photo_thumb_url ? (
                      <img
                        src={stagePlayer.photo_url || stagePlayer.photo_thumb_url}
                        alt={stagePlayer.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <User size={48} className="text-muted" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2.5">
                      <span className="px-3 py-1 rounded-full bg-surface-2 border border-border font-mono text-xs font-bold text-accent-bright tabular-nums">
                        #{formatAthleteCode(stagePlayer.athlete_code || stagePlayer.player_code)}
                      </span>
                      <span className="px-3 py-1 rounded-full bg-surface-2 border border-border font-mono text-xs uppercase tracking-[0.12em] text-muted">
                        {stagePlayer.sport}
                      </span>
                    </div>

                    <h2 className="font-syne font-extrabold text-[clamp(1.375rem,2.4vw,2rem)] leading-[1.15] text-text tracking-tight text-balance break-normal">
                      {formatBalancedName(stagePlayer.name)}
                    </h2>

                    <div className="mt-2.5 text-sm sm:text-[15px] font-medium text-muted">
                      {stagePlayer.playing_role}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center justify-center sm:justify-start gap-x-2.5 gap-y-1 text-sm text-muted">
                      <span className="font-mono font-semibold text-points tabular-nums">
                        Base: {stagePlayer.base_points.toLocaleString()} PTS
                      </span>
                      <span aria-hidden="true" className="text-border">
                        ·
                      </span>
                      <span>{stagePlayer.academic_year} Year</span>
                    </div>
                  </div>
                </div>

                {/* Price Block */}
                <div className="xl:col-span-5 p-5 rounded-2xl bg-surface-2 border border-border flex flex-col justify-between gap-4 min-w-0">
                  <div>
                    <span className="block font-mono text-xs uppercase tracking-[0.14em] text-muted">
                      {isSoldState ? 'FINAL SOLD PRICE' : 'CURRENT HIGHEST BID'}
                    </span>

                    <div className="mt-2">
                      <div
                        key={priceAnimKey}
                        className={`auction-price-pop font-mono font-extrabold text-[clamp(2.25rem,3.6vw,3.25rem)] leading-none tabular-nums tracking-tight ${
                          displayedPrice !== null ? 'text-points' : 'text-text'
                        }`}
                      >
                        {priceDisplayValue.toLocaleString()}
                        <span className="text-sm sm:text-base font-semibold text-muted ml-2">
                          PTS
                        </span>
                      </div>
                      {displayedPrice === null && (
                        <span className="block font-mono text-xs text-muted mt-2">
                          Opening base points (no bids yet)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-border">
                    <span className="block font-mono text-xs uppercase tracking-[0.14em] text-muted mb-2">
                      {isSoldState ? 'BUYER' : 'LEADING TEAM'}
                    </span>
                    {leadingTeam ? (
                      <div
                        style={
                          leadingTeamColor
                            ? ({ '--team-color': leadingTeamColor } as React.CSSProperties)
                            : undefined
                        }
                        className={`inline-flex items-center justify-between gap-2.5 max-w-full px-3.5 py-2 rounded-full bg-surface border-[1.5px] border-solid ${
                          leadingTeamColor
                            ? 'border-[color:color-mix(in_srgb,var(--team-color)_75%,transparent)]'
                            : 'border-border'
                        }`}
                      >
                        <span
                          title={leadingTeam.name}
                          className="font-syne font-bold text-sm text-text truncate"
                        >
                          {leadingTeam.name}
                        </span>
                        <span className="font-mono text-xs font-bold text-muted shrink-0">
                          {leadingTeam.short_code}
                        </span>
                      </div>
                    ) : (
                      <span className="block text-sm text-muted">
                        No leading team yet
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* LIVE BIDDING CONTROLS, TEAM TILES & ACTION ROW */}
              {isAuctionActive && (
                <div className="pt-6 border-t border-border flex flex-col gap-6">
                  {/* Next Bid Amount + Quick Increments on One Row */}
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="auction-bid-amount"
                        className="font-mono text-xs uppercase tracking-[0.14em] text-muted font-semibold"
                      >
                        NEXT BID AMOUNT · SUGGESTED {suggestedNextBid.toLocaleString()} PTS
                      </label>
                      {Number(bidAmountInput) !== suggestedNextBid && (
                        <button
                          type="button"
                          onClick={() => setBidAmountInput(String(suggestedNextBid))}
                          className="min-h-[44px] px-3 rounded-full font-mono text-xs text-accent-bright hover:bg-surface-2 transition-[opacity,transform] duration-150 cursor-pointer"
                        >
                          Reset to {suggestedNextBid.toLocaleString()} PTS
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                      <div className="relative flex-1 min-w-[160px]">
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
                          className="w-full h-12 min-h-[48px] pl-11 pr-14 bg-bg border border-border rounded-xl font-mono font-bold text-lg text-text tabular-nums focus:outline-none focus:border-accent-bright"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-muted pointer-events-none">
                          PTS
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {auctionSettings.bid_increments.map((inc) => (
                          <button
                            key={inc}
                            type="button"
                            disabled={isPending}
                            onClick={() => handleAddIncrement(inc)}
                            className="h-12 min-h-[48px] px-4 rounded-full bg-surface-2 hover:bg-bg border border-border font-mono font-bold text-sm text-text tabular-nums transition-[opacity,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                          >
                            +{inc.toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Team Tiles Grid */}
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted font-semibold">
                        TAP {stagePlayer.sport.toUpperCase()} TEAM TO BID AT{' '}
                        {isBidAmountValid ? `${parsedBidAmount.toLocaleString()} PTS` : '—'}
                      </span>
                      {auctionSettings.max_squad_size && (
                        <span className="font-mono text-xs text-muted tabular-nums">
                          SQUAD LIMIT: {auctionSettings.max_squad_size}
                        </span>
                      )}
                    </div>

                    {sportTeams.length === 0 ? (
                      <div className="p-6 rounded-2xl bg-surface-2 border border-border text-center text-sm text-muted">
                        No franchise teams configured for {stagePlayer.sport}.
                      </div>
                    ) : (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,168px),1fr))] gap-3">
                        {sportTeams.map((team) => {
                          const squadCount = squadCountsByTeam[team.id] || 0
                          const maxSquad = auctionSettings.max_squad_size
                          const isSquadFull =
                            maxSquad !== null &&
                            maxSquad !== undefined &&
                            maxSquad > 0 &&
                            squadCount >= maxSquad
                          const isPurseTooLow =
                            isBidAmountValid && team.current_purse < parsedBidAmount
                          const isLeading = leadingTeam?.id === team.id
                          const tileTeamColor = getValidTeamColor(team.color)

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
                              style={
                                tileTeamColor
                                  ? ({ '--team-color': tileTeamColor } as React.CSSProperties)
                                  : undefined
                              }
                              className={`min-h-[56px] p-3.5 rounded-2xl border-[1.5px] border-solid text-left flex flex-col justify-between gap-2.5 bg-surface-2 transition-[opacity,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-45 disabled:pointer-events-none cursor-pointer ${
                                tileTeamColor
                                  ? 'border-[color:color-mix(in_srgb,var(--team-color)_75%,transparent)]'
                                  : 'border-border'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 w-full">
                                <span className="px-2.5 py-0.5 rounded-full bg-surface border border-border font-mono text-xs font-bold text-text shrink-0">
                                  {team.short_code}
                                </span>

                                {disableReason ? (
                                  <span className="px-2 py-0.5 rounded-full bg-surface border border-error/40 font-mono text-xs text-error shrink-0">
                                    {disableReason}
                                  </span>
                                ) : isLeading ? (
                                  <span className="px-2 py-0.5 rounded-full bg-surface border border-accent-bright/50 font-mono text-xs text-accent-bright font-semibold shrink-0">
                                    Leading
                                  </span>
                                ) : null}
                              </div>

                              <div
                                title={team.name}
                                className="font-syne font-bold text-sm text-text leading-snug line-clamp-2 min-w-0"
                              >
                                {team.name}
                              </div>

                              <div className="flex items-center justify-between gap-2 text-xs text-muted w-full pt-2 border-t border-border/70">
                                <span className="font-mono font-bold text-points tabular-nums">
                                  {team.current_purse.toLocaleString()} PTS
                                </span>
                                <span className="font-mono tabular-nums text-muted">
                                  {squadCount}
                                  {maxSquad ? `/${maxSquad}` : ''}
                                </span>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Action Row: Secure, Mark unsold, Clear bid, Back to idle */}
                  <div className="pt-5 border-t border-border grid grid-cols-2 xl:grid-cols-4 gap-3">
                    <button
                      type="button"
                      disabled={isPending || !leadingTeam}
                      onClick={() => setIsSecureConfirmOpen(true)}
                      className="min-h-[52px] px-4 rounded-full bg-btn-bg text-btn-fg hover:opacity-90 active:scale-[0.98] font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      <ShieldCheck size={18} weight="bold" />
                      <span>Secure</span>
                    </button>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setIsUnsoldConfirmOpen(true)}
                      className="min-h-[52px] px-4 rounded-full bg-transparent border border-error/60 text-error hover:bg-surface-2 active:scale-[0.98] font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      <Prohibit size={18} />
                      <span>Mark unsold</span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        isPending || (!projectorState.team_id && projectorState.current_bid == null)
                      }
                      onClick={handleClearBid}
                      className="min-h-[52px] px-4 rounded-full bg-transparent border border-border text-text hover:bg-surface-2 active:scale-[0.98] font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      <Trash size={18} />
                      <span>Clear bid</span>
                    </button>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleBackToIdle}
                      className="min-h-[52px] px-4 rounded-full bg-transparent border border-border text-muted hover:text-text hover:bg-surface-2 active:scale-[0.98] font-medium text-sm whitespace-nowrap inline-flex items-center justify-center gap-2 transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      <span>Back to idle</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3. QUEUE PANEL (Right Rail on 768px+, Sticky; 3rd block below 768px) */}
        <aside
          aria-label="Auction Queue"
          className="md:col-start-9 md:col-span-4 md:row-start-1 md:row-span-3 md:sticky md:top-4 min-w-0 rounded-3xl bg-surface border border-border shadow-sm flex flex-col overflow-hidden"
        >
          <div className="p-4 sm:p-5 border-b border-border flex flex-col gap-3.5 shrink-0 bg-surface">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <Users size={18} className="text-accent-bright shrink-0" weight="bold" />
                <h2 className="font-syne font-bold text-base sm:text-lg text-text truncate">
                  {selectedSportName} Queue
                </h2>
              </div>

              {queueTab === 'queue' && queuedPlayersForSport.length > 0 && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsClearQueueConfirmOpen(true)}
                  className="min-h-[44px] px-3.5 rounded-full bg-transparent border border-border text-xs font-medium text-muted hover:text-text hover:bg-surface-2 inline-flex items-center gap-1.5 shrink-0 transition-[opacity,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  <Trash size={14} />
                  <span>Clear queue</span>
                </button>
              )}
            </div>

            {/* Queue / Sold Rounded Tabs */}
            <div className="grid grid-cols-2 gap-1 bg-surface-2 p-1 rounded-full border border-border">
              <button
                type="button"
                onClick={() => setQueueTab('queue')}
                className={`min-h-[44px] px-3 rounded-full text-xs sm:text-sm font-sans transition-[opacity,transform] duration-150 cursor-pointer ${
                  queueTab === 'queue'
                    ? 'bg-surface text-text font-medium border border-border'
                    : 'text-muted hover:text-text font-normal'
                }`}
              >
                Queue ({queuedPlayersForSport.length})
              </button>
              <button
                type="button"
                onClick={() => setQueueTab('sold')}
                className={`min-h-[44px] px-3 rounded-full text-xs sm:text-sm font-sans transition-[opacity,transform] duration-150 cursor-pointer ${
                  queueTab === 'sold'
                    ? 'bg-surface text-text font-medium border border-border'
                    : 'text-muted hover:text-text font-normal'
                }`}
              >
                Sold ({queueSoldPlayers.length})
              </button>
            </div>

            {queueTab === 'queue' ? (
              <div className="flex flex-col gap-3">
                {/* Search to Add Single Player */}
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
                      className="w-full min-h-[44px] pl-10 pr-10 py-2 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                    />
                    {addPlayerSearch && (
                      <button
                        type="button"
                        onClick={() => setAddPlayerSearch('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-text cursor-pointer"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    )}
                  </div>

                  {addPlayerSearch.trim().length > 0 && (
                    <div className="mt-2 rounded-2xl bg-bg border border-border shadow-md overflow-hidden divide-y divide-border max-h-56 overflow-y-auto overscroll-contain thin-scrollbar">
                      {matchingAddablePlayers.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-muted text-center">
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
                              className="w-full min-h-[44px] px-3.5 py-2.5 text-left hover:bg-surface-2 flex items-center justify-between gap-2.5 disabled:opacity-50 cursor-pointer"
                            >
                              <div className="min-w-0 flex-1 flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-accent-bright shrink-0">
                                  #{candidateCode}
                                </span>
                                <span className="font-syne font-bold text-sm text-text truncate">
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

                {/* Bulk Add by Codes */}
                <form onSubmit={handleQueueBulkAdd} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={bulkCodesInput}
                      onChange={(e) => {
                        setBulkCodesInput(e.target.value)
                        if (bulkResultMessage) setBulkResultMessage(null)
                      }}
                      placeholder="Bulk IDs (0002, 0003)"
                      disabled={isPending}
                      className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 bg-bg border border-border rounded-xl font-mono text-xs sm:text-sm text-text focus:outline-none focus:border-accent-bright"
                    />
                    <button
                      type="submit"
                      disabled={isPending || !bulkCodesInput.trim()}
                      className="min-h-[44px] px-4 rounded-full bg-surface-2 hover:bg-bg border border-border text-sm font-medium text-text shrink-0 transition-[opacity,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                  {bulkResultMessage && (
                    <div className="text-xs font-mono text-muted px-1">
                      {bulkResultMessage}
                    </div>
                  )}
                </form>
              </div>
            ) : (
              /* Sold Tab Search */
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
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 bg-bg border border-border rounded-xl text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>
            )}
          </div>

          {/* Scrollable Queue List */}
          <div
            ref={queueListRef}
            onScroll={(e) => {
              queueScrollTopRef.current = e.currentTarget.scrollTop
            }}
            className="p-3 space-y-2.5 max-h-[55vh] md:max-h-[calc(100vh-19rem)] overflow-y-auto overscroll-contain thin-scrollbar"
          >
            {displayedQueuePlayers.length === 0 ? (
              <p className="py-10 px-4 text-center text-sm text-muted">
                {queueTab === 'queue'
                  ? 'Queue is empty. Add players above.'
                  : 'No sold athletes in this sport yet.'}
              </p>
            ) : (
              displayedQueuePlayers.map((player, index) => {
                const code = formatAthleteCode(player.player_code || player.athlete_code)
                const isOnStage = stagePlayer?.id === player.id && !isIdleState
                const soldTeam = player.team_id
                  ? teams.find((t) => t.id === player.team_id)
                  : null
                const soldTeamColor = getValidTeamColor(soldTeam?.color)

                return (
                  <div
                    key={player.id}
                    onClick={() => {
                      if (queueTab === 'queue' && !isPending && !isOnStage) {
                        void handleBringToStage(player)
                      }
                    }}
                    className={`p-3.5 rounded-2xl bg-surface-2 border flex flex-col gap-3 ${
                      queueTab === 'queue' && !isOnStage ? 'cursor-pointer' : ''
                    } ${isOnStage ? 'border-accent-bright' : 'border-border'}`}
                  >
                    {/* Top Row: Photo + Name/Code/Meta */}
                    <div className="flex items-center gap-3 min-w-0">
                      {player.photo_thumb_url || player.photo_url ? (
                        <img
                          src={player.photo_thumb_url || player.photo_url}
                          alt={player.name}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-xl object-cover bg-surface border border-border shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-surface border border-border flex items-center justify-center text-muted font-mono text-xs font-bold shrink-0">
                          {player.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 rounded-full bg-surface border border-border font-mono text-xs font-bold text-accent-bright shrink-0 tabular-nums">
                            #{code}
                          </span>
                          <span
                            title={player.name}
                            className="font-syne font-bold text-sm text-text line-clamp-1 min-w-0 flex-1"
                          >
                            {player.name}
                          </span>
                          {player.status === 'unsold' && (
                            <span className="px-2 py-0.5 rounded-full bg-surface border border-border font-mono text-xs uppercase text-muted shrink-0">
                              Unsold
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-muted mt-1 flex-wrap">
                          <span>{player.playing_role}</span>
                          <span aria-hidden="true">·</span>
                          <span>{player.academic_year} Yr</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono font-semibold text-points tabular-nums">
                            {player.base_points.toLocaleString()} PTS
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Controls (Queue tab) or Buyer & Price (Sold tab) */}
                    {queueTab === 'queue' ? (
                      <div
                        className="flex items-center justify-between gap-2 pt-2.5 border-t border-border/70 flex-wrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            title="Move up"
                            aria-label={`Move ${player.name} up`}
                            disabled={isPending || index === 0}
                            onClick={(e) => handleQueueMovePlayer(player.id, 'up', e)}
                            className="w-9 h-9 rounded-full bg-surface border border-border text-muted hover:text-text inline-flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            <ArrowUp size={15} weight="bold" />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            aria-label={`Move ${player.name} down`}
                            disabled={isPending || index === displayedQueuePlayers.length - 1}
                            onClick={(e) => handleQueueMovePlayer(player.id, 'down', e)}
                            className="w-9 h-9 rounded-full bg-surface border border-border text-muted hover:text-text inline-flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            <ArrowDown size={15} weight="bold" />
                          </button>
                          <button
                            type="button"
                            title="Remove from queue"
                            aria-label={`Remove ${player.name} from queue`}
                            disabled={isPending}
                            onClick={(e) => handleQueueRemovePlayer(player.id, e)}
                            className="w-9 h-9 rounded-full bg-surface border border-border text-muted hover:text-error hover:border-error/40 inline-flex items-center justify-center disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          >
                            <X size={15} weight="bold" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isPending || isOnStage}
                          onClick={() => handleBringToStage(player)}
                          className={`min-h-[44px] px-4 rounded-full text-xs font-medium shrink-0 transition-[opacity,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:pointer-events-none cursor-pointer ${
                            isOnStage
                              ? 'bg-surface border border-border text-muted opacity-70'
                              : 'bg-btn-bg text-btn-fg hover:opacity-90 disabled:opacity-40'
                          }`}
                        >
                          {isOnStage ? 'On Stage' : 'Bring to stage'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border/70">
                        {soldTeam ? (
                          <span
                            style={
                              soldTeamColor
                                ? ({ '--team-color': soldTeamColor } as React.CSSProperties)
                                : undefined
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border-[1.5px] border-solid font-mono text-xs font-bold text-text ${
                              soldTeamColor
                                ? 'border-[color:color-mix(in_srgb,var(--team-color)_75%,transparent)]'
                                : 'border-border'
                            }`}
                          >
                            {soldTeam.short_code}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="font-mono font-bold text-sm text-points tabular-nums">
                          {(player.purchase_price ?? player.base_points).toLocaleString()} PTS
                        </span>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* 4. BID HISTORY & RECENT SALES (Main Zone Row 3, Side by Side) */}
        <div className="md:col-start-1 md:col-span-8 md:row-start-3 min-w-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-5 lg:gap-6 items-start">
          {/* Bid History */}
          <section
            aria-label="Bid History"
            className="rounded-3xl bg-surface border border-border p-5 sm:p-6 shadow-sm flex flex-col gap-4 min-w-0"
          >
            <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <ClockCounterClockwise
                  size={18}
                  className="text-accent-bright shrink-0"
                  weight="bold"
                />
                <h3 className="font-syne font-bold text-base sm:text-lg text-text truncate">
                  Bid History{stagePlayer ? ` · ${stagePlayer.name}` : ''}
                </h3>
              </div>
              <span className="font-mono text-xs text-muted shrink-0 tabular-nums">
                {playerBids.length} {playerBids.length === 1 ? 'bid' : 'bids'}
              </span>
            </div>

            {!stagePlayer ? (
              <p className="py-8 text-center text-sm text-muted">
                Bring a player to stage to view live bid history.
              </p>
            ) : playerBids.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No active bids recorded for {stagePlayer.name} yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto overscroll-contain thin-scrollbar pr-0.5">
                {playerBids.map((bid, idx) => {
                  const bidTeam = teams.find((t) => t.id === bid.team_id)
                  return (
                    <div
                      key={bid.id}
                      className="rounded-2xl bg-surface-2 border border-border px-3.5 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {bidTeam && (
                          <span className="px-2 py-0.5 rounded-full bg-surface border border-border font-mono text-xs font-bold text-text shrink-0">
                            {bidTeam.short_code}
                          </span>
                        )}
                        <span
                          title={bidTeam?.name || 'Team'}
                          className="font-medium text-sm text-text truncate"
                        >
                          {bidTeam?.name || 'Team'}
                        </span>
                        {idx === 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-surface border border-accent-bright/50 font-mono text-xs uppercase font-semibold text-accent-bright shrink-0">
                            TOP
                          </span>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="block font-mono font-bold text-sm text-points tabular-nums">
                          {bid.amount.toLocaleString()} PTS
                        </span>
                        <span className="block font-mono text-xs text-muted tabular-nums">
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
          </section>

          {/* Recent Sales */}
          <section
            aria-label="Recent Sales"
            className="rounded-3xl bg-surface border border-border p-5 sm:p-6 shadow-sm flex flex-col gap-4 min-w-0"
          >
            <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-border">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkle size={18} className="text-points shrink-0" weight="bold" />
                <h3 className="font-syne font-bold text-base sm:text-lg text-text truncate">
                  Recent Sales
                </h3>
              </div>
              <span className="font-mono text-xs text-muted shrink-0 tabular-nums">
                Last {recentSales.length} completed
              </span>
            </div>

            {recentSales.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                No completed sales recorded in this season yet.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto overscroll-contain thin-scrollbar pr-0.5">
                {recentSales.map((sale, idx) => {
                  const soldPlayer = players.find((p) => p.id === sale.player_id)
                  const buyerTeam = teams.find((t) => t.id === sale.team_id)
                  const isNewest = idx === 0

                  return (
                    <div
                      key={sale.id}
                      className="rounded-2xl bg-surface-2 border border-border p-3.5 flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap text-sm">
                            {soldPlayer && (
                              <span className="px-2 py-0.5 rounded-full bg-surface border border-border font-mono text-xs font-bold text-accent-bright shrink-0 tabular-nums">
                                #
                                {formatAthleteCode(
                                  soldPlayer.athlete_code || soldPlayer.player_code
                                )}
                              </span>
                            )}
                            <span className="font-syne font-bold text-sm text-text">
                              {soldPlayer?.name || 'Athlete'}
                            </span>
                            <span className="text-muted">to</span>
                            {buyerTeam && (
                              <span className="font-medium text-text">
                                {buyerTeam.name}{' '}
                                <span className="font-mono text-xs text-muted">
                                  ({buyerTeam.short_code})
                                </span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs font-mono text-muted mt-1">
                            {soldPlayer && <span>{soldPlayer.sport}</span>}
                            {soldPlayer && <span aria-hidden="true">·</span>}
                            <span className="tabular-nums">
                              {new Date(sale.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>

                        <span className="font-mono font-bold text-sm text-points tabular-nums shrink-0">
                          {sale.price.toLocaleString()} PTS
                        </span>
                      </div>

                      {isNewest && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setIsUndoSaleConfirmOpen(true)}
                          className="min-h-[44px] px-4 rounded-full bg-surface border border-border text-xs font-medium text-text hover:bg-bg inline-flex items-center gap-1.5 self-start transition-[opacity,transform] duration-150 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowCounterClockwise size={14} />
                          <span>Undo last sale</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
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
