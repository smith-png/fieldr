import React, { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Info, Lock, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
const MarkdownContent = lazy(() =>
  import('../../components/common/MarkdownContent').then((m) => ({
    default: m.MarkdownContent
  }))
)
import {
  PUBLIC_BACK_LINK,
  PUBLIC_BTN_PRIMARY,
  PUBLIC_BTN_SECONDARY,
  PUBLIC_CARD,
  PUBLIC_ERROR_BANNER,
  PUBLIC_INPUT,
  PUBLIC_LABEL,
  PUBLIC_MAIN_NARROW,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_SECTION_TITLE,
  PUBLIC_WELL
} from '../../components/public/publicStyles'
import { SkeletonBlock, SkeletonText } from '../../components/ui'
import { ACADEMIC_YEARS, getAcademicYearLabel } from '../../lib/academicYears'
import {
  DEFAULT_REEL_CONFIRMATION,
  getCachedReelSettings,
  getReelPhase,
  getReelSettings,
  submitReelEntry
} from '../../lib/data'
import { getErrorMessage } from '../../lib/errors'
import { prefetchRoute } from '../../lib/queryCache'
import { formatReelDateTime } from '../../lib/reelFormat'
import type { AcademicYear, ReelParticipation, ReelSettings } from '../../types'

const ROLL_REGEX = /^\d{1,5}$/
const PHONE_REGEX = /^[6-9]\d{9}$/
const DESCRIPTION_MAX = 300

function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, '').slice(0, max)
}

function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  return digits.slice(0, 10)
}

function hostAllowed(url: string, allowedHosts: string[]): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    return allowedHosts.some((h) => {
      const allowed = h.toLowerCase()
      return host === allowed || host.endsWith(`.${allowed}`)
    })
  } catch {
    return false
  }
}

interface MemberDraft {
  key: string
  name: string
  roll_no: string
}

