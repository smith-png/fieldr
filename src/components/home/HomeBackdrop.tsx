import React, { useEffect, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

export const HomeBackdrop: React.FC = () => {
  const shouldReduceMotion = useReducedMotion()
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = layerRef.current
    if (!el) return

    if (shouldReduceMotion) {
      el.style.transform = 'translate3d(0, 0, 0)'
      return
    }

    let rafId: number | null = null

    const updateParallax = () => {
      rafId = null
      if (!layerRef.current) return
      const y = window.scrollY * 0.06
      layerRef.current.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`
    }

    const onScroll = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateParallax)
      }
    }

    updateParallax()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', onScroll)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [shouldReduceMotion])

  return (
    <div
      aria-hidden="true"
      className="home-arch-backdrop fixed inset-0 pointer-events-none select-none overflow-hidden z-0"
    >
      <div
        ref={layerRef}
        className="w-full h-[115%] -top-[7.5%] left-0 relative flex items-center justify-center will-change-transform"
      >
        <svg
          viewBox="0 0 1440 900"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          className="w-full h-full block text-text dark:text-white"
        >
          <defs>
            <radialGradient
              id="home-arch-sage-glow"
              cx="50%"
              cy="35%"
              r="55%"
            >
              <stop
                offset="0%"
                stopColor="var(--accent)"
                stopOpacity="0.06"
              />
              <stop
                offset="100%"
                stopColor="var(--accent)"
                stopOpacity="0"
              />
            </radialGradient>
          </defs>

          {/* Soft radial sage glow on full-size rect */}
          <rect
            x="0"
            y="0"
            width="1440"
            height="900"
            fill="url(#home-arch-sage-glow)"
          />

          {/* Thin 1px architectural lines */}
          <ellipse
            cx="380"
            cy="340"
            rx="410"
            ry="210"
            transform="rotate(-15 380 340)"
            stroke="currentColor"
            strokeOpacity="0.06"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          <ellipse
            cx="380"
            cy="340"
            rx="280"
            ry="135"
            transform="rotate(-15 380 340)"
            stroke="currentColor"
            strokeOpacity="0.035"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          <path
            d="M920 60L1410 190L1310 530L820 400Z"
            stroke="currentColor"
            strokeOpacity="0.05"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          <circle
            cx="1115"
            cy="295"
            r="95"
            stroke="var(--accent)"
            strokeOpacity="0.08"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          <line
            x1="0"
            y1="720"
            x2="1440"
            y2="610"
            stroke="currentColor"
            strokeOpacity="0.04"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    </div>
  )
}
