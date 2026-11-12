import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Calendar, CaretLeft, IdentificationBadge, Trophy, User } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { EmptyState, ErrorState, Spinner } from '../../components/ui'
import { getAthleteByCode, getAthleteCareer, formatAthleteCode, getActiveSeason } from '../../lib/data'
import { hasDataChanged, publicCache, type PlayerProfileCacheEntry } from '../../lib/publicCache'
import type { Athlete, AthleteCareerEntry, Season } from '../../types'

function getProfileCacheKey(code?: string): string {
  return (code || '').trim().toLowerCase()
}

export const PlayerProfilePage: React.FC = () => {
  const { code } = useParams<{ code: string }>()
  const cacheKey = getProfileCacheKey(code)
  const initialCached = cacheKey ? publicCache.playerProfiles.get(cacheKey) : undefined

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

  const loadData = async () => {
    if (!code) return
    const key = getProfileCacheKey(code)
    const cached = publicCache.playerProfiles.get(key)

    if (cached) {
      setAthlete(cached.athlete)
      setCareer(cached.career)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }
    setHasError(false)

    try {
      const active = await getActiveSeason()
      const prevActive = publicCache.activeSeason.value
      const activeChanged =
        !publicCache.activeSeason.loaded || hasDataChanged(prevActive, active)
      publicCache.activeSeason = { loaded: true, value: active }
      if (activeChanged) {
        setActiveSeason(active)
      }

      const profile = await getAthleteByCode(code)
      if (!profile) {
        const emptyEntry: PlayerProfileCacheEntry = { athlete: null, career: [] }
        publicCache.playerProfiles.set(key, emptyEntry)
        setAthlete(null)
        setCareer([])
        return
      }

      const history = await getAthleteCareer(profile.id)
      const nextEntry: PlayerProfileCacheEntry = {
        athlete: profile,
        career: history
      }
      const prevEntry = publicCache.playerProfiles.get(key)
      const changed = !prevEntry || hasDataChanged(prevEntry, nextEntry)
      publicCache.playerProfiles.set(key, nextEntry)

      if (changed) {
        setAthlete(profile)
        setCareer(history)
      }
    } catch (err) {
      console.error(
        'Failed to load athlete profile data:',
        err instanceof Error ? err.message : err,
        err
      )
      if (!cached) {
        setHasError(true)
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [code])

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-on-accent relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 md:px-12 pt-32 sm:pt-40 pb-20">
        <div className="mb-6">
          <Link
            to="/rosters"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <CaretLeft size={16} />
            <span>Back to rosters</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="py-20 flex justify-center">
            <Spinner size="lg" />
          </div>
        ) : hasError ? (
          <ErrorState
            title="Failed to Load Athlete Profile"
            description="We encountered an issue retrieving this athlete's records."
            onRetry={loadData}
          />
        ) : !athlete ? (
          <EmptyState
            icon={User}
            title="Athlete Profile Not Found"
            description={`No registered athlete corresponds to code "${code}". Please check the ID and try again.`}
            actionLabel="Return to Rosters"
            onAction={() => window.location.href = '/rosters'}
          />
        ) : (
          <div className="flex flex-col gap-8">
            {/* Athlete Header Card */}
            <div className="p-6 sm:p-8 rounded-3xl bg-surface border border-border shadow-sm flex flex-col sm:flex-row items-center sm:items-start gap-6">
              {/* Photo */}
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-surface-2 border border-border shrink-0 flex items-center justify-center">
                {athlete.photo_url || athlete.photo_thumb_url ? (
                  <img
                    src={athlete.photo_url || athlete.photo_thumb_url}
                    alt={athlete.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User size={48} className="text-muted" />
                )}
              </div>

              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-accent/15 text-accent-bright border border-accent-bright/40">
                    ID #{formatAthleteCode(athlete.athlete_code)}
                  </span>
                </div>

                <h1 className="font-syne font-bold text-3xl sm:text-4xl text-text tracking-tight">
                  {athlete.name}
                </h1>

                {career.length > 0 && (
                  <>
                    <div className="font-syne font-bold text-lg sm:text-xl text-text mt-1.5 tracking-tight">
                      {career[0].playing_role}
                    </div>
                    <div className="font-mono text-xs text-points font-semibold tabular-nums mt-0.5">
                      Base: {career[0].base_points.toLocaleString()} PTS
                    </div>
                  </>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-muted">
                  <div className="flex items-center gap-1.5">
                    <IdentificationBadge size={16} className="text-accent-bright" />
                    <span>Universal Player Profile</span>
                  </div>
                  <span>&bull;</span>
                  <span>Registered Seasons: {career.length}</span>
                </div>
              </div>
            </div>

            {/* Career History Section */}
            <div>
              <h2 className="font-syne font-bold text-xl text-text mb-4 flex items-center gap-2">
                <Trophy size={22} className="text-accent-bright" />
                <span>Tournament History & Rosters</span>
              </h2>

              {career.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-surface border border-border text-xs text-muted">
                  No tournament registrations recorded for this athlete.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {career.map((entry) => (
                    <div
                      key={entry.player_id}
                      className="p-5 rounded-2xl bg-surface border border-border hover:border-border/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 text-accent-bright">
                          <Calendar size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/season/${entry.season_id}`}
                              className="font-syne font-bold text-base text-text hover:text-accent-bright transition-colors"
                            >
                              {entry.season_name}
                            </Link>
                            {entry.is_season_active && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-accent-bright/15 text-accent-bright border border-accent-bright/30">
                                Active
                              </span>
                            )}
                          </div>

                          <div className="font-syne font-bold text-base text-text mt-1 tracking-tight">
                            {entry.playing_role}
                          </div>

                          <div className="font-mono text-xs text-points font-semibold tabular-nums mt-0.5">
                            Base: {entry.base_points.toLocaleString()} PTS
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-muted mt-1.5">
                            <span className="font-medium text-text">{entry.sport}</span>
                            <span>&bull;</span>
                            <span className="font-mono">{entry.academic_year} Year</span>
                          </div>
                        </div>
                      </div>

                      {/* Team Assignment */}
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        {entry.team_name ? (
                          <Link
                            to={`/season/${entry.season_id}/teams/${entry.team_id}`}
                            className="px-3.5 py-1.5 rounded-xl bg-surface-2 border border-border hover:border-accent-bright text-xs font-semibold text-text flex items-center gap-2 transition-colors"
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: entry.team_color || 'currentColor' }}
                            />
                            <span>{entry.team_name}</span>
                          </Link>
                        ) : (
                          <span className="px-3 py-1 rounded-xl bg-surface-2 text-xs text-muted font-mono">
                            Available Pool
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
