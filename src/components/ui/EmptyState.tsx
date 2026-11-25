import React from 'react'
import type { Icon } from '@phosphor-icons/react'

export interface EmptyStateProps {
  icon?: Icon
  statusLabel?: string
  title: string
  description?: string
  action?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: IconComponent,
  statusLabel = 'NO RECORDS',
  title,
  description,
  action,
  actionLabel,
  onAction,
  className = ''
}) => {
  return (
    <div
      className={`pub-corner-ticks pub-enter text-center py-12 px-6 sm:py-14 sm:px-8 rounded-2xl border border-border bg-surface flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <span className="font-dot text-[11px] uppercase tracking-[0.2em] text-accent-bright">
        {statusLabel}
      </span>
      {IconComponent && (
        <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted my-1">
          <IconComponent size={24} weight="regular" />
        </div>
      )}
      <h4 className="font-syne font-bold text-lg sm:text-xl text-text tracking-tight leading-snug">
        {title}
      </h4>
      {description && (
        <p className="text-sm font-normal text-muted max-w-sm leading-relaxed">{description}</p>
      )}
      {action ? (
        <div className="mt-2">{action}</div>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 min-h-[44px] text-xs font-medium px-5 py-2.5 rounded-full bg-btn-bg text-btn-fg hover:opacity-90 active:scale-[0.985] transition-[opacity,transform] duration-150 motion-reduce:transition-none motion-reduce:active:scale-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
