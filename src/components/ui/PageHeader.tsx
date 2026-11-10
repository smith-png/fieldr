import React from 'react'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  badge?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  badge,
  actions,
  className = ''
}) => {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border ${className}`}
    >
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs sm:text-sm text-muted mt-1 max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
