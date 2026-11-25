import React, { useEffect, useRef } from 'react'

export const HomeBackdrop: React.FC = () => {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = layerRef.current
    if (!el || typeof window === 'undefined') return

    const mq =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

    let rafId: number | null = null
    let listening = false

    const updateParallax = () => {
      rafId = null
      if (!layerRef.current) return
      const y = Math.max(window.scrollY * 0.12, 0)
      layerRef.current.style.transform = `translate3d(-50%, ${y.toFixed(1)}px, 0)`
    }

    const onScroll = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateParallax)
      }
    }

    const syncPreference = () => {
      if (mq?.matches) {
        if (listening) {
          window.removeEventListener('scroll', onScroll)
          listening = false
        }
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId)
          rafId = null
        }
        if (layerRef.current) {
          layerRef.current.style.transform = 'translate3d(-50%, 0, 0)'
        }
      } else if (!listening) {
        updateParallax()
        window.addEventListener('scroll', onScroll, { passive: true })
        listening = true
      }
    }

    syncPreference()
    if (mq) {
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', syncPreference)
      } else {
        mq.addListener(syncPreference)
      }
    }

    return () => {
      if (listening) {
        window.removeEventListener('scroll', onScroll)
      }
      if (mq) {
        if (typeof mq.removeEventListener === 'function') {
          mq.removeEventListener('change', syncPreference)
        } else {
          mq.removeListener(syncPreference)
        }
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [])

  return (
    <>
      {/* Tactile paper grain (about 3% opacity) */}
      <div aria-hidden="true" className="home-paper-grain" />

      {/* Architectural stadium blueprint with gentle scroll parallax */}
      <div
        aria-hidden="true"
        className="home-arch-backdrop fixed inset-0 pointer-events-none select-none overflow-hidden z-0"
      >
        <div
          ref={layerRef}
          className="absolute left-1/2 will-change-transform"
          style={{
            top: '-10%',
            width: 'min(1500px, 140vw)',
            transform: 'translate3d(-50%, 0, 0)'
          }}
        >
          <svg viewBox="0 0 1440 1200" fill="none" className="w-full h-auto block">
            {/* Concentric stadium pitch arcs */}
            <circle cx="720" cy="460" r="320" stroke="var(--blueprint-stroke)" strokeWidth="1" />
            <circle
              cx="720"
              cy="460"
              r="480"
              stroke="var(--blueprint-stroke)"
              strokeWidth="1"
              strokeDasharray="6 10"
            />
            <circle cx="720" cy="460" r="650" stroke="var(--blueprint-stroke)" strokeWidth="1" />
            {/* Diagonal court axes */}
            <line x1="0" y1="120" x2="1440" y2="960" stroke="var(--blueprint-stroke)" strokeWidth="1" />
            <line x1="1440" y1="80" x2="0" y2="920" stroke="var(--blueprint-stroke)" strokeWidth="1" />
            {/* Vertical centre meridian */}
            <line
              x1="720"
              y1="0"
              x2="720"
              y2="1200"
              stroke="var(--blueprint-stroke)"
              strokeWidth="1"
              strokeDasharray="4 12"
            />
            {/* Lower baseline and key geometry */}
            <rect
              x="380"
              y="780"
              width="680"
              height="320"
              stroke="var(--blueprint-stroke)"
              strokeWidth="1"
            />
          </svg>
        </div>
      </div>
    </>
  )
}
