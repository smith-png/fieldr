import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from '@phosphor-icons/react'
import { HeaderBar } from '../components/HeaderBar'
import { NavigationMenu } from '../components/NavigationMenu'
import { SiteFooter } from '../components/SiteFooter'
import { getActiveSeason, getSiteSettings } from '../lib/data'
import type { PageContentSetting, Season } from '../lib/types'

interface ContentPageProps {
  pageKey: 'help_page' | 'about_page'
  fallbackTitle: string
}

export const ContentPage: React.FC<ContentPageProps> = ({ pageKey, fallbackTitle }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSeason, setActiveSeason] = useState<Season | null>(null)
  const [content, setContent] = useState<PageContentSetting | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        setIsLoading(true)
        const season = await getActiveSeason()
        if (mounted) setActiveSeason(season)

        const settings = await getSiteSettings()
        if (mounted && settings[pageKey]) {
          setContent(settings[pageKey] as PageContentSetting)
        }
      } catch {
        // fallback
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
    <div className="min-h-screen bg-[#0B0B0B] text-[#F0F2EE] flex flex-col justify-between selection:bg-[#047554] selection:text-white relative">
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
            className="inline-flex items-center gap-2 text-xs font-medium text-[#8E928C] hover:text-white transition-colors"
          >
            <ArrowLeft size={14} weight="bold" />
            <span>Return Home</span>
          </Link>
        </div>

        <div className="bg-[#111411] border border-white/10 rounded-2xl p-8 sm:p-12">
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-2">
            INFORMATION
          </span>
          <h1 className="font-syne font-extrabold text-3xl sm:text-5xl text-white tracking-tight mb-6">
            {content?.title || fallbackTitle}
          </h1>

          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-3/4" />
              <div className="h-4 bg-white/10 rounded w-1/2" />
            </div>
          ) : content?.body ? (
            <div className="text-base text-[#CBD1CB] leading-relaxed whitespace-pre-wrap font-sans">
              {content.body}
            </div>
          ) : (
            <div className="py-8">
              <p className="text-xl text-[#8E928C] font-syne font-semibold">
                Coming soon
              </p>
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
