import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, X } from '@phosphor-icons/react'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react'
import type { PublicPlayer } from '../../types'
import { formatAthleteCode } from '../../lib/data/client'
import { prefetchRoute } from '../../lib/queryCache'
import { getInitials } from '../../lib/utils'
import { PhotoPlaceholder } from '../roster/PhotoPlaceholder'
import { SkeletonBlock } from '../ui/Skeleton'
import { CLOSED_STACK_EDGES } from './athleteDeckUtils'

export interface AthleteCardBackProps {
  label?: string
  className?: string
  ariaHidden?: boolean
}

export const AthleteCardBack: React.FC<AthleteCardBackProps> = ({
  label,
  className = '',
  ariaHidden
}) => (
  <div
    aria-hidden={ariaHidden}
    className={`athlete-card-back-bg athlete-card-rim rounded-2xl overflow-hidden flex items-center justify-center ${className}`}
  >
    <div
      aria-hidden="true"
      className="athlete-card-back-lockup relative z-10 w-full flex flex-col items-center justify-center gap-2 pointer-events-none"
    >
      <svg
        viewBox="19 16 27 32"
        fill="none"
        className="athlete-card-back-mark w-[17%] h-auto"
      >
        <path
          d="M19 16H46V23.5H28.5V29.5H41V36.5H28.5V48H19V16Z"
          fill="currentColor"
        />
      </svg>
      <span className="font-syne font-extrabold syne-display text-sm sm:text-base tracking-tight text-text leading-none">
        Fieldr
      </span>
    </div>
    {label && (
      <span className="pointer-events-none absolute inset-x-4 bottom-5 z-10 flex justify-center">
        <span className="px-3 py-1 rounded-full bg-surface/85 border border-border font-dot text-[10px] sm:text-[11px] uppercase tracking-[0.16em] text-text">
          {label}
        </span>
      </span>
    )}
  </div>
)

export interface AthleteCardProps {
  player: PublicPlayer
  isCenter: boolean
  isFaceUp: boolean
  initialFaceUp?: boolean
  isOpen: boolean
  interactive?: boolean
  sheenTrigger: number
  enableHoverTilt: boolean
  reducedMotion: boolean
  flipDelay?: number
  tabIndex?: number
  buttonRef?: (el: HTMLButtonElement | null) => void
  onSelect: () => void
  onCloseDetails: () => void
}

const TILT_SPRING = { stiffness: 260, damping: 24, mass: 0.5 } as const

