import React, { createContext, useContext } from 'react'
import { toast as sonnerToast } from 'sonner'
import type { ToastType } from '../components/ui/Toast'

interface ToastContextType {
  toast: (text: string, type?: ToastType) => void
  showToast: (text: string, type?: ToastType) => void
  success: (text: string) => void
  error: (text: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

function dispatchToast(text: string, type: ToastType = 'info') {
  if (
    typeof window !== 'undefined' &&
    (window.location.pathname === '/projector' ||
      window.location.pathname.startsWith('/projector/'))
  ) {
    return
  }

  if (type === 'success') {
    sonnerToast.success(text, { duration: 3500 })
  } else if (type === 'error') {
    sonnerToast.error(text, { duration: 5000 })
  } else {
    sonnerToast.info(text, { duration: 3500 })
  }
}

const contextValue: ToastContextType = {
  toast: dispatchToast,
  showToast: dispatchToast,
  success: (text: string) => dispatchToast(text, 'success'),
  error: (text: string) => dispatchToast(text, 'error')
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <ToastContext.Provider value={contextValue}>{children}</ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

