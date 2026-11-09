/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import { ToastProvider } from './lib/ToastContext'
import { RouteGuard } from './components/RouteGuard'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/admin/AdminPage'
import { ProjectorPage } from './pages/ProjectorPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
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
  )
}
