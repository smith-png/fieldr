import { logError } from '../../lib/logger'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowsIn,
  ArrowsOut,
  Moon,
  Sun,
  User
} from '@phosphor-icons/react'
import { AnimatedCounter } from '../../components/home/AnimatedCounter'
import { BrandMark } from '../../components/layout/BrandMark'
import {
  ProjectorConfetti,
  normalizeConfettiFallSpeed
} from '../../components/projector/ProjectorConfetti'
import { SecuredSequence } from '../../components/projector/SecuredSequence'
import { formatAthleteCode } from '../../lib/data/client'
import {
  getAuctionSettings,
  getDefaultAuctionSettings,
  subscribeToAuctionSettings
} from '../../lib/data/auction'
import { getPlayers, subscribeToPlayers } from '../../lib/data/players'
import { getProjectorState, subscribeToProjector } from '../../lib/data/projector'
import { getSeasons } from '../../lib/data/seasons'
import { getConfettiFallSpeedSetting } from '../../lib/data/site'
import { getTeams, subscribeToTeams } from '../../lib/data/teams'
import { PROJECTOR_MODES } from '../../lib/constants'
import { getAcademicYearLabel } from '../../lib/academicYears'
import {
  getAutoSlideshowPlayers,
  getAutoSlideshowTeams,
  useAutoSlideshow
} from '../../hooks/useAutoSlideshow'
import { useProjectorTheme } from '../../hooks/useTheme'
import { getInitials } from '../../lib/utils'
import type {
  AuctionSettings,
  Player,
  ProjectorState,
  Season,
  Team
} from '../../types'

const PRELOAD_BATCH_CONCURRENCY = 4
const PRELOAD_RETRY_DELAY_MS = 1000
const MAX_DECODE_WAIT_MS = 2000
const MAX_PROJECTOR_IMAGE_CACHE = 40
const MAX_BACKGROUND_THUMB_PRELOADS = 28

// Module-level LRU Map keeping up to 40 HTMLImageElement instances alive
const projectorImageCache = new Map<string, HTMLImageElement>()
const projectorImageDecoded = new Set<string>()
const projectorImageInFlight = new Map<string, Promise<boolean>>()
const projectorImageQueued = new Set<string>()
const projectorLoadQueue: string[] = []
let activePreloadWorkers = 0
let preloadSessionId = 0
const pendingRetryTimers = new Map<ReturnType<typeof setTimeout>, () => void>()
const imageStatusListeners = new Set<(url: string, loaded: boolean) => void>()

function touchProjectorImageCache(url: string, img?: HTMLImageElement): void {
  const existing = img ?? projectorImageCache.get(url)
  if (!existing) return
  if (projectorImageCache.has(url)) {
    projectorImageCache.delete(url)
  }
  projectorImageCache.set(url, existing)
  projectorImageDecoded.add(url)
  while (projectorImageCache.size > MAX_PROJECTOR_IMAGE_CACHE) {
    const oldestKey = projectorImageCache.keys().next().value
    if (oldestKey === undefined) break
    projectorImageCache.delete(oldestKey)
    projectorImageDecoded.delete(oldestKey)
  }
}

function cancelPendingProjectorPreloads(): void {
  preloadSessionId += 1
  projectorLoadQueue.length = 0
  projectorImageQueued.clear()
  pendingRetryTimers.forEach((cancelResolve, timerId) => {
    clearTimeout(timerId)
    cancelResolve()
  })
  pendingRetryTimers.clear()
}

function notifyImageStatus(url: string, loaded: boolean): void {
  imageStatusListeners.forEach((listener) => {
    try {
      listener(url, loaded)
    } catch {
      // ignore listener errors
    }
  })
}

function getPlayerPrimaryPhotoUrl(player?: Player | null): string | null {
  if (!player) return null
  const raw = (player.photo_url || player.photo_thumb_url || '').trim()
  return raw.length > 0 ? raw : null
}

function getPlayerThumbPhotoUrl(player?: Player | null): string | null {
  if (!player) return null
  const raw = (player.photo_thumb_url || '').trim()
  return raw.length > 0 ? raw : null
}

function loadAndDecodeImageOnce(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.referrerPolicy = 'no-referrer'
    img.decoding = 'async'

    img.onload = () => {
      if (typeof img.decode === 'function') {
        img
          .decode()
          .catch(() => {
            // Even if decode() rejects on some browsers, onload succeeded
          })
          .finally(() => resolve(img))
      } else {
        resolve(img)
      }
    }

    img.onerror = () => {
      reject(new Error('Image load failed'))
    }

    img.src = url
  })
}

function waitForRetryOrCancel(session: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (session !== preloadSessionId) {
      resolve(false)
      return
    }
    const timerId = setTimeout(() => {
      pendingRetryTimers.delete(timerId)
      resolve(session === preloadSessionId)
    }, PRELOAD_RETRY_DELAY_MS)
    pendingRetryTimers.set(timerId, () => resolve(false))
  })
}

function preloadAndDecodeUrl(url: string): Promise<boolean> {
  const cleanUrl = url.trim()
  if (!cleanUrl) return Promise.resolve(false)

  if (projectorImageDecoded.has(cleanUrl) && projectorImageCache.has(cleanUrl)) {
    touchProjectorImageCache(cleanUrl)
    return Promise.resolve(true)
  }

  const existing = projectorImageInFlight.get(cleanUrl)
  if (existing) {
    return existing
  }

  const session = preloadSessionId

  const promise = (async (): Promise<boolean> => {
    try {
      const img = await loadAndDecodeImageOnce(cleanUrl)
      if (session !== preloadSessionId) return false
      touchProjectorImageCache(cleanUrl, img)
      notifyImageStatus(cleanUrl, true)
      return true
    } catch {
      const shouldRetry = await waitForRetryOrCancel(session)
      if (!shouldRetry || session !== preloadSessionId) return false
      try {
        const retriedImg = await loadAndDecodeImageOnce(cleanUrl)
        if (session !== preloadSessionId) return false
        touchProjectorImageCache(cleanUrl, retriedImg)
        notifyImageStatus(cleanUrl, true)
        return true
      } catch {
        if (session === preloadSessionId) {
          notifyImageStatus(cleanUrl, false)
        }
        return false
      }
    } finally {
      projectorImageInFlight.delete(cleanUrl)
    }
  })()

  projectorImageInFlight.set(cleanUrl, promise)
  return promise
}

function pumpPreloadQueue(): void {
  const session = preloadSessionId
  while (
    activePreloadWorkers < PRELOAD_BATCH_CONCURRENCY &&
    projectorLoadQueue.length > 0
  ) {
    const nextUrl = projectorLoadQueue.shift()
    if (!nextUrl) continue
    projectorImageQueued.delete(nextUrl)

    if (projectorImageDecoded.has(nextUrl) || projectorImageInFlight.has(nextUrl)) {
      continue
    }

    activePreloadWorkers++
    void preloadAndDecodeUrl(nextUrl).finally(() => {
      activePreloadWorkers--
      if (session === preloadSessionId) {
        pumpPreloadQueue()
      }
    })
  }
}

function enqueuePlayerThumbnailsForPreload(players: readonly Player[]): void {
  let queuedCount = 0
  for (const player of players) {
    if (queuedCount >= MAX_BACKGROUND_THUMB_PRELOADS) break
    const thumbUrl = getPlayerThumbPhotoUrl(player)
    if (
      thumbUrl &&
      !projectorImageDecoded.has(thumbUrl) &&
      !projectorImageInFlight.has(thumbUrl) &&
      !projectorImageQueued.has(thumbUrl)
    ) {
      projectorImageQueued.add(thumbUrl)
      projectorLoadQueue.push(thumbUrl)
      queuedCount++
    }
  }
  pumpPreloadQueue()
}

function preloadPriorityPlayerUrls(players: readonly (Player | null | undefined)[]): void {
  for (const player of players) {
    const url = getPlayerPrimaryPhotoUrl(player)
    if (url) {
      if (projectorImageDecoded.has(url) && projectorImageCache.has(url)) {
        touchProjectorImageCache(url)
      } else {
        void preloadAndDecodeUrl(url)
      }
    }
  }
}

/**
 * Waits up to 2 seconds for a player's photo to load and decode before switching
 * the displayed player card. If already decoded or no photo exists, switches immediately.
 */
function useDecodedPlayerGate(targetPlayer: Player | null | undefined): Player | null {
  const [readyPlayer, setReadyPlayer] = useState<Player | null>(() => targetPlayer ?? null)

  useEffect(() => {
    if (!targetPlayer) {
      setReadyPlayer(null)
      return
    }

    const url = getPlayerPrimaryPhotoUrl(targetPlayer)
    if (!url || projectorImageDecoded.has(url)) {
      setReadyPlayer(targetPlayer)
      return
    }

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      setReadyPlayer(targetPlayer)
    }

    const timeoutId = setTimeout(finish, MAX_DECODE_WAIT_MS)
    void preloadAndDecodeUrl(url).then(() => {
      clearTimeout(timeoutId)
      finish()
    })

    return () => {
      settled = true
      clearTimeout(timeoutId)
    }
  }, [targetPlayer])

  if (!targetPlayer) return null
  const url = getPlayerPrimaryPhotoUrl(targetPlayer)
  if (!url || projectorImageDecoded.has(url)) {
    return targetPlayer
  }
  return readyPlayer ?? targetPlayer
}

