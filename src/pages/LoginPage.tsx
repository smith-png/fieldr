import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ArrowLeft, LockKey, SignIn, User, WarningCircle } from '@phosphor-icons/react'
import { BrandMark } from '../components/BrandMark'
import { useAuth } from '../lib/AuthContext'
import type { UserRole } from '../lib/types'

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
    <div className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex flex-col justify-between p-6 md:p-12 relative overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
        <BrandMark />
        <Link
          to="/"
          className="flex items-center gap-2 text-xs md:text-sm font-medium text-[#8E928C] hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Home</span>
        </Link>
      </div>

      {/* Main Login Card */}
      <div className="max-w-md w-full mx-auto my-auto py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="p-8 md:p-10 rounded-3xl bg-[#141414] border border-white/10 shadow-2xl relative"
        >
          {/* Header */}
          <div className="mb-8">
            <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-2">
              Authentication
            </span>
            <h1 className="font-syne font-bold text-3xl text-white tracking-tight">
              Sign in to Fieldr
            </h1>
            <p className="text-sm text-[#8E928C] mt-2">
              Access the administrative control center or projector display.
            </p>
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className="mb-6 p-3 rounded-xl bg-[#1F0E0E] border border-[#B91C1C]/40 flex items-center gap-2.5 text-xs text-[#F0F2EE]">
              <WarningCircle size={18} weight="fill" className="text-[#B91C1C] shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-[#CBD1CB] uppercase tracking-wider mb-2">
                Email address
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@fieldr.app"
                  required
                  className="w-full px-4 py-3 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#047554] focus:ring-1 focus:ring-[#047554] transition-all"
                />
                <User size={18} className="absolute right-3.5 top-3.5 text-[#8E928C]" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#CBD1CB] uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full px-4 py-3 bg-[#0B0B0B] border border-white/10 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#047554] focus:ring-1 focus:ring-[#047554] transition-all"
                />
                <LockKey size={18} className="absolute right-3.5 top-3.5 text-[#8E928C]" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 w-full py-3.5 rounded-full bg-white text-[#0B0B0B] font-medium text-sm hover:bg-[#F0F2EE] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047554]"
            >
              <SignIn size={18} weight="bold" />
              <span>{isSubmitting ? 'Authenticating...' : 'Sign in'}</span>
            </button>
          </form>

          {/* Quick Demo Login Buttons - ONLY in demo mode */}
          {isDemo && (
            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-[#8E928C]">
                  Demo mode: One-click sign in
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#047554]/20 text-[#047554] font-medium">
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
                      ? 'bg-[#19241B] border-[#047554] text-white hover:bg-[#1E2E21]'
                      : 'bg-[#151715] border-white/10 text-[#CBD1CB] hover:bg-[#1C1F1C]'
                  }`}
                >
                  <span>Admin</span>
                  <span className="text-[10px] text-[#8E928C]">(/admin)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('projector')}
                  disabled={isSubmitting}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-medium transition-all text-center flex items-center justify-center gap-1.5 ${
                    initialRole === 'projector'
                      ? 'bg-[#19241B] border-[#047554] text-white hover:bg-[#1E2E21]'
                      : 'bg-[#151715] border-white/10 text-[#CBD1CB] hover:bg-[#1C1F1C]'
                  }`}
                >
                  <span>Projector</span>
                  <span className="text-[10px] text-[#8E928C]">(/projector)</span>
                </button>
              </div>
              <p className="text-[11px] text-[#8E928C] mt-3 text-center">
                Supabase credentials not detected. Storage and state are operating locally.
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-[#8E928C] max-w-5xl mx-auto w-full">
        Fieldr Live Sports Auction Platform
      </div>
    </div>
  )
}
