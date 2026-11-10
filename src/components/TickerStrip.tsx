import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

interface TickerStripProps {
  items?: string[]
}

export const TickerStrip: React.FC<TickerStripProps> = ({ items }) => {
  const shouldReduceMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const singleCycleRef = useRef<HTMLDivElement>(null)
  const group1Ref = useRef<HTMLDivElement>(null)

  const [containerWidth, setContainerWidth] = useState<number>(0)
  const [baseCycleWidth, setBaseCycleWidth] = useState<number>(0)
  const [groupWidth, setGroupWidth] = useState<number>(0)

  // Requirement C3: If fetch succeeds with zero items or no items provided, hide the strip completely
  if (!items || items.length === 0) {
    return null
  }

  // Measure container and cycle widths with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return

    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth)
      }
      if (singleCycleRef.current) {
        setBaseCycleWidth(singleCycleRef.current.offsetWidth)
      }
      if (group1Ref.current) {
        setGroupWidth(group1Ref.current.offsetWidth)
      }
    }

    updateDimensions()

    const observer = new ResizeObserver(() => {
      updateDimensions()
    })

    if (containerRef.current) observer.observe(containerRef.current)
    if (singleCycleRef.current) observer.observe(singleCycleRef.current)
    if (group1Ref.current) observer.observe(group1Ref.current)

    window.addEventListener('resize', updateDimensions)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateDimensions)
    }
  }, [items])

  // Requirement A2: Repeat items until one group is at least 1.5x container width
  const repeatCount = useMemo(() => {
    if (containerWidth <= 0 || baseCycleWidth <= 0) {
      return 2
    }
    const needed = (containerWidth * 1.5) / baseCycleWidth
    return Math.max(1, Math.ceil(needed))
  }, [containerWidth, baseCycleWidth])

  // Flattened items for one group
  const repeatedItems = useMemo(() => {
    const list: string[] = []
    for (let r = 0; r < repeatCount; r++) {
      for (const item of items) {
        list.push(item)
      }
    }
    return list
  }, [items, repeatCount])

  // Requirement A3: Speed is constant at ~60 px per second (groupWidth / 60)
  const animationDuration = useMemo(() => {
    const effectiveWidth =
      groupWidth > 0
        ? groupWidth
        : baseCycleWidth > 0
        ? baseCycleWidth * repeatCount
        : 1200
    const duration = effectiveWidth / 60
    return Math.max(6, duration)
  }, [groupWidth, baseCycleWidth, repeatCount])

  // Render a copy group with " / " separator after EVERY item, including the last (Requirement A1)
  const renderItemGroup = (isDuplicate = false) => (
    <div
      ref={!isDuplicate ? group1Ref : undefined}
      aria-hidden={isDuplicate ? 'true' : undefined}
      className="flex shrink-0 items-center whitespace-nowrap font-dot text-[16px] md:text-[18.5px] leading-normal tracking-[0.16em] text-[#CBD1CB]"
    >
      {repeatedItems.map((text, idx) => (
        <span key={`${text}-${idx}`} className="inline-flex items-center">
          <span className="break-all">{text}</span>
          <span
            className="mx-4 md:mx-6 text-[#395F3D] select-none"
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
      className="w-full bg-[#111411] border-y border-[#395F3D]/30 py-3.5 overflow-hidden select-none relative"
    >
      {/* Hidden single cycle element to measure base item cycle width */}
      <div
        ref={singleCycleRef}
        aria-hidden="true"
        className="absolute left-0 top-0 invisible pointer-events-none flex items-center whitespace-nowrap font-dot text-[16px] md:text-[18.5px] leading-normal tracking-[0.16em]"
      >
        {items.map((text, idx) => (
          <span key={`measure-${text}-${idx}`} className="inline-flex items-center">
            <span className="break-all">{text}</span>
            <span className="mx-4 md:mx-6 select-none">/</span>
          </span>
        ))}
      </div>

      {/* Render track */}
      {shouldReduceMotion ? (
        // Prefers reduced motion: static single group without animation (Requirement A5)
        <div className="flex justify-center overflow-x-auto py-0.5">
          {renderItemGroup(false)}
        </div>
      ) : (
        // Requirement A2 & A5: 2 groups animated 0 to -50% translateX with pause-on-hover
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
