import React from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar,
  CaretDown,
  CaretLeft,
  CaretRight,
  ChartPieSlice,
  ClockCounterClockwise,
  Gavel,
  Gear,
  House,
  IdentificationBadge,
  Monitor,
  Moon,
  ProjectorScreen,
  ShieldCheck,
  SignOut,
  Sun,
  Television,
  X,
  type Icon
} from '@phosphor-icons/react'
import { BrandMark } from '../layout/BrandMark'
import { prefetchAdminTab, prefetchRoute } from '../../lib/queryCache'
import type { ThemePreference } from '../../lib/theme'
import type { AdminTab, Season } from '../../types'

export interface AdminNavItem {
  id: AdminTab
  label: string
  icon: Icon
}

export interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

export const ADMIN_DASHBOARD_ITEM: AdminNavItem = {
  id: 'dashboard',
  label: 'Dashboard',
  icon: ChartPieSlice
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'LIVE',
    items: [
      { id: 'auction', label: 'Auction', icon: Gavel },
      { id: 'projector', label: 'Projector', icon: ProjectorScreen }
    ]
  },
  {
    label: 'DATA',
    items: [
      { id: 'athletes', label: 'Athletes', icon: IdentificationBadge },
      { id: 'teams', label: 'Teams', icon: ShieldCheck },
      { id: 'seasons', label: 'Seasons', icon: Calendar }
    ]
  },
  {
    label: 'SYSTEM',
    items: [
      { id: 'logs', label: 'Logs', icon: ClockCounterClockwise },
      { id: 'setup', label: 'Setup', icon: Gear }
    ]
  }
]

export const ADMIN_NAV_TABS: AdminNavItem[] = [
  ADMIN_DASHBOARD_ITEM,
  ...ADMIN_NAV_GROUPS.flatMap((group) => group.items)
]

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string; icon: Icon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon }
]

export interface AdminNavProps {
  currentTab: AdminTab
  onSelectTab: (tab: AdminTab) => void
  activeSeason: Season | null
  seasons: Season[]
  onSwitchSeason: (seasonId: string) => void
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  onCloseMobile?: () => void
  preference: ThemePreference
  resolvedTheme: 'light' | 'dark'
  onSetPreference: (preference: ThemePreference) => void
  onToggleQuickTheme: () => void
  onSignOut: () => void
  userEmail?: string
}

