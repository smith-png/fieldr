import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FIELDR_MARK_PATH, waitForBrandFonts } from '../holo/logoMask'
import { createRenderer } from '../holo/renderer'
import { clamp, easePack, lerp, stepSpring, type Spring1D } from './packEasing'
import type { PackLiveMotion, PackPhase } from './types'

interface FoilPack3DProps {
  seasonName?: string | null
  phase: PackPhase
  liveMotionRef: React.RefObject<PackLiveMotion>
  reducedMotion: boolean
  isDocumentHidden: boolean
  onPointerDownPack: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerUpPack: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerCancelPack: () => void
}

const VB_W = 100
const VB_H = 156
const SEAM_Y = 13.2
const BOTTOM_CRIMP_Y = 142.8
const CRIMP_LEFT = 5.4
const CRIMP_RIGHT = 94.6
const BELLY_LEFT = 0.5
const BELLY_RIGHT = 99.5
const TEETH_COUNT = 18

const IDLE_SWAY_PERIOD_SEC = 7.2
const FLOAT_PERIOD_SEC = 6.2
const FLOAT_AMPLITUDE_PX = 6.5
const IDLE_MAX_RY_DEG = 8.5
const IDLE_MAX_RX_DEG = 3.6
const POINTER_MAX_RY_DEG = 16.5
const POINTER_MAX_RX_DEG = 9.5
const POINTER_IDLE_RETURN_MS = 1600
const SPRING_STIFFNESS = 118
const SPRING_DAMPING = 20

function hasWebGpuSupport(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(navigator.gpu)
}

interface PackGeometry {
  bodyPathSvg: string
  bodyPathNorm: string
  stripPathNorm: string
  stripEdgeSvg: string
  seamPathSvg: string
  rimStrokeSvg: string
}

/**
 * Generates perfectly synchronized SVG & normalized objectBoundingBox clip paths
 * for the bowed pillow-pouch silhouette, wavy crimp teeth, tear notches, and jagged seam.
 */
