import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Calendar,
  ChartPieSlice,
  Coins,
  ProjectorScreen,
  SignOut,
  Television,
  Users,
  ShieldCheck,
  House
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

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <ChartPieSlice size={20} weight="bold" /> },
    { id: 'seasons', label: 'Seasons', icon: <Calendar size={20} weight="bold" /> },
    { id: 'teams', label: 'Teams', icon: <ShieldCheck size={20} weight="bold" /> },
    { id: 'players', label: 'Players', icon: <Users size={20} weight="bold" /> },
    { id: 'purses', label: 'Purses', icon: <Coins size={20} weight="bold" /> },
    { id: 'projector', label: 'Projector Control', icon: <ProjectorScreen size={20} weight="bold" /> }
  ]

  const handleSignOut = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex flex-col md:flex-row antialiased selection:bg-[#047554] selection:text-white">
      {/* Desktop Left Rail Navigation (Min 44px touch targets) */}
      <aside className="hidden md:flex flex-col justify-between w-64 lg:w-72 bg-[#101310] border-r border-white/10 shrink-0 p-5">
        <div className="flex flex-col gap-6">
          {/* Brand lockup */}
          <div className="pb-4 border-b border-white/10 flex items-center justify-between">
            <BrandMark />
            <Link
              to="/"
              title="Return to Home"
              aria-label="Return to Home"
              className="p-2.5 min-w-[44px] min-h-[44px] rounded-xl border border-white/10 flex items-center justify-center text-[#8E928C] hover:text-white hover:border-[#047554] transition-colors"
            >
              <House size={18} />
            </Link>
          </div>

          {/* Active Season Indicator & Selector */}
          <div className="p-3.5 rounded-2xl bg-[#161A16] border border-white/10 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[#8E928C]">
              <span>Active Tournament</span>
              {isDemo && (
                <span className="px-2 py-0.5 rounded-full bg-[#395F3D]/30 border border-[#395F3D] text-[#CBD1CB] font-mono text-[9px]">
                  Demo mode
                </span>
              )}
            </div>
            <select
              value={activeSeason?.id || ''}
              onChange={(e) => onSwitchSeason(e.target.value)}
              aria-label="Select Active Season"
              className="w-full bg-[#0B0B0B] border border-white/10 rounded-xl px-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#047554]"
            >
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1.5" aria-label="Admin Navigation">
            {tabs.map((tab) => {
              const isActive = currentTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectTab(tab.id)}
                  className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center gap-3 transition-all ${
                    isActive
                      ? 'bg-[#19241B] border border-[#047554] text-white shadow-sm font-semibold'
                      : 'text-[#8E928C] hover:text-[#F0F2EE] hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span className={isActive ? 'text-[#047554]' : 'text-[#8E928C]'}>
                    {tab.icon}
                  </span>
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
          <Link
            to="/projector"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#161A16] border border-white/10 text-xs font-medium text-[#CBD1CB] hover:text-white hover:border-[#047554] transition-colors flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <Television size={18} className="text-[#047554]" />
              <span>Launch Projector</span>
            </div>
            <span className="text-[10px] uppercase font-mono text-[#8E928C]">Stage</span>
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            className="min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium text-[#8E928C] hover:text-[#B91C1C] hover:bg-[#B91C1C]/10 transition-colors flex items-center gap-2.5"
          >
            <SignOut size={18} />
            <span>Sign out ({user?.email})</span>
          </button>
        </div>
      </aside>

      {/* Mobile / Tablet Header and Navigation */}
      <div className="md:hidden flex flex-col bg-[#101310] border-b border-white/10 sticky top-0 z-30">
        <div className="p-4 flex items-center justify-between">
          <BrandMark showWordmark={false} />
          <div className="flex items-center gap-2">
            {isDemo && (
              <span className="px-2 py-0.5 rounded-full bg-[#395F3D]/30 border border-[#395F3D] text-[#CBD1CB] font-mono text-[10px]">
                Demo mode
              </span>
            )}
            <Link
              to="/projector"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Projector"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#161A16] border border-white/10 text-white"
            >
              <Television size={18} className="text-[#047554]" />
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#8E928C] hover:text-[#B91C1C]"
            >
              <SignOut size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Horizontal Tab Bar (min 44px touch targets) */}
        <div className="flex items-center gap-1 overflow-x-auto px-4 pb-3 scrollbar-none">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-2 shrink-0 ${
                  isActive
                    ? 'bg-[#19241B] border border-[#047554] text-white font-semibold'
                    : 'bg-[#141414] border border-white/10 text-[#8E928C]'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-5 sm:p-8 lg:p-10 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
