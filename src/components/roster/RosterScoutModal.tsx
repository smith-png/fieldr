import React, { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { User, X } from '@phosphor-icons/react'
import type { PublicPlayer } from '../../types'
import { formatAthleteCode } from '../../lib/data'

export interface RosterScoutModalProps {
  player: PublicPlayer | null
  onClose: () => void
}

export const RosterScoutModal: React.FC<RosterScoutModalProps> = ({ player, onClose }) => {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!player) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [player, onClose])

  if (!player) return null

  const formattedCode = formatAthleteCode(player.athlete_code || player.player_code)

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
        className="bg-surface border border-border rounded-2xl max-w-md w-full overflow-hidden shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 outline-none"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
        >
          <X size={18} weight="bold" />
        </button>

        {/* Player Photo */}
        <div className="relative w-full h-72 bg-surface-2 flex items-center justify-center overflow-hidden border-b border-border">
          {player.photo_url || player.photo_thumb_url ? (
            <img
              src={player.photo_url || player.photo_thumb_url}
              alt={player.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-muted">
              <User size={64} weight="thin" />
              <span className="text-xs font-mono uppercase tracking-wider mt-2">
                Official Photo Pending
              </span>
            </div>
          )}
          <div className="absolute top-4 left-4 bg-black/75 border border-white/20 rounded-md px-2.5 py-1 text-xs font-mono text-white font-bold">
            #{formattedCode}
          </div>
        </div>

        {/* Content Details */}
        <div className="p-6">
          <div className="mb-4">
            <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-1">
              {player.sport} · {player.playing_role}
            </span>
            <h2 className="font-syne font-extrabold text-2xl text-text tracking-tight">
              {player.name}
            </h2>
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

          <div className="mt-5 flex items-center justify-between text-xs">
            <Link
              to={`/players/${player.athlete_code || formattedCode}`}
              className="text-accent-bright hover:underline font-mono text-xs font-bold"
            >
              View Full Universal Profile &amp; History &rarr;
            </Link>
            <span className="text-accent-bright font-mono text-[11px] font-bold">Ready for Draft</span>
          </div>
        </div>
      </div>
    </div>
  )
}
