/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { ToastProvider } from './lib/ToastContext'
import { ThemeProvider } from './lib/theme'
import { RouteGuard } from './components/layout/RouteGuard'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import { HomePage } from './pages/public/HomePage'
import { LoginPage } from './pages/public/LoginPage'
import { AdminPage } from './pages/admin/AdminPage'
import { ProjectorPage } from './pages/public/ProjectorPage'
import { TeamsPage } from './pages/public/TeamsPage'
import { SeasonPage } from './pages/public/SeasonPage'
import { SeasonDetailPage } from './pages/public/SeasonDetailPage'
import { SeasonTeamDetailPage } from './pages/public/SeasonTeamDetailPage'
import { PlayerProfilePage } from './pages/public/PlayerProfilePage'
import { RostersPage } from './pages/public/RostersPage'
import { RosterSportPage } from './pages/public/RosterSportPage'
import { ContentPage } from './pages/public/ContentPage'

export default function App() {
  return (
    <ErrorBoundary
      name="GlobalApp"
      fallback={
        <div className="min-h-screen bg-bg text-text flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-8 text-center space-y-4 shadow-xl">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-bright inline-block" />
            <h1 className="font-syne font-bold text-xl text-text">Something went wrong</h1>
            <p className="text-xs text-muted">
              Fieldr encountered an unexpected error. You can refresh the page to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Reload page
            </button>
          </div>
        </div>
      }
    >
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/teams" element={<TeamsPage />} />
                <Route path="/season" element={<SeasonPage />} />
                <Route path="/season/:id" element={<SeasonDetailPage />} />
                <Route path="/season/:id/teams/:teamId" element={<SeasonTeamDetailPage />} />
                <Route path="/players/:code" element={<PlayerProfilePage />} />
                <Route path="/rosters" element={<RostersPage />} />
                <Route path="/rosters/:sport" element={<RosterSportPage />} />
                <Route
                  path="/help"
                  element={<ContentPage pageKey="help_page" fallbackTitle="Help & Instructions" />}
                />
                <Route
                  path="/about"
                  element={<ContentPage pageKey="about_page" fallbackTitle="About Fieldr" />}
                />
                <Route path="/login" element={<LoginPage />} />
                <Route
                  path="/admin"
                  element={
                    <RouteGuard allowedRoles={['admin']}>
                      <AdminPage />
                    </RouteGuard>
                  }
                />
                <Route
                  path="/admin/logs"
                  element={
                    <RouteGuard allowedRoles={['admin']}>
                      <AdminPage />
                    </RouteGuard>
                  }
                />
                <Route
                  path="/projector"
                  element={
                    <RouteGuard allowedRoles={['admin', 'projector']}>
                      <ProjectorPage />
                    </RouteGuard>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
