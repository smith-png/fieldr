import React, { useEffect, useRef } from 'react'

interface HeroWordProps {
  word: string
  playIntro: boolean
}

export const HeroWord: React.FC<HeroWordProps> = ({ word, playIntro }) => {
  const stageRef = useRef<HTMLDivElement>(null)
  const wordRef = useRef<HTMLHeadingElement>(null)

  // Measure the word and each letter so every letter shows its slice of one shared sheen band.
  // On mobile (<640px), fit the wordmark + 4px echo cleanly inside 20px side margins.
  useEffect(() => {
    const el = wordRef.current
    if (!el) return
    const measure = () => {
      const stage = stageRef.current
      if (stage && window.innerWidth < 640) {
        const targetW = Math.max(200, window.innerWidth - 46)
        const currentW = el.scrollWidth
        const currentFs = parseFloat(window.getComputedStyle(el).fontSize)
        if (currentW > 0 && currentFs > 0 && Math.abs(currentW - targetW) > 2) {
          const nextFs = Math.max(
            28,
            Math.min(92, Math.floor((currentFs * (targetW / currentW)) * 2) / 2)
          )
          const prevProp = parseFloat(stage.style.getPropertyValue('--hero-mobile-fs'))
          if (Number.isNaN(prevProp) || Math.abs(nextFs - prevProp) >= 0.5) {
            stage.style.setProperty('--hero-mobile-fs', `${nextFs}px`)
          }
        }
      } else if (stage) {
        stage.style.removeProperty('--hero-mobile-fs')
      }

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

  // Two-phase scroll-linked intro:
  // - 0 to 50% (280px): pinned at the top, driven by wheel / swipe / keys.
  // - 50 to 100% (next 280px): pin releases seamlessly and real scrollY drives the second half.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const el = wordRef.current
    if (!el) return

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null
    if (mq?.matches) return

    const TOTAL_DISTANCE = 560 // 280px pinned (0..50%) + 280px real scroll (50..100%)
    const SCROLL_DISTANCE = 280
    const PIN_PROGRESS = 0.5
    const SHEEN_START = 18
    const SHEEN_END = 125 // band fully past the last letter
    const TOP_REST_MS = 400

    const startsScrolled = window.scrollY > 0
    let progress = startsScrolled ? 1 : 0
    let forceFinished = startsScrolled
    let rafId: number | null = null
    let momentumRafId: number | null = null
    let lastOffTop = startsScrolled ? Date.now() : 0
    let touchX: number | null = null
    let touchY: number | null = null
    let touchTime = 0
    let touchVelocity = 0 // px/ms, positive = scrolling down
    let touchLocked = false // true when preventDefault took over scrolling during this touch

    const progressFromScrollY = (y: number) =>
      PIN_PROGRESS + Math.min(1, Math.max(0, y) / SCROLL_DISTANCE) * (1 - PIN_PROGRESS)

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
    const syncFromScroll = () => {
      const y = window.scrollY
      if (y > 0) {
        lastOffTop = Date.now()
        setProgress(progressFromScrollY(y))
      } else {
        setProgress(PIN_PROGRESS)
      }
    }
    const stopMomentum = () => {
      if (momentumRafId !== null) {
        window.cancelAnimationFrame(momentumRafId)
        momentumRafId = null
      }
    }

    const modalOpen = (target: EventTarget | null) =>
      Boolean(document.querySelector('[aria-modal="true"]')) ||
      (target instanceof Element && Boolean(target.closest('[role="dialog"]')))

    // Returns true when this input was handled (and caller should preventDefault).
    // When crossing 50%, leftover movement is carried directly into window.scrollBy for a seamless handover.
    const consume = (delta: number, carryLockedTouch = false): boolean => {
      if (window.scrollY > 0) {
        if (carryLockedTouch && touchLocked) {
          if (delta < 0 && window.scrollY + delta <= 0) {
            window.scrollTo(0, 0)
            lastOffTop = Date.now()
            setProgress(PIN_PROGRESS)
          } else {
            window.scrollBy(0, delta)
            syncFromScroll()
          }
          return true
        }
        return false
      }

      if (delta > 0) {
        if (progress < PIN_PROGRESS) {
          const remaining = (PIN_PROGRESS - progress) * TOTAL_DISTANCE
          if (delta <= remaining) {
            setProgress(progress + delta / TOTAL_DISTANCE)
          } else {
            const leftover = delta - remaining
            forceFinished = false
            setProgress(PIN_PROGRESS)
            window.scrollBy(0, leftover)
            syncFromScroll()
          }
          return true
        }
        if (carryLockedTouch && touchLocked) {
          forceFinished = false
          window.scrollBy(0, delta)
          syncFromScroll()
          return true
        }
        return false
      }

      // Only reverse the pinned half after resting at the top for 400ms
      if (delta < 0 && progress > 0 && Date.now() - lastOffTop > TOP_REST_MS) {
        forceFinished = false
        setProgress(Math.min(progress, PIN_PROGRESS) + delta / TOTAL_DISTANCE)
        return true
      }
      return false
    }

    const startTouchMomentum = (initialVelocity: number) => {
      stopMomentum()
      let v = Math.max(-4.5, Math.min(4.5, initialVelocity))
      let prevNow = performance.now()

      const step = (now: number) => {
        const dt = Math.min(32, Math.max(1, now - prevNow))
        prevNow = now
        const dist = v * dt

        if (v > 0) {
          if (window.scrollY <= 0 && progress < PIN_PROGRESS) {
            const remaining = (PIN_PROGRESS - progress) * TOTAL_DISTANCE
            if (dist <= remaining) {
              setProgress(progress + dist / TOTAL_DISTANCE)
            } else {
              const leftover = dist - remaining
              forceFinished = false
              setProgress(PIN_PROGRESS)
              window.scrollBy(0, leftover)
              syncFromScroll()
            }
          } else {
            const before = window.scrollY
            window.scrollBy(0, dist)
            syncFromScroll()
            if (window.scrollY === before && before > 0) {
              momentumRafId = null
              return
            }
          }
        } else if (window.scrollY > 0) {
          if (window.scrollY + dist <= 0) {
            window.scrollTo(0, 0)
            lastOffTop = Date.now()
            setProgress(PIN_PROGRESS)
            momentumRafId = null
            return
          }
          window.scrollBy(0, dist)
          syncFromScroll()
        } else if (progress > 0 && Date.now() - lastOffTop > TOP_REST_MS) {
          forceFinished = false
          setProgress(Math.min(progress, PIN_PROGRESS) + dist / TOTAL_DISTANCE)
          if (progress <= 0) {
            momentumRafId = null
            return
          }
        } else {
          momentumRafId = null
          return
        }

        v *= Math.exp(-0.0032 * dt)
        if (Math.abs(v) < 0.04) {
          momentumRafId = null
          return
        }
        momentumRafId = window.requestAnimationFrame(step)
      }

      momentumRafId = window.requestAnimationFrame(step)
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || modalOpen(e.target)) return
      stopMomentum()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1
      if (consume(e.deltaY * unit)) e.preventDefault()
    }

    const onTouchStart = (e: TouchEvent) => {
      stopMomentum()
      if (e.touches.length === 1) {
        touchX = e.touches[0].clientX
        touchY = e.touches[0].clientY
        touchTime = performance.now()
        touchVelocity = 0
        touchLocked = false
      } else {
        touchX = null
        touchY = null
        touchVelocity = 0
        touchLocked = false
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null || e.touches.length !== 1 || modalOpen(e.target)) return
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY
      const dx = touchX !== null ? touchX - x : 0
      const delta = touchY - y
      touchX = x
      touchY = y

      // Do not hijack predominantly horizontal gestures before locking
      if (!touchLocked && Math.abs(dx) > Math.abs(delta)) return

      const now = performance.now()
      const dt = now - touchTime
      if (dt > 0) {
        const instantV = delta / dt
        touchVelocity = touchVelocity === 0 ? instantV : touchVelocity * 0.4 + instantV * 0.6
      }
      touchTime = now

      if (consume(delta, true)) {
        touchLocked = true
        if (e.cancelable) e.preventDefault()
      }
    }
    const onTouchEnd = () => {
      const shouldCoast =
        touchLocked && performance.now() - touchTime < 80 && Math.abs(touchVelocity) > 0.15
      const releaseV = touchVelocity
      touchX = null
      touchY = null
      touchVelocity = 0
      touchLocked = false
      if (shouldCoast) startTouchMomentum(releaseV)
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
      stopMomentum()

      if (e.key === 'End' && window.scrollY <= 0 && progress < PIN_PROGRESS) {
        forceFinished = true
        setProgress(1)
        return
      }

      let delta = 0
      if (e.key === 'ArrowDown') delta = 80
      else if (e.key === 'ArrowUp') delta = -80
      else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) delta = TOTAL_DISTANCE * 0.6
      else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) delta = -TOTAL_DISTANCE * 0.6
      else if (e.key === 'Home') delta = -TOTAL_DISTANCE
      if (delta !== 0 && consume(delta)) e.preventDefault()
    }

    // Drives 50..100% from real scrollY, reverses 100..50% when scrolling back up,
    // and finishes immediately on anchor jumps, Rosters button, or scrollbar drags from top.
    const onScroll = () => {
      const y = window.scrollY
      if (y > 0) {
        lastOffTop = Date.now()
        if (progress < PIN_PROGRESS) {
          forceFinished = true
          setProgress(1)
          return
        }
        if (forceFinished) {
          if (y >= SCROLL_DISTANCE) forceFinished = false
          if (progress < 1) setProgress(1)
          return
        }
        setProgress(progressFromScrollY(y))
      } else {
        forceFinished = false
        if (progress > PIN_PROGRESS) {
          setProgress(PIN_PROGRESS)
        }
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
      stopMomentum()
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
    <div ref={stageRef} className="hero-word-stage">
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
