import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type { AuthUser, UserRole } from '../types'
import {
  demoSignIn,
  getCurrentUser,
  signIn as apiSignIn,
  signOut as apiSignOut
} from './data/auth'
import { isDemoMode, supabase } from './data/client'

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
  const userRef = useRef<AuthUser | null>(null)

  const updateUser = useCallback((next: AuthUser | null) => {
    userRef.current = next
    setUser(next)
  }, [])

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const curr = await getCurrentUser()
      updateUser(curr)
      return curr
    } catch {
      return userRef.current
    }
  }, [updateUser])

  useEffect(() => {
    let mounted = true

    if (supabase) {
      let initialized = false
      const finishInitialLoad = () => {
        if (!initialized && mounted) {
          initialized = true
          setIsLoading(false)
        }
      }

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT' || !session?.user) {
          updateUser(null)
          finishInitialLoad()
          return
        }

        const currentUser = userRef.current
        const sameUserId = currentUser !== null && currentUser.id === session.user.id

        // Do not refetch profile on token refresh or tab focus / redundant SIGNED_IN when user id is unchanged
        if (sameUserId && event !== 'USER_UPDATED') {
          finishInitialLoad()
          return
        }

        try {
          const curr = await getCurrentUser()
          if (mounted && curr) {
            updateUser(curr)
          }
        } catch {
          // Keep the previous user on transient errors
        } finally {
          finishInitialLoad()
        }
      })

      return () => {
        mounted = false
        subscription.unsubscribe()
      }
    }

    getCurrentUser()
      .then((curr) => {
        if (mounted) {
          updateUser(curr)
          setIsLoading(false)
        }
      })
      .catch(() => {
        if (mounted) setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [updateUser])

  const login = useCallback(
    async (email: string, pass: string): Promise<AuthUser> => {
      const authUser = await apiSignIn(email, pass)
      updateUser(authUser)
      return authUser
    },
    [updateUser]
  )

  const quickDemoLogin = useCallback(
    async (role: UserRole): Promise<AuthUser> => {
      if (!isDemoMode) {
        throw new Error('Demo mode is disabled when Supabase is configured')
      }
      const authUser = await demoSignIn(role)
      updateUser(authUser)
      return authUser
    },
    [updateUser]
  )

  const logout = useCallback(async () => {
    await apiSignOut()
    updateUser(null)
  }, [updateUser])

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isLoading,
      isDemo: isDemoMode,
      login,
      quickDemoLogin,
      logout,
      refreshUser
    }),
    [user, isLoading, login, quickDemoLogin, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
