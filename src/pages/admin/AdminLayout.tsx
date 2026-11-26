import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  List,
  Moon,
  Sun,
  Television
} from '@phosphor-icons/react'
import { ADMIN_NAV_TABS, AdminNav } from '../../components/admin/AdminNav'
import { BrandMark } from '../../components/layout/BrandMark'
import { Button } from '../../components/ui'
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock'
import { useAdminRealtime } from '../../hooks/useAdminRealtime'
import { useAuth } from '../../lib/AuthContext'
import { triggerConfetti } from '../../lib/data'
import { prefetchAdminTab } from '../../lib/queryCache'
import { useTheme } from '../../lib/theme'
import { STORAGE_KEYS } from '../../lib/constants'
import type { AdminTab, Season } from '../../types'

interface AdminLayoutProps {
  currentTab: AdminTab
  onSelectTab: (tab: AdminTab) => void
  activeSeason: Season | null
  seasons: Season[]
  onSwitchSeason: (seasonId: string) => void
  children: React.ReactNode
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  activeSeason,
  seasons,
  onSwitchSeason,
  children
}) => {
  const { user, logout } = useAuth()
  const { onlineAdmins } = useAdminRealtime()
  const { preference, resolvedTheme, setPreference } = useTheme()
  const navigate = useNavigate()

  // Sidebar collapse state on desktop persisted in localStorage (safe try/catch, first-paint accurate)
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(STORAGE_KEYS.ADMIN_SIDEBAR_COLLAPSED) === 'true'
    } catch {
      return false
    }
  })

  // Mobile drawer state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)

  // Floating Confetti trigger state (4s cooldown, 3s error toast)
  const [isConfettiCoolingDown, setIsConfettiCoolingDown] = useState(false)
  const [confettiError, setConfettiError] = useState<string | null>(null)
  const confettiCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confettiErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confettiCooldownTimerRef.current) {
        clearTimeout(confettiCooldownTimerRef.current)
      }
      if (confettiErrorTimerRef.current) {
        clearTimeout(confettiErrorTimerRef.current)
      }
    }
  }, [])

  const showConfettiErrorToast = (message: string) => {
    setConfettiError(message)
    if (confettiErrorTimerRef.current) {
      clearTimeout(confettiErrorTimerRef.current)
    }
    confettiErrorTimerRef.current = setTimeout(() => {
      setConfettiError(null)
      confettiErrorTimerRef.current = null
    }, 3000)
  }

  const handleTriggerConfetti = async () => {
    if (isConfettiCoolingDown) return
    if (!activeSeason?.id) {
      showConfettiErrorToast('No active season')
      return
    }

    setIsConfettiCoolingDown(true)
    setConfettiError(null)
    if (confettiErrorTimerRef.current) {
      clearTimeout(confettiErrorTimerRef.current)
      confettiErrorTimerRef.current = null
    }

    if (confettiCooldownTimerRef.current) {
      clearTimeout(confettiCooldownTimerRef.current)
    }
    confettiCooldownTimerRef.current = setTimeout(() => {
      setIsConfettiCoolingDown(false)
      confettiCooldownTimerRef.current = null
    }, 4000)

    try {
      await triggerConfetti(activeSeason.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger confetti'
      showConfettiErrorToast(msg)
    }
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.ADMIN_SIDEBAR_COLLAPSED, String(isCollapsed))
    } catch {
      // Ignore storage write errors (e.g. private browsing restrictions)
    }
  }, [isCollapsed])

  // Prevent scroll when mobile drawer is open
  useBodyScrollLock(isMobileDrawerOpen)

  const handleToggleQuickTheme = () => {
    setPreference(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="relative min-h-dvh bg-bg text-text font-sans flex flex-col md:flex-row antialiased selection:bg-accent-bright selection:text-on-accent">
      <style>{`
        @keyframes fieldrConfettiCooldownBar {
          0% {
            transform: scaleX(0);
          }
          100% {
            transform: scaleX(1);
          }
        }
        .admin-desktop-sidebar {
          background-color: var(--bg);
          background-color: color-mix(in srgb, var(--accent-bright) 2.5%, color-mix(in srgb, var(--bg) 88%, transparent));
          border-right-color: var(--border);
          border-right-color: color-mix(in srgb, var(--accent-bright) 10%, transparent);
          box-shadow: none;
        }
        @media (prefers-reduced-transparency: reduce) {
          .admin-desktop-sidebar {
            -webkit-backdrop-filter: none !important;
            backdrop-filter: none !important;
            background-color: color-mix(in srgb, var(--accent-bright) 2.5%, var(--bg)) !important;
          }
        }
      `}</style>

      {/* Desktop Frosted Sidebar (Collapsible 264px / 72px rail, persisted in localStorage) */}
      <aside
        className={`admin-desktop-sidebar hidden md:flex flex-col shrink-0 self-start sticky top-0 h-dvh backdrop-blur-[20px] backdrop-saturate-[1.35] border-r z-20 overflow-hidden ${
          isCollapsed ? 'w-[72px] px-3 py-4' : 'w-[264px] px-4 py-5'
        }`}
      >
        <AdminNav
          currentTab={currentTab}
          onSelectTab={onSelectTab}
          activeSeason={activeSeason}
          seasons={seasons}
          onSwitchSeason={onSwitchSeason}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
          preference={preference}
          resolvedTheme={resolvedTheme}
          onSetPreference={setPreference}
          onToggleQuickTheme={handleToggleQuickTheme}
          onSignOut={handleSignOut}
          userEmail={user?.email}
          onlineAdmins={onlineAdmins}
        />
      </aside>

      {/* Mobile Top Header */}
      <div className="md:hidden flex flex-col frost border-b border-border sticky top-0 z-30">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Open navigation drawer"
              className="relative hit-44 p-2 rounded-xl bg-surface-2 border border-border text-text hover:border-accent-bright transition-colors"
            >
              <List size={20} weight="bold" />
            </button>
            <Link to="/" aria-label="Fieldr Home">
              <BrandMark showWordmark={false} size="sm" />
            </Link>
          </div>

          <div className="flex items-center gap-2 pr-32">
            <button
              type="button"
              onClick={handleToggleQuickTheme}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="p-2 rounded-xl bg-surface-2 border border-border text-text hover:border-accent-bright transition-colors"
            >
              {resolvedTheme === 'dark' ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
            </button>
            <Link
              to="/projector"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Launch Projector"
              className="p-2 rounded-xl bg-surface-2 border border-border text-text hover:border-accent-bright transition-colors"
            >
              <Television size={18} className="text-accent-bright" />
            </Link>
          </div>
        </div>

        {/* Horizontal Tab Bar on Mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-3 scrollbar-none">
          {ADMIN_NAV_TABS.map((tab) => {
            const isActive = currentTab === tab.id
            const IconComponent = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                onMouseEnter={() => prefetchAdminTab(tab.id)}
                onFocus={() => prefetchAdminTab(tab.id)}
                onTouchStart={() => prefetchAdminTab(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-2 shrink-0 transition-colors ${
                  isActive
                    ? 'bg-surface-2 border border-accent-bright text-text font-semibold'
                    : 'bg-surface border border-border text-muted hover:text-text'
                }`}
              >
                <span className={isActive ? 'text-accent-bright' : 'text-muted'}>
                  <IconComponent size={18} weight="bold" />
                </span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Floating Confetti Button (Fixed top-right across all Admin pages) */}
      <div className="fixed top-4 right-4 md:top-8 md:right-8 lg:top-10 lg:right-10 z-40 flex flex-col items-end gap-2 pointer-events-none">
        <Button
          type="button"
          variant="secondary"
          size="md"
          title="Confetti"
          aria-label="Confetti"
          disabled={isConfettiCoolingDown || !activeSeason?.id}
          onClick={() => void handleTriggerConfetti()}
          className="frost pointer-events-auto relative overflow-hidden min-h-[36px] md:min-h-[40px] px-3 md:px-3.5 py-2 text-xs font-medium hover:border-accent-bright motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-accent-bright shrink-0"
          >
            <path d="M4.5 16.7a2.1 2.1 0 0 0 2.8 2.8l6-2.4a1.7 1.7 0 0 0 .55-2.75l-4.2-4.2A1.7 1.7 0 0 0 6.9 10.7l-2.4 6Z" />
            <path d="M6.6 13.7l3.7 3.7" />
            <path d="M13.8 9.2 16.2 6.8" />
            <path d="M16.4 13.2 19.4 12.2" />
            <path d="M10.8 6.6 11.8 3.6" />
            <circle cx="19" cy="5" r="1.25" fill="currentColor" stroke="none" />
            <circle cx="15.4" cy="3.8" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="20.2" cy="8.8" r="1.1" fill="currentColor" stroke="none" />
          </svg>
          <span>Confetti</span>

          {isConfettiCoolingDown && (
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-0 right-0 h-[2px] bg-border/50 pointer-events-none overflow-hidden"
            >
              <span className="block h-full w-full bg-accent-bright origin-left [animation:fieldrConfettiCooldownBar_4s_linear_forwards]" />
            </span>
          )}
        </Button>

        {confettiError && (
          <div
            role="alert"
            className="pointer-events-auto px-3 py-1.5 rounded-xl bg-menu-bg border border-error/60 text-error text-xs font-mono shadow-lg whitespace-nowrap"
          >
            {confettiError}
          </div>
        )}
      </div>

      {/* Mobile Slide-in Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-scrim"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <div className="relative w-72 max-w-[82vw] frost-strong border-r border-border h-full p-5 flex flex-col z-10 overflow-y-auto">
            <AdminNav
              currentTab={currentTab}
              onSelectTab={onSelectTab}
              activeSeason={activeSeason}
              seasons={seasons}
              onSwitchSeason={onSwitchSeason}
              onCloseMobile={() => setIsMobileDrawerOpen(false)}
              preference={preference}
              resolvedTheme={resolvedTheme}
              onSetPreference={setPreference}
              onToggleQuickTheme={handleToggleQuickTheme}
              onSignOut={handleSignOut}
              userEmail={user?.email}
              onlineAdmins={onlineAdmins}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 overflow-y-auto p-5 sm:p-8 lg:p-10 md:pr-40 lg:pr-44 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