const ProjectorStagePhoto: React.FC<{
  url?: string | null
  name: string
  priority?: boolean
  fallbackVariant?: 'spotlight' | 'stage' | 'unsold'
}> = ({ url, name, priority = true, fallbackVariant = 'spotlight' }) => {
  const cleanUrl = (url || '').trim()
  const [isLoaded, setIsLoaded] = useState<boolean>(() =>
    cleanUrl ? projectorImageDecoded.has(cleanUrl) : false
  )
  const [hasFailed, setHasFailed] = useState<boolean>(false)
  const [retryTick, setRetryTick] = useState<number>(0)
  const retriedRef = useRef<boolean>(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    retriedRef.current = false
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    if (!cleanUrl) {
      setIsLoaded(false)
      setHasFailed(false)
      return
    }

    if (projectorImageDecoded.has(cleanUrl)) {
      setIsLoaded(true)
      setHasFailed(false)
      return
    }

    setIsLoaded(false)
    setHasFailed(false)
    void preloadAndDecodeUrl(cleanUrl)

    const handleStatus = (updatedUrl: string, ok: boolean) => {
      if (updatedUrl === cleanUrl && ok) {
        setIsLoaded(true)
        setHasFailed(false)
      }
    }
    imageStatusListeners.add(handleStatus)
    return () => {
      imageStatusListeners.delete(handleStatus)
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [cleanUrl])

  const handleImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const imgEl = e.currentTarget
    if (cleanUrl) {
      touchProjectorImageCache(cleanUrl, imgEl)
    }
    setIsLoaded(true)
    setHasFailed(false)
  }

  const handleImgError = () => {
    if (!retriedRef.current && cleanUrl) {
      retriedRef.current = true
      retryTimerRef.current = setTimeout(() => {
        setRetryTick((t) => t + 1)
      }, PRELOAD_RETRY_DELAY_MS)
      return
    }
    setHasFailed(true)
  }

  const initials = getInitials(name)

  return (
    <>
      {(!cleanUrl || !isLoaded || hasFailed) && (
        <div className="flex flex-col items-center justify-center text-muted select-none">
          {initials ? (
            <span
              aria-hidden="true"
              className="font-syne font-extrabold text-5xl sm:text-6xl text-muted tracking-tight uppercase"
            >
              {initials}
            </span>
          ) : (
            <User
              size={fallbackVariant === 'unsold' ? 80 : 96}
              weight="regular"
              className="text-muted"
            />
          )}
        </div>
      )}

      {cleanUrl && !hasFailed && (
        <img
          key={`${cleanUrl}-${retryTick}`}
          src={cleanUrl}
          alt={name}
          width={320}
          height={384}
          referrerPolicy="no-referrer"
          loading="eager"
          fetchPriority={priority ? 'high' : 'auto'}
          decoding="async"
          onLoad={handleImgLoad}
          onError={handleImgError}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
          }`}
        />
      )}
    </>
  )
}

/**
 * Merges public_teams (name, short_code, color, logo_url, sport, owner_display_name)
 * with teams (starting_purse, current_purse).
 */
/**
 * Quick count-up and vertical flip/settle for live bid changes in AUCTION mode,
 * driven by bid_update_ms from auction_settings.
 */
const AuctionBidNumber: React.FC<{
  value: number
  durationMs: number
  reduceMotion: boolean
  accentColor?: string | null
}> = ({ value, durationMs, reduceMotion, accentColor }) => {
  const [displayValue, setDisplayValue] = useState(value)
  const prevValueRef = useRef(value)

  useEffect(() => {
    if (reduceMotion) {
      setDisplayValue(value)
      prevValueRef.current = value
      return
    }

    const startValue = prevValueRef.current
    const endValue = value
    prevValueRef.current = value

    if (startValue === endValue) {
      setDisplayValue(endValue)
      return
    }

    const safeDuration = Math.min(2000, Math.max(100, Number(durationMs) || 600))
    const startTime = performance.now()
    let rafId = 0

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / safeDuration, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = Math.round(startValue + (endValue - startValue) * easeOut)
      setDisplayValue(current)
      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [value, durationMs, reduceMotion])

  const settleDurationSec = Math.min(2, Math.max(0.1, (Number(durationMs) || 600) / 1000)) * 0.55

  return (
    <motion.span
      key={value}
      initial={reduceMotion ? { opacity: 0.9 } : { opacity: 0.72, y: 16, scale: 1.05 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: settleDurationSec, ease: [0.16, 1, 0.3, 1] }}
      className="inline-block font-syne font-extrabold text-7xl sm:text-8xl md:text-9xl xl:text-[9.5rem] leading-none tracking-tight tabular-nums"
      style={{ color: accentColor || 'var(--points)' }}
    >
      {displayValue.toLocaleString()}
    </motion.span>
  )
}

const PlayerSpotlightSceneContent: React.FC<{
  player: Player
  shouldReduceMotion: boolean
  isAutoSlide?: boolean
}> = ({ player, shouldReduceMotion, isAutoSlide = false }) => {
  return (
    <>
      {/* High-Contrast Large Portrait */}
      <motion.div
        initial={shouldReduceMotion || isAutoSlide ? false : { scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="w-64 h-80 sm:w-80 sm:h-96 md:w-96 md:h-[460px] rounded-[32px] bg-surface border border-border overflow-hidden shrink-0 flex items-center justify-center relative"
      >
        <ProjectorStagePhoto
          url={player.photo_url || player.photo_thumb_url}
          name={player.name}
          priority={true}
          fallbackVariant="spotlight"
        />

        {/* Status Indicator */}
        <div className="absolute top-4 right-4">
          <span
            className={`inline-flex items-center px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold border bg-surface/95 ${
              player.status === 'sold'
                ? 'border-error/40 text-error'
                : player.status === 'unsold'
                ? 'border-border text-muted'
                : 'border-accent-bright/40 text-accent-bright'
            }`}
          >
            {player.status === 'sold'
              ? 'Sold'
              : player.status === 'unsold'
              ? 'Unsold'
              : 'Available'}
          </span>
        </div>
      </motion.div>

      {/* Player Credentials & Stats */}
      <div className="flex flex-col gap-6 text-left max-w-2xl min-w-0">
        <div>
          {/* Code & Sport Pills */}
          <div className="flex items-center gap-2.5 flex-wrap mb-4">
            <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-surface-2 border border-border font-mono text-sm md:text-base font-semibold text-accent-bright tabular-nums">
              #{formatAthleteCode(player.player_code || player.athlete_code)}
            </span>
            <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-surface-2 border border-border text-sm md:text-base font-medium text-text">
              {player.sport}
            </span>
          </div>

          {/* Huge Name Display */}
          <h2
            className="font-syne font-extrabold text-5xl sm:text-7xl md:text-8xl text-text tracking-tight leading-[0.96] break-words"
            style={{ textWrap: 'balance' }}
          >
            {player.name}
          </h2>

          {/* Large Role Label directly under player name */}
          <div className="font-syne font-bold text-2xl sm:text-4xl md:text-5xl text-text tracking-tight mt-3 sm:mt-4">
            {player.playing_role}
          </div>
        </div>

        {/* Key Figures Wells */}
        <div className="flex flex-wrap items-stretch gap-3 sm:gap-4">
          <div className="rounded-[24px] bg-surface-2 px-5 py-3.5 sm:px-6 sm:py-4 min-w-[160px]">
            <span className="text-xs sm:text-sm font-medium text-muted block">
              Base points
            </span>
            <span className="font-mono font-bold text-xl sm:text-2xl text-points tabular-nums mt-0.5 block">
              {player.base_points.toLocaleString()} PTS
            </span>
          </div>

          <div className="rounded-[24px] bg-surface-2 px-5 py-3.5 sm:px-6 sm:py-4 min-w-[160px]">
            <span className="text-xs sm:text-sm font-medium text-muted block">
              Year
            </span>
            <span className="font-syne font-bold text-xl sm:text-2xl text-text mt-0.5 block">
              {getAcademicYearLabel(player.academic_year || '1st')}
            </span>
          </div>

          {player.roll_no && (
            <div className="rounded-[24px] bg-surface-2 px-5 py-3.5 sm:px-6 sm:py-4 min-w-[140px]">
              <span className="text-xs sm:text-sm font-medium text-muted block">
                Roll no
              </span>
              <span className="font-mono font-bold text-xl sm:text-2xl text-text tabular-nums mt-0.5 block">
                {player.roll_no}
              </span>
            </div>
          )}
        </div>

        {player.notes && (
          <div className="px-6 py-4 rounded-[24px] bg-surface border border-border text-base text-text leading-relaxed">
            {player.notes}
          </div>
        )}
      </div>
    </>
  )
}

const TeamsAndPursesSceneContent: React.FC<{
  team: Team
  rosterPlayers: Player[]
}> = ({ team, rosterPlayers }) => {
  const count = rosterPlayers.length
  const teamAccent = team.color || 'var(--accent-bright)'

  // Dynamic layout & sizing scaling so it fits on one screen without scrolling
  const isCompactHeader = count > 10
  const gridClass =
    count <= 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'
      : count <= 8
      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3'
      : count <= 14
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5'
      : count <= 20
      ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2'
      : 'grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-1.5'

  const cardPadding =
    count <= 4
      ? 'p-3.5 sm:p-4'
      : count <= 8
      ? 'p-2.5 sm:p-3'
      : count <= 14
      ? 'p-2 sm:p-2.5'
      : 'p-1.5 sm:p-2'

  const thumbSize =
    count <= 4
      ? 'w-14 h-14'
      : count <= 8
      ? 'w-11 h-11'
      : count <= 14
      ? 'w-9 h-9'
      : 'w-7 h-7 sm:w-8 sm:h-8'

  const iconSize = count <= 4 ? 24 : count <= 8 ? 20 : count <= 14 ? 16 : 14
  const nameSize =
    count <= 4
      ? 'text-base sm:text-lg'
      : count <= 8
      ? 'text-sm sm:text-base'
      : count <= 14
      ? 'text-xs sm:text-sm'
      : 'text-[11px] sm:text-xs'

  const rolePillClass =
    count <= 4
      ? 'px-2.5 py-0.5 text-xs'
      : count <= 8
      ? 'px-2 py-0.5 text-[11px]'
      : count <= 14
      ? 'px-2 py-px text-[10px]'
      : 'px-1.5 py-px text-[10px]'

  const priceSize =
    count <= 4
      ? 'text-xs sm:text-sm'
      : count <= 8
      ? 'text-xs'
      : count <= 14
      ? 'text-[11px]'
      : 'text-[10px]'

  return (
    <div className="flex flex-col justify-between w-full h-full max-h-[calc(100vh-140px)] overflow-hidden gap-5">
      {/* Franchise Header Card */}
      <div
        className={`rounded-[32px] bg-surface border-[1.5px] flex flex-col md:flex-row md:items-center justify-between gap-5 transition-colors shrink-0 ${
          isCompactHeader ? 'p-4 sm:p-5' : 'p-6 sm:p-7'
        }`}
        style={{
          borderColor: `color-mix(in srgb, ${teamAccent} 40%, transparent)`
        }}
      >
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <div
            className={`rounded-[28%] flex items-center justify-center font-syne font-extrabold text-white overflow-hidden shrink-0 ${
              isCompactHeader
                ? 'w-16 h-16 text-xl'
                : 'w-20 h-20 sm:w-24 sm:h-24 text-2xl sm:text-3xl'
            }`}
            style={{ backgroundColor: teamAccent }}
          >
            {team.logo_url ? (
              <img
                src={team.logo_url}
                alt={team.name}
                width={96}
                height={96}
                decoding="async"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{team.short_code}</span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2
                className={`font-syne font-bold text-text tracking-tight truncate ${
                  isCompactHeader
                    ? 'text-2xl sm:text-3xl lg:text-4xl'
                    : 'text-3xl sm:text-4xl lg:text-5xl'
                }`}
              >
                {team.name}
              </h2>
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-surface-2 border border-border font-mono text-xs sm:text-sm font-semibold text-muted tracking-wider shrink-0">
                {team.short_code}
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-3 flex-wrap">
              <span
                className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs sm:text-sm font-medium text-text shrink-0"
                style={{
                  backgroundColor: `color-mix(in srgb, ${teamAccent} 14%, var(--surface-2))`
                }}
              >
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: teamAccent }}
                />
                <span>{team.sport}</span>
              </span>
              {team.owner_display_name && (
                <span className="text-sm sm:text-base font-medium text-muted truncate">
                  {team.owner_display_name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Remaining Purse Inset Well */}
        <div
          className={`rounded-[24px] bg-surface-2 text-left md:text-right shrink-0 ${
            isCompactHeader ? 'px-5 py-3' : 'px-6 py-4 sm:px-7 sm:py-4'
          }`}
        >
          <span className="text-xs sm:text-sm font-medium text-muted block">
            Remaining purse
          </span>
          <div
            className={`font-mono font-bold text-points tabular-nums mt-0.5 flex items-baseline md:justify-end gap-1.5 ${
              isCompactHeader
                ? 'text-2xl sm:text-3xl lg:text-4xl'
                : 'text-3xl sm:text-4xl lg:text-5xl'
            }`}
          >
            <AnimatedCounter value={team.current_purse} />
            <span className="text-sm sm:text-base font-mono font-semibold">PTS</span>
          </div>
        </div>
      </div>

      {/* Squad Section */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center gap-2.5 mb-3 shrink-0">
          <span className="font-syne font-bold text-base sm:text-lg text-text tracking-tight">
            Squad
          </span>
          <span className="inline-flex items-center justify-center min-w-[30px] h-7 px-3 rounded-full bg-surface-2 border border-border text-xs sm:text-sm font-mono font-semibold tabular-nums text-muted">
            {rosterPlayers.length}
          </span>
        </div>

        {rosterPlayers.length === 0 ? (
          <div className="py-16 px-6 text-center text-base sm:text-lg font-medium text-muted rounded-[24px] bg-surface-2 my-auto">
            No players yet.
          </div>
        ) : (
          <div className={`grid ${gridClass} overflow-hidden my-auto w-full`}>
            {rosterPlayers.map((player) => (
              <div
                key={player.id}
                className={`${cardPadding} rounded-2xl bg-surface border border-border flex items-center gap-2.5 sm:gap-3 min-w-0`}
              >
                <div
                  className={`${thumbSize} rounded-xl bg-surface-2 overflow-hidden shrink-0 flex items-center justify-center`}
                >
                  {player.photo_thumb_url || player.photo_url ? (
                    <img
                      src={player.photo_thumb_url || player.photo_url}
                      alt={player.name}
                      width={56}
                      height={56}
                      decoding="async"
                      referrerPolicy="no-referrer"
                      loading="eager"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User size={iconSize} weight="regular" className="text-muted" />
                  )}
                </div>
                <div className="min-w-0 flex-1 flex flex-col items-start gap-1">
                  <h4 className={`font-syne font-bold text-text truncate w-full leading-tight ${nameSize}`}>
                    {player.name}
                  </h4>
                  <span
                    className={`inline-flex items-center max-w-full rounded-full bg-surface-2 text-muted font-medium truncate ${rolePillClass}`}
                  >
                    {player.playing_role}
                  </span>
                  <div className={`font-mono text-points tabular-nums font-semibold truncate w-full ${priceSize}`}>
                    {player.purchase_price
                      ? `${player.purchase_price.toLocaleString()} PTS`
                      : player.base_points
                      ? `${player.base_points.toLocaleString()} PTS`
                      : '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const ProjectorPage: React.FC = () => {
  const { projectorTheme, toggleProjectorTheme } = useProjectorTheme()
  const shouldReduceMotion = Boolean(useReducedMotion())

  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [projectorState, setProjectorState] = useState<ProjectorState>({
    season_id: '',
    mode: 'idle',
    player_id: null,
    team_id: null,
    current_bid: null,
    sale_event_id: null,
    sale_player_id: null,
    sale_team_id: null,
    sale_price: null,
    sale_at: null,
    broadcast_message: null,
    confetti_at: null,
    updated_at: new Date().toISOString()
  })
  const [auctionSettings, setAuctionSettings] = useState<AuctionSettings>(() =>
    getDefaultAuctionSettings('')
  )
  const auctionSettingsRef = useRef<AuctionSettings>(auctionSettings)
  useEffect(() => {
    auctionSettingsRef.current = auctionSettings
  }, [auctionSettings])

  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auction bid/team change flash tracking
  const prevAuctionSnapRef = useRef<{
    playerId: string | null
    bid: number | null
    teamId: string | null
  }>({
    playerId: null,
    bid: null,
    teamId: null
  })
  const [bidFlashKey, setBidFlashKey] = useState(0)

  // Confetti tracking (remember first confetti_at seen on load and only play when it changes afterwards)
  const hasSeenInitialConfettiRef = useRef(false)
  const lastSeenConfettiAtRef = useRef<string | null>(null)
  const lastKnownConfettiSpeedRef = useRef<number | null>(null)
  const [confettiTriggerCount, setConfettiTriggerCount] = useState(0)
  const [confettiFallSpeed, setConfettiFallSpeed] = useState<number>(5)

  const readConfettiFallSpeedOnce = useCallback(async (): Promise<number> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    try {
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), 3000)
      })
      const rawSpeed = await Promise.race([
        getConfettiFallSpeedSetting().catch(() => null),
        timeoutPromise
      ])
      if (rawSpeed !== null) {
        const normalized = normalizeConfettiFallSpeed(rawSpeed)
        lastKnownConfettiSpeedRef.current = normalized
        return normalized
      }
      return lastKnownConfettiSpeedRef.current ?? 5
    } catch {
      return lastKnownConfettiSpeedRef.current ?? 5
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  // Secured animation tracking (play once per sale_event_id)
  const hasLoadedInitialStateRef = useRef(false)
  const lastSeenSaleEventIdRef = useRef<string | null>(null)
  const [activeSecuredSaleId, setActiveSecuredSaleId] = useState<string | null>(null)

  const handleIncomingProjectorState = useCallback(
    (nextState: ProjectorState, settingsOverride?: AuctionSettings) => {
      setProjectorState(nextState)

      if (nextState.season_id) {
        const incomingConfettiAt = nextState.confetti_at ?? null
        if (!hasSeenInitialConfettiRef.current) {
          hasSeenInitialConfettiRef.current = true
          lastSeenConfettiAtRef.current = incomingConfettiAt
        } else if (
          incomingConfettiAt &&
          incomingConfettiAt !== lastSeenConfettiAtRef.current
        ) {
          lastSeenConfettiAtRef.current = incomingConfettiAt
          void readConfettiFallSpeedOnce().then((speed) => {
            if (!isMountedRef.current) return
            setConfettiFallSpeed(speed)
            setConfettiTriggerCount((c) => c + 1)
          })
        } else if (!incomingConfettiAt) {
          lastSeenConfettiAtRef.current = null
        }
      }

      const currentSettings = settingsOverride || auctionSettingsRef.current
      const effectiveSaleEventId =
        nextState.sale_event_id ||
        (nextState.mode === 'sold' && nextState.sale_at
          ? `${nextState.sale_player_id || nextState.player_id || 'p'}-${nextState.sale_at}`
          : null)

      if (!hasLoadedInitialStateRef.current) {
        hasLoadedInitialStateRef.current = true
        if (effectiveSaleEventId) {
          lastSeenSaleEventIdRef.current = effectiveSaleEventId
          if (!currentSettings.secured_enabled) {
            setActiveSecuredSaleId(null)
            return
          }
          const catchupWindowMs = Math.max(0, Number(currentSettings.catchup_window_seconds ?? 15)) * 1000
          const saleAtMs = nextState.sale_at ? new Date(nextState.sale_at).getTime() : 0
          const ageMs = saleAtMs > 0 ? Date.now() - saleAtMs : Infinity
          if (nextState.mode === 'sold' && ageMs >= -5000 && ageMs <= catchupWindowMs) {
            setActiveSecuredSaleId(effectiveSaleEventId)
          } else {
            setActiveSecuredSaleId(null)
          }
        }
        return
      }

      if (effectiveSaleEventId && effectiveSaleEventId !== lastSeenSaleEventIdRef.current) {
        lastSeenSaleEventIdRef.current = effectiveSaleEventId
        if (nextState.mode === 'sold' && currentSettings.secured_enabled) {
          setActiveSecuredSaleId(effectiveSaleEventId)
        } else {
          setActiveSecuredSaleId(null)
        }
        return
      }

      if (nextState.mode !== 'sold' || !currentSettings.secured_enabled) {
        setActiveSecuredSaleId(null)
      }
    },
    []
  )

  // If secured_enabled is toggled off in realtime while playing, immediately settle to static SOLD card
  useEffect(() => {
    if (!auctionSettings.secured_enabled && activeSecuredSaleId) {
      setActiveSecuredSaleId(null)
    }
  }, [auctionSettings.secured_enabled, activeSecuredSaleId])

  // Settle SECURED animation into static SOLD card after secured_duration_seconds
  useEffect(() => {
    if (!activeSecuredSaleId) return
    const durationMs = Math.round(
      Math.min(15, Math.max(2, Number(auctionSettings.secured_duration_seconds) || 5.6)) * 1000
    )
    const timer = setTimeout(() => {
      setActiveSecuredSaleId(null)
    }, durationMs)
    return () => clearTimeout(timer)
  }, [activeSecuredSaleId, auctionSettings.secured_duration_seconds])

  // Detect bid or leading team change during live auction to trigger team colour flash
  useEffect(() => {
    if (projectorState.mode !== 'auction') {
      prevAuctionSnapRef.current = {
        playerId: null,
        bid: null,
        teamId: null
      }
      return
    }

    const currentPlayerId = projectorState.player_id ?? null
    const currentBid = projectorState.current_bid ?? null
    const currentTeamId = projectorState.team_id ?? null
    const prev = prevAuctionSnapRef.current

    if (
      prev.playerId === currentPlayerId &&
      currentPlayerId !== null &&
      currentTeamId !== null &&
      (prev.bid !== currentBid || prev.teamId !== currentTeamId)
    ) {
      setBidFlashKey((k) => k + 1)
    }

    prevAuctionSnapRef.current = {
      playerId: currentPlayerId,
      bid: currentBid,
      teamId: currentTeamId
    }
  }, [
    projectorState.mode,
    projectorState.player_id,
    projectorState.current_bid,
    projectorState.team_id
  ])

  // Controls hidden by default; appear on tap or mouse movement and fade out after 3 seconds
  useEffect(() => {
    const revealControls = () => {
      setShowControls(true)
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }

    window.addEventListener('mousemove', revealControls)
    window.addEventListener('mousedown', revealControls)
    window.addEventListener('touchstart', revealControls, { passive: true })
    window.addEventListener('keydown', revealControls)

    return () => {
      window.removeEventListener('mousemove', revealControls)
      window.removeEventListener('mousedown', revealControls)
      window.removeEventListener('touchstart', revealControls)
      window.removeEventListener('keydown', revealControls)
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    }
  }, [])

  const isMountedRef = useRef(true)
  const activeSeasonIdRef = useRef<string | null>(null)
  const subscribedSeasonIdRef = useRef<string | null>(null)
  const channelUnsubsRef = useRef<Array<() => void>>([])
  const handleIncomingProjectorStateRef = useRef(handleIncomingProjectorState)
  handleIncomingProjectorStateRef.current = handleIncomingProjectorState

  const teardownSeasonChannels = useCallback(() => {
    const unsubs = channelUnsubsRef.current
    channelUnsubsRef.current = []
    subscribedSeasonIdRef.current = null
    for (const unsub of unsubs) {
      try {
        unsub()
      } catch {
        // ignore cleanup error
      }
    }
  }, [])

  const subscribeSeasonChannels = useCallback(
    (seasonId: string) => {
      if (!seasonId || !isMountedRef.current) return
      if (subscribedSeasonIdRef.current === seasonId) return

      teardownSeasonChannels()
      subscribedSeasonIdRef.current = seasonId

      const unsubProjector = subscribeToProjector(seasonId, (newState) => {
        if (isMountedRef.current && activeSeasonIdRef.current === seasonId) {
          handleIncomingProjectorStateRef.current(newState)
        }
      })

      const unsubSettings = subscribeToAuctionSettings(seasonId, (newSettings) => {
        if (isMountedRef.current && activeSeasonIdRef.current === seasonId) {
          setAuctionSettings(newSettings)
          auctionSettingsRef.current = newSettings
        }
      })

      const unsubTeams = subscribeToTeams(seasonId, (newFullTeams) => {
        if (isMountedRef.current && activeSeasonIdRef.current === seasonId) {
          setTeams(newFullTeams)
        }
      })

      const unsubPlayers = subscribeToPlayers(seasonId, (newPlayers) => {
        if (isMountedRef.current && activeSeasonIdRef.current === seasonId) {
          setPlayers(newPlayers)
        }
      })

      channelUnsubsRef.current = [unsubProjector, unsubSettings, unsubTeams, unsubPlayers]
    },
    [teardownSeasonChannels]
  )

  // Helper to fetch all projector data for a season without repeating getSeasons or public_teams
  const refetchSeasonData = useCallback(
    async (seasonId: string, options?: { checkSeasonChange?: boolean }) => {
      if (!seasonId) return
      try {
        let targetSeasonId = seasonId
        if (options?.checkSeasonChange) {
          const seasonsList = await getSeasons().catch(() => [])
          if (!isMountedRef.current) return
          const active = seasonsList.find((s) => s.is_active) || seasonsList[0] || null
          if (active) {
            setActiveSeason(active)
            if (active.id !== activeSeasonIdRef.current) {
              activeSeasonIdRef.current = active.id
              targetSeasonId = active.id
              subscribeSeasonChannels(active.id)
            }
          }
        }

        const [latestPState, latestSettings, fullTeams, latestPlayers] = await Promise.all([
          getProjectorState(targetSeasonId),
          getAuctionSettings(targetSeasonId),
          getTeams(targetSeasonId).catch(() => []),
          getPlayers(targetSeasonId)
        ])

        if (!isMountedRef.current || activeSeasonIdRef.current !== targetSeasonId) return

        setAuctionSettings(latestSettings)
        auctionSettingsRef.current = latestSettings
        setTeams(fullTeams)
        setPlayers(latestPlayers)
        handleIncomingProjectorStateRef.current(latestPState, latestSettings)
      } catch (err) {
        logError('Projector refetchSeasonData error:', err)
      }
    },
    [subscribeSeasonChannels]
  )

  const switchActiveSeason = useCallback(
    async (nextSeason: Season | null) => {
      if (!isMountedRef.current) return
      const prevSeasonId = activeSeasonIdRef.current
      activeSeasonIdRef.current = nextSeason?.id ?? null
      setActiveSeason(nextSeason)

      if (!nextSeason) {
        teardownSeasonChannels()
        return
      }

      if (prevSeasonId !== nextSeason.id) {
        await refetchSeasonData(nextSeason.id)
        if (!isMountedRef.current || activeSeasonIdRef.current !== nextSeason.id) return
        subscribeSeasonChannels(nextSeason.id)
      }
    },
    [refetchSeasonData, subscribeSeasonChannels, teardownSeasonChannels]
  )

  const switchActiveSeasonRef = useRef(switchActiveSeason)
  switchActiveSeasonRef.current = switchActiveSeason

  // Initial load and realtime subscriptions — runs strictly once per mount
  useEffect(() => {
    isMountedRef.current = true

    async function init() {
      void readConfettiFallSpeedOnce().then((speed) => {
        if (isMountedRef.current) {
          setConfettiFallSpeed(speed)
        }
      })

      try {
        const seasonsList = await getSeasons()
        const active = seasonsList.find((s) => s.is_active) || seasonsList[0] || null
        if (!isMountedRef.current) return
        activeSeasonIdRef.current = active?.id ?? null
        setActiveSeason(active)

        if (active) {
          await refetchSeasonData(active.id)
          if (!isMountedRef.current || activeSeasonIdRef.current !== active.id) return
          subscribeSeasonChannels(active.id)
        }
      } catch (err) {
        logError('Projector init error:', err)
      }
    }

    void init()

    return () => {
      isMountedRef.current = false
      teardownSeasonChannels()
    }
  }, [readConfettiFallSpeedOnce, refetchSeasonData, subscribeSeasonChannels, teardownSeasonChannels])

  // Refetch when tab becomes visible or browser comes back online
  useEffect(() => {
    const handleVisibilityChange = () => {
      const seasonId = activeSeasonIdRef.current
      if (document.visibilityState === 'visible' && seasonId) {
        void refetchSeasonData(seasonId, { checkSeasonChange: true })
      }
    }

    const handleOnline = () => {
      const seasonId = activeSeasonIdRef.current
      if (seasonId) {
        void refetchSeasonData(seasonId, { checkSeasonChange: true })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [refetchSeasonData])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch {
      // ignore
    }
  }

  // Preload thumbnails in the background (capped within LRU budget) and cancel pending loads on unmount
  useEffect(() => {
    if (players.length > 0) {
      enqueuePlayerThumbnailsForPreload(players)
    }
    return () => {
      cancelPendingProjectorPreloads()
    }
  }, [players])

  // Active scene entities
  const rawSpotlightPlayer = players.find((p) => p.id === projectorState.player_id)
  const rosterTeam = teams.find((t) => t.id === projectorState.team_id)

  // Auto slideshow lists and active slides (timers only run in player_auto / roster_auto)
  const isPlayerAuto = projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO
  const isRosterAuto =
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO ||
    (projectorState.mode === PROJECTOR_MODES.TEAMS && !projectorState.team_id)

  const isTeamsAndPursesMode =
    projectorState.mode === PROJECTOR_MODES.TEAMS ||
    projectorState.mode === PROJECTOR_MODES.ROSTER ||
    projectorState.mode === PROJECTOR_MODES.ROSTER_AUTO

  const autoPlayers = useMemo(
    () =>
      isPlayerAuto
        ? getAutoSlideshowPlayers(players, projectorState.auto_sport, projectorState.auto_filter)
        : [],
    [isPlayerAuto, players, projectorState.auto_sport, projectorState.auto_filter]
  )

  const sportFilteredTeams = useMemo(
    () => getAutoSlideshowTeams(teams, projectorState.auto_sport),
    [teams, projectorState.auto_sport]
  )

  const autoTeams = useMemo(
    () =>
      isRosterAuto
        ? sportFilteredTeams.length > 0
          ? sportFilteredTeams
          : teams
        : [],
    [isRosterAuto, sportFilteredTeams, teams]
  )

  const playerAutoSlideshow = useAutoSlideshow(
    autoPlayers,
    projectorState.auto_interval_seconds,
    isPlayerAuto ? projectorState.auto_started_at : null
  )

  const rosterAutoSlideshow = useAutoSlideshow(
    autoTeams,
    projectorState.auto_interval_seconds,
    isRosterAuto ? projectorState.auto_started_at : null
  )

  const rawAutoSpotlightPlayer = playerAutoSlideshow.currentItem
  const autoRosterTeam = rosterAutoSlideshow.currentItem

  const currentDisplayTeam = useMemo(() => {
    if (isRosterAuto) {
      return autoRosterTeam || autoTeams[0] || teams[0] || null
    }
    return (
      rosterTeam ||
      teams.find((t) => t.id === projectorState.team_id) ||
      sportFilteredTeams[0] ||
      teams[0] ||
      null
    )
  }, [
    isRosterAuto,
    autoRosterTeam,
    autoTeams,
    rosterTeam,
    projectorState.team_id,
    sportFilteredTeams,
    teams
  ])

  const currentDisplayTeamPlayers = useMemo(() => {
    if (!currentDisplayTeam) return []
    return players.filter((p) => p.team_id === currentDisplayTeam.id)
  }, [currentDisplayTeam, players])

  const [teamAnimationMode, setTeamAnimationMode] = useState<'fade' | 'slide' | 'zoom'>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('fieldr_projector_team_animation')
      if (saved === 'slide' || saved === 'zoom' || saved === 'fade') return saved
    }
    return 'fade'
  })

  const [playerAnimationMode, setPlayerAnimationMode] = useState<'fade' | 'slide' | 'zoom'>(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('fieldr_projector_player_animation')
      if (saved === 'slide' || saved === 'zoom' || saved === 'fade') return saved
    }
    return 'fade'
  })

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'fieldr_projector_team_animation' && e.newValue) {
        if (e.newValue === 'slide' || e.newValue === 'zoom' || e.newValue === 'fade') {
          setTeamAnimationMode(e.newValue)
        }
      }
      if (e.key === 'fieldr_projector_player_animation' && e.newValue) {
        if (e.newValue === 'slide' || e.newValue === 'zoom' || e.newValue === 'fade') {
          setPlayerAnimationMode(e.newValue)
        }
      }
      if (e.key === 'fieldr_seasons_updated_at') {
        getSeasons()
          .then((seasonsList) => {
            const active = seasonsList.find((s) => s.is_active) || seasonsList[0] || null
            if (active) {
              void switchActiveSeasonRef.current(active)
            }
          })
          .catch(() => {})
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const teamTransitionDuration = auctionSettings?.bid_update_ms
    ? auctionSettings.bid_update_ms / 1000
    : 0.4

  const teamTransitionVariants = useMemo(() => {
    if (shouldReduceMotion) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 }
      }
    }
    switch (teamAnimationMode) {
      case 'slide':
        return {
          initial: { opacity: 0, x: 80 },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: -80 }
        }
      case 'zoom':
        return {
          initial: { opacity: 0, scale: 0.94 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 1.04 }
        }
      case 'fade':
      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 }
        }
    }
  }, [teamAnimationMode, shouldReduceMotion])

  const playerTransitionVariants = useMemo(() => {
    if (shouldReduceMotion) {
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 }
      }
    }
    switch (playerAnimationMode) {
      case 'slide':
        return {
          initial: { opacity: 0, x: 80 },
          animate: { opacity: 1, x: 0 },
          exit: { opacity: 0, x: -80 }
        }
      case 'zoom':
        return {
          initial: { opacity: 0, scale: 0.94 },
          animate: { opacity: 1, scale: 1 },
          exit: { opacity: 0, scale: 1.04 }
        }
      case 'fade':
      default:
        return {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 }
        }
    }
  }, [playerAnimationMode, shouldReduceMotion])

  // Auction / Sold / Unsold entities
  const rawStagePlayer = players.find((p) => p.id === projectorState.player_id)

  // Wait up to 2s for photo load + decode before showing a player card
  const spotlightPlayer = useDecodedPlayerGate(rawSpotlightPlayer)
  const autoSpotlightPlayer = useDecodedPlayerGate(rawAutoSpotlightPlayer)
  const stagePlayer = useDecodedPlayerGate(rawStagePlayer)

  // Preload the next 3 players' photos in auto slideshow
  useEffect(() => {
    if (!isPlayerAuto || autoPlayers.length === 0) return
    const idx = playerAutoSlideshow.currentIndex
    const upcoming: Player[] = [autoPlayers[idx]]
    for (let offset = 1; offset <= 3; offset++) {
      if (autoPlayers.length > offset) {
        upcoming.push(autoPlayers[(idx + offset) % autoPlayers.length])
      }
    }
    preloadPriorityPlayerUrls(upcoming)
  }, [isPlayerAuto, autoPlayers, playerAutoSlideshow.currentIndex])

  // Preload the current and next 3 players' photos when a player is brought to stage or spotlight
  useEffect(() => {
    const activePlayer = rawStagePlayer || rawSpotlightPlayer
    if (!activePlayer || players.length === 0) return

    const sameSportPool = getAutoSlideshowPlayers(players, activePlayer.sport, 'all')
    const pool = sameSportPool.length > 0 ? sameSportPool : players
    const currentIdx = pool.findIndex((p) => p.id === activePlayer.id)

    const upcoming: Player[] = [activePlayer]
    if (currentIdx !== -1) {
      for (let offset = 1; offset <= 3; offset++) {
        if (pool.length > offset) {
          upcoming.push(pool[(currentIdx + offset) % pool.length])
        }
      }
    }
    preloadPriorityPlayerUrls(upcoming)
  }, [rawStagePlayer, rawSpotlightPlayer, players])
  const leadingTeam = projectorState.team_id
    ? teams.find((t) => t.id === projectorState.team_id) || null
    : null

  const soldPlayerId = projectorState.sale_player_id || projectorState.player_id
  const soldTeamId = projectorState.sale_team_id || projectorState.team_id
  const soldPlayer = soldPlayerId ? players.find((p) => p.id === soldPlayerId) || null : null
  const soldTeam = soldTeamId ? teams.find((t) => t.id === soldTeamId) || null : null
  const soldPrice = Number(
    projectorState.sale_price ??
      projectorState.current_bid ??
      soldPlayer?.purchase_price ??
      soldPlayer?.base_points ??
      0
  )

  const isPlayingSecuredAnimation =
    projectorState.mode === 'sold' &&
    Boolean(auctionSettings.secured_enabled) &&
    Boolean(activeSecuredSaleId)

  const bidFlashDurationSec = Math.min(
    2,
    Math.max(0.1, (Number(auctionSettings.bid_update_ms) || 600) / 1000)
  )

  // Animation variants
  const sceneVariants = {
    initial: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 1.02 }
  }

  const activeBroadcastMessage = (projectorState.broadcast_message || '').trim()
  const isBroadcastOpen = activeBroadcastMessage.length > 0
  const lastBroadcastMessageRef = useRef(activeBroadcastMessage)
  const wasBroadcastOpenRef = useRef(isBroadcastOpen)
  if (activeBroadcastMessage) {
    lastBroadcastMessageRef.current = activeBroadcastMessage
  }
  if (isBroadcastOpen) {
    wasBroadcastOpenRef.current = true
  }
  const displayedBroadcastMessage = activeBroadcastMessage || lastBroadcastMessageRef.current

  const broadcastStripEase: [number, number, number, number] = [0.22, 1, 0.36, 1]

  const broadcastStripVariants = useMemo(
    () =>
      shouldReduceMotion
        ? {
            initial: { opacity: 0 },
            animate: {
              opacity: 1,
              transition: { duration: 0.55, delay: 0.25, ease: broadcastStripEase }
            },
            exit: {
              opacity: 0,
              transition: { duration: 0.4, delay: 0.2, ease: broadcastStripEase }
            }
          }
        : {
            initial: {
              clipPath: 'inset(0 50% 0 50%)',
              opacity: 1
            },
            animate: {
              clipPath: 'inset(0 0% 0 0%)',
              opacity: 1,
              transition: {
                duration: 0.55,
                delay: 0.25,
                ease: broadcastStripEase
              }
            },
            exit: {
              clipPath: 'inset(0 50% 0 50%)',
              opacity: 1,
              transition: {
                duration: 0.4,
                delay: 0.2,
                ease: broadcastStripEase
              }
            }
          },
    [shouldReduceMotion]
  )

  const broadcastMessageVariants = useMemo(
    () =>
      shouldReduceMotion
        ? {
            initial: { opacity: 0 },
            animate: {
              opacity: 1,
              transition: { duration: 0.45, delay: 0.6, ease: broadcastStripEase }
            },
            exit: {
              opacity: 0,
              transition: { duration: 0.2, delay: 0, ease: broadcastStripEase }
            }
          }
        : {
            initial: {
              opacity: 0,
              y: 12
            },
            animate: {
              opacity: 1,
              y: 0,
              transition: {
                duration: 0.45,
                delay: 0.6,
                ease: broadcastStripEase
              }
            },
            exit: {
              opacity: 0,
              y: 0,
              transition: {
                duration: 0.2,
                delay: 0,
                ease: broadcastStripEase
              }
            }
          },
    [shouldReduceMotion]
  )

  return (
    <div
      data-theme={projectorTheme}
      className="min-h-screen w-screen bg-bg text-text overflow-hidden flex flex-col justify-between relative select-none antialiased"
    >
      <ProjectorConfetti
        triggerCount={confettiTriggerCount}
        fallSpeed={confettiFallSpeed}
        reducedMotion={shouldReduceMotion}
      />

      {/* Subtle Ambient Auditorium Lighting */}
      <div className="absolute top-1/4 left-1/4 w-[50vw] h-[50vw] rounded-full bg-accent-bright/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[40vw] h-[40vw] rounded-full bg-accent/10 blur-[120px] pointer-events-none" />

      {/* Auto-Hiding Top-Right Controls (Theme Toggle + Fullscreen) */}
      <div
        className={`fixed top-6 right-6 z-50 flex items-center gap-2.5 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={toggleProjectorTheme}
          aria-label={`Switch projector to ${projectorTheme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch projector to ${projectorTheme === 'dark' ? 'light' : 'dark'} mode`}
          className="min-h-[42px] px-3.5 py-2 flex items-center gap-2 rounded-xl bg-surface/90 backdrop-blur-md border border-border text-xs font-mono text-text hover:border-accent-bright shadow-md transition-colors"
        >
          {projectorTheme === 'dark' ? (
            <>
              <Sun size={16} weight="bold" className="text-points" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon size={16} weight="bold" className="text-accent-bright" />
              <span>Dark</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-surface/90 backdrop-blur-md border border-border text-text hover:border-accent-bright shadow-md transition-colors"
        >
          {isFullscreen ? <ArrowsIn size={18} weight="bold" /> : <ArrowsOut size={18} weight="bold" />}
        </button>
      </div>

      {/* Main Auditorium Projection Screen Canvas */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 md:p-16 lg:p-20 relative z-10 w-full h-full max-w-[1920px] mx-auto">
        <AnimatePresence mode="wait">
          {/* ================= SCENE 1: IDLE WELCOME ================= */}
          {projectorState.mode === 'idle' && (
            <motion.div
              key="scene-idle"
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 flex flex-col items-center justify-between w-full min-h-[80vh]"
            >
              {/* Top Center Small Season Name (shown only while broadcast is live) */}
              <div className="min-h-[28px] flex items-center justify-center px-4 text-center">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={
                    isBroadcastOpen
                      ? {
                          opacity: 1,
                          transition: {
                            duration: 0.3,
                            delay: 0.15,
                            ease: broadcastStripEase
                          }
                        }
                      : {
                          opacity: 0,
                          transition: {
                            duration: 0.25,
                            delay: 0,
                            ease: broadcastStripEase
                          }
                        }
                  }
                  aria-hidden={!isBroadcastOpen ? 'true' : undefined}
                  className="text-xs md:text-sm font-medium tracking-widest text-muted uppercase pointer-events-none"
                >
                  {activeSeason?.name || 'Annual Sports Tournament'}
                </motion.div>
              </div>

              {/* Center Stage: Large Season Name (idle) and Full-Width Ticker Strip (broadcast) */}
              <div className="grid grid-cols-1 grid-rows-1 place-items-center my-auto w-full">
                <div className="col-start-1 row-start-1 px-4 max-w-6xl mx-auto text-center">
                  <motion.h1
                    initial={isBroadcastOpen ? { opacity: 1, y: 0 } : false}
                    animate={
                      isBroadcastOpen
                        ? {
                            opacity: 0,
                            y: shouldReduceMotion ? 0 : -16,
                            transition: {
                              duration: 0.35,
                              delay: 0,
                              ease: broadcastStripEase
                            }
                          }
                        : {
                            opacity: 1,
                            y: 0,
                            transition: {
                              duration: 0.5,
                              delay: wasBroadcastOpenRef.current ? 0.35 : 0,
                              ease: broadcastStripEase
                            }
                          }
                    }
                    aria-hidden={isBroadcastOpen ? 'true' : undefined}
                    className={`font-syne font-extrabold text-5xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tight leading-[1.02] text-text ${
                      isBroadcastOpen ? 'pointer-events-none' : ''
                    }`}
                    style={{ textWrap: 'balance' }}
                  >
                    {activeSeason?.name || 'Annual Sports Tournament'}
                  </motion.h1>
                </div>

                <div className="col-start-1 row-start-1 flex items-center justify-center">
                  <AnimatePresence>
                    {isBroadcastOpen && (
                      <motion.div
                        key="idle-broadcast-strip"
                        variants={broadcastStripVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="w-screen max-w-[100vw] bg-surface border-y border-accent-bright px-8 sm:px-12 md:px-16 lg:px-24 py-8 sm:py-10 md:py-12 flex items-center justify-center overflow-hidden"
                      >
                        <motion.div
                          variants={broadcastMessageVariants}
                          className="w-full max-w-7xl mx-auto flex items-center justify-center"
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.p
                              key={displayedBroadcastMessage}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.25, ease: broadcastStripEase }}
                              className="font-dot font-normal leading-normal tracking-[0.16em] uppercase text-text text-center text-2xl sm:text-4xl md:text-5xl lg:text-6xl line-clamp-3 break-words w-full"
                            >
                              {displayedBroadcastMessage}
                            </motion.p>
                          </AnimatePresence>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Fieldr Branding (Logo and Wordmark, Small) in Footer at Bottom Center */}
              <div className="pt-6 pb-2 flex items-center justify-center">
                <BrandMark size="sm" showWordmark={true} />
              </div>
            </motion.div>
          )}

          {/* ================= SCENE 2: LIVE AUCTION STAGE ================= */}
          {projectorState.mode === 'auction' && (
            <motion.div
              key={`scene-auction-${stagePlayer?.id || 'none'}`}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.99 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-7xl my-auto relative"
            >
              {stagePlayer ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch relative z-10">
                  {/* Left: Large Player Card */}
                  <div className="lg:col-span-5 p-6 sm:p-7 rounded-[32px] bg-surface border border-border flex flex-col justify-between gap-6">
                    <div className="w-full aspect-[4/4.4] max-h-[420px] rounded-[24px] bg-surface-2 overflow-hidden relative flex items-center justify-center">
                      <ProjectorStagePhoto
                        url={stagePlayer.photo_url || stagePlayer.photo_thumb_url}
                        name={stagePlayer.name}
                        priority={true}
                        fallbackVariant="stage"
                      />

                      {/* 4-Digit Player Code Pill */}
                      <div className="absolute top-4 left-4 px-3.5 py-1.5 rounded-full bg-surface/95 border border-border font-mono text-sm sm:text-base font-bold tracking-wider text-accent-bright tabular-nums">
                        #{formatAthleteCode(stagePlayer.player_code || stagePlayer.athlete_code)}
                      </div>

                      {/* Sport Pill */}
                      <div className="absolute top-4 right-4 px-3.5 py-1.5 rounded-full bg-surface/95 border border-border text-xs sm:text-sm font-semibold text-text">
                        {stagePlayer.sport}
                      </div>
                    </div>

                    <div className="flex flex-col gap-5">
                      <div>
                        <span className="inline-flex items-center px-3.5 py-1 rounded-full bg-surface-2 text-xs sm:text-sm font-semibold text-accent-bright mb-2.5">
                          {stagePlayer.playing_role}
                        </span>
                        <h2
                          className="font-syne font-extrabold text-4xl sm:text-5xl xl:text-6xl text-text tracking-tight leading-[0.98] break-words"
                          style={{ textWrap: 'balance' }}
                        >
                          {stagePlayer.name}
                        </h2>
                      </div>

                      <div className="grid grid-cols-2 gap-4 rounded-[24px] bg-surface-2 px-5 py-4">
                        <div>
                          <span className="text-xs sm:text-sm font-medium text-muted block">
                            Year
                          </span>
                          <span className="font-syne font-bold text-xl sm:text-2xl text-text mt-0.5 block">
                            {getAcademicYearLabel(stagePlayer.academic_year || '1st')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs sm:text-sm font-medium text-muted block">
                            Base
                          </span>
                          <span className="font-mono font-bold text-xl sm:text-2xl text-points tabular-nums mt-0.5 block">
                            {stagePlayer.base_points.toLocaleString()} PTS
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Centred Current Bid & Leading Team Display */}
                  <div
                    className="lg:col-span-7 p-8 sm:p-10 rounded-[32px] bg-surface border-[1.5px] flex flex-col items-center justify-between text-center relative overflow-hidden transition-colors duration-300"
                    style={{
                      borderColor: leadingTeam?.color
                        ? `color-mix(in srgb, ${leadingTeam.color} 45%, transparent)`
                        : 'var(--border)'
                    }}
                  >
                    {/* Subtle Card Fill Pulse on New Bid */}
                    <AnimatePresence>
                      {bidFlashKey > 0 && leadingTeam && (
                        <motion.div
                          key={`card-flash-${bidFlashKey}`}
                          initial={{ opacity: 0.18 }}
                          animate={{ opacity: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: bidFlashDurationSec, ease: 'easeOut' }}
                          className="absolute inset-0 pointer-events-none"
                          style={{ backgroundColor: leadingTeam.color }}
                        />
                      )}
                    </AnimatePresence>

                    {/* Stage Header Pill */}
                    <div className="w-full flex items-center justify-center relative z-10">
                      <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-surface-2 text-sm sm:text-base font-medium text-muted">
                        {leadingTeam ? 'Current bid' : 'Opening bid'}
                      </span>
                    </div>

                    {/* Huge Centred Current Bid */}
                    <div className="my-auto py-8 flex flex-col items-center justify-center relative z-10">
                      <div className="flex items-baseline justify-center gap-4 flex-wrap">
                        <AuctionBidNumber
                          value={
                            leadingTeam && projectorState.current_bid != null
                              ? projectorState.current_bid
                              : stagePlayer.base_points
                          }
                          durationMs={auctionSettings.bid_update_ms}
                          reduceMotion={shouldReduceMotion}
                          accentColor={leadingTeam?.color || 'var(--points)'}
                        />
                        <span className="font-mono text-2xl sm:text-3xl md:text-4xl font-bold text-muted uppercase tracking-wider">
                          PTS
                        </span>
                      </div>
                    </div>

                    {/* Leading Team or Awaiting Bids Inset Well */}
                    <div className="w-full relative z-10">
                      {leadingTeam ? (
                        <motion.div
                          key={`leading-team-${leadingTeam.id}`}
                          initial={shouldReduceMotion ? { opacity: 0.85 } : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: bidFlashDurationSec * 0.55,
                            ease: [0.16, 1, 0.3, 1]
                          }}
                          className="p-5 sm:p-6 rounded-[24px] bg-surface-2 flex flex-col sm:flex-row items-center justify-between gap-5"
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div
                              className="w-16 h-16 sm:w-20 sm:h-20 rounded-[28%] flex items-center justify-center font-syne font-extrabold text-2xl text-white overflow-hidden shrink-0"
                              style={{ backgroundColor: leadingTeam.color || 'var(--accent-bright)' }}
                            >
                              {leadingTeam.logo_url ? (
                                <img
                                  src={leadingTeam.logo_url}
                                  alt={leadingTeam.name}
                                  width={80}
                                  height={80}
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span>{leadingTeam.short_code}</span>
                              )}
                            </div>

                            <div className="text-center sm:text-left min-w-0">
                              <span className="text-xs sm:text-sm font-medium text-muted block">
                                Leading
                              </span>
                              <h3 className="font-syne font-extrabold text-3xl sm:text-4xl md:text-5xl text-text tracking-tight leading-tight truncate">
                                {leadingTeam.name}
                              </h3>
                            </div>
                          </div>

                          <span className="px-4 py-1.5 rounded-full bg-surface border border-border font-mono text-sm sm:text-base font-semibold text-muted tracking-wider shrink-0">
                            {leadingTeam.short_code}
                          </span>
                        </motion.div>
                      ) : (
                        <div className="p-6 sm:p-7 rounded-[24px] bg-surface-2 flex flex-col sm:flex-row items-center justify-between gap-4">
                          <span className="font-syne font-bold text-2xl sm:text-3xl text-text tracking-tight">
                            Awaiting bids
                          </span>
                          <span className="font-mono text-lg sm:text-xl font-bold text-points tabular-nums">
                            {stagePlayer.base_points.toLocaleString()} PTS
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 px-8 rounded-[24px] bg-surface-2 text-center font-medium text-2xl text-muted max-w-xl mx-auto">
                  Awaiting player
                </div>
              )}
            </motion.div>
          )}

          {/* ================= SCENE 3: SOLD (SECURED ANIMATION -> STATIC SOLD CARD) ================= */}
          {projectorState.mode === 'sold' && (
            <motion.div
              key={`scene-sold-${soldPlayer?.id || 'none'}-${isPlayingSecuredAnimation ? 'anim' : 'static'}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-7xl my-auto relative flex items-center justify-center"
            >
              {isPlayingSecuredAnimation ? (
                <SecuredSequence
                  playerName={soldPlayer?.name || 'Player Secured'}
                  playerCode={formatAthleteCode(soldPlayer?.player_code || soldPlayer?.athlete_code)}
                  sport={soldPlayer?.sport || 'Cricket'}
                  playingRole={soldPlayer?.playing_role || 'Player'}
                  academicYearLabel={
                    soldPlayer?.academic_year
                      ? getAcademicYearLabel(soldPlayer.academic_year)
                      : undefined
                  }
                  photoUrl={soldPlayer?.photo_url || soldPlayer?.photo_thumb_url}
                  teamName={soldTeam?.name || 'Franchise'}
                  teamShortCode={soldTeam?.short_code || 'TM'}
                  teamColor={soldTeam?.color || '#10B981'}
                  teamLogoUrl={soldTeam?.logo_url}
                  price={soldPrice}
                  securedDurationSeconds={auctionSettings.secured_duration_seconds}
                  priceCountupSeconds={auctionSettings.price_countup_seconds}
                  reduceMotion={shouldReduceMotion}
                />
              ) : (
                /* ---------- CALM STATIC SOLD CARD (Player, Team, Price) ---------- */
                <div
                  className="w-full max-w-6xl bg-surface border-[1.5px] rounded-[32px] p-8 sm:p-10 relative overflow-hidden"
                  style={{
                    borderColor: soldTeam?.color
                      ? `color-mix(in srgb, ${soldTeam.color} 45%, transparent)`
                      : 'var(--border)'
                  }}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
                    {/* Player Portrait */}
                    <div className="lg:col-span-4 flex flex-col items-center">
                      <div className="w-60 h-72 sm:w-72 sm:h-88 rounded-[24px] bg-surface-2 overflow-hidden flex items-center justify-center relative">
                        {soldPlayer?.photo_url || soldPlayer?.photo_thumb_url ? (
                          <img
                            src={soldPlayer.photo_url || soldPlayer.photo_thumb_url}
                            alt={soldPlayer.name}
                            width={288}
                            height={352}
                            decoding="async"
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User size={88} weight="regular" className="text-muted" />
                        )}
                        <div className="absolute top-4 left-4 px-3.5 py-1 rounded-full bg-surface/95 border border-border font-mono text-sm font-bold text-accent-bright tabular-nums">
                          #{formatAthleteCode(soldPlayer?.player_code || soldPlayer?.athlete_code)}
                        </div>
                      </div>
                    </div>

                    {/* Static Sold Details */}
                    <div className="lg:col-span-8 flex flex-col gap-6 text-center lg:text-left">
                      <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
                        <span
                          className="px-4 py-1.5 rounded-full font-syne text-sm sm:text-base font-extrabold uppercase tracking-wider"
                          style={{
                            color: soldTeam?.color || 'var(--accent-bright)',
                            backgroundColor: `color-mix(in srgb, ${soldTeam?.color || 'var(--accent-bright)'} 14%, var(--surface-2))`
                          }}
                        >
                          Sold
                        </span>
                        {soldPlayer && (
                          <>
                            <span className="px-3.5 py-1.5 rounded-full bg-surface-2 text-xs sm:text-sm font-medium text-text">
                              {soldPlayer.sport}
                            </span>
                            <span className="px-3.5 py-1.5 rounded-full bg-surface-2 text-xs sm:text-sm font-medium text-muted">
                              {soldPlayer.playing_role}
                            </span>
                            <span className="px-3.5 py-1.5 rounded-full bg-surface-2 text-xs sm:text-sm font-medium text-muted">
                              {getAcademicYearLabel(soldPlayer.academic_year || '1st')}
                            </span>
                          </>
                        )}
                      </div>

                      <h2
                        className="font-syne font-extrabold text-5xl sm:text-6xl md:text-7xl text-text tracking-tight leading-[0.98]"
                        style={{ textWrap: 'balance' }}
                      >
                        {soldPlayer?.name || 'Drafted Athlete'}
                      </h2>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 rounded-[24px] bg-surface-2 p-5 sm:p-6 items-center">
                        {/* Buyer Team */}
                        {soldTeam ? (
                          <div className="flex items-center justify-center lg:justify-start gap-4 min-w-0">
                            <div
                              className="w-16 h-16 sm:w-18 sm:h-18 rounded-[28%] flex items-center justify-center font-syne font-extrabold text-xl text-white overflow-hidden shrink-0"
                              style={{ backgroundColor: soldTeam.color || 'var(--accent-bright)' }}
                            >
                              {soldTeam.logo_url ? (
                                <img
                                  src={soldTeam.logo_url}
                                  alt={soldTeam.name}
                                  width={72}
                                  height={72}
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span>{soldTeam.short_code}</span>
                              )}
                            </div>
                            <div className="text-left min-w-0">
                              <span className="text-xs sm:text-sm font-medium text-muted block">
                                Team
                              </span>
                              <div className="font-syne font-bold text-2xl sm:text-3xl text-text truncate">
                                {soldTeam.name}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm font-medium text-muted">Assigned</div>
                        )}

                        {/* Final Price */}
                        <div className="text-center sm:text-right">
                          <span className="text-xs sm:text-sm font-medium text-muted block">
                            Winning bid
                          </span>
                          <div
                            className="font-mono font-bold text-4xl sm:text-5xl md:text-6xl tabular-nums mt-0.5"
                            style={{ color: soldTeam?.color || 'var(--points)' }}
                          >
                            {soldPrice.toLocaleString()}{' '}
                            <span className="text-xl font-bold text-muted">PTS</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ================= SCENE 4: UNSOLD ================= */}
          {projectorState.mode === 'unsold' && (
            <motion.div
              key={`scene-unsold-${stagePlayer?.id || 'none'}`}
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-5xl my-auto"
            >
              {stagePlayer ? (
                <div className="p-8 sm:p-10 rounded-[32px] bg-surface border border-border flex flex-col md:flex-row items-center gap-8 md:gap-10">
                  {/* Muted Portrait */}
                  <div className="w-56 h-68 sm:w-64 sm:h-80 rounded-[24px] bg-surface-2 overflow-hidden shrink-0 flex items-center justify-center relative grayscale opacity-75">
                    <ProjectorStagePhoto
                      url={stagePlayer.photo_url || stagePlayer.photo_thumb_url}
                      name={stagePlayer.name}
                      priority={true}
                      fallbackVariant="unsold"
                    />
                  </div>

                  {/* Unsold Details */}
                  <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left gap-5 min-w-0">
                    <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                      <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-surface-2 border border-border font-syne text-sm sm:text-base font-bold uppercase tracking-wider text-muted">
                        Unsold
                      </span>
                      <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface-2 font-mono text-xs sm:text-sm font-semibold text-muted tabular-nums">
                        #{formatAthleteCode(stagePlayer.player_code || stagePlayer.athlete_code)}
                      </span>
                      <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface-2 text-xs sm:text-sm font-medium text-muted">
                        {stagePlayer.sport}
                      </span>
                      <span className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface-2 text-xs sm:text-sm font-medium text-muted">
                        {stagePlayer.playing_role}
                      </span>
                    </div>

                    <h2
                      className="font-syne font-extrabold text-4xl sm:text-6xl text-text/85 tracking-tight leading-tight break-words"
                      style={{ textWrap: 'balance' }}
                    >
                      {stagePlayer.name}
                    </h2>

                    <div className="w-full grid grid-cols-2 gap-6 rounded-[24px] bg-surface-2 px-6 py-4">
                      <div>
                        <span className="text-xs sm:text-sm font-medium text-muted block">
                          Year
                        </span>
                        <span className="font-syne font-bold text-xl sm:text-2xl text-text/80 mt-0.5 block">
                          {getAcademicYearLabel(stagePlayer.academic_year || '1st')}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs sm:text-sm font-medium text-muted block">
                          Base
                        </span>
                        <span className="font-mono font-bold text-xl sm:text-2xl text-muted tabular-nums mt-0.5 block">
                          {stagePlayer.base_points.toLocaleString()} PTS
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-16 px-8 rounded-[24px] bg-surface-2 text-center font-medium text-xl text-muted max-w-md mx-auto">
                  Unsold
                </div>
              )}
            </motion.div>
          )}

          {/* ================= SCENE 2: TEAMS & PURSES ================= */}
          {isTeamsAndPursesMode && (
            <motion.div
              key="scene-teams-and-purses"
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col justify-center w-full h-full max-w-6xl my-auto overflow-hidden"
            >
              {currentDisplayTeam ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={currentDisplayTeam.id}
                    variants={teamTransitionVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{
                      duration: teamTransitionDuration,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                    className="flex flex-col justify-between w-full h-full overflow-hidden"
                  >
                    <TeamsAndPursesSceneContent
                      team={currentDisplayTeam}
                      rosterPlayers={currentDisplayTeamPlayers}
                    />
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="py-20 px-8 rounded-[24px] bg-surface-2 text-center font-medium text-2xl text-muted max-w-xl mx-auto">
                  No teams for {projectorState.auto_sport || 'this sport'}.
                </div>
              )}
            </motion.div>
          )}

          {/* ================= SCENE 6: PLAYER SPOTLIGHT ================= */}
          {projectorState.mode === PROJECTOR_MODES.PLAYER && (
            <motion.div
              key="scene-player"
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center w-full max-w-6xl my-auto"
            >
              {spotlightPlayer ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={spotlightPlayer.id}
                    variants={playerTransitionVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{
                      duration: teamTransitionDuration,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                    className="flex flex-col lg:flex-row items-center justify-center gap-10 md:gap-16 lg:gap-20 w-full"
                  >
                    <PlayerSpotlightSceneContent
                      player={spotlightPlayer}
                      shouldReduceMotion={shouldReduceMotion}
                    />
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="py-16 px-8 rounded-[24px] bg-surface-2 text-center font-medium text-xl text-muted">
                  No player selected.
                </div>
              )}
            </motion.div>
          )}

          {/* ================= SCENE 6B: PLAYER SPOTLIGHT AUTO SLIDESHOW ================= */}
          {projectorState.mode === PROJECTOR_MODES.PLAYER_AUTO && (
            <motion.div
              key="scene-player-auto"
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center w-full max-w-6xl my-auto"
            >
              {autoSpotlightPlayer ? (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={autoSpotlightPlayer.id}
                    variants={playerTransitionVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={{
                      duration: teamTransitionDuration,
                      ease: [0.22, 1, 0.36, 1]
                    }}
                    className="flex flex-col lg:flex-row items-center justify-center gap-10 md:gap-16 lg:gap-20 w-full"
                  >
                    <PlayerSpotlightSceneContent
                      player={autoSpotlightPlayer}
                      shouldReduceMotion={shouldReduceMotion}
                      isAutoSlide={true}
                    />
                  </motion.div>
                </AnimatePresence>
              ) : (
                <div className="py-20 px-8 rounded-[24px] bg-surface-2 text-center font-medium text-2xl text-muted">
                  No players for {projectorState.auto_sport || 'this sport'}.
                </div>
              )}
            </motion.div>
          )}


        </AnimatePresence>
      </main>
    </div>
  )
}
