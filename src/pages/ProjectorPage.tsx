import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowsIn,
  ArrowsOut,
  Coins,
  ShieldCheck,
  User,
  Users
} from '@phosphor-icons/react'
import { AnimatedCounter } from '../components/AnimatedCounter'
import {
  getPlayers,
  getProjectorState,
  getSeasons,
  getTeams,
  subscribeToPlayers,
  subscribeToProjector,
  subscribeToTeams
} from '../lib/data'
import type { Player, ProjectorState, Season, Team } from '../lib/types'

export const ProjectorPage: React.FC = () => {
  const shouldReduceMotion = useReducedMotion()

  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [projectorState, setProjectorState] = useState<ProjectorState>({
    season_id: '',
    mode: 'idle',
    player_id: null,
    team_id: null,
    updated_at: new Date().toISOString()
  })
  const [teams, setTeams] = useState<Team[]>([])
  const [players, setPlayers] = useState<Player[]>([])

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const hideControlsTimer = useRef<NodeJS.Timeout | null>(null)

  // Fullscreen inactivity timer
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true)
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }

    window.addEventListener('mousemove', handleMouseMove)
    hideControlsTimer.current = setTimeout(() => {
      setShowControls(false)
    }, 3000)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    }
  }, [])

  // Initial load and subscriptions
  useEffect(() => {
    let unsubProjector = () => {}
    let unsubTeams = () => {}
    let unsubPlayers = () => {}

    async function init() {
      try {
        const seasonsList = await getSeasons()
        const active = seasonsList.find((s) => s.is_active) || seasonsList[0] || null
        setActiveSeason(active)

        if (active) {
          const [initialPState, initialTeams, initialPlayers] = await Promise.all([
            getProjectorState(active.id),
            getTeams(active.id),
            getPlayers(active.id)
          ])

          setProjectorState(initialPState)
          setTeams(initialTeams)
          setPlayers(initialPlayers)

          // Realtime subscriptions
          unsubProjector = subscribeToProjector(active.id, (newState) => {
            setProjectorState(newState)
          })

          unsubTeams = subscribeToTeams(active.id, (newTeams) => {
            setTeams(newTeams)
          })

          unsubPlayers = subscribeToPlayers(active.id, (newPlayers) => {
            setPlayers(newPlayers)
          })
        }
      } catch {
        // fallback
      }
    }

    init()

    return () => {
      unsubProjector()
      unsubTeams()
      unsubPlayers()
    }
  }, [activeSeason?.id])

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch {
      // ignore
    }
  }

  // Active scene entities
  const spotlightPlayer = players.find((p) => p.id === projectorState.player_id)
  const rosterTeam = teams.find((t) => t.id === projectorState.team_id)
  const rosterPlayers = rosterTeam ? players.filter((p) => p.team_id === rosterTeam.id) : []

  // Animation variants
  const sceneVariants = {
    initial: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.98, filter: 'blur(6px)' },
    animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
    exit: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 1.02, filter: 'blur(6px)' }
  }

  return (
    <div className="min-h-screen w-screen bg-[#0B0B0B] text-[#F0F2EE] overflow-hidden flex flex-col justify-between relative select-none antialiased">
      {/* Ambient Auditorium Lighting (Subtle organic blur) */}
      <div className="absolute top-1/4 left-1/4 w-[50vw] h-[50vw] rounded-full bg-[#047554]/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[40vw] h-[40vw] rounded-full bg-[#395F3D]/10 blur-[120px] pointer-events-none" />

      {/* Auto-Hiding Stage Control Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 p-6 flex items-center justify-between transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 bg-[#111411]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 text-xs">
          <span className="w-2 h-2 rounded-full bg-[#047554] animate-pulse" />
          <span className="font-syne font-bold tracking-tight text-white">Fieldr Stage</span>
          <span className="text-white/30">·</span>
          <span className="text-[#CBD1CB]">{activeSeason?.name || 'Tournament 2026'}</span>
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-[#111411]/80 backdrop-blur-md border border-white/10 text-[#CBD1CB] hover:text-white hover:border-[#047554] transition-all"
        >
          {isFullscreen ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
        </button>
      </header>

      {/* Main Auditorium Projection Screen Canvas */}
      <main className="flex-1 flex items-center justify-center p-8 sm:p-12 md:p-16 lg:p-20 relative z-10 w-full h-full max-w-[1920px] mx-auto">
        <AnimatePresence mode="wait">
          {/* ================= SCENE 1: IDLE WELCOME ================= */}
          {projectorState.mode === 'idle' && (
            <motion.div
              key="scene-idle"
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center text-center my-auto w-full"
            >
              {/* College Tournament Eyebrow */}
              <div className="font-mono text-sm sm:text-base md:text-lg tracking-[0.35em] text-[#8E928C] uppercase mb-4">
                Fieldr Athletic Auctions
              </div>

              {/* Monumental Wordmark */}
              <h1 className="font-syne font-extrabold text-7xl sm:text-9xl md:text-[13rem] lg:text-[16rem] tracking-tighter leading-none text-white drop-shadow-[0_15px_35px_rgba(0,0,0,0.8)]">
                FIELDR
              </h1>

              {/* Tournament Season Name */}
              <div className="text-xl sm:text-3xl md:text-4xl text-[#CBD1CB] font-syne font-bold mt-4 md:mt-6 tracking-tight">
                {activeSeason?.name || 'Annual Sports Tournament 2026'}
              </div>

              {/* Motto */}
              <div className="mt-8 md:mt-12 flex items-center gap-4 sm:gap-6 text-sm sm:text-lg md:text-2xl font-mono uppercase tracking-[0.25em] text-[#047554] font-semibold">
                <span>Draft</span>
                <span className="text-white/20">/</span>
                <span>Bid</span>
                <span className="text-white/20">/</span>
                <span>Win</span>
              </div>
            </motion.div>
          )}

          {/* ================= SCENE 2: TEAMS & PURSES ================= */}
          {projectorState.mode === 'teams' && (
            <motion.div
              key="scene-teams"
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col justify-center w-full h-full my-auto"
            >
              {/* Scene Title */}
              <div className="flex items-end justify-between pb-6 mb-8 border-b border-white/10">
                <div>
                  <span className="font-mono text-xs sm:text-sm uppercase tracking-widest text-[#047554] block mb-1">
                    Auditorium Leaderboard
                  </span>
                  <h2 className="font-syne font-bold text-4xl sm:text-5xl md:text-6xl text-white tracking-tight">
                    Franchise Purses
                  </h2>
                </div>
                <div className="text-right font-mono text-xs sm:text-sm text-[#8E928C]">
                  <span>{teams.length} Teams Registered</span>
                </div>
              </div>

              {/* Teams Grid */}
              {teams.length === 0 ? (
                <div className="py-24 text-center text-lg text-[#8E928C] font-mono">
                  No franchise teams registered in this tournament yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8">
                  {teams.map((team) => (
                    <div
                      key={team.id}
                      className="p-6 sm:p-8 rounded-3xl bg-[#131613]/90 border border-white/10 flex flex-col justify-between gap-6 shadow-2xl relative overflow-hidden"
                    >
                      {/* Franchise Color Top Line */}
                      <div
                        className="absolute top-0 left-0 right-0 h-2"
                        style={{ backgroundColor: team.color }}
                      />

                      <div className="flex items-start justify-between gap-4 pt-1">
                        <div className="flex items-center gap-4">
                          <div
                            className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center font-syne font-extrabold text-xl text-white overflow-hidden border border-white/10 shrink-0 shadow-md"
                            style={{ backgroundColor: team.color }}
                          >
                            {team.logo_url ? (
                              <img
                                src={team.logo_url}
                                alt={team.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{team.short_code}</span>
                            )}
                          </div>
                          <div>
                            <h3 className="font-syne font-bold text-2xl sm:text-3xl text-white tracking-tight leading-snug">
                              {team.name}
                            </h3>
                            <div className="text-xs sm:text-sm text-[#CBD1CB] mt-0.5">
                              Sport: {team.sport}
                            </div>
                          </div>
                        </div>

                        <span className="font-mono text-sm px-2.5 py-1 rounded bg-white/10 text-white font-semibold">
                          {team.short_code}
                        </span>
                      </div>

                      {/* Owner & Animated Purse */}
                      <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
                        {team.owner_display_name && (
                          <div className="text-xs text-[#8E928C] truncate">
                            Owner: <span className="text-white">{team.owner_display_name}</span>
                          </div>
                        )}
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="text-xs font-mono uppercase tracking-wider text-[#8E928C]">
                            Purse Balance
                          </span>
                          <div className="flex items-baseline gap-1.5 text-[#C88B0F]">
                            <AnimatedCounter
                              value={team.current_purse}
                              className="font-syne font-extrabold text-3xl sm:text-4xl md:text-5xl"
                            />
                            <span className="font-mono text-xs font-semibold">PTS</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ================= SCENE 3: PLAYER SPOTLIGHT ================= */}
          {projectorState.mode === 'player' && (
            <motion.div
              key={`scene-player-${spotlightPlayer?.id || 'none'}`}
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col lg:flex-row items-center justify-center gap-10 md:gap-16 lg:gap-24 w-full max-w-6xl my-auto"
            >
              {spotlightPlayer ? (
                <>
                  {/* High-Contrast Large Portrait */}
                  <motion.div
                    initial={shouldReduceMotion ? {} : { scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="w-64 h-80 sm:w-80 sm:h-96 md:w-96 md:h-[460px] rounded-3xl bg-[#141414] border-2 border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden shrink-0 flex items-center justify-center relative"
                  >
                    {spotlightPlayer.photo_url ? (
                      <img
                        src={spotlightPlayer.photo_url}
                        alt={spotlightPlayer.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-4 text-[#8E928C]">
                        <User size={96} weight="thin" />
                        <span className="font-mono text-sm tracking-wider uppercase">
                          No Photo Uploaded
                        </span>
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-4 right-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-widest font-semibold border ${
                          spotlightPlayer.status === 'sold'
                            ? 'bg-[#B91C1C]/40 border-[#B91C1C] text-white'
                            : 'bg-[#047554]/40 border-[#047554] text-white'
                        }`}
                      >
                        {spotlightPlayer.status === 'sold' ? 'SOLD / DRAFTED' : 'AVAILABLE'}
                      </span>
                    </div>
                  </motion.div>

                  {/* Player Credentials & Stats */}
                  <div className="flex flex-col gap-6 text-left max-w-2xl">
                    <div>
                      {/* Sport & Role Eyebrow */}
                      <div className="flex items-center gap-3 text-sm md:text-base font-mono uppercase tracking-widest text-[#047554] font-semibold mb-3">
                        <span>{spotlightPlayer.sport}</span>
                        <span className="text-white/30">/</span>
                        <span>{spotlightPlayer.playing_role}</span>
                      </div>

                      {/* Huge Name Display */}
                      <h2 className="font-syne font-extrabold text-5xl sm:text-7xl md:text-8xl text-white tracking-tighter leading-[0.95] drop-shadow-md">
                        {spotlightPlayer.name}
                      </h2>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-6 border-t border-white/10 font-mono">
                      <div>
                        <span className="text-xs text-[#8E928C] uppercase tracking-wider block">
                          Academic Batch
                        </span>
                        <span className="font-syne font-bold text-xl md:text-2xl text-white mt-1 block">
                          {spotlightPlayer.year_batch}
                        </span>
                      </div>

                      {spotlightPlayer.roll_no && (
                        <div>
                          <span className="text-xs text-[#8E928C] uppercase tracking-wider block">
                            Roll Number
                          </span>
                          <span className="font-syne font-bold text-xl md:text-2xl text-white mt-1 block">
                            #{spotlightPlayer.roll_no}
                          </span>
                        </div>
                      )}

                      <div>
                        <span className="text-xs text-[#8E928C] uppercase tracking-wider block">
                          Base Auction Price
                        </span>
                        <span className="font-syne font-extrabold text-2xl md:text-3xl text-[#C88B0F] tabular-nums mt-1 block">
                          {spotlightPlayer.base_points.toLocaleString()} PTS
                        </span>
                      </div>
                    </div>

                    {spotlightPlayer.notes && (
                      <div className="p-4 rounded-2xl bg-[#141414] border border-white/10 text-sm text-[#CBD1CB] leading-relaxed">
                        <span className="font-mono text-xs uppercase text-[#8E928C] block mb-1">
                          Scouting Bio
                        </span>
                        {spotlightPlayer.notes}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center font-mono text-xl text-[#8E928C]">
                  No player currently selected in Spotlight.
                </div>
              )}
            </motion.div>
          )}

          {/* ================= SCENE 4: TEAM ROSTER ================= */}
          {projectorState.mode === 'roster' && (
            <motion.div
              key={`scene-roster-${rosterTeam?.id || 'none'}`}
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col justify-center w-full h-full max-w-6xl my-auto"
            >
              {rosterTeam ? (
                <>
                  {/* Franchise Header Banner */}
                  <div className="p-8 rounded-3xl bg-[#131613] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 relative overflow-hidden">
                    <div
                      className="absolute top-0 left-0 bottom-0 w-2.5"
                      style={{ backgroundColor: rosterTeam.color }}
                    />

                    <div className="flex items-center gap-6">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center font-syne font-extrabold text-2xl text-white overflow-hidden border border-white/10 shrink-0 shadow-lg"
                        style={{ backgroundColor: rosterTeam.color }}
                      >
                        {rosterTeam.logo_url ? (
                          <img
                            src={rosterTeam.logo_url}
                            alt={rosterTeam.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{rosterTeam.short_code}</span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="font-syne font-bold text-4xl sm:text-5xl text-white tracking-tight">
                            {rosterTeam.name}
                          </h2>
                          <span className="font-mono text-sm px-2.5 py-1 rounded bg-white/10 text-white font-semibold">
                            {rosterTeam.short_code}
                          </span>
                        </div>
                        <div className="text-sm text-[#8E928C] mt-1 flex items-center gap-3">
                          <span>Sport: <strong className="text-white">{rosterTeam.sport}</strong></span>
                          {rosterTeam.owner_display_name && (
                            <>
                              <span>·</span>
                              <span>Owner: <strong className="text-white">{rosterTeam.owner_display_name}</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-left md:text-right font-mono">
                      <span className="text-xs uppercase tracking-wider text-[#8E928C] block">
                        Remaining Purse
                      </span>
                      <div className="font-syne font-extrabold text-4xl text-[#C88B0F] tabular-nums mt-0.5">
                        <AnimatedCounter value={rosterTeam.current_purse} /> PTS
                      </div>
                    </div>
                  </div>

                  {/* Assigned Players List */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-[#8E928C]">
                      <span>Drafted Squad ({rosterPlayers.length} Players)</span>
                    </div>

                    {rosterPlayers.length === 0 ? (
                      <div className="py-16 text-center text-sm font-mono text-[#8E928C] border border-dashed border-white/10 rounded-2xl">
                        No athletes drafted to this franchise roster yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rosterPlayers.map((player) => (
                          <div
                            key={player.id}
                            className="p-4 rounded-2xl bg-[#141414] border border-white/10 flex items-center gap-4 shadow-lg"
                          >
                            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                              {player.photo_url ? (
                                <img
                                  src={player.photo_url}
                                  alt={player.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User size={20} className="text-[#8E928C]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-syne font-bold text-base text-white truncate">
                                {player.name}
                              </h4>
                              <div className="text-xs text-[#047554] font-medium">
                                {player.playing_role} · Batch {player.year_batch}
                              </div>
                              {player.purchase_price ? (
                                <div className="font-mono text-xs text-[#C88B0F] tabular-nums mt-0.5">
                                  Draft Price: {player.purchase_price.toLocaleString()} PTS
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center font-mono text-xl text-[#8E928C]">
                  No team selected for Roster showcase.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Auditorium Footer Bar */}
      <footer className="p-6 flex items-center justify-between text-xs font-mono text-[#8E928C] border-t border-white/5 relative z-10">
        <div>Fieldr Sports Auction Arena</div>
        <div className="flex items-center gap-4">
          <span>Realtime Stage Synchronization</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#047554]" />
        </div>
      </footer>
    </div>
  )
}
