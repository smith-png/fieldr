import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Monitor, Moon, Sun, type Icon } from '@phosphor-icons/react'
import { useAuth } from '../../lib/AuthContext'
import { prefetchRoute } from '../../lib/queryCache'
import { type ThemePreference, useTheme } from '../../lib/theme'
import type { Season } from '../../types'
import {
  notifyPublicActiveSeasonChange,
  notifyPublicMenuOpenChange
} from './HeaderBar'

interface NavigationMenuProps {
  isOpen: boolean
  onClose: () => void
  activeSeason: Season | null
}

export const NavigationMenu: React.FC<NavigationMenuProps> = ({
  isOpen,
  onClose,
  activeSeason
}) => {
  const { user, logout } = useAuth()
  const { preference, setPreference } = useTheme()
  const navigate = useNavigate()
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const wasOpenRef = useRef<boolean>(false)
  const shouldReduceMotion = useReducedMotion()

  const dragStartYRef = useRef<number | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState<number>(0)
  const [isDragging, setIsDragging] = useState<boolean>(false)

  useEffect(() => {
    notifyPublicMenuOpenChange(isOpen)
  }, [isOpen])

  useEffect(() => {
    return () => {
      notifyPublicMenuOpenChange(false)
    }
  }, [])

  useEffect(() => {
    if (activeSeason) {
      notifyPublicActiveSeasonChange(activeSeason)
    }
  }, [activeSeason])

  const handleClose = useCallback(() => {
    setDragOffsetY(0)
    setIsDragging(false)
    dragStartYRef.current = null
    notifyPublicMenuOpenChange(false)
    onClose()
  }, [onClose])

  // Lock body scroll, move focus into sheet, trap focus, and return focus on close
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true
      setDragOffsetY(0)
      setIsDragging(false)
      dragStartYRef.current = null

      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      const focusTimer = window.setTimeout(() => {
        closeButtonRef.current?.focus()
      }, 20)

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          handleClose()
          return
        }

        if (e.key === 'Tab' && sheetRef.current) {
          const focusable = Array.from(
            sheetRef.current.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          )
          if (focusable.length === 0) return

          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          const active = document.activeElement as HTMLElement | null

          if (e.shiftKey) {
            if (!active || active === first || !sheetRef.current.contains(active)) {
              e.preventDefault()
              last.focus()
            }
          } else {
            if (!active || active === last || !sheetRef.current.contains(active)) {
              e.preventDefault()
              first.focus()
            }
          }
        }
      }

      window.addEventListener('keydown', handleKeyDown)
      return () => {
        window.clearTimeout(focusTimer)
        document.body.style.overflow = prevOverflow
        window.removeEventListener('keydown', handleKeyDown)
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      const triggerBtn = document.getElementById('public-menu-trigger-button')
      triggerBtn?.focus()
    }
  }, [isOpen, handleClose])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragStartYRef.current = e.clientY
    setIsDragging(true)
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ignore pointer capture error
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return
    const delta = Math.max(0, e.clientY - dragStartYRef.current)
    setDragOffsetY(delta)
  }

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return
    const delta = e.clientY - dragStartYRef.current
    dragStartYRef.current = null
    setIsDragging(false)
    if (delta > 80) {
      handleClose()
    } else {
      setDragOffsetY(0)
    }
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    const touch = e.touches[0]
    if (!touch) return
    dragStartYRef.current = touch.clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (dragStartYRef.current === null) return
    const touch = e.touches[0]
    if (!touch) return
    const delta = Math.max(0, touch.clientY - dragStartYRef.current)
    setDragOffsetY(delta)
  }

  const handleTouchEnd = () => {
    if (dragStartYRef.current === null) return
    const shouldDismiss = dragOffsetY > 80
    dragStartYRef.current = null
    setIsDragging(false)
    if (shouldDismiss) {
      handleClose()
    } else {
      setDragOffsetY(0)
    }
  }

  const links = [
    { title: 'Home', path: '/', visible: true },
    { title: 'Teams', path: '/teams', visible: true },
    { title: 'Auction Rules', path: '/rules', visible: true },
    { title: 'Dashboard', path: '/admin', visible: !!user },
    {
      title: 'Projector',
      path: '/projector',
      visible: user?.role === 'admin' || user?.role === 'projector'
    }
  ]

  const visibleLinks = links.filter((l) => l.visible)

  const appearanceOptions: { value: ThemePreference; label: string; icon: Icon }[] = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon }
  ]

  const handleKeyDownAppearance = (e: React.KeyboardEvent, currentIndex: number) => {
    let nextIndex = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (currentIndex + 1) % appearanceOptions.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (currentIndex - 1 + appearanceOptions.length) % appearanceOptions.length
    }

    if (nextIndex !== -1) {
      const nextOpt = appearanceOptions[nextIndex]
      setPreference(nextOpt.value)
      optionRefs.current[nextIndex]?.focus()
    }
  }

  const handleSignOut = async () => {
    await logout()
    handleClose()
    navigate('/login')
  }

  const authIndexLabel = String(visibleLinks.length + 1).padStart(2, '0')

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end items-center sm:px-4">
          {/* Full-screen dark backdrop (75% opacity, no blur) */}
          <motion.div
            aria-hidden="true"
            onClick={handleClose}
            className="fixed inset-0 bg-black/75"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.15 }
                : { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
            }
          />

          {/* Centered Bottom Sheet */}
          <motion.div
            id="public-navigation-sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-navigation-sheet-title"
            className="relative z-10 w-full max-w-[36rem] bg-surface border border-border rounded-t-[24px] sm:rounded-[24px] sm:mb-6 p-6 text-text max-h-[88svh] overflow-y-auto focus:outline-none"
            initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%' }}
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { y: dragOffsetY > 0 ? dragOffsetY : '0%' }
            }
            exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%' }}
            transition={
              isDragging
                ? { duration: 0 }
                : shouldReduceMotion
                ? { duration: 0.15 }
                : { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
            }
          >
            {/* Swipeable Handle Area & Sheet Header Row */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="touch-none select-none cursor-grab active:cursor-grabbing -mt-2 pt-2"
            >
              <div
                aria-hidden="true"
                className="w-10 h-1 rounded-full bg-border mx-auto mb-4"
              />

              <div className="flex items-center justify-between gap-4 pb-3.5 border-b border-border/60">
                <span
                  id="public-navigation-sheet-title"
                  className="font-sans text-[11px] font-medium uppercase tracking-[0.2em] text-muted"
                >
                  NAVIGATION
                </span>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={handleClose}
                  aria-label="Close menu"
                  className="inline-flex items-center justify-center h-8 px-3.5 rounded-full bg-surface-2 hover:bg-border/40 border border-border font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Vertical Menu Items List separated by 1px hairlines */}
            <nav aria-label="Site navigation" className="divide-y divide-border/60">
              {visibleLinks.map((link, idx) => {
                const indexLabel = String(idx + 1).padStart(2, '0')
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={handleClose}
                    onMouseEnter={() => prefetchRoute(link.path)}
                    onFocus={() => prefetchRoute(link.path)}
                    onTouchStart={() => prefetchRoute(link.path)}
                    className="group flex items-center justify-between gap-4 py-3.5 text-text hover:text-accent-bright transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-lg"
                  >
                    <span className="font-syne font-bold text-[20px] leading-snug tracking-tight">
                      {link.title}
                    </span>
                    <span className="font-mono text-xs text-muted group-hover:text-accent-bright tabular-nums shrink-0 transition-colors">
                      {indexLabel}
                    </span>
                  </Link>
                )
              })}

              {user ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="group w-full flex items-center justify-between gap-4 py-3.5 text-left text-text hover:text-error transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-lg"
                >
                  <span className="font-syne font-bold text-[20px] leading-snug tracking-tight">
                    Sign out
                  </span>
                  <span className="font-mono text-xs text-muted group-hover:text-error tabular-nums shrink-0 transition-colors">
                    {authIndexLabel}
                  </span>
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={handleClose}
                  onMouseEnter={() => prefetchRoute('/login')}
                  onFocus={() => prefetchRoute('/login')}
                  onTouchStart={() => prefetchRoute('/login')}
                  className="group flex items-center justify-between gap-4 py-3.5 text-text hover:text-accent-bright transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright rounded-lg"
                >
                  <span className="font-syne font-bold text-[20px] leading-snug tracking-tight">
                    Sign in
                  </span>
                  <span className="font-mono text-xs text-muted group-hover:text-accent-bright tabular-nums shrink-0 transition-colors">
                    {authIndexLabel}
                  </span>
                </Link>
              )}
            </nav>

            {/* Appearance Selector */}
            <div className="pt-4 mt-1 border-t border-border/60 flex items-center justify-between gap-3">
              <span
                id="appearance-label"
                className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-muted"
              >
                Appearance
              </span>
              <div
                role="radiogroup"
                aria-labelledby="appearance-label"
                className="inline-flex items-center p-1 bg-surface-2 border border-border rounded-full gap-1"
              >
                {appearanceOptions.map((opt, idx) => {
                  const IconComponent = opt.icon
                  const isSelected = preference === opt.value
                  return (
                    <button
                      key={opt.value}
                      ref={(el) => {
                        optionRefs.current[idx] = el
                      }}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => setPreference(opt.value)}
                      onKeyDown={(e) => handleKeyDownAppearance(e, idx)}
                      className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-[11px] font-sans transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
                        isSelected
                          ? 'bg-surface text-text font-medium border border-border'
                          : 'text-muted font-normal hover:text-text border border-transparent'
                      }`}
                    >
                      <IconComponent size={13} weight="regular" />
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}


