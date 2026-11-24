import React, { Suspense, lazy, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowSquareOut,
  CaretDown,
  FilmSlate,
  Lock,
  Trophy
} from '@phosphor-icons/react'
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
  PUBLIC_COUNT_PILL,
  PUBLIC_MAIN_NARROW,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_SECTION_TITLE,
  PUBLIC_WELL
} from '../../components/public/publicStyles'
import { SkeletonBlock, SkeletonText } from '../../components/ui'
import {
  getCachedReelSettings,
  getPublicReelGallery,
  getReelPhase,
  getReelSettings
} from '../../lib/data'
import { formatReelCountdown, formatReelDateTime } from '../../lib/reelFormat'
import { prefetchRoute } from '../../lib/queryCache'
import type { PublicReelGalleryItem, ReelPhase, ReelSettings } from '../../types'

const PHASE_LABEL: Record<ReelPhase, string> = {
  hidden: 'Unavailable',
  upcoming: 'Opens soon',
  open: 'Open',
  closed: 'Closed',
  ended: 'Ended'
}

const Markdown: React.FC<{ content: string }> = ({ content }) => (
  <Suspense fallback={<SkeletonText width="w-full" className="h-4" />}>
    <MarkdownContent content={content} />
  </Suspense>
)

export const ReelsPage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [settings, setSettings] = useState<ReelSettings | null>(() => getCachedReelSettings())
  const [isLoading, setIsLoading] = useState<boolean>(() => !getCachedReelSettings())
  const [gallery, setGallery] = useState<PublicReelGalleryItem[]>([])
  const [now, setNow] = useState<number>(() => Date.now())

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

  const showGallery = Boolean(settings?.is_visible && settings.show_gallery)
  useEffect(() => {
    if (!showGallery) {
      setGallery([])
      return
    }
    let mounted = true
    void getPublicReelGallery().then((items) => {
      if (mounted) setGallery(items)
    })
    return () => {
      mounted = false
    }
  }, [showGallery])

  // Countdown refresh only while a deadline or opening time is ahead (no network)
  const hasUpcomingTime = Boolean(
    settings &&
      ((settings.opens_at && Date.parse(settings.opens_at) > now) ||
        (settings.closes_at && Date.parse(settings.closes_at) > now))
  )
  useEffect(() => {
    if (!hasUpcomingTime) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [hasUpcomingTime])

  const phase: ReelPhase = settings ? getReelPhase(settings, now) : 'hidden'
  const countdown =
    phase === 'open'
      ? formatReelCountdown(settings?.closes_at, now)
      : phase === 'upcoming'
      ? formatReelCountdown(settings?.opens_at, now)
      : null
  const closesText = formatReelDateTime(settings?.closes_at)
  const opensText = formatReelDateTime(settings?.opens_at)

  const totalWeight = settings?.criteria.reduce((sum, c) => sum + c.weight, 0) ?? 0

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className={PUBLIC_MAIN_NARROW}>
        <div className="mb-6">
          <Link
            to="/"
            onMouseEnter={() => prefetchRoute('/')}
            onFocus={() => prefetchRoute('/')}
            onTouchStart={() => prefetchRoute('/')}
            className={PUBLIC_BACK_LINK}
          >
            <ArrowLeft size={14} weight="regular" />
            <span>Return Home</span>
          </Link>
        </div>

        {isLoading ? (
          <div className={`${PUBLIC_CARD} space-y-5`}>
            <SkeletonText width="w-1/2" className="h-6" />
            <SkeletonBlock className="h-12 bg-bg border border-border rounded-2xl" />
            <SkeletonBlock className="h-36 bg-bg border border-border rounded-2xl" />
          </div>
        ) : !settings || phase === 'hidden' ? (
          <section className={`${PUBLIC_CARD} space-y-5`}>
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-2xl bg-surface-2 border border-border flex items-center justify-center text-muted shrink-0">
                <Lock size={22} weight="regular" />
              </div>
              <div className="space-y-1.5 min-w-0">
                <h1 className={PUBLIC_SECTION_TITLE}>This page is not available</h1>
                <p className="text-sm text-muted leading-relaxed">
                  The reel competition is not live right now. Check back with the organizers.
                </p>
              </div>
            </div>
            <Link to="/" className={`${PUBLIC_BTN_SECONDARY} min-h-[42px] px-5 text-sm`}>
              Back to Home
            </Link>
          </section>
        ) : (
          <div className="space-y-6">
            <header className={PUBLIC_PAGE_HEADER}>
              <div className="space-y-2 min-w-0">
                <h1 className={PUBLIC_PAGE_TITLE}>{settings.title}</h1>
                {settings.tagline.trim() && (
                  <p className="text-sm text-muted leading-relaxed max-w-prose">
                    {settings.tagline}
                  </p>
                )}
              </div>
              <span
                className={`${PUBLIC_COUNT_PILL} ${
                  phase === 'open' ? 'border-accent-bright text-accent-bright' : ''
                }`}
              >
                {PHASE_LABEL[phase]}
              </span>
            </header>

            <section className={`${PUBLIC_CARD} space-y-5`}>
              {settings.theme.trim() && (
                <div className={`${PUBLIC_WELL} p-4 sm:p-5`}>
                  <p className="text-xs font-medium text-muted mb-1.5">Theme</p>
                  <p className="font-syne font-bold text-lg text-text leading-snug">
                    {settings.theme}
                  </p>
                </div>
              )}

              {settings.description_md.trim() && <Markdown content={settings.description_md} />}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                <div className="space-y-1 min-w-0">
                  {phase === 'open' && (
                    <>
                      {countdown && (
                        <p className="text-sm font-medium text-text">Closes in {countdown}</p>
                      )}
                      {closesText && (
                        <p className="text-xs font-mono text-muted">Deadline {closesText}</p>
                      )}
                    </>
                  )}
                  {phase === 'upcoming' && (
                    <>
                      {countdown && (
                        <p className="text-sm font-medium text-text">Opens in {countdown}</p>
                      )}
                      {opensText && (
                        <p className="text-xs font-mono text-muted">Opens {opensText}</p>
                      )}
                    </>
                  )}
                  {phase === 'ended' && (
                    <p className="text-sm text-muted">
                      {closesText
                        ? `Submissions closed on ${closesText}.`
                        : settings.closed_message}
                    </p>
                  )}
                  {phase === 'closed' && (
                    <p className="text-sm text-muted">{settings.closed_message}</p>
                  )}
                </div>

                {phase === 'open' ? (
                  <Link
                    to="/reels/submit"
                    onMouseEnter={() => prefetchRoute('/reels/submit')}
                    onFocus={() => prefetchRoute('/reels/submit')}
                    onTouchStart={() => prefetchRoute('/reels/submit')}
                    className={`${PUBLIC_BTN_PRIMARY} min-h-[46px] px-7 text-sm shrink-0`}
                  >
                    <FilmSlate size={18} weight="regular" />
                    <span>Submit your reel</span>
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={`${PUBLIC_BTN_SECONDARY} min-h-[46px] px-7 text-sm shrink-0 opacity-50 pointer-events-none`}
                  >
                    Submissions unavailable
                  </span>
                )}
              </div>
            </section>

            {settings.rules_md.trim() && (
              <section className={`${PUBLIC_CARD} space-y-4`}>
                <h2 className={PUBLIC_SECTION_TITLE}>Rules</h2>
                <Markdown content={settings.rules_md} />
              </section>
            )}

            {settings.eligibility_md.trim() && (
              <section className={`${PUBLIC_CARD} space-y-4`}>
                <h2 className={PUBLIC_SECTION_TITLE}>Who can enter</h2>
                <Markdown content={settings.eligibility_md} />
              </section>
            )}

            {settings.prizes.length > 0 && (
              <section className={`${PUBLIC_CARD} space-y-4`}>
                <h2 className={PUBLIC_SECTION_TITLE}>Prizes</h2>
                <ul className="space-y-2.5">
                  {settings.prizes.map((prize, idx) => (
                    <li
                      key={`${prize.place}-${idx}`}
                      className={`${PUBLIC_WELL} p-4 flex items-center gap-3`}
                    >
                      <Trophy size={18} weight="regular" className="text-accent-bright shrink-0" />
                      <span className="font-medium text-sm text-text min-w-0">{prize.place}</span>
                      {prize.reward && (
                        <span className="ml-auto text-sm text-muted text-right min-w-0 break-words">
                          {prize.reward}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {settings.criteria.length > 0 && (
              <section className={`${PUBLIC_CARD} space-y-4`}>
                <h2 className={PUBLIC_SECTION_TITLE}>How entries are judged</h2>
                <ul className="space-y-2.5">
                  {settings.criteria.map((c, idx) => (
                    <li key={`${c.name}-${idx}`} className={`${PUBLIC_WELL} p-4 space-y-1`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-sm text-text min-w-0">{c.name}</span>
                        {totalWeight > 0 && (
                          <span className="font-mono text-xs tabular-nums text-accent-bright shrink-0">
                            {c.weight}%
                          </span>
                        )}
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted leading-relaxed">{c.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {settings.key_dates.length > 0 && (
              <section className={`${PUBLIC_CARD} space-y-4`}>
                <h2 className={PUBLIC_SECTION_TITLE}>Key dates</h2>
                <dl className="space-y-2.5">
                  {settings.key_dates.map((d, idx) => (
                    <div
                      key={`${d.label}-${idx}`}
                      className={`${PUBLIC_WELL} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4`}
                    >
                      <dt className="text-sm font-medium text-text">{d.label}</dt>
                      <dd className="text-sm text-muted">{d.when}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {gallery.length > 0 && (
              <section className={`${PUBLIC_CARD} space-y-4`}>
                <h2 className={PUBLIC_SECTION_TITLE}>Featured entries</h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {gallery.map((item) => (
                    <li key={item.id} className={`${PUBLIC_WELL} p-4 flex flex-col gap-3 min-w-0`}>
                      <div className="space-y-1 min-w-0">
                        <p className="font-syne font-bold text-base text-text leading-snug break-words">
                          {item.reel_title}
                        </p>
                        <p className="text-xs text-muted break-words">
                          {item.participation === 'team' && item.team_name
                            ? `${item.team_name} (team)`
                            : item.full_name}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 mt-auto">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-2 border border-border text-[11px] text-muted">
                          {item.category}
                        </span>
                        <a
                          href={item.reel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-bright hover:underline"
                        >
                          <span>Watch reel</span>
                          <ArrowSquareOut size={14} weight="regular" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {settings.faqs.length > 0 && (
              <section className={`${PUBLIC_CARD} space-y-4`}>
                <h2 className={PUBLIC_SECTION_TITLE}>Questions</h2>
                <div className="space-y-2.5">
                  {settings.faqs.map((f, idx) => (
                    <details
                      key={`${f.q}-${idx}`}
                      className={`${PUBLIC_WELL} group`}
                    >
                      <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">{f.q}</span>
                        <CaretDown
                          size={14}
                          weight="regular"
                          className="text-muted shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                        />
                      </summary>
                      {f.a && (
                        <div className="px-4 pb-4 text-sm text-muted leading-relaxed whitespace-pre-line">
                          {f.a}
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              </section>
            )}

            {settings.contact_text.trim() && (
              <p className="text-xs text-muted leading-relaxed px-1">{settings.contact_text}</p>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
