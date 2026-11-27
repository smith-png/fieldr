import React, { useCallback, useEffect, useRef } from 'react'
import {
  clamp,
  easePack,
  getDiscardPoseOffset,
  lerp,
  stepSpring,
  type Spring1D
} from './packEasing'
import { PackCardVisual, type CardVisualHandles } from './PackCardVisual'
import {
  PREMIUM_ANTICIPATION_MS,
  PREMIUM_BLOOM_MS,
  PREMIUM_FLIP_MS,
  STANDARD_REVEAL_MS,
  type PackCardItem,
  type PackLiveMotion,
  type PackPhase,
  type RevealSubPhase
} from './types'

interface PackCardsStageProps {
  packNonce: number
  cards: readonly PackCardItem[]
  phase: PackPhase
  revealIndex: number
  revealSubPhase: RevealSubPhase
  revealedCount: number
  liveMotionRef: React.RefObject<PackLiveMotion>
  reducedMotion: boolean
  isDocumentHidden: boolean
}

interface CardMotionState {
  x: Spring1D
  y: Spring1D
  z: Spring1D
  rx: Spring1D
  ry: Spring1D
  rz: Spring1D
  scale: Spring1D
  flipY: number
  opacity: number
  foilBloom: number
  foilBloomStartedAt: number | null
  // Snapshot of pose at the exact start of anticipation / flip for zero-teleport continuity
  startX: number
  startY: number
  startZ: number
  startRz: number
  startScale: number
  lastTrackedKey: string
  // Live pointer/sway tilt state for settled face-up cards
  tiltRx: number
  tiltRy: number
  holoNx: number
  holoNy: number
}

function createInitialCardState(index: number, cardH: number): CardMotionState {
  const depth = index
  return {
    x: { value: depth * 1.2, velocity: 0 },
    y: { value: cardH * 0.22 + depth * 2, velocity: 0 },
    z: { value: -14 - depth * 3.5, velocity: 0 },
    rx: { value: 6, velocity: 0 },
    ry: { value: -5, velocity: 0 },
    rz: { value: 0, velocity: 0 },
    scale: { value: 0.92, velocity: 0 },
    flipY: 180,
    opacity: 0,
    foilBloom: 0,
    foilBloomStartedAt: null,
    startX: 0,
    startY: 0,
    startZ: 0,
    startRz: 0,
    startScale: 1,
    lastTrackedKey: '',
    tiltRx: 0,
    tiltRy: 0,
    holoNx: 0,
    holoNy: 0
  }
}

function computeCardMetrics(vw: number, vh: number, count: number) {
  const cardW = clamp(Math.min(vw * 0.22, vh * 0.35), 240, 372)
  const cardH = cardW * 1.4
  const finaleW = clamp(Math.min(vw * 0.17, vh * 0.36), 132, 326)
  const finaleGap = clamp(vw * 0.015, 10, 28)
  const totalRowW = count * finaleW + Math.max(0, count - 1) * finaleGap
  const maxRowW = vw * 0.92
  const fitFactor = totalRowW > maxRowW ? maxRowW / totalRowW : 1
  const actualFinaleW = finaleW * fitFactor
  const actualFinaleGap = finaleGap * fitFactor
  const finaleScale = actualFinaleW / cardW
  const sideOffsetX = Math.min(vw * 0.31, cardW * 1.38)
  return {
    cardW,
    cardH,
    actualFinaleW,
    actualFinaleGap,
    finaleScale,
    sideOffsetX
  }
}

