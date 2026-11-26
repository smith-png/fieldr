import type { AuthUser, UserRole } from '../../types'
import { AppError } from '../errors'
import { supabase } from './client'
import type { AuthService } from './types'

const supabaseAuthService: AuthService = {
  async getCurrentUser(): Promise<AuthUser | null> {
    if (!supabase) return null

    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw new AppError(sessionError.message || 'Failed to restore session')
    }
    const session = data?.session
    if (!session?.user) return null

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .maybeSingle()

    if (profileError) {
      throw new AppError(profileError.message || 'Failed to load user profile')
    }

    return {
      id: session.user.id,
      email: session.user.email || '',
      role: (profile?.role as UserRole) || 'projector'
    }
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data?.user) {
      throw new AppError(error?.message || 'Authentication failed')
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle()

    return {
      id: data.user.id,
      email: data.user.email || email,
      role: (profile?.role as UserRole) || 'projector'
    }
  },

  async signOut(): Promise<void> {
    if (supabase) {
      await supabase.auth.signOut()
    }
  }
}

export const authService: AuthService = supabaseAuthService

export const getCurrentUser = () => authService.getCurrentUser()
export const signIn = (e: string, p: string) => authService.signIn(e, p)
export const signOut = () => authService.signOut()
