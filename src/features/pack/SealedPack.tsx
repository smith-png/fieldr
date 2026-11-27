import React, { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { FIELDR_MARK_PATH, waitForBrandFonts } from '../holo/logoMask'
import { createRenderer } from '../holo/renderer'
import { PACK_EASE, type OpeningStep } from './types'

interface SealedPackProps {
  seasonName?: string | null
  phase: 'sealed' | 'opening'
  openingStep: OpeningStep
  reducedMotion: boolean
  isDocumentHidden?: boolean
}

const IDLE_SWAY_PERIOD_SEC = 7
const FLOAT_PERIOD_SEC = 6
const FLOAT_AMPLITUDE_PX = 6
const IDLE_MAX_RY_DEG = 9
const IDLE_MAX_RX_DEG = 4
const POINTER_MAX_RY_DEG = 18
const POINTER_MAX_RX_DEG = 10
const POINTER_IDLE_RETURN_MS = 1500
const SPRING_STIFFNESS = 120
const SPRING_DAMPING = 20

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function hasWebGpuSupport(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(navigator.gpu)
}

interface GraphitePackFaceFallbackProps {
  reducedMotion: boolean
}

const GraphitePackFaceFallback: React.FC<GraphitePackFaceFallbackProps> = ({
  reducedMotion
}) => {
  const gradientId = useId()

  useEffect(() => {
    void waitForBrandFonts()
  }, [])

  return (
    <div
      role="img"
      aria-label="Fieldr matte graphite holographic foil pack"
      className="relative w-full h-full overflow-hidden flex flex-col items-center justify-center bg-gradient-to-b from-[#13161b] via-[#101216] to-[#0d0f13]"
    >
      {/* Subtle tilt/pointer-following cool-silver grazing sheen driven by parent CSS vars */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.72,
          background:
            'radial-gradient(240px circle at var(--pack-bulge-x, 50%) var(--pack-bulge-y, 44%), rgba(204, 220, 236, 0.16), rgba(164, 186, 210, 0.06) 38%, transparent 70%)'
        }}
      />

      {/* Faint hairline inner frame */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[10px] border border-white/[0.06]"
      />

      {/* Faint diffraction sheen drifting across the pack face and F mark */}
      {!reducedMotion && (
        <div
          aria-hidden="true"
          className="pack-fallback-diffraction pointer-events-none absolute inset-0 opacity-60 mix-blend-screen"
        />
      )}

      {/* Centred Fieldr F mark drawn as an outline with faint diffraction stroke */}
      <svg
        viewBox="17 14 31 36"
        fill="none"
        className="relative z-10 w-[44%] h-auto -translate-y-2"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.28)" />
            <stop offset="35%" stopColor="rgba(196, 216, 236, 0.62)" />
            <stop offset="56%" stopColor="rgba(218, 204, 234, 0.56)" />
            <stop offset="78%" stopColor="rgba(192, 218, 228, 0.45)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.26)" />
          </linearGradient>
        </defs>
        <path
          d={FIELDR_MARK_PATH}
          fill="rgba(255, 255, 255, 0.03)"
          stroke={`url(#${gradientId})`}
          strokeWidth="0.65"
          strokeLinejoin="miter"
        />
      </svg>

      {/* Subtle FIELDR / AUCTIONS bottom lockup matching holo/logoMask.ts */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex flex-col items-center gap-1 text-center"
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

export const SealedPack: React.FC<SealedPackProps> = ({
  seasonName,
  phase,
  openingStep,
  reducedMotion,
  isDocumentHidden = false
}) => {
  const sceneRef = useRef<HTMLDivElement>(null)
  const objectRef = useRef<HTMLDivElement>(null)
  const shadowRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  const [useCssFallback, setUseCssFallback] = useState<boolean>(() => !hasWebGpuSupport())

  const phaseRef = useRef(phase)
  const openingStepRef = useRef(openingStep)
  phaseRef.current = phase
  openingStepRef.current = openingStep

  // Initialize and cleanly dispose the single holo WebGPU renderer on mount / unmount
  useEffect(() => {
    if (useCssFallback) return
    const canvas = canvasRef.current
    if (!canvas) return
    let mounted = true
    const renderer = createRenderer(canvas)
    rendererRef.current = renderer
    void renderer.ready.catch(() => {
      if (!mounted) return
      setUseCssFallback(true)
    })
    return () => {
      mounted = false
      if (rendererRef.current === renderer) {
        rendererRef.current = null
      }
      renderer.dispose()
    }
  }, [useCssFallback])

  // Unified 3D tilt, spring smoothing, 7s idle sway, 6s float, specular/rim light, and contact shadow loop
  useEffect(() => {
    const objEl = objectRef.current
    const shadowEl = shadowRef.current
    if (!objEl) return

    const resetNeutral = () => {
      objEl.style.setProperty('--pack-rx', '0deg')
      objEl.style.setProperty('--pack-ry', '0deg')
      objEl.style.setProperty('--pack-float-y', '0px')
      objEl.style.setProperty('--pack-z', '0px')
      objEl.style.setProperty('--pack-bulge-x', '50%')
      objEl.style.setProperty('--pack-bulge-y', '48%')
      objEl.style.setProperty('--pack-crease-x', '50%')
      objEl.style.setProperty('--pack-spec-x', '50%')
      objEl.style.setProperty('--pack-spec-y', '44%')
      objEl.style.setProperty('--pack-spec-angle', '114deg')
      objEl.style.setProperty('--pack-rim-angle', '125deg')
      if (shadowEl) {
        shadowEl.style.setProperty('--pack-shadow-x', '0px')
        shadowEl.style.setProperty('--pack-shadow-y', '0px')
        shadowEl.style.setProperty('--pack-shadow-scale', '1')
        shadowEl.style.setProperty('--pack-shadow-opacity', '0.64')
      }
    }

    if (reducedMotion || isDocumentHidden) {
      if (reducedMotion) resetNeutral()
      return
    }

    let rafId: number | null = null
    let lastTimeMs = performance.now()
    let elapsedSec = 0

    // Spring state for rotateX, rotateY, floatY, translateZ
    let rx = 0
    let ry = 0
    let vRx = 0
    let vRy = 0
    let floatY = 0
    let zOffset = 0
    let currentShadowScale = 1
    let currentShadowOpacity = 0.64

    // Pointer tracking
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
        // Ignore if PointerEvent constructor is unavailable
      }
    }

    const onWindowPointerMove = (event: PointerEvent) => {
      if (!event.isPrimary || phaseRef.current !== 'sealed') return
      const scene = sceneRef.current
      if (!scene) return

      const rect = scene.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const normRadiusX = Math.max(rect.width * 0.95, 220)
      const normRadiusY = Math.max(rect.height * 0.95, 280)

      const nx = clamp((event.clientX - cx) / normRadiusX, -1, 1)
      const ny = clamp((event.clientY - cy) / normRadiusY, -1, 1)

      pointerTargetRy = clamp(nx * POINTER_MAX_RY_DEG, -POINTER_MAX_RY_DEG, POINTER_MAX_RY_DEG)
      pointerTargetRx = clamp(-ny * POINTER_MAX_RX_DEG, -POINTER_MAX_RX_DEG, POINTER_MAX_RX_DEG)
      pointerActive = true
      lastPointerMoveMs = performance.now()
      notifiedCanvasIdle = false

      // Keep the WebGPU holo canvas pointer/tilt uniforms consistent even when cursor is outside the canvas
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

      const curPhase = phaseRef.current
      const curStep = openingStepRef.current

      // Return to idle sway 1.5s after pointer stops
      if (pointerActive && now - lastPointerMoveMs >= POINTER_IDLE_RETURN_MS) {
        pointerActive = false
        dispatchCanvasLeave()
      }

      let targetRx = 0
      let targetRy = 0
      let targetFloatY = 0
      let targetZ = 0

      if (curPhase === 'sealed') {
        // Gentle 6s float (0 -> -6px)
        const floatWave = 0.5 - 0.5 * Math.cos((elapsedSec * 2 * Math.PI) / FLOAT_PERIOD_SEC)
        targetFloatY = -FLOAT_AMPLITUDE_PX * floatWave

        if (pointerActive) {
          targetRx = pointerTargetRx
          targetRy = pointerTargetRy
        } else {
          // Continuous slow 7s sway: rotateY +-9deg, rotateX +-4deg
          const swayPhase = (elapsedSec * 2 * Math.PI) / IDLE_SWAY_PERIOD_SEC
          targetRy = Math.sin(swayPhase) * IDLE_MAX_RY_DEG
          targetRx = Math.cos(swayPhase) * IDLE_MAX_RX_DEG
        }
      } else if (curStep === 'anticipation') {
        // Anticipation: rotate a few degrees toward the camera and settle forward
        targetRx = 5.5
        targetRy = -3.5
        targetFloatY = 0
        targetZ = 22
      } else if (curStep === 'tear') {
        // Hold poised angle while the top strip hinges backward in 3D
        targetRx = 4.5
        targetRy = -2.5
        targetFloatY = 0
        targetZ = 18
      } else {
        // Release: gentle pitch back as body sinks away
        targetRx = -5
        targetRy = 0
        targetFloatY = 0
        targetZ = -18
      }

      // Spring integration (stiffness 120, damping 20, low bounce)
      const aRx = (targetRx - rx) * SPRING_STIFFNESS - vRx * SPRING_DAMPING
      const aRy = (targetRy - ry) * SPRING_STIFFNESS - vRy * SPRING_DAMPING
      vRx += aRx * dt
      vRy += aRy * dt
      rx = clamp(rx + vRx * dt, -POINTER_MAX_RX_DEG, POINTER_MAX_RX_DEG)
      ry = clamp(ry + vRy * dt, -POINTER_MAX_RY_DEG, POINTER_MAX_RY_DEG)

      const smoothFollow = 1 - Math.exp(-8 * dt)
      floatY += (targetFloatY - floatY) * smoothFollow
      zOffset += (targetZ - zOffset) * smoothFollow

      // Derive consistent optical coordinates from the live spring tilt
      const normY = ry / POINTER_MAX_RY_DEG // -1 .. +1 (left .. right)
      const normX = -rx / POINTER_MAX_RX_DEG // -1 .. +1 (top .. bottom)

      const bulgeX = 50 + normY * 14
      const bulgeY = 48 + normX * 10
      const creaseX = 50 - normY * 22
      const specX = 50 + normY * 38
      const specY = 44 + normX * 26
      const specAngle = 114 + normY * 14 - normX * 8
      const rimAngle = 125 + normY * 42 + normX * 22

      objEl.style.setProperty('--pack-rx', `${rx.toFixed(3)}deg`)
      objEl.style.setProperty('--pack-ry', `${ry.toFixed(3)}deg`)
      objEl.style.setProperty('--pack-float-y', `${floatY.toFixed(2)}px`)
      objEl.style.setProperty('--pack-z', `${zOffset.toFixed(2)}px`)
      objEl.style.setProperty('--pack-bulge-x', `${bulgeX.toFixed(2)}%`)
      objEl.style.setProperty('--pack-bulge-y', `${bulgeY.toFixed(2)}%`)
      objEl.style.setProperty('--pack-crease-x', `${creaseX.toFixed(2)}%`)
      objEl.style.setProperty('--pack-spec-x', `${specX.toFixed(2)}%`)
      objEl.style.setProperty('--pack-spec-y', `${specY.toFixed(2)}%`)
      objEl.style.setProperty('--pack-spec-angle', `${specAngle.toFixed(2)}deg`)
      objEl.style.setProperty('--pack-rim-angle', `${rimAngle.toFixed(2)}deg`)

      // Reactive contact shadow: shifts opposite to tilt, shrinks as pack floats up
      if (shadowEl) {
        const floatLift = clamp(-floatY / FLOAT_AMPLITUDE_PX, 0, 1)
        const shadowX = -ry * 1.15
        const shadowY = rx * 0.65

        let targetShadowScale = 1 - floatLift * 0.09
        let targetShadowOpacity = 0.66 - floatLift * 0.14

        if (curPhase === 'opening') {
          if (curStep === 'anticipation' || curStep === 'tear') {
            targetShadowScale = 1.08
            targetShadowOpacity = 0.9
          } else {
            targetShadowScale = 0.86
            targetShadowOpacity = 0
          }
        }

        const shadowFollow = 1 - Math.exp(-7 * dt)
        currentShadowScale += (targetShadowScale - currentShadowScale) * shadowFollow
        currentShadowOpacity += (targetShadowOpacity - currentShadowOpacity) * shadowFollow

        shadowEl.style.setProperty('--pack-shadow-x', `${shadowX.toFixed(2)}px`)
        shadowEl.style.setProperty('--pack-shadow-y', `${shadowY.toFixed(2)}px`)
        shadowEl.style.setProperty('--pack-shadow-scale', currentShadowScale.toFixed(3))
        shadowEl.style.setProperty('--pack-shadow-opacity', currentShadowOpacity.toFixed(3))
      }

      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerleave', onWindowPointerLeave)
    }
  }, [reducedMotion, isDocumentHidden])

  const isSealed = phase === 'sealed'
  const isAnticipation = openingStep === 'anticipation'
  const isTearing = openingStep === 'tear' || openingStep === 'release'
  const isReleasing = openingStep === 'release'
  const isAnimating3d = !reducedMotion && !isDocumentHidden

  return (
    <div
      ref={sceneRef}
      className={`pack-3d-scene relative flex flex-col items-center justify-center ${
        phase === 'opening' ? 'pointer-events-none' : ''
      }`}
    >
      {/* Reactive elliptical contact shadow — shifts opposite to tilt & shrinks as pack floats up */}
      <div
        ref={shadowRef}
        aria-hidden="true"
        style={
          reducedMotion
            ? {
                opacity: phase === 'opening' ? 0 : 0.62,
                transition: 'opacity 300ms cubic-bezier(0.22, 1, 0.36, 1)'
              }
            : undefined
        }
        className="pack-contact-shadow pointer-events-none absolute -bottom-7 left-1/2 w-[84%] h-11 rounded-full bg-black/95 blur-2xl z-0"
      />

      {/* Entrance + Anticipation settle forward (scale 1.03); preserve-3d kept intact */}
      <motion.div
        style={{
          width: 'clamp(242px, min(22vw, 34vh), 356px)',
          transformStyle: 'preserve-3d'
        }}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.96, y: reducedMotion ? 0 : 12 }}
        animate={
          reducedMotion && phase === 'opening'
            ? { opacity: 0, scale: 1, y: 0 }
            : isAnticipation || openingStep === 'tear' || isReleasing
              ? { opacity: 1, scale: 1.03, y: 0 }
              : { opacity: 1, scale: 1, y: 0 }
        }
        transition={{
          duration: reducedMotion ? 0.3 : 0.8,
          ease: PACK_EASE
        }}
        className="relative z-10 select-none"
      >
        {/* Solid 3D Foil Pack wrapper — will-change: transform applied ONLY while animating */}
        <div
          ref={objectRef}
          className={`pack-3d-object relative w-full ${isAnimating3d ? 'pack-3d-animating' : ''}`}
        >
          {/* TOP CRIMPED TEAR STRIP — hinges on bottom edge & peels backwards 72deg in 3D during Tear */}
          <div className="pack-3d-layer relative z-20 w-full" style={{ transform: 'translateZ(-2px)' }}>
            <motion.div
              animate={
                isTearing && !reducedMotion
                  ? { rotateX: 72, y: -42, z: -12, opacity: 0 }
                  : { rotateX: 0, y: 0, z: 0, opacity: 1 }
              }
              transition={{ duration: reducedMotion ? 0.2 : 0.7, ease: PACK_EASE }}
              style={{
                height: 'clamp(30px, 4.2vh, 44px)',
                transformOrigin: 'bottom center',
                transformStyle: 'preserve-3d'
              }}
              className="relative w-full"
            >
              {/* Pressed front crimped strip */}
              <div className="pack-crimp-top-mask pack-crimp-pressed-top relative w-full h-full overflow-hidden border-x border-white/[0.16]">
                {/* Thin white hairline tracing the zigzag top edge */}
                <div
                  aria-hidden="true"
                  className="pack-crimp-top-hairline pointer-events-none absolute inset-x-0 top-0 h-[6px] z-10"
                />
                {/* Darker, finer pressed foil vertical crimp ridges */}
                <div
                  aria-hidden="true"
                  className="pack-crimp-ridges pointer-events-none absolute inset-x-0 top-[6px] bottom-[4px] opacity-90"
                />
                {/* Specular highlight sliding subtly across crimp */}
                <div
                  aria-hidden="true"
                  className="pack-specular-band pointer-events-none absolute inset-0 opacity-60"
                />
                {/* Hairline rule just above the tear seam */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/[0.14]"
                />
              </div>

              {/* Thin foil backing laminate for the crimped tear strip */}
              <div
                aria-hidden="true"
                className="pack-crimp-top-mask pointer-events-none absolute inset-0 bg-[#0a0c10] border-x border-white/[0.08]"
                style={{ transform: 'translateZ(-3px)' }}
              />
            </motion.div>
          </div>

          {/* TOP TEAR SEAM — thin diffraction hairline; single specular line slides across on Anticipation */}
          <motion.div
            aria-hidden="true"
            animate={{
              height: isTearing && !reducedMotion ? 3 : 1,
              opacity: isReleasing ? 0 : 1
            }}
            transition={{ duration: 0.7, ease: PACK_EASE }}
            className="relative z-30 w-full overflow-hidden bg-[#060709]"
            style={{ transform: 'translateZ(0.5px)' }}
          >
            {/* Resting hairline diffraction seam */}
            <div
              className={`pack-seam-foil absolute inset-x-0 top-0 h-px transition-opacity duration-500 ${
                isTearing ? 'opacity-15' : 'opacity-100'
              }`}
            />
            {/* Single specular foil line sweeping once across the top seam during Anticipation (800ms) */}
            {isAnticipation && !reducedMotion && (
              <div className="pack-seam-specular pointer-events-none absolute inset-y-0 left-0 w-[38%] h-[1.5px]" />
            )}
            {/* Thin bright torn foil lip exposed along the tear */}
            {isTearing && !reducedMotion && (
              <motion.div
                initial={{ opacity: 0, scaleX: 0.35 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ duration: 0.35, ease: PACK_EASE }}
                className="pack-tear-bright-edge pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px]"
              />
            )}
          </motion.div>

          {/* MAIN 3D PACK BODY (18px thick solid object) — sinks and fades cleanly over 900ms during Release */}
          <motion.div
            animate={
              isReleasing && !reducedMotion
                ? { y: 96, z: -24, scale: 0.96, opacity: 0 }
                : { y: 0, z: 0, scale: 1, opacity: 1 }
            }
            transition={{ duration: reducedMotion ? 0.25 : 0.9, ease: PACK_EASE }}
            style={{ transformStyle: 'preserve-3d' }}
            className="relative w-full"
          >
            {/* 3D Solid Body Block: front face (z=0), laminated depth planes (-6px, -12px), side foil walls, back face (-18px) */}
            <div
              className="pack-3d-layer relative w-full"
              style={{ aspectRatio: '128 / 182' }}
            >
              {/* Back face at translateZ(-18px) */}
              <div aria-hidden="true" className="pack-back-face pointer-events-none" />

              {/* Layered depth planes reading as foil thickness at oblique angles */}
              <div aria-hidden="true" className="pack-depth-plane-deep pointer-events-none" />
              <div aria-hidden="true" className="pack-depth-plane-mid pointer-events-none" />

              {/* Visible graphite foil side edges with hairline highlights */}
              <div aria-hidden="true" className="pack-side-left pointer-events-none" />
              <div aria-hidden="true" className="pack-side-right pointer-events-none" />
              <div aria-hidden="true" className="pack-side-top pointer-events-none" />
              <div aria-hidden="true" className="pack-side-bottom pointer-events-none" />

              {/* FRONT FACE at translateZ(0px): WebGPU holo renderer or CSS fallback + pillow & lighting overlays */}
              <div
                className="relative w-full h-full overflow-hidden border-x border-white/[0.16] bg-[#101216]"
                style={{
                  transform: 'translateZ(0px)',
                  backfaceVisibility: 'hidden',
                  boxShadow:
                    isAnticipation || openingStep === 'tear'
                      ? '0 32px 80px rgba(0, 0, 0, 0.86)'
                      : '0 22px 58px rgba(0, 0, 0, 0.72)',
                  transition: 'box-shadow 800ms cubic-bezier(0.22, 1, 0.36, 1)'
                }}
              >
                {/* Thin bright edge along the torn top lip of the pack body */}
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 top-0 z-30 transition-opacity duration-500 ${
                    isTearing && !reducedMotion
                      ? 'h-[1.5px] pack-tear-bright-edge opacity-95'
                      : 'h-px bg-white/[0.14] opacity-100'
                  }`}
                />

                {/* Subtle edition label at top of pack face */}
                {seasonName && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-4 top-3.5 z-20 text-center"
                  >
                    <span className="font-dot text-[9px] uppercase tracking-[0.28em] text-white/38">
                      {seasonName}
                    </span>
                  </div>
                )}

                {useCssFallback ? (
                  <GraphitePackFaceFallback reducedMotion={reducedMotion} />
                ) : (
                  <canvas
                    ref={canvasRef}
                    aria-label="Fieldr matte graphite holographic foil pack"
                    className="block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[156%] h-[156%] touch-none"
                  />
                )}

                {/* Pillow inflation: soft top/bottom crimp pinch shadows + broad central bulge */}
                <div
                  aria-hidden="true"
                  className="pack-pillow-shading pointer-events-none absolute inset-0 z-10"
                />

                {/* 4 faint vertical pillow crease bands shifting gently with tilt */}
                <div
                  aria-hidden="true"
                  className="pack-pillow-creases pointer-events-none absolute inset-0 z-10"
                />

                {/* Subtle white specular band (10-14% opacity, soft-light) sliding across foil with tilt */}
                <div
                  aria-hidden="true"
                  className="pack-specular-band pointer-events-none absolute inset-0 z-20"
                />

                {/* Grazing rim light tracing the silhouette edge facing the light */}
                <div
                  aria-hidden="true"
                  className="pack-rim-light pointer-events-none absolute inset-0 z-20"
                />
              </div>
            </div>

            {/* BOTTOM CRIMPED SEAL — pressed, darker, finer ridges, slightly recessed */}
            <div
              className="pack-3d-layer relative w-full"
              style={{
                height: 'clamp(22px, 3vh, 32px)',
                transform: 'translateZ(-2px)'
              }}
            >
              <div className="pack-crimp-bottom-mask pack-crimp-pressed-bottom relative w-full h-full overflow-hidden border-x border-white/[0.15]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.10]"
                />
                <div
                  aria-hidden="true"
                  className="pack-crimp-ridges pointer-events-none absolute inset-x-0 top-[4px] bottom-[6px] opacity-90"
                />
                <div
                  aria-hidden="true"
                  className="pack-specular-band pointer-events-none absolute inset-0 opacity-50"
                />
                <div
                  aria-hidden="true"
                  className="pack-crimp-bottom-hairline pointer-events-none absolute inset-x-0 bottom-0 h-[6px] z-10"
                />
              </div>
              {/* Thin foil backing laminate for the bottom crimped seal */}
              <div
                aria-hidden="true"
                className="pack-crimp-bottom-mask pointer-events-none absolute inset-0 bg-[#0a0c10] border-x border-white/[0.08]"
                style={{ transform: 'translateZ(-3px)' }}
              />
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Prompt below the sealed pack — fades in after 1.2s in font-dot, 40% white */}
      {isSealed && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: reducedMotion ? 0.25 : 0.85,
            delay: reducedMotion ? 0 : 1.2,
            ease: PACK_EASE
          }}
          className="pointer-events-none absolute top-full mt-[clamp(22px,3.2vh,38px)] whitespace-nowrap font-dot text-[clamp(10px,0.85vw,13px)] uppercase tracking-[0.28em] text-white/40 text-center"
        >
          PRESS SPACE TO OPEN
        </motion.p>
      )}
    </div>
  )
}
