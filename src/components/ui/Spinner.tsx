import React from 'react'
import { CircleNotch } from '@phosphor-icons/react'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
  ariaLabel?: string
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  className = '',
  ariaLabel = 'Loading'
}) => {
  const pixelSize = size === 'sm' ? 14 : size === 'lg' ? 24 : 18

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center text-current animate-spin ${className}`}
    >
      <CircleNotch size={pixelSize} weight="bold" />
      <span className="sr-only">{ariaLabel}</span>
    </span>
  )
}
