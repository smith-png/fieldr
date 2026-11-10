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
  List,
  ProjectorScreen,
  ShieldCheck,
  SignOut,
  Television,
  Users,
  X
} from '@phosphor-icons/react'
import { BrandMark } from '../../components/BrandMark'
import { useAuth } from '../../lib/AuthContext'
import type { Season } from '../../lib/types'

export type AdminTab =
  | 'dashboard'
  | 'seasons'
  | 'teams'
  | 'players'
  | 'purses'
  | 'projector'
  | 'setup'

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
    { id: 'dashboard', label: 'Dashboard', icon: <ChartPieSlice size={20} weight="bold" /> },
    { id: 'players', label: 'Players', icon: <Users size={20} weight="bold" /> },
    { id: 'teams', label: 'Teams', icon: <ShieldCheck size={20} weight="bold" /> },
    { id: 'purses', label: 'Purses', icon: <Coins size={20} weight="bold" /> },
    { id: 'seasons', label: 'Seasons', icon: <Calendar size={20} weight="bold" /> },
    { id: 'projector', label: 'Projector', icon: <ProjectorScreen size={20} weight="bold" /> },
    { id: 'setup', label: 'Setup', icon: <Gear size={20} weight="bold" /> }
  ]

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
        <div className="flex flex-col gap-6">
          {/* Header Lockup & Toggle */}
          <div className="pb-4 border-b border-border flex items-center justify-between">
            {!isCollapsed ? (
              <>
                <BrandMark showWordmark={true} />
                <div className="flex items-center gap-1.5">
                  <Link
                    to="/"
                    title="Return to Home"
                    aria-label="Return to Home"
                    className="p-2 rounded-xl border border-border text-muted hover:text-text hover:border-accent-bright transition-colors"
                  >
                    <House size={16} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsCollapsed(true)}
                    title="Collapse sidebar"
                    aria-label="Collapse sidebar"
                    className="p-2 rounded-xl border border-border text-muted hover:text-text hover:border-accent-bright transition-colors"
                  >
                    <CaretLeft size={16} weight="bold" />
                  </button>
                </div>
              </>
            ) : (
              <div className="w-full flex flex-col items-center gap-3">
                <BrandMark showWordmark={false} />
                <button
                  type="button"
                  onClick={() => setIsCollapsed(false)}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                  className="p-2 rounded-xl border border-border text-muted hover:text-text hover:border-accent-bright transition-colors"
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
                  <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-text font-mono text-[9px]">
                    Demo mode
                  </span>
                )}
              </div>
              <select
                value={activeSeason?.id || ''}
                onChange={(e) => onSwitchSeason(e.target.value)}
                aria-label="Select Active Season"
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs font-semibold text-text focus:outline-none focus:border-accent-bright"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.is_active ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5" aria-label="Admin Navigation">
            {tabs.map((tab) => {
              const isActive = currentTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  title={isCollapsed ? tab.label : undefined}
                  className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center transition-colors ${
                    isCollapsed ? 'justify-center' : 'gap-3'
                  } ${
                    isActive
                      ? 'bg-accent/15 border border-accent-bright text-text font-semibold'
                      : 'text-muted hover:text-text hover:bg-surface-2 border border-transparent'
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

        {/* Footer Actions */}
        <div className="pt-4 border-t border-border flex flex-col gap-2">
          <Link
            to="/projector"
            target="_blank"
            rel="noopener noreferrer"
            title={isCollapsed ? 'Launch Projector' : undefined}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs font-medium text-text hover:text-accent-bright hover:border-accent-bright transition-colors flex items-center ${
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

          <button
            type="button"
            onClick={handleSignOut}
            title={isCollapsed ? `Sign out (${user?.email})` : undefined}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-muted hover:text-error hover:bg-error/10 transition-colors flex items-center ${
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
              className="p-2 rounded-xl bg-surface-2 border border-border text-text"
            >
              <List size={20} weight="bold" />
            </button>
            <BrandMark showWordmark={false} />
          </div>

          <div className="flex items-center gap-2">
            {isDemo && (
              <span className="px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted font-mono text-[10px]">
                Demo mode
              </span>
            )}
            <Link
              to="/projector"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Launch Projector"
              className="p-2 rounded-xl bg-surface-2 border border-border text-text"
            >
              <Television size={18} className="text-accent-bright" />
            </Link>
          </div>
        </div>

        {/* Horizontal Tab Bar on Mobile */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 pb-3 scrollbar-none">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-2 shrink-0 ${
                  isActive
                    ? 'bg-accent/15 border border-accent-bright text-text font-semibold'
                    : 'bg-surface-2 border border-border text-muted'
                }`}
              >
                <span>{tab.icon}</span>
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
          <div className="relative w-72 max-w-[80vw] bg-surface border-r border-border h-full p-6 flex flex-col justify-between z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-border mb-6">
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

              <div className="mb-6 p-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted block mb-1">
                  Active Season
                </span>
                <select
                  value={activeSeason?.id || ''}
                  onChange={(e) => onSwitchSeason(e.target.value)}
                  className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text"
                >
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <nav className="flex flex-col gap-1.5">
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
                      className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-3 ${
                        isActive
                          ? 'bg-accent/15 border border-accent-bright text-text font-semibold'
                          : 'text-muted hover:text-text'
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

            <div className="pt-4 border-t border-border flex flex-col gap-2">
              <Link
                to="/"
                className="text-xs text-muted hover:text-text flex items-center gap-2 py-2"
              >
                <House size={16} />
                <span>Return to Home</span>
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="text-xs text-muted hover:text-error flex items-center gap-2 py-2"
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
