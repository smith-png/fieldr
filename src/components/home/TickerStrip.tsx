import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_TICKER_SPEED,
  FALLBACK_CAROUSEL_TEXTS,
  getCarouselItems,
  getTickerSpeedMultiplier,
  getTickerSpeedSetting,
  normalizeTickerSpeed,
  readCachedPublicHome,
  readCachedPublicTicker,
  removeCachedPublicTicker,
  sanitizeTickerTexts,
  writeCachedPublicTicker
} from '../../lib/data/site'
import { hasDataChanged, publicCache } from '../../lib/publicCache'

interface TickerStripProps {
  items?: string[] | null
  speed?: number | null
  disableSelfFetch?: boolean
}

// Track across the page lifecycle so the entrance plays at most once per page load
let hasPlayedTickerEntrance = false

interface TickerItemTextProps {
  text: string
  reducedMotion: boolean
}

const TickerItemText: React.FC<TickerItemTextProps> = ({ text, reducedMotion }) => {
  const [displayText, setDisplayText] = useState(text)
  const [prevText, setPrevText] = useState<string | null>(null)
  const [fadeVersion, setFadeVersion] = useState(0)

  useEffect(() => {
    if (text === displayText) return
    setPrevText(displayText)
    setDisplayText(text)
    setFadeVersion((v) => v + 1)
    const timer = window.setTimeout(() => {
      setPrevText(null)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [text, displayText])

  return (
    <span className="relative inline-grid items-center">
      {prevText !== null && (
        <span
          key={`prev-${fadeVersion}`}
          aria-hidden="true"
          className="col-start-1 row-start-1 break-all pointer-events-none select-none ticker-crossfade-out"
        >
          {prevText}
        </span>
      )}
      <span
        key={`curr-${fadeVersion}`}
        className={`col-start-1 row-start-1 break-all ${
          fadeVersion > 0
            ? reducedMotion
              ? 'ticker-crossfade-in-reduced'
              : 'ticker-crossfade-in'
            : ''
        }`}
      >
        {displayText}
      </span>
    </span>
  )
}

export const TickerStrip: React.FC<TickerStripProps> = ({
  items,
  speed,
  disableSelfFetch = false
}) => {
  const [shouldReduceMotion, setShouldReduceMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setShouldReduceMotion(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const containerRef = useRef<HTMLDivElement>(null)
  const singleCycleRef = useRef<HTMLDivElement>(null)

  // Track previous measured values to prevent unnecessary setState inside ResizeObserver
  const prevDimensionsRef = useRef({
    containerWidth: 0,
    baseCycleWidth: 0
  })

  const [containerWidth, setContainerWidth] = useState<number>(0)
  const [baseCycleWidth, setBaseCycleWidth] = useState<number>(0)
  const lockedDurationRef = useRef<number>(0)

  const initialCache = useMemo(() => {
    const homeCache = readCachedPublicHome()
    const tickerCache = readCachedPublicTicker()
    return {
      items:
        homeCache && homeCache.tickerItems.length > 0
          ? homeCache.tickerItems
          : tickerCache.items,
      tickerSpeed:
        homeCache !== null ? homeCache.tickerSpeed : tickerCache.tickerSpeed
    }
  }, [])

  // Initialize speed once at load from prop, cached data, or loaded siteSettings (default 5)
  const [resolvedSpeed, setResolvedSpeed] = useState<number>(() => {
    if (speed !== undefined && speed !== null) {
      return normalizeTickerSpeed(speed)
    }
    if (initialCache.tickerSpeed !== null) {
      return initialCache.tickerSpeed
    }
    if (
      publicCache.siteSettings.loaded &&
      publicCache.siteSettings.value &&
      publicCache.siteSettings.value.ticker_speed !== undefined
    ) {
      return normalizeTickerSpeed(publicCache.siteSettings.value.ticker_speed)
    }
    return DEFAULT_TICKER_SPEED
  })

  // Initialize synchronously from prop or localStorage cache (or verified loaded memory cache).
  // Never initialize with FALLBACK_CAROUSEL_TEXTS while real data is still loading.
  const [resolvedItems, setResolvedItems] = useState<string[] | null>(() => {
    const propClean = sanitizeTickerTexts(items)
    if (
      propClean.length > 0 &&
      hasDataChanged(propClean, FALLBACK_CAROUSEL_TEXTS)
    ) {
      if (!publicCache.carouselItems.loaded) {
        publicCache.carouselItems = { loaded: true, value: propClean }
      }
      return propClean
    }
    if (initialCache.items && initialCache.items.length > 0) {
      if (!publicCache.carouselItems.loaded) {
        publicCache.carouselItems = { loaded: true, value: initialCache.items }
      }
      return initialCache.items
    }
    if (publicCache.carouselItems.loaded && publicCache.carouselItems.value.length > 0) {
      return publicCache.carouselItems.value
    }
    return null
  })

  const resolvedItemsRef = useRef<string[] | null>(resolvedItems)
  resolvedItemsRef.current = resolvedItems

  const pendingFreshItemsRef = useRef<string[] | null>(null)
  const initialFetchDoneRef = useRef<boolean>(disableSelfFetch)
  const hasRealOrCachedDataRef = useRef<boolean>(Boolean(resolvedItems && resolvedItems.length > 0))
  const hasLockedSpeedRef = useRef<boolean>(Boolean(resolvedItems && resolvedItems.length > 0))

  const hasContent = Boolean(resolvedItems && resolvedItems.length > 0)

  const [playEntrance] = useState<boolean>(() => !hasPlayedTickerEntrance)
  const [entranceDone, setEntranceDone] = useState<boolean>(
    () => hasPlayedTickerEntrance
  )

  const entranceDoneRef = useRef<boolean>(entranceDone)
  entranceDoneRef.current = entranceDone

  const applyIncomingItems = (nextItems: string[]) => {
    const current = resolvedItemsRef.current
    if (!current) {
      resolvedItemsRef.current = nextItems
      setResolvedItems(nextItems)
      return
    }
    if (!hasDataChanged(current, nextItems)) {
      return
    }
    // If entrance is currently playing with cached items, wait until entrance finishes
    // so content never swaps mid-entrance
    if (!entranceDoneRef.current) {
      pendingFreshItemsRef.current = nextItems
      return
    }
    resolvedItemsRef.current = nextItems
    setResolvedItems(nextItems)
  }

  // Start ticker and speed requests immediately on mount in parallel only when not managed by HomePage
  useEffect(() => {
    if (disableSelfFetch) return

    let mounted = true

    Promise.all([
      getCarouselItems(true),
      getTickerSpeedSetting()
    ])
      .then(([res, fetchedSpeed]) => {
        if (!mounted) return
        initialFetchDoneRef.current = true

        // Apply fetched speed before ticker starts moving if no cached items were present at load
        if (fetchedSpeed !== null && !hasLockedSpeedRef.current) {
          hasLockedSpeedRef.current = true
          setResolvedSpeed(fetchedSpeed)
        }

        const clean = sanitizeTickerTexts(res)

        if (clean.length > 0) {
          hasRealOrCachedDataRef.current = true
          hasLockedSpeedRef.current = true
          writeCachedPublicTicker(clean, fetchedSpeed ?? undefined)
          publicCache.carouselItems = { loaded: true, value: clean }
          applyIncomingItems(clean)
        } else {
          // Fetch finished and returned no ticker content -> clear stale cache and use default text
          hasRealOrCachedDataRef.current = false
          hasLockedSpeedRef.current = true
          removeCachedPublicTicker(fetchedSpeed ?? undefined)
          publicCache.carouselItems = { loaded: true, value: FALLBACK_CAROUSEL_TEXTS }
          applyIncomingItems(FALLBACK_CAROUSEL_TEXTS)
        }
      })
      .catch(() => {
        if (!mounted) return
        initialFetchDoneRef.current = true
        // Use built-in default text only if fetch failed and there is no cached copy
        if (!resolvedItemsRef.current || resolvedItemsRef.current.length === 0) {
          hasLockedSpeedRef.current = true
          publicCache.carouselItems = { loaded: true, value: FALLBACK_CAROUSEL_TEXTS }
          applyIncomingItems(FALLBACK_CAROUSEL_TEXTS)
        }
      })

    return () => {
      mounted = false
    }
  }, [disableSelfFetch])

  // Apply speed prop from HomePage before ticker starts moving if no cached items were present at load
  useEffect(() => {
    if (speed === undefined || speed === null) return
    if (!hasLockedSpeedRef.current) {
      hasLockedSpeedRef.current = true
      setResolvedSpeed(normalizeTickerSpeed(speed))
    }
  }, [speed])

  // Sync external items prop from HomePage
  useEffect(() => {
    if (!disableSelfFetch && (!initialFetchDoneRef.current || !publicCache.carouselItems.loaded)) {
      return
    }
    if (items === null || items === undefined) return
    const clean = sanitizeTickerTexts(items)
    if (clean.length === 0) return
    const isDefaultFallback = !hasDataChanged(clean, FALLBACK_CAROUSEL_TEXTS)
    if (isDefaultFallback && hasRealOrCachedDataRef.current) {
      return
    }
    hasLockedSpeedRef.current = true
    if (!isDefaultFallback) {
      hasRealOrCachedDataRef.current = true
    }
    applyIncomingItems(clean)
  }, [items, disableSelfFetch])

  // Flush any background refetch update once the initial entrance finishes
  useEffect(() => {
    if (!entranceDone || !pendingFreshItemsRef.current) return
    const next = pendingFreshItemsRef.current
    pendingFreshItemsRef.current = null
    if (hasDataChanged(resolvedItemsRef.current, next)) {
      resolvedItemsRef.current = next
      setResolvedItems(next)
    }
  }, [entranceDone])

  const safeItems = useMemo(() => {
    return resolvedItems && resolvedItems.length > 0 ? resolvedItems : []
  }, [resolvedItems])

  // Measure dimensions before paint when content becomes available
  useLayoutEffect(() => {
    if (!hasContent || !containerRef.current || !singleCycleRef.current) return

    const updateDimensions = () => {
      if (!containerRef.current || !singleCycleRef.current) return
      const curContainer = Math.round(containerRef.current.offsetWidth || 0)
      const curBase = Math.round(singleCycleRef.current.offsetWidth || 0)

      const prev = prevDimensionsRef.current
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

    observer.observe(containerRef.current)
    observer.observe(singleCycleRef.current)

    window.addEventListener('resize', updateDimensions)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateDimensions)
    }
  }, [hasContent, safeItems])

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
    if (!hasContent) return []
    const list: string[] = []
    for (let r = 0; r < repeatCount; r++) {
      for (const item of safeItems) {
        list.push(item)
      }
    }
    return list
  }, [hasContent, safeItems, repeatCount])

  const repeatedCountRef = useRef<number>(0)
  repeatedCountRef.current = Math.max(safeItems.length * 2, repeatedItems.length)

  useEffect(() => {
    if (!hasContent || entranceDone) return
    hasPlayedTickerEntrance = true

    const itemCount = repeatedCountRef.current
    const maxStaggerMs = shouldReduceMotion
      ? 0
      : Math.min(500, Math.max(0, (itemCount - 1) * 60))
    const totalEntranceMs = shouldReduceMotion
      ? 350
      : Math.max(700, maxStaggerMs + 380)

    const timer = window.setTimeout(() => {
      setEntranceDone(true)
    }, totalEntranceMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [hasContent, entranceDone, shouldReduceMotion])

  // Do not loop if width is invalid or prefers-reduced-motion is on
  const shouldLoop = !shouldReduceMotion && !isWidthInvalid && hasContent

  const speedMultiplier = useMemo(
    () => getTickerSpeedMultiplier(resolvedSpeed),
    [resolvedSpeed]
  )

  const computedDuration = useMemo(() => {
    if (!shouldLoop || isWidthInvalid) return 0
    const groupWidth = baseCycleWidth * repeatCount
    const baseDuration = Math.max(6, groupWidth / 60)
    return baseDuration / speedMultiplier
  }, [shouldLoop, isWidthInvalid, baseCycleWidth, repeatCount, speedMultiplier])

  // Lock marquee duration once scrolling starts so later text or speed updates do not jump the scroll phase
  if (computedDuration > 0 && lockedDurationRef.current === 0) {
    lockedDurationRef.current = computedDuration
  }
  const animationDuration = lockedDurationRef.current || computedDuration

  const isEntering = hasContent && playEntrance && !entranceDone

  const renderItemGroup = (isDuplicate = false) => (
    <div
      aria-hidden={isDuplicate ? 'true' : undefined}
      className="flex shrink-0 items-center whitespace-nowrap font-dot text-[16px] md:text-[18.5px] leading-normal tracking-[0.16em] text-text"
    >
      {repeatedItems.map((text, idx) => {
        const staggerDelayMs = Math.min(500, idx * 60)
        const animateItemEntrance = isEntering && !shouldReduceMotion && !isDuplicate

        return (
          <span
            key={`slot-${idx}`}
            className={`inline-flex items-center ${
              animateItemEntrance ? 'ticker-item-enter' : ''
            }`}
            style={
              animateItemEntrance
                ? { animationDelay: `${staggerDelayMs}ms` }
                : undefined
            }
          >
            <TickerItemText text={text} reducedMotion={shouldReduceMotion} />
            <span
              className="mx-4 md:mx-6 text-accent-bright/60 select-none"
              aria-hidden="true"
            >
              /
            </span>
          </span>
        )
      })}
    </div>
  )

  return (
    <div className="w-full px-2 py-6 md:py-8">
      <div
        ref={containerRef}
        role="region"
        aria-label="Live season statistics ticker"
        className="w-full ticker-strip-surface rounded-2xl py-3.5 overflow-hidden select-none relative"
      >
      <style>{`
        @keyframes tickerWipeReveal {
          0% {
            clip-path: inset(0 100% 0 0);
          }
          100% {
            clip-path: inset(0 0 0 0);
          }
        }

        @keyframes tickerItemRiseIn {
          0% {
            opacity: 0;
            transform: translate3d(0, 6px, 0);
          }
          100% {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }

        @keyframes tickerSimpleFadeIn {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }

        @keyframes tickerCrossfadeOut {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }

        .ticker-wipe-enter {
          will-change: clip-path;
          animation: tickerWipeReveal 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .ticker-fade-enter-reduced {
          will-change: opacity;
          animation: tickerSimpleFadeIn 350ms ease-out both;
        }

        .ticker-item-enter {
          will-change: transform, opacity;
          animation: tickerItemRiseIn 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .ticker-crossfade-in,
        .ticker-crossfade-in-reduced {
          will-change: opacity;
          animation: tickerSimpleFadeIn 250ms ease-out both;
        }

        .ticker-crossfade-out {
          will-change: opacity;
          animation: tickerCrossfadeOut 250ms ease-out both;
        }

        @media (prefers-reduced-motion: reduce) {
          .ticker-wipe-enter {
            clip-path: none !important;
            animation: tickerSimpleFadeIn 350ms ease-out both !important;
          }
          .ticker-item-enter {
            transform: none !important;
            animation: none !important;
          }
        }
      `}</style>

      {/* Hidden single cycle element to measure base cycle width */}
      <div
        ref={singleCycleRef}
        aria-hidden="true"
        className="absolute left-0 top-0 invisible pointer-events-none flex items-center whitespace-nowrap font-dot text-[16px] md:text-[18.5px] leading-normal tracking-[0.16em]"
      >
        {safeItems.map((text, idx) => (
          <span key={`measure-${idx}`} className="inline-flex items-center">
            <span className="break-all">{text}</span>
            <span className="mx-4 md:mx-6 select-none">/</span>
          </span>
        ))}
      </div>

      {/* Render track when content is known, or preserve exact strip height while empty */}
      {!hasContent ? (
        <div
          aria-hidden="true"
          className="flex items-center whitespace-nowrap font-dot text-[16px] md:text-[18.5px] leading-normal tracking-[0.16em] invisible pointer-events-none"
        >
          <span>&nbsp;</span>
        </div>
      ) : (
        <div className="ticker-strip-mask">
          <div
            className={
              isEntering
                ? shouldReduceMotion
                  ? 'ticker-fade-enter-reduced'
                  : 'ticker-wipe-enter'
                : undefined
            }
          >
            {shouldReduceMotion ? (
              <div className="flex justify-center overflow-x-hidden py-0.5">
                {renderItemGroup(false)}
              </div>
            ) : (
              <div
                className={`flex ${
                  shouldLoop ? 'animate-ticker ticker-strip-track' : ''
                }`}
                style={
                  shouldLoop
                    ? {
                        animationDuration: `${animationDuration}s`,
                        animationPlayState: entranceDone ? 'running' : 'paused'
                      }
                    : undefined
                }
              >
                {renderItemGroup(false)}
                {renderItemGroup(true)}
              </div>
            )}
          </div>
        </div>
      )}

      </div>
    </div>
  )
}


