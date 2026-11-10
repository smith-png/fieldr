import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { FALLBACK_CAROUSEL_TEXTS } from '../../lib/data'

interface TickerStripProps {
  items?: string[] | null
}

export const TickerStrip: React.FC<TickerStripProps> = ({ items }) => {
  const shouldReduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const singleCycleRef = useRef<HTMLDivElement>(null)

  // Track previous measured values to prevent unnecessary setState inside ResizeObserver
  const prevDimensionsRef = useRef({
    containerWidth: 0,
    baseCycleWidth: 0
  })

  const [containerWidth, setContainerWidth] = useState<number>(0)
  const [baseCycleWidth, setBaseCycleWidth] = useState<number>(0)

  // Treat a null, undefined or non-array result as "use fallback items"
  const safeItems = useMemo(() => {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return FALLBACK_CAROUSEL_TEXTS
    }
    const clean = items
      .filter((i) => typeof i === 'string' && i.trim().length > 0)
      .map((i) => i.trim())
    return clean.length > 0 ? clean : FALLBACK_CAROUSEL_TEXTS
  }, [items])

  // ResizeObserver with change detection and proper cleanup
  useEffect(() => {
    if (!containerRef.current || !singleCycleRef.current) return

    const updateDimensions = () => {
      if (!containerRef.current || !singleCycleRef.current) return
      const curContainer = Math.round(containerRef.current.offsetWidth || 0)
      const curBase = Math.round(singleCycleRef.current.offsetWidth || 0)

      const prev = prevDimensionsRef.current
      // Never set state inside ResizeObserver unless computed value actually changed (>= 2px)
      if (Math.abs(curContainer - prev.containerWidth) >= 2) {
        prev.containerWidth = curContainer
        setContainerWidth(curContainer)
      }
      if (Math.abs(curBase - prev.baseCycleWidth) >= 2) {
        prev.baseCycleWidth = curBase
        setBaseCycleWidth(curBase)
      }
    }

    updateDimensions()

    const observer = new ResizeObserver(() => {
      updateDimensions()
    })

    if (containerRef.current) observer.observe(containerRef.current)
    if (singleCycleRef.current) observer.observe(singleCycleRef.current)

    window.addEventListener('resize', updateDimensions)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateDimensions)
    }
  }, [safeItems])

  // Guard: If measured width is 0, undefined or NaN, render items twice and do not loop
  const isWidthInvalid =
    !baseCycleWidth ||
    isNaN(baseCycleWidth) ||
    baseCycleWidth <= 0 ||
    !containerWidth ||
    isNaN(containerWidth) ||
    containerWidth <= 0

  // Cap number of repeats at 12
  const repeatCount = useMemo(() => {
    if (isWidthInvalid) {
      return 2
    }
    const needed = Math.ceil((containerWidth * 1.5) / baseCycleWidth)
    if (isNaN(needed) || needed < 1) return 2
    return Math.min(12, needed)
  }, [containerWidth, baseCycleWidth, isWidthInvalid])

  const repeatedItems = useMemo(() => {
    const list: string[] = []
    for (let r = 0; r < repeatCount; r++) {
      for (const item of safeItems) {
        list.push(item)
      }
    }
    return list
  }, [safeItems, repeatCount])

  // Do not loop if width is invalid or prefers-reduced-motion is on
  const shouldLoop = !shouldReduceMotion && !isWidthInvalid

  const animationDuration = useMemo(() => {
    if (!shouldLoop || isWidthInvalid) return 0
    const groupWidth = baseCycleWidth * repeatCount
    const duration = groupWidth / 60
    return Math.max(6, duration)
  }, [shouldLoop, isWidthInvalid, baseCycleWidth, repeatCount])

  const renderItemGroup = (isDuplicate = false) => (
    <div
      aria-hidden={isDuplicate ? 'true' : undefined}
      className="flex shrink-0 items-center whitespace-nowrap font-dot text-[16px] md:text-[18.5px] leading-normal tracking-[0.16em] text-text"
    >
      {repeatedItems.map((text, idx) => (
        <span key={`${text}-${idx}`} className="inline-flex items-center">
          <span className="break-all">{text}</span>
          <span
            className="mx-4 md:mx-6 text-accent select-none"
            aria-hidden="true"
          >
            /
          </span>
        </span>
      ))}
    </div>
  )

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Live season statistics ticker"
      className="w-full bg-surface border-y border-border py-3.5 overflow-hidden select-none relative"
    >
      {/* Hidden single cycle element to measure base cycle width */}
      <div
        ref={singleCycleRef}
        aria-hidden="true"
        className="absolute left-0 top-0 invisible pointer-events-none flex items-center whitespace-nowrap font-dot text-[16px] md:text-[18.5px] leading-normal tracking-[0.16em]"
      >
        {safeItems.map((text, idx) => (
          <span key={`measure-${text}-${idx}`} className="inline-flex items-center">
            <span className="break-all">{text}</span>
            <span className="mx-4 md:mx-6 select-none">/</span>
          </span>
        ))}
      </div>

      {/* Render track */}
      {!shouldLoop ? (
        // When width invalid or reduced motion: render static without looping
        <div className="flex justify-center overflow-x-hidden py-0.5">
          {renderItemGroup(false)}
        </div>
      ) : (
        // Looping marquee: render 2 groups with translate3d animation
        <div
          className="flex will-change-transform animate-ticker"
          style={{
            animationDuration: `${animationDuration}s`
          }}
        >
          {renderItemGroup(false)}
          {renderItemGroup(true)}
        </div>
      )}
    </div>
  )
}
