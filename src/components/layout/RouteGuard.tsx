import React, { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import {
  AdminShellSkeleton,
  AdminTableSkeleton,
  ProjectorPageSkeleton
} from '../ui/Skeleton'
import type { UserRole } from '../../types'

export interface PreloadableRouteComponent {
  getCached: () => React.ComponentType | null
  load: () => Promise<React.ComponentType>
}

interface RouteGuardProps {
  children?: React.ReactNode
  allowedRoles: UserRole[]
  preloadComponent?: PreloadableRouteComponent
}

export const RouteGuard: React.FC<RouteGuardProps> = ({
  children,
  allowedRoles,
  preloadComponent
}) => {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const [LoadedComponent, setLoadedComponent] = useState<React.ComponentType | null>(
    () => preloadComponent?.getCached() ?? null
  )
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    if (!preloadComponent || LoadedComponent) return
    if (isLoading || !user || !allowedRoles.includes(user.role)) return
    let cancelled = false
    preloadComponent
      .load()
      .then((Comp) => {
        if (!cancelled) {
          setLoadedComponent(() => Comp)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err : new Error(String(err)))
        }
      })
    return () => {
      cancelled = true
    }
  }, [preloadComponent, LoadedComponent, isLoading, user, allowedRoles])

  if (loadError) {
    throw loadError
  }

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

  if (preloadComponent) {
    if (!LoadedComponent) {
      if (location.pathname.startsWith('/projector')) {
        return <ProjectorPageSkeleton />
      }
      return <AdminShellSkeleton />
    }
    return <LoadedComponent />
  }

  return <>{children}</>
}
