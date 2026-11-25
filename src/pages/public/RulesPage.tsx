import { logError } from '../../lib/logger'
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
  PUBLIC_FOLIO,
  PUBLIC_KICKER,
  PUBLIC_MAIN_NARROW,
  PUBLIC_META_ROW,
  PUBLIC_PAGE_HEADER,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE
} from '../../components/public/publicStyles'
import { EmptyState, SkeletonBlock } from '../../components/ui'
import {
  formatRulesDate,
  getRulesDocuments,
  getRulesPublicUrl,
  getSafeRulesDownloadFilename
} from '../../lib/data/rules'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import type { RulesDocument } from '../../types'

export const RulesPage: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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
        const docs = await getRulesDocuments()

        if (!mounted) return

        const prevDocs = publicCache.rulesDocuments.value
        const docsChanged =
          !publicCache.rulesDocuments.loaded || hasDataChanged(prevDocs, docs)
        publicCache.rulesDocuments = { loaded: true, value: docs }
        setCachedQuery(queryKey, docs)
        if (docsChanged || !publicCache.rulesDocuments.loaded) {
          setDocuments(docs)
        }
      } catch (err) {
        logError('Failed to load rules documents:', err)
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

        <header className={PUBLIC_PAGE_HEADER}>
          <div className="min-w-0">
            <span className={PUBLIC_KICKER}>OFFICIAL REGULATIONS</span>
            <h1 className={PUBLIC_PAGE_TITLE}>Auction Rules</h1>
          </div>
          {!isLoading && (
            <div className={PUBLIC_META_ROW}>
              <span>
                {documents.length} {documents.length === 1 ? 'document' : 'documents'}
              </span>
            </div>
          )}
        </header>

        {isLoading ? (
          <div className="divide-y divide-border border-b border-border">
            <div className="py-5">
              <SkeletonBlock className="h-12 w-full rounded-2xl" />
            </div>
            <div className="py-5">
              <SkeletonBlock className="h-12 w-full rounded-2xl" />
            </div>
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FilePdf}
            statusLabel="NO RECORDS"
            title="Rules Pending"
            description="Auction rules will be published soon."
          />
        ) : (
          <ol className="divide-y divide-border border-b border-border">
            {documents.map((doc, idx) => {
              const publicUrl = getRulesPublicUrl(doc.file_path)
              const downloadFilename = getSafeRulesDownloadFilename(doc.title)
              const downloadUrl =
                publicUrl === '#'
                  ? '#'
                  : `${publicUrl}${publicUrl.includes('?') ? '&' : '?'}download=${encodeURIComponent(downloadFilename)}`

              return (
                <li
                  key={doc.id}
                  className="pub-ledger-row rounded-2xl px-3 sm:px-4 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-baseline gap-3.5 min-w-0 flex-1">
                    <span className={PUBLIC_FOLIO}>
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-syne font-bold text-base sm:text-lg text-text break-words leading-snug">
                        {doc.title}
                      </div>
                      {doc.created_at && (
                        <div className="text-xs font-mono text-muted mt-1 tabular-nums">
                          {formatRulesDate(doc.created_at)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 pl-7 sm:pl-0">
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
                </li>
              )
            })}
          </ol>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
