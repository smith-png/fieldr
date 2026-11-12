import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import { CreditsSection } from '../../components/credits/CreditsSection'
import { MarkdownContent } from '../../components/common/MarkdownContent'
import { getActiveSeason, getSiteSettings } from '../../lib/data'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import type { PageContentSetting, Season } from '../../types'

interface ContentPageProps {
  pageKey: 'help_page' | 'about_page'
  fallbackTitle: string
}

function getCachedPageContent(pageKey: 'help_page' | 'about_page'): {
  hasCache: boolean
  value: PageContentSetting | null
} {
  if (publicCache.pageContent.has(pageKey)) {
    return {
      hasCache: true,
      value: publicCache.pageContent.get(pageKey) ?? null
    }
  }
  if (publicCache.siteSettings.loaded) {
    const val = (publicCache.siteSettings.value[pageKey] as PageContentSetting | undefined) ?? null
    return {
      hasCache: true,
      value: val
    }
  }
  return { hasCache: false, value: null }
}

export const ContentPage: React.FC<ContentPageProps> = ({ pageKey, fallbackTitle }) => {
  const initialCached = getCachedPageContent(pageKey)

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(
    publicCache.activeSeason.value
  )
  const [content, setContent] = useState<PageContentSetting | null>(initialCached.value)
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached.hasCache)

  useEffect(() => {
    let mounted = true
    const cached = getCachedPageContent(pageKey)

    if (cached.hasCache) {
      setContent(cached.value)
      setIsLoading(false)
    } else {
      setIsLoading(true)
    }

    async function loadData() {
      try {
        const [season, settings] = await Promise.all([
          getActiveSeason(),
          getSiteSettings()
        ])

        const prevSeason = publicCache.activeSeason.value
        const seasonChanged =
          !publicCache.activeSeason.loaded || hasDataChanged(prevSeason, season)
        publicCache.activeSeason = { loaded: true, value: season }
        if (mounted && seasonChanged) {
          setActiveSeason(season)
        }

        publicCache.siteSettings = { loaded: true, value: settings }
        const helpVal = (settings.help_page as PageContentSetting | undefined) ?? null
        const aboutVal = (settings.about_page as PageContentSetting | undefined) ?? null
        const prevPageVal = publicCache.pageContent.get(pageKey)
        const nextPageVal = (settings[pageKey] as PageContentSetting | undefined) ?? null

        publicCache.pageContent.set('help_page', helpVal)
        publicCache.pageContent.set('about_page', aboutVal)

        if (
          mounted &&
          (!cached.hasCache || hasDataChanged(prevPageVal ?? null, nextPageVal))
        ) {
          setContent(nextPageVal)
        }
      } catch (err) {
        console.error(
          `Failed to load content page (${pageKey}):`,
          err instanceof Error ? err.message : err,
          err
        )
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    loadData()
    return () => {
      mounted = false
    }
  }, [pageKey])

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

        <div className="bg-surface border border-border rounded-2xl p-8 sm:p-12">
          <span className="text-xs font-mono uppercase tracking-widest text-accent-bright block mb-2">
            INFORMATION
          </span>
          <h1 className="font-syne font-extrabold text-3xl sm:text-5xl text-text tracking-tight mb-6">
            {content?.title || fallbackTitle}
          </h1>

          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-surface-2 rounded w-3/4" />
              <div className="h-4 bg-surface-2 rounded w-1/2" />
            </div>
          ) : content?.body ? (
            <MarkdownContent content={content.body} />
          ) : (
            <div className="py-8">
              <p className="text-xl text-muted font-syne font-semibold">
                Coming soon
              </p>
            </div>
          )}
        </div>

        {pageKey === 'about_page' && <CreditsSection />}
      </main>

      <SiteFooter />
    </div>
  )
}
