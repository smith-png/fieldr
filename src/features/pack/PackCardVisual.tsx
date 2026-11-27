import React, { useId, useState } from 'react'
import { getAcademicYearLabel } from '../../lib/academicYears'
import { FIELDR_MARK_PATH } from '../holo/logoMask'
import type { PackCardItem } from './types'

interface PackCardVisualProps {
  item: PackCardItem
  /** Triggers ONE 600ms soft white specular sweep on standard card reveal */
  standardSweepActive: boolean
  reducedMotion: boolean
  /** Imperative refs populated by PackCardsStage's single rAF loop (zero React renders per frame) */
  onRegisterRefs?: (refs: CardVisualHandles | null) => void
}

export interface CardVisualHandles {
  foilLayer: HTMLDivElement | null
  fresnelLayer: HTMLDivElement | null
  edgeTraced: SVGRectElement | null
  edgeTail: SVGRectElement | null
  edgeHead: SVGRectElement | null
}

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

/**
 * Pure presentational 3D double-sided card with visible thickness, crisp backface-hidden faces,
 * single-origin SVG perimeter diffraction anticipation trace on the back, and pearlescent graphite foil on premium fronts.
 */
export const PackCardVisual: React.FC<PackCardVisualProps> = React.memo(
  ({ item, standardSweepActive, reducedMotion, onRegisterRefs }) => {
    const { player, code, photoSrc, isPremium } = item
    const [failedSrc, setFailedSrc] = useState<string | null>(null)
    const showPhoto = Boolean(photoSrc) && failedSrc !== photoSrc
    const academicYearLabel = getAcademicYearLabel(player.academic_year)
    const edgeGradId = useId().replace(/:/g, '')

    const handlesRef = React.useRef<CardVisualHandles>({
      foilLayer: null,
      fresnelLayer: null,
      edgeTraced: null,
      edgeTail: null,
      edgeHead: null
    })

    React.useEffect(() => {
      onRegisterRefs?.(handlesRef.current)
      return () => {
        onRegisterRefs?.(null)
      }
    }, [onRegisterRefs])

    return (
      <div className="pack-card-3d-shell relative w-full h-full select-none">
        {/* Physical card thickness backing plane */}
        <div
          aria-hidden="true"
          className="pack-card-thickness pointer-events-none absolute inset-[1px] rounded-[17px]"
        />

        {/* CARD FRONT — matte graphite, pixel-snapped hairline white border */}
        <div className="pack-card-face pack-card-face-front absolute inset-0 rounded-[18px] border border-white/[0.16] bg-[#101216] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.78)]">
          <div className="relative w-full h-full p-2.5">
            <div className="relative w-full h-full rounded-[11px] overflow-hidden bg-[#13161b] border border-white/[0.10]">
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

              {/* Neutral graphite readability scrims */}
              <div
                aria-hidden="true"
                className="pack-card-scrim-top pointer-events-none absolute inset-x-0 top-0 h-24 z-[2]"
              />
              <div
                aria-hidden="true"
                className="pack-card-scrim-bottom pointer-events-none absolute inset-x-0 bottom-0 h-44 z-[2]"
              />

              {/* Standard card reveal: ONE soft white specular sweep (600ms), then still */}
              {!isPremium && standardSweepActive && !reducedMotion && (
                <div
                  aria-hidden="true"
                  className="pack-standard-specular-sweep pointer-events-none absolute inset-0 z-[3]"
                />
              )}

              {/* Premium card: layered pearlescent graphite diffraction foil (blooms over 700ms via rAF opacity) */}
              {isPremium && (
                <div
                  ref={(el) => {
                    handlesRef.current.foilLayer = el
                  }}
                  aria-hidden="true"
                  style={{ opacity: reducedMotion ? 1 : 0 }}
                  className="pointer-events-none absolute inset-0 z-[3] overflow-hidden rounded-[inherit]"
                >
                  <div className="pack-premium-diffraction absolute inset-0" />
                  <div className="pack-premium-overlay absolute inset-0" />
                  <div className="pack-premium-grain absolute inset-0" />
                </div>
              )}

              {/* Top indices: sport (left) & playing role (right) */}
              <div className="pointer-events-none absolute inset-x-3 top-3 z-[4] flex items-start justify-between gap-2 px-0.5">
                <span className="font-dot uppercase tracking-[0.2em] text-white/80 leading-tight shrink-0 text-[clamp(9px,0.72vw,12px)]">
                  {player.sport}
                </span>
                <span className="font-dot uppercase tracking-[0.16em] text-white/55 leading-tight text-right truncate text-[clamp(9px,0.72vw,12px)]">
                  {player.playing_role}
                </span>
              </div>

              {/* Bottom identity: code, academic year, Syne athlete name, optional PREMIUM label */}
              <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[4] flex flex-col gap-1 px-0.5 pb-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-medium tracking-[0.16em] text-white/65 uppercase tabular-nums text-[clamp(10px,0.76vw,13px)]">
                    #{code}
                  </span>
                  {academicYearLabel && (
                    <span className="font-dot uppercase tracking-[0.16em] text-white/50 truncate text-[clamp(9px,0.68vw,11px)]">
                      {academicYearLabel}
                    </span>
                  )}
                </div>
                <h2 className="font-syne font-bold text-white/90 leading-tight tracking-tight line-clamp-2 text-[clamp(18px,1.55vw,26px)]">
                  {player.name}
                </h2>
                {isPremium && (
                  <div className="mt-1 pt-1.5 border-t border-white/[0.14] flex items-center justify-between">
                    <span className="font-dot uppercase tracking-[0.28em] text-white/70 leading-none text-[clamp(9px,0.68vw,11px)]">
                      PREMIUM
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Premium grazing Fresnel edge highlight */}
          {isPremium && (
            <div
              ref={(el) => {
                handlesRef.current.fresnelLayer = el
              }}
              aria-hidden="true"
              style={{ opacity: reducedMotion ? 0.85 : 0 }}
              className="pack-premium-fresnel pointer-events-none absolute inset-0 z-[5]"
            />
          )}
        </div>

        {/* CARD BACK — IDENTICAL matte graphite for standard & premium cards */}
        <div className="pack-card-face pack-card-face-back absolute inset-0 rounded-[18px] border border-white/[0.15] bg-gradient-to-b from-[#13161b] via-[#101216] to-[#0c0e12] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.78)] flex flex-col items-center justify-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 80% 55% at 50% 10%, rgba(255, 255, 255, 0.04) 0%, transparent 70%)'
            }}
          />

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[8px] rounded-[11px] border border-white/[0.07]"
          />

          {/* Single-origin diffraction edge trace for premium 900ms anticipation (ONE origin top-left, ONE head) */}
          {isPremium && !reducedMotion && (
            <svg
              viewBox="0 0 200 280"
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{ transform: 'scaleX(-1)' }}
              className="pointer-events-none absolute inset-0 w-full h-full z-20"
            >
              <defs>
                <linearGradient id={`edge-diff-${edgeGradId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(244, 248, 255, 0.95)" />
                  <stop offset="35%" stopColor="rgba(192, 214, 236, 0.88)" />
                  <stop offset="68%" stopColor="rgba(218, 200, 234, 0.85)" />
                  <stop offset="100%" stopColor="rgba(240, 246, 252, 0.95)" />
                </linearGradient>
              </defs>
              {/* Dim already-traced edge behind the moving head */}
              <rect
                ref={(el) => {
                  handlesRef.current.edgeTraced = el
                }}
                x="1"
                y="1"
                width="198"
                height="278"
                rx="13"
                ry="13"
                pathLength={1}
                fill="none"
                stroke={`url(#edge-diff-${edgeGradId})`}
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
                style={{ opacity: 0 }}
              />
              {/* Soft 14% trailing comet tail strictly behind head (no wrap) */}
              <rect
                ref={(el) => {
                  handlesRef.current.edgeTail = el
                }}
                x="1"
                y="1"
                width="198"
                height="278"
                rx="13"
                ry="13"
                pathLength={1}
                fill="none"
                stroke={`url(#edge-diff-${edgeGradId})`}
                strokeWidth="1.9"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ opacity: 0 }}
              />
              {/* Single bright moving diffraction head */}
              <rect
                ref={(el) => {
                  handlesRef.current.edgeHead = el
                }}
                x="1"
                y="1"
                width="198"
                height="278"
                rx="13"
                ry="13"
                pathLength={1}
                fill="none"
                stroke="rgba(255, 255, 255, 0.98)"
                strokeWidth="2.4"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ opacity: 0 }}
              />
            </svg>
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
            className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center text-center"
          >
            <span className="font-syne font-extrabold syne-display text-[10px] tracking-[0.22em] text-white/50 leading-none">
              FIELDR
            </span>
          </div>
        </div>
      </div>
    )
  }
)

PackCardVisual.displayName = 'PackCardVisual'
