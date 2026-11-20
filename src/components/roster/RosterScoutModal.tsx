import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, User, X } from '@phosphor-icons/react'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import type { PublicPlayer, PublicTeam } from '../../types'
import { formatAthleteCode } from '../../lib/data/client'

export interface RosterScoutModalProps {
  player: PublicPlayer | null
  team?: PublicTeam | null
  onClose: () => void
}

function formatAthleteName(name: string): string {
  return name.replace(/\s+(\d+)$/, '\u00A0$1')
}

export const RosterScoutModal: React.FC<RosterScoutModalProps> = ({ player, team, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const isOpen = Boolean(player)

  useBodyScrollLock(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!player) return null

  const formattedCode = formatAthleteCode(player.athlete_code || player.player_code)
  const primaryPhotoSrc = player.photo_url || player.photo_thumb_url
  const backdropPhotoSrc = player.photo_thumb_url || player.photo_url
  const displayName = formatAthleteName(player.name)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Athlete card for ${player.name}`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4 sm:p-6"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="frost-deep border border-border rounded-3xl max-w-md lg:max-w-[960px] w-full max-h-[90vh] lg:max-h-[88vh] overflow-y-auto lg:overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 motion-reduce:animate-none outline-none flex flex-col lg:flex-row"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="frost absolute top-6 right-6 lg:top-5 lg:right-5 z-20 w-8 h-8 rounded-full border border-border flex items-center justify-center text-text hover:opacity-80 transition-opacity duration-150 motion-reduce:transition-none"
        >
          <X size={16} weight="bold" />
        </button>

        {/* Inset Photo Column */}
        <div className="p-3 lg:w-[45%] lg:shrink-0 flex flex-col">
          <div className="relative w-full h-72 sm:h-80 lg:h-full lg:min-h-[460px] rounded-2xl bg-surface-2 flex items-center justify-center overflow-hidden border border-border/60">
            {primaryPhotoSrc ? (
              <>
                {backdropPhotoSrc && (
                  <img
                    src={backdropPhotoSrc}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="hidden lg:block absolute inset-0 w-full h-full object-cover scale-115 blur-2xl opacity-65 pointer-events-none select-none"
                  />
                )}
                <img
                  src={primaryPhotoSrc}
                  alt={player.name}
                  width={448}
                  height={288}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="relative z-10 w-full h-full object-cover lg:object-contain"
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted">
                <User size={64} weight="thin" />
                <span className="text-xs font-mono uppercase tracking-wider mt-2">
                  Official Photo Pending
                </span>
              </div>
            )}

            <div className="frost absolute top-3 left-3 z-20 border border-border rounded-full px-2.5 py-1 text-xs font-mono text-text font-bold tabular-nums">
              #{formattedCode}
            </div>
          </div>
        </div>

        {/* Details Column */}
        <div className="flex-1 flex flex-col min-h-0 lg:overflow-y-auto thin-scrollbar px-5 pt-2 pb-5 sm:px-6 sm:pt-3 sm:pb-6 lg:p-8 lg:pl-6">
          <div className="mb-5 lg:pr-10">
            <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1.5">
              {player.sport}
            </span>
            <h2 className="font-syne font-extrabold text-text tracking-tight text-balance leading-[1.08] text-[clamp(1.625rem,4.5vw,2.5rem)]">
              {displayName}
            </h2>
            <div className="font-syne font-bold text-lg lg:text-xl text-text mt-1.5">
              {player.playing_role}
            </div>
            {player.base_points !== undefined && player.base_points !== null && (
              <div className="font-mono text-xs text-points font-semibold tabular-nums mt-1">
                Base: {player.base_points.toLocaleString()} PTS
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 py-4 border-y border-border text-xs">
            <div>
              <span className="text-muted block mb-0.5">Academic Standing</span>
              <span className="text-text font-medium">{player.academic_year} Year Student</span>
            </div>
            <div>
              <span className="text-muted block mb-0.5">Primary Discipline</span>
              <span className="text-text font-medium">{player.sport}</span>
            </div>
          </div>

          <div className="mt-6 lg:mt-auto pt-4 flex flex-col gap-3.5">
            {team || player.status === 'sold' ? (
              <span className="frost self-start inline-flex items-center gap-2 border border-border rounded-full px-3 py-1.5 font-mono uppercase text-[11px] font-bold tracking-wider text-text">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: team?.color || 'var(--accent)' }}
                />
                <span>{team ? team.name : 'Drafted'}</span>
              </span>
            ) : (
              <span className="frost self-start inline-flex items-center gap-2 border border-border rounded-full px-3 py-1.5 font-mono uppercase text-[11px] font-bold tracking-wider text-text">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full shrink-0 bg-accent"
                />
                <span>Ready for Draft</span>
              </span>
            )}

            <Link
              to={`/players/${player.athlete_code || formattedCode}`}
              className="group w-full h-12 rounded-full bg-accent text-on-accent hover:opacity-95 active:scale-[0.99] transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 flex items-center justify-between pl-6 pr-2 font-sans font-semibold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <span>View full profile</span>
              <span
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-on-accent/15 flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              >
                <ArrowRight size={16} weight="bold" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

