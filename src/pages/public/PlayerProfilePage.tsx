import { logError } from '../../lib/logger'
import React, { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Calendar, Trophy, User } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_BACK_LINK,
  PUBLIC_CARD,
  PUBLIC_COUNT_PILL,
  PUBLIC_MAIN_MEDIUM,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE,
  PUBLIC_SECTION_TITLE
} from '../../components/public/publicStyles'
import {
  EmptyState,
  ErrorState,
  SkeletonBlock,
  SkeletonCard,
  SkeletonText
} from '../../components/ui'
import { getAthleteByCode, getAthleteCareer } from '../../lib/data/athletes'
import { formatAthleteCode } from '../../lib/data/client'
import { getActiveSeason } from '../../lib/data/seasons'
import { hasDataChanged, publicCache, type PlayerProfileCacheEntry } from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import { SPORTS } from '../../lib/sports'
import type { Athlete, AthleteCareerEntry, Season } from '../../types'

function getProfileCacheKey(code?: string): string {
  return (code || '').trim().toLowerCase()
}

function resolveSportLabel(slug: string, explicitLabel?: string): string {
  const known = SPORTS.find((s) => s.slug === slug)
  if (known) return known.label
  if (explicitLabel) return explicitLabel
  return slug ? `${slug.charAt(0).toUpperCase()}${slug.slice(1)}` : ''
}

