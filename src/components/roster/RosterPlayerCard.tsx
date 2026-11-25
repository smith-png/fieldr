import React, { useState } from 'react'
import type { PublicPlayer, PublicTeam } from '../../types'
import { formatAthleteCode } from '../../lib/data/client'
import { getInitials, getValidTeamColor } from '../../lib/utils'
import { PhotoPlaceholder } from './PhotoPlaceholder'

export interface RosterPlayerCardProps {
  player: PublicPlayer
  team?: PublicTeam | null
  otherSports?: string[]
  onClick?: () => void
  onSelect?: (player: PublicPlayer) => void
}

const EMPTY_SPORTS: string[] = []

const RosterPlayerCardInner: React.FC<RosterPlayerCardProps> = ({
  player,
  team,
  otherSports = EMPTY_SPORTS,
  onClick,
  onSelect
}) => {
  const photoSrc = player.photo_thumb_url || player.photo_url || ''
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const photoFailed = failedSrc === photoSrc
  const formattedCode = formatAthleteCode(player.athlete_code || player.player_code)
  const handleClick = onSelect ? () => onSelect(player) : onClick
  const teamColor = getValidTeamColor(team?.color)
  const hasTeam = Boolean(team)
  const unteamedStatus = !hasTeam ? player.status : undefined
  const resolvedTeamColor = teamColor || (hasTeam ? 'var(--accent-bright)' : undefined)
  const hasPurchasePrice =
    player.purchase_price !== undefined && player.purchase_price !== null
  const hasBasePoints =
    player.base_points !== undefined && player.base_points !== null

  return (
    <div
      onClick={handleClick}
      style={
        resolvedTeamColor
          ? ({ '--team-color': resolvedTeamColor } as React.CSSProperties)
          : undefined
      }
      className={`group relative overflow-hidden rounded-2xl border border-solid p-4 sm:p-5 text-left flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright min-w-0 ${
        handleClick ? 'cursor-pointer pub-card-lift' : ''
      } ${
        resolvedTeamColor
          ? 'pub-team-card'
          : 'bg-surface border-border hover:border-accent-bright'
      }`}
    >
      {/* Lot header: #CODE stamp top-left + status dot */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-border">
        <span className="font-mono text-[11px] tracking-[0.14em] text-accent-bright uppercase font-semibold tabular-nums">
          #{formattedCode}
        </span>
        {unteamedStatus === 'available' ? (
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
            title="Available"
          >
            <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0 bg-accent-bright" />
            <span className="sr-only">Available</span>
          </span>
        ) : unteamedStatus === 'unsold' ? (
          <span
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
            title="Unsold"
          >
            <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0 bg-muted" />
            <span className="sr-only">Unsold</span>
          </span>
        ) : team?.short_code ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted tabular-nums">
            {team.short_code}
          </span>
        ) : null}
      </div>

      {/* Identity row */}
      <div className="flex items-start gap-3.5 mb-3 min-w-0">
        {(player.photo_thumb_url || player.photo_url) && !photoFailed ? (
          <div className="relative w-13 h-13 rounded-2xl overflow-hidden bg-surface-2 border border-border shrink-0">
            <PhotoPlaceholder />
            <img
              src={player.photo_thumb_url || player.photo_url}
              alt={player.name}
              width={52}
              height={52}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailedSrc(photoSrc)}
              className="relative w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="w-13 h-13 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted font-mono text-sm font-bold shrink-0">
            {getInitials(player.name)}
          </div>
        )}

        <div className="overflow-hidden flex-1 min-w-0">
          <h3 className="font-syne font-bold text-base text-text group-hover:text-accent-bright truncate transition-colors leading-snug">
            {player.name}
          </h3>
          <div className="text-sm text-muted block truncate mt-0.5">
            {player.playing_role}
          </div>
        </div>
      </div>

      {otherSports.length > 0 && (
        <div className="text-[11px] text-muted mb-3 truncate">
          <span>Also plays:</span>{' '}
          <span className="text-text font-medium">{otherSports.join(' · ')}</span>
        </div>
      )}

      {/* Fixed-baseline amber PTS + footer metadata */}
      <div className="mt-auto pt-2.5 sm:pt-3 border-t border-border flex items-baseline justify-between gap-2 text-xs">
        <div className="min-w-0 flex items-baseline gap-2">
          <span className="text-muted truncate">{player.academic_year} Year</span>
          {(hasPurchasePrice || hasBasePoints) && (
            <>
              <span aria-hidden="true" className="text-muted/50">
                ·
              </span>
              <span className="font-mono text-xs text-points font-semibold tabular-nums shrink-0">
                {hasPurchasePrice
                  ? `${player.purchase_price!.toLocaleString()} PTS`
                  : `Base ${player.base_points!.toLocaleString()} PTS`}
              </span>
            </>
          )}
        </div>
        {handleClick && (
          <span className="text-xs font-medium text-accent-bright group-hover:underline shrink-0">
            Scout
          </span>
        )}
      </div>
    </div>
  )
}

export const RosterPlayerCard = React.memo(RosterPlayerCardInner)
