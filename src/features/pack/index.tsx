import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import {
  ArrowsIn,
  ArrowsOut,
  SpeakerHigh,
  SpeakerSlash
} from '@phosphor-icons/react'
import { getPublicPlayersBySeason } from '../../lib/data/players'
import { getPremiumPlayerIds } from '../../lib/data/premiumCards'
import { getActiveSeason } from '../../lib/data/seasons'
import type { PublicPlayer } from '../../types'
import { FoilPack3D } from './FoilPack3D'
import { PackAudioEngine } from './packAudio'
import { PackCardsStage } from './PackCardsStage'
import { clamp, easePack, lerp } from './packEasing'
import { buildPackCards, preloadPackImages, setPremiumPlayerIds } from './packUtils'
import {
  CHARGE_DURATION_MS,
  CHARGE_RELAX_MS,
  EMERGE_DURATION_MS,
  PREMIUM_ANTICIPATION_MS,
  PREMIUM_FLIP_MS,
  QUICK_TAP_MAX_MS,
  RESET_COLLAPSE_MS,
  STANDARD_REVEAL_MS,
  TEAR_DURATION_MS,
  type PackCardItem,
  type PackLiveMotion,
  type PackMachineSnapshot,
  type PackPhase,
  type RevealSubPhase
} from './types'
import './pack.css'

const CURSOR_HIDE_DELAY_MS = 3000

function createInitialLiveMotion(phase: PackPhase = 'loading'): PackLiveMotion {
  return {
    phase,
    revealIndex: 0,
    revealSubPhase: 'settled',
    charge: 0,
    tear: 0,
    emerge: 0,
    phaseElapsedSec: 0,
    premiumEdgeTrace: 0,
    stageFocus: 0,
    resetCollapse: 0
  }
}

