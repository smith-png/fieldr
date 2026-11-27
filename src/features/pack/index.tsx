import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
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
import { PackAudioEngine } from './packAudio'
import { PackCard, PackCardBack } from './PackCard'
import { buildPackCards, preloadPackImages, setPremiumPlayerIds } from './packUtils'
import { SealedPack } from './SealedPack'
import {
  CARD_SETTLE_MS,
  OPENING_ANTICIPATION_MS,
  OPENING_RELEASE_MS,
  OPENING_TEAR_MS,
  OPENING_TOTAL_MS,
  PACK_EASE,
  PREMIUM_ANTICIPATION_MS,
  PREMIUM_FLIP_MS,
  STANDARD_FLIP_MS,
  type OpeningStep,
  type PackCardItem,
  type PackStagePhase
} from './types'
import './pack.css'

const CURSOR_HIDE_DELAY_MS = 3000

export function PackPage() {
  const reducedMotion = Boolean(useReducedMotion())

  const [phase, setPhase] = useState<PackStagePhase>('loading')
  const [openingStep, setOpeningStep] = useState<OpeningStep>('idle')
  const [showTearLift, setShowTearLift] = useState(false)
  const [seasonName, setSeasonName] = useState<string | null>(null)
  const [cards, setCards] = useState<PackCardItem[]>([])
  const [packNonce, setPackNonce] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [revealedCount, setRevealedCount] = useState(0)

  const [soundEnabled, setSoundEnabled] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  )
  const [isCursorHidden, setIsCursorHidden] = useState(false)
  const [isDocumentHidden, setIsDocumentHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.hidden : false
  )

  const audioRef = useRef<PackAudioEngine | null>(null)
  const timersRef = useRef<Set<number>>(new Set())
  const cursorTimerRef = useRef<number | null>(null)
  const loadGenRef = useRef(0)
  const isMountedRef = useRef(true)
  const seasonPlayersRef = useRef<PublicPlayer[] | null>(null)
  const seenPremiumIdsRef = useRef<Set<string>>(new Set())

  const scheduleTimer = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id)
      fn()
    }, delayMs)
    timersRef.current.add(id)
    return id
  }, [])

  const clearAllStageTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id)
    }
    timersRef.current.clear()
  }, [])

  // Lazily instantiate audio engine (OFF by default; AudioContext stays null until user gesture + enabled)
  if (!audioRef.current) {
    audioRef.current = new PackAudioEngine()
  }

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

  // Track document.hidden to pause all animation loops
  useEffect(() => {
    const onVisibility = () => {
      setIsDocumentHidden(document.hidden)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // Track fullscreen changes
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
      clearAllStageTimers()
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [clearAllStageTimers])

  // Read-only fetch once per session: active season -> public players + premium ids -> draw 5 without repeating premiums
  const loadFreshPack = useCallback(async () => {
    const gen = ++loadGenRef.current
    clearAllStageTimers()
    setPhase('loading')
    setOpeningStep('idle')
    setShowTearLift(false)
    setCurrentIndex(0)
    setRevealedCount(0)

    try {
      let allPlayers = seasonPlayersRef.current

      if (allPlayers === null) {
        const season = await getActiveSeason()
        if (!isMountedRef.current || loadGenRef.current !== gen) return

        if (!season?.id) {
          setSeasonName(null)
          setPremiumPlayerIds([])
          setCards([])
          setPhase('empty')
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
          setCards([])
          setPhase('empty')
          return
        }

        seasonPlayersRef.current = fetchedPlayers
        allPlayers = fetchedPlayers
      }

      const nextCards = buildPackCards(allPlayers, {
        seenPremiumIds: seenPremiumIdsRef.current
      })
      if (nextCards.length === 0) {
        setCards([])
        setPhase('empty')
        return
      }

      await preloadPackImages(nextCards)
      if (!isMountedRef.current || loadGenRef.current !== gen) return

      setCards(nextCards)
      setPackNonce((n) => n + 1)
      setPhase('sealed')
    } catch {
      if (!isMountedRef.current || loadGenRef.current !== gen) return
      setCards([])
      setPhase('empty')
    }
  }, [clearAllStageTimers])

  // Initial load once on mount
  useEffect(() => {
    void loadFreshPack()
  }, [loadFreshPack])

  const isTransitioning =
    phase === 'loading' ||
    phase === 'opening' ||
    phase === 'suspense' ||
    phase === 'revealing'

  const startCardReveal = useCallback(
    (index: number) => {
      const target = cards[index]
      if (!target) return

      clearAllStageTimers()
      setCurrentIndex(index)

      if (target.isPremium) {
        // Premium reveal: 900ms anticipation (diffraction edge line) -> 1300ms flip + 700ms foil fade -> settle
        setPhase('suspense')

        const anticipationMs = reducedMotion ? 220 : PREMIUM_ANTICIPATION_MS
        const flipMs = reducedMotion ? 280 : PREMIUM_FLIP_MS
        const chimeOffsetMs = reducedMotion ? 60 : Math.round(PREMIUM_FLIP_MS * 0.32)

        scheduleTimer(() => {
          setPhase('revealing')
          setRevealedCount((prev) => Math.max(prev, index + 1))

          scheduleTimer(() => {
            audioRef.current?.playPremiumChime()
          }, chimeOffsetMs)

          scheduleTimer(() => {
            audioRef.current?.playCardLand()
            setPhase('revealed')
          }, flipMs)
        }, anticipationMs)
        return
      }

      // Standard reveal: lift to centre (1 -> 1.06) and flip over 900ms, ONE 600ms white specular sweep, settle
      setPhase('suspense')
      const liftDelayMs = reducedMotion ? 40 : 60
      const flipMs = reducedMotion ? 260 : STANDARD_FLIP_MS

      scheduleTimer(() => {
        setPhase('revealing')
        setRevealedCount((prev) => Math.max(prev, index + 1))

        scheduleTimer(() => {
          audioRef.current?.playCardLand()
          setPhase('revealed')
        }, flipMs)
      }, liftDelayMs)
    },
    [cards, clearAllStageTimers, reducedMotion, scheduleTimer]
  )

  const handleAdvance = useCallback(() => {
    if (isTransitioning) return
    audioRef.current?.unlock()

    if (phase === 'sealed') {
      clearAllStageTimers()
      setPhase('opening')

      if (reducedMotion) {
        setOpeningStep('release')
        scheduleTimer(() => {
          setOpeningStep('idle')
          setPhase('stack')
        }, 320)
        return
      }

      // 1. Anticipation (0 -> 800ms): pack settles forward, single specular line slides across top seam
      setOpeningStep('anticipation')
      audioRef.current?.playPackBuild(OPENING_ANTICIPATION_MS / 1000)

      // 2. Tear (800 -> 1500ms): clean slit, top strip peels up & away, max 6% white vignette lift for 200ms
      scheduleTimer(() => {
        setOpeningStep('tear')
        setShowTearLift(true)
        audioRef.current?.playPackTear()
      }, OPENING_ANTICIPATION_MS)

      scheduleTimer(() => {
        setShowTearLift(false)
      }, OPENING_ANTICIPATION_MS + 200)

      // 3. Release (1500 -> 2400ms): pack body sinks & fades while 5 cards rise as a tight face-down stack
      const releaseStartMs = OPENING_ANTICIPATION_MS + OPENING_TEAR_MS
      scheduleTimer(() => {
        setOpeningStep('release')
      }, releaseStartMs)

      // 4. Settle (2400 -> 3200ms): pack unmounts (disposes WebGPU), stack settles at centre & label fades in
      const settleStartMs = releaseStartMs + OPENING_RELEASE_MS
      scheduleTimer(() => {
        setOpeningStep('settle')
        audioRef.current?.playCardLand()
      }, settleStartMs)

      // Opening complete (~3200ms): unlock input for reveal
      scheduleTimer(() => {
        setOpeningStep('idle')
        setPhase('stack')
      }, OPENING_TOTAL_MS)
      return
    }

    if (phase === 'stack') {
      if (cards.length > 0) {
        startCardReveal(0)
      }
      return
    }

    if (phase === 'revealed') {
      if (currentIndex + 1 < cards.length) {
        startCardReveal(currentIndex + 1)
      } else {
        clearAllStageTimers()
        setPhase('finale')
        scheduleTimer(() => {
          audioRef.current?.playCardLand()
        }, CARD_SETTLE_MS)
      }
    }
  }, [
    isTransitioning,
    phase,
    cards.length,
    currentIndex,
    clearAllStageTimers,
    reducedMotion,
    scheduleTimer,
    startCardReveal
  ])

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

  // Keyboard controls (Space/Enter, R, F, M, Escape); ignore advance/reset while a transition runs
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      const key = event.key

      if (key === ' ' || key === 'Enter') {
        event.preventDefault()
        handleAdvance()
      } else if (key === 'r' || key === 'R') {
        if (!isTransitioning) {
          event.preventDefault()
          audioRef.current?.unlock()
          void loadFreshPack()
        }
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

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    handleAdvance,
    handleExitFullscreen,
    handleToggleFullscreen,
    handleToggleSound,
    isTransitioning,
    loadFreshPack
  ])

  const activeCard = cards[currentIndex] ?? null
  const previousRevealedCards =
    phase === 'suspense' || phase === 'revealing' || phase === 'revealed'
      ? cards.slice(0, currentIndex)
      : []
  const remainingUnrevealedCount = Math.max(0, cards.length - currentIndex - 1)

  // Pack stays mounted through Release so its body sinks & fades smoothly, then unmounts on Settle (disposing WebGPU)
  const showPack = phase === 'sealed' || (phase === 'opening' && openingStep !== 'settle')
  // Stack mounts right at Release so the 5 cards rise while the pack body sinks
  const showStack =
    phase === 'stack' ||
    (phase === 'opening' && (openingStep === 'release' || openingStep === 'settle'))
  const showStackPrompt = phase === 'stack' || (phase === 'opening' && openingStep === 'settle')

  const showProgressDots =
    cards.length > 0 &&
    (phase === 'stack' ||
      phase === 'suspense' ||
      phase === 'revealing' ||
      phase === 'revealed' ||
      phase === 'finale')

  const isActiveCardLifted = phase === 'suspense' || phase === 'revealing'

  return (
    <main
      data-theme="dark"
      onClick={handleAdvance}
      className={`pack-stage fixed inset-0 h-dvh w-dvw overflow-hidden bg-[#090a0c] text-white/90 select-none flex flex-col items-center justify-center ${
        isCursorHidden ? 'cursor-none' : isTransitioning ? 'cursor-default' : 'cursor-pointer'
      } ${isDocumentHidden ? 'pack-paused' : ''}`}
    >
      {/* Single very soft top-down spotlight */}
      <div aria-hidden="true" className="pack-spotlight pointer-events-none absolute inset-0 z-0" />

      {/* Subtle 3.5% film grain overlay */}
      <div aria-hidden="true" className="pack-film-grain pointer-events-none fixed inset-0 z-50" />

      {/* Restrained 6% white vignette lift for 200ms at the Tear moment (no flash) */}
      <AnimatePresence>
        {showTearLift && !reducedMotion && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1, ease: PACK_EASE }}
            className="pointer-events-none fixed inset-0 z-30"
            style={{
              background:
                'radial-gradient(ellipse 68% 58% at 50% 42%, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.015) 55%, transparent 82%)'
            }}
          />
        )}
      </AnimatePresence>

      {/* Discreet top-right operator controls (Sound [M] & Fullscreen [F]) */}
      <div
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

      {/* Main Stage Area */}
      <div className="relative z-10 flex-1 w-full flex flex-col items-center justify-center px-[clamp(16px,3vw,48px)] pb-14 pt-10">
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

        {/* Shared centered slot for SealedPack and rising 5-card Stack so release overlaps cleanly with zero layout jump */}
        {(showPack || showStack) && (
          <div className="relative grid place-items-center">
            {showPack && (
              <div className="col-start-1 row-start-1 z-10">
                <SealedPack
                  key={`pack-${packNonce}`}
                  seasonName={seasonName}
                  phase={phase === 'opening' ? 'opening' : 'sealed'}
                  openingStep={openingStep}
                  reducedMotion={reducedMotion}
                  isDocumentHidden={isDocumentHidden}
                />
              </div>
            )}

            {showStack && (
              <div
                key={`stack-${packNonce}`}
                className="col-start-1 row-start-1 z-20 relative flex flex-col items-center justify-center"
                style={{ perspective: '1400px' }}
              >
                {/* Growing soft contact shadow beneath the rising stack */}
                <motion.div
                  aria-hidden="true"
                  initial={{ opacity: 0, scale: 0.84 }}
                  animate={{ opacity: 0.78, scale: 1 }}
                  transition={{ duration: reducedMotion ? 0.25 : 0.9, ease: PACK_EASE }}
                  className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 w-[84%] h-10 rounded-full bg-black/90 blur-2xl z-0"
                />

                <div
                  className="relative z-10"
                  style={{
                    width: 'clamp(232px, min(21.5vw, 33.5vh), 344px)',
                    aspectRatio: '5 / 7',
                    transformStyle: 'preserve-3d'
                  }}
                >
                  {cards.map((card, idx) => {
                    const depth = cards.length - 1 - idx
                    const spreadIdx = idx - (cards.length - 1) / 2
                    return (
                      <motion.div
                        key={`${packNonce}-stack-${card.code}`}
                        initial={
                          reducedMotion
                            ? { opacity: 0 }
                            : {
                                x: 0,
                                y: 78 + depth * 4,
                                z: -26 - depth * 5,
                                scale: 0.94,
                                rotate: 0,
                                rotateY: spreadIdx * 2.4,
                                opacity: 0
                              }
                        }
                        animate={
                          reducedMotion
                            ? { opacity: 1 }
                            : {
                                x: depth * 2.5,
                                y: depth * 3,
                                z: -depth * 4,
                                scale: 1,
                                rotate: (depth - 2) * 0.35,
                                rotateY: (depth - 2) * 0.65,
                                opacity: 1
                              }
                        }
                        transition={{
                          duration: reducedMotion ? 0.25 : 0.9,
                          delay: reducedMotion ? 0 : idx * 0.1,
                          ease: PACK_EASE
                        }}
                        style={{ zIndex: idx + 1, transformStyle: 'preserve-3d' }}
                        className="absolute inset-0"
                      >
                        <PackCardBack
                          ariaHidden
                          className="w-full h-full shadow-[0_22px_58px_rgba(0,0,0,0.72)]"
                        />
                      </motion.div>
                    )
                  })}
                </div>

                {/* Small "SPACE TO REVEAL" label fades in as stack settles */}
                {showStackPrompt && (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reducedMotion ? 0.25 : 0.75,
                      ease: PACK_EASE
                    }}
                    className="pointer-events-none absolute top-full mt-[clamp(22px,3.2vh,38px)] whitespace-nowrap font-dot text-[clamp(10px,0.85vw,13px)] uppercase tracking-[0.28em] text-white/40 text-center"
                  >
                    SPACE TO REVEAL
                  </motion.p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Active single-card reveal stage (suspense -> revealing -> revealed) */}
        {(phase === 'suspense' || phase === 'revealing' || phase === 'revealed') && activeCard && (
          <div className="relative flex flex-col items-center justify-center w-full">
            {/* Left side: remaining face-down stack waiting to be revealed */}
            {remainingUnrevealedCount > 0 && !reducedMotion && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute opacity-28 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: 'clamp(178px, min(16.5vw, 25vh), 264px)',
                  aspectRatio: '5 / 7',
                  transform: 'translate3d(-138%, 6%, 0) rotate(-3deg)'
                }}
              >
                {Array.from({ length: Math.min(remainingUnrevealedCount, 4) }).map((_, i) => (
                  <div
                    key={i}
                    style={{ transform: `translate3d(${i * 2.5}px, ${i * 3}px, 0)` }}
                    className="absolute inset-0"
                  >
                    <PackCardBack
                      ariaHidden
                      className="w-full h-full shadow-[0_18px_42px_rgba(0,0,0,0.68)]"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Right side: previously revealed cards sliding smoothly onto the side stack */}
            {previousRevealedCards.length > 0 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  width: 'clamp(178px, min(16.5vw, 25vh), 264px)',
                  aspectRatio: '5 / 7',
                  transform: 'translate3d(138%, 6%, 0)'
                }}
              >
                {previousRevealedCards.map((card, idx) => (
                  <motion.div
                    key={`${packNonce}-side-${card.code}`}
                    initial={
                      reducedMotion
                        ? { opacity: 0 }
                        : {
                            x: '-138%',
                            y: '-6%',
                            scale: 1.32,
                            rotate: 0,
                            opacity: 0.92
                          }
                    }
                    animate={{
                      x: idx * 3,
                      y: idx * 3,
                      scale: 1,
                      rotate: 2.5 + idx * 0.5,
                      opacity: idx === previousRevealedCards.length - 1 ? 0.62 : 0.34
                    }}
                    transition={{
                      duration: reducedMotion ? 0.25 : 0.85,
                      ease: PACK_EASE
                    }}
                    style={{ zIndex: idx + 1 }}
                    className="absolute inset-0"
                  >
                    <PackCard
                      item={card}
                      isFaceUp
                      isSuspense={false}
                      size="side"
                      reducedMotion={reducedMotion}
                      isDocumentHidden={isDocumentHidden}
                      interactiveTilt={false}
                    />
                  </motion.div>
                ))}
              </div>
            )}

            {/* Centre active card: lifts (scale 1 -> 1.06, soft shadow), flips, then settles */}
            <div className="relative z-10 flex items-center justify-center">
              {/* Soft grounded contact shadow beneath the active card */}
              <motion.div
                aria-hidden="true"
                animate={
                  isActiveCardLifted
                    ? { opacity: 0.9, scale: 1.08, y: 10 }
                    : { opacity: 0.68, scale: 1, y: 0 }
                }
                transition={{ duration: reducedMotion ? 0.25 : 0.8, ease: PACK_EASE }}
                className="pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 w-[82%] h-10 rounded-full bg-black/90 blur-2xl z-0"
              />

              <motion.div
                key={`${packNonce}-card-${activeCard.code}`}
                initial={
                  reducedMotion
                    ? { opacity: 0 }
                    : { opacity: 0, x: -72, y: 24, scale: 1 }
                }
                animate={
                  reducedMotion
                    ? { opacity: 1 }
                    : {
                        opacity: 1,
                        x: 0,
                        y: isActiveCardLifted ? -10 : 0,
                        scale: isActiveCardLifted ? 1.06 : 1
                      }
                }
                transition={{
                  duration: reducedMotion ? 0.25 : isActiveCardLifted ? 0.85 : 0.7,
                  ease: PACK_EASE
                }}
                style={{
                  width: 'clamp(248px, min(23.5vw, 36.5vh), 384px)'
                }}
                className="relative z-10"
              >
                <PackCard
                  item={activeCard}
                  isFaceUp={phase === 'revealing' || phase === 'revealed'}
                  isSuspense={phase === 'suspense'}
                  size="stage"
                  reducedMotion={reducedMotion}
                  isDocumentHidden={isDocumentHidden}
                  interactiveTilt={phase === 'revealed'}
                  playRevealSweep
                />
              </motion.div>
            </div>
          </div>
        )}

        {/* Finale: all 5 cards in a row, LARGE (~17vw each, fitting 92vw at 1920x1080 & 1280x720), slight +-3deg fan, premium lifted 14px */}
        {phase === 'finale' && (
          <div className="flex flex-col items-center justify-center w-full max-w-[92vw]">
            <div
              className="flex items-center justify-center w-full"
              style={{ gap: 'clamp(10px, 1.7vw, 32px)' }}
            >
              {cards.map((card, idx) => {
                const centerOffset = idx - (cards.length - 1) / 2
                const fanAngle = centerOffset * 1.5 // -3deg .. +3deg
                const fanArcY = Math.abs(centerOffset) * 5
                const settledY = fanArcY - (card.isPremium ? 14 : 0)

                return (
                  <motion.div
                    key={`${packNonce}-finale-${card.code}`}
                    initial={
                      reducedMotion
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            y: 44,
                            scale: 0.94,
                            rotate: fanAngle * 1.4
                          }
                    }
                    animate={{
                      opacity: 1,
                      y: settledY,
                      scale: 1,
                      rotate: fanAngle
                    }}
                    transition={{
                      duration: reducedMotion ? 0.3 : 0.9,
                      delay: reducedMotion ? 0 : idx * 0.11,
                      ease: PACK_EASE
                    }}
                    style={{
                      width: 'clamp(136px, min(17vw, 36vh), 330px)'
                    }}
                    className="shrink-0 relative"
                  >
                    {/* Soft grounded contact shadow per finale card */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 w-[80%] h-7 rounded-full bg-black/85 blur-xl z-0"
                    />
                    <div className="relative z-10">
                      <PackCard
                        item={card}
                        isFaceUp
                        isSuspense={false}
                        size="finale"
                        reducedMotion={reducedMotion}
                        isDocumentHidden={isDocumentHidden}
                        interactiveTilt
                        swayPhaseOffset={idx * 1.35}
                      />
                    </div>
                  </motion.div>
                )
              })}
            </div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.75, delay: reducedMotion ? 0 : 0.5, ease: PACK_EASE }}
              className="mt-[clamp(26px,3.8vh,46px)] whitespace-pre font-dot text-[clamp(10px,0.85vw,13px)] uppercase tracking-[0.28em] text-white/40"
            >
              {'R  OPEN ANOTHER PACK'}
            </motion.p>
          </div>
        )}
      </div>

      {/* Bottom-centre 5-dot reveal progress indicator (monochrome graphite/white) */}
      {showProgressDots && (
        <div
          aria-label={`${revealedCount} of ${cards.length} cards revealed`}
          className="pointer-events-none fixed bottom-[clamp(18px,2.8vh,34px)] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5"
        >
          {cards.map((card, idx) => {
            const isRevealed = idx < revealedCount
            const isCurrent =
              (phase === 'suspense' || phase === 'revealing' || phase === 'revealed') &&
              idx === currentIndex
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
