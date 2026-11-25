import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react'
import { getPublicPlayersBySeason } from '../../lib/data/players'
import type { PublicPlayer } from '../../types'
import { SkeletonBlock } from '../ui/Skeleton'
import { AthleteCard, AthleteCardSkeleton } from './AthleteCard'
import {
  MAX_HAND_SIZE,
  getDeckSessionState,
  getFanPose,
  getNormalizedCode,
  getPhonePose,
  getRelativeFanOffset,
  markDeckDealt,
  resolveHandForPageLoad,
  setDeckEmpty
} from './athleteDeckUtils'

interface AthleteDeckProps {
  activeSeasonId: string | null
  seasonLoaded: boolean
}

export const AthleteDeck: React.FC<AthleteDeckProps> = ({ activeSeasonId, seasonLoaded }) => {
  const reducedMotion = Boolean(useReducedMotion())
  const initialSession = getDeckSessionState()
  const mountedAfterDealRef = useRef<boolean>(initialSession.hasDealtOnce)

  const [players, setPlayers] = useState<PublicPlayer[]>(() => initialSession.players ?? [])
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>(() => {
    if (initialSession.players !== null) return initialSession.players.length > 0 ? 'ready' : 'empty'
    if (seasonLoaded && !activeSeasonId) return 'empty'
    return 'loading'
  })

  const [activeIndex, setActiveIndex] = useState<number>(0)
  const [openCode, setOpenCode] = useState<string | null>(null)
  const [sheenCounter, setSheenCounter] = useState<number>(0)
  const [hasDealt, setHasDealt] = useState<boolean>(() => initialSession.hasDealtOnce || reducedMotion)
  const [flippedUp, setFlippedUp] = useState<boolean>(() => initialSession.hasDealtOnce || reducedMotion)
  const [isInView, setIsInView] = useState<boolean>(false)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [dismissDir, setDismissDir] = useState<number>(0)
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )
  const [hasFinePointer, setHasFinePointer] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : false
  )

  const sectionRef = useRef<HTMLElement>(null)
  const cardButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const wasDraggedRef = useRef<boolean>(false)
  const dismissTimerRef = useRef<number | null>(null)

  const mobileDragX = useMotionValue(0)
  const mobileDragRotate = useTransform(mobileDragX, [-200, 0, 200], [-12, 0, 12])
  const isPhone = viewportWidth < 640
  const fanSpacing = useMemo(
    () => (viewportWidth >= 1024 ? 134 : viewportWidth >= 768 ? 98 : 78),
    [viewportWidth]
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize, { passive: true })

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(hover: hover) and (pointer: fine)')
        : null
    const onPointerChange = () => mq && setHasFinePointer(mq.matches)
    if (mq) {
      setHasFinePointer(mq.matches)
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onPointerChange)
      else mq.addListener(onPointerChange)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      if (mq) {
        if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onPointerChange)
        else mq.removeListener(onPointerChange)
      }
    }
  }, [])

  // Idle-deferred public fetch so hero and LCP are never delayed
  useEffect(() => {
    const session = getDeckSessionState()
    if (session.players !== null && session.seasonId === activeSeasonId) {
      setPlayers(session.players)
      setStatus(session.players.length > 0 ? 'ready' : 'empty')
      return
    }
    if (!seasonLoaded) return
    if (!activeSeasonId) {
      setDeckEmpty()
      setPlayers([])
      setStatus('empty')
      return
    }

    let cancelled = false
    const runFetch = () => {
      void getPublicPlayersBySeason(activeSeasonId)
        .then((allPublic) => {
          if (cancelled) return
          const picked = resolveHandForPageLoad(allPublic, activeSeasonId)
          setPlayers(picked)
          setStatus(picked.length > 0 ? 'ready' : 'empty')
        })
        .catch(() => {
          if (cancelled) return
          const current = getDeckSessionState().players
          setStatus(current && current.length > 0 ? 'ready' : 'empty')
        })
    }

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(runFetch, { timeout: 1800 })
      return () => {
        cancelled = true
        win.cancelIdleCallback?.(idleId)
      }
    }
    const timerId = window.setTimeout(runFetch, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [activeSeasonId, seasonLoaded])

  // Observe visibility to trigger deal-in once and pause idle breathing off-screen
  useEffect(() => {
    const el = sectionRef.current
    if (!el || status !== 'ready' || players.length === 0) return
    if (typeof IntersectionObserver === 'undefined') {
      setIsInView(true)
      markDeckDealt()
      setHasDealt(true)
      setFlippedUp(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return
        setIsInView(entry.isIntersecting)
        if (entry.isIntersecting && !getDeckSessionState().hasDealtOnce) {
          markDeckDealt()
          setHasDealt(true)
        }
      },
      { threshold: 0.2 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [status, players.length])

  useEffect(() => {
    if (reducedMotion) {
      setHasDealt(true)
      setFlippedUp(true)
      return
    }
    if (!hasDealt || flippedUp) return
    const timer = window.setTimeout(() => {
      setFlippedUp(true)
      setSheenCounter((c) => c + 1)
    }, 380)
    return () => window.clearTimeout(timer)
  }, [hasDealt, flippedUp, reducedMotion])

  useEffect(() => {
    return () => {
      if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current)
    }
  }, [])

  const safeActiveIndex = players.length > 0 ? activeIndex % players.length : 0

  const focusCard = useCallback(
    (nextIndex: number, moveDomFocus = false) => {
      if (players.length === 0) return
      const wrapped = ((nextIndex % players.length) + players.length) % players.length
      setActiveIndex(wrapped)
      setOpenCode(null)
      if (!reducedMotion) setSheenCounter((c) => c + 1)
      if (moveDomFocus) {
        window.requestAnimationFrame(() => {
          cardButtonRefs.current[wrapped]?.focus({ preventScroll: true })
        })
      }
    },
    [players.length, reducedMotion]
  )

  const handleStep = useCallback(
    (delta: number, moveDomFocus = false) => focusCard(safeActiveIndex + delta, moveDomFocus),
    [focusCard, safeActiveIndex]
  )

  const handleCardSelect = useCallback(
    (index: number, code: string) => {
      if (wasDraggedRef.current) {
        wasDraggedRef.current = false
        return
      }
      if (index !== safeActiveIndex) {
        focusCard(index)
        return
      }
      setOpenCode((prev) => (prev === code ? null : code))
    },
    [safeActiveIndex, focusCard]
  )

  const handleRegionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (players.length <= 1 && e.key !== 'Escape') return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        handleStep(1, true)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        handleStep(-1, true)
      } else if (e.key === 'Escape' && openCode !== null) {
        e.preventDefault()
        setOpenCode(null)
        cardButtonRefs.current[safeActiveIndex]?.focus({ preventScroll: true })
      }
    },
    [players.length, handleStep, openCode, safeActiveIndex]
  )

  const handleDesktopDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setIsDragging(false)
      if (players.length <= 1) return
      if (Math.abs(info.offset.x) > 12) {
        wasDraggedRef.current = true
        window.setTimeout(() => { wasDraggedRef.current = false }, 120)
      }
      if (info.offset.x < -48 || info.velocity.x < -320) handleStep(1)
      else if (info.offset.x > 48 || info.velocity.x > 320) handleStep(-1)
    },
    [players.length, handleStep]
  )

  const handleMobileDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setIsDragging(false)
      if (players.length <= 1) return
      if (Math.abs(info.offset.x) > 12) {
        wasDraggedRef.current = true
        window.setTimeout(() => { wasDraggedRef.current = false }, 160)
      }
      const swipedLeft = info.offset.x < -68 || info.velocity.x < -360
      const swipedRight = info.offset.x > 68 || info.velocity.x > 360
      if (swipedLeft || swipedRight) {
        setOpenCode(null)
        setDismissDir(swipedRight ? 1 : -1)
        if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current)
        dismissTimerRef.current = window.setTimeout(() => {
          dismissTimerRef.current = null
          setDismissDir(0)
          mobileDragX.jump(0)
          focusCard(safeActiveIndex + 1)
        }, 180)
      }
    },
    [players.length, focusCard, safeActiveIndex, mobileDragX]
  )

  if (status === 'empty') return null

  const canBrowse = players.length > 1
  const breatheActive = !reducedMotion && flippedUp && isInView && !isDragging

  return (
    <section
      ref={sectionRef}
      id="athlete-deck-section"
      aria-labelledby="athlete-deck-heading"
      className="w-full max-w-7xl mx-auto px-6 md:px-16 lg:px-24 pb-16 md:pb-24"
    >
      <div className="pub-rule flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-5">
        <div>
          <span className="block font-dot text-[11px] sm:text-xs uppercase tracking-[0.18em] text-accent-bright mb-1.5">
            DRAW A CARD
          </span>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-xs tabular-nums text-muted select-none">03</span>
            <h2
              id="athlete-deck-heading"
              className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight"
            >
              Meet the athletes
            </h2>
          </div>
        </div>
      </div>

      {status === 'loading' ? (
        <div aria-busy="true" aria-label="Loading featured athletes">
          <div className="relative h-[388px] sm:h-[364px] md:h-[388px] lg:h-[408px] flex items-center justify-center overflow-hidden">
            {Array.from({ length: MAX_HAND_SIZE }).map((_, idx) => {
              const pose = isPhone
                ? getPhonePose(idx, idx, true, 0)
                : getFanPose(idx - 2, idx, true, fanSpacing)
              return (
                <AthleteCardSkeleton
                  key={idx}
                  style={{
                    transform: `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.rotate}deg) scale(${pose.scale})`,
                    zIndex: pose.zIndex,
                    opacity: pose.opacity
                  }}
                />
              )
            })}
          </div>
          <div className="mt-5 h-11 flex items-center justify-center gap-4">
            <SkeletonBlock className="w-11 h-11 rounded-full" />
            <SkeletonBlock className="w-24 h-2.5 rounded-full" />
            <SkeletonBlock className="w-11 h-11 rounded-full" />
          </div>
        </div>
      ) : (
        <div role="region" aria-label="Featured athletes" onKeyDown={handleRegionKeyDown}>
          {reducedMotion ? (
            <div className="flex gap-4 overflow-x-auto sm:overflow-visible sm:flex-wrap lg:flex-nowrap sm:justify-center pb-3 thin-scrollbar snap-x snap-mandatory">
              {players.map((player, idx) => {
                const code = getNormalizedCode(player)
                const isCenter = idx === safeActiveIndex
                return (
                  <div
                    key={player.id}
                    className={`w-[228px] sm:w-[210px] lg:w-[216px] shrink-0 snap-center rounded-2xl ${
                      isCenter ? 'ring-2 ring-accent-bright ring-offset-2 ring-offset-bg' : ''
                    }`}
                  >
                    <AthleteCard
                      player={player}
                      isCenter={isCenter}
                      isFaceUp
                      isOpen={isCenter && openCode === code}
                      sheenTrigger={0}
                      enableHoverTilt={false}
                      reducedMotion
                      buttonRef={(el) => { cardButtonRefs.current[idx] = el }}
                      onSelect={() => handleCardSelect(idx, code)}
                      onCloseDetails={() => setOpenCode(null)}
                    />
                  </div>
                )
              })}
            </div>
          ) : isPhone ? (
            <div className="relative h-[388px] flex items-center justify-center overflow-hidden touch-pan-y">
              {players.map((player, idx) => {
                const code = getNormalizedCode(player)
                const stackPos = (idx - safeActiveIndex + players.length) % players.length
                const isTop = stackPos === 0
                const pose = getPhonePose(stackPos, idx, hasDealt, dismissDir)
                const startPose = getPhonePose(stackPos, idx, false, 0)

                return (
                  <motion.div
                    key={player.id}
                    initial={
                      mountedAfterDealRef.current
                        ? false
                        : { x: startPose.x, y: startPose.y, rotate: startPose.rotate, scale: startPose.scale, opacity: startPose.opacity }
                    }
                    drag={isTop && canBrowse && openCode === null ? 'x' : false}
                    dragDirectionLock
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.85}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={handleMobileDragEnd}
                    style={{
                      x: isTop ? mobileDragX : undefined,
                      rotate: isTop && dismissDir === 0 ? mobileDragRotate : undefined,
                      zIndex: pose.zIndex,
                      pointerEvents: isTop ? 'auto' : 'none'
                    }}
                    animate={{ x: pose.x, y: pose.y, rotate: pose.rotate, scale: pose.scale, opacity: pose.opacity }}
                    transition={
                      isTop && dismissDir !== 0
                        ? { duration: 0.18, ease: 'easeOut' }
                        : { type: 'spring', stiffness: 270, damping: 25, mass: 0.85, delay: hasDealt && !flippedUp ? idx * 0.05 : 0 }
                    }
                    className="absolute w-[236px] touch-pan-y"
                  >
                    <div
                      className={breatheActive && isTop ? 'athlete-card-breathe' : 'athlete-card-breathe athlete-card-breathe-paused'}
                      style={{ '--breathe-delay': `${idx * 0.55}s` } as React.CSSProperties}
                    >
                      <AthleteCard
                        player={player}
                        isCenter={isTop}
                        isFaceUp={flippedUp}
                        isOpen={isTop && openCode === code}
                        sheenTrigger={isTop ? sheenCounter : 0}
                        enableHoverTilt={false}
                        reducedMotion={false}
                        flipDelay={idx * 0.06}
                        tabIndex={isTop ? 0 : -1}
                        buttonRef={(el) => { cardButtonRefs.current[idx] = el }}
                        onSelect={() => handleCardSelect(idx, code)}
                        onCloseDetails={() => setOpenCode(null)}
                      />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            <motion.div
              drag={canBrowse && openCode === null ? 'x' : false}
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.14}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDesktopDragEnd}
              className="relative h-[364px] md:h-[388px] lg:h-[408px] flex items-center justify-center overflow-visible touch-pan-y"
            >
              {players.map((player, idx) => {
                const code = getNormalizedCode(player)
                const rel = getRelativeFanOffset(idx, safeActiveIndex, players.length)
                const isCenter = rel === 0
                const pose = getFanPose(rel, idx, hasDealt, fanSpacing)
                const startPose = getFanPose(rel, idx, false, fanSpacing)

                return (
                  <motion.div
                    key={player.id}
                    initial={
                      mountedAfterDealRef.current
                        ? false
                        : { x: startPose.x, y: startPose.y, rotate: startPose.rotate, scale: startPose.scale, opacity: startPose.opacity }
                    }
                    animate={{ x: pose.x, y: pose.y, rotate: pose.rotate, scale: pose.scale, opacity: pose.opacity }}
                    transition={{ type: 'spring', stiffness: 260, damping: 25, mass: 0.85, delay: hasDealt && !flippedUp ? idx * 0.065 : 0 }}
                    style={{ zIndex: pose.zIndex }}
                    className="absolute w-[214px] md:w-[228px] lg:w-[240px]"
                  >
                    <div
                      className={breatheActive ? 'athlete-card-breathe' : 'athlete-card-breathe athlete-card-breathe-paused'}
                      style={{ '--breathe-delay': `${idx * 0.55}s` } as React.CSSProperties}
                    >
                      <AthleteCard
                        player={player}
                        isCenter={isCenter}
                        isFaceUp={flippedUp}
                        isOpen={isCenter && openCode === code}
                        sheenTrigger={isCenter ? sheenCounter : 0}
                        enableHoverTilt={hasFinePointer && isCenter && flippedUp && openCode === null && !isDragging}
                        reducedMotion={false}
                        flipDelay={idx * 0.075}
                        buttonRef={(el) => { cardButtonRefs.current[idx] = el }}
                        onSelect={() => handleCardSelect(idx, code)}
                        onCloseDetails={() => setOpenCode(null)}
                      />
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          )}

          {canBrowse && (
            <div className="mt-5 h-11 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => handleStep(-1)}
                aria-label="Previous athlete"
                className="w-11 h-11 rounded-full bg-surface border border-border text-text hover:border-accent-bright hover:text-accent-bright active:scale-[0.96] transition-[border-color,color,transform] duration-150 motion-reduce:transition-none flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright cursor-pointer"
              >
                <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              </button>

              <div className="flex items-center gap-2" role="group" aria-label="Choose athlete card">
                {players.map((player, idx) => {
                  const isActive = idx === safeActiveIndex
                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => focusCard(idx)}
                      aria-label={`Show ${player.name}`}
                      aria-current={isActive ? 'true' : undefined}
                      className="hit-44 relative p-1 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-full cursor-pointer"
                    >
                      <span
                        aria-hidden="true"
                        className={`block w-2.5 h-2.5 rounded-full transition-[transform,opacity] duration-200 motion-reduce:transition-none ${
                          isActive
                            ? 'bg-accent-bright scale-125 opacity-100'
                            : 'bg-muted scale-90 opacity-45 hover:opacity-75'
                        }`}
                      />
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => handleStep(1)}
                aria-label="Next athlete"
                className="w-11 h-11 rounded-full bg-surface border border-border text-text hover:border-accent-bright hover:text-accent-bright active:scale-[0.96] transition-[border-color,color,transform] duration-150 motion-reduce:transition-none flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright cursor-pointer"
              >
                <ArrowRight size={16} weight="bold" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
