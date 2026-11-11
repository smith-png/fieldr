import React, { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  FloppyDisk,
  Hourglass,
  PencilSimple,
  Plus,
  Trash
} from '@phosphor-icons/react'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import {
  createCarouselItem,
  deleteCarouselItem,
  getCarouselItems,
  getSiteSettings,
  swapCarouselItems,
  updateCarouselItem,
  updateSiteSetting
} from '../../lib/data'
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl
} from '../../components/ui'
import type { CarouselItem, PageContentSetting, SiteSettings } from '../../types'

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
    } catch (err) {
      console.error('Failed to load carousel items:', err)
      const msg = getErrorMessage(err, 'Failed to load carousel items')
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
    } catch (err) {
      console.error('Failed to load site settings:', err)
      showToast(`Failed to load site settings: ${getErrorMessage(err)}`, 'error')
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
    } catch (err) {
      console.error('Failed to save carousel item:', err)
      showToast(`Failed to save carousel item: ${getErrorMessage(err)}`, 'error')
    } finally {
      setIsSavingCarousel(false)
    }
  }

  // Handle Toggle Active
  const handleToggleActive = async (item: CarouselItem) => {
    if (item.active) {
      const activeCount = carouselItems.filter((i) => i.active).length
      if (activeCount <= 1) {
        showToast('At least 1 active ticker item is required.', 'error')
        return
      }
    }

    const prevItems = [...carouselItems]
    setCarouselItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i))
    )

    try {
      await updateCarouselItem(item.id, { active: !item.active })
      showToast(item.active ? 'Ticker item disabled' : 'Ticker item activated', 'success')
      await loadCarousel()
    } catch (err) {
      console.error('Failed to update carousel item:', err)
      setCarouselItems(prevItems)
      showToast(`Failed to update carousel item: ${getErrorMessage(err)}`, 'error')
    }
  }

  // Handle Delete
  const handleDeleteCarouselItem = async (item: CarouselItem) => {
    if (item.active) {
      const activeCount = carouselItems.filter((i) => i.active).length
      if (activeCount <= 1) {
        showToast('At least 1 active ticker item is required.', 'error')
        return
      }
    }

    const prevItems = [...carouselItems]
    setCarouselItems((prev) => prev.filter((i) => i.id !== item.id))

    try {
      await deleteCarouselItem(item.id)
      showToast('Item deleted', 'success')
      await loadCarousel()
    } catch (err) {
      console.error('Failed to delete carousel item:', err)
      setCarouselItems(prevItems)
      showToast(`Failed to delete carousel item: ${getErrorMessage(err)}`, 'error')
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
    } catch (err) {
      console.error('Failed to reorder carousel items:', err)
      setCarouselItems(prevItems)
      showToast(`Failed to reorder carousel items: ${getErrorMessage(err)}`, 'error')
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
      <PageHeader
        label="Site Configuration"
        title="System Setup"
        subtitle="Manage the homepage stadium ticker ribbon, public documentation pages, and auction settings."
        actions={
          <SegmentedControl
            ariaLabel="Setup sections"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'carousel', label: 'Carousel' },
              { value: 'pages', label: 'Pages' },
              { value: 'auction', label: 'Auction' }
            ]}
          />
        }
      />

      {/* Tab 1: Carousel Items */}
      {activeTab === 'carousel' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <div>
              <h2 className="font-syne font-bold text-xl text-text">Homepage Ticker Strip</h2>
              <p className="text-xs text-muted mt-1">
                Manage ticker announcements shown in the home page stadium ribbon. Max 80 characters per item.
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              leftIcon={Plus}
              onClick={() => {
                setEditingItem(null)
                setItemText('')
                setIsAddModalOpen(true)
              }}
            >
              Add item
            </Button>
          </div>

          {/* Offline/Error Retry Banner */}
          {carouselError && (
            <ErrorState
              title="Failed to load carousel items"
              message={carouselError}
              onRetry={loadCarousel}
            />
          )}

          {isLoadingCarousel ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-surface border border-border rounded-xl animate-pulse" />
              ))}
            </div>
          ) : carouselItems.length === 0 ? (
            <EmptyState
              title="No carousel items configured"
              description="Click Add item to introduce announcements to the homepage ticker strip."
              actionLabel="Add item"
              onAction={() => {
                setEditingItem(null)
                setItemText('')
                setIsAddModalOpen(true)
              }}
            />
          ) : (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden divide-y divide-border shadow-sm">
              {carouselItems.map((item, index) => (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-2/60 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="font-mono text-xs text-muted w-6 shrink-0 tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text break-all font-sans">
                        {item.text}
                      </p>
                      <span className="text-[10px] font-mono text-muted tabular-nums">
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
                      className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ArrowUp size={14} weight="bold" />
                    </button>
                    <button
                      type="button"
                      disabled={index === carouselItems.length - 1}
                      onClick={() => handleMove(index, 'down')}
                      title="Move down"
                      className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      <ArrowDown size={14} weight="bold" />
                    </button>

                    {/* Active Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleActive(item)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                        item.active
                          ? 'bg-surface-2 border border-accent-bright text-accent-bright font-semibold'
                          : 'bg-surface-2 border border-border text-muted hover:text-text'
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
                      className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                    >
                      <PencilSimple size={14} />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteCarouselItem(item)}
                      title="Delete item"
                      className="p-2 rounded-lg border border-border text-muted hover:text-error hover:bg-error/10 transition-colors"
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
        <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
            <div>
              <h2 className="font-syne font-bold text-xl text-text">Public Pages Editor</h2>
              <p className="text-xs text-muted mt-1">
                Customize content for public Help and About pages stored in the site database.
              </p>
            </div>

            <SegmentedControl
              ariaLabel="Select public page"
              size="sm"
              value={selectedPageKey}
              onChange={setSelectedPageKey}
              options={[
                { value: 'help_page', label: 'Help Page' },
                { value: 'about_page', label: 'About Page' }
              ]}
            />
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
              <Button
                type="submit"
                variant="primary"
                size="md"
                leftIcon={FloppyDisk}
                disabled={isSavingPage}
                isLoading={isSavingPage}
              >
                Save Page Content
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Auction Placeholder Card */}
      {activeTab === 'auction' && (
        <EmptyState
          icon={Hourglass}
          title="Auction Rules & Timing"
          description="Live auction timing and automated bidding increments will be configurable in a future release. Manual control mode is currently active."
        />
      )}

      {/* Add / Edit Carousel Dialog */}
      <Dialog
        isOpen={isAddModalOpen}
        onClose={() => {
          if (!isSavingCarousel) {
            setIsAddModalOpen(false)
            setEditingItem(null)
          }
        }}
        title={editingItem ? 'Edit Ticker Item' : 'New Ticker Item'}
        size="md"
      >
        <form onSubmit={handleSaveCarouselItem} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted">
                Ticker Text
              </label>
              <span
                className={`font-mono text-xs tabular-nums ${
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

          <div className="flex justify-end gap-2.5 pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isSavingCarousel}
              onClick={() => {
                setIsAddModalOpen(false)
                setEditingItem(null)
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSavingCarousel}
              isLoading={isSavingCarousel}
            >
              Save Item
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
