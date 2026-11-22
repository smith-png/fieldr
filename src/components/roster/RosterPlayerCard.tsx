import React from 'react'
import type { PublicPlayer, PublicTeam } from '../../types'
import { formatAthleteCode } from '../../lib/data/client'
import { getInitials } from '../../lib/utils'

export interface RosterPlayerCardProps {
  player: PublicPlayer
  team?: PublicTeam | null
  otherSports?: string[]
  onClick?: () => void
  onSelect?: (player: PublicPlayer) => void
}

const EMPTY_SPORTS: string[] = []

const DISALLOWED_CSS_COLORS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer'
])

function getValidTeamColor(color?: string | null): string | null {
  const clean = color?.trim()
  if (!clean) return null
  if (DISALLOWED_CSS_COLORS.has(clean.toLowerCase())) return null
  if (/[;{}<>]/.test(clean)) return null

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', clean) ? clean : null
  }

  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(clean)
    ? clean
    : null
}

const RosterPlayerCardInner: React.FC<RosterPlayerCardProps> = ({
  player,
  team,
  otherSports = EMPTY_SPORTS,
  onClick,
  onSelect
}) => {
  const formattedCode = formatAthleteCode(player.athlete_code || player.player_code)
  const handleClick = onSelect ? () => onSelect(player) : onClick
  const teamColor = getValidTeamColor(team?.color)
  const hasTeam = Boolean(team)
  const unteamedStatus = !hasTeam ? player.status : undefined

  return (
    <div
      onClick={handleClick}
      style={
        teamColor
          ? ({ '--team-color': teamColor } as React.CSSProperties)
          : undefined
      }
      className={`group bg-surface border-[1.5px] border-solid rounded-3xl p-5 text-left transition-colors flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright min-w-0 ${
        handleClick ? 'cursor-pointer' : ''
      } ${
        teamColor
          ? 'border-[color:color-mix(in_srgb,var(--team-color)_65%,transparent)] hover:border-[color:var(--team-color)]'
          : hasTeam
          ? 'border-[color:color-mix(in_srgb,var(--accent-bright)_65%,transparent)] hover:border-accent-bright'
          : 'border-border hover:border-accent-bright'
      }`}
    >
      <div className="flex items-start gap-3.5 mb-4 min-w-0">
        {player.photo_thumb_url || player.photo_url ? (
          <img
            src={player.photo_thumb_url || player.photo_url}
            alt={player.name}
            width={52}
            height={52}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="w-13 h-13 rounded-2xl object-cover bg-surface-2 border border-border shrink-0"
          />
        ) : (
          <div className="w-13 h-13 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted font-mono text-sm font-bold shrink-0">
            {getInitials(player.name)}
          </div>
        )}

        <div className="overflow-hidden flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="font-mono text-[11px] tracking-wider text-accent-bright block uppercase font-semibold tabular-nums">
              #{formattedCode}
            </span>
            {unteamedStatus === 'available' && (
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full shrink-0 bg-accent-bright"
                title="Available"
              />
            )}
            {unteamedStatus === 'unsold' && (
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full shrink-0 bg-muted"
                title="Unsold"
              />
            )}
          </div>
          <h3 className="font-syne font-bold text-base text-text group-hover:text-accent-bright truncate transition-colors">
            {player.name}
          </h3>
          <div className="font-syne font-bold text-sm text-text block truncate mt-0.5">
            {player.playing_role}
          </div>
          {player.purchase_price !== undefined && player.purchase_price !== null ? (
            <div className="font-mono text-xs text-points font-semibold tabular-nums mt-0.5">
              {player.purchase_price.toLocaleString()} PTS
            </div>
          ) : (
            player.base_points !== undefined &&
            player.base_points !== null && (
              <div className="font-mono text-xs text-points font-semibold tabular-nums mt-0.5">
                Base: {player.base_points.toLocaleString()} PTS
              </div>
            )
          )}
        </div>
      </div>

      {otherSports.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[11px] text-muted">Also plays:</span>
          {otherSports.map((sp) => (
            <span
              key={sp}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 text-text border border-border"
            >
              {sp}
            </span>
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-border flex items-center justify-between gap-2 text-xs text-muted">
        <span className="text-text font-medium truncate">{player.academic_year} Year</span>
        {handleClick && (
          <span className="text-xs font-medium text-accent-bright group-hover:underline shrink-0">
            Scout profile
          </span>
        )}
      </div>
    </div>
  )
}

export const RosterPlayerCard = React.memo(RosterPlayerCardInner)
