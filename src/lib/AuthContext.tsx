import React, { createContext, useContext, useEffect, useState } from 'react'
import type { AuthUser, UserRole } from '../types'
import {
  demoSignIn,
  getCurrentUser,
  isDemoMode,
  signIn as apiSignIn,
  signOut as apiSignOut,
  supabase
} from './data'

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isDemo: boolean
  login: (email: string, pass: string) => Promise<AuthUser>
  quickDemoLogin: (role: UserRole) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshUser: () => Promise<AuthUser | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = async (): Promise<AuthUser | null> => {
    try {
      const curr = await getCurrentUser()
      setUser(curr)
      return curr
    } catch {
      setUser(null)
      return null
    }
  }

  useEffect(() => {
    let mounted = true
    getCurrentUser()
      .then((curr) => {
        if (mounted) {
          setUser(curr)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (mounted) setIsLoading(false)
      })

    if (supabase) {
      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (!mounted) return
        if (session?.user) {
          try {
            const curr = await getCurrentUser()
            if (mounted) setUser(curr)
          } catch {
            if (mounted) setUser(null)
          }
        } else {
          if (mounted) setUser(null)
        }
      })
      return () => {
        mounted = false
        subscription.unsubscribe()
      }
    }

    return () => {
      mounted = false
    }
  }, [])

  const login = async (email: string, pass: string): Promise<AuthUser> => {
    const authUser = await apiSignIn(email, pass)
    setUser(authUser)
    return authUser
  }

  const quickDemoLogin = async (role: UserRole): Promise<AuthUser> => {
    if (!isDemoMode) {
      throw new Error('Demo mode is disabled when Supabase is configured')
    }
    const authUser = await demoSignIn(role)
    setUser(authUser)
    return authUser
  }

  const logout = async () => {
    await apiSignOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isDemo: isDemoMode,
        login,
        quickDemoLogin,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
