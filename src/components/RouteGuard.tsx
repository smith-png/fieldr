import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import type { UserRole } from '../lib/types'

interface RouteGuardProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
}

export const RouteGuard: React.FC<RouteGuardProps> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0B] text-[#CBD1CB] flex items-center justify-center font-mono text-xs tracking-widest">
        <span>LOADING FIELDR CONSOLE...</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!allowedRoles.includes(user.role)) {
    // If projector tries to access admin, send to /projector
    if (user.role === 'projector') {
      return <Navigate to="/projector" replace />
    }
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