export const PackCardsStage: React.FC<PackCardsStageProps> = ({
  packNonce,
  cards,
  phase,
  revealIndex,
  revealSubPhase,
  revealedCount,
  liveMotionRef,
  reducedMotion,
  isDocumentHidden
}) => {
  const stageRef = useRef<HTMLDivElement>(null)
  const clipMaskRef = useRef<HTMLDivElement>(null)
  const stackShadowRef = useRef<HTMLDivElement>(null)
  const stackReflectionRef = useRef<HTMLDivElement>(null)

  const cardShellRefs = useRef<Array<HTMLDivElement | null>>([])
  const cardShadowRefs = useRef<Array<HTMLDivElement | null>>([])
  const cardFlipRefs = useRef<Array<HTMLDivElement | null>>([])
  const visualHandlesRef = useRef<Array<CardVisualHandles | null>>([])
  const statesRef = useRef<CardMotionState[]>([])
  const pointerNormRef = useRef<{ x: number; y: number; lastMoveMs: number }>({
    x: 0,
    y: 0,
    lastMoveMs: -Infinity
  })

  // Re-initialize persistent card poses only when a brand new pack mounts
  const initNonceRef = useRef<number>(-1)
  if (initNonceRef.current !== packNonce || statesRef.current.length !== cards.length) {
    initNonceRef.current = packNonce
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900
    const { cardH } = computeCardMetrics(vw, vh, cards.length)
    statesRef.current = cards.map((_, idx) => createInitialCardState(idx, cardH))
  }

  const registerHandles = useCallback((idx: number) => {
    return (handles: CardVisualHandles | null) => {
      visualHandlesRef.current[idx] = handles
    }
  }, [])

  // Track pointer position across the stage for subtle stack parallax & settled card tilt
  useEffect(() => {
    if (reducedMotion || isDocumentHidden) return
    const onPointerMove = (e: PointerEvent) => {
      if (!e.isPrimary) return
      const vw = Math.max(1, window.innerWidth)
      const vh = Math.max(1, window.innerHeight)
      pointerNormRef.current.x = clamp((e.clientX / vw) * 2 - 1, -1, 1)
      pointerNormRef.current.y = clamp((e.clientY / vh) * 2 - 1, -1, 1)
      pointerNormRef.current.lastMoveMs = performance.now()
    }
    const onPointerLeave = () => {
      pointerNormRef.current.lastMoveMs = -Infinity
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [reducedMotion, isDocumentHidden])

  // Single unified 60fps rAF loop driving ALL 5 cards smoothly from their CURRENT pose
  useEffect(() => {
    if (isDocumentHidden || cards.length === 0) return

    let rafId: number | null = null
    let lastTimeMs = performance.now()
    let clockSec = 0

    const tick = (now: number) => {
      const dt = Math.min(Math.max(0.001, (now - lastTimeMs) / 1000), 0.032)
      lastTimeMs = now
      clockSec += dt

      const vw = window.innerWidth
      const vh = window.innerHeight
      const count = cards.length
      const { cardW, cardH, actualFinaleW, actualFinaleGap, finaleScale, sideOffsetX } =
        computeCardMetrics(vw, vh, count)

      const live = liveMotionRef.current
      const curPhase = live.phase
      const curRevealIdx = live.revealIndex
      const curSubPhase = live.revealSubPhase
      const elapsedMs = live.phaseElapsedSec * 1000
      const emerge = clamp(live.emerge, 0, 1)
      const resetCollapse = clamp(live.resetCollapse, 0, 1)

      const pointerFresh = now - pointerNormRef.current.lastMoveMs < 1600
      const pNx = pointerFresh ? pointerNormRef.current.x : 0
      const pNy = pointerFresh ? pointerNormRef.current.y : 0

      // Dynamic opening mask during emerging so cards genuinely slide ~40% out of the torn pouch mouth
      if (clipMaskRef.current) {
        if (curPhase === 'emerging' && !reducedMotion && emerge < 0.64) {
          const packW = clamp(Math.min(vw * 0.215, vh * 0.335), 242, 356)
          const packH = packW * 1.56
          const sinkP = easePack(clamp((emerge - 0.34) / 0.3, 0, 1))
          const mouthBottomInset = vh * 0.5 + packH * 0.415
          const bottomClipPx = lerp(mouthBottomInset, 0, sinkP)
          if (sinkP >= 0.98) {
            clipMaskRef.current.style.clipPath = 'none'
          } else {
            clipMaskRef.current.style.clipPath = `inset(-80vh -60vw ${Math.max(0, bottomClipPx).toFixed(1)}px -60vw)`
          }
        } else {
          clipMaskRef.current.style.clipPath = 'none'
        }
      }

      // Grounded stack contact shadow & faint floor reflection during emerging & stack
      const stackPresence =
        curPhase === 'stack'
          ? 1
          : curPhase === 'emerging'
            ? easePack(clamp((emerge - 0.12) / 0.72, 0, 1))
            : curPhase === 'resetting'
              ? clamp(1 - resetCollapse * 1.3, 0, 1)
              : 0

      if (stackShadowRef.current) {
        const emergeLift = curPhase === 'emerging' ? Math.sin(clamp(emerge, 0, 1) * Math.PI) : 0
        const sScale = 0.88 + stackPresence * 0.14 + emergeLift * 0.12
        const sOpacity = stackPresence * (0.72 - emergeLift * 0.16)
        stackShadowRef.current.style.transform = `translate3d(calc(-50% - ${(pNx * 8).toFixed(1)}px), ${(cardH * 0.5 + 16 + emergeLift * 14).toFixed(1)}px, 0) scale(${sScale.toFixed(3)})`
        stackShadowRef.current.style.opacity = clamp(sOpacity, 0, 0.8).toFixed(3)
      }

      if (stackReflectionRef.current) {
        const emergeLift = curPhase === 'emerging' ? Math.sin(clamp(emerge, 0, 1) * Math.PI) : 0
        stackReflectionRef.current.style.transform = `translate3d(calc(-50% - ${(pNx * 5).toFixed(1)}px), ${(cardH * 0.5 + 24 + emergeLift * 18).toFixed(1)}px, 0) scale(${(0.94 - emergeLift * 0.08).toFixed(3)}, 1)`
        stackReflectionRef.current.style.opacity = clamp(stackPresence * (0.16 - emergeLift * 0.05), 0, 0.2).toFixed(3)
      }

      // Update each of the 5 persistent cards continuously from its CURRENT pose
      for (let i = 0; i < count; i++) {
        const st = statesRef.current[i]
        const card = cards[i]
        const shellEl = cardShellRefs.current[i]
        const flipEl = cardFlipRefs.current[i]
        const shadowEl = cardShadowRefs.current[i]
        const handles = visualHandlesRef.current[i]
        if (!st || !shellEl || !flipEl) continue

        // Ensure card dimensions match viewport vw/vh crisply without layout thrashing
        const widthStr = `${cardW.toFixed(1)}px`
        const heightStr = `${cardH.toFixed(1)}px`
        if (shellEl.style.width !== widthStr) shellEl.style.width = widthStr
        if (shellEl.style.height !== heightStr) shellEl.style.height = heightStr

        // Card 0 is revealed first -> card 0 sits on top of the stack
        const depthFromTop = i

        const stateKey =
          curPhase === 'reveal'
            ? `reveal-${curRevealIdx}-${curSubPhase}`
            : curPhase

        if (st.lastTrackedKey !== stateKey) {
          st.lastTrackedKey = stateKey
          st.startX = st.x.value
          st.startY = st.y.value
          st.startZ = st.z.value
          st.startRz = st.rz.value
          st.startScale = st.scale.value
        }

        let targetX = 0
        let targetY = 0
        let targetZ = 0
        let targetRx = 0
        let targetRy = 0
        let targetRz = 0
        let targetScale = 1
        let targetOpacity = 1
        let zIndex = 10 + (count - i)
        let springStiffness = 112
        let springDamping = 21
        let useDirectFlipCurve = false
        let showPerCardShadow = false

        if (curPhase === 'emerging') {
          const slideP = easePack(clamp(emerge / 0.48, 0, 1))
          const settleP = easePack(clamp((emerge - 0.42) / 0.58, 0, 1))
          const slideUpY = lerp(cardH * 0.22, -cardH * 0.24, slideP)
          const restY = depthFromTop * 2.6
          targetX = lerp(0, depthFromTop * 2.2, settleP)
          targetY = reducedMotion ? 0 : lerp(slideUpY, restY, settleP)
          targetZ = reducedMotion ? 0 : lerp(-14 - depthFromTop * 3.5, -depthFromTop * 4, settleP)
          targetRx = reducedMotion ? 0 : lerp(6.5, 0, settleP)
          targetRy = reducedMotion ? 0 : lerp(-5.5, 0, settleP)
          targetRz = reducedMotion ? 0 : lerp(0, (depthFromTop - 2) * 0.32, settleP)
          targetScale = reducedMotion ? 1 : lerp(0.92, 1, settleP)
          targetOpacity = easePack(clamp(emerge / 0.22, 0, 1))
          st.flipY = 180
          zIndex = 20 + (count - i)
          // Follow emergence curve tightly
          st.x.value = targetX
          st.y.value = targetY
          st.z.value = targetZ
          st.rx.value = targetRx
          st.ry.value = targetRy
          st.rz.value = targetRz
          st.scale.value = targetScale
          st.x.velocity = 0
          st.y.velocity = 0
          st.z.velocity = 0
          st.opacity = targetOpacity
          useDirectFlipCurve = true
        } else if (curPhase === 'stack') {
          // Rested stack with tiny depth-weighted parallax offsets
          const parallax = reducedMotion ? 0 : (1 + depthFromTop * 0.35)
          targetX = depthFromTop * 2.2 + pNx * 4.5 * parallax
          targetY = depthFromTop * 2.6 + pNy * 3.5 * parallax
          targetZ = -depthFromTop * 4
          targetRx = reducedMotion ? 0 : -pNy * 4.5
          targetRy = reducedMotion ? 0 : pNx * 5.5
          targetRz = reducedMotion ? 0 : (depthFromTop - 2) * 0.32
          targetScale = 1
          targetOpacity = 1
          st.flipY = 180
          zIndex = 20 + (count - i)
        } else if (curPhase === 'reveal') {
          if (i < curRevealIdx) {
            // Previously revealed card: neat discard pile on the LEFT with small deterministic tilt
            const disc = getDiscardPoseOffset(i)
            targetX = -sideOffsetX + disc.dx + i * 2.2
            targetY = vh * 0.02 + disc.dy + i * 2.5
            targetZ = -40 + i * 4
            targetRx = 0
            targetRy = 0
            targetRz = reducedMotion ? 0 : disc.tiltDeg
            targetScale = 0.72
            targetOpacity = i === curRevealIdx - 1 ? 0.78 : 0.46
            st.flipY = 0
            zIndex = 12 + i
            springStiffness = 105
            springDamping = 21
            showPerCardShadow = i === curRevealIdx - 1
          } else if (i > curRevealIdx) {
            // Remaining face-down cards resting neatly to the RIGHT
            const remDepth = i - curRevealIdx - 1
            targetX = sideOffsetX + remDepth * 2.4
            targetY = vh * 0.02 + remDepth * 2.6
            targetZ = -42 - remDepth * 4
            targetRx = 0
            targetRy = 0
            targetRz = reducedMotion ? 0 : 1.6 + remDepth * 0.35
            targetScale = 0.72
            targetOpacity = remDepth === 0 ? 0.56 : 0.34
            st.flipY = 180
            zIndex = 10 + (count - i)
            springStiffness = 105
            springDamping = 21
          } else {
            // ACTIVE CARD being revealed at center!
            zIndex = 40
            showPerCardShadow = true

            if (curSubPhase === 'anticipation') {
              // Premium 900ms anticipation: lift gently to center while single-origin diffraction traces perimeter
              const antT = clamp(elapsedMs / PREMIUM_ANTICIPATION_MS, 0, 1)
              const antU = easePack(antT)
              targetX = lerp(st.startX, 0, antU)
              targetY = lerp(st.startY, reducedMotion ? 0 : -10, antU)
              targetZ = lerp(st.startZ, reducedMotion ? 0 : 32, antU)
              targetRx = reducedMotion ? 0 : Math.sin(antT * Math.PI) * 3.5
              targetRy = reducedMotion ? 0 : Math.sin(antT * Math.PI * 2) * 2
              targetRz = lerp(st.startRz, 0, antU)
              targetScale = lerp(st.startScale, reducedMotion ? 1 : 1.03, antU)
              targetOpacity = 1
              st.flipY = 180
              st.x.value = targetX
              st.y.value = targetY
              st.z.value = targetZ
              st.rx.value = targetRx
              st.ry.value = targetRy
              st.rz.value = targetRz
              st.scale.value = targetScale
              useDirectFlipCurve = true
            } else if (curSubPhase === 'flipping') {
              const flipDur = reducedMotion
                ? 280
                : card.isPremium
                  ? PREMIUM_FLIP_MS
                  : STANDARD_REVEAL_MS
              const rawT = clamp(elapsedMs / flipDur, 0, 1)
              const u = easePack(rawT)
              const arc = reducedMotion ? 0 : Math.sin(Math.PI * rawT)

              targetX = lerp(st.startX, 0, u)
              targetY = lerp(st.startY, 0, u) - arc * (card.isPremium ? 26 : 22)
              targetZ = lerp(st.startZ, 0, u) + arc * (card.isPremium ? 148 : 118)
              // Slight organic bend/pitch & twist mid-flip
              targetRx = arc * (card.isPremium ? 11.5 : 9.5)
              targetRy = 0
              targetRz = lerp(st.startRz, 0, u) - arc * (card.isPremium ? 3.8 : 2.8)
              targetScale = lerp(st.startScale, 1, u) + arc * 0.035
              targetOpacity = 1
              st.flipY = reducedMotion ? 0 : lerp(180, 0, u)

              st.x.value = targetX
              st.y.value = targetY
              st.z.value = targetZ
              st.rx.value = targetRx
              st.ry.value = targetRy
              st.rz.value = targetRz
              st.scale.value = targetScale
              st.x.velocity = 0
              st.y.velocity = 0
              st.z.velocity = 0
              useDirectFlipCurve = true

              // Trigger premium 700ms foil bloom as the front face clears 90deg
              if (card.isPremium && rawT >= 0.42 && st.foilBloomStartedAt === null) {
                st.foilBloomStartedAt = clockSec
              }
            } else {
              // Settled active card: low-bounce spring settle + live pointer tilt / premium foil sway
              targetX = 0
              targetY = 0
              targetZ = 0
              targetRz = 0
              targetScale = 1
              targetOpacity = 1
              st.flipY = 0
              springStiffness = 148
              springDamping = 21

              if (!reducedMotion) {
                const swayX = card.isPremium ? Math.sin(clockSec * 0.65 + i * 1.1) * 0.42 : 0
                const swayY = card.isPremium ? Math.sin(clockSec * 0.48 + 0.8 + i) * 0.34 : 0
                const nx = pointerFresh ? pNx * 0.85 : swayX
                const ny = pointerFresh ? pNy * 0.85 : swayY
                targetRx = -ny * 6.5
                targetRy = nx * 7.5
                st.holoNx = lerp(st.holoNx, nx, 1 - Math.exp(-8 * dt))
                st.holoNy = lerp(st.holoNy, ny, 1 - Math.exp(-8 * dt))
              }
              if (card.isPremium && st.foilBloomStartedAt === null) {
                st.foilBloomStartedAt = clockSec
              }
            }
          }
        } else if (curPhase === 'finale') {
          // Spring all 5 cards from CURRENT poses into large 92vw showcase row with gentle fan
          const centerOffset = i - (count - 1) / 2
          const slotPitch = actualFinaleW + actualFinaleGap
          targetX = centerOffset * slotPitch
          const fanAngle = reducedMotion ? 0 : centerOffset * 1.6
          const fanArcY = reducedMotion ? 0 : Math.abs(centerOffset) * 6
          const premiumLift = card.isPremium ? (reducedMotion ? -8 : -16) : 0
          targetY = fanArcY + premiumLift
          targetZ = card.isPremium ? 18 : 0
          targetRz = fanAngle
          targetScale = finaleScale
          targetOpacity = 1
          st.flipY = 0
          zIndex = card.isPremium ? 32 + i : 20 + i
          springStiffness = 112
          springDamping = 20
          showPerCardShadow = true

          if (!reducedMotion && card.isPremium) {
            const swayX = Math.sin(clockSec * 0.62 + i * 1.35) * 0.56
            const swayY = Math.sin(clockSec * 0.44 + 0.9 + i * 1.35) * 0.42
            const nx = pointerFresh ? lerp(swayX, pNx * 0.8, 0.55) : swayX
            const ny = pointerFresh ? lerp(swayY, pNy * 0.8, 0.55) : swayY
            targetRx = -ny * 5.2
            targetRy = nx * 6.2
            st.holoNx = lerp(st.holoNx, nx, 1 - Math.exp(-7 * dt))
            st.holoNy = lerp(st.holoNy, ny, 1 - Math.exp(-7 * dt))
          } else {
            targetRx = 0
            targetRy = 0
          }
          if (card.isPremium && st.foilBloomStartedAt === null) {
            st.foilBloomStartedAt = clockSec
          }
        } else if (curPhase === 'resetting') {
          // Clean collapse from CURRENT poses back into a centered stack before a new pack lands in
          const colP = easePack(clamp(resetCollapse / 0.72, 0, 1))
          const fadeP = easePack(clamp((resetCollapse - 0.52) / 0.48, 0, 1))
          targetX = lerp(st.startX, depthFromTop * 1.5, colP)
          targetY = lerp(st.startY, depthFromTop * 2 + fadeP * 26, colP)
          targetZ = lerp(st.startZ, -depthFromTop * 3.5 - fadeP * 24, colP)
          targetRx = 0
          targetRy = 0
          targetRz = lerp(st.startRz, 0, colP)
          targetScale = lerp(st.startScale, 0.92, colP)
          targetOpacity = clamp(1 - fadeP * 1.15, 0, 1)
          st.x.value = targetX
          st.y.value = targetY
          st.z.value = targetZ
          st.rx.value = targetRx
          st.ry.value = targetRy
          st.rz.value = targetRz
          st.scale.value = targetScale
          st.opacity = targetOpacity
          useDirectFlipCurve = true
          zIndex = 20 + (count - i)
        } else {
          targetOpacity = 0
        }

        // Advance spring physics for non-direct-curve cards
        if (!useDirectFlipCurve) {
          if (reducedMotion) {
            const snap = 1 - Math.exp(-16 * dt)
            st.x.value = lerp(st.x.value, targetX, snap)
            st.y.value = lerp(st.y.value, targetY, snap)
            st.z.value = lerp(st.z.value, targetZ, snap)
            st.rx.value = 0
            st.ry.value = 0
            st.rz.value = 0
            st.scale.value = lerp(st.scale.value, targetScale, snap)
          } else {
            stepSpring(st.x, targetX, springStiffness, springDamping, dt)
            stepSpring(st.y, targetY, springStiffness, springDamping, dt)
            stepSpring(st.z, targetZ, springStiffness, springDamping, dt)
            stepSpring(st.rx, targetRx, 128, 22, dt)
            stepSpring(st.ry, targetRy, 128, 22, dt)
            stepSpring(st.rz, targetRz, springStiffness, springDamping, dt)
            stepSpring(st.scale, targetScale, springStiffness, springDamping, dt)
          }
          st.opacity = lerp(st.opacity, targetOpacity, 1 - Math.exp(-12 * dt))
        }

        // Advance premium 700ms foil bloom smoothly (pauses automatically when tab is hidden)
        if (card.isPremium) {
          if (reducedMotion) {
            st.foilBloom = st.flipY < 90 ? 1 : 0
          } else if (st.foilBloomStartedAt !== null) {
            const bloomRaw = clamp(((clockSec - st.foilBloomStartedAt) * 1000) / PREMIUM_BLOOM_MS, 0, 1)
            st.foilBloom = easePack(bloomRaw)
          } else {
            st.foilBloom = 0
          }
        }

        // Apply transforms (GPU compositor-only: transform & opacity)
        const isMoving =
          useDirectFlipCurve ||
          Math.abs(st.x.velocity) > 0.6 ||
          Math.abs(st.y.velocity) > 0.6 ||
          Math.abs(st.z.velocity) > 0.6 ||
          Math.abs(st.scale.velocity) > 0.002

        shellEl.classList.toggle('pack-3d-active', !reducedMotion && isMoving)
        shellEl.style.zIndex = String(zIndex)
        shellEl.style.opacity = st.opacity.toFixed(3)
        shellEl.style.transform = `translate3d(${st.x.value.toFixed(2)}px, ${st.y.value.toFixed(2)}px, ${st.z.value.toFixed(2)}px) rotateX(${st.rx.value.toFixed(3)}deg) rotateY(${st.ry.value.toFixed(3)}deg) rotateZ(${st.rz.value.toFixed(3)}deg) scale(${st.scale.value.toFixed(4)})`

        flipEl.style.transform = `rotateY(${st.flipY.toFixed(3)}deg)`

        // Per-card grounded contact shadow lengthening with lift height
        if (shadowEl) {
          if (showPerCardShadow && st.opacity > 0.05) {
            const heightLift = clamp(st.z.value / 140, 0, 1)
            const shOpacity = (0.72 - heightLift * 0.28) * st.opacity
            const shScale = 0.86 + heightLift * 0.24
            const shY = 18 + heightLift * 24
            shadowEl.style.opacity = clamp(shOpacity, 0, 0.82).toFixed(3)
            shadowEl.style.transform = `translate3d(-50%, ${shY.toFixed(1)}px, -24px) scale(${shScale.toFixed(3)})`
          } else {
            shadowEl.style.opacity = '0'
          }
        }

        // Update premium foil variables & single-origin perimeter anticipation edge trace directly in DOM
        if (handles) {
          if (card.isPremium) {
            const hx = 50 + st.holoNx * 34
            const hy = 50 + st.holoNy * 34
            const angle = 128 + st.holoNx * 38 + st.holoNy * 24
            const hue = st.holoNx * 22 - st.holoNy * 14
            shellEl.style.setProperty('--holo-x', `${hx.toFixed(1)}%`)
            shellEl.style.setProperty('--holo-y', `${hy.toFixed(1)}%`)
            shellEl.style.setProperty('--holo-angle', `${angle.toFixed(1)}deg`)
            shellEl.style.setProperty('--holo-hue', `${hue.toFixed(1)}deg`)

            if (handles.foilLayer) {
              handles.foilLayer.style.opacity = st.foilBloom.toFixed(3)
            }
            if (handles.fresnelLayer) {
              handles.fresnelLayer.style.opacity = (st.foilBloom * 0.88).toFixed(3)
            }

            // Single-origin diffraction trace around the face-down card edge during 900ms premium anticipation
            const showEdgeTrace =
              !reducedMotion &&
              curPhase === 'reveal' &&
              i === curRevealIdx &&
              curSubPhase === 'anticipation'
            if (handles.edgeTraced && handles.edgeTail && handles.edgeHead) {
              if (showEdgeTrace) {
                const p = clamp(live.premiumEdgeTrace, 0, 1)
                const tailLen = Math.min(0.14, p)
                const headLen = Math.min(0.036, p)
                const fadeOut = 1 - clamp((p - 0.92) / 0.08, 0, 0.35)

                handles.edgeTraced.style.opacity = (0.38 * Math.min(1, p * 12) * fadeOut).toFixed(3)
                handles.edgeTraced.setAttribute('stroke-dasharray', `${p.toFixed(4)} 2`)
                handles.edgeTraced.setAttribute('stroke-dashoffset', '0')

                handles.edgeTail.style.opacity = (0.78 * Math.min(1, p * 12) * fadeOut).toFixed(3)
                handles.edgeTail.setAttribute('stroke-dasharray', `${tailLen.toFixed(4)} 2`)
                handles.edgeTail.setAttribute('stroke-dashoffset', `${(-(p - tailLen)).toFixed(4)}`)

                handles.edgeHead.style.opacity = (Math.min(1, p * 18) * fadeOut).toFixed(3)
                handles.edgeHead.setAttribute('stroke-dasharray', `${headLen.toFixed(4)} 2`)
                handles.edgeHead.setAttribute('stroke-dashoffset', `${(-(p - headLen)).toFixed(4)}`)
              } else {
                handles.edgeTraced.style.opacity = '0'
                handles.edgeTail.style.opacity = '0'
                handles.edgeHead.style.opacity = '0'
              }
            }
          }
        }
      }

      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
    }
  }, [cards, liveMotionRef, reducedMotion, isDocumentHidden])

  return (
    <div
      ref={stageRef}
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* Dynamic opening clip container active only during initial slide-out from the torn pack */}
      <div
        ref={clipMaskRef}
        className="relative flex items-center justify-center w-full h-full"
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Grounded contact shadow & faint floor reflection beneath the 5-card stack */}
        <div
          ref={stackShadowRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 w-[clamp(210px,19vw,320px)] h-10 rounded-full bg-black/90 blur-2xl z-0 opacity-0"
        />
        <div
          ref={stackReflectionRef}
          aria-hidden="true"
          className="pack-floor-reflection pointer-events-none absolute left-1/2 top-1/2 w-[clamp(190px,17vw,280px)] h-14 z-0 opacity-0"
        />

        {/* Persistent 5-card layer — NEVER unmounts between emerging, stack, reveal(0..4), finale, and resetting */}
        {cards.map((card, idx) => {
          const isStandardSweepTriggered =
            !card.isPremium &&
            idx < revealedCount &&
            (phase === 'reveal' ? idx <= revealIndex : phase === 'finale')

          return (
            <div
              key={`${packNonce}-card-${card.code}`}
              ref={(el) => {
                cardShellRefs.current[idx] = el
              }}
              className="absolute left-1/2 top-1/2 -ml-[0px] -mt-[0px] opacity-0"
              style={{
                transformStyle: 'preserve-3d',
                translate: '-50% -50%'
              }}
            >
              {/* Per-card grounded contact shadow */}
              <div
                ref={(el) => {
                  cardShadowRefs.current[idx] = el
                }}
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-5 left-1/2 w-[82%] h-8 rounded-full bg-black/90 blur-xl opacity-0"
              />

              {/* Dedicated 3D rotateY flip inner wrapper */}
              <div
                ref={(el) => {
                  cardFlipRefs.current[idx] = el
                }}
                className="w-full h-full"
                style={{ transformStyle: 'preserve-3d', transform: 'rotateY(180deg)' }}
              >
                <PackCardVisual
                  item={card}
                  standardSweepActive={isStandardSweepTriggered}
                  reducedMotion={reducedMotion}
                  onRegisterRefs={registerHandles(idx)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
