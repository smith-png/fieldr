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
  swapCarouselItems,
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
  const [carouselError, setCarouselError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<CarouselItem | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [itemText, setItemText] = useState('')
  const [isSavingCarousel, setIsSavingCarousel] = useState(false)

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
      setCarouselError(null)
      const items = await getCarouselItems(false)
      setCarouselItems(items)
    } catch (err: any) {
      console.error('Failed to load carousel items:', err)
      const msg = err?.message || 'Failed to load carousel items'
      setCarouselError(msg)
      showToast(`Failed to load carousel items: ${msg}`, 'error')
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
    } catch (err: any) {
      console.error('Failed to load site settings:', err)
      showToast(`Failed to load site settings: ${err?.message || 'Unknown error'}`, 'error')
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
    if (isSavingCarousel) return

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
      setIsSavingCarousel(true)
      if (editingItem) {
        await updateCarouselItem(editingItem.id, { text: trimmed })
        showToast('Carousel item updated', 'success')
      } else {
        const maxOrder = carouselItems.length > 0
          ? Math.max(...carouselItems.map((i) => i.sort_order ?? 0))
          : -1
        await createCarouselItem(trimmed, maxOrder + 1)
        showToast('Carousel item created', 'success')
      }
      setIsAddModalOpen(false)
      setEditingItem(null)
      setItemText('')
      await loadCarousel()
    } catch (err: any) {
      console.error('Failed to save carousel item:', err)
      showToast(`Failed to save carousel item: ${err?.message || 'Unknown error'}`, 'error')
    } finally {
      setIsSavingCarousel(false)
    }
  }

  // Handle Toggle Active
  const handleToggleActive = async (item: CarouselItem) => {
    // Guard: at least 1 active item must remain
    if (item.active) {
      const activeCount = carouselItems.filter((i) => i.active).length
      if (activeCount <= 1) {
        showToast('At least 1 active ticker item is required.', 'error')
        return
      }
    }

    const prevItems = [...carouselItems]
    // Optimistic update
    setCarouselItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i))
    )

    try {
      await updateCarouselItem(item.id, { active: !item.active })
      showToast(item.active ? 'Ticker item disabled' : 'Ticker item activated', 'success')
      await loadCarousel()
    } catch (err: any) {
      console.error('Failed to update carousel item:', err)
      setCarouselItems(prevItems)
      showToast(`Failed to update carousel item: ${err?.message || 'Unknown error'}`, 'error')
    }
  }

  // Handle Delete
  const handleDeleteCarouselItem = async (item: CarouselItem) => {
    // Guard: at least 1 active item must remain
    if (item.active) {
      const activeCount = carouselItems.filter((i) => i.active).length
      if (activeCount <= 1) {
        showToast('At least 1 active ticker item is required.', 'error')
        return
      }
    }

    if (!window.confirm('Delete this carousel item?')) return

    const prevItems = [...carouselItems]
    // Optimistic delete
    setCarouselItems((prev) => prev.filter((i) => i.id !== item.id))

    try {
      await deleteCarouselItem(item.id)
      showToast('Item deleted', 'success')
      await loadCarousel()
    } catch (err: any) {
      console.error('Failed to delete carousel item:', err)
      setCarouselItems(prevItems)
      showToast(`Failed to delete carousel item: ${err?.message || 'Unknown error'}`, 'error')
    }
  }

  // Handle Move Up / Down with single neighbor swap and rollback
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= carouselItems.length) return

    const prevItems = [...carouselItems]
    const itemA = carouselItems[index]
    const itemB = carouselItems[targetIndex]

    const orderA = itemA.sort_order ?? index
    const orderB = itemB.sort_order ?? targetIndex

    // Optimistic swap
    const swapped = [...carouselItems]
    swapped[index] = { ...itemB, sort_order: orderA }
    swapped[targetIndex] = { ...itemA, sort_order: orderB }
    setCarouselItems(swapped)

    try {
      await swapCarouselItems(
        { id: itemA.id, sort_order: orderB },
        { id: itemB.id, sort_order: orderA }
      )
      await loadCarousel()
    } catch (err: any) {
      console.error('Failed to reorder carousel items:', err)
      setCarouselItems(prevItems)
      showToast(`Failed to reorder carousel items: ${err?.message || 'Unknown error'}`, 'error')
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
          <h1 className="font-syne font-extrabold text-3xl sm:text-4xl text-text tracking-tight">
            System Setup
          </h1>
        </div>

        {/* Setup Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-2 border border-border rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('carousel')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'carousel'
                ? 'bg-btn-bg text-btn-fg font-semibold'
                : 'text-muted hover:text-text'
            }`}
          >
            Carousel
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pages')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'pages'
                ? 'bg-btn-bg text-btn-fg font-semibold'
                : 'text-muted hover:text-text'
            }`}
          >
            Pages
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auction')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'auction'
                ? 'bg-btn-bg text-btn-fg font-semibold'
                : 'text-muted hover:text-text'
            }`}
          >
            Auction
          </button>
        </div>
      </div>

      {/* Tab 1: Carousel Items */}
      {activeTab === 'carousel' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border rounded-2xl p-6">
            <div>
              <h2 className="font-syne font-bold text-xl text-text">Homepage Ticker Strip</h2>
              <p className="text-xs text-muted mt-1">
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
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90 transition-colors shrink-0"
            >
              <Plus size={16} weight="bold" />
              <span>Add item</span>
            </button>
          </div>

          {/* Offline/Error Retry Banner */}
          {carouselError && (
            <div className="bg-error/10 border border-error/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-text">
                <span className="w-2 h-2 rounded-full bg-error shrink-0" />
                <span className="break-all">{carouselError}</span>
              </div>
              <button
                type="button"
                onClick={loadCarousel}
                className="px-3.5 py-1.5 rounded-lg bg-surface-2 hover:bg-surface text-xs font-semibold text-text transition-colors shrink-0 self-start sm:self-auto"
              >
                Retry
              </button>
            </div>
          )}

          {isLoadingCarousel ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-surface border border-border/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : carouselItems.length === 0 ? (
            <div className="bg-surface border border-border rounded-2xl p-12 text-center text-muted">
              No carousel items configured. Click &ldquo;Add item&rdquo; to introduce ticker strings.
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {carouselItems.map((item, index) => (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-2/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="font-mono text-xs text-muted w-6 shrink-0">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text break-all font-sans">
                        {item.text}
                      </p>
                      <span className="text-[10px] font-mono text-muted">
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
                      className="p-2 rounded-lg border border-border text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ArrowUp size={14} weight="bold" />
                    </button>
                    <button
                      type="button"
                      disabled={index === carouselItems.length - 1}
                      onClick={() => handleMove(index, 'down')}
                      title="Move down"
                      className="p-2 rounded-lg border border-border text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ArrowDown size={14} weight="bold" />
                    </button>

                    {/* Active Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                        item.active
                          ? 'bg-accent-bright/15 border border-accent-bright text-accent-bright'
                          : 'bg-surface-2 border border-border text-muted'
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
                      className="p-2 rounded-lg border border-border text-muted hover:text-text transition-colors"
                    >
                      <PencilSimple size={14} />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteCarouselItem(item)}
                      title="Delete item"
                      className="p-2 rounded-lg border border-border text-muted hover:text-error transition-colors"
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
        <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
            <div>
              <h2 className="font-syne font-bold text-xl text-text">Public Pages Editor</h2>
              <p className="text-xs text-muted mt-1">
                Customize content for public Help and About pages stored in the site database.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedPageKey('help_page')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedPageKey === 'help_page'
                    ? 'bg-btn-bg text-btn-fg font-semibold'
                    : 'bg-surface-2 text-muted hover:text-text'
                }`}
              >
                Help Page
              </button>
              <button
                type="button"
                onClick={() => setSelectedPageKey('about_page')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedPageKey === 'about_page'
                    ? 'bg-btn-bg text-btn-fg font-semibold'
                    : 'bg-surface-2 text-muted hover:text-text'
                }`}
              >
                About Page
              </button>
            </div>
          </div>

          <form onSubmit={handleSavePage} className="space-y-5">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-2">
                Page Title
              </label>
              <input
                type="text"
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                required
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent-bright"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-2">
                Page Body Content
              </label>
              <textarea
                value={pageBody}
                onChange={(e) => setPageBody(e.target.value)}
                rows={8}
                placeholder="Enter markdown or plain text for this page..."
                className="w-full bg-bg border border-border rounded-xl p-4 text-sm text-text focus:outline-none focus:border-accent-bright leading-relaxed resize-y font-sans"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingPage}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-colors"
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
        <div className="bg-surface border border-border rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto text-muted">
            <Hourglass size={24} weight="duotone" />
          </div>
          <h2 className="font-syne font-bold text-2xl text-text">Auction Rules & Timing</h2>
          <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
            Live auction timing and settings will be configurable in a future release.
          </p>
          <div className="inline-block px-3 py-1 rounded-full bg-surface-2 border border-border font-mono text-[11px] text-muted">
            Drafting Engine: Manual Control Mode Active
          </div>
        </div>
      )}

      {/* Add / Edit Carousel Modal */}
      {isAddModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-scrim flex items-center justify-center p-4"
        >
          <div className="bg-surface border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-border mb-5">
              <h3 className="font-syne font-bold text-lg text-text">
                {editingItem ? 'Edit Ticker Item' : 'New Ticker Item'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false)
                  setEditingItem(null)
                }}
                className="p-1 rounded-lg text-muted hover:text-text"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <form onSubmit={handleSaveCarouselItem} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-mono uppercase tracking-wider text-muted">
                    Ticker Text
                  </label>
                  <span
                    className={`font-mono text-xs ${
                      itemText.length > 80 ? 'text-error' : 'text-muted'
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
                  disabled={isSavingCarousel}
                  className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent-bright disabled:opacity-50"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  disabled={isSavingCarousel}
                  onClick={() => {
                    setIsAddModalOpen(false)
                    setEditingItem(null)
                  }}
                  className="px-4 py-2 rounded-xl text-xs text-muted hover:text-text disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCarousel}
                  className="px-5 py-2 rounded-xl bg-btn-bg text-btn-fg text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                >
                  {isSavingCarousel ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