export const ReelSubmitPage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [settings, setSettings] = useState<ReelSettings | null>(() => getCachedReelSettings())
  const [isLoading, setIsLoading] = useState<boolean>(() => !getCachedReelSettings())

  const loadedAtRef = useRef<number>(Date.now())
  const memberCounterRef = useRef(0)
  const [honeypot, setHoneypot] = useState('')

  const [fullName, setFullName] = useState('')
  const [rollNo, setRollNo] = useState('')
  const [academicYear, setAcademicYear] = useState<AcademicYear>('1st')
  const [whatsapp, setWhatsapp] = useState('')
  const [participation, setParticipation] = useState<ReelParticipation>('solo')
  const [teamName, setTeamName] = useState('')
  const [members, setMembers] = useState<MemberDraft[]>([])
  const [reelTitle, setReelTitle] = useState('')
  const [reelUrl, setReelUrl] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [musicCredit, setMusicCredit] = useState('')
  const [consentOriginal, setConsentOriginal] = useState(false)
  const [consentRules, setConsentRules] = useState(false)
  const [consentShare, setConsentShare] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<{ title: string; category: string } | null>(null)

  useEffect(() => {
    let mounted = true
    void getReelSettings(true).then((s) => {
      if (!mounted) return
      setSettings(s)
      setIsLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [])

  const effectiveCategory =
    category && settings?.categories.includes(category) ? category : settings?.categories[0] ?? ''

  const phase = settings ? getReelPhase(settings) : 'hidden'
  const isOpen = phase === 'open'
  const maxExtraMembers = Math.max(1, (settings?.max_team_size ?? 4) - 1)

  const addMember = () => {
    if (members.length >= maxExtraMembers) return
    memberCounterRef.current += 1
    setMembers((prev) => [
      ...prev,
      { key: `m-${memberCounterRef.current}`, name: '', roll_no: '' }
    ])
  }

  const updateMember = (key: string, patch: Partial<MemberDraft>) => {
    setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)))
  }

  const removeMember = (key: string) => {
    setMembers((prev) => prev.filter((m) => m.key !== key))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || !settings) return
    setFormError(null)

    const name = fullName.trim()
    const roll = rollNo.trim()
    const phone = normalisePhone(whatsapp)
    const title = reelTitle.trim()
    const url = reelUrl.trim()

    if (name.length < 2 || name.length > 100) {
      setFormError('Enter your full name (2 to 100 characters).')
      return
    }
    if (!ROLL_REGEX.test(roll)) {
      setFormError('Enter your roll number using digits only (for example 23131).')
      return
    }
    if (!PHONE_REGEX.test(phone)) {
      setFormError('Enter a valid 10 digit WhatsApp number.')
      return
    }

    let cleanMembers: { name: string; roll_no: string }[] = []
    if (participation === 'team') {
      if (teamName.trim().length < 2 || teamName.trim().length > 60) {
        setFormError('Enter a team name (2 to 60 characters).')
        return
      }
      cleanMembers = members.map((m) => ({ name: m.name.trim(), roll_no: m.roll_no.trim() }))
      for (const m of cleanMembers) {
        if (m.name.length < 2 || !ROLL_REGEX.test(m.roll_no)) {
          setFormError('Each team member needs a name and a roll number (digits only).')
          return
        }
      }
    }

    if (title.length < 2 || title.length > 100) {
      setFormError('Enter a reel title (2 to 100 characters).')
      return
    }
    if (!hostAllowed(url, settings.allowed_hosts)) {
      setFormError(
        `Enter a valid https link from an accepted site: ${settings.allowed_hosts.join(', ')}.`
      )
      return
    }
    if (!effectiveCategory) {
      setFormError('Choose a category.')
      return
    }
    if (!(consentOriginal && consentRules && consentShare)) {
      setFormError('Tick all three confirmations to submit.')
      return
    }

    const elapsedMs = Date.now() - loadedAtRef.current
    if (elapsedMs < 4000) {
      setFormError('Please wait a moment and review your details before submitting.')
      return
    }

    try {
      setIsSubmitting(true)
      await submitReelEntry({
        fullName: name,
        rollNo: roll,
        academicYear,
        whatsapp: phone,
        participation,
        teamName: participation === 'team' ? teamName.trim() : '',
        teamMembers: cleanMembers,
        reelTitle: title,
        reelUrl: url,
        category: effectiveCategory,
        description: description.trim(),
        musicCredit: musicCredit.trim(),
        consentOriginal,
        consentRules,
        consentShare,
        honeypot,
        elapsedMs
      })
      setSubmitted({ title, category: effectiveCategory })
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, 'Your reel could not be submitted. Please try again.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const closesText = formatReelDateTime(settings?.closes_at)
  const opensText = formatReelDateTime(settings?.opens_at)

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className={PUBLIC_MAIN_NARROW}>
        <div className="mb-6">
          <Link
            to="/reels"
            onMouseEnter={() => prefetchRoute('/reels')}
            onFocus={() => prefetchRoute('/reels')}
            onTouchStart={() => prefetchRoute('/reels')}
            className={PUBLIC_BACK_LINK}
          >
            <ArrowLeft size={14} weight="regular" />
            <span>Competition details</span>
          </Link>
        </div>

        <header className={PUBLIC_PAGE_HEADER}>
          <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-mono uppercase tracking-widest text-muted">
              {settings?.title || 'Reel Competition'}
            </p>
            <h1 className={PUBLIC_PAGE_TITLE}>Submit your reel</h1>
          </div>
        </header>

        {isLoading ? (
          <div className={`${PUBLIC_CARD} space-y-5`}>
            <SkeletonText width="w-1/2" className="h-5" />
            <SkeletonBlock className="h-12 bg-bg border border-border rounded-2xl" />
            <SkeletonBlock className="h-12 bg-bg border border-border rounded-2xl" />
            <SkeletonBlock className="h-36 bg-bg border border-border rounded-2xl" />
          </div>
        ) : submitted && settings ? (
          <section className={`${PUBLIC_CARD} space-y-6`}>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-surface-2 border border-accent-bright/40 flex items-center justify-center text-accent-bright shrink-0">
                <CheckCircle size={24} weight="regular" />
              </div>
              <div className="space-y-2 min-w-0">
                <h2 className={PUBLIC_SECTION_TITLE}>Reel received</h2>
                <p className="text-sm text-text leading-relaxed">
                  {settings.confirmation_message || DEFAULT_REEL_CONFIRMATION}
                </p>
              </div>
            </div>
            <div className={`${PUBLIC_WELL} p-4 sm:p-5 flex flex-wrap items-center justify-between gap-2`}>
              <span className="font-medium text-sm text-text break-words min-w-0">
                {submitted.title}
              </span>
              <span className="text-xs font-mono text-muted">{submitted.category}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/reels" className={`${PUBLIC_BTN_PRIMARY} min-h-[44px] px-6 text-sm`}>
                Back to competition
              </Link>
              <Link to="/" className={`${PUBLIC_BTN_SECONDARY} min-h-[44px] px-6 text-sm`}>
                Return Home
              </Link>
            </div>
          </section>
        ) : !settings || !isOpen ? (
          <section className={`${PUBLIC_CARD} space-y-5`}>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                <Lock size={22} weight="regular" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <h2 className={PUBLIC_SECTION_TITLE}>Submissions are closed</h2>
                <p className="text-sm text-muted leading-relaxed">
                  {settings && phase === 'upcoming' && opensText
                    ? `Reel submissions open on ${opensText}.`
                    : settings && phase === 'ended' && closesText
                    ? `Reel submissions closed on ${closesText}.`
                    : settings?.closed_message || 'Reel submissions are not open right now.'}
                </p>
              </div>
            </div>
            <Link to="/reels" className={`${PUBLIC_BTN_SECONDARY} min-h-[42px] px-5 text-sm`}>
              Competition details
            </Link>
          </section>
        ) : (
          <div className="space-y-6">
            <section className={`${PUBLIC_CARD} space-y-4`}>
              {settings.instructions_md.trim() ? (
                <Suspense fallback={<SkeletonText width="w-full" className="h-4" />}>
                  <MarkdownContent content={settings.instructions_md} />
                </Suspense>
              ) : (
                <p className="text-sm text-muted leading-relaxed">
                  Post your reel on an accepted site, make sure the link opens without signing in,
                  then paste it below.
                </p>
              )}
              <div className={`${PUBLIC_WELL} p-4 flex items-start gap-2.5`}>
                <Info size={18} weight="regular" className="text-accent-bright shrink-0 mt-0.5" />
                <p className="text-xs text-muted leading-relaxed">
                  Accepted sites: {settings.allowed_hosts.join(', ')}. The link must start with
                  https and be viewable by anyone who has it.
                </p>
              </div>
              {closesText && (
                <p className="text-xs font-mono text-muted">Closes {closesText}</p>
              )}
            </section>

            <form onSubmit={handleSubmit} className={`${PUBLIC_CARD} space-y-6`} noValidate>
              <div
                aria-hidden="true"
                className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden opacity-0 pointer-events-none"
              >
                <label htmlFor="reel-website-hp">Website</label>
                <input
                  id="reel-website-hp"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              {/* About you */}
              <div className="space-y-4">
                <h2 className={PUBLIC_SECTION_TITLE}>About you</h2>

                <div>
                  <label htmlFor="reel-name" className={PUBLIC_LABEL}>
                    Full name *
                  </label>
                  <input
                    id="reel-name"
                    type="text"
                    required
                    maxLength={100}
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isSubmitting}
                    className={PUBLIC_INPUT}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reel-roll" className={PUBLIC_LABEL}>
                      Roll number *
                    </label>
                    <input
                      id="reel-roll"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      maxLength={5}
                      autoComplete="off"
                      value={rollNo}
                      onChange={(e) => setRollNo(digitsOnly(e.target.value, 5))}
                      placeholder="e.g. 23131"
                      disabled={isSubmitting}
                      className={`${PUBLIC_INPUT} font-mono`}
                    />
                    <p className="mt-1.5 text-xs text-muted">
                      Digits only. Used for verification, never shown publicly.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="reel-year" className={PUBLIC_LABEL}>
                      Academic year *
                    </label>
                    <select
                      id="reel-year"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value as AcademicYear)}
                      disabled={isSubmitting}
                      className={PUBLIC_INPUT}
                    >
                      {ACADEMIC_YEARS.map((yr) => (
                        <option key={yr.value} value={yr.value}>
                          {getAcademicYearLabel(yr.value)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="max-w-sm">
                  <label htmlFor="reel-phone" className={PUBLIC_LABEL}>
                    WhatsApp number *
                  </label>
                  <input
                    id="reel-phone"
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={14}
                    autoComplete="tel-national"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d+\s]/g, ''))}
                    placeholder="10 digit number"
                    disabled={isSubmitting}
                    className={`${PUBLIC_INPUT} font-mono`}
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    Only the organizers use this, to contact you about your entry. Never shown
                    publicly.
                  </p>
                </div>
              </div>

              {/* Entry type */}
              <div className="pt-5 border-t border-border space-y-4">
                <h2 className={PUBLIC_SECTION_TITLE}>Entry type</h2>

                <div
                  role="radiogroup"
                  aria-label="Entry type"
                  className="inline-flex flex-nowrap items-center gap-1 p-1 rounded-full bg-surface-2 border border-border w-max"
                >
                  {(['solo', 'team'] as const).map((opt) => {
                    const selected = participation === opt
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={isSubmitting}
                        onClick={() => setParticipation(opt)}
                        className={`min-h-[36px] px-5 py-1 rounded-full text-sm transition-colors cursor-pointer ${
                          selected
                            ? 'bg-btn-bg text-btn-fg font-medium'
                            : 'text-muted hover:text-text font-normal'
                        }`}
                      >
                        {opt === 'solo' ? 'Solo' : 'Team'}
                      </button>
                    )
                  })}
                </div>

                {participation === 'team' && (
                  <div className="space-y-4">
                    <div className="max-w-sm">
                      <label htmlFor="reel-team" className={PUBLIC_LABEL}>
                        Team name *
                      </label>
                      <input
                        id="reel-team"
                        type="text"
                        maxLength={60}
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        disabled={isSubmitting}
                        className={PUBLIC_INPUT}
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-muted">
                          You are the team lead. Add up to {maxExtraMembers} more{' '}
                          {maxExtraMembers === 1 ? 'member' : 'members'}.
                        </p>
                        {members.length < maxExtraMembers && (
                          <button
                            type="button"
                            onClick={addMember}
                            disabled={isSubmitting}
                            className={`${PUBLIC_BTN_SECONDARY} min-h-[36px] px-3.5 text-xs shrink-0`}
                          >
                            <Plus size={14} weight="bold" />
                            <span>Add member</span>
                          </button>
                        )}
                      </div>

                      {members.map((m, idx) => (
                        <div
                          key={m.key}
                          className={`${PUBLIC_WELL} p-4 grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-3 items-end`}
                        >
                          <div>
                            <label
                              htmlFor={`reel-member-name-${idx}`}
                              className="block text-xs font-medium text-muted mb-1.5"
                            >
                              Member name
                            </label>
                            <input
                              id={`reel-member-name-${idx}`}
                              type="text"
                              maxLength={100}
                              value={m.name}
                              onChange={(e) => updateMember(m.key, { name: e.target.value })}
                              disabled={isSubmitting}
                              className={PUBLIC_INPUT}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`reel-member-roll-${idx}`}
                              className="block text-xs font-medium text-muted mb-1.5"
                            >
                              Roll number
                            </label>
                            <input
                              id={`reel-member-roll-${idx}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={5}
                              value={m.roll_no}
                              onChange={(e) =>
                                updateMember(m.key, { roll_no: digitsOnly(e.target.value, 5) })
                              }
                              disabled={isSubmitting}
                              className={`${PUBLIC_INPUT} font-mono`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMember(m.key)}
                            disabled={isSubmitting}
                            aria-label={`Remove team member ${idx + 1}`}
                            className="relative hit-44 w-10 h-10 rounded-full border border-border bg-surface-2 flex items-center justify-center text-muted hover:text-error hover:border-error/40 transition-colors cursor-pointer justify-self-end"
                          >
                            <Trash size={16} weight="regular" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Your reel */}
              <div className="pt-5 border-t border-border space-y-4">
                <h2 className={PUBLIC_SECTION_TITLE}>Your reel</h2>

                <div>
                  <label htmlFor="reel-title" className={PUBLIC_LABEL}>
                    Reel title *
                  </label>
                  <input
                    id="reel-title"
                    type="text"
                    required
                    maxLength={100}
                    value={reelTitle}
                    onChange={(e) => setReelTitle(e.target.value)}
                    disabled={isSubmitting}
                    className={PUBLIC_INPUT}
                  />
                </div>

                <div>
                  <label htmlFor="reel-url" className={PUBLIC_LABEL}>
                    Reel link *
                  </label>
                  <input
                    id="reel-url"
                    type="url"
                    inputMode="url"
                    required
                    maxLength={300}
                    autoComplete="off"
                    value={reelUrl}
                    onChange={(e) => setReelUrl(e.target.value)}
                    placeholder="https://"
                    disabled={isSubmitting}
                    className={`${PUBLIC_INPUT} font-mono`}
                  />
                </div>

                <div className="max-w-sm">
                  <label htmlFor="reel-category" className={PUBLIC_LABEL}>
                    Category *
                  </label>
                  <select
                    id="reel-category"
                    value={effectiveCategory}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={isSubmitting}
                    className={PUBLIC_INPUT}
                  >
                    {settings.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label htmlFor="reel-desc" className="text-sm font-medium text-text">
                      Short description
                    </label>
                    <span className="text-xs font-mono tabular-nums text-muted">
                      {description.length}/{DESCRIPTION_MAX}
                    </span>
                  </div>
                  <textarea
                    id="reel-desc"
                    rows={3}
                    maxLength={DESCRIPTION_MAX}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isSubmitting}
                    className={`${PUBLIC_INPUT} resize-y leading-relaxed`}
                  />
                </div>

                <div>
                  <label htmlFor="reel-music" className={PUBLIC_LABEL}>
                    Music and asset credits
                  </label>
                  <input
                    id="reel-music"
                    type="text"
                    maxLength={150}
                    value={musicCredit}
                    onChange={(e) => setMusicCredit(e.target.value)}
                    placeholder="Track name and artist, or sources of footage"
                    disabled={isSubmitting}
                    className={PUBLIC_INPUT}
                  />
                </div>
              </div>

              {/* Confirmations */}
              <div className="pt-5 border-t border-border space-y-3">
                <h2 className={PUBLIC_SECTION_TITLE}>Confirmations</h2>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={consentOriginal}
                    onChange={(e) => setConsentOriginal(e.target.checked)}
                    disabled={isSubmitting}
                    className="mt-1 h-4 w-4 rounded border-border bg-bg accent-accent-bright shrink-0 cursor-pointer"
                  />
                  <span className="text-sm text-text leading-relaxed">{settings.consent_text}</span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={consentRules}
                    onChange={(e) => setConsentRules(e.target.checked)}
                    disabled={isSubmitting}
                    className="mt-1 h-4 w-4 rounded border-border bg-bg accent-accent-bright shrink-0 cursor-pointer"
                  />
                  <span className="text-sm text-text leading-relaxed">
                    I have read and accept the{' '}
                    <Link
                      to="/reels"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-bright underline underline-offset-4"
                    >
                      competition rules
                    </Link>
                    .
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={consentShare}
                    onChange={(e) => setConsentShare(e.target.checked)}
                    disabled={isSubmitting}
                    className="mt-1 h-4 w-4 rounded border-border bg-bg accent-accent-bright shrink-0 cursor-pointer"
                  />
                  <span className="text-sm text-text leading-relaxed">
                    The organizers may share my reel and name (or team name) on the Fieldr site
                    and college channels.
                  </span>
                </label>
              </div>

              {formError && (
                <div role="alert" className={PUBLIC_ERROR_BANNER}>
                  <WarningCircle size={16} weight="regular" className="text-error shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Entries are checked by the organizers before they are counted.
                </p>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`${PUBLIC_BTN_PRIMARY} min-h-[46px] px-7 text-sm shrink-0`}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit reel'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
