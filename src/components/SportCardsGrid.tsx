import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from '@phosphor-icons/react'
import { useReducedMotion } from 'motion/react'
import {
  CricketIllustration,
  FutsalIllustration,
  VolleyballIllustration
} from './SportEquipmentSvgs'

interface SportCardsGridProps {
  playerCounts: {
    cricket: number
    futsal: number
    volleyball: number
  }
}

export const SportCardsGrid: React.FC<SportCardsGridProps> = ({ playerCounts }) => {
  const shouldReduceMotion = useReducedMotion()

  const sports = [
    {
      id: 'cricket',
      name: 'Cricket',
      path: '/rosters/cricket',
      count: playerCounts.cricket,
      description: 'Batters, pace & spin bowlers, all-rounders, and wicketkeepers.',
      Illustration: CricketIllustration
    },
    {
      id: 'futsal',
      name: 'Futsal',
      path: '/rosters/futsal',
      count: playerCounts.futsal,
      description: 'Goalkeepers, defensive anchors, dynamic playmakers, and forwards.',
      Illustration: FutsalIllustration
    },
    {
      id: 'volleyball',
      name: 'Volleyball',
      path: '/rosters/volleyball',
      count: playerCounts.volleyball,
      description: 'Setters, outside hitters, middle blockers, opposites, and liberos.',
      Illustration: VolleyballIllustration
    }
  ]

  return (
    <section className="w-full max-w-7xl mx-auto px-6 md:px-16 lg:px-24 py-16 md:py-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 pb-6 border-b border-white/10">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-2">
            TOURNAMENT SQUADS
          </span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl text-[#F0F2EE] tracking-tight">
            Explore rosters by sport
          </h2>
        </div>
        <p className="text-sm text-[#8E928C] max-w-md">
          Review scout profiles, academic batches, and playing roles across all active disciplines.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
        {sports.map((sport) => {
          const { Illustration } = sport
          return (
            <Link
              key={sport.id}
              to={sport.path}
              className="group relative flex flex-col justify-between bg-[#111411] border border-white/10 rounded-2xl p-7 hover:border-[#047554] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047554] overflow-hidden"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-4 z-10">
                <div>
                  <h3 className="font-syne font-bold text-2xl text-[#F0F2EE] group-hover:text-white transition-colors">
                    {sport.name}
                  </h3>
                  <div className="text-xs text-[#8E928C] mt-1 font-mono">
                    <span className="text-[#CBD1CB] font-semibold">{sport.count}</span>{' '}
                    {sport.count === 1 ? 'player' : 'players'} registered
                  </div>
                </div>
                <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[#8E928C] group-hover:text-white group-hover:border-[#047554] transition-colors shrink-0">
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
              <div className="pt-4 border-t border-white/5 flex items-center justify-between text-xs text-[#8E928C] z-10">
                <span className="truncate pr-2">{sport.description}</span>
                <span className="text-[#047554] font-medium shrink-0 group-hover:underline">
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
