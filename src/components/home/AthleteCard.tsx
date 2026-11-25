import React, { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, X } from '@phosphor-icons/react'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react'
import type { PublicPlayer } from '../../types'
import { formatAthleteCode } from '../../lib/data/client'
import { prefetchRoute } from '../../lib/queryCache'
import { getInitials } from '../../lib/utils'
import { PhotoPlaceholder } from '../roster/PhotoPlaceholder'
import FooterMark from '../layout/FooterMark'
import { SkeletonBlock, SkeletonText } from '../ui/Skeleton'

export interface AthleteCardProps {
  player: PublicPlayer
  isCenter: boolean
  isFaceUp: boolean
  isOpen: boolean
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
    isOpen,
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
          style={
            enableHoverTilt
              ? { rotateX: tiltX, rotateY: tiltY }
              : undefined
          }
        >
          <motion.div
            className="athlete-card-3d relative w-full h-full"
            initial={false}
            animate={{ rotateY: reducedMotion || isFaceUp ? 0 : 180 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 220,
                    damping: 24,
                    delay: isFaceUp ? flipDelay : 0
                  }
            }
          >
            {/* CARD FRONT */}
            <div
              className={`athlete-card-face absolute inset-0 rounded-2xl overflow-hidden bg-surface border transition-colors duration-200 ${
                isCenter
                  ? 'border-accent-bright/70'
                  : 'border-border'
              }`}
            >
              {/* Primary accessible card trigger */}
              <button
                ref={buttonRef}
                type="button"
                tabIndex={tabIndex}
                onClick={onSelect}
                aria-label={accessibleLabel}
                aria-expanded={isCenter ? isOpen : undefined}
                className="group relative block w-full h-full text-left rounded-2xl overflow-hidden bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:ring-inset cursor-pointer"
              >
                {/* Full-bleed portrait photo or silhouette placeholder */}
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

                {/* Thin inner playing-card frame */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-2 rounded-xl border border-border/80 z-[3]"
                />

                {/* Top corner playing-card indices: sport (left) & role (right) in dot font */}
                <div className="pointer-events-none absolute inset-x-4 top-3.5 z-[4] flex items-start justify-between gap-2">
                  <span className="font-dot text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-accent-bright leading-tight shrink-0">
                    {player.sport}
                  </span>
                  <span className="font-dot text-[10px] sm:text-[11px] uppercase tracking-[0.1em] text-muted leading-tight text-right truncate">
                    {player.playing_role}
                  </span>
                </div>

                {/* Bottom card identity: mono code + Syne bold name */}
                <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[4] flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-accent-bright uppercase tabular-nums">
                      #{formattedCode}
                    </span>
                    {isCenter && !isOpen && (
                      <span className="font-dot text-[10px] uppercase tracking-[0.12em] text-muted">
                        TAP
                      </span>
                    )}
                  </div>
                  <span className="font-syne font-bold text-lg sm:text-xl text-text leading-tight tracking-tight line-clamp-2">
                    {player.name}
                  </span>
                </div>

                {/* Holographic sage foil sheen sweep when card becomes centered */}
                {!reducedMotion && isCenter && isFaceUp && sheenTrigger > 0 && (
                  <span
                    key={sheenTrigger}
                    aria-hidden="true"
                    className="athlete-card-foil pointer-events-none absolute inset-y-0 -left-1/3 w-2/3 z-[5]"
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
                    className="frost-strong absolute inset-0 z-10 rounded-2xl p-4 flex flex-col justify-between border border-accent-bright/40"
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

            {/* CARD BACK (Fieldr F mark centered on fine sage pattern & thin frame) */}
            <div
              aria-hidden="true"
              className="athlete-card-face athlete-card-face-back athlete-card-back-bg absolute inset-0 rounded-2xl overflow-hidden border border-accent-bright/40 flex items-center justify-center"
            >
              <div className="pointer-events-none absolute inset-2.5 rounded-xl border border-accent-bright/30" />
              <div className="pointer-events-none absolute inset-4 rounded-lg border border-border/60" />
              <span className="pointer-events-none absolute top-4 left-4 font-dot text-[10px] uppercase tracking-[0.16em] text-accent-bright/75">
                F
              </span>
              <span className="pointer-events-none absolute bottom-4 right-4 font-dot text-[10px] uppercase tracking-[0.16em] text-accent-bright/75 rotate-180">
                F
              </span>
              <div className="relative z-10 p-2 rounded-2xl bg-surface/55 border border-border/70">
                <FooterMark size={48} eggEnabled={false} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    )
  }
)

AthleteCard.displayName = 'AthleteCard'

export const AthleteCardSkeleton: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    style={style}
    className="absolute w-[236px] sm:w-[214px] md:w-[228px] lg:w-[240px] aspect-[5/7] rounded-2xl bg-surface border border-border p-4 flex flex-col justify-between overflow-hidden"
  >
    <div className="flex items-center justify-between gap-2">
      <SkeletonBlock className="h-3 w-14 rounded-sm" />
      <SkeletonBlock className="h-3 w-16 rounded-sm" />
    </div>
    <div className="space-y-2">
      <SkeletonBlock className="h-3 w-12 rounded-sm" />
      <SkeletonText width="w-4/5" className="h-4" />
      <SkeletonText width="w-3/5" className="h-4" />
    </div>
  </div>
)

