/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { ToastProvider } from './lib/ToastContext'
import { RouteGuard } from './components/RouteGuard'
import { ErrorBoundary } from './components/ErrorBoundary'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/admin/AdminPage'
import { ProjectorPage } from './pages/ProjectorPage'
import { TeamsPage } from './pages/TeamsPage'
import { SeasonPage } from './pages/SeasonPage'
import { RostersPage } from './pages/RostersPage'
import { RosterSportPage } from './pages/RosterSportPage'
import { ContentPage } from './pages/ContentPage'

export default function App() {
  return (
    <ErrorBoundary
      name="GlobalApp"
      fallback={
        <div className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#111411] border border-white/10 rounded-2xl p-8 text-center space-y-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#047554] inline-block" />
            <h1 className="font-syne font-bold text-xl text-white">Something went wrong</h1>
            <p className="text-xs text-[#8E928C]">
              Fieldr encountered an unexpected error. You can refresh the page to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-white text-[#0B0B0B] text-xs font-semibold hover:bg-[#F0F2EE] transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      }
    >
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/teams" element={<TeamsPage />} />
              <Route path="/season" element={<SeasonPage />} />
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
    </ErrorBoundary>
  )
}

