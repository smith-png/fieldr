import React, { useEffect, useRef } from 'react'

interface HeroWordProps {
  word: string
  playIntro: boolean
}

export const HeroWord: React.FC<HeroWordProps> = ({ word, playIntro }) => {
  const wordRef = useRef<HTMLHeadingElement>(null)

  // Measure the word and each letter so every letter shows its slice of one shared sheen band
  useEffect(() => {
    const el = wordRef.current
    if (!el) return
    const measure = () => {
      el.style.setProperty('--hw', `${el.offsetWidth}px`)
      el.querySelectorAll<HTMLElement>('[data-hero-char]').forEach((c) => {
        c.style.setProperty('--cx', `${c.offsetLeft}px`)
      })
    }
    measure()
    void document.fonts?.ready.then(measure)
    window.addEventListener('resize', measure)
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => {
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [word])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = wordRef.current
    if (!el) return

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

    let rafId: number | null = null
    let listening = false

    const updatePosition = () => {
      rafId = null
      const y = window.scrollY
      const pos = Math.min(100, 18 + (y / 420) * 74)
      el.style.setProperty('--sheen-pos', `${pos.toFixed(1)}%`)

      // Letters float upward one after another, left to right
      const overall = Math.min(1, Math.max(0, y / Math.max(window.innerHeight * 0.45, 240)))
      const chars = el.querySelectorAll<HTMLElement>('[data-hero-char]')
      chars.forEach((c, i) => {
        const raw = Math.min(1, Math.max(0, (overall - i * 0.09) / 0.5))
        const eased = 1 - Math.pow(1 - raw, 2)
        c.style.setProperty('--float', eased.toFixed(3))
      })
    }

    const onScroll = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updatePosition)
      }
    }

    const start = () => {
      if (listening) return
      listening = true
      updatePosition()
      window.addEventListener('scroll', onScroll, { passive: true })
    }

    const stop = () => {
      if (listening) {
        window.removeEventListener('scroll', onScroll)
        listening = false
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
        rafId = null
      }
      el.style.removeProperty('--sheen-pos')
      el.querySelectorAll<HTMLElement>('[data-hero-char]').forEach((c) => {
        c.style.removeProperty('--float')
      })
    }

    const syncMotionPref = () => {
      if (mq?.matches) {
        stop()
      } else {
        start()
      }
    }

    syncMotionPref()

    if (mq) {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', syncMotionPref)
      } else {
        mq.addListener(syncMotionPref)
      }
    }

    return () => {
      stop()
      if (mq) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', syncMotionPref)
        } else {
          mq.removeListener(syncMotionPref)
        }
      }
    }
  }, [])

  return (
    <div className="hero-word-stage">
      {/* Slowly rotating architectural stadium arc behind the wordmark */}
      <div aria-hidden="true" className="hero-arc-wrap">
        <svg viewBox="0 0 600 600" fill="none" className="hero-arc-spin">
          <circle
            cx="300"
            cy="300"
            r="245"
            stroke="var(--arc-stroke)"
            strokeWidth="1"
            strokeDasharray="140 28 36 28"
          />
          <circle
            cx="300"
            cy="300"
            r="198"
            stroke="var(--arc-stroke)"
            strokeWidth="0.9"
            strokeDasharray="6 10"
          />
          <line x1="300" y1="24" x2="300" y2="72" stroke="var(--arc-stroke)" strokeWidth="1" />
          <line x1="300" y1="528" x2="300" y2="576" stroke="var(--arc-stroke)" strokeWidth="1" />
          <line x1="24" y1="300" x2="72" y2="300" stroke="var(--arc-stroke)" strokeWidth="1" />
          <line x1="528" y1="300" x2="576" y2="300" stroke="var(--arc-stroke)" strokeWidth="1" />
        </svg>
      </div>

      {/* Static 1px sage outline echo offset 4px right and 4px down */}
      <span aria-hidden="true" className="hero-word hero-word-echo">
        {word}
      </span>

      {/* Solid Syne 800 wordmark with scroll-driven green sheen */}
      <div className={`hero-word-main-wrap${playIntro ? ' hero-word-enter' : ''}`}>
        <h1 ref={wordRef} className="hero-word hero-word-main">
          <span className="sr-only">{word}</span>
          {word.split('').map((ch, i) => (
            <span key={i} aria-hidden="true" data-hero-char className="hero-char">
              {ch}
            </span>
          ))}
        </h1>
      </div>
    </div>
  )
}
