import React, { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { ErrorState } from '../ui/ErrorState'
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
  const [retryTick, setRetryTick] = useState(0)

  const userRole = user?.role

  useEffect(() => {
    if (!preloadComponent || LoadedComponent) return
    if (isLoading || !userRole || !allowedRoles.includes(userRole)) return
    let cancelled = false
    setLoadError(null)
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
  }, [preloadComponent, LoadedComponent, isLoading, userRole, allowedRoles, retryTick])

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

  if (!user || !userRole) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (!allowedRoles.includes(userRole)) {
    // If owner tries to access admin or any restricted route, send to /teams
    if (userRole === 'owner') {
      return <Navigate to="/teams" replace />
    }
    // If projector tries to access admin, send to /projector
    if (userRole === 'projector') {
      return <Navigate to="/projector" replace />
    }
    return <Navigate to="/login" replace />
  }

  if (loadError) {
    return (
      <div className="min-h-dvh bg-bg text-text flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <ErrorState
            title="Could not load this view"
            message={loadError.message || 'Failed to load page assets. Please try again.'}
            onRetry={() => {
              setLoadError(null)
              setRetryTick((t) => t + 1)
            }}
          />
        </div>
      </div>
    )
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