function buildPackGeometry(): PackGeometry {
  const f = (x: number, y: number, norm: boolean) =>
    norm
      ? `${(x / VB_W).toFixed(5)} ${(y / VB_H).toFixed(5)}`
      : `${x.toFixed(2)} ${y.toFixed(2)}`

  // Deterministic fine jagged tear seam (left -> right across y ~ SEAM_Y)
  const seamPts: Array<[number, number]> = []
  const seamSteps = 36
  for (let i = 0; i <= seamSteps; i++) {
    const t = i / seamSteps
    const x = lerp(CRIMP_LEFT, CRIMP_RIGHT, t)
    const jag =
      i === 0 || i === seamSteps
        ? 0
        : (Math.sin(i * 2.4) * 0.42 + Math.cos(i * 4.1) * 0.24) * (0.65 + 0.35 * Math.sin(t * Math.PI))
    seamPts.push([x, SEAM_Y + jag])
  }

  const buildTopWavy = (norm: boolean): string => {
    const step = (CRIMP_RIGHT - CRIMP_LEFT) / TEETH_COUNT
    let d = `M ${f(CRIMP_LEFT, 1.9, norm)}`
    for (let i = 0; i < TEETH_COUNT; i++) {
      const x0 = CRIMP_LEFT + i * step
      const xm = x0 + step * 0.5
      const x1 = x0 + step
      d += ` Q ${f(xm, -0.35, norm)} ${f(x1, 1.9, norm)}`
    }
    return d
  }

  const buildBottomWavy = (norm: boolean): string => {
    const step = (CRIMP_RIGHT - CRIMP_LEFT) / TEETH_COUNT
    let d = ''
    for (let i = TEETH_COUNT - 1; i >= 0; i--) {
      const x1 = CRIMP_LEFT + (i + 1) * step
      const xm = x1 - step * 0.5
      const x0 = CRIMP_LEFT + i * step
      d += ` Q ${f(xm, VB_H + 0.35, norm)} ${f(x0, VB_H - 1.9, norm)}`
    }
    return d
  }

  const buildBody = (norm: boolean): string => {
    let d = `M ${f(seamPts[0][0], seamPts[0][1], norm)}`
    for (let i = 1; i < seamPts.length; i++) {
      d += ` L ${f(seamPts[i][0], seamPts[i][1], norm)}`
    }
    // Right bowed pillow flank tapering softly toward bottom crimp
    d += ` C ${f(BELLY_RIGHT, 38, norm)} ${f(BELLY_RIGHT, 118, norm)} ${f(CRIMP_RIGHT, BOTTOM_CRIMP_Y, norm)}`
    d += ` L ${f(CRIMP_RIGHT, VB_H - 1.9, norm)}`
    d += buildBottomWavy(norm)
    d += ` L ${f(CRIMP_LEFT, BOTTOM_CRIMP_Y, norm)}`
    // Left bowed pillow flank tapering smoothly up to tear seam
    d += ` C ${f(BELLY_LEFT, 118, norm)} ${f(BELLY_LEFT, 38, norm)} ${f(seamPts[0][0], seamPts[0][1], norm)} Z`
    return d
  }

  const buildStrip = (norm: boolean): string => {
    let d = buildTopWavy(norm)
    // Right crimp down to tear notch
    d += ` L ${f(CRIMP_RIGHT, SEAM_Y - 0.8, norm)}`
    d += ` L ${f(CRIMP_RIGHT - 1.1, SEAM_Y, norm)}`
    // Reverse jagged seam right -> left
    for (let i = seamPts.length - 1; i >= 0; i--) {
      d += ` L ${f(seamPts[i][0], seamPts[i][1], norm)}`
    }
    d += ` L ${f(CRIMP_LEFT + 1.1, SEAM_Y, norm)}`
    d += ` L ${f(CRIMP_LEFT, SEAM_Y - 0.8, norm)} Z`
    return d
  }

  const seamPathSvg = seamPts
    .map(([x, y], idx) => `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  const bodyPathSvg = buildBody(false)

  return {
    bodyPathSvg,
    bodyPathNorm: buildBody(true),
    stripPathNorm: buildStrip(true),
    stripEdgeSvg: buildTopWavy(false),
    seamPathSvg,
    rimStrokeSvg: bodyPathSvg
  }
}

const GraphiteHoloFallback: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const gradId = useId()

  useEffect(() => {
    void waitForBrandFonts()
  }, [])

  return (
    <div
      role="img"
      aria-label="Fieldr matte graphite holographic foil pack"
      className="relative w-full h-full overflow-hidden flex flex-col items-center justify-center bg-gradient-to-b from-[#13161b] via-[#101216] to-[#0c0e12]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.72,
          background:
            'radial-gradient(240px circle at var(--pack-bulge-x, 50%) var(--pack-bulge-y, 46%), rgba(206, 220, 236, 0.16), rgba(164, 186, 210, 0.055) 40%, transparent 72%)'
        }}
      />

      {!reducedMotion && (
        <div
          aria-hidden="true"
          className="pack-fallback-diffraction pointer-events-none absolute inset-0 opacity-60 mix-blend-screen"
        />
      )}

      <svg
        viewBox="17 14 31 36"
        fill="none"
        className="relative z-10 w-[42%] h-auto -translate-y-1"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.28)" />
            <stop offset="36%" stopColor="rgba(196, 216, 236, 0.62)" />
            <stop offset="56%" stopColor="rgba(218, 204, 234, 0.56)" />
            <stop offset="78%" stopColor="rgba(192, 218, 228, 0.45)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.26)" />
          </linearGradient>
        </defs>
        <path
          d={FIELDR_MARK_PATH}
          fill="rgba(255, 255, 255, 0.03)"
          stroke={`url(#${gradId})`}
          strokeWidth="0.65"
          strokeLinejoin="miter"
        />
      </svg>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[13%] z-10 flex flex-col items-center gap-1 text-center"
      >
        <span className="font-syne font-extrabold syne-display text-[11px] tracking-[0.22em] text-white/65 leading-none">
          FIELDR
        </span>
        <span className="font-dot text-[8px] tracking-[0.32em] text-white/40 uppercase leading-none">
          AUCTIONS
        </span>
      </div>
    </div>
  )
}

const DEPTH_SLICES = [-3, -6, -9, -12, -15] as const
const STRIP_SLICES = [0, 1, 2, 3] as const

export const FoilPack3D: React.FC<FoilPack3DProps> = ({
  seasonName,
  phase,
  liveMotionRef,
  reducedMotion,
  isDocumentHidden,
  onPointerDownPack,
  onPointerUpPack,
  onPointerCancelPack
}) => {
  const uid = useId().replace(/:/g, '')
  const bodyClipId = `pack-body-clip-${uid}`
  const stripClipId = `pack-strip-clip-${uid}`
  const rimGradId = `pack-rim-grad-${uid}`

  const geometry = useMemo(() => buildPackGeometry(), [])

  const rootRef = useRef<HTMLDivElement>(null)
  const objectRef = useRef<HTMLDivElement>(null)
  const bodyGroupRef = useRef<HTMLDivElement>(null)
  const stripGroupRef = useRef<HTMLDivElement>(null)
  const stripSliceRefs = useRef<Array<HTMLDivElement | null>>([null, null, null, null])
  const shadowRef = useRef<HTMLDivElement>(null)
  const reflectionRef = useRef<HTMLDivElement>(null)
  const openingGlowRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // SVG seam filament & tear-head refs updated directly in rAF (0 React state per frame)
  const chargeTracedRef = useRef<SVGPathElement>(null)
  const chargeTailRef = useRef<SVGPathElement>(null)
  const chargeHeadRef = useRef<SVGPathElement>(null)
  const chargeDotRef = useRef<SVGCircleElement>(null)
  const tearLipRef = useRef<SVGPathElement>(null)
  const tearHeadRef = useRef<SVGCircleElement>(null)
  const rimGradRef = useRef<SVGLinearGradientElement>(null)

  const [useCssFallback, setUseCssFallback] = useState<boolean>(
    () => !hasWebGpuSupport() || reducedMotion
  )

  // Single WebGPU canvas lifecycle (strictly at most one active renderer)
  useEffect(() => {
    if (useCssFallback) return
    const canvas = canvasRef.current
    if (!canvas) return
    let mounted = true
    const renderer = createRenderer(canvas)
    void renderer.ready.catch(() => {
      if (!mounted) return
      setUseCssFallback(true)
    })
    return () => {
      mounted = false
      renderer.dispose()
    }
  }, [useCssFallback])

  // Continuous single rAF controller driving entrance landing, sway/float, pointer spring tilt,
  // charging filament/tremble, progressive 4-slice curl tear, and emerging sink-away from CURRENT pose.
  useEffect(() => {
    const objEl = objectRef.current
    const bodyEl = bodyGroupRef.current
    const stripGroupEl = stripGroupRef.current
    const shadowEl = shadowRef.current
    const reflectionEl = reflectionRef.current
    if (!objEl || !bodyEl) return

    if (isDocumentHidden) return

    let rafId: number | null = null
    let lastTimeMs = performance.now()
    let elapsedSec = 0
    let entranceSec = 0
    const entranceDurSec = reducedMotion ? 0.25 : 0.95

    // Continuous spring pose state (no pose resets across state transitions!)
    const rxSpring: Spring1D = { value: reducedMotion ? 0 : 7, velocity: 0 }
    const rySpring: Spring1D = { value: reducedMotion ? 0 : -4, velocity: 0 }
    let posY = reducedMotion ? 0 : -22
    let posZ = reducedMotion ? 0 : 32
    let scaleVal = reducedMotion ? 1 : 0.94
    let opacityVal = reducedMotion ? 1 : 0

    let bodySinkY = 0
    let bodySinkZ = 0
    let bodySinkRx = 0
    let bodyOpacity = 1

    let pointerActive = false
    let pointerTargetRx = 0
    let pointerTargetRy = 0
    let lastPointerMoveMs = -Infinity
    let notifiedCanvasIdle = true

    const dispatchCanvasLeave = () => {
      const canvas = canvasRef.current
      if (!canvas || notifiedCanvasIdle) return
      notifiedCanvasIdle = true
      try {
        canvas.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }))
      } catch {
        // Ignore synthetic event errors
      }
    }

    const onWindowPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary) return
      const curPhase = liveMotionRef.current.phase
      if (curPhase !== 'idle' && curPhase !== 'charging') return
      const root = rootRef.current
      if (!root) return

      const rect = root.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const nx = clamp((event.clientX - cx) / Math.max(rect.width * 0.95, 220), -1, 1)
      const ny = clamp((event.clientY - cy) / Math.max(rect.height * 0.95, 280), -1, 1)

      pointerTargetRy = clamp(nx * POINTER_MAX_RY_DEG, -POINTER_MAX_RY_DEG, POINTER_MAX_RY_DEG)
      pointerTargetRx = clamp(-ny * POINTER_MAX_RX_DEG, -POINTER_MAX_RX_DEG, POINTER_MAX_RX_DEG)
      pointerActive = true
      lastPointerMoveMs = performance.now()
      notifiedCanvasIdle = false

      const canvas = canvasRef.current
      if (canvas && event.target !== canvas) {
        try {
          canvas.dispatchEvent(
            new PointerEvent('pointermove', {
              clientX: event.clientX,
              clientY: event.clientY,
              pointerType: event.pointerType || 'mouse',
              isPrimary: true,
              bubbles: false
            })
          )
        } catch {
          // Ignore synthetic event errors
        }
      }
    }

    const onWindowPointerLeave = () => {
      pointerActive = false
      dispatchCanvasLeave()
    }

    window.addEventListener('pointermove', onWindowPointerMove, { passive: true })
    window.addEventListener('pointerleave', onWindowPointerLeave)

    const tick = (now: number) => {
      const dt = Math.min(Math.max(0.001, (now - lastTimeMs) / 1000), 0.032)
      lastTimeMs = now
      elapsedSec += dt
      entranceSec = Math.min(entranceDurSec, entranceSec + dt)

      const live = liveMotionRef.current
      const curPhase = live.phase
      const charge = clamp(live.charge, 0, 1)
      const tear = clamp(live.tear, 0, 1)
      const emerge = clamp(live.emerge, 0, 1)

      if (pointerActive && now - lastPointerMoveMs >= POINTER_IDLE_RETURN_MS) {
        pointerActive = false
        dispatchCanvasLeave()
      }

      const entranceT = easePack(clamp(entranceSec / entranceDurSec, 0, 1))

      // Target pose computed continuously per state
      let targetRx = 0
      let targetRy = 0
      let targetY = 0
      let targetZ = 0
      let targetScale = 1
      let targetOpacity = entranceT

      if (curPhase === 'idle') {
        const floatWave = 0.5 - 0.5 * Math.cos((elapsedSec * 2 * Math.PI) / FLOAT_PERIOD_SEC)
        targetY = reducedMotion ? 0 : lerp(-22, -FLOAT_AMPLITUDE_PX * floatWave, entranceT)
        targetZ = reducedMotion ? 0 : lerp(32, 0, entranceT)
        targetScale = reducedMotion ? 1 : lerp(0.94, 1, entranceT)
        if (!reducedMotion) {
          if (pointerActive) {
            targetRx = pointerTargetRx
            targetRy = pointerTargetRy
          } else {
            const swayPhase = (elapsedSec * 2 * Math.PI) / IDLE_SWAY_PERIOD_SEC
            targetRy = Math.sin(swayPhase) * IDLE_MAX_RY_DEG
            targetRx = Math.cos(swayPhase) * IDLE_MAX_RX_DEG
          }
        }
      } else if (curPhase === 'charging') {
        // Settle forward slightly from current pose as the seam filament charges
        targetRx = reducedMotion ? 0 : lerp(2.5, 5.2, charge)
        targetRy = reducedMotion ? 0 : lerp(-1.5, -3.4, charge)
        targetY = 0
        targetZ = reducedMotion ? 0 : lerp(8, 22, charge)
        targetScale = reducedMotion ? 1 : lerp(1, 1.028, charge)
        targetOpacity = 1
      } else if (curPhase === 'tearing') {
        // Subtle weight shift tracking the left-to-right tear head
        targetRx = reducedMotion ? 0 : 4.6
        targetRy = reducedMotion ? 0 : lerp(-4.2, 3.2, easePack(tear))
        targetY = 0
        targetZ = reducedMotion ? 0 : 20
        targetScale = reducedMotion ? 1 : 1.03
        targetOpacity = 1
      } else if (curPhase === 'emerging') {
        targetRx = 0
        targetRy = 0
        targetY = 0
        targetZ = 0
        targetScale = 1
        targetOpacity = 1
      } else {
        targetOpacity = 0
      }

      // Smooth spring tilt + exponential follow for linear coordinates
      if (reducedMotion) {
        rxSpring.value = 0
        rySpring.value = 0
        posY = targetY
        posZ = targetZ
        scaleVal = targetScale
        opacityVal = targetOpacity
      } else {
        stepSpring(rxSpring, targetRx, SPRING_STIFFNESS, SPRING_DAMPING, dt)
        stepSpring(rySpring, targetRy, SPRING_STIFFNESS, SPRING_DAMPING, dt)
        rxSpring.value = clamp(rxSpring.value, -POINTER_MAX_RX_DEG, POINTER_MAX_RX_DEG)
        rySpring.value = clamp(rySpring.value, -POINTER_MAX_RY_DEG, POINTER_MAX_RY_DEG)

        const follow = 1 - Math.exp(-9 * dt)
        posY = lerp(posY, targetY, follow)
        posZ = lerp(posZ, targetZ, follow)
        scaleVal = lerp(scaleVal, targetScale, follow)
        opacityVal = lerp(opacityVal, targetOpacity, 1 - Math.exp(-12 * dt))
      }

      // Very slight tremble (<= 1.4px) during charging only, disabled under reduced motion
      let trembleX = 0
      let trembleY = 0
      if (!reducedMotion && charge > 0.08 && (curPhase === 'charging' || curPhase === 'idle')) {
        const amp = Math.min(1.4, charge * charge * 1.45)
        trembleX = Math.sin(elapsedSec * 58) * amp
        trembleY = Math.cos(elapsedSec * 71) * amp * 0.75
      }

      // Emerging sink-away for pack body: holds steady during first 42% as stack slides up 40%, then sinks, tilts away & fades
      if (curPhase === 'emerging') {
        const sinkP = easePack(clamp((emerge - 0.36) / 0.62, 0, 1))
        bodySinkY = reducedMotion ? 0 : lerp(0, 148, sinkP)
        bodySinkZ = reducedMotion ? 0 : lerp(0, -56, sinkP)
        bodySinkRx = reducedMotion ? 0 : lerp(0, -18, sinkP)
        bodyOpacity = clamp(1 - sinkP * 1.12, 0, 1)
      } else {
        bodySinkY = 0
        bodySinkZ = 0
        bodySinkRx = 0
        bodyOpacity = 1
      }

      // Toggle will-change ONLY during active animation
      const isActivelyMoving =
        !reducedMotion &&
        (curPhase !== 'idle' || pointerActive || charge > 0.005 || entranceSec < entranceDurSec)
      objEl.classList.toggle('pack-3d-active', isActivelyMoving)

      objEl.style.transform = `translate3d(${trembleX.toFixed(2)}px, ${(posY + trembleY).toFixed(2)}px, ${posZ.toFixed(2)}px) rotateX(${rxSpring.value.toFixed(3)}deg) rotateY(${rySpring.value.toFixed(3)}deg) scale(${scaleVal.toFixed(4)})`
      objEl.style.opacity = opacityVal.toFixed(3)

      bodyEl.style.transform = `translate3d(0, ${bodySinkY.toFixed(2)}px, ${bodySinkZ.toFixed(2)}px) rotateX(${bodySinkRx.toFixed(2)}deg)`
      bodyEl.style.opacity = bodyOpacity.toFixed(3)

      // Curvature optical shading vars following live spring tilt + tear crease pull
      const normY = rySpring.value / POINTER_MAX_RY_DEG
      const normX = -rxSpring.value / POINTER_MAX_RX_DEG
      const bulgeX = 50 + normY * 16
      const bulgeY = 47 + normX * 11
      const creaseX = 50 - normY * 22 + tear * 14
      const specX = 50 + normY * 36
      const specY = 44 + normX * 26
      const specAngle = 114 + normY * 14 - normX * 8

      objEl.style.setProperty('--pack-bulge-x', `${bulgeX.toFixed(2)}%`)
      objEl.style.setProperty('--pack-bulge-y', `${bulgeY.toFixed(2)}%`)
      objEl.style.setProperty('--pack-crease-x', `${creaseX.toFixed(2)}%`)
      objEl.style.setProperty('--pack-spec-x', `${specX.toFixed(2)}%`)
      objEl.style.setProperty('--pack-spec-y', `${specY.toFixed(2)}%`)
      objEl.style.setProperty('--pack-spec-angle', `${specAngle.toFixed(2)}deg`)
      objEl.style.setProperty('--pack-charge-glow', (charge * 0.92).toFixed(3))

      // Dynamic curved rim light vector oriented to live tilt
      if (rimGradRef.current) {
        const lx = 50 + normY * 50
        const ly = 35 + normX * 35
        rimGradRef.current.setAttribute('x1', `${clamp(lx - 45, 0, 100).toFixed(1)}%`)
        rimGradRef.current.setAttribute('y1', `${clamp(ly - 40, 0, 100).toFixed(1)}%`)
        rimGradRef.current.setAttribute('x2', `${clamp(lx + 45, 0, 100).toFixed(1)}%`)
        rimGradRef.current.setAttribute('y2', `${clamp(ly + 55, 0, 100).toFixed(1)}%`)
      }

      // Single-origin charging filament along the top seam (left -> right, ONE head, 14% tail behind head, no wrap)
      const showChargeFilament = charge > 0.004 && curPhase !== 'tearing' && curPhase !== 'emerging'
      if (chargeTracedRef.current && chargeTailRef.current && chargeHeadRef.current && chargeDotRef.current) {
        if (showChargeFilament) {
          const tailLen = Math.min(0.14, charge)
          const headLen = Math.min(0.032, charge)
          chargeTracedRef.current.style.opacity = (0.34 + charge * 0.36).toFixed(3)
          chargeTracedRef.current.setAttribute('stroke-dasharray', `${charge.toFixed(4)} 2`)
          chargeTracedRef.current.setAttribute('stroke-dashoffset', '0')

          chargeTailRef.current.style.opacity = (0.72 * Math.min(1, charge * 12)).toFixed(3)
          chargeTailRef.current.setAttribute('stroke-dasharray', `${tailLen.toFixed(4)} 2`)
          chargeTailRef.current.setAttribute('stroke-dashoffset', `${(-(charge - tailLen)).toFixed(4)}`)

          chargeHeadRef.current.style.opacity = Math.min(1, charge * 18).toFixed(3)
          chargeHeadRef.current.setAttribute('stroke-dasharray', `${headLen.toFixed(4)} 2`)
          chargeHeadRef.current.setAttribute('stroke-dashoffset', `${(-(charge - headLen)).toFixed(4)}`)

          const dotX = lerp(CRIMP_LEFT, CRIMP_RIGHT, charge)
          chargeDotRef.current.setAttribute('cx', dotX.toFixed(2))
          chargeDotRef.current.setAttribute('cy', SEAM_Y.toFixed(2))
          chargeDotRef.current.style.opacity = Math.min(1, charge * 16).toFixed(3)
        } else {
          chargeTracedRef.current.style.opacity = '0'
          chargeTailRef.current.style.opacity = '0'
          chargeHeadRef.current.style.opacity = '0'
          chargeDotRef.current.style.opacity = '0'
        }
      }

      // Progressive left-to-right tear jagged edge + thin bright tear head + 4-slice curling strip
      if (tearLipRef.current && tearHeadRef.current) {
        if (tear > 0.002) {
          const lipOpacity = curPhase === 'emerging' ? clamp(1 - emerge * 1.6, 0, 1) : 0.92
          tearLipRef.current.style.opacity = lipOpacity.toFixed(3)
          tearLipRef.current.setAttribute('stroke-dasharray', `${tear.toFixed(4)} 2`)
          tearLipRef.current.setAttribute('stroke-dashoffset', '0')

          const headFade = curPhase === 'tearing' ? Math.sin(Math.min(1, tear) * Math.PI) : 0
          const tx = lerp(CRIMP_LEFT, CRIMP_RIGHT, tear)
          tearHeadRef.current.setAttribute('cx', tx.toFixed(2))
          tearHeadRef.current.setAttribute('cy', SEAM_Y.toFixed(2))
          tearHeadRef.current.style.opacity = (headFade * 0.96).toFixed(3)
        } else {
          tearLipRef.current.style.opacity = '0'
          tearHeadRef.current.style.opacity = '0'
        }
      }

      // Top crimped strip progressive 4-slice left-to-right peel, curl, and flip-away
      if (stripGroupEl) {
        if (curPhase === 'emerging') {
          stripGroupEl.style.opacity = '0'
        } else if (tear > 0.002 && !reducedMotion) {
          const flipAwayP = easePack(clamp((tear - 0.62) / 0.38, 0, 1))
          const groupY = -flipAwayP * 44
          const groupX = flipAwayP * 26
          const groupRz = -flipAwayP * 18
          const groupRx = flipAwayP * 38
          stripGroupEl.style.transform = `translate3d(${groupX.toFixed(2)}px, ${groupY.toFixed(2)}px, 0) rotateX(${groupRx.toFixed(2)}deg) rotateZ(${groupRz.toFixed(2)}deg)`
          stripGroupEl.style.opacity = clamp(1 - flipAwayP * 1.15, 0, 1).toFixed(3)

          for (let i = 0; i < STRIP_SLICES.length; i++) {
            const sliceEl = stripSliceRefs.current[i]
            if (!sliceEl) continue
            const localP = easePack(clamp((tear - i * 0.14) / 0.44, 0, 1))
            const curlRx = localP * (66 + (3 - i) * 5)
            const peelY = -localP * (12 + (3 - i) * 4.5)
            const peelZ = -localP * 10
            const twistRz = -localP * (9 - i * 1.6)
            sliceEl.style.transform = `translate3d(0, ${peelY.toFixed(2)}px, ${peelZ.toFixed(2)}px) rotateX(${curlRx.toFixed(2)}deg) rotateZ(${twistRz.toFixed(2)}deg)`
          }
        } else if (tear > 0.002 && reducedMotion) {
          stripGroupEl.style.opacity = clamp(1 - tear * 1.3, 0, 1).toFixed(3)
        } else {
          stripGroupEl.style.transform = 'translate3d(0, 0, 0)'
          stripGroupEl.style.opacity = '1'
          for (let i = 0; i < STRIP_SLICES.length; i++) {
            const sliceEl = stripSliceRefs.current[i]
            if (sliceEl) sliceEl.style.transform = 'translate3d(0, 0, 0)'
          }
        }
      }

      // Subtle graphite-white interior lip glow inside the opening during emerging (no rays)
      if (openingGlowRef.current) {
        const glowVal =
          curPhase === 'emerging'
            ? Math.sin(clamp(emerge / 0.72, 0, 1) * Math.PI) * 0.82
            : curPhase === 'tearing'
              ? clamp((tear - 0.55) / 0.45, 0, 1) * 0.32
              : 0
        openingGlowRef.current.style.opacity = glowVal.toFixed(3)
      }

      // Contact shadow & faint floor reflection reacting continuously to tilt, height, and emerging fade
      const floatLift = clamp(-posY / FLOAT_AMPLITUDE_PX, 0, 1)
      const shadowX = -rySpring.value * 1.2
      const shadowY = rxSpring.value * 0.65
      const shadowScaleX = (1 - floatLift * 0.08) * (curPhase === 'charging' ? 1.04 : 1)
      const shadowOpacity =
        (0.68 - floatLift * 0.14) * opacityVal * bodyOpacity * (curPhase === 'charging' ? 1.15 : 1)

      if (shadowEl) {
        shadowEl.style.transform = `translate3d(calc(-50% + ${shadowX.toFixed(2)}px), ${shadowY.toFixed(2)}px, 0) scale(${shadowScaleX.toFixed(3)}, ${(1 - floatLift * 0.12).toFixed(3)})`
        shadowEl.style.opacity = clamp(shadowOpacity, 0, 0.85).toFixed(3)
      }

      if (reflectionEl) {
        const reflY = 8 + floatLift * 8
        const reflOpacity = (0.16 - floatLift * 0.05) * opacityVal * bodyOpacity
        reflectionEl.style.transform = `translate3d(calc(-50% + ${(shadowX * 0.6).toFixed(2)}px), ${reflY.toFixed(2)}px, 0) scale(${(0.96 - floatLift * 0.05).toFixed(3)}, 1)`
        reflectionEl.style.opacity = clamp(reflOpacity, 0, 0.22).toFixed(3)
      }

      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerleave', onWindowPointerLeave)
    }
  }, [liveMotionRef, reducedMotion, isDocumentHidden])

  const isInteractive = phase === 'idle' || phase === 'charging'

  return (
    <div
      ref={rootRef}
      onPointerDown={isInteractive ? onPointerDownPack : undefined}
      onPointerUp={isInteractive ? onPointerUpPack : undefined}
      onPointerCancel={isInteractive ? onPointerCancelPack : undefined}
      className={`relative flex flex-col items-center justify-center ${
        isInteractive ? 'cursor-pointer' : 'pointer-events-none'
      }`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* Hidden SVG clipPath definitions shared by front face, 3D depth slices, back plane & curling top strip */}
      <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden="true">
        <defs>
          <clipPath id={bodyClipId} clipPathUnits="objectBoundingBox">
            <path d={geometry.bodyPathNorm} />
          </clipPath>
          <clipPath id={stripClipId} clipPathUnits="objectBoundingBox">
            <path d={geometry.stripPathNorm} />
          </clipPath>
        </defs>
      </svg>

      {/* Reactive elliptical contact shadow */}
      <div
        ref={shadowRef}
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 left-1/2 w-[82%] h-11 rounded-full bg-black/95 blur-2xl z-0"
      />

      {/* Faint floor reflection reacting to pack tilt and height */}
      <div
        ref={reflectionRef}
        aria-hidden="true"
        className="pack-floor-reflection pointer-events-none absolute -bottom-16 left-1/2 w-[72%] h-14 z-0"
      />

      {/* Unified 3D Pack Object (zero boxes — bowed pillow silhouette + laminated curved edges) */}
      <div
        ref={objectRef}
        className="pack-3d-object relative z-10 select-none"
        style={{
          width: 'clamp(242px, min(21.5vw, 33.5vh), 356px)',
          aspectRatio: `${VB_W} / ${VB_H}`
        }}
      >
        {/* TOP CRIMPED TEAR STRIP — 4 horizontal slices curling progressively left-to-right on a hinge */}
        <div
          ref={stripGroupRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            transformStyle: 'preserve-3d',
            transformOrigin: '92% 8.5%'
          }}
        >
          {STRIP_SLICES.map((sliceIdx) => {
            const leftPct = sliceIdx * 25
            const rightPct = (3 - sliceIdx) * 25
            return (
              <div
                key={sliceIdx}
                ref={(el) => {
                  stripSliceRefs.current[sliceIdx] = el
                }}
                className="absolute inset-0"
                style={{
                  transformStyle: 'preserve-3d',
                  transformOrigin: `${leftPct + 12.5}% 8.5%`,
                  clipPath: `inset(0 ${rightPct}% 88% ${leftPct}%)`
                }}
              >
                {/* Thin foil laminate backing for the curling strip */}
                <div
                  className="absolute inset-0 bg-[#090b0e]"
                  style={{
                    clipPath: `url(#${stripClipId})`,
                    transform: 'translateZ(-3px)'
                  }}
                />
                {/* Front pressed wavy crimped strip */}
                <div
                  className="pack-crimp-texture absolute inset-0"
                  style={{
                    clipPath: `url(#${stripClipId})`,
                    transform: 'translateZ(0.4px)'
                  }}
                >
                  <div className="pack-specular-band absolute inset-0 opacity-65" />
                  <svg
                    viewBox={`0 0 ${VB_W} ${VB_H}`}
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="none"
                  >
                    <path
                      d={geometry.stripEdgeSvg}
                      fill="none"
                      stroke="rgba(255,255,255,0.22)"
                      strokeWidth="0.6"
                    />
                  </svg>
                </div>
              </div>
            )
          })}
        </div>

        {/* MAIN BOWED POUCH BODY (visible 3D curved thickness + WebGPU holo face + pillow shading) */}
        <div
          ref={bodyGroupRef}
          className="relative w-full h-full"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Solid matte graphite back face at translateZ(-18px) matching bowed silhouette */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#111419] via-[#0a0c10] to-[#0e1116]"
            style={{
              clipPath: `url(#${bodyClipId})`,
              transform: 'translateZ(-18px)'
            }}
          />

          {/* 5 laminated curved foil depth planes reading as solid metallic thickness when tilted */}
          {DEPTH_SLICES.map((zPx, idx) => (
            <div
              key={zPx}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                clipPath: `url(#${bodyClipId})`,
                transform: `translateZ(${zPx}px)`,
                background:
                  idx % 2 === 0
                    ? 'linear-gradient(90deg, #272c36 0%, #101217 12%, #0c0e12 88%, #272c36 100%)'
                    : 'linear-gradient(90deg, #161920 0%, #0b0d11 10%, #0b0d11 90%, #161920 100%)'
              }}
            />
          ))}

          {/* FRONT BOWED FOIL FACE (z = 0) */}
          <div
            className="relative w-full h-full overflow-hidden bg-[#101216]"
            style={{
              clipPath: `url(#${bodyClipId})`,
              transform: 'translateZ(0px)',
              backfaceVisibility: 'hidden'
            }}
          >
            {/* Subtle edition label near top of pouch belly */}
            {seasonName && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-6 top-[11.5%] z-20 text-center"
              >
                <span className="font-dot text-[9px] uppercase tracking-[0.28em] text-white/40">
                  {seasonName}
                </span>
              </div>
            )}

            {/* Inner WebGPU holo canvas (or CSS graphite fallback) clipped to the bowed pouch */}
            {useCssFallback ? (
              <GraphiteHoloFallback reducedMotion={reducedMotion} />
            ) : (
              <canvas
                ref={canvasRef}
                aria-label="Fieldr matte graphite holographic foil pack"
                className="block absolute left-1/2 top-[51%] -translate-x-1/2 -translate-y-1/2 w-[158%] h-[142%] touch-none"
              />
            )}

            {/* Pressed bottom crimp band integrated cleanly at y >= 142.8 */}
            <div
              aria-hidden="true"
              className="pack-crimp-texture pointer-events-none absolute inset-x-0 bottom-0 h-[8.6%] z-10 border-t border-white/[0.10]"
            />

            {/* Pillow curvature normal shading overlaid ON TOP of holo face so it reads as one curved object */}
            <div
              aria-hidden="true"
              className="pack-curvature-shading pointer-events-none absolute inset-0 z-10"
            />

            {/* 4 soft organic pillow creases shifting with tilt and tear */}
            <div
              aria-hidden="true"
              className="pack-curvature-creases pointer-events-none absolute inset-0 z-10"
            />

            {/* Broad monochrome specular band sweeping across curved body */}
            <div
              aria-hidden="true"
              className="pack-specular-band pointer-events-none absolute inset-0 z-20"
            />

            {/* Subtle foil lift while charging */}
            <div
              aria-hidden="true"
              className="pack-charge-sheen pointer-events-none absolute inset-0 z-20"
            />

            {/* Subtle graphite-white glow illuminating the torn mouth as cards emerge (no rays) */}
            <div
              ref={openingGlowRef}
              aria-hidden="true"
              className="pack-opening-glow pointer-events-none absolute inset-x-[6%] top-[8%] h-[16%] z-20 opacity-0"
            />
          </div>

          {/* Crisp SVG vector overlay: bowed rim light, resting seam, single-origin charge filament & jagged tear head */}
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 w-full h-full z-30 overflow-visible"
            style={{ transform: 'translateZ(1px)' }}
          >
            <defs>
              <linearGradient
                ref={rimGradRef}
                id={rimGradId}
                x1="8%"
                y1="12%"
                x2="92%"
                y2="86%"
              >
                <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
                <stop offset="28%" stopColor="rgba(206,222,240,0.22)" />
                <stop offset="56%" stopColor="rgba(255,255,255,0.06)" />
                <stop offset="82%" stopColor="rgba(214,202,232,0.16)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.28)" />
              </linearGradient>
            </defs>

            {/* Bowed silhouette hairline & grazing rim light */}
            <path
              d={geometry.rimStrokeSvg}
              fill="none"
              stroke={`url(#${rimGradId})`}
              strokeWidth="0.62"
              vectorEffect="non-scaling-stroke"
            />

            {/* Resting faint diffraction seam line */}
            <path
              d={geometry.seamPathSvg}
              fill="none"
              stroke="rgba(216, 226, 240, 0.22)"
              strokeWidth="0.45"
              vectorEffect="non-scaling-stroke"
            />

            {/* Charging filament: dim already-traced portion behind single head */}
            <path
              ref={chargeTracedRef}
              d={geometry.seamPathSvg}
              pathLength={1}
              fill="none"
              stroke="rgba(210, 224, 240, 0.52)"
              strokeWidth="1.2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ opacity: 0 }}
            />

            {/* Charging filament: soft 14% comet tail strictly behind head (no wrap) */}
            <path
              ref={chargeTailRef}
              d={geometry.seamPathSvg}
              pathLength={1}
              fill="none"
              stroke="rgba(232, 240, 250, 0.78)"
              strokeWidth="1.8"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ opacity: 0 }}
            />

            {/* Charging filament: ONE bright head at x = charge */}
            <path
              ref={chargeHeadRef}
              d={geometry.seamPathSvg}
              pathLength={1}
              fill="none"
              stroke="rgba(255, 255, 255, 0.98)"
              strokeWidth="2.4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ opacity: 0 }}
            />

            {/* Crisp point highlight riding the single charging head */}
            <circle
              ref={chargeDotRef}
              cx={CRIMP_LEFT}
              cy={SEAM_Y}
              r="1.15"
              fill="rgba(255,255,255,0.95)"
              style={{ opacity: 0 }}
            />

            {/* Progressive jagged foil cut lip revealed left-to-right during tear */}
            <path
              ref={tearLipRef}
              d={geometry.seamPathSvg}
              pathLength={1}
              fill="none"
              stroke="rgba(236, 242, 250, 0.88)"
              strokeWidth="1.4"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              style={{ opacity: 0 }}
            />

            {/* Thin bright tear head riding the progressive split */}
            <circle
              ref={tearHeadRef}
              cx={CRIMP_LEFT}
              cy={SEAM_Y}
              r="1.45"
              fill="rgba(255,255,255,0.96)"
              style={{ opacity: 0 }}
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
