import React, { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowLeft, Eye, EyeSlash, Key, LockKey, SignIn, WarningCircle } from '@phosphor-icons/react'
import { BrandMark } from '../../components/layout/BrandMark'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/data'

export const OwnerLoginPage: React.FC = () => {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // If already authenticated as owner, go straight to teams
  if (user && user.role === 'owner') {
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

      if (error || !data.user) {
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
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between p-6 md:p-12 relative overflow-hidden font-dm-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
        <BrandMark />
        <Link
          to="/teams"
          className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Teams</span>
        </Link>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-auto py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="p-8 md:p-10 rounded-3xl bg-surface border border-border shadow-2xl relative"
        >
          {/* Header */}
          <div className="mb-8">
            <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
              FRANCHISE PORTAL
            </span>
            <h1 className="font-syne font-bold text-3xl text-text tracking-tight">
              Owner Sign In
            </h1>
            <p className="text-sm text-muted mt-2">
              Sign in with your team credentials to view your confidential franchise overview.
            </p>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-6 p-3 rounded-xl bg-error/10 border border-error/40 flex items-center gap-2.5 text-xs text-text">
              <WarningCircle size={18} weight="fill" className="text-error shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Login ID / Password Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
                Login ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="e.g. titans"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  required
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm font-mono text-text placeholder-muted/60 focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright transition-all"
                />
                <Key size={18} className="absolute right-3.5 top-3.5 text-muted pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-4 py-3 bg-bg border border-border rounded-xl text-sm text-text placeholder-muted/60 focus:outline-none focus:border-accent-bright focus:ring-1 focus:ring-accent-bright transition-all pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-3.5 text-muted hover:text-text transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full py-3.5 rounded-full bg-btn-bg text-btn-fg font-medium text-sm hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright cursor-pointer"
            >
              <SignIn size={18} weight="bold" />
              <span>{isSubmitting ? 'Authenticating...' : 'Sign in as Owner'}</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <LockKey size={14} className="text-muted" />
              <span>Encrypted Credentials</span>
            </span>
            <Link to="/teams" className="hover:text-text transition-colors">
              Public Teams
            </Link>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-muted max-w-5xl mx-auto w-full">
        Fieldr Franchise Management
      </div>
    </div>
  )
}