export const AdminNav: React.FC<AdminNavProps> = ({
  currentTab,
  onSelectTab,
  activeSeason,
  seasons,
  onSwitchSeason,
  isCollapsed = false,
  onToggleCollapse,
  onCloseMobile,
  preference,
  resolvedTheme,
  onSetPreference,
  onToggleQuickTheme,
  onSignOut,
  userEmail
}) => {
  const collapsed = isCollapsed && !onCloseMobile

  const renderNavItem = (item: AdminNavItem) => {
    const isActive = currentTab === item.id
    const IconComponent = item.icon

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onSelectTab(item.id)
          onCloseMobile?.()
        }}
        onMouseEnter={() => prefetchAdminTab(item.id)}
        onFocus={() => prefetchAdminTab(item.id)}
        onTouchStart={() => prefetchAdminTab(item.id)}
        title={item.label}
        aria-label={collapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={`h-10 rounded-xl text-xs font-medium flex items-center shrink-0 transition-[transform,opacity] duration-150 ${
          collapsed ? 'w-10 mx-auto justify-center px-0' : 'w-full gap-3 px-3'
        } ${
          isActive
            ? 'bg-accent/15 dark:bg-accent/25 text-text'
            : 'text-muted hover:text-text hover:bg-surface-2/60'
        }`}
      >
        <IconComponent
          size={18}
          weight="bold"
          className={`shrink-0 ${isActive ? 'text-accent-bright' : 'text-muted'}`}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </button>
    )
  }

  const seasonTooltip = activeSeason
    ? `${activeSeason.name}${activeSeason.is_active ? ' (Active)' : ''}`
    : 'Select Active Season'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top Header: Fieldr Logo, Home Button, Collapse / Close Button */}
      <div className="pb-3.5 border-b border-border/60 shrink-0">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2.5">
            <Link to="/" title="Return to Home" aria-label="Fieldr Home">
              <BrandMark showWordmark={false} />
            </Link>
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="w-9 h-9 rounded-xl border border-border/60 text-muted hover:text-text hover:bg-surface-2/60 transition-[transform,opacity] duration-150 flex items-center justify-center"
            >
              <CaretRight size={16} weight="bold" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Link to="/" onClick={onCloseMobile} aria-label="Fieldr Home">
              <BrandMark showWordmark={true} />
            </Link>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link
                to="/"
                onClick={onCloseMobile}
                title="Return to Home"
                aria-label="Return to Home"
                className="w-8 h-8 rounded-xl border border-border/60 text-muted hover:text-text hover:bg-surface-2/60 transition-[transform,opacity] duration-150 flex items-center justify-center"
              >
                <House size={16} />
              </Link>
              {onCloseMobile ? (
                <button
                  type="button"
                  onClick={onCloseMobile}
                  title="Close menu"
                  aria-label="Close drawer"
                  className="w-8 h-8 rounded-xl border border-border/60 text-muted hover:text-text hover:bg-surface-2/60 transition-[transform,opacity] duration-150 flex items-center justify-center"
                >
                  <X size={16} weight="bold" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                  className="w-8 h-8 rounded-xl border border-border/60 text-muted hover:text-text hover:bg-surface-2/60 transition-[transform,opacity] duration-150 flex items-center justify-center"
                >
                  <CaretLeft size={16} weight="bold" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Season Selector Pill */}
      <div className="pt-3 pb-2 shrink-0">
        {collapsed ? (
          <div
            title={seasonTooltip}
            className="relative w-10 h-10 mx-auto rounded-full bg-surface-2/80 border border-border/60 hover:border-accent-bright/50 flex items-center justify-center"
          >
            <span
              aria-hidden="true"
              className={`w-2.5 h-2.5 rounded-full ${
                activeSeason?.is_active ? 'bg-accent-bright' : 'bg-muted/50'
              }`}
            />
            <select
              value={activeSeason?.id || ''}
              onChange={(e) => onSwitchSeason(e.target.value)}
              aria-label="Select Active Season"
              title={seasonTooltip}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id} className="bg-surface text-text">
                  {s.name} {s.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div
            title={seasonTooltip}
            className="relative h-9 px-3 rounded-full bg-surface-2/80 border border-border/60 hover:border-accent-bright/50 flex items-center gap-2"
          >
            {activeSeason?.is_active && (
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full bg-accent-bright shrink-0"
              />
            )}
            <select
              value={activeSeason?.id || ''}
              onChange={(e) => onSwitchSeason(e.target.value)}
              aria-label="Select Active Season"
              className="appearance-none bg-transparent text-xs font-medium text-text truncate flex-1 min-w-0 pr-5 focus:outline-none cursor-pointer"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id} className="bg-surface text-text">
                  {s.name} {s.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>
            <CaretDown
              size={13}
              weight="bold"
              aria-hidden="true"
              className="pointer-events-none absolute right-3 text-muted shrink-0"
            />
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav
        className="flex-1 min-h-0 overflow-y-auto py-1.5 flex flex-col gap-1 thin-scrollbar"
        aria-label="Admin Navigation"
      >
        {renderNavItem(ADMIN_DASHBOARD_ITEM)}

        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.label} className={collapsed ? 'mt-2 flex flex-col gap-1' : 'mt-3 flex flex-col gap-1'}>
            {!collapsed && (
              <div className="px-3 pb-1 text-[11px] font-mono uppercase tracking-[0.14em] text-muted select-none">
                {group.label}
              </div>
            )}
            {group.items.map(renderNavItem)}
          </div>
        ))}
      </nav>

      {/* Bottom Actions: Theme, Sign out, and Launch Projector Pill pinned to bottom */}
      <div className="mt-auto pt-3 border-t border-border/60 flex flex-col gap-2 shrink-0">
        {collapsed ? (
          <>
            <button
              type="button"
              onClick={onToggleQuickTheme}
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
              className="w-10 h-10 mx-auto rounded-xl bg-surface-2/80 border border-border/60 text-muted hover:text-text transition-[transform,opacity] duration-150 flex items-center justify-center"
            >
              {resolvedTheme === 'dark' ? (
                <Sun size={18} weight="bold" />
              ) : (
                <Moon size={18} weight="bold" />
              )}
            </button>
            <button
              type="button"
              onClick={onSignOut}
              title={userEmail ? `Sign out (${userEmail})` : 'Sign out'}
              aria-label="Sign out"
              className="w-10 h-10 mx-auto rounded-xl text-muted hover:text-error hover:bg-error/10 transition-[transform,opacity] duration-150 flex items-center justify-center"
            >
              <SignOut size={18} />
            </button>
          </>
        ) : (
          <>
            <div
              role="radiogroup"
              aria-label="Appearance"
              className="grid grid-cols-3 p-1 bg-surface-2/80 border border-border/60 rounded-xl gap-1"
            >
              {APPEARANCE_OPTIONS.map((opt) => {
                const IconComponent = opt.icon
                const isSelected = preference === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    title={opt.label}
                    onClick={() => onSetPreference(opt.value)}
                    className={`min-h-[32px] px-2 py-1 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-mono transition-[transform,opacity] duration-150 ${
                      isSelected
                        ? 'bg-surface text-text font-semibold border border-border/60'
                        : 'text-muted hover:text-text border border-transparent'
                    }`}
                  >
                    <IconComponent size={13} weight={isSelected ? 'bold' : 'regular'} />
                    <span>{opt.label}</span>
                  </button>
                )
              })}
            </div>

            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              className="h-9 px-3 rounded-xl text-xs font-medium text-muted hover:text-error hover:bg-error/10 transition-[transform,opacity] duration-150 flex items-center gap-2.5"
            >
              <SignOut size={17} />
              <span className="truncate">Sign out</span>
            </button>
          </>
        )}

        {/* Launch Projector Pill pinned to bottom */}
        <Link
          to="/projector"
          target="_blank"
          rel="noopener noreferrer"
          onClick={onCloseMobile}
          onMouseEnter={() => prefetchRoute('/projector')}
          onFocus={() => prefetchRoute('/projector')}
          onTouchStart={() => prefetchRoute('/projector')}
          title="Launch Projector"
          aria-label="Launch Projector"
          className={`h-10 rounded-full bg-accent/15 dark:bg-accent/25 border border-accent-bright/30 hover:border-accent-bright/60 text-xs font-medium text-text transition-[transform,opacity] duration-150 flex items-center justify-center ${
            collapsed ? 'w-10 mx-auto px-0' : 'w-full gap-2 px-4'
          }`}
        >
          <Television size={18} weight="bold" className="text-accent-bright shrink-0" />
          {!collapsed && <span className="truncate">Launch Projector</span>}
        </Link>
      </div>
    </div>
  )
}
