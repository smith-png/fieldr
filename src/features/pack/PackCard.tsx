import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { getAcademicYearLabel } from '../../lib/academicYears'
import { FIELDR_MARK_PATH } from '../holo/logoMask'
import {
  PACK_EASE,
  PREMIUM_FLIP_MS,
  PREMIUM_FOIL_FADE_MS,
  STANDARD_FLIP_MS,
  type PackCardItem
} from './types'

export interface PackCardBackProps {
  className?: string
  ariaHidden?: boolean
  showEdgeAnticipation?: boolean
}

/**
 * Matte graphite card back — IDENTICAL for standard and premium cards.
 * Optionally renders the thin diffraction edge line during premium anticipation.
 */
export const PackCardBack: React.FC<PackCardBackProps> = ({
  className = '',
  ariaHidden,
  showEdgeAnticipation = false
}) => (
  <div
    aria-hidden={ariaHidden}
    className={`relative overflow-hidden rounded-[18px] border border-white/[0.15] bg-gradient-to-b from-[#13161b] via-[#101216] to-[#0c0e12] flex flex-col items-center justify-center ${className}`}
  >
    {/* Subtle top-down sheen on graphite surface */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 80% 55% at 50% 10%, rgba(255, 255, 255, 0.04) 0%, transparent 70%)'
      }}
    />

    {/* Crisp inset hairline frame */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-[8px] rounded-[11px] border border-white/[0.07]"
    />

    {/* Premium 900ms anticipation: thin line of diffraction light on the card edge */}
    {showEdgeAnticipation && (
      <div
        aria-hidden="true"
        className="pack-premium-edge-anticipation pointer-events-none absolute inset-0 z-20"
      />
    )}

    {/* Centred Fieldr F outline */}
    <svg
      viewBox="17 14 31 36"
      fill="none"
      className="relative z-10 w-[34%] h-auto -translate-y-2"
      aria-hidden="true"
    >
      <path
        d={FIELDR_MARK_PATH}
        fill="rgba(255, 255, 255, 0.025)"
        stroke="rgba(255, 255, 255, 0.34)"
        strokeWidth="0.65"
        strokeLinejoin="miter"
      />
    </svg>

    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-1 text-center"
    >
      <span className="font-syne font-extrabold syne-display text-[10px] tracking-[0.22em] text-white/50 leading-none">
        FIELDR
      </span>
    </div>
  </div>
)

/** Dark monochrome placeholder with outlined F mark when athlete photo is missing */
const MissingPhotoPlaceholder: React.FC = () => (
  <div
    aria-hidden="true"
    className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#13161b] via-[#101216] to-[#0b0d10]"
  >
    <svg
      viewBox="17 14 31 36"
      fill="none"
      className="w-[34%] h-auto -translate-y-4"
      aria-hidden="true"
    >
      <path
        d={FIELDR_MARK_PATH}
        fill="rgba(255, 255, 255, 0.02)"
        stroke="rgba(255, 255, 255, 0.24)"
        strokeWidth="0.65"
        strokeLinejoin="miter"
      />
    </svg>
  </div>
)

interface PackCardProps {
  item: PackCardItem
  isFaceUp: boolean
  isSuspense: boolean
  size: 'stage' | 'finale' | 'side'
  reducedMotion: boolean
  isDocumentHidden?: boolean
  interactiveTilt?: boolean
  playRevealSweep?: boolean
  swayPhaseOffset?: number
}

