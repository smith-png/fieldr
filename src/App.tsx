/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider } from './lib/AuthContext'
import { ToastProvider } from './lib/ToastContext'
import { ThemeProvider } from './lib/theme'
import { RouteGuard, type PreloadableRouteComponent } from './components/layout/RouteGuard'
import { ErrorBoundary } from './components/layout/ErrorBoundary'
import {
  AdminShellSkeleton,
  AdminTableSkeleton,
  PublicPageSkeleton
} from './components/ui/Skeleton'
import { AppToaster } from './components/ui/Toast'

import { HomePage } from './pages/public/HomePage'
const LoginPage = lazy(() =>
  import('./pages/public/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const OwnerLoginPage = lazy(() =>
  import('./pages/public/OwnerLoginPage').then((m) => ({ default: m.OwnerLoginPage }))
)
const AdminPage = lazy(() =>
  import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage }))
)
let cachedProjectorPage: React.ComponentType | null = null
let projectorPagePromise: Promise<React.ComponentType> | null = null

const projectorRouteComponent: PreloadableRouteComponent = {
  getCached: () => cachedProjectorPage,
  load: () => {
    if (cachedProjectorPage) return Promise.resolve(cachedProjectorPage)
    if (!projectorPagePromise) {
      projectorPagePromise = import('./pages/public/ProjectorPage')
        .then((m) => {
          cachedProjectorPage = m.ProjectorPage
          return m.ProjectorPage
        })
        .catch((err) => {
          projectorPagePromise = null
          throw err
        })
    }
    return projectorPagePromise
  }
}
const TeamsPage = lazy(() =>
  import('./pages/public/TeamsPage').then((m) => ({ default: m.TeamsPage }))
)
const SeasonTeamDetailPage = lazy(() =>
  import('./pages/public/SeasonTeamDetailPage').then((m) => ({
    default: m.SeasonTeamDetailPage
  }))
)
const PlayerProfilePage = lazy(() =>
  import('./pages/public/PlayerProfilePage').then((m) => ({
    default: m.PlayerProfilePage
  }))
)
const RostersPage = lazy(() =>
  import('./pages/public/RostersPage').then((m) => ({ default: m.RostersPage }))
)
const RosterSportPage = lazy(() =>
  import('./pages/public/RosterSportPage').then((m) => ({ default: m.RosterSportPage }))
)
const ContentPage = lazy(() =>
  import('./pages/public/ContentPage').then((m) => ({ default: m.ContentPage }))
)
const HandbookPage = lazy(() =>
  import('./pages/public/HandbookPage').then((m) => ({ default: m.HandbookPage }))
)
const RulesPage = lazy(() =>
  import('./pages/public/RulesPage').then((m) => ({ default: m.RulesPage }))
)
const ResultsPage = lazy(() =>
  import('./pages/public/ResultsPage').then((m) => ({ default: m.ResultsPage }))
)
const RegisterPage = lazy(() =>
  import('./pages/public/RegisterPage').then((m) => ({ default: m.RegisterPage }))
)

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
                <Route
                  path="/teams"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="cards" />}>
                      <TeamsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/results"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="cards" />}>
                      <ResultsPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="content" />}>
                      <RegisterPage />
                    </Suspense>
                  }
                />
                <Route path="/season" element={<Navigate to="/teams" replace />} />
                <Route path="/season/:id" element={<Navigate to="/teams" replace />} />
                <Route
                  path="/season/:id/teams/:teamId"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="cards" />}>
                      <SeasonTeamDetailPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/players/:code"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="profile" />}>
                      <PlayerProfilePage />
                    </Suspense>
                  }
                />
                <Route
                  path="/rosters"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="cards" />}>
                      <RostersPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/rosters/:sport"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="cards" />}>
                      <RosterSportPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/help"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="content" />}>
                      <ContentPage pageKey="help_page" fallbackTitle="Help & Instructions" />
                    </Suspense>
                  }
                />
                <Route
                  path="/about"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="content" />}>
                      <ContentPage pageKey="about_page" fallbackTitle="About Fieldr" />
                    </Suspense>
                  }
                />
                <Route
                  path="/rules"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="content" />}>
                      <RulesPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/handbook"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="content" />}>
                      <HandbookPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/login"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="content" />}>
                      <LoginPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/owner-login"
                  element={
                    <Suspense fallback={<PublicPageSkeleton variant="content" />}>
                      <OwnerLoginPage />
                    </Suspense>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RouteGuard allowedRoles={['admin']}>
                      <Suspense fallback={<AdminShellSkeleton />}>
                        <AdminPage />
                      </Suspense>
                    </RouteGuard>
                  }
                />
                <Route
                  path="/admin/logs"
                  element={
                    <RouteGuard allowedRoles={['admin']}>
                      <Suspense
                        fallback={
                          <AdminShellSkeleton>
                            <AdminTableSkeleton rows={8} columns={5} />
                          </AdminShellSkeleton>
                        }
                      >
                        <AdminPage />
                      </Suspense>
                    </RouteGuard>
                  }
                />
                <Route
                  path="/projector"
                  element={
                    <RouteGuard
                      allowedRoles={['admin', 'projector']}
                      preloadComponent={projectorRouteComponent}
                    />
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <AppToaster />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
        <Analytics />
      </ThemeProvider>
      <SpeedInsights />
    </ErrorBoundary>
  )
}
