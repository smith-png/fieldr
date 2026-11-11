import React from 'react'
import { WarningCircle, ArrowClockwise } from '@phosphor-icons/react'
import { Button } from './Button'

export interface ErrorStateProps {
  title?: string
  message?: string
  description?: string
  onRetry?: () => void
  isRetrying?: boolean
  className?: string
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  description,
  onRetry,
  isRetrying = false,
  className = ''
}) => {
  const displayMessage = message || description || 'An error occurred while loading this section.'

  return (
    <div
      role="alert"
      className={`text-center py-10 px-6 rounded-2xl border border-error/20 bg-error/5 flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <div className="p-3 rounded-full bg-error/10 text-error mb-1">
        <WarningCircle size={28} weight="fill" />
      </div>
      <h4 className="text-base font-medium text-text tracking-normal leading-snug">{title}</h4>
      <p className="text-xs font-normal text-muted max-w-md leading-relaxed">{displayMessage}</p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          isLoading={isRetrying}
          leftIcon={ArrowClockwise}
          className="mt-2"
        >
          Try Again
        </Button>
      )}
    </div>
  )
}
