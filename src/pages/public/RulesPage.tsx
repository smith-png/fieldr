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
  formatRulesDate,
  getActiveSeason,
  getRulesDocuments,
  getRulesPublicUrl,
  getSafeRulesDownloadFilename
} from '../../lib/data'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
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

    async function loadData() {
      try {
        const [season, docs] = await Promise.all([
          getActiveSeason(),
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
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-accent-bright selection:text-on-accent relative">
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        activeSeason={activeSeason}
      />

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 md:px-16 lg:px-24 pt-36 sm:pt-44 md:pt-48 pb-20">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <ArrowLeft size={14} weight="bold" />
            <span>Return Home</span>
          </Link>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-8 sm:p-12 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block">
              OFFICIAL DOCUMENTATION
            </span>
          </div>

          <h1 className="font-syne font-extrabold text-3xl sm:text-5xl text-text tracking-tight mb-3">
            Auction Rules
          </h1>
          <p className="text-xs sm:text-sm text-muted font-sans font-light mb-8 max-w-2xl">
            Tournament guidelines, squad constitution constraints, and bidding procedures for official drafts.
          </p>

          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-16 bg-surface-2 rounded-xl w-full" />
              <div className="h-16 bg-surface-2 rounded-xl w-full" />
            </div>
          ) : documents.length === 0 ? (
            <div className="py-12 px-6 rounded-xl bg-surface-2/40 border border-border text-center flex flex-col items-center justify-center gap-3">
              <FilePdf size={36} weight="thin" className="text-muted" />
              <p className="text-base sm:text-lg text-muted font-sans font-light">
                Auction rules will be published soon.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border border-t border-border">
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
                    className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-syne font-bold text-base sm:text-lg text-text break-words">
                        {doc.title}
                      </div>
                      {doc.created_at && (
                        <div className="text-xs font-mono text-muted mt-1 tabular-nums">
                          {formatRulesDate(doc.created_at)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs font-medium text-text hover:bg-border/40 transition-colors"
                      >
                        <ArrowSquareOut size={14} weight="bold" />
                        <span>Open</span>
                      </a>
                      <a
                        href={downloadUrl}
                        download={downloadFilename}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        <DownloadSimple size={14} weight="bold" />
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
