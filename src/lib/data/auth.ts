import type { AuthUser, UserRole } from '../../types'
import { AppError } from '../errors'
import {
  isDemoMode,
  supabase,
  getLocal,
  setLocal,
  notifyChange,
  STORAGE_KEYS
} from './client'
import type { AuthService } from './types'

const demoAuthService: AuthService = {
  async getCurrentUser(): Promise<AuthUser | null> {
    return getLocal<AuthUser | null>(STORAGE_KEYS.USER, null)
  },

  async signIn(email: string, _password: string): Promise<AuthUser> {
    const role: UserRole = email.toLowerCase().includes('admin') ? 'admin' : 'projector'
    const user: AuthUser = {
      id: `demo-${role}-${Date.now()}`,
      email,
      role
    }
    setLocal(STORAGE_KEYS.USER, user)
    notifyChange('auth_change')
    return user
  },

  async demoSignIn(role: UserRole): Promise<AuthUser> {
    const email = role === 'admin' ? 'admin@fieldr.app' : 'projector@fieldr.app'
    const user: AuthUser = {
      id: `demo-${role}-user`,
      email,
      role
    }
    setLocal(STORAGE_KEYS.USER, user)
    notifyChange('auth_change')
    return user
  },

  async signOut(): Promise<void> {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEYS.USER)
    }
    notifyChange('auth_change')
  }
}

const supabaseAuthService: AuthService = {
  async getCurrentUser(): Promise<AuthUser | null> {
    if (!supabase) return null

    const {
      data: { session }
    } = await supabase.auth.getSession()
    if (!session?.user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()

    return {
      id: session.user.id,
      email: session.user.email || '',
      role: (profile?.role as UserRole) || 'projector'
    }
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user) {
      throw new AppError(error?.message || 'Authentication failed')
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    return {
      id: data.user.id,
      email: data.user.email || email,
      role: (profile?.role as UserRole) || 'projector'
    }
  },

  async demoSignIn(_role: UserRole): Promise<AuthUser> {
    throw new AppError('Demo mode is disabled when Supabase is configured')
  },

  async signOut(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut()
    }
  }
}

export const authService: AuthService = isDemoMode ? demoAuthService : supabaseAuthService

export const getCurrentUser = () => authService.getCurrentUser()
export const signIn = (e: string, p: string) => authService.signIn(e, p)
export const demoSignIn = (role: UserRole) => authService.demoSignIn(role)
export const signOut = () => authService.signOut()