export function PackPage() {
  const reducedMotion = Boolean(useReducedMotion())

  const [snapshot, setSnapshot] = useState<PackMachineSnapshot>({
    phase: 'loading',
    revealIndex: 0,
    revealSubPhase: 'settled',
    revealedCount: 0
  })
  const [seasonName, setSeasonName] = useState<string | null>(null)
  const [cards, setCards] = useState<PackCardItem[]>([])
  const [packNonce, setPackNonce] = useState(0)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  )
  const [isCursorHidden, setIsCursorHidden] = useState(false)
  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.hidden : false
  )
  const [showIdleHint, setShowIdleHint] = useState(false)

  // Authoritative state machine refs (0 per-frame React state updates)
  const liveMotionRef = useRef<PackLiveMotion>(createInitialLiveMotion('loading'))
  const cardsRef = useRef<PackCardItem[]>([])
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion

  const cameraRigRef = useRef<HTMLDivElement>(null)
  const focusVignetteRef = useRef<HTMLDivElement>(null)

  const audioRef = useRef<PackAudioEngine | null>(null)
  if (!audioRef.current) {
    audioRef.current = new PackAudioEngine()
  }

  // 1-deep input queue so input during transitions is never dropped and never skips a state
  const queuedAdvanceRef = useRef(false)
  const holdActiveRef = useRef(false)
  const holdSourceRef = useRef<'pointer' | 'key' | null>(null)
  const holdStartMsRef = useRef(0)
  const premiumChimeFiredRef = useRef(false)
  const stackLandFiredRef = useRef(false)

  const cursorTimerRef = useRef<number | null>(null)
  const idleHintTimerRef = useRef<number | null>(null)
  const loadGenRef = useRef(0)
  const isMountedRef = useRef(true)
  const seasonPlayersRef = useRef<PublicPlayer[] | null>(null)
  const seenPremiumIdsRef = useRef<Set<string>>(new Set())

  const commitSnapshot = useCallback(
    (phase: PackPhase, revealIndex: number, revealSubPhase: RevealSubPhase, revealedCount?: number) => {
      setSnapshot((prev) => ({
        phase,
        revealIndex,
        revealSubPhase,
        revealedCount: revealedCount ?? prev.revealedCount
      }))
    },
    []
  )

  // Inject <meta name="robots" content="noindex"> while mounted and restore on unmount
  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (existing) {
      const previousContent = existing.getAttribute('content')
      existing.setAttribute('content', 'noindex')
      return () => {
        if (previousContent === null) {
          existing.removeAttribute('content')
        } else {
          existing.setAttribute('content', previousContent)
        }
      }
    }

    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      meta.remove()
    }
  }, [])

  // Pause EVERYTHING when tab hides (rAF clock, CSS animations, WebAudio)
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.hidden
      setIsDocumentHidden(hidden)
      audioRef.current?.setPaused(hidden)
      if (hidden && holdActiveRef.current) {
        holdActiveRef.current = false
        holdSourceRef.current = null
        if (liveMotionRef.current.phase === 'charging') {
          liveMotionRef.current.phase = 'idle'
          commitSnapshot('idle', 0, 'settled', 0)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [commitSnapshot])

  // Track fullscreen state
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Hide mouse cursor after 3s of inactivity
  useEffect(() => {
    const armHideTimer = () => {
      setIsCursorHidden(false)
      if (cursorTimerRef.current !== null) {
        window.clearTimeout(cursorTimerRef.current)
      }
      cursorTimerRef.current = window.setTimeout(() => {
        cursorTimerRef.current = null
        setIsCursorHidden(true)
      }, CURSOR_HIDE_DELAY_MS)
    }

    armHideTimer()
    window.addEventListener('mousemove', armHideTimer, { passive: true })
    window.addEventListener('mousedown', armHideTimer, { passive: true })
    return () => {
      window.removeEventListener('mousemove', armHideTimer)
      window.removeEventListener('mousedown', armHideTimer)
      if (cursorTimerRef.current !== null) {
        window.clearTimeout(cursorTimerRef.current)
        cursorTimerRef.current = null
      }
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (idleHintTimerRef.current !== null) {
        window.clearTimeout(idleHintTimerRef.current)
      }
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [])

  // Delayed soft prompt fade-in while idle
  useEffect(() => {
    if (idleHintTimerRef.current !== null) {
      window.clearTimeout(idleHintTimerRef.current)
      idleHintTimerRef.current = null
    }
    if (snapshot.phase !== 'idle') {
      setShowIdleHint(false)
      return
    }
    idleHintTimerRef.current = window.setTimeout(
      () => {
        idleHintTimerRef.current = null
        setShowIdleHint(true)
      },
      reducedMotion ? 120 : 1100
    )
    return () => {
      if (idleHintTimerRef.current !== null) {
        window.clearTimeout(idleHintTimerRef.current)
        idleHintTimerRef.current = null
      }
    }
  }, [snapshot.phase, packNonce, reducedMotion])

  // Fetch season + players + premium ids once per session, build 5-card weighted pack, preload full photo_url
  const loadFreshPack = useCallback(async () => {
    const gen = ++loadGenRef.current
    queuedAdvanceRef.current = false
    holdActiveRef.current = false
    holdSourceRef.current = null
    audioRef.current?.stopChargeHum(true)

    liveMotionRef.current = createInitialLiveMotion('loading')
    commitSnapshot('loading', 0, 'settled', 0)

    try {
      let allPlayers = seasonPlayersRef.current

      if (allPlayers === null) {
        const season = await getActiveSeason()
        if (!isMountedRef.current || loadGenRef.current !== gen) return

        if (!season?.id) {
          setSeasonName(null)
          setPremiumPlayerIds([])
          cardsRef.current = []
          setCards([])
          liveMotionRef.current = createInitialLiveMotion('empty')
          commitSnapshot('empty', 0, 'settled', 0)
          return
        }

        setSeasonName(season.name || null)
        const [fetchedPlayers, premiumIds] = await Promise.all([
          getPublicPlayersBySeason(season.id),
          getPremiumPlayerIds(season.id)
        ])
        if (!isMountedRef.current || loadGenRef.current !== gen) return

        setPremiumPlayerIds(premiumIds)
        seenPremiumIdsRef.current.clear()

        if (fetchedPlayers.length === 0) {
          cardsRef.current = []
          setCards([])
          liveMotionRef.current = createInitialLiveMotion('empty')
          commitSnapshot('empty', 0, 'settled', 0)
          return
        }

        seasonPlayersRef.current = fetchedPlayers
        allPlayers = fetchedPlayers
      }

      const nextCards = buildPackCards(allPlayers, {
        seenPremiumIds: seenPremiumIdsRef.current
      })
      if (nextCards.length === 0) {
        cardsRef.current = []
        setCards([])
        liveMotionRef.current = createInitialLiveMotion('empty')
        commitSnapshot('empty', 0, 'settled', 0)
        return
      }

      await preloadPackImages(nextCards)
      if (!isMountedRef.current || loadGenRef.current !== gen) return

      cardsRef.current = nextCards
      setCards(nextCards)
      setPackNonce((n) => n + 1)
      liveMotionRef.current = createInitialLiveMotion('idle')
      commitSnapshot('idle', 0, 'settled', 0)
    } catch {
      if (!isMountedRef.current || loadGenRef.current !== gen) return
      cardsRef.current = []
      setCards([])
      liveMotionRef.current = createInitialLiveMotion('empty')
      commitSnapshot('empty', 0, 'settled', 0)
    }
  }, [commitSnapshot])

  useEffect(() => {
    void loadFreshPack()
  }, [loadFreshPack])

  // === EXPLICIT STATE MACHINE TRANSITION HELPERS ===
  const enterTearing = useCallback(() => {
    const live = liveMotionRef.current
    holdActiveRef.current = false
    holdSourceRef.current = null
    live.phase = 'tearing'
    live.phaseElapsedSec = 0
    live.tear = 0
    live.emerge = 0
    live.charge = 1
    stackLandFiredRef.current = false
    audioRef.current?.playFoilTear()
    commitSnapshot('tearing', 0, 'settled', 0)
  }, [commitSnapshot])

  const enterReveal = useCallback(
    (index: number) => {
      const target = cardsRef.current[index]
      if (!target) return
      const live = liveMotionRef.current
      live.phase = 'reveal'
      live.revealIndex = index
      live.phaseElapsedSec = 0
      live.premiumEdgeTrace = 0
      premiumChimeFiredRef.current = false

      if (target.isPremium) {
        live.revealSubPhase = 'anticipation'
        commitSnapshot('reveal', index, 'anticipation')
      } else {
        live.revealSubPhase = 'flipping'
        commitSnapshot('reveal', index, 'flipping', index + 1)
      }
    },
    [commitSnapshot]
  )

  const enterFinale = useCallback(() => {
    const live = liveMotionRef.current
    live.phase = 'finale'
    live.phaseElapsedSec = 0
    live.premiumEdgeTrace = 0
    queuedAdvanceRef.current = false
    audioRef.current?.playCardLand()
    commitSnapshot('finale', Math.max(0, cardsRef.current.length - 1), 'settled', cardsRef.current.length)
  }, [commitSnapshot])

  // Advance one state forward when ready, or enqueue (depth 1) if a transition is currently running
  const requestAdvance = useCallback(() => {
    const live = liveMotionRef.current
    audioRef.current?.unlock()

    if (live.phase === 'loading' || live.phase === 'empty' || live.phase === 'resetting') {
      return
    }

    if (live.phase === 'idle') {
      enterTearing()
      return
    }

    if (live.phase === 'charging') {
      enterTearing()
      return
    }

    if (live.phase === 'tearing' || live.phase === 'emerging') {
      // Queue 1-deep: never dropped, never skips emerging or stack
      queuedAdvanceRef.current = true
      return
    }

    if (live.phase === 'stack') {
      queuedAdvanceRef.current = false
      if (cardsRef.current.length > 0) {
        enterReveal(0)
      }
      return
    }

    if (live.phase === 'reveal') {
      if (live.revealSubPhase === 'anticipation' || live.revealSubPhase === 'flipping') {
        queuedAdvanceRef.current = true
        return
      }
      queuedAdvanceRef.current = false
      const nextIdx = live.revealIndex + 1
      if (nextIdx < cardsRef.current.length) {
        enterReveal(nextIdx)
      } else {
        enterFinale()
      }
      return
    }
  }, [enterFinale, enterReveal, enterTearing])

  // Start press-and-hold charging on pack (Space/Enter or Pointer)
  const beginHold = useCallback(
    (source: 'pointer' | 'key') => {
      const live = liveMotionRef.current
      audioRef.current?.unlock()

      if (live.phase === 'idle') {
        holdActiveRef.current = true
        holdSourceRef.current = source
        holdStartMsRef.current = performance.now()
        live.phase = 'charging'
        live.phaseElapsedSec = 0
        audioRef.current?.startChargeHum()
        commitSnapshot('charging', 0, 'settled', 0)
        return
      }

      // In all post-idle phases, press acts as advance (queued 1-deep if transitioning)
      requestAdvance()
    },
    [commitSnapshot, requestAdvance]
  )

  const endHold = useCallback(
    (source: 'pointer' | 'key', cancelled = false) => {
      if (!holdActiveRef.current || holdSourceRef.current !== source) return
      holdActiveRef.current = false
      holdSourceRef.current = null

      const live = liveMotionRef.current
      if (live.phase !== 'charging') return

      const heldMs = performance.now() - holdStartMsRef.current
      if (!cancelled && (heldMs <= QUICK_TAP_MAX_MS || live.charge >= 0.96)) {
        // Quick tap or full charge skips straight to automatic tear
        enterTearing()
        return
      }

      // Released early or cancelled: smoothly relax charge back to 0 from current level
      audioRef.current?.stopChargeHum(false)
      live.phase = 'idle'
      live.phaseElapsedSec = 0
      commitSnapshot('idle', 0, 'settled', 0)
    },
    [commitSnapshot, enterTearing]
  )

  // Clean reset via R (spam-safe): collapses open cards back into a stack, then lands a fresh pack in
  const handleResetPack = useCallback(() => {
    const live = liveMotionRef.current
    if (live.phase === 'loading' || live.phase === 'resetting') return
    audioRef.current?.unlock()
    audioRef.current?.stopChargeHum(true)
    queuedAdvanceRef.current = false
    holdActiveRef.current = false
    holdSourceRef.current = null

    if (
      live.phase === 'stack' ||
      live.phase === 'reveal' ||
      live.phase === 'finale' ||
      live.phase === 'emerging'
    ) {
      live.phase = 'resetting'
      live.phaseElapsedSec = 0
      live.resetCollapse = 0
      commitSnapshot('resetting', live.revealIndex, 'settled')
      return
    }

    void loadFreshPack()
  }, [commitSnapshot, loadFreshPack])

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev
      audioRef.current?.setEnabled(next, true)
      return next
    })
  }, [])

  const handleToggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => undefined)
    }
  }, [])

  const handleExitFullscreen = useCallback(() => {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  // Keyboard controls (Space/Enter hold-or-tap, R new pack, F fullscreen, M sound, Escape)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const key = event.key

      if (key === ' ' || key === 'Enter') {
        event.preventDefault()
        beginHold('key')
      } else if (key === 'r' || key === 'R') {
        event.preventDefault()
        handleResetPack()
      } else if (key === 'f' || key === 'F') {
        event.preventDefault()
        handleToggleFullscreen()
      } else if (key === 'Escape') {
        handleExitFullscreen()
      } else if (key === 'm' || key === 'M') {
        event.preventDefault()
        handleToggleSound()
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        endHold('key', false)
      }
    }

    const onBlur = () => {
      if (holdActiveRef.current && holdSourceRef.current) {
        endHold(holdSourceRef.current, true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [
    beginHold,
    endHold,
    handleExitFullscreen,
    handleResetPack,
    handleToggleFullscreen,
    handleToggleSound
  ])

  // === AUTHORITATIVE STATE MACHINE CLOCK (single rAF, pauses cleanly when document.hidden) ===
  useEffect(() => {
    if (isDocumentHidden) return

    let rafId: number | null = null
    let lastTimeMs = performance.now()

    const stepClock = (now: number) => {
      const dt = Math.min(Math.max(0.001, (now - lastTimeMs) / 1000), 0.05)
      lastTimeMs = now

      const live = liveMotionRef.current
      const rm = reducedMotionRef.current
      live.phaseElapsedSec += dt

      if (live.phase === 'idle') {
        if (live.charge > 0) {
          live.charge = Math.max(0, live.charge - dt / (CHARGE_RELAX_MS / 1000))
        }
      } else if (live.phase === 'charging') {
        const durSec = (rm ? 360 : CHARGE_DURATION_MS) / 1000
        live.charge = clamp(live.charge + dt / durSec, 0, 1)
        audioRef.current?.updateChargeHum(live.charge)
        if (live.charge >= 1) {
          enterTearing()
        }
      } else if (live.phase === 'tearing') {
        const durSec = (rm ? 260 : TEAR_DURATION_MS) / 1000
        live.tear = clamp(live.phaseElapsedSec / durSec, 0, 1)
        if (live.tear >= 1) {
          live.phase = 'emerging'
          live.phaseElapsedSec = 0
          live.emerge = 0
          commitSnapshot('emerging', 0, 'settled', 0)
        }
      } else if (live.phase === 'emerging') {
        const durSec = (rm ? 300 : EMERGE_DURATION_MS) / 1000
        live.emerge = clamp(live.phaseElapsedSec / durSec, 0, 1)
        if (!stackLandFiredRef.current && live.emerge >= 0.88) {
          stackLandFiredRef.current = true
          audioRef.current?.playCardLand()
        }
        if (live.emerge >= 1) {
          live.phase = 'stack'
          live.phaseElapsedSec = 0
          commitSnapshot('stack', 0, 'settled', 0)
          if (queuedAdvanceRef.current && cardsRef.current.length > 0) {
            queuedAdvanceRef.current = false
            enterReveal(0)
          }
        }
      } else if (live.phase === 'reveal') {
        const card = cardsRef.current[live.revealIndex]
        if (!card) {
          enterFinale()
        } else if (live.revealSubPhase === 'anticipation') {
          const antSec = (rm ? 220 : PREMIUM_ANTICIPATION_MS) / 1000
          live.premiumEdgeTrace = easePack(clamp(live.phaseElapsedSec / antSec, 0, 1))
          if (live.phaseElapsedSec >= antSec) {
            live.revealSubPhase = 'flipping'
            live.phaseElapsedSec = 0
            live.premiumEdgeTrace = 1
            commitSnapshot('reveal', live.revealIndex, 'flipping', live.revealIndex + 1)
          }
        } else if (live.revealSubPhase === 'flipping') {
          const flipSec = (rm ? 280 : card.isPremium ? PREMIUM_FLIP_MS : STANDARD_REVEAL_MS) / 1000
          const prog = clamp(live.phaseElapsedSec / flipSec, 0, 1)
          if (card.isPremium && !premiumChimeFiredRef.current && prog >= 0.34) {
            premiumChimeFiredRef.current = true
            audioRef.current?.playPremiumChime()
          }
          if (prog >= 1) {
            live.revealSubPhase = 'settled'
            live.phaseElapsedSec = 0
            audioRef.current?.playCardLand()
            commitSnapshot('reveal', live.revealIndex, 'settled', live.revealIndex + 1)

            if (queuedAdvanceRef.current) {
              queuedAdvanceRef.current = false
              const nextIdx = live.revealIndex + 1
              if (nextIdx < cardsRef.current.length) {
                enterReveal(nextIdx)
              } else {
                enterFinale()
              }
            }
          }
        }
      } else if (live.phase === 'resetting') {
        const durSec = (rm ? 200 : RESET_COLLAPSE_MS) / 1000
        live.resetCollapse = clamp(live.phaseElapsedSec / durSec, 0, 1)
        if (live.resetCollapse >= 1) {
          void loadFreshPack()
        }
      }

      // Stage camera 4% dolly-in + deeper vignette during premium anticipation & flip
      const activeCard = cardsRef.current[live.revealIndex]
      const wantPremiumFocus =
        !rm &&
        live.phase === 'reveal' &&
        Boolean(activeCard?.isPremium) &&
        (live.revealSubPhase === 'anticipation' || live.revealSubPhase === 'flipping')

      const targetFocus = wantPremiumFocus ? 1 : 0
      const focusFollow = 1 - Math.exp(-(wantPremiumFocus ? 4.2 : 5.5) * dt)
      live.stageFocus = lerp(live.stageFocus, targetFocus, focusFollow)

      if (cameraRigRef.current) {
        const dollyScale = 1 + live.stageFocus * 0.04
        cameraRigRef.current.style.transform = `scale(${dollyScale.toFixed(4)})`
      }
      if (focusVignetteRef.current) {
        focusVignetteRef.current.style.opacity = live.stageFocus.toFixed(3)
      }

      rafId = window.requestAnimationFrame(stepClock)
    }

    rafId = window.requestAnimationFrame(stepClock)
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId)
    }
  }, [commitSnapshot, enterFinale, enterReveal, enterTearing, isDocumentHidden, loadFreshPack])

  const handleStagePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!event.isPrimary || event.button !== 0) return
      const curPhase = liveMotionRef.current.phase
      if (curPhase === 'idle') {
        beginHold('pointer')
        return
      }
      if (curPhase === 'charging') {
        return
      }
      requestAdvance()
    },
    [beginHold, requestAdvance]
  )

  const handleStagePointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!event.isPrimary) return
      endHold('pointer', false)
    },
    [endHold]
  )

  const handleStagePointerCancel = useCallback(() => {
    endHold('pointer', true)
  }, [endHold])

  const handlePackPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || event.button !== 0) return
      event.stopPropagation()
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Ignore capture failures
      }
      beginHold('pointer')
    },
    [beginHold]
  )

  const handlePackPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary) return
      event.stopPropagation()
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        // Ignore release failures
      }
      endHold('pointer', false)
    },
    [endHold]
  )

  const handlePackPointerCancel = useCallback(() => {
    endHold('pointer', true)
  }, [endHold])

  const { phase, revealIndex, revealSubPhase, revealedCount } = snapshot

  // Pack stays mounted through emerging so it sinks & fades cleanly, then unmounts (disposing the single WebGPU canvas)
  const showPack =
    phase === 'idle' || phase === 'charging' || phase === 'tearing' || phase === 'emerging'
  // Persistent 5-card stage mounts once emerging starts and stays mounted until reset completes
  const showCardsStage =
    cards.length > 0 &&
    (phase === 'emerging' ||
      phase === 'stack' ||
      phase === 'reveal' ||
      phase === 'finale' ||
      phase === 'resetting')

  const showProgressDots =
    cards.length > 0 && (phase === 'stack' || phase === 'reveal' || phase === 'finale')

  const isClickable =
    phase === 'idle' ||
    phase === 'stack' ||
    (phase === 'reveal' && revealSubPhase === 'settled')

  return (
    <main
      data-theme="dark"
      onPointerDown={handleStagePointerDown}
      onPointerUp={handleStagePointerUp}
      onPointerCancel={handleStagePointerCancel}
      className={`pack-stage fixed inset-0 h-dvh w-dvw overflow-hidden bg-[#090a0c] text-white/90 select-none flex flex-col items-center justify-center ${
        isCursorHidden ? 'cursor-none' : isClickable ? 'cursor-pointer' : 'cursor-default'
      } ${isDocumentHidden ? 'pack-paused' : ''}`}
    >
      {/* Single soft top-down spotlight */}
      <div aria-hidden="true" className="pack-spotlight pointer-events-none absolute inset-0 z-0" />

      {/* Premium anticipation vignette deepening (driven by rAF) */}
      <div
        ref={focusVignetteRef}
        aria-hidden="true"
        className="pack-focus-vignette pointer-events-none fixed inset-0 z-10"
      />

      {/* Film grain overlay at 3.5% */}
      <div aria-hidden="true" className="pack-film-grain pointer-events-none fixed inset-0 z-50" />

      {/* Discreet top-right operator controls (Sound [M] & Fullscreen [F]) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={`fixed top-5 right-5 z-40 flex items-center gap-2 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isCursorHidden ? 'opacity-20' : 'opacity-80 hover:opacity-100'
        }`}
      >
        <button
          type="button"
          onClick={handleToggleSound}
          aria-label={soundEnabled ? 'Mute sound (M)' : 'Enable sound (M)'}
          aria-pressed={soundEnabled}
          title={soundEnabled ? 'Mute sound (M)' : 'Enable sound (M)'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.14] bg-[#101216]/80 text-white/75 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 cursor-pointer"
        >
          {soundEnabled ? (
            <SpeakerHigh size={17} weight="bold" aria-hidden="true" />
          ) : (
            <SpeakerSlash size={17} weight="bold" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={handleToggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)'}
          title={isFullscreen ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.14] bg-[#101216]/80 text-white/75 backdrop-blur-sm transition-colors hover:border-white/30 hover:text-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 cursor-pointer"
        >
          {isFullscreen ? (
            <ArrowsIn size={17} weight="bold" aria-hidden="true" />
          ) : (
            <ArrowsOut size={17} weight="bold" aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Main 3D Stage Camera Rig (4% smooth dolly-in on premium anticipation) */}
      <div
        ref={cameraRigRef}
        className="pack-camera-rig relative z-20 flex-1 w-full flex items-center justify-center"
      >
        {phase === 'loading' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-7 w-7 rounded-full border border-white/15 border-t-white/70 animate-spin motion-reduce:animate-none" />
            <p className="font-dot text-[clamp(10px,0.85vw,12px)] uppercase tracking-[0.28em] text-white/45">
              PREPARING PACK
            </p>
          </div>
        )}

        {phase === 'empty' && (
          <div className="text-center space-y-3">
            <p className="font-syne font-bold text-[clamp(22px,2vw,32px)] text-white/85 tracking-tight">
              No athletes yet
            </p>
            <p className="font-dot text-[clamp(10px,0.85vw,12px)] uppercase tracking-[0.26em] text-white/45">
              PRESS R TO RETRY
            </p>
          </div>
        )}

        {/* Curved 3D Foil Pack (single WebGPU canvas disposed cleanly after emerging) */}
        {showPack && (
          <div className="relative z-10 flex items-center justify-center" style={{ transformStyle: 'preserve-3d' }}>
            <FoilPack3D
              key={`pack-${packNonce}`}
              seasonName={seasonName}
              phase={phase}
              liveMotionRef={liveMotionRef}
              reducedMotion={reducedMotion}
              isDocumentHidden={isDocumentHidden}
              onPointerDownPack={handlePackPointerDown}
              onPointerUpPack={handlePackPointerUp}
              onPointerCancelPack={handlePackPointerCancel}
            />
          </div>
        )}

        {/* Persistent 5-card unified 3D stage (emerging -> stack -> reveal -> finale -> resetting) */}
        {showCardsStage && (
          <PackCardsStage
            packNonce={packNonce}
            cards={cards}
            phase={phase}
            revealIndex={revealIndex}
            revealSubPhase={revealSubPhase}
            revealedCount={revealedCount}
            liveMotionRef={liveMotionRef}
            reducedMotion={reducedMotion}
            isDocumentHidden={isDocumentHidden}
          />
        )}
      </div>

      {/* Stage prompt / footer cue */}
      <div className="pointer-events-none fixed bottom-[clamp(44px,6.2vh,72px)] left-1/2 -translate-x-1/2 z-30 text-center">
        {phase === 'idle' && (
          <p
            className={`whitespace-nowrap font-dot text-[clamp(10px,0.85vw,13px)] uppercase tracking-[0.28em] text-white/40 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showIdleHint ? 'opacity-100' : 'opacity-0'
            }`}
          >
            HOLD OR TAP SPACE TO OPEN
          </p>
        )}

        {phase === 'stack' && (
          <p className="whitespace-nowrap font-dot text-[clamp(10px,0.85vw,13px)] uppercase tracking-[0.28em] text-white/42 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]">
            SPACE TO REVEAL
          </p>
        )}

        {phase === 'finale' && (
          <p className="whitespace-pre font-dot text-[clamp(10px,0.85vw,13px)] uppercase tracking-[0.28em] text-white/42 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]">
            {'R  OPEN ANOTHER PACK'}
          </p>
        )}
      </div>

      {/* Bottom-centre 5-dot reveal progress indicator (monochrome graphite/white) */}
      {showProgressDots && (
        <div
          aria-label={`${revealedCount} of ${cards.length} cards revealed`}
          className="pointer-events-none fixed bottom-[clamp(16px,2.4vh,30px)] left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5"
        >
          {cards.map((card, idx) => {
            const isRevealed = idx < revealedCount
            const isCurrent = phase === 'reveal' && idx === revealIndex
            return (
              <span
                key={card.code}
                className={`block h-1.5 rounded-full transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isCurrent
                    ? 'w-7 bg-white/85'
                    : isRevealed
                      ? 'w-2.5 bg-white/45'
                      : 'w-2 bg-white/[0.15]'
                }`}
              />
            )
          })}
        </div>
      )}
    </main>
  )
}

export default PackPage
