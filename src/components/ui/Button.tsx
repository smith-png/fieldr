import React, { forwardRef } from 'react'
import { Spinner } from './Spinner'
import type { Icon } from '@phosphor-icons/react'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
  leftIcon?: Icon
  rightIcon?: Icon
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-btn-bg text-btn-fg hover:opacity-90 active:scale-[0.98] font-medium tracking-normal leading-normal shadow-sm',
  secondary:
    'bg-surface-2 text-text hover:bg-surface border border-border active:scale-[0.98] font-normal tracking-normal leading-normal',
  outline:
    'bg-transparent text-text border border-border hover:bg-surface-2 active:scale-[0.98] font-normal tracking-normal leading-normal',
  ghost:
    'bg-transparent text-muted hover:text-text hover:bg-surface-2 active:scale-[0.98] font-normal tracking-normal leading-normal',
  danger:
    'bg-error text-white hover:opacity-90 active:scale-[0.98] font-normal tracking-normal leading-normal shadow-sm'
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'text-xs px-3 py-1.5 rounded-lg gap-1.5 min-h-[32px]',
  md: 'text-sm px-4 py-2 rounded-xl gap-2 min-h-[40px]',
  lg: 'text-base px-5 py-2.5 rounded-xl gap-2.5 min-h-[48px]',
  icon: 'p-2 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading
    const iconWeight = variant === 'primary' ? 'bold' : 'regular'

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center font-sans transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright disabled:opacity-40 disabled:pointer-events-none disabled:active:scale-100 ${
          variantStyles[variant]
        } ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Spinner size={size === 'sm' ? 'sm' : 'md'} />
        ) : (
          LeftIcon && <LeftIcon size={size === 'sm' ? 14 : 18} weight={iconWeight} />
        )}
        {children}
        {!isLoading && RightIcon && (
          <RightIcon size={size === 'sm' ? 14 : 18} weight={iconWeight} />
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
