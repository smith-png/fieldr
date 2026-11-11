import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Calendar,
  CaretLeft,
  CaretRight,
  ChartPieSlice,
  Coins,
  Gear,
  House,
  IdentificationBadge,
  List,
  Monitor,
  Moon,
  ProjectorScreen,
  ShieldCheck,
  SignOut,
  Sun,
  Television,
  Users,
  X,
  type Icon
} from '@phosphor-icons/react'
import { BrandMark } from '../../components/layout/BrandMark'
import { useAuth } from '../../lib/AuthContext'
import { type ThemePreference, useTheme } from '../../lib/theme'
import type { AdminTab, Season } from '../../types'

export type { AdminTab }

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
  const { user, isDemo, logout } = useAuth()
  const { preference, resolvedTheme, setPreference } = useTheme()
  const navigate = useNavigate()

  // Sidebar collapse state on desktop persisted in localStorage
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('fieldr_admin_sidebar_collapsed') === 'true'
  })

  // Mobile drawer state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('fieldr_admin_sidebar_collapsed', String(isCollapsed))
  }, [isCollapsed])

  // Prevent scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isMobileDrawerOpen])

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <ChartPieSlice size={18} weight="bold" /> },
    { id: 'athletes', label: 'Athletes', icon: <IdentificationBadge size={18} weight="bold" /> },
    { id: 'players', label: 'Players', icon: <Users size={18} weight="bold" /> },
    { id: 'teams', label: 'Teams', icon: <ShieldCheck size={18} weight="bold" /> },
    { id: 'purses', label: 'Purses', icon: <Coins size={18} weight="bold" /> },
    { id: 'seasons', label: 'Seasons', icon: <Calendar size={18} weight="bold" /> },
    { id: 'projector', label: 'Projector', icon: <ProjectorScreen size={18} weight="bold" /> },
    { id: 'setup', label: 'Setup', icon: <Gear size={18} weight="bold" /> }
  ]

  const appearanceOptions: { value: ThemePreference; label: string; icon: Icon }[] = [
    { value: 'system', label: 'System', icon: Monitor },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon }
  ]

  const handleToggleQuickTheme = () => {
    setPreference(resolvedTheme === 'dark' ? 'light' : 'dark')
  }

  const handleSignOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans flex flex-col md:flex-row antialiased selection:bg-accent-bright selection:text-on-accent">
      {/* Desktop Sidebar (Collapsible, persisted in localStorage) */}
      <aside
        className={`hidden md:flex flex-col justify-between bg-surface border-r border-border shrink-0 transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20 p-3' : 'w-64 lg:w-72 p-5'
        }`}
      >
        <div className="flex flex-col gap-5">
          {/* Header Lockup & Toggle */}
          <div className="pb-4 border-b border-border flex items-center justify-between">
            {!isCollapsed ? (
              <>
                <Link to="/" aria-label="Fieldr Home">
                  <BrandMark showWordmark={true} />
                </Link>
                <div className="flex items-center gap-1.5">
                  <Link
                    to="/"
                    title="Return to Home"
                    aria-label="Return to Home"
                    className="p-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  >
                    <House size={16} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsCollapsed(true)}
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                    className="p-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                  >
                    <CaretLeft size={16} weight="bold" />
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full flex flex-col items-center gap-3">
                <Link to="/" aria-label="Fieldr Home">
                  <BrandMark showWordmark={false} />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsCollapsed(false)}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                  className="p-2 rounded-xl border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                >
                  <CaretRight size={16} weight="bold" />
                </button>
              </div>
            )}
          </div>

          {/* Active Tournament Selector (only when expanded) */}
          {!isCollapsed && (
            <div className="p-3.5 rounded-xl bg-surface-2 border border-border flex flex-col gap-2">
              <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted">
                <span>Tournament</span>
                {isDemo && (
                  <span className="font-mono text-[10px] text-muted">
                    Demo mode
                  </span>
                )}
              </div>
              <select
                value={activeSeason?.id || ''}
                onChange={(e) => onSwitchSeason(e.target.value)}
                aria-label="Select Active Season"
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-xs font-semibold text-text focus:outline-none focus:border-accent-bright"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.is_active ? '(Active)' : s.is_archived ? '[Archived]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1" aria-label="Admin Navigation">
            {tabs.map((tab) => {
              const isActive = currentTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  title={isCollapsed ? tab.label : undefined}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium flex items-center transition-colors ${
                    isCollapsed ? 'justify-center' : 'gap-3'
                  } ${
                    isActive
                      ? 'bg-surface-2 border border-border text-text font-semibold shadow-sm'
                      : 'text-muted hover:text-text hover:bg-surface-2/60 border border-transparent'
                  }`}
                >
                  <span className={isActive ? 'text-accent-bright' : 'text-muted'}>
                    {tab.icon}
                  </span>
                  {!isCollapsed && <span>{tab.label}</span>}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Footer Actions: Projector, Theme Toggle (above Sign out), Sign out */}
        <div className="pt-4 border-t border-border flex flex-col gap-2.5">
          <Link
            to="/projector"
            target="_blank"
            rel="noopener noreferrer"
            title={isCollapsed ? 'Launch Projector' : undefined}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs font-medium text-text hover:border-accent-bright transition-colors flex items-center ${
              isCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Television size={18} className="text-accent-bright" />
              {!isCollapsed && <span>Launch Projector</span>}
            </div>
            {!isCollapsed && (
              <span className="text-[10px] uppercase font-mono text-muted">Stage</span>
            )}
          </Link>

          {/* Theme Toggle above Sign out */}
          {!isCollapsed ? (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted px-1">
                Appearance
              </span>
              <div
                role="radiogroup"
                aria-label="Appearance"
                className="grid grid-cols-3 p-1 bg-surface-2 border border-border rounded-xl gap-1"
              >
                {appearanceOptions.map((opt) => {
                  const IconComponent = opt.icon
                  const isSelected = preference === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setPreference(opt.value)}
                      className={`min-h-[34px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-mono transition-colors ${
                        isSelected
                          ? 'bg-surface text-text font-bold border border-border shadow-sm'
                          : 'text-muted hover:text-text border border-transparent'
                      }`}
                    >
                      <IconComponent size={13} weight={isSelected ? 'bold' : 'regular'} />
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleToggleQuickTheme}
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="min-h-[42px] px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-muted hover:text-text transition-colors flex items-center justify-center"
            >
              {resolvedTheme === 'dark' ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
            </button>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            title={isCollapsed ? `Sign out (${user?.email})` : undefined}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium text-muted hover:text-error hover:bg-error/10 transition-colors flex items-center ${
              isCollapsed ? 'justify-center' : 'gap-2.5'
            }`}
          >
            <SignOut size={18} />
            {!isCollapsed && <span className="truncate">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <div className="md:hidden flex flex-col bg-surface border-b border-border sticky top-0 z-30">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Open navigation drawer"
              className="p-2 rounded-xl bg-surface-2 border border-border text-text hover:border-accent-bright transition-colors"
            >
              <List size={20} weight="bold" />
            </button>
            <Link to="/" aria-label="Fieldr Home">
              <BrandMark showWordmark={false} size="sm" />
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {isDemo && (
              <span className="text-muted font-mono text-[10px]">
                Demo
              </span>
            )}
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
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-2 shrink-0 transition-colors ${
                  isActive
                    ? 'bg-surface-2 border border-accent-bright text-text font-semibold'
                    : 'bg-surface border border-border text-muted hover:text-text'
                }`}
              >
                <span className={isActive ? 'text-accent-bright' : 'text-muted'}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Mobile Slide-in Drawer */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-scrim"
            onClick={() => setIsMobileDrawerOpen(false)}
          />
          <div className="relative w-72 max-w-[82vw] bg-surface border-r border-border h-full p-6 flex flex-col justify-between z-10 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border mb-5">
                <BrandMark showWordmark={true} />
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  aria-label="Close drawer"
                  className="p-2 rounded-xl border border-border text-muted hover:text-text"
                >
                  <X size={18} weight="bold" />
                </button>
              </div>

              <div className="mb-5 p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted block mb-1.5">
                  Active Season
                </span>
                <select
                  value={activeSeason?.id || ''}
                  onChange={(e) => onSwitchSeason(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-xs font-semibold text-text focus:outline-none focus:border-accent-bright"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.is_active ? '(Active)' : s.is_archived ? '[Archived]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <nav className="flex flex-col gap-1">
                {tabs.map((tab) => {
                  const isActive = currentTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        onSelectTab(tab.id)
                        setIsMobileDrawerOpen(false)
                      }}
                      className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-3 ${
                        isActive
                          ? 'bg-surface-2 border border-border text-text font-semibold'
                          : 'text-muted hover:text-text border border-transparent'
                      }`}
                    >
                      <span className={isActive ? 'text-accent-bright' : 'text-muted'}>
                        {tab.icon}
                      </span>
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-border flex flex-col gap-3">
              {/* Theme Toggle above Sign out */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted block mb-1.5">
                  Appearance
                </span>
                <div
                  role="radiogroup"
                  aria-label="Appearance"
                  className="grid grid-cols-3 p-1 bg-surface-2 border border-border rounded-xl gap-1"
                >
                  {appearanceOptions.map((opt) => {
                    const IconComponent = opt.icon
                    const isSelected = preference === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setPreference(opt.value)}
                        className={`min-h-[34px] px-2 py-1.5 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-mono transition-colors ${
                          isSelected
                            ? 'bg-surface text-text font-bold border border-border shadow-sm'
                            : 'text-muted hover:text-text border border-transparent'
                        }`}
                      >
                        <IconComponent size={13} weight={isSelected ? 'bold' : 'regular'} />
                        <span>{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <Link
                to="/"
                className="text-xs text-muted hover:text-text flex items-center gap-2 py-1.5"
              >
                <House size={16} />
                <span>Return to Home</span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs text-muted hover:text-error flex items-center gap-2 py-1.5"
              >
                <SignOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-5 sm:p-8 lg:p-10 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
