import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Broadcast,
  ImageSquare,
  MagnifyingGlass,
  Minus,
  Plus,
  ShieldCheck,
  Stop,
  Television,
  User,
  Warning
} from '@phosphor-icons/react'
import type {
  Player,
  ProjectorAutoFilter,
  ProjectorMode,
  ProjectorState,
  Season,
  Sport,
  Team
} from '../../types'
import {
  DEFAULT_SPORTS,
  formatAthleteCode,
  lookupSeasonPlayerByCode,
  parseAthleteCode,
  setBroadcastMessage,
  setProjectorState,
  startProjectorAuto,
  stopProjectorAuto,
  type SeasonPlayerLookupResult
} from '../../lib/data'
import {
  PROJECTOR_AUTO_FILTERS,
  PROJECTOR_AUTO_INTERVAL,
  PROJECTOR_MODES
} from '../../lib/constants'
import { getAcademicYearLabel } from '../../lib/academicYears'
import {
  getAutoSlideshowPlayers,
  getAutoSlideshowTeams
} from '../../hooks/useAutoSlideshow'
import { useToast } from '../../lib/ToastContext'
import { CONFLICT_TOAST_MESSAGE, isStaleConflictError } from '../../lib/errors'
import { validateImageFile } from '../../lib/imageCompression'
import { clearProjectorImage, sendProjectorImage } from '../../lib/data/projectorImage'
import { Button, Dialog, Spinner } from '../../components/ui'
import {
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_DIALOG_CLASS,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_PAGE_HEADER,
  ADMIN_PAGE_TITLE,
  ADMIN_PAGE_WRAPPER,
  ADMIN_PILL_BAR,
  ADMIN_PILL_BAR_OUTER,
  ADMIN_SELECT,
  ADMIN_WELL
} from '../../components/admin/adminStyles'

interface AdminProjectorControlProps {
  activeSeason: Season | null
  projectorState: ProjectorState
  sports?: Sport[]
  teams: Team[]
  players: Player[]
  onRefresh: () => Promise<void>
}

const AUTO_FILTER_OPTIONS: readonly { value: ProjectorAutoFilter; label: string }[] = [
  { value: PROJECTOR_AUTO_FILTERS.ALL, label: 'All' },
  { value: PROJECTOR_AUTO_FILTERS.AVAILABLE, label: 'Available' },
  { value: PROJECTOR_AUTO_FILTERS.SOLD, label: 'Sold' },
  { value: PROJECTOR_AUTO_FILTERS.UNSOLD, label: 'Unsold' }
]

function clampInterval(val: number): number {
  const rounded = Math.round(Number(val) || PROJECTOR_AUTO_INTERVAL.DEFAULT)
  return Math.min(PROJECTOR_AUTO_INTERVAL.MAX, Math.max(PROJECTOR_AUTO_INTERVAL.MIN, rounded))
}

const PROJECTOR_IMAGE_MAX_DIM = 1280
const PROJECTOR_IMAGE_MAX_CHARS = 180_000
const PROJECTOR_IMAGE_CAPTION_MAX = 80
const PROJECTOR_IMAGE_QUALITY_STEPS = [0.75, 0.68, 0.6, 0.52, 0.44, 0.36, 0.28, 0.2, 0.14] as const

type BroadcastImageDurationKey = '10' | '20' | '30' | '60' | 'until_cleared'

const PROJECTOR_IMAGE_DURATION_OPTIONS: readonly {
  value: BroadcastImageDurationKey
  label: string
  seconds: number | null
}[] = [
  { value: '10', label: '10s', seconds: 10 },
  { value: '20', label: '20s', seconds: 20 },
  { value: '30', label: '30s', seconds: 30 },
  { value: '60', label: '60s', seconds: 60 },
  { value: 'until_cleared', label: 'Until cleared', seconds: null }
]

function createClientBroadcastImageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

async function compressProjectorImage(file: File): Promise<string> {
  validateImageFile(file)

  const objectUrl = URL.createObjectURL(file)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(el)
    }
    el.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not decode the selected image.'))
    }
    el.src = objectUrl
  })

  const srcWidth = img.naturalWidth || img.width
  const srcHeight = img.naturalHeight || img.height
  if (!srcWidth || !srcHeight) {
    throw new Error('Selected image has invalid dimensions.')
  }

  const longest = Math.max(srcWidth, srcHeight)
  const scale = longest > PROJECTOR_IMAGE_MAX_DIM ? PROJECTOR_IMAGE_MAX_DIM / longest : 1
  const targetWidth = Math.max(1, Math.round(srcWidth * scale))
  const targetHeight = Math.max(1, Math.round(srcHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Image compression is not supported in this browser.')
  }

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, targetWidth, targetHeight)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

  for (const quality of PROJECTOR_IMAGE_QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length < PROJECTOR_IMAGE_MAX_CHARS) {
      return dataUrl
    }
  }

  throw new Error(
    'Image could not be compressed below the 180 KB broadcast limit. Please choose a smaller or simpler image.'
  )
}

