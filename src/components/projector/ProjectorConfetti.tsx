import React, { useEffect, useRef, useState } from 'react'

interface ProjectorConfettiProps {
  triggerCount: number
  reducedMotion?: boolean
}

interface ConfettiBatch {
  id: number
  remainingAirborne: number
  allLandedAt: number | null
}

interface ConfettiPiece {
  batch: ConfettiBatch
  x: number
  y: number
  vx: number
  vy: number
  gravity: number
  drag: number
  width: number
  height: number
  color: string
  isLight: boolean
  rotation: number
  rotationSpeed: number
  tiltAngle: number
  tiltSpeed: number
  swayPhase: number
  swaySpeed: number
  swayAmp: number
  releaseTime: number
  restingYRatio: number
  landedAt: number | null
  landStartRotation: number
  landTargetRotation: number
  landStartCosTilt: number
  landTargetCosTilt: number
}

// Existing green accent, lighter and darker shades of that green, white and off-white
const CONFETTI_PALETTE: { color: string; isLight: boolean }[] = [
  { color: '#047554', isLight: false }, // accent-bright
  { color: '#395F3D', isLight: false }, // accent
  { color: '#38A884', isLight: false }, // lighter green shade
  { color: '#1E3F24', isLight: false }, // darker green shade
  { color: '#FFFFFF', isLight: true },  // white
  { color: '#F0F2EE', isLight: true }   // off-white
]

const PIECES_PER_TRIGGER = 450
const MAX_TOTAL_PIECES = 1200
const RELEASE_DURATION_MS = 3000
const LAND_SETTLE_MS = 200
const GROUND_HOLD_MS = 3000
const GROUND_FADE_MS = 1500

function createShowerBatch(
  batchId: number,
  count: number,
  baseReleaseTime: number,
  viewportWidth: number
): ConfettiPiece[] {
  const safeWidth = Math.max(320, viewportWidth)
  const batch: ConfettiBatch = {
    id: batchId,
    remainingAirborne: count,
    allLandedAt: null
  }

  const pieces: ConfettiPiece[] = []

  for (let i = 0; i < count; i++) {
    const isSlimStrip = Math.random() < 0.16
    const width = isSlimStrip
      ? 16 + Math.random() * 6 // 16 to 22px slim strips
      : 8 + Math.random() * 8  // 8 to 16px varied rectangles
    const height = isSlimStrip
      ? 4 + Math.random() * 1.5
      : 4 + Math.random() * 5  // 4 to 9px height

    // Spread across full width
    const x = ((i + Math.random()) / count) * safeWidth

    // Continuous 3-second release with a slightly denser release in the first second
    const u = Math.random()
    const releaseOffsetMs = Math.pow(u, 1.35) * RELEASE_DURATION_MS

    // Slightly varied fall speed per piece
    const speedFactor = 0.78 + Math.random() * 0.48
    const paletteItem =
      CONFETTI_PALETTE[Math.floor(Math.random() * CONFETTI_PALETTE.length)]

    const initialRotation = Math.random() * Math.PI * 2
    const initialTilt = Math.random() * Math.PI * 2

    pieces.push({
      batch,
      x,
      y: -16 - Math.random() * 44,
      vx: (Math.random() - 0.5) * 34,
      vy: (85 + Math.random() * 65) * speedFactor,
      gravity: (78 + Math.random() * 38) * speedFactor,
      drag: 0.983 + Math.random() * 0.005,
      width,
      height,
      color: paletteItem.color,
      isLight: paletteItem.isLight,
      rotation: initialRotation,
      rotationSpeed: (Math.random() - 0.5) * 2.5,
      tiltAngle: initialTilt,
      tiltSpeed: 2.0 + Math.random() * 3.2,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 1.2 + Math.random() * 1.4,
      swayAmp: 18 + Math.random() * 26,
      releaseTime: baseReleaseTime + releaseOffsetMs,
      // Resting height in the bottom 6 percent of the screen (94% to 99.6%)
      restingYRatio: 0.94 + Math.random() * 0.056,
      landedAt: null,
      landStartRotation: initialRotation,
      landTargetRotation: 0,
      landStartCosTilt: 1,
      landTargetCosTilt: 0.65 + Math.random() * 0.25
    })
  }

  return pieces
}