export const PlayerProfilePage: React.FC = () => {
  const { code } = useParams<{ code: string }>()
  const [searchParams] = useSearchParams()
  const cacheKey = getProfileCacheKey(code)
  const initialCached = cacheKey ? publicCache.playerProfiles.get(cacheKey) : undefined

  const rawFromSport = (searchParams.get('from') || '').trim().toLowerCase()
  const fromSport = /^[a-z0-9-]+$/i.test(rawFromSport) ? rawFromSport : ''
  const fromSportName = (searchParams.get('sportName') || '').trim()
  const fromYear = (searchParams.get('year') || '').trim()
  const fromRole = (searchParams.get('role') || '').trim()

  let backTo = '/rosters'
  let backPrefetchPath = '/rosters'
  let backLabel = 'Back to rosters'

  if (fromSport) {
    const backParams = new URLSearchParams()
    if (fromYear && fromYear !== 'All') backParams.set('year', fromYear)
    if (fromRole && fromRole !== 'All') backParams.set('role', fromRole)
    const qs = backParams.toString()
    backPrefetchPath = `/rosters/${encodeURIComponent(fromSport)}`
    backTo = `${backPrefetchPath}${qs ? `?${qs}` : ''}`
    backLabel = `Back to ${resolveSportLabel(fromSport, fromSportName)} squad`
  }

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(
    publicCache.activeSeason.value
  )
  const [athlete, setAthlete] = useState<Athlete | null>(
    initialCached?.athlete ?? null
  )
  const [career, setCareer] = useState<AthleteCareerEntry[]>(
    initialCached?.career ?? []
  )
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached)
  const [hasError, setHasError] = useState<boolean>(false)
  const isMountedRef = useRef(true)
  const latestReqIdRef = useRef(0)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const loadData = async (options?: { force?: boolean }) => {
    if (!code) return
    const reqId = ++latestReqIdRef.current
    const key = getProfileCacheKey(code)
    const queryKey = `public:playerProfile:${key}`
    const cached = publicCache.playerProfiles.get(key)

    if (cached && !options?.force) {
      setAthlete(cached.athlete)
      setCareer(cached.career)
      setIsLoading(false)
      if (isQueryFresh(queryKey) && !shouldRevalidateQuery(queryKey)) {
        return
      }
    } else if (!cached) {
      setIsLoading(true)
    }
    setHasError(false)

    try {
      const [active, profile] = await Promise.all([
        publicCache.activeSeason.loaded && !options?.force
          ? Promise.resolve(publicCache.activeSeason.value)
          : getActiveSeason(),
        getAthleteByCode(code)
      ])
      if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
      const prevActive = publicCache.activeSeason.value
      const activeChanged =
        !publicCache.activeSeason.loaded || hasDataChanged(prevActive, active)
      publicCache.activeSeason = { loaded: true, value: active }
      if (activeChanged) {
        setActiveSeason(active)
      }

      if (!profile) {
        const emptyEntry: PlayerProfileCacheEntry = { athlete: null, career: [] }
        publicCache.playerProfiles.set(key, emptyEntry)
        setCachedQuery(queryKey, emptyEntry)
        setAthlete(null)
        setCareer([])
        return
      }

      const history = await getAthleteCareer(profile.id)
      if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
      const nextEntry: PlayerProfileCacheEntry = {
        athlete: profile,
        career: history
      }
      const prevEntry = publicCache.playerProfiles.get(key)
      const changed = !prevEntry || hasDataChanged(prevEntry, nextEntry)
      publicCache.playerProfiles.set(key, nextEntry)
      setCachedQuery(queryKey, nextEntry)

      if (changed) {
        setAthlete(profile)
        setCareer(history)
      }
    } catch (err) {
      if (!isMountedRef.current || reqId !== latestReqIdRef.current) return
      logError(
        'Failed to load athlete profile data:',
        err instanceof Error ? err.message : err,
        err
      )
      if (!cached) {
        setHasError(true)
      }
    } finally {
      if (isMountedRef.current && reqId === latestReqIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadData()
  }, [code])

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      <main className={PUBLIC_MAIN_MEDIUM}>
        <div className="mb-6">
          <Link
            to={backTo}
            onMouseEnter={() => prefetchRoute(backPrefetchPath)}
            onFocus={() => prefetchRoute(backPrefetchPath)}
            onTouchStart={() => prefetchRoute(backPrefetchPath)}
            className={PUBLIC_BACK_LINK}
          >
            <ArrowLeft size={14} weight="regular" />
            <span>{backLabel}</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-6">
            <div className={`${PUBLIC_CARD} flex flex-col sm:flex-row items-center sm:items-start gap-6`}>
              <SkeletonBlock className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl shrink-0" />
              <div className="flex-1 space-y-3 w-full">
                <SkeletonBlock className="w-24 h-6 rounded-full" />
                <SkeletonBlock className="w-64 h-10 rounded-2xl" />
                <SkeletonText width="w-40" />
                <SkeletonText width="w-56" />
              </div>
            </div>
            <div className="space-y-4">
              <SkeletonBlock className="w-48 h-7 rounded-2xl" />
              <SkeletonCard className="rounded-3xl min-h-[110px]" />
              <SkeletonCard className="rounded-3xl min-h-[110px]" />
            </div>
          </div>
        ) : hasError ? (
          <ErrorState
            title="Failed to Load Athlete Profile"
            description="We encountered an issue retrieving this athlete's records."
            onRetry={() => void loadData({ force: true })}
            className="rounded-3xl"
          />
        ) : !athlete ? (
          <EmptyState
            icon={User}
            title="Athlete Profile Not Found"
            description={`No registered athlete corresponds to code "${code}".`}
            actionLabel="Return to Rosters"
            onAction={() => window.location.href = '/rosters'}
            className="rounded-3xl"
          />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Athlete Header Card */}
            <section className={`${PUBLIC_CARD} flex flex-col sm:flex-row items-center sm:items-start gap-6`}>
              {/* Photo */}
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-surface-2 border border-border shrink-0 flex items-center justify-center">
                {athlete.photo_thumb_url || athlete.photo_url ? (
                  <img
                    src={athlete.photo_thumb_url || athlete.photo_url}
                    alt={athlete.name}
                    width={112}
                    height={112}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={44} weight="regular" className="text-muted" />
                )}
              </div>

              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-accent-bright/10 text-accent-bright border border-accent-bright/30 tabular-nums">
                    ID #{formatAthleteCode(athlete.athlete_code)}
                  </span>
                  <span className={PUBLIC_COUNT_PILL}>
                    {career.length} {career.length === 1 ? 'season' : 'seasons'}
                  </span>
                </div>

                <h1 className={PUBLIC_PAGE_TITLE}>
                  {athlete.name}
                </h1>

                {career.length > 0 && (
                  <div className="font-syne font-bold text-lg sm:text-xl text-text mt-2 tracking-tight">
                    {career[0].playing_role}
                  </div>
                )}
              </div>
            </section>

            {/* Career History Section */}
            <section className={`${PUBLIC_CARD} space-y-5`}>
              <div className="flex items-center justify-between gap-3 pb-4 border-b border-border">
                <h2 className={`${PUBLIC_SECTION_TITLE} flex items-center gap-2.5`}>
                  <Trophy size={20} weight="regular" className="text-accent-bright shrink-0" />
                  <span>Tournament History</span>
                </h2>
                <span className={PUBLIC_COUNT_PILL}>{career.length}</span>
              </div>

              {career.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-bg border border-border text-sm text-muted">
                  No tournament registrations recorded for this athlete.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {career.map((entry) => (
                    <div
                      key={entry.player_id}
                      className="p-5 rounded-2xl bg-bg border border-border hover:border-accent-bright/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-surface-2 border border-border flex items-center justify-center shrink-0 text-accent-bright">
                          <Calendar size={18} weight="regular" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-syne font-bold text-base text-text">
                              {entry.season_name}
                            </span>
                            {entry.is_season_active && (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-accent-bright/10 text-accent-bright border border-accent-bright/30">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="font-syne font-bold text-base text-text mt-1 tracking-tight">
                            {entry.playing_role}
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted mt-1.5">
                            <span className="font-medium text-text">{entry.sport}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{entry.academic_year} Year</span>
                          </div>
                        </div>
                      </div>

                      {/* Team Assignment */}
                      <div className="flex items-center gap-3 self-start sm:self-center shrink-0">
                        {entry.team_name ? (
                          <Link
                            to={`/season/${entry.season_id}/teams/${entry.team_id}`}
                            onMouseEnter={() =>
                              prefetchRoute(`/season/${entry.season_id}/teams/${entry.team_id}`)
                            }
                            onFocus={() =>
                              prefetchRoute(`/season/${entry.season_id}/teams/${entry.team_id}`)
                            }
                            onTouchStart={() =>
                              prefetchRoute(`/season/${entry.season_id}/teams/${entry.team_id}`)
                            }
                            className="px-4 py-2 rounded-full bg-surface border border-border hover:border-accent-bright text-xs font-medium text-text flex items-center gap-2 transition-colors"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: entry.team_color || 'currentColor' }}
                            />
                            <span>{entry.team_name}</span>
                          </Link>
                        ) : (
                          <span className="px-3.5 py-1.5 rounded-full bg-surface-2 border border-border text-xs text-muted">
                            Available Pool
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
