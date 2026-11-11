import React from 'react'
import type { PublicPlayer, PublicTeam } from '../../types'
import { formatAthleteCode } from '../../lib/data'

export interface RosterPlayerCardProps {
  player: PublicPlayer
  team?: PublicTeam | null
  otherSports?: string[]
  onClick?: () => void
}

export const RosterPlayerCard: React.FC<RosterPlayerCardProps> = ({
  player,
  team,
  otherSports = [],
  onClick
}) => {
  const formattedCode = formatAthleteCode(player.athlete_code || player.player_code)

  return (
    <div
      onClick={onClick}
      className="group bg-surface border border-border hover:border-accent-bright rounded-xl p-5 text-left transition-colors flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright cursor-pointer"
    >
      <div className="flex items-start gap-3.5 mb-3">
        {player.photo_thumb_url || player.photo_url ? (
          <img
            src={player.photo_thumb_url || player.photo_url}
            alt={player.name}
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-lg object-cover bg-surface-2 border border-border shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted font-mono text-sm font-bold shrink-0">
            {player.name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
        )}

        <div className="overflow-hidden flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="font-mono text-[10px] tracking-wider text-accent-bright block uppercase font-bold">
              #{formattedCode}
            </span>
            {team && (
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: team.color || 'var(--accent)' }}
                title={team.name}
              />
            )}
          </div>
          <h3 className="font-syne font-bold text-base text-text group-hover:text-accent-bright truncate">
            {player.name}
          </h3>
          <span className="text-xs text-muted block truncate">
            {player.playing_role}
          </span>
        </div>
      </div>

      {otherSports.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[10px] text-muted font-mono uppercase">Also plays:</span>
          {otherSports.map((sp) => (
            <span
              key={sp}
              className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-surface-2 text-text border border-border"
            >
              {sp}
            </span>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-border flex items-center justify-between text-xs text-muted">
        <span className="text-text font-medium">{player.academic_year} Year</span>
        <span className="text-[11px] font-mono text-accent-bright group-hover:underline">
          Scout profile
        </span>
      </div>
    </div>
  )
}
