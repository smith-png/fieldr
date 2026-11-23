import { logError } from '../../lib/logger'
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { HeaderBar } from '../../components/layout/HeaderBar'
import { NavigationMenu } from '../../components/layout/NavigationMenu'
import { SiteFooter } from '../../components/layout/SiteFooter'
import FooterMark, { type FlameColor } from '../../components/layout/FooterMark'
import { CreditsSection } from '../../components/credits/CreditsSection'
import { MarkdownContent } from '../../components/common/MarkdownContent'
import {
  PUBLIC_BACK_LINK,
  PUBLIC_CARD,
  PUBLIC_MAIN_NARROW,
  PUBLIC_PAGE_SHELL,
  PUBLIC_PAGE_TITLE
} from '../../components/public/publicStyles'
import { SkeletonText } from '../../components/ui'
import { getSiteSettings } from '../../lib/data/site'
import { hasDataChanged, publicCache } from '../../lib/publicCache'
import {
  isQueryFresh,
  prefetchRoute,
  setCachedQuery,
  shouldRevalidateQuery
} from '../../lib/queryCache'
import type { PageContentSetting } from '../../types'

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

const FLAME_COLOR_ORDER: FlameColor[] = ['green', 'red', 'orange', 'blue']

export const ContentPage: React.FC<ContentPageProps> = ({ pageKey, fallbackTitle }) => {
  const initialCached = getCachedPageContent(pageKey)

  const [flameColor, setFlameColor] = useState<FlameColor>('green')
  const cycleFlameColor = () =>
    setFlameColor(
      (current) =>
        FLAME_COLOR_ORDER[
          (FLAME_COLOR_ORDER.indexOf(current) + 1) % FLAME_COLOR_ORDER.length
        ]
    )

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [content, setContent] = useState<PageContentSetting | null>(initialCached.value)
  const [isLoading, setIsLoading] = useState<boolean>(!initialCached.hasCache)

  useEffect(() => {
    let mounted = true
    const queryKey = `public:contentPage:${pageKey}`
    const cached = getCachedPageContent(pageKey)

    if (cached.hasCache) {
      setContent(cached.value)
      setIsLoading(false)
      if (isQueryFresh(queryKey) && !shouldRevalidateQuery(queryKey)) {
        return () => {
          mounted = false
        }
      }
    } else {
      setIsLoading(true)
    }

    async function loadData() {
      try {
        const settings = await getSiteSettings()

        publicCache.siteSettings = { loaded: true, value: settings }
        const helpVal = (settings.help_page as PageContentSetting | undefined) ?? null
        const aboutVal = (settings.about_page as PageContentSetting | undefined) ?? null
        const prevPageVal = publicCache.pageContent.get(pageKey)
        const nextPageVal = (settings[pageKey] as PageContentSetting | undefined) ?? null

        publicCache.pageContent.set('help_page', helpVal)
        publicCache.pageContent.set('about_page', aboutVal)
        setCachedQuery('public:contentPage:help_page', helpVal)
        setCachedQuery('public:contentPage:about_page', aboutVal)

        if (
          mounted &&
          (!cached.hasCache || hasDataChanged(prevPageVal ?? null, nextPageVal))
        ) {
          setContent(nextPageVal)
        }
      } catch (err) {
        logError(
          `Failed to load content page (${pageKey}):`,
          err instanceof Error ? err.message : err,
          err
        )
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    void loadData()
    return () => {
      mounted = false
    }
  }, [pageKey])

  return (
    <div className={PUBLIC_PAGE_SHELL}>
      <HeaderBar onOpenMenu={() => setIsMenuOpen(true)} />
      <NavigationMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      <main className={PUBLIC_MAIN_NARROW}>
        {pageKey === 'about_page' && (
          <div className="flex justify-center mb-4 md:mb-6" aria-hidden="true">
            <FooterMark size={112} flameColor={flameColor} onFlameTap={cycleFlameColor} />
          </div>
        )}

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
            <h1 className={PUBLIC_PAGE_TITLE}>
              {content?.title || fallbackTitle}
            </h1>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <SkeletonText width="w-3/4" className="h-4" />
              <SkeletonText width="w-1/2" className="h-4" />
              <SkeletonText width="w-2/3" className="h-4" />
            </div>
          ) : content?.body ? (
            <MarkdownContent content={content.body} />
          ) : (
            <div className="py-8">
              <p className="text-lg text-muted font-syne font-semibold">
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
