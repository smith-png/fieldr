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

  // Pinned scroll-linked intro: at the top of the page, wheel / swipe / keys drive the letters and the
  // sheen (progress 0 to 1) while the page itself stays put. Once finished, normal scrolling resumes.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = wordRef.current
    if (!el) return

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null
    if (mq?.matches) return

    const DISTANCE = 560 // virtual scroll distance (px) for the whole sequence
    const SHEEN_START = 18
    const SHEEN_END = 125 // band fully past the last letter

    let progress = window.scrollY > 0 ? 1 : 0
    let rafId: number | null = null
    let lastOffTop = 0
    let touchY: number | null = null

    const render = () => {
      rafId = null
      el.style.setProperty(
        '--sheen-pos',
        `${(SHEEN_START + progress * (SHEEN_END - SHEEN_START)).toFixed(1)}%`
      )
      el.querySelectorAll<HTMLElement>('[data-hero-char]').forEach((c, i) => {
        const raw = Math.min(1, Math.max(0, (progress - i * 0.08) / 0.6))
        const eased = 1 - Math.pow(1 - raw, 2)
        c.style.setProperty('--float', eased.toFixed(3))
      })
    }
    const schedule = () => {
      if (rafId === null) rafId = window.requestAnimationFrame(render)
    }
    const setProgress = (next: number) => {
      const clamped = Math.min(1, Math.max(0, next))
      if (clamped === progress) return
      progress = clamped
      schedule()
    }

    const modalOpen = (target: EventTarget | null) =>
      Boolean(document.querySelector('[aria-modal="true"]')) ||
      (target instanceof Element && Boolean(target.closest('[role="dialog"]')))

    // Returns true when the movement was consumed by the intro (so the page must not scroll)
    const consume = (delta: number): boolean => {
      if (window.scrollY > 0) return false
      if (delta > 0 && progress < 1) {
        setProgress(progress + delta / DISTANCE)
        return true
      }
      // Only reverse after the page has rested at the top, so fast flicks upward do not rewind it
      if (delta < 0 && progress > 0 && Date.now() - lastOffTop > 400) {
        setProgress(progress + delta / DISTANCE)
        return true
      }
      return false
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || modalOpen(e.target)) return
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      if (consume(e.deltaY * unit)) e.preventDefault()
    }

    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches.length === 1 ? e.touches[0].clientY : null
    }
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null || e.touches.length !== 1 || modalOpen(e.target)) return
      const y = e.touches[0].clientY
      const delta = touchY - y
      touchY = y
      if (consume(delta) && e.cancelable) e.preventDefault()
    }
    const onTouchEnd = () => {
      touchY = null
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || modalOpen(e.target)) return
      const t = e.target
      if (
        t instanceof HTMLElement &&
        (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      ) {
        return
      }
      let delta = 0
      if (e.key === 'ArrowDown') delta = 80
      else if (e.key === 'ArrowUp') delta = -80
      else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) delta = DISTANCE * 0.6
      else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) delta = -DISTANCE * 0.6
      else if (e.key === 'End') delta = DISTANCE
      else if (e.key === 'Home') delta = -DISTANCE
      if (delta !== 0 && consume(delta)) e.preventDefault()
    }

    // Any other way of leaving the top (anchor jump, Rosters button, scrollbar) completes the intro
    const onScroll = () => {
      if (window.scrollY > 0) {
        lastOffTop = Date.now()
        if (progress < 1) setProgress(1)
      }
    }

    render()
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchEnd, { passive: true })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll)
      if (rafId !== null) window.cancelAnimationFrame(rafId)
      el.style.removeProperty('--sheen-pos')
      el.querySelectorAll<HTMLElement>('[data-hero-char]').forEach((c) => {
        c.style.removeProperty('--float')
      })
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
