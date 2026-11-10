import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import { SPORTS, type SportSlug } from '../../lib/sports'
import {
  CricketIllustration,
  FutsalIllustration,
  VolleyballIllustration
} from './SportEquipmentSvgs'

interface SportCardsGridProps {
  playerCounts: Record<SportSlug, number>
}

const sportIllustrations: Record<SportSlug, React.ComponentType<{ className?: string }>> = {
  cricket: CricketIllustration,
  futsal: FutsalIllustration,
  volleyball: VolleyballIllustration
}

const sportDescriptions: Record<SportSlug, string> = {
  cricket: 'Batters, pace & spin bowlers, all-rounders, and wicketkeepers.',
  futsal: 'Goalkeepers, defensive anchors, dynamic playmakers, and forwards.',
  volleyball: 'Setters, outside hitters, middle blockers, opposites, and liberos.'
}

export const SportCardsGrid: React.FC<SportCardsGridProps> = ({ playerCounts }) => {
  const shouldReduceMotion = useReducedMotion()

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
        <p className="text-sm text-muted max-w-md">
          Review scout profiles, academic batches, and playing roles across all active disciplines.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {SPORTS.map((sport) => {
          const slug = sport.slug as SportSlug
          const Illustration = sportIllustrations[slug]
          const count = playerCounts[slug] || 0
          const description = sportDescriptions[slug]

          return (
            <Link
              key={sport.slug}
              to={`/rosters/${sport.slug}`}
              className="group relative flex flex-col justify-between bg-surface border border-border rounded-2xl p-7 hover:border-accent-bright transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright overflow-hidden shadow-sm"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-4 z-10">
                <div>
                  <h3 className="font-syne font-bold text-2xl text-text group-hover:text-accent-bright transition-colors">
                    {sport.label}
                  </h3>
                  <div className="text-xs text-muted mt-1 font-mono">
                    <span className="text-text font-semibold">{count}</span>{' '}
                    {count === 1 ? 'player' : 'players'} registered
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted group-hover:text-text group-hover:border-accent-bright transition-colors shrink-0">
                  <ArrowUpRight size={18} weight="bold" />
                </div>
              </div>

              {/* Vector SVG Equipment Graphic */}
              <div className="my-8 h-44 flex items-center justify-center overflow-hidden">
                <div
                  className={`w-full h-full transition-transform duration-300 ease-out ${
                    shouldReduceMotion
                      ? ''
                      : '@media (hover: hover) group-hover:scale-105'
                  }`}
                  style={{ willChange: 'transform' }}
                >
                  <Illustration className="w-full h-full object-contain" />
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted z-10">
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
