import React, { useEffect, useState } from 'react'
import { getCreditsPeople } from '../../lib/data/credits'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import type { CreditPerson } from '../../types'

export function getPersonInitials(name: string): string {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export const CreditAvatar: React.FC<{
  name: string
  photoUrl?: string | null
  className?: string
  initialsClassName?: string
}> = ({ name, photoUrl, className = '', initialsClassName = 'text-xl' }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const cleanUrl = photoUrl?.trim() || ''
  const showImage = Boolean(cleanUrl) && failedUrl !== cleanUrl

  return (
    <div
      className={`bg-surface-2 border border-border overflow-hidden flex items-center justify-center relative select-none ${className}`}
    >
      {showImage ? (
        <img
          src={cleanUrl}
          alt={name}
          width={320}
          height={336}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(cleanUrl)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`font-syne font-bold text-muted tracking-tight uppercase ${initialsClassName}`}
        >
          {getPersonInitials(name)}
        </span>
      )}
    </div>
  )
}

export const CreditsSection: React.FC = () => {
  const [people, setPeople] = useState<CreditPerson[]>(
    publicCache.creditsPeople.loaded ? publicCache.creditsPeople.value : []
  )
  const [loaded, setLoaded] = useState<boolean>(publicCache.creditsPeople.loaded)

  useEffect(() => {
    let mounted = true
    getCreditsPeople()
      .then((rows) => {
        const prev = publicCache.creditsPeople.value
        const wasLoaded = publicCache.creditsPeople.loaded
        const changed = !wasLoaded || hasDataChanged(prev, rows)
        publicCache.creditsPeople = { loaded: true, value: rows }
        if (mounted) {
          if (changed) {
            setPeople(rows)
          }
          setLoaded(true)
        }
      })
      .catch((err) => {
        console.error('Failed to load credits:', err)
        if (mounted && !publicCache.creditsPeople.loaded) {
          setPeople([])
          setLoaded(true)
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const corePeople = people.filter((p) => p.kind === 'core').slice(0, 5)
  const contributors = people.filter((p) => p.kind === 'contributor')

  if (!loaded || (corePeople.length === 0 && contributors.length === 0)) {
    return null
  }

  return (
    <section
      aria-labelledby="credits-section-heading"
      className="mt-8 bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-8 min-w-0"
    >
      <div className="pb-5 border-b border-border">
        <h2
          id="credits-section-heading"
          className="font-syne font-bold text-xl text-text tracking-tight"
        >
          Credits
        </h2>
      </div>

      {/* Main people (kind 'core', up to 5) */}
      {corePeople.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {corePeople.map((person) => (
            <div
              key={person.id}
              className="bg-bg border border-border rounded-3xl p-5 flex flex-col gap-4 min-w-0"
            >
              <CreditAvatar
                name={person.name}
                photoUrl={person.photo_url}
                className="w-full aspect-[4/4.2] rounded-2xl"
                initialsClassName="text-3xl sm:text-4xl"
              />

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <h3 className="font-syne font-bold text-lg text-text tracking-tight leading-snug">
                  {person.name}
                </h3>
                {person.role && (
                  <div className="text-xs font-sans font-medium text-accent-bright">
                    {person.role}
                  </div>
                )}
                {person.description && (
                  <p className="text-xs sm:text-sm font-sans font-light text-muted leading-relaxed mt-1.5 whitespace-pre-wrap">
                    {person.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contributors (kind 'contributor', unlimited) */}
      {contributors.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-border">
          <h3 className="font-syne font-bold text-lg text-text tracking-tight pt-4">
            Also thanks to
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {contributors.map((person) => (
              <div
                key={person.id}
                className="bg-bg border border-border rounded-3xl p-5 flex flex-col items-center text-center gap-3 min-w-0"
              >
                <CreditAvatar
                  name={person.name}
                  photoUrl={person.photo_url}
                  className="w-20 h-20 rounded-2xl shrink-0"
                  initialsClassName="text-xl"
                />
                <div className="min-w-0 w-full">
                  <div className="font-syne font-bold text-sm sm:text-base text-text tracking-tight leading-snug break-words">
                    {person.name}
                  </div>
                  {person.role && (
                    <div className="text-xs font-sans font-normal text-muted leading-snug mt-0.5 break-words">
                      {person.role}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
