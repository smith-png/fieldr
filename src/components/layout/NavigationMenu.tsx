import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { DownloadSimple, Monitor, Moon, Sun, type Icon } from '@phosphor-icons/react'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useAuth } from '../../lib/AuthContext'
import { triggerPwaInstall, usePwaInstall } from '../../lib/pwaInstall'
import { prefetchRoute } from '../../lib/queryCache'
import { type ThemePreference, useTheme } from '../../lib/theme'
import { Dialog } from '../ui/Dialog'
import type { Season } from '../../types'

interface NavigationMenuProps {
  isOpen: boolean
  onClose: () => void
  activeSeason: Season | null
}

export const NavigationMenu: React.FC<NavigationMenuProps> = ({
  isOpen,
  onClose
}) => {
  const { user, isLoading, logout } = useAuth()
  const { preference, setPreference } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const sheetRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const wasOpenRef = useRef<boolean>(false)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const initialPathnameRef = useRef(location.pathname)
  const shouldReduceMotion = useReducedMotion()

  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  )

  const dragStartYRef = useRef<number | null>(null)
  const [dragOffsetY, setDragOffsetY] = useState<number>(0)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const { canPromptInstall, isInstalled, isIOSSafari } = usePwaInstall()
  const [isIOSInstallOpen, setIsIOSInstallOpen] = useState<boolean>(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches)
      setDragOffsetY(0)
      setIsDragging(false)
      dragStartYRef.current = null
    }
    setIsDesktop(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleMediaChange)
    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange)
    }
  }, [])

  const handleClose = useCallback(() => {
    setDragOffsetY(0)
    setIsDragging(false)
    dragStartYRef.current = null
    onCloseRef.current()
  }, [])

  // Close menu if route changes while open
  useEffect(() => {
    if (location.pathname !== initialPathnameRef.current) {
      initialPathnameRef.current = location.pathname
      if (isOpen) {
        handleClose()
      }
    }
  }, [location.pathname, isOpen, handleClose])

  useBodyScrollLock(isOpen)

  // Move focus into sheet, trap focus, handle Escape, and return focus on close
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true
      previousFocusRef.current = document.activeElement as HTMLElement | null
      setDragOffsetY(0)
      setIsDragging(false)
      dragStartYRef.current = null

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
        window.removeEventListener('keydown', handleKeyDown)
      }
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false
      const prev = previousFocusRef.current
      previousFocusRef.current = null
      if (prev && prev.isConnected) {
        prev.focus()
      }
    }
  }, [isOpen, handleClose])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDesktop) return
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
    if (isDesktop || dragStartYRef.current === null) return
    const delta = Math.max(0, e.clientY - dragStartYRef.current)
    setDragOffsetY(delta)
  }

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDesktop || dragStartYRef.current === null) return
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
    if (isDesktop) return
    if ((e.target as HTMLElement).closest('button')) return
    const touch = e.touches[0]
    if (!touch) return
    dragStartYRef.current = touch.clientY
    setIsDragging(true)
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isDesktop || dragStartYRef.current === null) return
    const touch = e.touches[0]
    if (!touch) return
    const delta = Math.max(0, touch.clientY - dragStartYRef.current)
    setDragOffsetY(delta)
  }

  const handleTouchEnd = () => {
    if (isDesktop || dragStartYRef.current === null) return
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
    { title: 'Results', path: '/results', visible: true },
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

  const isExcludedInstallRoute =
    location.pathname === '/projector' ||
    location.pathname.startsWith('/projector/') ||
    location.pathname === '/admin' ||
    location.pathname.startsWith('/admin/')

  const showInstallItem =
    !isExcludedInstallRoute && !isInstalled && (canPromptInstall || isIOSSafari)

  const handleInstallClick = async () => {
    if (canPromptInstall) {
      await triggerPwaInstall()
      handleClose()
      return
    }
    if (isIOSSafari) {
      handleClose()
      setIsIOSInstallOpen(true)
    }
  }

  const panelInitial = shouldReduceMotion
    ? { opacity: 0 }
    : isDesktop
    ? { x: '-100%', y: '0%' }
    : { x: '0%', y: '100%' }

  const panelAnimate = shouldReduceMotion
    ? { opacity: 1 }
    : isDesktop
    ? { x: '0%', y: '0%' }
    : { x: '0%', y: dragOffsetY > 0 ? dragOffsetY : '0%' }

  const panelExit = shouldReduceMotion
    ? { opacity: 0 }
    : isDesktop
    ? { x: '-100%', y: '0%' }
    : { x: '0%', y: '100%' }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
        <motion.div
          key="public-navigation-overlay"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
          transition={
            shouldReduceMotion
              ? { duration: 0.15 }
              : { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
          }
          className="fixed inset-0 z-50 flex flex-col justify-end items-center sm:px-4 lg:flex-row lg:justify-start lg:items-stretch lg:px-0"
        >
          {/* Lighter dimmed backdrop so the frosted surface blur stays visible */}
          <motion.div
            aria-hidden="true"
            onClick={handleClose}
            className="fixed inset-0 bg-black/25 dark:bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0.15 }
                : { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
            }
          />

          {/* Mobile Bottom Sheet / Desktop Left Full-Height Panel (380px) */}
          <motion.div
            id="public-navigation-sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-navigation-sheet-title"
            className="frost relative z-10 flex flex-col w-full max-w-[36rem] lg:w-[380px] lg:max-w-[380px] lg:h-full border border-border/60 lg:border-y-0 lg:border-l-0 lg:border-r lg:border-border/60 rounded-t-[24px] sm:rounded-[24px] sm:mb-6 lg:rounded-none lg:rounded-r-[24px] lg:mb-0 p-6 lg:p-7 text-text max-h-[88svh] lg:max-h-none overflow-y-auto focus:outline-none"
              initial={panelInitial}
              animate={panelAnimate}
              exit={panelExit}
              transition={
                isDragging
                  ? { duration: 0 }
                  : shouldReduceMotion
                  ? { duration: 0.15 }
                  : { duration: 0.38, ease: [0.22, 1, 0.36, 1] }
              }
            >
            {/* Swipeable Handle Area (mobile) & Header Row */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="touch-none select-none cursor-grab active:cursor-grabbing lg:cursor-default -mt-2 pt-2 lg:mt-0 lg:pt-0"
            >
              <div
                aria-hidden="true"
                className="w-10 h-1 rounded-full bg-text/20 mx-auto mb-4 lg:hidden"
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
                  className="inline-flex items-center justify-center h-8 px-3.5 rounded-full bg-surface/70 hover:bg-surface-2 border border-border/80 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Vertical Page Links separated by subtle hairlines (~9% text color) */}
            <nav aria-label="Site navigation" className="divide-y divide-text/[0.09] mt-1">
              {visibleLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={handleClose}
                  onMouseEnter={() => prefetchRoute(link.path)}
                  onFocus={() => prefetchRoute(link.path)}
                  onTouchStart={() => prefetchRoute(link.path)}
                  className="group flex items-center py-3.5 text-text hover:text-accent-bright transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright focus-visible:rounded-lg"
                >
                  <span className="font-syne font-bold text-[20px] leading-snug tracking-tight">
                    {link.title}
                  </span>
                </Link>
              ))}
            </nav>

            {/* Separate Sign in / Sign out Rounded Pill Button */}
            {!isLoading && (
              <div className="pt-5 pb-2">
                {user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full inline-flex items-center justify-center h-11 px-5 rounded-full bg-surface/70 hover:bg-error/10 border border-border/80 hover:border-error/40 font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-text hover:text-error transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                  >
                    Sign out
                  </button>
                ) : (
                  <Link
                    to="/login"
                    onClick={handleClose}
                    onMouseEnter={() => prefetchRoute('/login')}
                    onFocus={() => prefetchRoute('/login')}
                    onTouchStart={() => prefetchRoute('/login')}
                    className="w-full inline-flex items-center justify-center h-11 px-5 rounded-full bg-btn-bg text-btn-fg hover:opacity-90 font-sans text-[11px] font-medium uppercase tracking-[0.18em] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            )}

            {/* Optional Install App Item (public pages only, supported browsers & iOS Safari) */}
            {showInstallItem && (
              <div className="pt-1 pb-2">
                <button
                  type="button"
                  onClick={() => void handleInstallClick()}
                  className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full bg-surface/70 hover:bg-surface-2 border border-border/80 font-sans text-xs font-medium text-muted hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
                >
                  <DownloadSimple size={15} weight="regular" />
                  <span>Install app</span>
                </button>
              </div>
            )}

            {/* Appearance Selector */}
            <div className="pt-4 mt-3 lg:mt-auto border-t border-text/[0.09] flex items-center justify-between gap-3">
              <span
                id="appearance-label"
                className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-muted"
              >
                Appearance
              </span>
              <div
                role="radiogroup"
                aria-labelledby="appearance-label"
                className="inline-flex items-center p-1 bg-surface-2/80 border border-border/80 rounded-full gap-1"
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
                          ? 'bg-surface text-text font-medium border border-border/80'
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
        </motion.div>
      )}
    </AnimatePresence>

    <Dialog
      isOpen={isIOSInstallOpen}
      onClose={() => setIsIOSInstallOpen(false)}
      title="Install Fieldr"
      maxWidth="sm"
      frosted={true}
    >
      <p className="text-sm text-muted leading-relaxed">
        Tap <span className="font-medium text-text">Share</span>, then tap{' '}
        <span className="font-medium text-text">Add to Home Screen</span>.
      </p>
      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={() => setIsIOSInstallOpen(false)}
          className="inline-flex items-center justify-center h-9 px-4 rounded-full bg-surface-2 hover:opacity-85 border border-border text-xs font-medium text-text transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright"
        >
          Done
        </button>
      </div>
    </Dialog>
    </>
  )
}


