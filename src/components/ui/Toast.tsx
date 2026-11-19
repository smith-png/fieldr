import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useTheme } from '../../lib/theme'

export type ToastType = 'success' | 'error' | 'info'

export const AppToaster: React.FC = () => {
  const { pathname } = useLocation()
  const { resolvedTheme } = useTheme()
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 639px)').matches
      : false
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const mq = window.matchMedia('(max-width: 639px)')
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (pathname === '/projector' || pathname.startsWith('/projector/')) {
    return null
  }

  return (
    <Toaster
      theme={resolvedTheme}
      position={isMobile ? 'bottom-center' : 'bottom-right'}
      visibleToasts={3}
      duration={3500}
      closeButton
      richColors={false}
      swipeDirections={['bottom', 'right', 'left']}
      offset={{
        bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        right: '1.5rem'
      }}
      mobileOffset={{
        bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        left: '1rem',
        right: '1rem'
      }}
      toastOptions={{
        classNames: {
          toast:
            '!bg-surface !text-text !border !border-border !border-l-[3px] !border-l-accent !rounded-xl !shadow-xl !font-sans !text-xs !px-4 !py-3 !pr-9 !gap-3 motion-reduce:!transition-[opacity] motion-reduce:!duration-150 motion-reduce:[&[data-front=true]]:![transform:translateY(0)]',
          title: '!font-sans !font-medium !text-xs !text-text !leading-snug',
          description: '!font-sans !font-normal !text-xs !text-muted',
          success: '!border-l-accent-bright [&_[data-icon]]:!text-accent-bright',
          error: '!border-l-error [&_[data-icon]]:!text-error',
          info: '!border-l-accent [&_[data-icon]]:!text-accent',
          closeButton:
            '!left-auto !right-2.5 !top-1/2 !-translate-y-1/2 !transform !w-5 !h-5 !rounded-md !bg-transparent hover:!bg-surface-2 !border-0 !text-muted hover:!text-text !transition-colors'
        }
      }}
    />
  )
}