interface PillRadioGroupProps<T extends string> {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

function PillRadioGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel
}: PillRadioGroupProps<T>) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (index + 1) % options.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (index - 1 + options.length) % options.length
    }

    if (nextIndex !== -1) {
      onChange(options[nextIndex].value)
      buttonRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <div className={ADMIN_PILL_BAR_OUTER}>
      <div role="radiogroup" aria-label={ariaLabel} className={ADMIN_PILL_BAR}>
        {options.map((opt, idx) => {
          const isSelected = value === opt.value
          return (
            <button
              key={opt.value}
              ref={(el) => {
                buttonRefs.current[idx] = el
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`min-h-[34px] px-3.5 py-1 rounded-full text-xs font-sans whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
                isSelected
                  ? 'bg-btn-bg text-btn-fg font-medium'
                  : 'text-muted hover:text-text font-normal'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export const AdminProjectorControl: React.FC<AdminProjectorControlProps> = ({
  activeSeason,
  projectorState,
  sports: sportsProp,
  teams,
  players,
  onRefresh
}) => {
  const { success, error } = useToast()

  const safeTeams = Array.isArray(teams) ? teams : []

  const availableSports = useMemo(
    () => (Array.isArray(sportsProp) && sportsProp.length > 0 ? sportsProp : DEFAULT_SPORTS),
    [sportsProp]
  )

  const resolveSportName = (raw?: string | null): string => {
    if (!raw) return availableSports[0]?.name || 'Cricket'
    const matched = availableSports.find(
      (s) => (s?.name || '').trim().toLowerCase() === raw.trim().toLowerCase()
    )
    return matched ? matched.name : availableSports[0]?.name || 'Cricket'
  }

  const sportSegmentedOptions = useMemo(
    () =>
      availableSports.map((s) => ({
        value: s.name,
        label: s.name
      })),
    [availableSports]
  )

  // Card 1 (Idle Broadcast) state
  const [broadcastInput, setBroadcastInput] = useState('')
  const [isBroadcastPending, setIsBroadcastPending] = useState(false)
  const [broadcastError, setBroadcastError] = useState<string | null>(null)
  const broadcastInFlightRef = useRef(false)
  const activeBroadcastMessage = (projectorState?.broadcast_message || '').trim()

  const handleAnnounceBroadcast = async () => {
    const trimmed = broadcastInput.trim()
    if (!trimmed || isBroadcastPending || broadcastInFlightRef.current) return
    if (!activeSeason) {
      setBroadcastError('No active season')
      return
    }
    broadcastInFlightRef.current = true
    try {
      setIsBroadcastPending(true)
      setBroadcastError(null)
      await setBroadcastMessage(activeSeason.id, trimmed.slice(0, 200))
      setBroadcastInput('')
      await onRefresh()
    } catch (err: unknown) {
      if (isStaleConflictError(err)) {
        setBroadcastError(CONFLICT_TOAST_MESSAGE)
        error(CONFLICT_TOAST_MESSAGE)
        await onRefresh()
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to announce broadcast'
        setBroadcastError(msg)
      }
    } finally {
      broadcastInFlightRef.current = false
      setIsBroadcastPending(false)
    }
  }

  const handleClearBroadcast = async () => {
    if (!activeBroadcastMessage || isBroadcastPending || broadcastInFlightRef.current) return
    if (!activeSeason) {
      setBroadcastError('No active season')
      return
    }
    broadcastInFlightRef.current = true
    try {
      setIsBroadcastPending(true)
      setBroadcastError(null)
      await setBroadcastMessage(activeSeason.id, null)
      await onRefresh()
    } catch (err: unknown) {
      if (isStaleConflictError(err)) {
        setBroadcastError(CONFLICT_TOAST_MESSAGE)
        error(CONFLICT_TOAST_MESSAGE)
        await onRefresh()
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to clear broadcast'
        setBroadcastError(msg)
      }
    } finally {
      broadcastInFlightRef.current = false
      setIsBroadcastPending(false)
    }
  }

  // Card 1 (Ephemeral Idle Broadcast Image) state — memory only, never persisted
  const isSelectedSeasonActive = Boolean(activeSeason?.is_active)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageFileName, setImageFileName] = useState<string | null>(null)
  const [imageCaption, setImageCaption] = useState('')
  const [imageDuration, setImageDuration] = useState<BroadcastImageDurationKey>('30')
  const [isImageCompressing, setIsImageCompressing] = useState(false)
  const [isImageSending, setIsImageSending] = useState(false)
  const [isImageClearing, setIsImageClearing] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const imageInFlightRef = useRef(false)
  const lastSentImageIdRef = useRef<string | null>(null)
  const isImageBusy = isImageCompressing || isImageSending || isImageClearing

  const handleSelectProjectorImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isSelectedSeasonActive) {
      setImageError('Select an active season to broadcast images.')
      e.target.value = ''
      return
    }

    setImageError(null)
    setIsImageCompressing(true)
    try {
      const compressedDataUrl = await compressProjectorImage(file)
      setImageDataUrl(compressedDataUrl)
      setImageFileName(file.name)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to process image'
      setImageDataUrl(null)
      setImageFileName(null)
      setImageError(msg)
      e.target.value = ''
    } finally {
      setIsImageCompressing(false)
    }
  }

  const handleSendProjectorImage = async () => {
    if (!activeSeason || !isSelectedSeasonActive) {
      setImageError('Only an active season can broadcast images.')
      return
    }
    if (!imageDataUrl || isImageBusy || imageInFlightRef.current) return
    if (imageDataUrl.length >= PROJECTOR_IMAGE_MAX_CHARS) {
      setImageError(
        'Image exceeds the 180 KB broadcast limit. Please choose a smaller or simpler image.'
      )
      return
    }

    const durationOption = PROJECTOR_IMAGE_DURATION_OPTIONS.find(
      (opt) => opt.value === imageDuration
    )
    const id = createClientBroadcastImageId()

    imageInFlightRef.current = true
    setIsImageSending(true)
    setImageError(null)
    try {
      await sendProjectorImage(activeSeason.id, {
        id,
        dataUrl: imageDataUrl,
        caption: imageCaption.trim().slice(0, PROJECTOR_IMAGE_CAPTION_MAX) || null,
        durationSec: durationOption ? durationOption.seconds : 30,
        sentAt: new Date().toISOString()
      })
      lastSentImageIdRef.current = id
      success('Image sent to projector')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send image to projector'
      setImageError(msg)
      error(msg)
    } finally {
      imageInFlightRef.current = false
      setIsImageSending(false)
    }
  }

  const handleClearProjectorImage = async () => {
    if (!activeSeason || !isSelectedSeasonActive) {
      setImageError('Only an active season can clear projector images.')
      return
    }
    if (isImageBusy || imageInFlightRef.current) return

    imageInFlightRef.current = true
    setIsImageClearing(true)
    setImageError(null)
    try {
      await clearProjectorImage(activeSeason.id, lastSentImageIdRef.current ?? undefined)
      lastSentImageIdRef.current = null
      setImageDataUrl(null)
      setImageFileName(null)
      setImageCaption('')
      setImageError(null)
      if (imageInputRef.current) {
        imageInputRef.current.value = ''
      }
      success('Projector image cleared')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to clear projector image'
      setImageError(msg)
      error(msg)
    } finally {
      imageInFlightRef.current = false
      setIsImageClearing(false)
    }
  }

  // Card 2 (Teams and Purses) state
  const [teamSport, setTeamSport] = useState<string>(() =>
    projectorState?.mode === PROJECTOR_MODES.ROSTER_AUTO ||
    projectorState?.mode === PROJECTOR_MODES.ROSTER
      ? resolveSportName(projectorState?.auto_sport)
      : availableSports[0]?.name || 'Cricket'
  )
  const [teamMode, setTeamMode] = useState<'auto' | 'single'>(() =>
    projectorState?.mode === PROJECTOR_MODES.ROSTER ? 'single' : 'auto'
  )
  const [teamAnimation, setTeamAnimation] = useState<'fade' | 'slide' | 'zoom'>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('fieldr_projector_team_animation')
        if (saved === 'slide' || saved === 'zoom' || saved === 'fade') return saved
      }
    } catch {
      // Ignore storage access errors in private/restricted browsers
    }
    return 'fade'
  })
  const [teamInterval, setTeamInterval] = useState<number>(() =>
    projectorState?.auto_interval_seconds
      ? clampInterval(projectorState.auto_interval_seconds)
      : PROJECTOR_AUTO_INTERVAL.DEFAULT
  )

  const teamSportTeams = useMemo(
    () =>
      safeTeams.filter(
        (t) => (t?.sport || '').trim().toLowerCase() === teamSport.trim().toLowerCase()
      ),
    [safeTeams, teamSport]
  )

  const [selectedTeamId, setSelectedTeamId] = useState<string>(() => {
    if (projectorState?.team_id) {
      const current = safeTeams.find((t) => t.id === projectorState.team_id)
      if (current) return current.id
    }
    const initialSportTeams = safeTeams.filter(
      (t) => (t?.sport || '').trim().toLowerCase() === teamSport.trim().toLowerCase()
    )
    return initialSportTeams[0]?.id || ''
  })

  // Ensure selectedTeamId belongs to teamSportTeams when teamSport changes
  useEffect(() => {
    if (teamSportTeams.length > 0) {
      const exists = teamSportTeams.some((t) => t.id === selectedTeamId)
      if (!exists) {
        setSelectedTeamId(teamSportTeams[0].id)
      }
    } else {
      setSelectedTeamId('')
    }
  }, [teamSportTeams, selectedTeamId])

  // Card 3 (Player Spotlight) state
  const [playerSport, setPlayerSport] = useState<string>(() =>
    projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO
      ? resolveSportName(projectorState.auto_sport)
      : availableSports[0]?.name || 'Cricket'
  )
  const [playerCodeInput, setPlayerCodeInput] = useState<string>(() => {
    if (projectorState.player_id) {
      const current = players.find((p) => p.id === projectorState.player_id)
      if (current) {
        return formatAthleteCode(current.athlete_code ?? current.player_code)
      }
    }
    return ''
  })
  const [isLookingUpPlayer, setIsLookingUpPlayer] = useState(false)
  const [lookupResult, setLookupResult] = useState<SeasonPlayerLookupResult | null>(null)
  const [lookupCodeNormalized, setLookupCodeNormalized] = useState<number | null>(null)

  const [playerAutoInterval, setPlayerAutoInterval] = useState<number>(() =>
    projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO && projectorState.auto_interval_seconds
      ? clampInterval(projectorState.auto_interval_seconds)
      : PROJECTOR_AUTO_INTERVAL.DEFAULT
  )
  const [playerAutoFilter, setPlayerAutoFilter] = useState<ProjectorAutoFilter>(() =>
    projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO && projectorState.auto_filter
      ? projectorState.auto_filter
      : PROJECTOR_AUTO_FILTERS.ALL
  )
  const [playerMode, setPlayerMode] = useState<'auto' | 'single'>(() =>
    projectorState.mode === PROJECTOR_MODES.PLAYER ? 'single' : 'auto'
  )
  const [playerAnimation, setPlayerAnimation] = useState<'fade' | 'slide' | 'zoom'>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('fieldr_projector_player_animation')
      if (saved === 'slide' || saved === 'zoom' || saved === 'fade') return saved
    }
    return 'fade'
  })

  // Debounced lookup (300ms) in public_players for selected season, selected sport and athlete_code
  useEffect(() => {
    const cleanDigits = playerCodeInput.replace(/\D/g, '')
    if (!cleanDigits || !activeSeason?.id) {
      setLookupResult(null)
      setLookupCodeNormalized(null)
      setIsLookingUpPlayer(false)
      return
    }

    const parsedCode = parseAthleteCode(cleanDigits)
    if (!parsedCode) {
      setLookupResult({ match: null, otherSports: [] })
      setLookupCodeNormalized(0)
      setIsLookingUpPlayer(false)
      return
    }

    let cancelled = false
    setIsLookingUpPlayer(true)

    const timer = setTimeout(async () => {
      try {
        const res = await lookupSeasonPlayerByCode(
          activeSeason.id,
          playerSport,
          parsedCode
        )
        if (!cancelled) {
          setLookupResult(res)
          setLookupCodeNormalized(parsedCode)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Player lookup failed'
          error(msg)
          setLookupResult(null)
          setLookupCodeNormalized(null)
        }
      } finally {
        if (!cancelled) {
          setIsLookingUpPlayer(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [playerCodeInput, playerSport, activeSeason?.id, error])

  const [isUpdating, setIsUpdating] = useState(false)
  const updatingInFlightRef = useRef(false)

  // Auction stage guard
  const isAuctionModeOnStage =
    projectorState.mode === PROJECTOR_MODES.AUCTION ||
    projectorState.mode === PROJECTOR_MODES.SOLD ||
    projectorState.mode === PROJECTOR_MODES.UNSOLD

  const auctionStagePlayer = useMemo(() => {
    const targetId = projectorState.sale_player_id || projectorState.player_id
    if (!targetId) return null
    return players.find((p) => p.id === targetId) || null
  }, [players, projectorState.player_id, projectorState.sale_player_id])

  const auctionStagePlayerName = auctionStagePlayer?.name || 'Active Player'

  const [pendingAction, setPendingAction] = useState<{
    label: string
    run: () => Promise<void>
  } | null>(null)

  const executeOrConfirm = (label: string, action: () => Promise<void>) => {
    if (updatingInFlightRef.current || isUpdating) return
    if (isAuctionModeOnStage) {
      setPendingAction({ label, run: action })
      return
    }
    void action()
  }

  // Player Auto matching list for Card 3 form
  const matchingFormAutoPlayers = useMemo(
    () => getAutoSlideshowPlayers(players, playerSport, playerAutoFilter),
    [players, playerSport, playerAutoFilter]
  )

  const isPlayerAutoLive = projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO

  // Scene actions
  const performSwitchScene = async (
    mode: ProjectorMode,
    options?: { playerId?: string | null; teamId?: string | null }
  ) => {
    if (updatingInFlightRef.current) return
    if (!activeSeason) {
      error('No active season')
      return
    }

    updatingInFlightRef.current = true
    try {
      setIsUpdating(true)
      const nextState: ProjectorState = {
        season_id: activeSeason.id,
        mode,
        player_id: mode === PROJECTOR_MODES.PLAYER ? options?.playerId ?? null : null,
        team_id: mode === PROJECTOR_MODES.ROSTER ? options?.teamId ?? null : null,
        auto_sport: null,
        auto_started_at: null,
        updated_at: new Date().toISOString()
      }

      await setProjectorState(nextState)
      success(`Projector scene switched to ${mode.toUpperCase()}`)
      await onRefresh()
    } catch (err: unknown) {
      if (isStaleConflictError(err)) {
        error(CONFLICT_TOAST_MESSAGE)
        await onRefresh()
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to update projector scene'
        error(msg)
      }
    } finally {
      updatingInFlightRef.current = false
      setIsUpdating(false)
    }
  }

  const performBroadcastPlayer = async () => {
    if (updatingInFlightRef.current) return
    if (!activeSeason) {
      error('No active season')
      return
    }

    updatingInFlightRef.current = true
    try {
      setIsUpdating(true)
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('fieldr_projector_player_animation', playerAnimation)
      }
      if (playerMode === 'auto') {
        if (matchingFormAutoPlayers.length === 0) {
          error(playerAutoDisabledReason || 'No matching players to broadcast')
          return
        }
        const interval = clampInterval(playerAutoInterval)
        setPlayerAutoInterval(interval)
        await startProjectorAuto({
          seasonId: activeSeason.id,
          mode: PROJECTOR_MODES.PLAYER_AUTO,
          sport: playerSport,
          filter: playerAutoFilter,
          intervalSeconds: interval
        })
        success(
          `Player Spotlight Auto started for ${playerSport} (${playerAnimation}, every ${interval}s)`
        )
      } else {
        if (!matchedPlayer) {
          error('Please look up a valid player ID first')
          return
        }
        const nextState: ProjectorState = {
          season_id: activeSeason.id,
          mode: PROJECTOR_MODES.PLAYER,
          player_id: matchedPlayer.id,
          team_id: null,
          auto_sport: playerSport,
          auto_filter: PROJECTOR_AUTO_FILTERS.ALL,
          auto_interval_seconds: null,
          auto_started_at: null,
          updated_at: new Date().toISOString()
        }
        await setProjectorState(nextState)
        success(
          `Broadcasted player: #${formattedLookupCode} ${matchedPlayer.name} (${playerAnimation})`
        )
      }
      await onRefresh()
    } catch (err: unknown) {
      if (isStaleConflictError(err)) {
        error(CONFLICT_TOAST_MESSAGE)
        await onRefresh()
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to broadcast player'
        error(msg)
      }
    } finally {
      updatingInFlightRef.current = false
      setIsUpdating(false)
    }
  }

  const handleStopAuto = async () => {
    if (updatingInFlightRef.current) return
    if (!activeSeason) {
      error('No active season')
      return
    }
    updatingInFlightRef.current = true
    try {
      setIsUpdating(true)
      await stopProjectorAuto(activeSeason.id)
      success('Auto slideshow stopped. Projector returned to Idle.')
      await onRefresh()
    } catch (err: unknown) {
      if (isStaleConflictError(err)) {
        error(CONFLICT_TOAST_MESSAGE)
        await onRefresh()
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to stop auto slideshow'
        error(msg)
      }
    } finally {
      updatingInFlightRef.current = false
      setIsUpdating(false)
    }
  }

  const matchedPlayer = lookupResult?.match || null
  const formattedLookupCode =
    lookupCodeNormalized !== null ? formatAthleteCode(lookupCodeNormalized) : ''

  const playerAutoDisabledReason =
    matchingFormAutoPlayers.length === 0
      ? playerAutoFilter === PROJECTOR_AUTO_FILTERS.ALL
        ? `No players registered in ${playerSport}`
        : `No ${playerAutoFilter} players in ${playerSport}`
      : null

  const performBroadcastTeams = async () => {
    if (updatingInFlightRef.current) return
    if (!activeSeason) {
      error('No active season')
      return
    }

    updatingInFlightRef.current = true
    try {
      setIsUpdating(true)
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('fieldr_projector_team_animation', teamAnimation)
      }
      if (teamMode === 'auto') {
        if (teamSportTeams.length === 0) {
          error(`No teams found for ${teamSport}`)
          return
        }
        const interval = clampInterval(teamInterval)
        setTeamInterval(interval)
        const nextState: ProjectorState = {
          season_id: activeSeason.id,
          mode: PROJECTOR_MODES.ROSTER_AUTO,
          player_id: null,
          team_id: null,
          auto_sport: teamSport,
          auto_filter: PROJECTOR_AUTO_FILTERS.ALL,
          auto_interval_seconds: interval,
          auto_started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        await setProjectorState(nextState)
        success(`Teams slideshow started for ${teamSport} (${teamAnimation}, every ${interval}s)`)
      } else {
        if (!selectedTeamId) {
          error('Please select a team')
          return
        }
        const targetTeam = teams.find((t) => t.id === selectedTeamId)
        const nextState: ProjectorState = {
          season_id: activeSeason.id,
          mode: PROJECTOR_MODES.ROSTER,
          player_id: null,
          team_id: selectedTeamId,
          auto_sport: teamSport,
          auto_filter: PROJECTOR_AUTO_FILTERS.ALL,
          auto_interval_seconds: null,
          auto_started_at: null,
          updated_at: new Date().toISOString()
        }
        await setProjectorState(nextState)
        success(`Broadcasted team: ${targetTeam?.name || 'Selected Team'} (${teamAnimation})`)
      }
      await onRefresh()
    } catch (err: unknown) {
      if (isStaleConflictError(err)) {
        error(CONFLICT_TOAST_MESSAGE)
        await onRefresh()
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to broadcast teams'
        error(msg)
      }
    } finally {
      updatingInFlightRef.current = false
      setIsUpdating(false)
    }
  }

  const isIdleLive = projectorState.mode === PROJECTOR_MODES.IDLE

  const isCard2Live =
    projectorState.mode === PROJECTOR_MODES.TEAMS ||
    projectorState.mode === PROJECTOR_MODES.ROSTER ||
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO

  const isTeamAutoLive =
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO ||
    (projectorState.mode === PROJECTOR_MODES.TEAMS && !projectorState.team_id)

  const runningAutoTeams = useMemo(
    () =>
      isTeamAutoLive ? getAutoSlideshowTeams(teams, projectorState.auto_sport) : [],
    [isTeamAutoLive, teams, projectorState.auto_sport]
  )

  const liveTeam = useMemo(
    () => (projectorState.team_id ? teams.find((t) => t.id === projectorState.team_id) : null),
    [projectorState.team_id, teams]
  )

  const livePlayer = useMemo(
    () =>
      projectorState.player_id
        ? players.find((p) => p.id === projectorState.player_id)
        : null,
    [projectorState.player_id, players]
  )

  const isCard3Live =
    projectorState.mode === PROJECTOR_MODES.PLAYER || isPlayerAutoLive

  return (
    <div className={ADMIN_PAGE_WRAPPER}>
      <header className={ADMIN_PAGE_HEADER}>
        <h1 className={ADMIN_PAGE_TITLE}>Projector Command Studio</h1>

        <a
          href="/projector"
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[42px] px-5 py-2 rounded-full bg-btn-bg text-btn-fg font-medium text-sm hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 self-start sm:self-auto shrink-0"
        >
          <Television size={18} weight="regular" />
          <span>Open Fullscreen Projector</span>
        </a>
      </header>

      {/* Auction Guard Warning Banner */}
      {isAuctionModeOnStage && (
        <div
          role="alert"
          className="p-5 rounded-3xl bg-error/10 border border-error/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
        >
          <div className="flex items-center gap-3 text-text">
            <Warning size={20} weight="regular" className="text-error shrink-0" />
            <span>
              An auction is on stage:{' '}
              <strong className="font-semibold">{auctionStagePlayerName}</strong>. Broadcasting a
              scene will replace it.
            </span>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface border border-error/30 font-mono text-xs uppercase tracking-wider text-error font-medium shrink-0 self-start sm:self-auto">
            Stage Guard · {projectorState.mode}
          </span>
        </div>
      )}

      {/* Module 1: Idle & Live Announcement */}
      <section
        className={`bg-surface border rounded-3xl p-6 sm:p-8 space-y-6 transition-colors min-w-0 ${
          isIdleLive ? 'border-accent-bright' : 'border-border'
        }`}
      >
        <div className={ADMIN_CARD_HEADER}>
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                isIdleLive
                  ? 'bg-accent text-on-accent border-accent'
                  : 'bg-surface-2 text-muted border-border'
              }`}
            >
              <Broadcast size={20} weight="regular" />
            </div>
            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <h2 className={ADMIN_CARD_TITLE}>Idle Screen</h2>
              {isIdleLive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent-bright/15 border border-accent-bright/35 text-accent-bright text-xs font-medium">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent-bright shrink-0" />
                  <span>Live on stage</span>
                </span>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant={isIdleLive ? 'secondary' : 'primary'}
            size="md"
            disabled={isUpdating || isIdleLive}
            onClick={() =>
              executeOrConfirm('Idle Screen', () =>
                performSwitchScene(PROJECTOR_MODES.IDLE)
              )
            }
            className="rounded-full px-5 self-start sm:self-auto shrink-0"
          >
            {isIdleLive ? 'Currently Active' : 'Broadcast Scene'}
          </Button>
        </div>

        {/* Broadcast Message Well */}
        <div className={`${ADMIN_WELL} p-4 sm:p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="idle-broadcast-message-input" className={ADMIN_LABEL}>
              Broadcast Announcement
            </label>
            <span className="text-xs font-mono text-muted tabular-nums">
              {broadcastInput.length}/200
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <input
              id="idle-broadcast-message-input"
              type="text"
              maxLength={200}
              value={broadcastInput}
              onChange={(e) => {
                setBroadcastInput(e.target.value.slice(0, 200))
                if (broadcastError) setBroadcastError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleAnnounceBroadcast()
                }
              }}
              placeholder="Announcement for the projector idle screen..."
              className={`${ADMIN_INPUT} flex-1 bg-surface`}
            />

            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant={isIdleLive ? 'primary' : 'secondary'}
                size="md"
                isLoading={isBroadcastPending && Boolean(broadcastInput.trim())}
                disabled={!broadcastInput.trim() || isBroadcastPending || !activeSeason}
                onClick={() => void handleAnnounceBroadcast()}
                className="rounded-full px-5"
              >
                Announce
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                isLoading={isBroadcastPending && !broadcastInput.trim()}
                disabled={!activeBroadcastMessage || isBroadcastPending || !activeSeason}
                onClick={() => void handleClearBroadcast()}
                className="rounded-full"
              >
                Clear
              </Button>
            </div>
          </div>

          {broadcastError && (
            <div role="alert" className="text-xs font-mono text-error">
              {broadcastError}
            </div>
          )}

          <div className="flex items-baseline gap-2.5 text-xs pt-3 border-t border-border">
            <span className="font-mono uppercase tracking-wider text-muted shrink-0">
              Live now:
            </span>
            <span
              className={
                activeBroadcastMessage
                  ? 'text-text font-medium break-words'
                  : 'text-muted'
              }
            >
              {activeBroadcastMessage || 'No broadcast active'}
            </span>
          </div>
        </div>

        {/* Broadcast Image Well (ephemeral, idle scene only) */}
        <div className={`${ADMIN_WELL} p-4 sm:p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <ImageSquare size={16} weight="regular" className="text-muted shrink-0" />
              <label htmlFor="idle-broadcast-image-input" className={ADMIN_LABEL}>
                Broadcast Image
              </label>
            </div>
            <span className="text-xs font-mono text-muted">
              {isSelectedSeasonActive
                ? 'Idle screen only · Not saved'
                : 'Available only for the active season'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_180px] gap-3">
            <div className="space-y-3 min-w-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <input
                  ref={imageInputRef}
                  id="idle-broadcast-image-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!isSelectedSeasonActive || isImageBusy}
                  onChange={(e) => void handleSelectProjectorImage(e)}
                  className={`${ADMIN_INPUT} flex-1 bg-surface file:mr-3 file:py-1 file:px-3 file:rounded-full file:border file:border-border file:bg-surface-2 file:text-xs file:font-medium file:text-text hover:file:border-accent-bright disabled:opacity-50 disabled:cursor-not-allowed`}
                />
                <div className="sm:w-40 shrink-0">
                  <label htmlFor="idle-broadcast-image-duration" className="sr-only">
                    Display duration
                  </label>
                  <select
                    id="idle-broadcast-image-duration"
                    value={imageDuration}
                    disabled={!isSelectedSeasonActive || isImageBusy}
                    onChange={(e) => setImageDuration(e.target.value as BroadcastImageDurationKey)}
                    className={`${ADMIN_SELECT} bg-surface disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {PROJECTOR_IMAGE_DURATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="idle-broadcast-image-caption"
                    className="text-xs font-mono uppercase tracking-wider text-muted"
                  >
                    Caption (optional)
                  </label>
                  <span className="text-xs font-mono text-muted tabular-nums">
                    {imageCaption.length}/{PROJECTOR_IMAGE_CAPTION_MAX}
                  </span>
                </div>
                <input
                  id="idle-broadcast-image-caption"
                  type="text"
                  maxLength={PROJECTOR_IMAGE_CAPTION_MAX}
                  value={imageCaption}
                  disabled={!isSelectedSeasonActive || isImageBusy}
                  onChange={(e) => {
                    setImageCaption(e.target.value.slice(0, PROJECTOR_IMAGE_CAPTION_MAX))
                    if (imageError) setImageError(null)
                  }}
                  placeholder="Optional caption shown below the image..."
                  className={`${ADMIN_INPUT} bg-surface disabled:opacity-50 disabled:cursor-not-allowed`}
                />
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface p-2 min-h-[104px]">
              {isImageCompressing ? (
                <div className="flex items-center gap-2 text-xs font-mono text-muted">
                  <Spinner size="sm" />
                  <span>Compressing...</span>
                </div>
              ) : imageDataUrl ? (
                <div className="w-full space-y-1.5">
                  <div className="w-full h-24 rounded-lg bg-black/90 border border-border/60 overflow-hidden flex items-center justify-center">
                    <img
                      src={imageDataUrl}
                      alt={imageCaption.trim() || imageFileName || 'Selected broadcast preview'}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-muted px-0.5">
                    <span className="truncate">{imageFileName || 'Compressed JPEG'}</span>
                    <span className="shrink-0 tabular-nums">
                      {Math.round(imageDataUrl.length / 1024)} KB
                    </span>
                  </div>
                </div>
              ) : (
                <span className="text-xs font-mono text-muted text-center px-2">
                  JPG, PNG, or WebP preview
                </span>
              )}
            </div>
          </div>

          {imageError && (
            <div role="alert" className="text-xs font-mono text-error">
              {imageError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-border">
            <span className="text-xs text-muted">
              Compressed in browser before sending. Hidden automatically when leaving Idle.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant={isIdleLive ? 'primary' : 'secondary'}
                size="md"
                isLoading={isImageSending}
                disabled={!isSelectedSeasonActive || !imageDataUrl || isImageBusy}
                onClick={() => void handleSendProjectorImage()}
                className="rounded-full px-5"
              >
                Send to projector
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="md"
                isLoading={isImageClearing}
                disabled={!isSelectedSeasonActive || isImageBusy}
                onClick={() => void handleClearProjectorImage()}
                className="rounded-full"
              >
                Clear from projector
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Two-Column Modules: Teams & Purses + Player Spotlight */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Module 2: Teams and Purses */}
        <section
          className={`bg-surface border rounded-3xl p-6 sm:p-8 space-y-6 transition-colors min-w-0 ${
            isCard2Live ? 'border-accent-bright' : 'border-border'
          }`}
        >
          <div className={ADMIN_CARD_HEADER}>
            <div className="flex items-start gap-3.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                  isCard2Live
                    ? 'bg-accent text-on-accent border-accent'
                    : 'bg-surface-2 text-muted border-border'
                }`}
              >
                <ShieldCheck size={20} weight="regular" />
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={ADMIN_CARD_TITLE}>Teams &amp; Purses</h2>
                  {isCard2Live && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent-bright/15 border border-accent-bright/35 text-accent-bright text-xs font-medium">
                      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent-bright shrink-0" />
                      <span>{isTeamAutoLive ? 'Live · Auto' : 'Live · Single'}</span>
                    </span>
                  )}
                </div>

                {isCard2Live && isTeamAutoLive && (
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-bg border border-border font-mono text-xs text-accent-bright max-w-full">
                    <span className="truncate">
                      {projectorState.auto_sport} · {projectorState.auto_interval_seconds}s ·{' '}
                      {runningAutoTeams.length}{' '}
                      {runningAutoTeams.length === 1 ? 'team' : 'teams'} ({teamAnimation})
                    </span>
                  </div>
                )}
                {isCard2Live && !isTeamAutoLive && liveTeam && (
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-bg border border-border font-mono text-xs text-accent-bright max-w-full">
                    <span className="truncate">
                      {liveTeam.name} ({liveTeam.short_code}) · {liveTeam.sport} ({teamAnimation})
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0 self-start sm:self-center">
              {isCard2Live && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={Stop}
                  disabled={isUpdating}
                  onClick={() => executeOrConfirm('Stop Stage', handleStopAuto)}
                  className="rounded-full"
                >
                  Stop
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={
                  isUpdating ||
                  (teamMode === 'single' && !selectedTeamId) ||
                  (teamMode === 'auto' && teamSportTeams.length === 0)
                }
                onClick={() =>
                  executeOrConfirm('Teams and Purses', performBroadcastTeams)
                }
                className="rounded-full px-4"
              >
                {isCard2Live ? 'Update Broadcast' : 'Broadcast Scene'}
              </Button>
            </div>
          </div>

          {/* Grouped Controls */}
          <div className="space-y-4">
            <div className="space-y-2">
              <span className={ADMIN_LABEL}>Sport</span>
              <PillRadioGroup
                options={sportSegmentedOptions}
                value={teamSport}
                onChange={(val) => setTeamSport(val)}
                ariaLabel="Teams and Purses Sport"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className={ADMIN_LABEL}>Mode</span>
                <PillRadioGroup
                  options={[
                    { value: 'auto', label: 'Auto slideshow' },
                    { value: 'single', label: 'Single team' }
                  ]}
                  value={teamMode}
                  onChange={(val) => setTeamMode(val as 'auto' | 'single')}
                  ariaLabel="Teams and Purses Mode"
                />
              </div>

              <div className="space-y-2">
                <span className={ADMIN_LABEL}>Animation</span>
                <PillRadioGroup
                  options={[
                    { value: 'fade', label: 'Fade' },
                    { value: 'slide', label: 'Slide' },
                    { value: 'zoom', label: 'Zoom' }
                  ]}
                  value={teamAnimation}
                  onChange={(val) => {
                    const anim = val as 'fade' | 'slide' | 'zoom'
                    setTeamAnimation(anim)
                    try {
                      if (typeof window !== 'undefined' && window.localStorage) {
                        window.localStorage.setItem('fieldr_projector_team_animation', anim)
                      }
                    } catch {
                      // Ignore storage write errors in private/restricted browsers
                    }
                  }}
                  ariaLabel="Teams and Purses Animation"
                />
              </div>
            </div>
          </div>

          {/* Mode-specific detail panel */}
          {teamMode === 'single' ? (
            <div className={`${ADMIN_WELL} p-4 sm:p-5 space-y-2.5`}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="projector-team-select" className={ADMIN_LABEL}>
                  Team
                </label>
                <span className="text-xs font-mono text-muted tabular-nums">
                  {teamSportTeams.length} in {teamSport}
                </span>
              </div>
              {teamSportTeams.length === 0 ? (
                <div className="text-xs text-muted py-1">
                  No teams registered for {teamSport} in this season.
                </div>
              ) : (
                <select
                  id="projector-team-select"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className={`${ADMIN_SELECT} w-full bg-surface`}
                >
                  {teamSportTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.short_code}) - {t.current_purse.toLocaleString()} PTS
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div
              className={`${ADMIN_WELL} p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
            >
              <div className="text-sm text-text">
                {teamSportTeams.length}{' '}
                {teamSportTeams.length === 1 ? 'team' : 'teams'} in {teamSport}
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <span className="text-xs font-mono text-muted">
                  Interval ({PROJECTOR_AUTO_INTERVAL.MIN}–{PROJECTOR_AUTO_INTERVAL.MAX} s)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Decrease seconds per team"
                    onClick={() => setTeamInterval((prev) => clampInterval(prev - 1))}
                    className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <Minus size={14} weight="regular" />
                  </button>
                  <span className="font-mono text-sm font-semibold w-10 text-center text-text tabular-nums">
                    {teamInterval}s
                  </span>
                  <button
                    type="button"
                    aria-label="Increase seconds per team"
                    onClick={() => setTeamInterval((prev) => clampInterval(prev + 1))}
                    className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text hover:bg-surface-2 transition-colors cursor-pointer"
                  >
                    <Plus size={14} weight="regular" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Module 3: Player Spotlight */}
        <section
          className={`bg-surface border rounded-3xl p-6 sm:p-8 space-y-6 transition-colors min-w-0 ${
            isCard3Live ? 'border-accent-bright' : 'border-border'
          }`}
        >
          <div className={ADMIN_CARD_HEADER}>
            <div className="flex items-start gap-3.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${
                  isCard3Live
                    ? 'bg-accent text-on-accent border-accent'
                    : 'bg-surface-2 text-muted border-border'
                }`}
              >
                <User size={20} weight="regular" />
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={ADMIN_CARD_TITLE}>Player Spotlight</h2>
                  {isCard3Live && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent-bright/15 border border-accent-bright/35 text-accent-bright text-xs font-medium">
                      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent-bright shrink-0" />
                      <span>{isPlayerAutoLive ? 'Live · Auto' : 'Live · Single'}</span>
                    </span>
                  )}
                </div>

                {isCard3Live && isPlayerAutoLive && (
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-bg border border-border font-mono text-xs text-accent-bright max-w-full">
                    <span className="truncate">
                      {projectorState.auto_sport} · {projectorState.auto_filter || 'all'} ·{' '}
                      {projectorState.auto_interval_seconds}s ({playerAnimation})
                    </span>
                  </div>
                )}
                {isCard3Live && !isPlayerAutoLive && livePlayer && (
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-bg border border-border font-mono text-xs text-accent-bright max-w-full">
                    <span className="truncate">
                      #{formatAthleteCode(livePlayer.athlete_code ?? livePlayer.player_code)}{' '}
                      {livePlayer.name} · {livePlayer.sport} ({playerAnimation})
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0 self-start sm:self-center">
              {isCard3Live && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={Stop}
                  disabled={isUpdating}
                  onClick={() => executeOrConfirm('Stop Stage', handleStopAuto)}
                  className="rounded-full"
                >
                  Stop
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={
                  isUpdating ||
                  (playerMode === 'single' && !matchedPlayer) ||
                  (playerMode === 'auto' && matchingFormAutoPlayers.length === 0)
                }
                onClick={() =>
                  executeOrConfirm('Player Spotlight', performBroadcastPlayer)
                }
                className="rounded-full px-4"
              >
                {isCard3Live ? 'Update Broadcast' : 'Broadcast Player'}
              </Button>
            </div>
          </div>

          {/* Grouped Controls */}
          <div className="space-y-4">
            <div className="space-y-2">
              <span className={ADMIN_LABEL}>Sport</span>
              <PillRadioGroup
                options={sportSegmentedOptions}
                value={playerSport}
                onChange={(val) => setPlayerSport(val)}
                ariaLabel="Player Spotlight Sport"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className={ADMIN_LABEL}>Mode</span>
                <PillRadioGroup
                  options={[
                    { value: 'auto', label: 'Auto slideshow' },
                    { value: 'single', label: 'Single player' }
                  ]}
                  value={playerMode}
                  onChange={(val) => setPlayerMode(val as 'auto' | 'single')}
                  ariaLabel="Player Spotlight Mode"
                />
              </div>

              <div className="space-y-2">
                <span className={ADMIN_LABEL}>Animation</span>
                <PillRadioGroup
                  options={[
                    { value: 'fade', label: 'Fade' },
                    { value: 'slide', label: 'Slide' },
                    { value: 'zoom', label: 'Zoom' }
                  ]}
                  value={playerAnimation}
                  onChange={(val) => {
                    const anim = val as 'fade' | 'slide' | 'zoom'
                    setPlayerAnimation(anim)
                    if (typeof window !== 'undefined' && window.localStorage) {
                      window.localStorage.setItem('fieldr_projector_player_animation', anim)
                    }
                  }}
                  ariaLabel="Player Spotlight Animation"
                />
              </div>
            </div>
          </div>

          {/* Mode-specific detail panel */}
          {playerMode === 'single' ? (
            <div className={`${ADMIN_WELL} p-4 sm:p-5 space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="projector-player-code-input" className={ADMIN_LABEL}>
                  Player ID
                </label>
                <span className="text-xs font-mono text-muted">Up to 6 digits</span>
              </div>

              <div className="relative">
                <MagnifyingGlass
                  size={16}
                  weight="regular"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <input
                  id="projector-player-code-input"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={playerCodeInput}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setPlayerCodeInput(digitsOnly)
                  }}
                  placeholder="Enter ID (e.g. 0001)"
                  className={`${ADMIN_INPUT} bg-surface pl-10 pr-9 font-mono`}
                />
                {isLookingUpPlayer && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Spinner size="sm" />
                  </div>
                )}
              </div>

              {/* Lookup Result Feedback */}
              {playerCodeInput.trim().length > 0 && !isLookingUpPlayer && lookupResult && (
                <div className="p-3.5 rounded-2xl bg-surface border border-border">
                  {matchedPlayer ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                          {matchedPlayer.photo_thumb_url || matchedPlayer.photo_url ? (
                            <img
                              src={matchedPlayer.photo_thumb_url || matchedPlayer.photo_url}
                              alt={matchedPlayer.name}
                              width={40}
                              height={40}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User size={18} weight="regular" className="text-muted" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-accent-bright">
                              #
                              {formatAthleteCode(
                                matchedPlayer.athlete_code ?? matchedPlayer.player_code
                              )}
                            </span>
                            <span className="font-syne font-bold text-sm text-text truncate">
                              {matchedPlayer.name}
                            </span>
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            {matchedPlayer.playing_role} ·{' '}
                            {getAcademicYearLabel(matchedPlayer.academic_year || '1st')}
                          </div>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full font-mono text-[11px] uppercase tracking-wider font-medium border ${
                          matchedPlayer.status === 'sold'
                            ? 'border-error/30 text-error bg-error/10'
                            : matchedPlayer.status === 'unsold'
                            ? 'border-border text-muted bg-surface-2'
                            : 'border-accent-bright/35 text-accent-bright bg-accent/10'
                        }`}
                      >
                        {(matchedPlayer.status || 'available').toUpperCase()}
                      </span>
                    </div>
                  ) : lookupResult.otherSports.length > 0 ? (
                    <div className="text-xs text-text flex items-center justify-between gap-3 flex-wrap">
                      <span>
                        {formattedLookupCode} is registered for {lookupResult.otherSports[0]}.
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPlayerSport(resolveSportName(lookupResult.otherSports[0]))
                        }
                        className="h-7 px-3 rounded-full bg-surface-2 border border-border text-xs font-medium text-accent-bright hover:border-accent-bright transition-colors cursor-pointer"
                      >
                        Switch to {lookupResult.otherSports[0]}
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted">
                      No player with code {formattedLookupCode} in {playerSport} this season.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className={`${ADMIN_WELL} p-4 sm:p-5 space-y-4`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <PillRadioGroup
                  options={AUTO_FILTER_OPTIONS}
                  value={playerAutoFilter}
                  onChange={(val) => setPlayerAutoFilter(val)}
                  ariaLabel="Player Auto Filter"
                />

                <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                  <span className="text-text font-semibold tabular-nums">
                    {matchingFormAutoPlayers.length}{' '}
                    {matchingFormAutoPlayers.length === 1 ? 'player' : 'players'}
                  </span>
                  {playerAutoDisabledReason && (
                    <span className="text-error">({playerAutoDisabledReason})</span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono text-muted">
                    Interval ({PROJECTOR_AUTO_INTERVAL.MIN}–{PROJECTOR_AUTO_INTERVAL.MAX} s)
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Decrease seconds per player"
                      onClick={() =>
                        setPlayerAutoInterval((prev) => clampInterval(prev - 1))
                      }
                      disabled={playerAutoInterval <= PROJECTOR_AUTO_INTERVAL.MIN}
                      className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text hover:bg-surface-2 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <Minus size={14} weight="regular" />
                    </button>
                    <span className="font-mono text-sm font-semibold w-10 text-center text-text tabular-nums">
                      {playerAutoInterval}s
                    </span>
                    <button
                      type="button"
                      aria-label="Increase seconds per player"
                      onClick={() =>
                        setPlayerAutoInterval((prev) => clampInterval(prev + 1))
                      }
                      disabled={playerAutoInterval >= PROJECTOR_AUTO_INTERVAL.MAX}
                      className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center text-text hover:bg-surface-2 disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      <Plus size={14} weight="regular" />
                    </button>
                  </div>
                </div>

                <div className={ADMIN_PILL_BAR_OUTER}>
                  <div className="inline-flex flex-nowrap items-center gap-1.5 w-max">
                    {PROJECTOR_AUTO_INTERVAL.CHIPS.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setPlayerAutoInterval(sec)}
                        className={`h-7 px-3 rounded-full font-mono text-xs border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          playerAutoInterval === sec
                            ? 'bg-btn-bg text-btn-fg border-transparent font-medium'
                            : 'bg-surface text-muted border-border hover:text-text'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Auction Stage Guard Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(pendingAction)}
        onClose={() => {
          if (!isUpdating) setPendingAction(null)
        }}
        title="Replace Active Auction Scene?"
        description={`An auction is on stage: ${auctionStagePlayerName}. Broadcasting "${
          pendingAction?.label || 'this scene'
        }" will replace the auction display on all connected projectors.`}
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isUpdating}
            onClick={() => setPendingAction(null)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            isLoading={isUpdating}
            disabled={isUpdating}
            onClick={async () => {
              if (!pendingAction) return
              const actionToRun = pendingAction.run
              setPendingAction(null)
              await actionToRun()
            }}
            className="rounded-full px-4"
          >
            Replace Stage
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
