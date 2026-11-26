import React, { Suspense, useEffect, useState } from 'react'
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
import { lazyWithRetry } from '../../lib/lazyWithRetry'
const MarkdownContent = lazyWithRetry(() =>
  import('../../components/common/MarkdownContent').then((m) => ({
    default: m.MarkdownContent
  }))
)
import {
  PUBLIC_BACK_LINK,
  PUBLIC_BTN_PRIMARY,
  PUBLIC_BTN_SECONDARY,
  PUBLIC_CARD,
  PUBLIC_FOLIO,
  PUBLIC_KICKER,
  PUBLIC_MAIN_NARROW,
  PUBLIC_META_ROW,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_SECTION_HEADER,
  PUBLIC_SECTION_TITLE
} from '../../components/public/publicStyles'
import { EmptyState, SkeletonBlock, SkeletonText } from '../../components/ui'
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
  let sectionIndex = 0
  const nextFolio = () => String(++sectionIndex).padStart(2, '0')

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
          <EmptyState
            icon={Lock}
            statusLabel="NO RECORDS"
            title="This page is not available"
            description="The reel competition is not live right now. Check back with the organizers."
            action={
              <Link to="/" className={`${PUBLIC_BTN_SECONDARY} px-5 py-2.5 text-xs`}>
                Back to Home
              </Link>
            }
          />
        ) : (
          <div className="space-y-10">
            <header className={PUBLIC_PAGE_HEADER}>
              <div className="space-y-1.5 min-w-0">
                <span className={PUBLIC_KICKER}>REEL COMPETITION</span>
                <h1 className={PUBLIC_PAGE_TITLE}>{settings.title}</h1>
                {settings.tagline.trim() && (
                  <p className="text-sm text-muted leading-relaxed max-w-prose pt-1">
                    {settings.tagline}
                  </p>
                )}
              </div>
              <div className={PUBLIC_META_ROW}>
                <span
                  className={`inline-flex items-center gap-1.5 font-semibold ${
                    phase === 'open' ? 'text-accent-bright' : 'text-muted'
                  }`}
                >
                  {phase === 'open' && (
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full bg-accent-bright shrink-0"
                    />
                  )}
                  <span>{PHASE_LABEL[phase]}</span>
                </span>
              </div>
            </header>

            {/* Primary Brief Card (single surface, hairline separated, no nested wells) */}
            <section className={`${PUBLIC_CARD} space-y-5`}>
              {settings.theme.trim() && (
                <div className="pb-5 border-b border-border">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-1.5">
                    Theme
                  </p>
                  <p className="font-syne font-bold text-lg sm:text-xl text-text leading-snug">
                    {settings.theme}
                  </p>
                </div>
              )}

              {settings.description_md.trim() && <Markdown content={settings.description_md} />}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-5 border-t border-border">
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
              <section className="space-y-4">
                <div className={PUBLIC_SECTION_HEADER}>
                  <div className="flex items-baseline gap-3">
                    <span className={PUBLIC_FOLIO}>{nextFolio()}</span>
                    <h2 className={PUBLIC_SECTION_TITLE}>Rules</h2>
                  </div>
                </div>
                <div className="pt-1">
                  <Markdown content={settings.rules_md} />
                </div>
              </section>
            )}

            {settings.eligibility_md.trim() && (
              <section className="space-y-4">
                <div className={PUBLIC_SECTION_HEADER}>
                  <div className="flex items-baseline gap-3">
                    <span className={PUBLIC_FOLIO}>{nextFolio()}</span>
                    <h2 className={PUBLIC_SECTION_TITLE}>Who can enter</h2>
                  </div>
                </div>
                <div className="pt-1">
                  <Markdown content={settings.eligibility_md} />
                </div>
              </section>
            )}

            {settings.prizes.length > 0 && (
              <section className="space-y-4">
                <div className={PUBLIC_SECTION_HEADER}>
                  <div className="flex items-baseline gap-3">
                    <span className={PUBLIC_FOLIO}>{nextFolio()}</span>
                    <h2 className={PUBLIC_SECTION_TITLE}>Prizes</h2>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {settings.prizes.length}{' '}
                    {settings.prizes.length === 1 ? 'award' : 'awards'}
                  </span>
                </div>
                <ul className="divide-y divide-border border-b border-border">
                  {settings.prizes.map((prize, idx) => (
                    <li
                      key={`${prize.place}-${idx}`}
                      className="py-4 px-1 flex items-center gap-3"
                    >
                      <Trophy size={18} weight="regular" className="text-accent-bright shrink-0" />
                      <span className="font-syne font-bold text-base text-text min-w-0">
                        {prize.place}
                      </span>
                      {prize.reward && (
                        <span className="ml-auto font-mono text-sm text-muted text-right min-w-0 break-words tabular-nums">
                          {prize.reward}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {settings.criteria.length > 0 && (
              <section className="space-y-4">
                <div className={PUBLIC_SECTION_HEADER}>
                  <div className="flex items-baseline gap-3">
                    <span className={PUBLIC_FOLIO}>{nextFolio()}</span>
                    <h2 className={PUBLIC_SECTION_TITLE}>How entries are judged</h2>
                  </div>
                </div>
                <ul className="divide-y divide-border border-b border-border">
                  {settings.criteria.map((c, idx) => (
                    <li key={`${c.name}-${idx}`} className="py-4 px-1 space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-syne font-bold text-base text-text min-w-0">
                          {c.name}
                        </span>
                        {totalWeight > 0 && (
                          <span className="font-mono text-xs font-semibold tabular-nums text-accent-bright shrink-0">
                            {c.weight}%
                          </span>
                        )}
                      </div>
                      {c.description && (
                        <p className="text-sm text-muted leading-relaxed">{c.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {settings.key_dates.length > 0 && (
              <section className="space-y-4">
                <div className={PUBLIC_SECTION_HEADER}>
                  <div className="flex items-baseline gap-3">
                    <span className={PUBLIC_FOLIO}>{nextFolio()}</span>
                    <h2 className={PUBLIC_SECTION_TITLE}>Key dates</h2>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {settings.key_dates.length}{' '}
                    {settings.key_dates.length === 1 ? 'milestone' : 'milestones'}
                  </span>
                </div>
                <dl className="relative pl-7">
                  {/* Vertical 1px timeline spine */}
                  <span
                    aria-hidden="true"
                    className="absolute left-[6px] top-5 bottom-5 w-px bg-border"
                  />
                  {settings.key_dates.map((d, idx) => (
                    <div
                      key={`${d.label}-${idx}`}
                      className="relative py-4 border-b border-border last:border-b-0 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4"
                    >
                      {/* Sage active node for first/current milestone, hollow nodes for others */}
                      <span
                        aria-hidden="true"
                        className={`absolute -left-7 top-5 w-3.5 h-3.5 rounded-full ring-4 ring-bg ${
                          idx === 0
                            ? 'bg-accent-bright'
                            : 'bg-bg border-2 border-border'
                        }`}
                      />
                      <dt className="font-syne font-bold text-base text-text">{d.label}</dt>
                      <dd className="font-mono text-xs sm:text-sm text-muted tabular-nums">
                        {d.when}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {gallery.length > 0 && (
              <section className="space-y-4">
                <div className={PUBLIC_SECTION_HEADER}>
                  <div className="flex items-baseline gap-3">
                    <span className={PUBLIC_FOLIO}>{nextFolio()}</span>
                    <h2 className={PUBLIC_SECTION_TITLE}>Featured entries</h2>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-muted">
                    {gallery.length} {gallery.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {gallery.map((item) => (
                    <li
                      key={item.id}
                      className="pub-card-lift bg-surface border border-border hover:border-accent-bright rounded-2xl p-5 flex flex-col gap-3 min-w-0"
                    >
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
                      <div className="flex items-center justify-between gap-3 pt-3 mt-auto border-t border-border">
                        <span className="font-mono text-[11px] text-muted truncate">
                          {item.category}
                        </span>
                        <a
                          href={item.reel_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative hit-44 inline-flex items-center gap-1.5 text-xs font-medium text-accent-bright hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright shrink-0"
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
              <section className="space-y-4">
                <div className={PUBLIC_SECTION_HEADER}>
                  <div className="flex items-baseline gap-3">
                    <span className={PUBLIC_FOLIO}>{nextFolio()}</span>
                    <h2 className={PUBLIC_SECTION_TITLE}>Questions</h2>
                  </div>
                </div>
                <div className="divide-y divide-border border-b border-border">
                  {settings.faqs.map((f, idx) => (
                    <details
                      key={`${f.q}-${idx}`}
                      className="group"
                    >
                      <summary className="flex items-center justify-between gap-3 min-h-[48px] py-4 px-1 cursor-pointer list-none text-sm font-medium text-text hover:text-accent-bright transition-colors [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">{f.q}</span>
                        <CaretDown
                          size={15}
                          weight="regular"
                          className="text-muted shrink-0 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                        />
                      </summary>
                      {f.a && (
                        <div className="px-1 pb-4 text-sm text-muted leading-relaxed whitespace-pre-line">
                          {f.a}
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              </section>
            )}

            {settings.contact_text.trim() && (
              <p className="text-xs text-muted leading-relaxed pt-2 border-t border-border">
                {settings.contact_text}
              </p>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
