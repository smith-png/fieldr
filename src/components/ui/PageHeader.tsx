import React from 'react'

export interface PageHeaderProps {
  label?: string
  title: string
  subtitle?: string
  badge?: React.ReactNode
  backAction?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  label,
  title,
  subtitle,
  badge,
  backAction,
  actions,
  className = ''
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-6 border-b border-border ${className}`}
    >
      <div className="flex items-start gap-3.5 min-w-0">
        {backAction && <div className="shrink-0 mt-1">{backAction}</div>}
        <div className="min-w-0">
          {label && (
            <span className="text-xs font-sans font-normal uppercase tracking-wide text-accent-bright block mb-1.5">
              {label}
            </span>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-text">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm font-light text-muted mt-1.5 max-w-2xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap shrink-0 self-start sm:self-auto">
          {actions}
        </div>
      )}
    </div>
  )
}
