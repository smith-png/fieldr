import React, { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  FloppyDisk,
  Hourglass,
  PencilSimple,
  Plus,
  Trash,
  X
} from '@phosphor-icons/react'
import { useToast } from '../../lib/ToastContext'
import {
  createCarouselItem,
  deleteCarouselItem,
  getCarouselItems,
  getSiteSettings,
  reorderCarouselItems,
  updateCarouselItem,
  updateSiteSetting
} from '../../lib/data'
import type { CarouselItem, PageContentSetting, SiteSettings } from '../../lib/types'

type SetupTab = 'carousel' | 'pages' | 'auction'

export const AdminSetup: React.FC = () => {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<SetupTab>('carousel')

  // Carousel State
  const [carouselItems, setCarouselItems] = useState<CarouselItem[]>([])
  const [isLoadingCarousel, setIsLoadingCarousel] = useState(false)
  const [editingItem, setEditingItem] = useState<CarouselItem | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [itemText, setItemText] = useState('')

  // Pages State
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({})
  const [selectedPageKey, setSelectedPageKey] = useState<'help_page' | 'about_page'>('help_page')
  const [pageTitle, setPageTitle] = useState('')
  const [pageBody, setPageBody] = useState('')
  const [isSavingPage, setIsSavingPage] = useState(false)

  // Load Carousel Items
  const loadCarousel = async () => {
    try {
      setIsLoadingCarousel(true)
      const items = await getCarouselItems(false)
      setCarouselItems(items)
    } catch {
      showToast('Failed to load carousel items', 'error')
    } finally {
      setIsLoadingCarousel(false)
    }
  }

  // Load Site Settings
  const loadSettings = async () => {
    try {
      const settings = await getSiteSettings()
      setSiteSettings(settings)
      const initialPage = settings[selectedPageKey] as PageContentSetting | undefined
      if (initialPage) {
        setPageTitle(initialPage.title || '')
        setPageBody(initialPage.body || '')
      }
    } catch {
      showToast('Failed to load site settings', 'error')
    }
  }

  useEffect(() => {
    loadCarousel()
    loadSettings()
  }, [])

  // Sync inputs when page key changes
  useEffect(() => {
    const page = siteSettings[selectedPageKey] as PageContentSetting | undefined
    if (page) {
      setPageTitle(page.title || '')
      setPageBody(page.body || '')
    } else {
      setPageTitle(selectedPageKey === 'help_page' ? 'Help & Instructions' : 'About Fieldr')
      setPageBody('')
    }
  }, [selectedPageKey, siteSettings])

  // Handle Carousel Save
  const handleSaveCarouselItem = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = itemText.trim()
    if (!trimmed) {
      showToast('Text cannot be empty', 'error')
      return
    }
    if (trimmed.length > 80) {
      showToast('Maximum 80 characters allowed', 'error')
      return
    }

    try {
      if (editingItem) {
        await updateCarouselItem(editingItem.id, { text: trimmed })
        showToast('Carousel item updated', 'success')
      } else {
        await createCarouselItem(trimmed, carouselItems.length)
        showToast('Carousel item created', 'success')
      }
      setIsAddModalOpen(false)
      setEditingItem(null)
      setItemText('')
      loadCarousel()
    } catch {
      showToast('Failed to save carousel item', 'error')
    }
  }

  // Handle Toggle Active
  const handleToggleActive = async (item: CarouselItem) => {
    try {
      await updateCarouselItem(item.id, { active: !item.active })
      setCarouselItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i))
      )
      showToast(item.active ? 'Ticker item disabled' : 'Ticker item activated', 'success')
    } catch {
      showToast('Failed to toggle status', 'error')
    }
  }

  // Handle Delete
  const handleDeleteCarouselItem = async (id: string) => {
    if (!window.confirm('Delete this carousel item?')) return
    try {
      await deleteCarouselItem(id)
      setCarouselItems((prev) => prev.filter((i) => i.id !== id))
      showToast('Item deleted', 'success')
    } catch {
      showToast('Failed to delete item', 'error')
    }
  }

  // Handle Move Up / Down
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= carouselItems.length) return

    const newItems = [...carouselItems]
    const temp = newItems[index]
    newItems[index] = newItems[targetIndex]
    newItems[targetIndex] = temp

    // Update sort_order
    const ordered = newItems.map((item, idx) => ({ id: item.id, sort_order: idx }))
    setCarouselItems(newItems.map((item, idx) => ({ ...item, sort_order: idx })))

    try {
      await reorderCarouselItems(ordered)
    } catch {
      showToast('Failed to persist order', 'error')
      loadCarousel()
    }
  }

  // Handle Save Page Settings
  const handleSavePage = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSavingPage(true)
      const payload: PageContentSetting = {
        title: pageTitle.trim(),
        body: pageBody.trim()
      }
      await updateSiteSetting(selectedPageKey, payload)
      setSiteSettings((prev) => ({ ...prev, [selectedPageKey]: payload }))
      showToast('Page content saved', 'success')
    } catch {
      showToast('Failed to save page content', 'error')
    } finally {
      setIsSavingPage(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <span className="text-xs font-mono uppercase tracking-widest text-[#047554] block mb-1">
            SITE CONFIGURATION
          </span>
          <h1 className="font-syne font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
            System Setup
          </h1>
        </div>

        {/* Setup Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('carousel')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'carousel'
                ? 'bg-white text-[#0B0B0B] font-semibold'
                : 'text-[#8E928C] hover:text-white'
            }`}
          >
            Carousel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pages')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'pages'
                ? 'bg-white text-[#0B0B0B] font-semibold'
                : 'text-[#8E928C] hover:text-white'
            }`}
          >
            Pages
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auction')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'auction'
                ? 'bg-white text-[#0B0B0B] font-semibold'
                : 'text-[#8E928C] hover:text-white'
            }`}
          >
            Auction
          </button>
        </div>
      </div>

      {/* Tab 1: Carousel Items */}
      {activeTab === 'carousel' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111411] border border-white/10 rounded-2xl p-6">
            <div>
              <h2 className="font-syne font-bold text-xl text-white">Homepage Ticker Strip</h2>
              <p className="text-xs text-[#8E928C] mt-1">
                Manage ticker announcements shown in the home page stadium ribbon. Max 80 characters per item.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingItem(null)
                setItemText('')
                setIsAddModalOpen(true)
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#0B0B0B] text-xs font-semibold hover:bg-[#F0F2EE] transition-colors shrink-0"
            >
              <Plus size={16} weight="bold" />
              <span>Add item</span>
            </button>
          </div>

          {isLoadingCarousel ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-[#111411] border border-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : carouselItems.length === 0 ? (
            <div className="bg-[#111411] border border-white/10 rounded-2xl p-12 text-center text-[#8E928C]">
              No carousel items configured. Click &ldquo;Add item&rdquo; to introduce ticker strings.
            </div>
          ) : (
            <div className="bg-[#111411] border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
              {carouselItems.map((item, index) => (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="font-mono text-xs text-[#8E928C] w-6 shrink-0">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate font-sans">
                        {item.text}
                      </p>
                      <span className="text-[10px] font-mono text-[#8E928C]">
                        {item.text.length} / 80 chars
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Move Up/Down */}
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMove(index, 'up')}
                      title="Move up"
                      className="p-2 rounded-lg border border-white/10 text-[#8E928C] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ArrowUp size={14} weight="bold" />
                    </button>
                    <button
                      type="button"
                      disabled={index === carouselItems.length - 1}
                      onClick={() => handleMove(index, 'down')}
                      title="Move down"
                      className="p-2 rounded-lg border border-white/10 text-[#8E928C] hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ArrowDown size={14} weight="bold" />
                    </button>

                    {/* Active Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                        item.active
                          ? 'bg-[#047554]/20 border border-[#047554] text-[#CBD1CB]'
                          : 'bg-white/5 border border-white/10 text-[#8E928C]'
                      }`}
                    >
                      {item.active ? 'Active' : 'Inactive'}
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(item)
                        setItemText(item.text)
                        setIsAddModalOpen(true)
                      }}
                      title="Edit text"
                      className="p-2 rounded-lg border border-white/10 text-[#8E928C] hover:text-white transition-colors"
                    >
                      <PencilSimple size={14} />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteCarouselItem(item.id)}
                      title="Delete item"
                      className="p-2 rounded-lg border border-white/10 text-[#8E928C] hover:text-[#B91C1C] transition-colors"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Pages Content Editor */}
      {activeTab === 'pages' && (
        <div className="bg-[#111411] border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div>
              <h2 className="font-syne font-bold text-xl text-white">Public Pages Editor</h2>
              <p className="text-xs text-[#8E928C] mt-1">
                Customize content for public Help and About pages stored in the site database.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedPageKey('help_page')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedPageKey === 'help_page'
                    ? 'bg-white text-[#0B0B0B] font-semibold'
                    : 'bg-white/5 text-[#8E928C] hover:text-white'
                }`}
              >
                Help Page
              </button>
              <button
                type="button"
                onClick={() => setSelectedPageKey('about_page')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedPageKey === 'about_page'
                    ? 'bg-white text-[#0B0B0B] font-semibold'
                    : 'bg-white/5 text-[#8E928C] hover:text-white'
                }`}
              >
                About Page
              </button>
            </div>
          </div>

          <form onSubmit={handleSavePage} className="space-y-5">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#8E928C] mb-2">
                Page Title
              </label>
              <input
                type="text"
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#047554]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#8E928C] mb-2">
                Page Body Content
              </label>
              <textarea
                value={pageBody}
                onChange={(e) => setPageBody(e.target.value)}
                rows={8}
                placeholder="Enter markdown or plain text for this page..."
                className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-white focus:outline-none focus:border-[#047554] leading-relaxed resize-y font-sans"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingPage}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#0B0B0B] text-xs font-semibold hover:bg-[#F0F2EE] disabled:opacity-50 transition-colors"
              >
                <FloppyDisk size={16} weight="bold" />
                <span>{isSavingPage ? 'Saving...' : 'Save Page Content'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Auction Placeholder Card */}
      {activeTab === 'auction' && (
        <div className="bg-[#111411] border border-white/10 rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-[#8E928C]">
            <Hourglass size={24} weight="duotone" />
          </div>
          <h2 className="font-syne font-bold text-2xl text-white">Auction Rules & Timing</h2>
          <p className="text-sm text-[#8E928C] max-w-md mx-auto leading-relaxed">
            Live auction timing and settings will be configurable in a future release.
          </p>
          <div className="inline-block px-3 py-1 rounded-full bg-white/5 border border-white/10 font-mono text-[11px] text-[#8E928C]">
            Drafting Engine: Manual Control Mode Active
          </div>
        </div>
      )}

      {/* Add / Edit Carousel Modal */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div className="bg-[#111411] border border-white/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <h3 className="font-syne font-bold text-lg text-white">
                {editingItem ? 'Edit Ticker Item' : 'New Ticker Item'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false)
                  setEditingItem(null)
                }}
                className="p-1 rounded-lg text-[#8E928C] hover:text-white"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <form onSubmit={handleSaveCarouselItem} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono uppercase tracking-wider text-[#8E928C]">
                    Ticker Text
                  </label>
                  <span
                    className={`font-mono text-xs ${
                      itemText.length > 80 ? 'text-[#B91C1C]' : 'text-[#8E928C]'
                    }`}
                  >
                    {itemText.length} / 80
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={80}
                  value={itemText}
                  onChange={(e) => setItemText(e.target.value)}
                  placeholder="e.g. SQUAD REGISTRATIONS CLOSING SOON"
                  required
                  autoFocus
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#047554]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false)
                    setEditingItem(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs text-[#8E928C] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-white text-[#0B0B0B] text-xs font-semibold hover:bg-[#F0F2EE]"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
