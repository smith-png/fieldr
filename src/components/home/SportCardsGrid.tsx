import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import { SPORTS, type SportSlug } from '../../lib/sports'
import { getSports } from '../../lib/data'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import type { Sport } from '../../types'

interface SportCardsGridProps {
  playerCounts: Record<SportSlug, number>
  sports?: Sport[]
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
    width: 2560,
    height: 2508
  },
  futsal: {
    src: '/images/rosters/futsal.jpg',
    alt: 'Football with a star pattern on a pitch with a goal in the background',
    objectPosition: '45% 55%',
    width: 2560,
    height: 1570
  },
  volleyball: {
    src: '/images/rosters/volleyball.jpg',
    alt: 'Volleyball being held and tossed by a player hand',
    objectPosition: '50% 55%',
    width: 2560,
    height: 2235
  }
}

export const SportCardsGrid: React.FC<SportCardsGridProps> = ({
  playerCounts,
  sports
}) => {
  const shouldReduceMotion = useReducedMotion()
  const [sportsData, setSportsData] = useState<Sport[]>(() => {
    if (sports && sports.length > 0) return sports
    if (publicCache.sports.loaded && publicCache.sports.value.length > 0) {
      return publicCache.sports.value
    }
    return []
  })
  const [loadedMap, setLoadedMap] = useState<Record<string, boolean>>({})
  const [errorMap, setErrorMap] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (sports !== undefined) {
      if (sports.length > 0) {
        setSportsData((prev) => (hasDataChanged(prev, sports) ? sports : prev))
      }
      return
    }

    if (publicCache.sports.loaded && publicCache.sports.value.length > 0) {
      setSportsData((prev) =>
        hasDataChanged(prev, publicCache.sports.value)
          ? publicCache.sports.value
          : prev
      )
      return
    }

    let mounted = true
    getSports()
      .then((res) => {
        if (!Array.isArray(res)) return
        publicCache.sports = { loaded: true, value: res }
        if (mounted) {
          setSportsData((prev) => (hasDataChanged(prev, res) ? res : prev))
        }
      })
      .catch((err) => {
        console.error(
          'Failed to load sports in SportCardsGrid:',
          err instanceof Error ? err.message : err,
          err
        )
      })
    return () => {
      mounted = false
    }
  }, [sports])

  const handleImageLoaded = (slug: SportSlug) => {
    setLoadedMap((prev) => (prev[slug] ? prev : { ...prev, [slug]: true }))
  }

  const handleImageError = (slug: SportSlug) => {
    setErrorMap((prev) => (prev[slug] ? prev : { ...prev, [slug]: true }))
  }

  return (
    <section className="w-full max-w-7xl mx-auto px-6 md:px-16 lg:px-24 py-16 md:py-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 pb-6 border-b border-border">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
            TOURNAMENT SQUADS
          </span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight">
            Explore rosters by sport
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {SPORTS.map((sport) => {
          const slug = sport.slug as SportSlug
          const photo = sportPhotos[slug]
          const isLoaded = Boolean(loadedMap[slug])
          const hasError = Boolean(errorMap[slug])
          const count = playerCounts[slug] || 0
          const dbSport = sportsData.find(
            (s) =>
              s.id.toLowerCase() === slug ||
              s.name.toLowerCase() === sport.label.toLowerCase()
          )
          const description =
            dbSport && dbSport.roles.length > 0 ? dbSport.roles.join(' · ') : sport.label

          return (
            <Link
              key={sport.slug}
              to={`/rosters/${sport.slug}`}
              className="group relative flex flex-col justify-between bg-[#0B0B0E] border border-border rounded-2xl p-7 hover:border-accent-bright transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright overflow-hidden shadow-sm"
            >
              {/* Full-bleed Photo Background & Dark Readability Gradient Overlay */}
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
                      imageRendering: 'pixelated',
                      transitionProperty: shouldReduceMotion ? 'none' : 'opacity, transform',
                      transitionDuration: shouldReduceMotion ? '0ms' : '300ms, 600ms',
                      transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)'
                    }}
                    className={`w-full h-full object-cover ${
                      isLoaded ? 'opacity-100' : 'opacity-0'
                    } ${
                      shouldReduceMotion
                        ? ''
                        : 'group-hover:scale-105 group-active:scale-105'
                    }`}
                  />
                )}
                {/* Dark gradient overlay: near-black at bottom fading to ~25% at top */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(to top, rgba(10, 10, 12, 0.94) 0%, rgba(10, 10, 12, 0.56) 52%, rgba(10, 10, 12, 0.25) 100%)'
                  }}
                />
              </div>

              {/* Card Header */}
              <div className="flex items-start justify-between gap-4 z-10">
                <div>
                  <h3 className="font-syne font-bold text-2xl text-[#F5F7F5] group-hover:text-accent-bright transition-colors">
                    {sport.label}
                  </h3>
                  <div className="text-xs text-[#B6C2B9] mt-1 font-mono">
                    <span className="text-[#F5F7F5] font-semibold">{count}</span>{' '}
                    {count === 1 ? 'player' : 'players'} registered
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-black/40 border border-white/15 flex items-center justify-center text-[#B6C2B9] group-hover:text-[#F5F7F5] group-hover:border-accent-bright transition-colors shrink-0">
                  <ArrowUpRight size={18} weight="bold" />
                </div>
              </div>

              {/* Reserved Card Height Spacer */}
              <div aria-hidden="true" className="my-8 h-44 pointer-events-none" />

              {/* Card Footer */}
              <div className="pt-4 border-t border-white/15 flex items-center justify-between text-xs text-[#B6C2B9] z-10">
                <span className="truncate pr-2">{description}</span>
                <span className="text-accent-bright font-medium shrink-0 group-hover:underline">
                  View roster
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

