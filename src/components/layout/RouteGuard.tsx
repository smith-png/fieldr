import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import {
  AdminShellSkeleton,
  AdminTableSkeleton,
  ProjectorPageSkeleton
} from '../ui/Skeleton'
import type { UserRole } from '../../types'

interface RouteGuardProps {
  children: React.ReactNode
  allowedRoles: UserRole[]
}

export const RouteGuard: React.FC<RouteGuardProps> = ({ children, allowedRoles }) => {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    if (location.pathname.startsWith('/projector')) {
      return <ProjectorPageSkeleton />
    }
    return (
      <AdminShellSkeleton>
        {location.pathname === '/admin/logs' ? (
          <AdminTableSkeleton rows={8} columns={5} />
        ) : undefined}
      </AdminShellSkeleton>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!allowedRoles.includes(user.role)) {
    // If owner tries to access admin or any restricted route, send to /teams
    if (user.role === 'owner') {
      return <Navigate to="/teams" replace />
    }
    // If projector tries to access admin, send to /projector
    if (user.role === 'projector') {
      return <Navigate to="/projector" replace />
    }
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
