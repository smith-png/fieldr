import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Coins, ShieldCheck, Television, Users } from '@phosphor-icons/react'
import { BrandMark } from '../components/BrandMark'
import { NavigationMenu } from '../components/NavigationMenu'
import { TickerStrip } from '../components/TickerStrip'
import { useAuth } from '../lib/AuthContext'
import { getPlayers, getSeasons, getSports, getTeams } from '../lib/data'
import type { Season, Sport, Team } from '../lib/types'

export const HomePage: React.FC = () => {
  const { user } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [sports, setSports] = useState<Sport[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [playerStats, setPlayerStats] = useState({ total: 0, available: 0, sold: 0 })
  const shouldReduceMotion = useReducedMotion()

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        const seasonsList = await getSeasons()
        const active = seasonsList.find((s) => s.is_active) || seasonsList[0] || null
        if (mounted) setActiveSeason(active)

        const sportsList = await getSports()
        if (mounted) setSports(sportsList)

        if (active) {
          const teamsList = await getTeams(active.id)
          const playersList = await getPlayers(active.id)
          if (mounted) {
            setTeams(teamsList)
            setPlayerStats({
              total: playersList.length,
              available: playersList.filter((p) => p.status === 'available').length,
              sold: playersList.filter((p) => p.status === 'sold').length
            })
          }
        }
      } catch {
        // demo data fallback
      }
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return
    const { innerWidth, innerHeight } = window
    const x = (e.clientX / innerWidth - 0.5) * 16
    const y = (e.clientY / innerHeight - 0.5) * 16
    setMousePos({ x, y })
  }

  const heroLines = ['DRAFT.', 'BID.', 'WIN.']

  return (
    <div
      onMouseMove={handleMouseMove}
      className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex flex-col justify-between selection:bg-[#047554] selection:text-white relative overflow-x-hidden"
    >
      {/* Top Left Menu Anchor */}
      <div className="absolute top-6 left-6 md:top-10 md:left-10 z-40">
        <BrandMark onClick={() => setIsMenuOpen(true)} />
      </div>

      {/* Fullscreen Circular Menu */}
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      {/* Main Hero Container */}
      <main className="flex-1 flex flex-col justify-center px-6 md:px-16 lg:px-24 pt-32 pb-16 max-w-7xl mx-auto w-full">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-3 text-xs md:text-sm font-medium tracking-widest text-[#8E928C] uppercase mb-4"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#047554]" />
          <span>Live player auctions for DRGMC</span>
          {activeSeason && (
            <>
              <span className="text-white/20">·</span>
              <span className="text-[#CBD1CB]">{activeSeason.name}</span>
            </>
          )}
        </motion.div>

        {/* 3-Line Massive Headline */}
        <motion.div
          style={
            !shouldReduceMotion
              ? {
                  transform: `translate3d(${mousePos.x}px, ${mousePos.y}px, 0)`
                }
              : undefined
          }
          className="flex flex-col gap-0 select-none my-2 transition-transform duration-200 ease-out"
        >
          {heroLines.map((line, index) => (
            <div key={line} className="overflow-hidden">
              <motion.h1
                initial={{ y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{
                  duration: 0.8,
                  delay: 0.1 + index * 0.12,
                  ease: [0.22, 1, 0.36, 1]
                }}
                className={`font-syne font-extrabold text-6xl sm:text-8xl md:text-9xl lg:text-[10.5rem] tracking-tighter leading-[0.88] ${
                  index === 1 ? 'text-[#CBD1CB]' : index === 2 ? 'text-white' : 'text-[#8E928C]'
                }`}
              >
                {line}
              </motion.h1>
            </div>
          ))}
        </motion.div>

        {/* Supporting Copy */}
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-base sm:text-lg md:text-xl text-[#8E928C] max-w-xl mt-6 leading-relaxed"
        >
          Teams, purses and players, run from one control room and shown live on the big screen.
        </motion.p>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-center gap-4 sm:gap-6 mt-10"
        >
          {user ? (
            <>
              {user.role === 'admin' && (
                <Link
                  to="/admin"
                  className="px-8 py-3.5 rounded-full bg-white text-[#0B0B0B] font-medium text-sm sm:text-base hover:bg-[#F0F2EE] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047554]"
                >
                  Admin dashboard
                </Link>
              )}
              <Link
                to="/projector"
                className="group flex items-center gap-2.5 text-sm sm:text-base font-medium text-[#CBD1CB] hover:text-white px-4 py-3.5 transition-colors"
              >
                <span>Open projector</span>
                <ArrowRight
                  size={18}
                  weight="bold"
                  className="group-hover:translate-x-1 transition-transform text-[#047554]"
                />
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="px-8 py-3.5 rounded-full bg-white text-[#0B0B0B] font-medium text-sm sm:text-base hover:bg-[#F0F2EE] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047554]"
              >
                Admin sign in
              </Link>
              <Link
                to="/login?as=projector"
                className="group flex items-center gap-2.5 text-sm sm:text-base font-medium text-[#CBD1CB] hover:text-white px-4 py-3.5 transition-colors"
              >
                <span>Open projector</span>
                <ArrowRight
                  size={18}
                  weight="bold"
                  className="group-hover:translate-x-1 transition-transform text-[#047554]"
                />
              </Link>
            </>
          )}
        </motion.div>
      </main>

      {/* Stadium Dot-Matrix Ticker */}
      <TickerStrip
        season={activeSeason}
        sports={sports}
        teams={teams}
        players={playerStats}
      />

      {/* Three Architectural Value Pillars */}
      <section className="px-6 md:px-16 lg:px-24 py-20 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12">
          {/* Pillar 1 */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col pt-6 border-t border-white/10"
          >
            <div className="flex items-center gap-3 mb-4 text-[#047554]">
              <Users size={26} weight="bold" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#8E928C]">
                Step 01
              </span>
            </div>
            <h3 className="font-syne font-bold text-2xl text-[#F0F2EE] mb-2 tracking-tight">
              Register players
            </h3>
            <p className="text-sm text-[#8E928C] leading-relaxed">
              Capture student rosters with photos, sport roles across Cricket, Futsal, and Volleyball, base points, and batch numbers.
            </p>
          </motion.div>

          {/* Pillar 2 */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex flex-col pt-6 border-t border-white/10"
          >
            <div className="flex items-center gap-3 mb-4 text-[#047554]">
              <ShieldCheck size={26} weight="bold" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#8E928C]">
                Step 02
              </span>
            </div>
            <h3 className="font-syne font-bold text-2xl text-[#F0F2EE] mb-2 tracking-tight">
              Build teams
            </h3>
            <p className="text-sm text-[#8E928C] leading-relaxed">
              Establish franchises with team crests, custom colors, owners, and starting budgets tailored to college athletic leagues.
            </p>
          </motion.div>

          {/* Pillar 3 */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col pt-6 border-t border-white/10"
          >
            <div className="flex items-center gap-3 mb-4 text-[#C88B0F]">
              <Coins size={26} weight="bold" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#8E928C]">
                Step 03
              </span>
            </div>
            <h3 className="font-syne font-bold text-2xl text-[#F0F2EE] mb-2 tracking-tight">
              Fund purses
            </h3>
            <p className="text-sm text-[#8E928C] leading-relaxed">
              Debit auction prices with atomic ledger precision, prevent negative balances, and broadcast live standings to the hall.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Editorial DRGMC Footer */}
      <footer className="border-t border-white/5 py-12 px-6 md:px-16 lg:px-24">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-syne font-bold text-lg text-white">Fieldr</div>
            <div className="text-xs text-[#8E928C] mt-0.5">
              Built for DRGMC college athletic tournaments.
            </div>
          </div>
          <div className="text-xs text-[#8E928C] flex items-center gap-6">
            <span>Cricket</span>
            <span>·</span>
            <span>Futsal</span>
            <span>·</span>
            <span>Volleyball</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