export const ProjectorConfetti: React.FC<ProjectorConfettiProps> = ({
  triggerCount,
  reducedMotion = false
}) => {
  const [isActive, setIsActive] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const piecesRef = useRef<ConfettiPiece[]>([])
  const rafIdRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number | null>(null)
  const lastHandledTriggerRef = useRef<number>(triggerCount)
  const nextBatchIdRef = useRef<number>(1)

  useEffect(() => {
    if (triggerCount <= 0 || triggerCount === lastHandledTriggerRef.current) {
      return
    }
    lastHandledTriggerRef.current = triggerCount

    if (reducedMotion) {
      return
    }

    if (
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    const now = performance.now()
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
    const batchId = nextBatchIdRef.current++

    const newPieces = createShowerBatch(
      batchId,
      PIECES_PER_TRIGGER,
      now,
      viewportWidth
    )

    const combined = piecesRef.current.concat(newPieces)
    if (combined.length > MAX_TOTAL_PIECES) {
      const overflow = combined.length - MAX_TOTAL_PIECES
      for (let i = 0; i < overflow; i++) {
        const removed = combined[i]
        if (removed.landedAt === null) {
          removed.batch.remainingAirborne = Math.max(
            0,
            removed.batch.remainingAirborne - 1
          )
          if (
            removed.batch.remainingAirborne === 0 &&
            removed.batch.allLandedAt === null
          ) {
            removed.batch.allLandedAt = now
          }
        }
      }
      piecesRef.current = combined.slice(overflow)
    } else {
      piecesRef.current = combined
    }

    setIsActive(true)
  }, [triggerCount, reducedMotion])

  useEffect(() => {
    if (reducedMotion && isActive) {
      piecesRef.current = []
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      setIsActive(false)
    }
  }, [reducedMotion, isActive])

  useEffect(() => {
    if (!isActive) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight

    const syncCanvasSize = () => {
      const nextWidth = window.innerWidth
      const nextHeight = window.innerHeight
      if (width > 0 && nextWidth !== width) {
        const xScale = nextWidth / width
        const active = piecesRef.current
        for (let i = 0; i < active.length; i++) {
          active[i].x *= xScale
        }
      }
      if (height > 0 && nextHeight !== height) {
        const active = piecesRef.current
        for (let i = 0; i < active.length; i++) {
          if (active[i].landedAt !== null) {
            active[i].y = nextHeight * active[i].restingYRatio
          }
        }
      }
      width = nextWidth
      height = nextHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    syncCanvasSize()
    window.addEventListener('resize', syncCanvasSize)
    lastFrameTimeRef.current = performance.now()

    const tick = (now: number) => {
      const prevTime = lastFrameTimeRef.current ?? now
      const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000))
      lastFrameTimeRef.current = now

      ctx.clearRect(0, 0, width, height)

      const activePieces = piecesRef.current
      let writeIdx = 0

      for (let i = 0; i < activePieces.length; i++) {
        const p = activePieces[i]

        if (now < p.releaseTime) {
          activePieces[writeIdx++] = p
          continue
        }

        // Check batch fade-out after all pieces of its batch have landed
        let alpha = 1
        if (p.batch.allLandedAt !== null) {
          const sinceAllLanded = now - p.batch.allLandedAt
          if (sinceAllLanded >= GROUND_HOLD_MS + GROUND_FADE_MS) {
            continue
          }
          if (sinceAllLanded > GROUND_HOLD_MS) {
            alpha = Math.max(
              0,
              1 - (sinceAllLanded - GROUND_HOLD_MS) / GROUND_FADE_MS
            )
          }
        }

        const floorY = height * p.restingYRatio

        if (p.landedAt === null) {
          const elapsedAirSec = (now - p.releaseTime) / 1000
          const frameDrag = Math.pow(p.drag, dt * 60)
          p.vy = (p.vy + p.gravity * dt) * frameDrag
          p.vx = p.vx * frameDrag

          const swayVx =
            Math.sin(p.swayPhase + elapsedAirSec * p.swaySpeed) * p.swayAmp
          p.x += (p.vx + swayVx) * dt
          p.y += p.vy * dt

          // Keep horizontally within bounds with soft wrap
          if (p.x < -24) p.x = width + 24
          else if (p.x > width + 24) p.x = -24

          p.rotation += p.rotationSpeed * dt
          p.tiltAngle += p.tiltSpeed * dt

          if (p.y >= floorY) {
            p.y = floorY
            p.landedAt = now
            p.landStartRotation = p.rotation
            // Ease rotation to nearest flat horizontal orientation with slight natural variance
            const nearestFlat = Math.round(p.rotation / Math.PI) * Math.PI
            p.landTargetRotation = nearestFlat + (Math.random() - 0.5) * 0.26
            p.landStartCosTilt = Math.max(0.15, Math.abs(Math.cos(p.tiltAngle)))

            p.batch.remainingAirborne = Math.max(
              0,
              p.batch.remainingAirborne - 1
            )
            if (
              p.batch.remainingAirborne === 0 &&
              p.batch.allLandedAt === null
            ) {
              p.batch.allLandedAt = now
            }
          }
        }

        let renderRotation: number
        let apparentHeight: number

        if (p.landedAt !== null) {
          const settleProgress = Math.min(
            1,
            Math.max(0, (now - p.landedAt) / LAND_SETTLE_MS)
          )
          // Ease out cubic over 200ms
          const eased = 1 - Math.pow(1 - settleProgress, 3)
          renderRotation =
            p.landStartRotation +
            (p.landTargetRotation - p.landStartRotation) * eased
          const cosFactor =
            p.landStartCosTilt +
            (p.landTargetCosTilt - p.landStartCosTilt) * eased
          apparentHeight = Math.max(1.2, p.height * cosFactor)
        } else {
          renderRotation = p.rotation
          const cosTilt = Math.abs(Math.cos(p.tiltAngle))
          apparentHeight = Math.max(0.8, p.height * cosTilt)
        }

        ctx.save()
        ctx.globalAlpha = alpha
        ctx.translate(p.x, p.y)
        ctx.rotate(renderRotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.width / 2, -apparentHeight / 2, p.width, apparentHeight)
        if (p.isLight) {
          ctx.strokeStyle = 'rgba(18, 20, 18, 0.22)'
          ctx.lineWidth = 0.75
          ctx.strokeRect(
            -p.width / 2,
            -apparentHeight / 2,
            p.width,
            apparentHeight
          )
        }
        ctx.restore()

        activePieces[writeIdx++] = p
      }

      activePieces.length = writeIdx

      if (activePieces.length === 0) {
        rafIdRef.current = null
        lastFrameTimeRef.current = null
        setIsActive(false)
        return
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }

    rafIdRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', syncCanvasSize)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      lastFrameTimeRef.current = null
    }
  }, [isActive])

  if (!isActive || reducedMotion) {
    return null
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-screen h-screen pointer-events-none z-[9999]"
    />
  )
}
