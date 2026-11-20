import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from '@phosphor-icons/react'
import { SPORTS, type SportSlug } from '../../lib/sports'
import { prefetchRoute } from '../../lib/queryCache'
import type { Sport } from '../../types'

interface SportCardsGridProps {
  playerCounts: Record<SportSlug, number>
  sports?: Sport[]
  countsLoaded?: boolean
}

interface SportPhotoConfig {
  src: string
  alt: string
  objectPosition: string
  width: number
  height: number
}

const sportPhotos: Record<SportSlug, SportPhotoConfig> = {
  cricket: {
    src: '/images/rosters/cricket.jpg',
    alt: 'Close-up of a cricket ball with stitched seam resting on grass',
    objectPosition: '70% 70%',
    width: 900,
    height: 602
  },
  futsal: {
    src: '/images/rosters/futsal.jpg',
    alt: 'Football on a green grass pitch with a player boot beside it',
    objectPosition: '75% 45%',
    width: 900,
    height: 526
  },
  volleyball: {
    src: '/images/rosters/volleyball.jpg',
    alt: 'Volleyball players jumping at the net in silhouette against sunset sky',
    objectPosition: '50% 50%',
    width: 900,
    height: 519
  }
}

export const SportCardsGrid: React.FC<SportCardsGridProps> = ({
  playerCounts,
  countsLoaded = true
}) => {
  const [shouldReduceMotion, setShouldReduceMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  )
  const [loadedMap, setLoadedMap] = useState<Record<string, boolean>>({})
  const [errorMap, setErrorMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setShouldReduceMotion(mq.matches)
    onChange()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  const handleImageLoaded = (slug: SportSlug) => {
    setLoadedMap((prev) => (prev[slug] ? prev : { ...prev, [slug]: true }))
  }

  const handleImageError = (slug: SportSlug) => {
    setErrorMap((prev) => (prev[slug] ? prev : { ...prev, [slug]: true }))
  }

  return (
    <section
      id="rosters-section"
      className="w-full max-w-7xl mx-auto px-6 md:px-16 lg:px-24 py-16 md:py-24"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 pb-5 border-b border-border/60">
        <div>
          <span className="font-sans text-[11px] sm:text-xs font-medium uppercase tracking-[0.2em] text-accent block mb-2">
            TOURNAMENT SQUADS
          </span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight">
            Explore
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {SPORTS.map((sport, index) => {
          const slug = sport.slug as SportSlug
          const photo = sportPhotos[slug]
          const isLoaded = Boolean(loadedMap[slug])
          const hasError = Boolean(errorMap[slug])
          const count = playerCounts[slug] ?? 0
          const indexLabel = String(index + 1).padStart(2, '0')

          return (
            <Link
              key={sport.slug}
              to={`/rosters/${sport.slug}`}
              onMouseEnter={() => prefetchRoute(`/rosters/${sport.slug}`)}
              onFocus={() => prefetchRoute(`/rosters/${sport.slug}`)}
              onTouchStart={() => prefetchRoute(`/rosters/${sport.slug}`)}
              className="group relative flex flex-col justify-between bg-[#0a0a0c] border border-border rounded-2xl p-6 sm:p-7 hover:border-accent-bright transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright overflow-hidden"
            >
              {/* Full-bleed Photo Background & Dark Gradient Overlay */}
              <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                {!hasError && (
                  <img
                    ref={(node) => {
                      if (node && node.complete && node.naturalWidth > 0 && !loadedMap[slug]) {
                        handleImageLoaded(slug)
                      }
                    }}
                    src={photo.src}
                    alt={photo.alt}
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                    onLoad={() => handleImageLoaded(slug)}
                    onError={() => handleImageError(slug)}
                    style={{
                      objectPosition: photo.objectPosition,
                      transitionProperty: shouldReduceMotion ? 'none' : 'opacity, transform',
                      transitionDuration: shouldReduceMotion ? '0ms' : '300ms, 600ms',
                      transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)'
                    }}
                    className={`w-full h-full object-cover origin-center [image-rendering:pixelated] dark:[image-rendering:auto] dark:grayscale dark:contrast-150 dark:brightness-75 ${
                      isLoaded ? 'opacity-100' : 'opacity-0'
                    } ${
                      shouldReduceMotion
                        ? ''
                        : 'group-hover:scale-105 group-active:scale-105'
                    }`}
                  />
                )}
                <div
                  aria-hidden="true"
                  className="hidden dark:block absolute inset-0 mix-blend-overlay"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, rgba(255, 255, 255, 0.18) 0.5px, transparent 0.5px)',
                    backgroundSize: '3px 3px'
                  }}
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(10, 10, 12, 0.94) 0%, rgba(10, 10, 12, 0.56) 52%, rgba(10, 10, 12, 0.25) 100%)'
                  }}
                />
              </div>

              {/* Card Top Row: Monospace Index Chip & Round Icon Button */}
              <div className="flex items-center justify-between gap-4 z-10">
                <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-black/45 border border-white/15 font-mono text-xs font-medium text-zinc-200 tabular-nums">
                  {indexLabel}
                </span>
                <div className="w-9 h-9 rounded-full bg-black/45 border border-white/15 flex items-center justify-center text-zinc-200 group-hover:text-white group-hover:border-accent-bright transition-colors shrink-0">
                  <ArrowUpRight size={18} weight="bold" />
                </div>
              </div>

              {/* Reserved Card Height Spacer */}
              <div aria-hidden="true" className="my-8 h-48 sm:h-52 pointer-events-none" />

              {/* Card Bottom Row: Hairline with Syne Sport Name & Monospace Athlete Count */}
              <div className="pt-4 border-t border-white/15 flex items-baseline justify-between gap-4 z-10 min-h-[3rem]">
                <h3 className="font-syne font-bold text-2xl text-white group-hover:text-accent-bright transition-colors tracking-tight">
                  {sport.label}
                </h3>
                {countsLoaded && (
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="font-mono font-semibold text-sm text-white tabular-nums">
                      {count}
                    </span>
                    <span className="font-sans text-xs text-zinc-300">
                      athletes
                    </span>
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}



