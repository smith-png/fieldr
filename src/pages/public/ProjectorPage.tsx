import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  ArrowsIn,
  ArrowsOut,
  Moon,
  Sun,
  User
} from '@phosphor-icons/react'
import { AnimatedCounter } from '../../components/home/AnimatedCounter'
import { BrandMark } from '../../components/layout/BrandMark'
import {
  formatAthleteCode,
  getPlayers,
  getProjectorState,
  getSeasons,
  getTeams,
  subscribeToPlayers,
  subscribeToProjector,
  subscribeToTeams
} from '../../lib/data'
import { getAcademicYearLabel } from '../../lib/academicYears'
import { useProjectorTheme } from '../../hooks/useTheme'
import type { Player, ProjectorState, Season, Team } from '../../types'

export const ProjectorPage: React.FC = () => {
  const { projectorTheme, toggleProjectorTheme } = useProjectorTheme()
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
  const [showControls, setShowControls] = useState(false)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Controls hidden by default; appear on tap or mouse movement and fade out after 3 seconds
  useEffect(() => {
    const revealControls = () => {
      setShowControls(true)
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
      hideControlsTimer.current = setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }

    window.addEventListener('mousemove', revealControls)
    window.addEventListener('mousedown', revealControls)
    window.addEventListener('touchstart', revealControls, { passive: true })
    window.addEventListener('keydown', revealControls)

    return () => {
      window.removeEventListener('mousemove', revealControls)
      window.removeEventListener('mousedown', revealControls)
      window.removeEventListener('touchstart', revealControls)
      window.removeEventListener('keydown', revealControls)
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
      : { opacity: 0, scale: 0.98 },
    animate: { opacity: 1, scale: 1 },
    exit: shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 1.02 }
  }

  return (
    <div
      data-theme={projectorTheme}
      className="min-h-screen w-screen bg-bg text-text overflow-hidden flex flex-col justify-between relative select-none antialiased"
    >
      {/* Subtle Ambient Auditorium Lighting */}
      <div className="absolute top-1/4 left-1/4 w-[50vw] h-[50vw] rounded-full bg-accent-bright/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[40vw] h-[40vw] rounded-full bg-accent/10 blur-[120px] pointer-events-none" />

      {/* Auto-Hiding Top-Right Controls (Theme Toggle + Fullscreen) */}
      <div
        className={`fixed top-6 right-6 z-50 flex items-center gap-2.5 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={toggleProjectorTheme}
          aria-label={`Switch projector to ${projectorTheme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch projector to ${projectorTheme === 'dark' ? 'light' : 'dark'} mode`}
          className="min-h-[42px] px-3.5 py-2 flex items-center gap-2 rounded-xl bg-surface/90 backdrop-blur-md border border-border text-xs font-mono text-text hover:border-accent-bright shadow-md transition-colors"
        >
          {projectorTheme === 'dark' ? (
            <>
              <Sun size={16} weight="bold" className="text-points" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon size={16} weight="bold" className="text-accent-bright" />
              <span>Dark</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          className="min-w-[42px] min-h-[42px] flex items-center justify-center rounded-xl bg-surface/90 backdrop-blur-md border border-border text-text hover:border-accent-bright shadow-md transition-colors"
        >
          {isFullscreen ? <ArrowsIn size={18} weight="bold" /> : <ArrowsOut size={18} weight="bold" />}
        </button>
      </div>

      {/* Main Auditorium Projection Screen Canvas */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 md:p-16 lg:p-20 relative z-10 w-full h-full max-w-[1920px] mx-auto">
        <AnimatePresence mode="wait">
          {/* ================= SCENE 1: IDLE WELCOME ================= */}
          {projectorState.mode === 'idle' && (
            <motion.div
              key="scene-idle"
              variants={sceneVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 flex flex-col items-center justify-between w-full min-h-[80vh]"
            >
              <div aria-hidden="true" />

              {/* Centered Season Name (Vertically & Horizontally) */}
              <div className="flex flex-col items-center justify-center text-center my-auto px-4 max-w-6xl mx-auto">
                <h1
                  className="font-syne font-extrabold text-5xl sm:text-7xl md:text-8xl lg:text-9xl tracking-tight leading-[1.02] text-text"
                  style={{ textWrap: 'balance' }}
                >
                  {activeSeason?.name || 'Annual Sports Tournament'}
                </h1>
              </div>

              {/* Fieldr Branding (Logo and Wordmark, Small) in Footer at Bottom Center */}
              <div className="pt-6 pb-2 flex items-center justify-center">
                <BrandMark size="sm" showWordmark={true} />
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
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col justify-center w-full h-full my-auto"
            >
              {/* Scene Title */}
              <div className="flex items-end justify-between pb-6 mb-8 border-b border-border">
                <div>
                  <span className="font-mono text-xs sm:text-sm uppercase tracking-widest text-accent-bright block mb-1.5">
                    Auditorium Leaderboard
                  </span>
                  <h2 className="font-syne font-extrabold text-4xl sm:text-5xl md:text-6xl text-text tracking-tight">
                    Franchise Purses
                  </h2>
                </div>
                <div className="text-right font-mono text-xs sm:text-sm text-muted tabular-nums">
                  <span>{teams.length} Teams Registered</span>
                </div>
              </div>

              {/* Teams Grid */}
              {teams.length === 0 ? (
                <div className="py-24 text-center text-lg text-muted font-mono">
                  No franchise teams registered in this tournament yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 sm:gap-8">
                  {teams.map((team) => (
                    <div
                      key={team.id}
                      className="p-6 sm:p-8 rounded-2xl bg-surface border border-border flex flex-col justify-between gap-6 shadow-sm relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center font-syne font-extrabold text-xl text-white overflow-hidden border border-border shrink-0 shadow-sm"
                            style={{ backgroundColor: team.color || 'var(--accent-bright)' }}
                          >
                            {team.logo_url ? (
                              <img
                                src={team.logo_url}
                                alt={team.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{team.short_code}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-syne font-bold text-2xl sm:text-3xl text-text tracking-tight leading-snug truncate">
                              {team.name}
                            </h3>
                            <div className="text-xs sm:text-sm text-muted mt-0.5 flex items-center gap-2">
                              <span>{team.sport}</span>
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block border border-border"
                                style={{ backgroundColor: team.color || 'var(--accent-bright)' }}
                              />
                            </div>
                          </div>
                        </div>

                        <span className="font-mono text-sm text-muted font-semibold shrink-0">
                          {team.short_code}
                        </span>
                      </div>

                      {/* Owner & Animated Purse */}
                      <div className="pt-4 border-t border-border flex flex-col gap-2">
                        {team.owner_display_name && (
                          <div className="text-xs text-muted truncate">
                            Owner: <span className="text-text font-medium">{team.owner_display_name}</span>
                          </div>
                        )}
                        <div className="flex items-baseline justify-between mt-1">
                          <span className="text-xs font-mono uppercase tracking-wider text-muted">
                            Purse Balance
                          </span>
                          <div className="flex items-baseline gap-1.5 text-points">
                            <AnimatedCounter
                              value={team.current_purse}
                              className="font-syne font-extrabold text-3xl sm:text-4xl md:text-5xl tabular-nums"
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
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col lg:flex-row items-center justify-center gap-10 md:gap-16 lg:gap-24 w-full max-w-6xl my-auto"
            >
              {spotlightPlayer ? (
                <>
                  {/* High-Contrast Large Portrait */}
                  <motion.div
                    initial={shouldReduceMotion ? {} : { scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                    className="w-64 h-80 sm:w-80 sm:h-96 md:w-96 md:h-[460px] rounded-3xl bg-surface border-2 border-border shadow-xl overflow-hidden shrink-0 flex items-center justify-center relative"
                  >
                    {spotlightPlayer.photo_url ? (
                      <img
                        src={spotlightPlayer.photo_url}
                        alt={spotlightPlayer.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-4 text-muted">
                        <User size={96} weight="thin" />
                        <span className="font-mono text-sm tracking-wider uppercase">
                          No Photo Uploaded
                        </span>
                      </div>
                    )}

                    {/* Status Indicator */}
                    <div className="absolute top-4 right-4">
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-mono uppercase tracking-widest font-bold border bg-surface/90 backdrop-blur-md ${
                          spotlightPlayer.status === 'sold'
                            ? 'border-error/40 text-error'
                            : 'border-accent-bright/40 text-accent-bright'
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
                      <div className="flex items-center gap-3 text-sm md:text-base font-mono uppercase tracking-widest text-accent-bright font-semibold mb-3">
                        <span>
                          #{formatAthleteCode(spotlightPlayer.athlete_code || spotlightPlayer.player_code)}
                        </span>
                        <span className="text-muted">/</span>
                        <span>{spotlightPlayer.sport}</span>
                        <span className="text-muted">/</span>
                        <span>{spotlightPlayer.playing_role}</span>
                      </div>

                      {/* Huge Name Display */}
                      <h2 className="font-syne font-extrabold text-5xl sm:text-7xl md:text-8xl text-text tracking-tighter leading-[0.95]">
                        {spotlightPlayer.name}
                      </h2>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 pt-6 border-t border-border font-mono">
                      <div>
                        <span className="text-xs text-muted uppercase tracking-wider block">
                          Academic Year
                        </span>
                        <span className="font-syne font-bold text-xl md:text-2xl text-text mt-1 block">
                          {getAcademicYearLabel(spotlightPlayer.academic_year || '1st')}
                        </span>
                      </div>

                      {spotlightPlayer.roll_no && (
                        <div>
                          <span className="text-xs text-muted uppercase tracking-wider block">
                            Roll Number
                          </span>
                          <span className="font-syne font-bold text-xl md:text-2xl text-text mt-1 block">
                            #{spotlightPlayer.roll_no}
                          </span>
                        </div>
                      )}

                      <div>
                        <span className="text-xs text-muted uppercase tracking-wider block">
                          Base Auction Price
                        </span>
                        <span className="font-syne font-extrabold text-2xl md:text-3xl text-points tabular-nums mt-1 block">
                          {spotlightPlayer.base_points.toLocaleString()} PTS
                        </span>
                      </div>
                    </div>

                    {spotlightPlayer.notes && (
                      <div className="p-4 rounded-2xl bg-surface border border-border text-sm text-text leading-relaxed">
                        <span className="font-mono text-xs uppercase text-muted block mb-1">
                          Scouting Bio
                        </span>
                        {spotlightPlayer.notes}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center font-mono text-xl text-muted">
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
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col justify-center w-full h-full max-w-6xl my-auto"
            >
              {rosterTeam ? (
                <>
                  {/* Franchise Header Banner */}
                  <div className="p-8 rounded-2xl bg-surface border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                    <div className="flex items-center gap-6">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center font-syne font-extrabold text-2xl text-white overflow-hidden border border-border shrink-0 shadow-sm"
                        style={{ backgroundColor: rosterTeam.color || 'var(--accent-bright)' }}
                      >
                        {rosterTeam.logo_url ? (
                          <img
                            src={rosterTeam.logo_url}
                            alt={rosterTeam.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{rosterTeam.short_code}</span>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="font-syne font-bold text-4xl sm:text-5xl text-text tracking-tight">
                            {rosterTeam.name}
                          </h2>
                          <span className="font-mono text-sm text-muted font-semibold">
                            · {rosterTeam.short_code}
                          </span>
                        </div>
                        <div className="text-sm text-muted mt-1 flex items-center gap-3">
                          <span>
                            Sport: <strong className="text-text">{rosterTeam.sport}</strong>
                          </span>
                          {rosterTeam.owner_display_name && (
                            <>
                              <span>·</span>
                              <span>
                                Owner: <strong className="text-text">{rosterTeam.owner_display_name}</strong>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-left md:text-right font-mono">
                      <span className="text-xs uppercase tracking-wider text-muted block">
                        Remaining Purse
                      </span>
                      <div className="font-syne font-extrabold text-4xl text-points tabular-nums mt-0.5">
                        <AnimatedCounter value={rosterTeam.current_purse} /> PTS
                      </div>
                    </div>
                  </div>

                  {/* Assigned Players List */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between font-mono text-xs uppercase tracking-wider text-muted">
                      <span>Drafted Squad ({rosterPlayers.length} Players)</span>
                    </div>

                    {rosterPlayers.length === 0 ? (
                      <div className="py-16 text-center text-sm font-mono text-muted border border-dashed border-border rounded-2xl bg-surface/50">
                        No athletes drafted to this franchise roster yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rosterPlayers.map((player) => (
                          <div
                            key={player.id}
                            className="p-4 rounded-2xl bg-surface border border-border flex items-center gap-4 shadow-sm"
                          >
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border overflow-hidden shrink-0 flex items-center justify-center">
                              {player.photo_url ? (
                                <img
                                  src={player.photo_url}
                                  alt={player.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User size={20} className="text-muted" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-syne font-bold text-base text-text truncate">
                                {player.name}
                              </h4>
                              <div className="text-xs text-accent-bright font-medium">
                                {player.playing_role} · {getAcademicYearLabel(player.academic_year || '1st')}
                              </div>
                              {player.purchase_price ? (
                                <div className="font-mono text-xs text-points tabular-nums mt-0.5">
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
                <div className="text-center font-mono text-xl text-muted">
                  No team selected for Roster showcase.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
