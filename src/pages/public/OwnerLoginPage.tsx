import React, { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeSlash, Key, SignIn, WarningCircle } from '@phosphor-icons/react'
import { BrandMark } from '../../components/layout/BrandMark'
import {
  PUBLIC_BACK_LINK,
  PUBLIC_BTN_PRIMARY,
  PUBLIC_CARD,
  PUBLIC_ERROR_BANNER,
  PUBLIC_INPUT,
  PUBLIC_LABEL,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE
} from '../../components/public/publicStyles'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/data/client'

export const OwnerLoginPage: React.FC = () => {
  const { user, isLoading, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // If already authenticated as owner, go straight to teams
  if (!isLoading && user?.role === 'owner') {
    return <Navigate to="/teams" replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanId = loginId.trim().toLowerCase()
    if (!cleanId || !password) {
      setErrorMsg('Please enter both Login ID and Password')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMsg('')

      if (!supabase) {
        setErrorMsg('Authentication service is currently unavailable.')
        return
      }

      const email = `${cleanId}@owners.fieldr.app`
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error || !data?.user) {
        setErrorMsg(error?.message || 'Invalid Login ID or password')
        return
      }

      // Read this user's own row in profiles
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (profileErr || profile?.role !== 'owner') {
        await supabase.auth.signOut()
        setErrorMsg('This login is not an owner account.')
        return
      }

      await refreshUser()
      navigate('/teams')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      setErrorMsg(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={`${PUBLIC_PAGE_SHELL} p-6 md:p-12`}>
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full gap-4">
        <BrandMark />
        <Link to="/teams" className={PUBLIC_BACK_LINK}>
          <ArrowLeft size={14} weight="regular" />
          <span>Back to Teams</span>
        </Link>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-auto py-10">
        <div className={`${PUBLIC_CARD} relative`}>
          {/* Header */}
          <div className="pb-5 mb-6 border-b border-border">
            <h1 className={PUBLIC_PAGE_TITLE}>Owner Sign In</h1>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className={`mb-6 ${PUBLIC_ERROR_BANNER}`}>
              <WarningCircle size={18} weight="regular" className="text-error shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Login ID / Password Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="owner-login-id" className={PUBLIC_LABEL}>
                Login ID
              </label>
              <div className="relative">
                <input
                  id="owner-login-id"
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="e.g. titans"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  required
                  className={`${PUBLIC_INPUT} font-mono pr-11`}
                />
                <Key
                  size={18}
                  weight="regular"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="owner-password" className={PUBLIC_LABEL}>
                Password
              </label>
              <div className="relative">
                <input
                  id="owner-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className={`${PUBLIC_INPUT} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="hit-44 absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-text transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeSlash size={18} weight="regular" /> : <Eye size={18} weight="regular" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`${PUBLIC_BTN_PRIMARY} mt-2 w-full py-3 text-sm`}
            >
              <SignIn size={18} weight="regular" />
              <span>{isSubmitting ? 'Authenticating...' : 'Sign in as Owner'}</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-end text-xs text-muted">
            <Link
              to="/teams"
              className="hover:text-text rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright transition-colors"
            >
              Public Teams
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-muted max-w-5xl mx-auto w-full">
        Fieldr Franchise Management
      </div>
    </div>
  )
}
