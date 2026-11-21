import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, LockKey, SignIn, User, WarningCircle } from '@phosphor-icons/react'
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
import type { UserRole } from '../../types'

export const LoginPage: React.FC = () => {
  const [searchParams] = useSearchParams()
  const initialRole = searchParams.get('as') === 'projector' ? 'projector' : 'admin'

  const { login, quickDemoLogin, isDemo } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setErrorMsg('Please enter both email and password')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMsg('')
      const user = await login(email, password)
      if (user.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/projector')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid login credentials'
      setErrorMsg(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuickLogin = async (role: UserRole) => {
    try {
      setIsSubmitting(true)
      setErrorMsg('')
      const user = await quickDemoLogin(role)
      if (user.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/projector')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Demo sign in failed'
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
        <Link to="/" className={PUBLIC_BACK_LINK}>
          <ArrowLeft size={14} weight="regular" />
          <span>Back to Home</span>
        </Link>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-auto py-10">
        <div className={`${PUBLIC_CARD} relative`}>
          {/* Header */}
          <div className="pb-5 mb-6 border-b border-border">
            <h1 className={PUBLIC_PAGE_TITLE}>Sign in to Fieldr</h1>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className={`mb-6 ${PUBLIC_ERROR_BANNER}`}>
              <WarningCircle size={18} weight="regular" className="text-error shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="login-email" className={PUBLIC_LABEL}>
                Email address
              </label>
              <div className="relative">
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@fieldr.app"
                  required
                  className={`${PUBLIC_INPUT} pr-11`}
                />
                <User
                  size={18}
                  weight="regular"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className={PUBLIC_LABEL}>
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className={`${PUBLIC_INPUT} pr-11`}
                />
                <LockKey
                  size={18}
                  weight="regular"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`${PUBLIC_BTN_PRIMARY} mt-2 w-full py-3 text-sm`}
            >
              <SignIn size={18} weight="regular" />
              <span>{isSubmitting ? 'Authenticating...' : 'Sign in'}</span>
            </button>
          </form>

          {/* Quick Demo Login Buttons - ONLY in demo mode */}
          {isDemo && (
            <div className="mt-8 pt-6 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-muted">
                  Demo mode: One-click sign in
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-bright/15 text-accent-bright font-medium">
                  Instant Test
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin')}
                  disabled={isSubmitting}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                    initialRole === 'admin'
                      ? 'bg-accent/20 border-accent-bright text-text hover:bg-accent/30'
                      : 'bg-surface-2 border-border text-text hover:bg-surface'
                  }`}
                >
                  <span>Admin</span>
                  <span className="text-[10px] text-muted">(/admin)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('projector')}
                  disabled={isSubmitting}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                    initialRole === 'projector'
                      ? 'bg-accent/20 border-accent-bright text-text hover:bg-accent/30'
                      : 'bg-surface-2 border-border text-text hover:bg-surface'
                  }`}
                >
                  <span>Projector</span>
                  <span className="text-[10px] text-muted">(/projector)</span>
                </button>
              </div>
              <p className="text-[11px] text-muted mt-3 text-center">
                Supabase credentials not detected. Storage and state are operating locally.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-muted max-w-5xl mx-auto w-full">
        Fieldr Live Sports Auction Platform
      </div>
    </div>
  )
}
