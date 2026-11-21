import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowSquareOut,
  DownloadSimple,
  FilePdf
} from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import {
  PUBLIC_BACK_LINK,
  PUBLIC_BTN_PRIMARY,
  PUBLIC_BTN_SECONDARY,
  PUBLIC_CARD,
  PUBLIC_MAIN_NARROW,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE
} from '../../components/public/publicStyles'
import { SkeletonBlock } from '../../components/ui'
import {
  formatRulesDate,
  getRulesDocuments,
  getRulesPublicUrl,
  getSafeRulesDownloadFilename
} from '../../lib/data/rules'
import { getActiveSeason } from '../../lib/data/seasons'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import type { RulesDocument, Season } from '../../types'

export const RulesPage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(
    publicCache.activeSeason.value
  )

  const initialDocuments = publicCache.rulesDocuments.loaded
    ? publicCache.rulesDocuments.value
    : []

  const [documents, setDocuments] = useState<RulesDocument[]>(initialDocuments)
  const [isLoading, setIsLoading] = useState<boolean>(!publicCache.rulesDocuments.loaded)

  useEffect(() => {
    let mounted = true
    const queryKey = 'public:rulesPage'
    if (
      publicCache.rulesDocuments.loaded &&
      isQueryFresh(queryKey) &&
      !shouldRevalidateQuery(queryKey)
    ) {
      setIsLoading(false)
      return () => {
        mounted = false
      }
    }

    async function loadData() {
      try {
        const [season, docs] = await Promise.all([
          publicCache.activeSeason.loaded
            ? Promise.resolve(publicCache.activeSeason.value)
            : getActiveSeason(),
          getRulesDocuments()
        ])

        if (!mounted) return

        const prevSeason = publicCache.activeSeason.value
        const seasonChanged =
          !publicCache.activeSeason.loaded || hasDataChanged(prevSeason, season)
        publicCache.activeSeason = { loaded: true, value: season }
        if (seasonChanged) {
          setActiveSeason(season)
        }

        const prevDocs = publicCache.rulesDocuments.value
        const docsChanged =
          !publicCache.rulesDocuments.loaded || hasDataChanged(prevDocs, docs)
        publicCache.rulesDocuments = { loaded: true, value: docs }
        setCachedQuery(queryKey, docs)
        if (docsChanged || !publicCache.rulesDocuments.loaded) {
          setDocuments(docs)
        }
      } catch (err) {
        console.error('Failed to load rules documents:', err)
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

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

        <div className={PUBLIC_CARD}>
          <div className="pb-5 mb-6 border-b border-border">
            <h1 className={PUBLIC_PAGE_TITLE}>Auction Rules</h1>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-16 w-full rounded-2xl" />
              <SkeletonBlock className="h-16 w-full rounded-2xl" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-12 px-6 rounded-2xl bg-bg border border-border text-center flex flex-col items-center justify-center gap-3">
              <FilePdf size={36} weight="regular" className="text-muted" />
              <p className="text-base text-muted font-sans">
                Auction rules will be published soon.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const publicUrl = getRulesPublicUrl(doc.file_path)
                const downloadFilename = getSafeRulesDownloadFilename(doc.title)
                const downloadUrl =
                  publicUrl === '#'
                    ? '#'
                    : `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}download=${encodeURIComponent(downloadFilename)}`

                return (
                  <div
                    key={doc.id}
                    className="rounded-2xl bg-bg border border-border px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-syne font-bold text-base text-text break-words">
                        {doc.title}
                      </div>
                      {doc.created_at && (
                        <div className="text-xs font-mono text-muted mt-0.5 tabular-nums">
                          {formatRulesDate(doc.created_at)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${PUBLIC_BTN_SECONDARY} px-4 py-2 text-xs`}
                      >
                        <ArrowSquareOut size={14} weight="regular" />
                        <span>Open</span>
                      </a>
                      <a
                        href={downloadUrl}
                        download={downloadFilename}
                        className={`${PUBLIC_BTN_PRIMARY} px-4 py-2 text-xs`}
                      >
                        <DownloadSimple size={14} weight="regular" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
