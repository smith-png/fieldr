import React, { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { User } from '@phosphor-icons/react'

const BASELINE_DURATION_SECONDS = 5.6

interface SalePriceCountUpProps {
  targetPrice: number
  delayMs: number
  durationMs: number
  reduceMotion: boolean
}

const SalePriceCountUp: React.FC<SalePriceCountUpProps> = ({
  targetPrice,
  delayMs,
  durationMs,
  reduceMotion
}) => {
  const [displayPrice, setDisplayPrice] = useState(reduceMotion ? targetPrice : 0)

  useEffect(() => {
    if (reduceMotion) {
      setDisplayPrice(targetPrice)
      return
    }

    setDisplayPrice(0)
    const safeDuration = Math.max(100, durationMs)
    const safeDelay = Math.max(0, delayMs)
    let rafId = 0

    const delayTimer = setTimeout(() => {
      const startTime = performance.now()
      const step = (now: number) => {
        const elapsed = now - startTime
        const progress = Math.min(elapsed / safeDuration, 1)
        const easeOutQuart = 1 - Math.pow(1 - progress, 4)
        setDisplayPrice(Math.round(targetPrice * easeOutQuart))
        if (progress < 1) {
          rafId = requestAnimationFrame(step)
        }
      }
      rafId = requestAnimationFrame(step)
    }, safeDelay)

    return () => {
      clearTimeout(delayTimer)
      cancelAnimationFrame(rafId)
    }
  }, [targetPrice, delayMs, durationMs, reduceMotion])

  return <>{displayPrice.toLocaleString()}</>
}

export interface SecuredSequenceProps {
  playerName: string
  playerCode: string
  sport: string
  playingRole: string
  academicYearLabel?: string
  photoUrl?: string
  teamName?: string | null
  teamShortCode?: string | null
  teamColor?: string | null
  teamLogoUrl?: string | null
  price: number
  securedDurationSeconds: number
  priceCountupSeconds: number
  reduceMotion?: boolean
}

export const SecuredSequence: React.FC<SecuredSequenceProps> = ({
  playerName,
  playerCode,
  sport,
  playingRole,
  academicYearLabel,
  photoUrl,
  teamName,
  teamShortCode,
  teamColor,
  teamLogoUrl,
  price,
  securedDurationSeconds,
  priceCountupSeconds,
  reduceMotion: reduceMotionProp
}) => {
  const systemReducedMotion = Boolean(useReducedMotion())
  const shouldReduceMotion = reduceMotionProp ?? systemReducedMotion

  const clampedDuration = Math.min(15, Math.max(2, Number(securedDurationSeconds) || BASELINE_DURATION_SECONDS))
  const clampedCountup = Math.min(
    clampedDuration,
    Math.min(6, Math.max(0.3, Number(priceCountupSeconds) || 1.8))
  )

  // Scale factor relative to the 5.6s baseline
  const scale = clampedDuration / BASELINE_DURATION_SECONDS
  const accentColor = teamColor || '#10B981'

  // Ensure price count-up starts at the scaled reveal beat (or earlier if count-up is long) so it finishes within clampedDuration
  const scaledRevealDelaySec = 1.15 * scale
  const maxAllowedDelaySec = Math.max(0, clampedDuration - clampedCountup)
  const effectiveCountupDelaySec = Math.min(scaledRevealDelaySec, maxAllowedDelaySec)

  return (
    <div className="w-full py-8 sm:py-12 flex flex-col items-center justify-center relative overflow-hidden rounded-3xl">
      {/* 1. Buying Team Colour Wash / Wipe Across Screen */}
      {shouldReduceMotion ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.16 }}
          transition={{ duration: 0.6 * scale }}
          className="fixed inset-0 pointer-events-none z-0"
          style={{ backgroundColor: accentColor }}
        />
      ) : (
        <>
          <motion.div
            initial={{ x: '-105%', opacity: 0.85 }}
            animate={{ x: '105%', opacity: 0 }}
            transition={{ duration: 1.35 * scale, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 pointer-events-none z-20"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${accentColor} 50%, transparent 100%)`
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 0.18, scale: 1 }}
            transition={{ duration: 1.1 * scale, ease: 'easeOut' }}
            className="fixed inset-0 pointer-events-none z-0"
            style={{
              background: `radial-gradient(circle at 50% 45%, ${accentColor} 0%, transparent 75%)`
            }}
          />
        </>
      )}

      {/* 2. Thin Light Sweep & Soft Accent Lines in Team Colour */}
      {!shouldReduceMotion && (
        <>
          <motion.div
            initial={{ x: '-140%', skewX: -20, opacity: 0 }}
            animate={{ x: '220%', skewX: -20, opacity: [0, 0.65, 0] }}
            transition={{
              duration: 1.6 * scale,
              delay: 0.55 * scale,
              ease: [0.22, 1, 0.36, 1]
            }}
            className="absolute inset-y-0 w-32 pointer-events-none z-20"
            style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}88, rgba(255,255,255,0.6), transparent)`
            }}
          />
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 0.75 }}
            transition={{
              duration: 0.9 * scale,
              delay: 0.25 * scale,
              ease: [0.16, 1, 0.3, 1]
            }}
            className="w-full max-w-5xl h-1 rounded-full mb-8 origin-center"
            style={{ backgroundColor: accentColor }}
          />
        </>
      )}

      {/* Main Sequence Content Container */}
      <div
        className="w-full max-w-6xl bg-surface/95 border-2 rounded-3xl p-8 sm:p-12 shadow-2xl relative z-10 overflow-hidden"
        style={{ borderColor: accentColor }}
      >
        {/* Subtle Accent Line Inside Stage */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{
            duration: 0.8 * scale,
            delay: 0.3 * scale,
            ease: [0.16, 1, 0.3, 1]
          }}
          className="absolute top-0 left-0 right-0 h-3 origin-left"
          style={{ backgroundColor: accentColor }}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* 3. Player Photo & Name with Depth Effect */}
          <div className="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="relative mb-6">
              {/* Depth Offset Frame */}
              <motion.div
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.88, x: 0, y: 0 }
                }
                animate={
                  shouldReduceMotion
                    ? { opacity: 0.35 }
                    : { opacity: 0.35, scale: 1.03, x: 12, y: 12 }
                }
                transition={{
                  duration: 0.75 * scale,
                  delay: 0.35 * scale,
                  ease: [0.16, 1, 0.3, 1]
                }}
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{ backgroundColor: accentColor }}
              />

              <motion.div
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.86, y: 24 }
                }
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  duration: 0.7 * scale,
                  delay: 0.25 * scale,
                  ease: [0.16, 1, 0.3, 1]
                }}
                className="w-60 h-72 sm:w-72 sm:h-88 rounded-3xl bg-surface-2 border-2 border-border overflow-hidden relative z-10 shadow-xl flex items-center justify-center"
              >
                {photoUrl ? (
                  <img
                    src={photoUrl}
                    alt={playerName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={88} weight="thin" className="text-muted" />
                )}
              </motion.div>
            </div>

            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.55 * scale,
                delay: 0.45 * scale,
                ease: [0.16, 1, 0.3, 1]
              }}
            >
              <div className="font-mono text-xs sm:text-sm uppercase tracking-widest text-muted mb-1">
                #{playerCode} · {sport} · {playingRole}
              </div>
              <h2 className="font-syne font-extrabold text-4xl sm:text-5xl text-text tracking-tight leading-tight">
                {playerName}
              </h2>
              {academicYearLabel && (
                <div className="font-mono text-sm text-muted mt-1">{academicYearLabel}</div>
              )}
            </motion.div>
          </div>

          {/* 4. Large "SECURED" Word Settle + Team Logo & Name + 5. Price Count-Up */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left gap-6">
            {/* Large SECURED Stamp */}
            <motion.div
              initial={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 1.32, y: -18 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{
                duration: 0.5 * scale,
                delay: 0.7 * scale,
                ease: [0.16, 1, 0.3, 1]
              }}
              className="inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl border-2"
              style={{
                borderColor: accentColor,
                backgroundColor: `${accentColor}1F`
              }}
            >
              <span
                className="font-syne font-extrabold text-4xl sm:text-6xl md:text-7xl tracking-tight uppercase"
                style={{ color: accentColor }}
              >
                SECURED
              </span>
            </motion.div>

            {/* Buying Team Logo & Name */}
            {teamName && (
              <motion.div
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 18, scale: 0.96 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  duration: 0.55 * scale,
                  delay: 1.0 * scale,
                  ease: [0.16, 1, 0.3, 1]
                }}
                className="flex flex-col sm:flex-row items-center gap-5 p-5 rounded-2xl bg-surface-2 border border-border w-full"
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center font-syne font-extrabold text-2xl text-white overflow-hidden border border-border shrink-0 shadow-md"
                  style={{ backgroundColor: accentColor }}
                >
                  {teamLogoUrl ? (
                    <img
                      src={teamLogoUrl}
                      alt={teamName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{teamShortCode || 'TM'}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <span className="font-mono text-xs uppercase tracking-widest text-muted block">
                    Acquired By Franchise
                  </span>
                  <h3 className="font-syne font-extrabold text-3xl sm:text-4xl md:text-5xl text-text tracking-tight truncate">
                    {teamName}
                  </h3>
                </div>
              </motion.div>
            )}

            {/* Final Sale Price Count-Up from 0 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45 * scale, delay: effectiveCountupDelaySec }}
              className="pt-2"
            >
              <span className="font-mono text-xs sm:text-sm uppercase tracking-widest text-muted block mb-1">
                Final Winning Bid
              </span>
              <div className="flex items-baseline justify-center lg:justify-start gap-3">
                <span
                  className="font-syne font-extrabold text-6xl sm:text-7xl md:text-8xl tabular-nums leading-none"
                  style={{ color: accentColor }}
                >
                  <SalePriceCountUp
                    targetPrice={price}
                    delayMs={Math.round(effectiveCountupDelaySec * 1000)}
                    durationMs={Math.round(clampedCountup * 1000)}
                    reduceMotion={shouldReduceMotion}
                  />
                </span>
                <span className="font-mono text-2xl sm:text-3xl font-bold text-muted">
                  PTS
                </span>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
