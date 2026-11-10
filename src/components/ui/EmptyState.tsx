import React from 'react'
import type { Icon } from '@phosphor-icons/react'

export interface EmptyStateProps {
  icon?: Icon
  title: string
  description?: string
  action?: React.ReactNode
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: IconComponent,
  title,
  description,
  action,
  actionLabel,
  onAction,
  className = ''
}) => {
  return (
    <div
      className={`text-center py-12 px-6 rounded-2xl border border-dashed border-border bg-surface/50 flex flex-col items-center justify-center gap-3 ${className}`}
    >
      {IconComponent && (
        <div className="p-3 rounded-full bg-surface-2 text-muted mb-1">
          <IconComponent size={28} weight="regular" />
        </div>
      )}
      <h4 className="text-base font-bold text-text tracking-tight">{title}</h4>
      {description && (
        <p className="text-xs text-muted max-w-sm leading-relaxed">{description}</p>
      )}
      {action ? (
        <div className="mt-2">{action}</div>
      ) : actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 text-xs font-semibold px-4 py-2 rounded-xl bg-accent text-on-accent hover:opacity-90 transition-opacity"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