export const PackCard: React.FC<PackCardProps> = React.memo(
  ({
    item,
    isFaceUp,
    isSuspense,
    size,
    reducedMotion,
    isDocumentHidden = false,
    interactiveTilt = true,
    playRevealSweep = false,
    swayPhaseOffset = 0
  }) => {
    const { player, code, photoSrc, isPremium } = item
    const [failedSrc, setFailedSrc] = useState<string | null>(null)
    const showPhoto = Boolean(photoSrc) && failedSrc !== photoSrc
    const academicYearLabel = getAcademicYearLabel(player.academic_year)

    const cardFrameRef = useRef<HTMLDivElement>(null)
    const isPointerInsideRef = useRef(false)
    const lastPointerMoveRef = useRef(0)

    const applyTiltVars = useCallback((nx: number, ny: number) => {
      const el = cardFrameRef.current
      if (!el) return
      const rotY = nx * 7.5
      const rotX = -ny * 6.5
      const hx = 50 + nx * 34
      const hy = 50 + ny * 34
      const angle = 128 + nx * 38 + ny * 24
      const hue = nx * 24 - ny * 14
      el.style.setProperty('--tilt-rx', `${rotX.toFixed(2)}deg`)
      el.style.setProperty('--tilt-ry', `${rotY.toFixed(2)}deg`)
      el.style.setProperty('--holo-x', `${hx.toFixed(1)}%`)
      el.style.setProperty('--holo-y', `${hy.toFixed(1)}%`)
      el.style.setProperty('--holo-angle', `${angle.toFixed(1)}deg`)
      el.style.setProperty('--holo-hue', `${hue.toFixed(1)}deg`)
    }, [])

    const handlePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!interactiveTilt || reducedMotion || !isFaceUp) return
        const el = cardFrameRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        isPointerInsideRef.current = true
        lastPointerMoveRef.current = performance.now()
        const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1))
        const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1))
        applyTiltVars(nx, ny)
      },
      [interactiveTilt, reducedMotion, isFaceUp, applyTiltVars]
    )

    const handlePointerLeave = useCallback(() => {
      isPointerInsideRef.current = false
      if (!isPremium) {
        applyTiltVars(0, 0)
      }
    }, [isPremium, applyTiltVars])

    // Slow idle auto-sway for premium cards (stage & finale) when mouse is idle
    useEffect(() => {
      if (!isPremium || !isFaceUp || size === 'side' || reducedMotion || isDocumentHidden) {
        return
      }
      let rafId = 0
      const start = performance.now()
      const sway = (now: number) => {
        const idleEnough = !isPointerInsideRef.current || now - lastPointerMoveRef.current > 1600
        if (idleEnough) {
          const t = (now - start) / 1000 + swayPhaseOffset
          const nx = Math.sin(t * 0.62) * 0.56
          const ny = Math.sin(t * 0.44 + 0.9) * 0.42
          applyTiltVars(nx, ny)
        }
        rafId = window.requestAnimationFrame(sway)
      }
      rafId = window.requestAnimationFrame(sway)
      return () => {
        window.cancelAnimationFrame(rafId)
      }
    }, [isPremium, isFaceUp, size, reducedMotion, isDocumentHidden, swayPhaseOffset, applyTiltVars])

    const isStage = size === 'stage'
    const isSide = size === 'side'

    const flipDurationSec = reducedMotion
      ? 0.25
      : (isPremium ? PREMIUM_FLIP_MS : STANDARD_FLIP_MS) / 1000

    const foilFadeDurationSec = reducedMotion ? 0.2 : PREMIUM_FOIL_FADE_MS / 1000
    const foilFadeDelaySec =
      !playRevealSweep || reducedMotion ? 0 : (PREMIUM_FLIP_MS * 0.42) / 1000

    return (
      <div className="relative flex flex-col items-center">
        {/* Perspective container */}
        <div
          ref={cardFrameRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          className="athlete-card-perspective relative z-10 w-full aspect-[5/7] select-none"
          style={
            {
              '--tilt-rx': '0deg',
              '--tilt-ry': '0deg',
              '--holo-x': '50%',
              '--holo-y': '42%',
              '--holo-angle': '128deg',
              '--holo-hue': '0deg'
            } as React.CSSProperties
          }
        >
          {/* Interactive / auto-sway tilt wrapper */}
          <div
            className="athlete-card-3d relative w-full h-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{
              transform:
                !reducedMotion && isFaceUp && !isSide
                  ? 'rotateX(var(--tilt-rx)) rotateY(var(--tilt-ry))'
                  : undefined
            }}
          >
            {/* 3D rotateY flip wrapper (900ms standard, 1300ms premium) */}
            <motion.div
              className="athlete-card-3d relative w-full h-full"
              initial={
                reducedMotion
                  ? { rotateY: 0, opacity: isFaceUp ? 1 : 0.9 }
                  : { rotateY: isFaceUp ? 0 : 180 }
              }
              animate={
                reducedMotion
                  ? { rotateY: 0, opacity: 1 }
                  : { rotateY: isFaceUp ? 0 : 180 }
              }
              transition={{ duration: flipDurationSec, ease: PACK_EASE }}
            >
              {/* CARD FRONT — matte graphite with hairline white border */}
              <div className="athlete-card-face absolute inset-0 rounded-[18px] border border-white/[0.15] bg-[#101216] overflow-hidden shadow-[0_26px_72px_rgba(0,0,0,0.8)]">
                <div className={`relative w-full h-full ${isStage ? 'p-3' : 'p-2'}`}>
                  <div className="relative w-full h-full rounded-[11px] overflow-hidden bg-[#13161b] border border-white/[0.10]">
                    {/* Dark monochrome outlined-F placeholder shown when photo is missing or loading */}
                    <MissingPhotoPlaceholder />
                    {showPhoto && (
                      <img
                        src={photoSrc}
                        alt={player.name}
                        loading="eager"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setFailedSrc(photoSrc)}
                        className="relative z-[1] w-full h-full object-cover object-top"
                      />
                    )}

                    {/* Neutral graphite top & bottom readability scrims */}
                    <div
                      aria-hidden="true"
                      className="pack-card-scrim-top pointer-events-none absolute inset-x-0 top-0 h-24 z-[2]"
                    />
                    <div
                      aria-hidden="true"
                      className="pack-card-scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-44 z-[2]"
                    />

                    {/* Standard card reveal: ONE soft white specular sweep (600ms), then still */}
                    {!isPremium && isFaceUp && playRevealSweep && !reducedMotion && (
                      <div
                        aria-hidden="true"
                        className="pack-standard-specular-sweep pointer-events-none absolute inset-0 z-[3]"
                      />
                    )}

                    {/* Premium card: layered pearlescent graphite diffraction foil (fades in over 700ms) */}
                    {isPremium && isFaceUp && (
                      <motion.div
                        aria-hidden="true"
                        initial={playRevealSweep ? { opacity: 0 } : { opacity: 1 }}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: foilFadeDurationSec,
                          delay: foilFadeDelaySec,
                          ease: PACK_EASE
                        }}
                        className="pointer-events-none absolute inset-0 z-[3] overflow-hidden rounded-[inherit]"
                      >
                        <div className="pack-premium-diffraction absolute inset-0" />
                        <div className="pack-premium-overlay absolute inset-0" />
                        <div className="pack-premium-grain absolute inset-0" />
                      </motion.div>
                    )}

                    {/* Top card indices: sport (left) & role (right) */}
                    <div
                      className={`pointer-events-none absolute inset-x-3 top-3 z-[4] flex items-start justify-between gap-2 ${
                        isStage ? 'px-1' : ''
                      }`}
                    >
                      <span
                        className={`font-dot uppercase tracking-[0.2em] text-white/80 leading-tight shrink-0 ${
                          isStage
                            ? 'text-[clamp(10px,0.8vw,12px)]'
                            : 'text-[clamp(8px,0.65vw,11px)]'
                        }`}
                      >
                        {player.sport}
                      </span>
                      <span
                        className={`font-dot uppercase tracking-[0.16em] text-white/55 leading-tight text-right truncate ${
                          isStage
                            ? 'text-[clamp(10px,0.8vw,12px)]'
                            : 'text-[clamp(8px,0.65vw,11px)]'
                        }`}
                      >
                        {player.playing_role}
                      </span>
                    </div>

                    {/* Bottom identity: code, academic year, name & optional PREMIUM micro-label */}
                    <div
                      className={`pointer-events-none absolute inset-x-3 bottom-3 z-[4] flex flex-col gap-1 ${
                        isStage ? 'px-1 pb-0.5' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`font-mono font-medium tracking-[0.16em] text-white/65 uppercase tabular-nums ${
                            isStage
                              ? 'text-[clamp(10px,0.8vw,13px)]'
                              : 'text-[clamp(9px,0.68vw,11px)]'
                          }`}
                        >
                          #{code}
                        </span>
                        {academicYearLabel && (
                          <span
                            className={`font-dot uppercase tracking-[0.16em] text-white/50 truncate ${
                              isStage
                                ? 'text-[clamp(9px,0.72vw,11px)]'
                                : 'text-[clamp(8px,0.62vw,10px)]'
                            }`}
                          >
                            {academicYearLabel}
                          </span>
                        )}
                      </div>
                      <h2
                        className={`font-syne font-bold text-white/90 leading-tight tracking-tight line-clamp-2 ${
                          isStage
                            ? 'text-[clamp(20px,1.7vw,28px)]'
                            : 'text-[clamp(14px,1.15vw,21px)]'
                        }`}
                      >
                        {player.name}
                      </h2>
                      {isPremium && (
                        <div className="mt-1 pt-1.5 border-t border-white/[0.14] flex items-center justify-between">
                          <span
                            className={`font-dot uppercase tracking-[0.28em] text-white/70 leading-none ${
                              isStage
                                ? 'text-[clamp(9px,0.72vw,11px)]'
                                : 'text-[clamp(8px,0.62vw,10px)]'
                            }`}
                          >
                            PREMIUM
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Premium Fresnel grazing edge highlight on outer card perimeter */}
                {isPremium && isFaceUp && (
                  <motion.div
                    aria-hidden="true"
                    initial={playRevealSweep ? { opacity: 0 } : { opacity: 1 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: foilFadeDurationSec,
                      delay: foilFadeDelaySec,
                      ease: PACK_EASE
                    }}
                    className="pack-premium-fresnel pointer-events-none absolute inset-0 z-[5]"
                  />
                )}
              </div>

              {/* CARD BACK — identical for standard and premium, with thin diffraction edge line on premium anticipation */}
              {!reducedMotion && (
                <div className="athlete-card-face athlete-card-face-back absolute inset-0 rounded-[18px] overflow-hidden shadow-[0_26px_72px_rgba(0,0,0,0.8)]">
                  <PackCardBack
                    ariaHidden
                    showEdgeAnticipation={isPremium && isSuspense}
                    className="w-full h-full"
                  />
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    )
  }
)

PackCard.displayName = 'PackCard'