export const AthleteCard: React.FC<AthleteCardProps> = React.memo(
  ({
    player,
    isCenter,
    isFaceUp,
    initialFaceUp = false,
    isOpen,
    interactive = true,
    sheenTrigger,
    enableHoverTilt,
    reducedMotion,
    flipDelay = 0,
    tabIndex = 0,
    buttonRef,
    onSelect,
    onCloseDetails
  }) => {
    const photoSrc = player.photo_url || player.photo_thumb_url || ''
    const [failedSrc, setFailedSrc] = useState<string | null>(null)
    const showPhoto = Boolean(photoSrc) && failedSrc !== photoSrc

    const formattedCode = formatAthleteCode(player.athlete_code ?? player.player_code)
    const profileHref = `/players/${player.athlete_code || formattedCode}`

    const rawRotateX = useMotionValue(0)
    const rawRotateY = useMotionValue(0)
    const rawShadowX = useMotionValue(0)
    const rawShadowY = useMotionValue(0)

    const tiltX = useSpring(rawRotateX, TILT_SPRING)
    const tiltY = useSpring(rawRotateY, TILT_SPRING)
    const shadowX = useSpring(rawShadowX, TILT_SPRING)
    const shadowY = useSpring(rawShadowY, TILT_SPRING)

    const resetTilt = useCallback(() => {
      rawRotateX.set(0)
      rawRotateY.set(0)
      rawShadowX.set(0)
      rawShadowY.set(0)
    }, [rawRotateX, rawRotateY, rawShadowX, rawShadowY])

    useEffect(() => {
      if (!enableHoverTilt) {
        resetTilt()
      }
    }, [enableHoverTilt, resetTilt])

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!enableHoverTilt || e.pointerType !== 'mouse') return
        const rect = e.currentTarget.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
        rawRotateY.set(nx * 6.5)
        rawRotateX.set(-ny * 5.5)
        rawShadowX.set(-nx * 8)
        rawShadowY.set(-ny * 8)
      },
      [enableHoverTilt, rawRotateX, rawRotateY, rawShadowX, rawShadowY]
    )

    const accessibleLabel = `${player.name}, ${player.sport}, ${player.playing_role}`

    return (
      <div
        className="athlete-card-perspective relative w-full aspect-[5/7] select-none"
        onPointerMove={handlePointerMove}
        onPointerLeave={resetTilt}
      >
        {/* Subtle depth shadow layer shifted via transform only on desktop hover */}
        {!reducedMotion && (
          <motion.div
            aria-hidden="true"
            style={enableHoverTilt ? { x: shadowX, y: shadowY } : undefined}
            className={`pointer-events-none absolute inset-2 rounded-2xl transition-opacity duration-200 ${
              isCenter ? 'opacity-100 shadow-2xl' : 'opacity-45 shadow-lg'
            }`}
          />
        )}

        {/* 3D tilt + face-down/face-up flip wrapper */}
        <motion.div
          className="athlete-card-3d relative w-full h-full"
          style={enableHoverTilt ? { rotateX: tiltX, rotateY: tiltY } : undefined}
        >
          <motion.div
            className="athlete-card-3d relative w-full h-full"
            initial={reducedMotion || initialFaceUp ? { rotateY: 0 } : { rotateY: 180 }}
            animate={{ rotateY: reducedMotion || isFaceUp ? 0 : 180 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 220,
                    damping: 24,
                    delay: isFaceUp && !initialFaceUp ? flipDelay : 0
                  }
            }
          >
            {/* CARD FRONT */}
            <div
              className={`athlete-card-face athlete-card-rim athlete-card-rim-framed absolute inset-0 rounded-2xl overflow-hidden bg-surface transition-colors duration-200 ${
                isCenter ? 'athlete-card-rim-active' : ''
              }`}
            >
              {/* Primary accessible card trigger */}
              <button
                ref={buttonRef}
                type="button"
                disabled={!interactive}
                tabIndex={interactive ? tabIndex : -1}
                onClick={onSelect}
                aria-label={accessibleLabel}
                aria-expanded={isCenter ? isOpen : undefined}
                className="group relative block w-full h-full p-2 sm:p-2.5 text-left rounded-[14px] overflow-hidden bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:ring-inset cursor-pointer disabled:cursor-default"
              >
                {/* Inset portrait photo or silhouette placeholder framed by the card background */}
                <div className="relative w-full h-full rounded-[8px] sm:rounded-[6px] overflow-hidden bg-surface-2">
                  <PhotoPlaceholder />
                  {showPhoto ? (
                    <img
                      src={photoSrc}
                      alt=""
                      aria-hidden="true"
                      width={250}
                      height={350}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={() => setFailedSrc(photoSrc)}
                      className="relative z-[1] w-full h-full object-cover object-top"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="relative z-[1] w-full h-full flex items-center justify-center"
                    >
                      <span className="font-syne font-bold text-4xl text-muted/40 tracking-tight">
                        {getInitials(player.name)}
                      </span>
                    </div>
                  )}

                  {/* Theme-aware top and bottom readability scrims */}
                  <div
                    aria-hidden="true"
                    className="athlete-card-scrim-top pointer-events-none absolute inset-x-0 top-0 h-20 z-[2]"
                  />
                  <div
                    aria-hidden="true"
                    className="athlete-card-scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-32 z-[2]"
                  />

                  {/* Top corner playing-card indices: sport (left) & role (right) in dot font */}
                  <div className="pointer-events-none absolute inset-x-3 top-2.5 z-[4] flex items-start justify-between gap-2">
                    <span className="font-dot text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-accent-bright leading-tight shrink-0">
                      {player.sport}
                    </span>
                    <span className="font-dot text-[10px] sm:text-[11px] uppercase tracking-[0.1em] text-muted leading-tight text-right truncate">
                      {player.playing_role}
                    </span>
                  </div>

                  {/* Bottom card identity: mono code + Syne bold name */}
                  <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[4] flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-accent-bright uppercase tabular-nums">
                        #{formattedCode}
                      </span>
                      {isCenter && interactive && !isOpen && (
                        <span className="font-dot text-[10px] uppercase tracking-[0.12em] text-muted">
                          TAP
                        </span>
                      )}
                    </div>
                    <span className="font-syne font-bold text-lg sm:text-xl text-text leading-tight tracking-tight line-clamp-2">
                      {player.name}
                    </span>
                  </div>

                  {/* Subtle 1px inner border in card accent colour at low opacity */}
                  <span
                    aria-hidden="true"
                    className="athlete-card-photo-border pointer-events-none absolute inset-0 rounded-[inherit] z-[5]"
                  />
                </div>

                {/* Holographic sage foil sheen sweep when card becomes centered */}
                {!reducedMotion && isCenter && isFaceUp && sheenTrigger > 0 && (
                  <span
                    key={sheenTrigger}
                    aria-hidden="true"
                    className="athlete-card-foil pointer-events-none absolute inset-y-0 -left-1/3 w-2/3 z-[6]"
                  />
                )}
              </button>

              {/* Details panel overlay (sibling to button to keep interactive HTML valid) */}
              <AnimatePresence>
                {isCenter && isOpen && (
                  <motion.div
                    role="region"
                    aria-label={`${player.name} details`}
                    initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 14 }}
                    transition={
                      reducedMotion
                        ? { duration: 0 }
                        : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                    }
                    className="frost-strong absolute inset-0 z-10 rounded-[14px] p-4 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block font-mono text-[11px] font-semibold tracking-[0.14em] text-accent-bright uppercase tabular-nums">
                          #{formattedCode}
                        </span>
                        <h3 className="font-syne font-bold text-lg sm:text-xl text-text leading-tight tracking-tight mt-1 line-clamp-2">
                          {player.name}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={onCloseDetails}
                        aria-label={`Close ${player.name} details`}
                        className="hit-44 relative w-8 h-8 rounded-full bg-surface border border-border text-text hover:border-accent-bright flex items-center justify-center shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright cursor-pointer"
                      >
                        <X size={15} weight="bold" aria-hidden="true" />
                      </button>
                    </div>

                    <dl className="my-auto py-3 border-y border-border space-y-2.5 text-xs">
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="font-dot text-[10px] uppercase tracking-[0.14em] text-muted">
                          Sport
                        </dt>
                        <dd className="font-sans font-medium text-text text-right truncate">
                          {player.sport}
                        </dd>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="font-dot text-[10px] uppercase tracking-[0.14em] text-muted">
                          Role
                        </dt>
                        <dd className="font-sans font-medium text-text text-right truncate">
                          {player.playing_role}
                        </dd>
                      </div>
                      {player.academic_year && (
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="font-dot text-[10px] uppercase tracking-[0.14em] text-muted">
                            Year
                          </dt>
                          <dd className="font-sans font-medium text-text text-right truncate">
                            {player.academic_year} Year
                          </dd>
                        </div>
                      )}
                    </dl>

                    <Link
                      to={profileHref}
                      onMouseEnter={() => prefetchRoute(profileHref)}
                      onFocus={() => prefetchRoute(profileHref)}
                      onTouchStart={() => prefetchRoute(profileHref)}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-full bg-btn-bg text-btn-fg hover:opacity-90 active:scale-[0.985] transition-[opacity,transform] duration-150 motion-reduce:transition-none font-sans font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:ring-offset-2 focus-visible:ring-offset-bg whitespace-nowrap"
                    >
                      <span>View full profile</span>
                      <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
                    </Link>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* CARD BACK */}
            <AthleteCardBack
              ariaHidden
              className="athlete-card-face athlete-card-face-back absolute inset-0"
            />
          </motion.div>
        </motion.div>
      </div>
    )
  }
)

AthleteCard.displayName = 'AthleteCard'

export const AthleteDeckSkeleton: React.FC = () => (
  <div aria-busy="true" aria-label="Loading featured athletes deck">
    <div className="relative h-[388px] sm:h-[364px] md:h-[388px] lg:h-[408px] flex items-center justify-center overflow-visible">
      <div className="relative w-[236px] sm:w-[214px] md:w-[228px] lg:w-[240px] aspect-[5/7]">
        {CLOSED_STACK_EDGES.slice()
          .reverse()
          .map((edge, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                transform: `translate3d(${edge.x}px, ${edge.y}px, 0)`,
                opacity: edge.opacity
              }}
              className="athlete-card-rim absolute inset-0 rounded-2xl bg-surface"
            />
          ))}
        <div className="athlete-card-rim relative w-full h-full rounded-2xl bg-surface p-5 flex flex-col items-center justify-center gap-5 overflow-hidden">
          <SkeletonBlock className="w-16 h-16 rounded-2xl" />
          <SkeletonBlock className="w-24 h-6 rounded-full" />
        </div>
      </div>
    </div>
    <div className="mt-5 h-11" aria-hidden="true" />
  </div>
)
