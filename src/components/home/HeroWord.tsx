import React, { useEffect, useRef } from 'react'

interface HeroWordProps {
  word: string
  playIntro: boolean
}

export const HeroWord: React.FC<HeroWordProps> = ({ word, playIntro }) => {
  const wordRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = wordRef.current
    if (!el) return

    const supportsScrollTimeline =
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('animation-timeline', 'scroll(root)') &&
      CSS.supports('animation-range', '0 28vh')

    if (supportsScrollTimeline) return

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

    let rafId: number | null = null
    let listening = false

    const updatePosition = () => {
      rafId = null
      const range = window.innerHeight * 0.28
      const progress = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0
      const posX = ((1 - progress) * 100).toFixed(2)
      el.style.backgroundPosition = `${posX}% 0, 0 0`
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
      el.style.backgroundPosition = ''
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
      {/* Large faint circular pitch/stadium arc rotating slowly behind the wordmark */}
      <div aria-hidden="true" className="hero-arc-wrap">
        <svg viewBox="0 0 400 400" fill="none" className="hero-arc-spin">
          <circle
            cx="200"
            cy="200"
            r="186"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            strokeDasharray="860 309"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Static 1px sage outline echo offset 4px right and 4px down */}
      <span aria-hidden="true" className="hero-word hero-word-echo">
        {word}
      </span>

      {/* Solid Syne 800 wordmark with vertical token gradient and scroll-driven shine */}
      <div className={`hero-word-main-wrap${playIntro ? ' hero-word-enter' : ''}`}>
        <h1 ref={wordRef} className="hero-word hero-word-main">
          {word}
        </h1>
      </div>
    </div>
  )
}
