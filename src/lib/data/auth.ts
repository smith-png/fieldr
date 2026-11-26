import type { AuthUser, UserRole } from '../../types'
import { AppError } from '../errors'
import { supabase } from './client'
import type { AuthService } from './types'

const roleCacheByUserId = new Map<string, UserRole>()
const inFlightRoleByUserId = new Map<string, Promise<UserRole>>()

async function fetchUserRole(
  userId: string,
  options?: { force?: boolean }
): Promise<UserRole> {
  if (!supabase) return 'projector'

  if (!options?.force) {
    const cached = roleCacheByUserId.get(userId)
    if (cached) return cached

    const inFlight = inFlightRoleByUserId.get(userId)
    if (inFlight) return inFlight
  }

  const promise = (async () => {
    const { data: profile, error: profileError } = await supabase!
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      throw new AppError(profileError.message || 'Failed to load user profile')
    }

    const role: UserRole = (profile?.role as UserRole) || 'projector'
    roleCacheByUserId.set(userId, role)
    return role
  })().finally(() => {
    inFlightRoleByUserId.delete(userId)
  })

  inFlightRoleByUserId.set(userId, promise)
  return promise
}

export function clearCachedUserRole(userId?: string): void {
  if (userId) {
    roleCacheByUserId.delete(userId)
    inFlightRoleByUserId.delete(userId)
    return
  }
  roleCacheByUserId.clear()
  inFlightRoleByUserId.clear()
}

export async function getUserFromSession(
  session: { user?: { id: string; email?: string | null } | null } | null,
  options?: { forceRoleRefresh?: boolean }
): Promise<AuthUser | null> {
  const sessionUser = session?.user
  if (!sessionUser?.id) return null

  const role = await fetchUserRole(sessionUser.id, { force: options?.forceRoleRefresh })
  return {
    id: sessionUser.id,
    email: sessionUser.email || '',
    role
  }
}

const supabaseAuthService: AuthService = {
  async getCurrentUser(): Promise<AuthUser | null> {
    if (!supabase) return null

    const { data, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      throw new AppError(sessionError.message || 'Failed to restore session')
    }
    return getUserFromSession(data?.session ?? null)
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    if (!supabase) throw new AppError('Supabase not configured')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data?.user) {
      throw new AppError(error?.message || 'Authentication failed')
    }

    let role: UserRole = 'projector'
    try {
      role = await fetchUserRole(data.user.id)
    } catch {
      role = 'projector'
    }

    return {
      id: data.user.id,
      email: data.user.email || email,
      role
    }
  },

  async signOut(): Promise<void> {
    clearCachedUserRole()
    if (supabase) {
      await supabase.auth.signOut()
    }
  }
}

export const authService: AuthService = supabaseAuthService

export const getCurrentUser = () => authService.getCurrentUser()
export const signIn = (e: string, p: string) => authService.signIn(e, p)
export const signOut = () => authService.signOut()
