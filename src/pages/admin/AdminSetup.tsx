import { logError } from '../../lib/logger'
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  Check,
  FloppyDisk,
  PencilSimple,
  Play,
  Plus,
  Trash,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { lazyWithRetry } from '../../lib/lazyWithRetry'
import {
  DEFAULT_AUCTION_SETTINGS,
  DEFAULT_PRIMARY_ICON,
  DEFAULT_TICKER_SPEED,
  addSportRole,
  createCarouselItem,
  deleteCarouselItem,
  deleteSportRole,
  getActiveSeason,
  getAuctionSettings,
  getCarouselItems,
  getSiteSettings,
  getSportRoleUsageCounts,
  getSports,
  getTeams,
  getTickerSpeedMultiplier,
  normalizePrimaryIcon,
  normalizeTickerSpeed,
  renameSportRole,
  reorderSportRoles,
  saveAuctionSettings,
  swapCarouselItems,
  triggerConfetti,
  updateCarouselItem,
  updateSiteSetting
} from '../../lib/data'
import { publicCache } from '../../lib/publicCache'
import {
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  SkeletonBlock
} from '../../components/ui'
import FooterMark from '../../components/layout/FooterMark'
import { normalizeConfettiFallSpeed } from '../../components/projector/ProjectorConfetti'

const SecuredSequence = lazyWithRetry(() =>
  import('../../components/projector/SecuredSequence').then((m) => ({
    default: m.SecuredSequence
  }))
)
const CreditsSetupCard = lazyWithRetry(() =>
  import('../../components/admin/CreditsSetupCard').then((m) => ({
    default: m.CreditsSetupCard
  }))
)
const HandbookSetupCard = lazyWithRetry(() =>
  import('../../components/admin/HandbookSetupCard').then((m) => ({
    default: m.HandbookSetupCard
  }))
)
const RegistrationSetupCard = lazyWithRetry(() =>
  import('../../components/admin/RegistrationSetupCard').then((m) => ({
    default: m.RegistrationSetupCard
  }))
)
const ReelsSetupCard = lazyWithRetry(() =>
  import('../../components/admin/ReelsSetupCard').then((m) => ({
    default: m.ReelsSetupCard
  }))
)
const ReelSubmissionsCard = lazyWithRetry(() =>
  import('../../components/admin/ReelSubmissionsCard').then((m) => ({
    default: m.ReelSubmissionsCard
  }))
)
const PhotoOptimizerCard = lazyWithRetry(() =>
  import('../../components/admin/PhotoOptimizerCard').then((m) => ({
    default: m.PhotoOptimizerCard
  }))
)
const RulesSetupCard = lazyWithRetry(() =>
  import('../../components/admin/RulesSetupCard').then((m) => ({
    default: m.RulesSetupCard
  }))
)
const MarkdownContent = lazyWithRetry(() =>
  import('../../components/common/MarkdownContent').then((m) => ({
    default: m.MarkdownContent
  }))
)
import type {
  AuctionSettings,
  CarouselItem,
  PageContentSetting,
  PrimaryIconVariant,
  Season,
  SiteSettings,
  Sport,
  Team
} from '../../types'

type SetupTab = 'display' | 'registration' | 'content' | 'reels' | 'documents' | 'sports'

const SETUP_TABS: readonly { value: SetupTab; label: string }[] = [
  { value: 'display', label: 'Display' },
  { value: 'registration', label: 'Registration' },
  { value: 'content', label: 'Content' },
  { value: 'reels', label: 'Reels' },
  { value: 'documents', label: 'Documents' },
  { value: 'sports', label: 'Sports' }
]

const PRIMARY_ICON_OPTIONS: readonly {
  value: PrimaryIconVariant
  label: string
  description: string
}[] = [
  {
    value: 'classic',
    label: 'Classic',
    description: 'Animated emerald glass tile'
  },
  {
    value: 'floodlights',
    label: 'Stadium floodlights',
    description: 'Sweeping stadium beams'
  },
  {
    value: 'flames',
    label: 'Flames',
    description: 'Animated emerald flames'
  }
]

const DEFAULT_CONFETTI_FALL_SPEED = 5

interface AdminSetupProps {
  activeSeason?: Season | null
  teams?: Team[]
  onRefresh?: () => Promise<void>
}

// Clean SVG data URI portrait for the sample preview player
const SAMPLE_PLAYER_PHOTO_DATA_URI =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 480' fill='none'><rect width='400' height='480' fill='%23141B24'/><circle cx='200' cy='168' r='72' fill='%23253244'/><path d='M72 430C72 342 128 286 200 286C272 286 328 342 328 430' fill='%23253244'/></svg>"

const TICKER_PREVIEW_SAMPLE_ITEMS = [
  'LIVE PLAYER AUCTION',
  'TOURNAMENT ROSTERS',
  'REAL-TIME TEAM PURSES',
  'LIVE PLAYER AUCTION',
  'TOURNAMENT ROSTERS',
  'REAL-TIME TEAM PURSES',
  'LIVE PLAYER AUCTION',
  'TOURNAMENT ROSTERS',
  'REAL-TIME TEAM PURSES'
]

function areIncrementsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (Number(a[i]) !== Number(b[i])) return false
  }
  return true
}

export const AdminSetup: React.FC<AdminSetupProps> = ({
  activeSeason: propActiveSeason,
  teams: propTeams,
  onRefresh
}) => {
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState<SetupTab>('display')
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Effective season & teams (uses props when passed from AdminPage, or fetches fallback)
  const [fallbackSeason, setFallbackSeason] = useState<Season | null>(null)
  const [fallbackTeams, setFallbackTeams] = useState<Team[]>([])
  const effectiveSeason = propActiveSeason !== undefined ? propActiveSeason : fallbackSeason
  const effectiveTeams = propTeams !== undefined ? propTeams : fallbackTeams

  // Carousel State
  const [carouselItems, setCarouselItems] = useState<CarouselItem[]>([])
  const [isLoadingCarousel, setIsLoadingCarousel] = useState(false)
  const [carouselError, setCarouselError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<CarouselItem | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [itemText, setItemText] = useState('')
  const [isSavingCarousel, setIsSavingCarousel] = useState(false)

  // Ticker Speed State (1..10, default 5)
  const [savedTickerSpeed, setSavedTickerSpeed] = useState<number>(DEFAULT_TICKER_SPEED)
  const [tickerSpeed, setTickerSpeed] = useState<number>(DEFAULT_TICKER_SPEED)
  const [isSavingTickerSpeed, setIsSavingTickerSpeed] = useState<boolean>(false)
  const [tickerSpeedSaved, setTickerSpeedSaved] = useState<boolean>(false)
  const [tickerSpeedError, setTickerSpeedError] = useState<string | null>(null)
  const tickerSpeedSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previewTrackRef = useRef<HTMLDivElement>(null)
  const previewGroupRef = useRef<HTMLDivElement>(null)
  const [previewGroupWidth, setPreviewGroupWidth] = useState<number>(0)

  // Confetti Fall Speed State (1..10, default 5)
  const [savedConfettiFallSpeed, setSavedConfettiFallSpeed] = useState<number>(
    DEFAULT_CONFETTI_FALL_SPEED
  )
  const [confettiFallSpeed, setConfettiFallSpeed] = useState<number>(
    DEFAULT_CONFETTI_FALL_SPEED
  )
  const [isSavingConfettiSpeed, setIsSavingConfettiSpeed] = useState<boolean>(false)
  const [confettiSpeedSaved, setConfettiSpeedSaved] = useState<boolean>(false)
  const [confettiSpeedError, setConfettiSpeedError] = useState<string | null>(null)
  const confettiSpeedSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Site Icon State (classic | floodlights | flames, default classic)
  const [savedPrimaryIcon, setSavedPrimaryIcon] =
    useState<PrimaryIconVariant>(DEFAULT_PRIMARY_ICON)
  const [primaryIcon, setPrimaryIcon] = useState<PrimaryIconVariant>(DEFAULT_PRIMARY_ICON)
  const [isSavingPrimaryIcon, setIsSavingPrimaryIcon] = useState<boolean>(false)
  const [primaryIconSaved, setPrimaryIconSaved] = useState<boolean>(false)
  const [primaryIconError, setPrimaryIconError] = useState<string | null>(null)
  const primaryIconSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Test Confetti on Projector State (4s cooldown, 3s error message)
  const [isConfettiTestCoolingDown, setIsConfettiTestCoolingDown] = useState<boolean>(false)
  const [confettiTestError, setConfettiTestError] = useState<string | null>(null)
  const confettiTestCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const confettiTestErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pages State
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({})
  const [selectedPageKey, setSelectedPageKey] = useState<'help_page' | 'about_page'>('help_page')
  const [pageTitle, setPageTitle] = useState('')
  const [pageBody, setPageBody] = useState('')
  const [isSavingPage, setIsSavingPage] = useState(false)
  const [isPreviewingPage, setIsPreviewingPage] = useState(false)

  // Sports & Roles State
  const [sportsList, setSportsList] = useState<Sport[]>([])
  const [selectedSportId, setSelectedSportId] = useState<string>('cricket')
  const [roleUsageCounts, setRoleUsageCounts] = useState<Record<string, number>>({})
  const [isLoadingSports, setIsLoadingSports] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [isSavingRoleAction, setIsSavingRoleAction] = useState(false)
  const [renamingRole, setRenamingRole] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Auction Display & Rules State
  const [savedAuctionSettings, setSavedAuctionSettings] = useState<AuctionSettings | null>(null)
  const [isLoadingAuctionSettings, setIsLoadingAuctionSettings] = useState(false)
  const [isSavingAuctionSettings, setIsSavingAuctionSettings] = useState(false)

  const [securedEnabled, setSecuredEnabled] = useState<boolean>(
    DEFAULT_AUCTION_SETTINGS.secured_enabled
  )
  const [securedDurationInput, setSecuredDurationInput] = useState<string>(
    String(DEFAULT_AUCTION_SETTINGS.secured_duration_seconds)
  )
  const [priceCountupInput, setPriceCountupInput] = useState<string>(
    String(DEFAULT_AUCTION_SETTINGS.price_countup_seconds)
  )
  const [bidUpdateMsInput, setBidUpdateMsInput] = useState<string>(
    String(DEFAULT_AUCTION_SETTINGS.bid_update_ms)
  )
  const [catchupWindowInput, setCatchupWindowInput] = useState<string>(
    String(DEFAULT_AUCTION_SETTINGS.catchup_window_seconds)
  )
  const [bidIncrements, setBidIncrements] = useState<number[]>([
    ...DEFAULT_AUCTION_SETTINGS.bid_increments
  ])
  const [newIncrementInput, setNewIncrementInput] = useState<string>('')
  const [incrementError, setIncrementError] = useState<string | null>(null)
  const [noSquadLimit, setNoSquadLimit] = useState<boolean>(
    DEFAULT_AUCTION_SETTINGS.max_squad_size === null
  )
  const [maxSquadSizeInput, setMaxSquadSizeInput] = useState<string>('12')

  // Preview Overlay State
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false)
  const [previewReplayKey, setPreviewReplayKey] = useState<number>(0)

  // Load fallback season/teams if not passed via props
  useEffect(() => {
    if (propActiveSeason !== undefined) return
    let mounted = true
    getActiveSeason()
      .then((s) => {
        if (!mounted) return
        setFallbackSeason(s)
        if (s) {
          getTeams(s.id)
            .then((t) => {
              if (mounted) setFallbackTeams(t)
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [propActiveSeason])

  // Populate Auction Settings form from an AuctionSettings object
  const applySettingsToForm = useCallback((settings: AuctionSettings) => {
    setSecuredEnabled(Boolean(settings.secured_enabled))
    setSecuredDurationInput(String(settings.secured_duration_seconds))
    setPriceCountupInput(String(settings.price_countup_seconds))
    setBidUpdateMsInput(String(settings.bid_update_ms))
    setCatchupWindowInput(String(settings.catchup_window_seconds))
    setBidIncrements([...settings.bid_increments].sort((a, b) => a - b))
    setNewIncrementInput('')
    setIncrementError(null)
    if (settings.max_squad_size === null || settings.max_squad_size === undefined) {
      setNoSquadLimit(true)
      setMaxSquadSizeInput('12')
    } else {
      setNoSquadLimit(false)
      setMaxSquadSizeInput(String(settings.max_squad_size))
    }
  }, [])

  // Reload Auction Settings whenever selected season changes
  const loadAuctionSettingsForSeason = useCallback(
    async (seasonId: string) => {
      if (!seasonId) return
      try {
        setIsLoadingAuctionSettings(true)
        const loaded = await getAuctionSettings(seasonId)
        setSavedAuctionSettings(loaded)
        applySettingsToForm(loaded)
      } catch (err) {
        showToast(getErrorMessage(err, 'Failed to load auction settings'), 'error')
      } finally {
        setIsLoadingAuctionSettings(false)
      }
    },
    [applySettingsToForm, showToast]
  )

  useEffect(() => {
    if (effectiveSeason?.id) {
      loadAuctionSettingsForSeason(effectiveSeason.id)
    } else {
      setSavedAuctionSettings(null)
    }
  }, [effectiveSeason?.id, loadAuctionSettingsForSeason])

  // Load Carousel Items
  const loadCarousel = async () => {
    try {
      setIsLoadingCarousel(true)
      setCarouselError(null)
      const items = await getCarouselItems(false)
      setCarouselItems(items)
    } catch (err) {
      logError('Failed to load carousel items:', err)
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
      publicCache.siteSettings = { loaded: true, value: settings }
      const loadedSpeed = normalizeTickerSpeed(settings.ticker_speed)
      setSavedTickerSpeed(loadedSpeed)
      setTickerSpeed(loadedSpeed)
      const loadedConfettiSpeed = normalizeConfettiFallSpeed(
        settings.confetti_fall_speed
      )
      setSavedConfettiFallSpeed(loadedConfettiSpeed)
      setConfettiFallSpeed(loadedConfettiSpeed)
      const loadedPrimaryIcon = normalizePrimaryIcon(settings.primary_icon)
      setSavedPrimaryIcon(loadedPrimaryIcon)
      setPrimaryIcon(loadedPrimaryIcon)
      const initialPage = settings[selectedPageKey] as PageContentSetting | undefined
      if (initialPage) {
        setPageTitle(initialPage.title || '')
        setPageBody(initialPage.body || '')
      }
    } catch (err) {
      logError('Failed to load site settings:', err)
      showToast(`Failed to load site settings: ${getErrorMessage(err)}`, 'error')
    }
  }

  // Load Sports & Role Usage Counts
  const loadSportsAndUsage = useCallback(
    async (targetSportId?: string) => {
      try {
        setIsLoadingSports(true)
        const allSports = await getSports()
        setSportsList(allSports)
        const activeId =
          targetSportId ||
          (allSports.some((s) => s.id === selectedSportId)
            ? selectedSportId
            : allSports[0]?.id || 'cricket')
        setSelectedSportId(activeId)
        const counts = await getSportRoleUsageCounts(activeId)
        setRoleUsageCounts(counts)
      } catch (err) {
        showToast(getErrorMessage(err, 'Failed to load sports and roles'), 'error')
      } finally {
        setIsLoadingSports(false)
      }
    },
    [selectedSportId, showToast]
  )

  useEffect(() => {
    void Promise.all([
      loadCarousel(),
      loadSettings(),
      loadSportsAndUsage('cricket')
    ])
  }, [])

  // Refresh role usage counts when selectedSportId changes
  const handleSelectSport = async (sportId: string) => {
    setSelectedSportId(sportId)
    setRenamingRole(null)
    setRenameValue('')
    setNewRoleName('')
    try {
      const counts = await getSportRoleUsageCounts(sportId)
      setRoleUsageCounts(counts)
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load role usage counts'), 'error')
    }
  }

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
        const maxOrder =
          carouselItems.length > 0
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
      logError('Failed to save carousel item:', err)
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
      logError('Failed to update carousel item:', err)
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
      logError('Failed to delete carousel item:', err)
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
      logError('Failed to reorder carousel items:', err)
      setCarouselItems(prevItems)
      showToast(`Failed to reorder carousel items: ${getErrorMessage(err)}`, 'error')
    }
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (tickerSpeedSavedTimerRef.current) {
        clearTimeout(tickerSpeedSavedTimerRef.current)
      }
      if (confettiSpeedSavedTimerRef.current) {
        clearTimeout(confettiSpeedSavedTimerRef.current)
      }
      if (confettiTestCooldownTimerRef.current) {
        clearTimeout(confettiTestCooldownTimerRef.current)
      }
      if (confettiTestErrorTimerRef.current) {
        clearTimeout(confettiTestErrorTimerRef.current)
      }
    }
  }, [])

  // Measure live preview group width for exact 60px/s base speed
  useEffect(() => {
    if (activeTab !== 'display' || !previewGroupRef.current) return

    const updateWidth = () => {
      if (!previewGroupRef.current) return
      const w = Math.round(previewGroupRef.current.offsetWidth || 0)
      if (w > 0) {
        setPreviewGroupWidth((prev) => (Math.abs(prev - w) >= 2 ? w : prev))
      }
    }

    updateWidth()
    const observer = new ResizeObserver(() => updateWidth())
    observer.observe(previewGroupRef.current)
    window.addEventListener('resize', updateWidth)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [activeTab])

  const previewBaseDurationSec = useMemo(() => {
    const w = previewGroupWidth > 0 ? previewGroupWidth : 1440
    return Math.max(6, w / 60)
  }, [previewGroupWidth])

  // Update preview marquee playbackRate instantaneously as the slider moves
  useEffect(() => {
    if (activeTab !== 'display' || !previewTrackRef.current) return
    const mult = getTickerSpeedMultiplier(tickerSpeed)
    const animations = previewTrackRef.current.getAnimations?.()
    if (animations && animations.length > 0) {
      animations.forEach((anim) => {
        anim.playbackRate = mult
      })
    }
  }, [activeTab, tickerSpeed, previewBaseDurationSec])

  const isTickerSpeedDirty = tickerSpeed !== savedTickerSpeed

  const handleSaveTickerSpeed = async () => {
    if (!isTickerSpeedDirty || isSavingTickerSpeed) return
    const normalized = normalizeTickerSpeed(tickerSpeed)
    try {
      setIsSavingTickerSpeed(true)
      setTickerSpeedError(null)
      setTickerSpeedSaved(false)
      await updateSiteSetting('ticker_speed', normalized)
      setSavedTickerSpeed(normalized)
      setTickerSpeed(normalized)
      setSiteSettings((prev) => {
        const next = { ...prev, ticker_speed: normalized }
        publicCache.siteSettings = { loaded: true, value: next }
        return next
      })
      setTickerSpeedSaved(true)
      if (tickerSpeedSavedTimerRef.current) {
        clearTimeout(tickerSpeedSavedTimerRef.current)
      }
      tickerSpeedSavedTimerRef.current = setTimeout(() => {
        setTickerSpeedSaved(false)
        tickerSpeedSavedTimerRef.current = null
      }, 2500)
    } catch (err) {
      setTickerSpeedSaved(false)
      setTickerSpeedError(getErrorMessage(err, 'Failed to save ticker speed'))
    } finally {
      setIsSavingTickerSpeed(false)
    }
  }

  const handleResetTickerSpeed = () => {
    if (isSavingTickerSpeed) return
    setTickerSpeed(DEFAULT_TICKER_SPEED)
    setTickerSpeedSaved(false)
    setTickerSpeedError(null)
  }

  const isConfettiSpeedDirty = confettiFallSpeed !== savedConfettiFallSpeed

  const handleSaveConfettiSpeed = async () => {
    if (!isConfettiSpeedDirty || isSavingConfettiSpeed) return
    const normalized = normalizeConfettiFallSpeed(confettiFallSpeed)
    try {
      setIsSavingConfettiSpeed(true)
      setConfettiSpeedError(null)
      setConfettiSpeedSaved(false)
      await updateSiteSetting('confetti_fall_speed', normalized)
      setSavedConfettiFallSpeed(normalized)
      setConfettiFallSpeed(normalized)
      setSiteSettings((prev) => {
        const next = { ...prev, confetti_fall_speed: normalized }
        publicCache.siteSettings = { loaded: true, value: next }
        return next
      })
      setConfettiSpeedSaved(true)
      if (confettiSpeedSavedTimerRef.current) {
        clearTimeout(confettiSpeedSavedTimerRef.current)
      }
      confettiSpeedSavedTimerRef.current = setTimeout(() => {
        setConfettiSpeedSaved(false)
        confettiSpeedSavedTimerRef.current = null
      }, 2500)
    } catch (err) {
      setConfettiSpeedSaved(false)
      setConfettiSpeedError(getErrorMessage(err, 'Failed to save fall speed'))
    } finally {
      setIsSavingConfettiSpeed(false)
    }
  }

  const handleResetConfettiSpeed = () => {
    if (isSavingConfettiSpeed) return
    setConfettiFallSpeed(DEFAULT_CONFETTI_FALL_SPEED)
    setConfettiSpeedSaved(false)
    setConfettiSpeedError(null)
  }

  const isPrimaryIconDirty = primaryIcon !== savedPrimaryIcon

  const handleSavePrimaryIcon = async () => {
    if (!isPrimaryIconDirty || isSavingPrimaryIcon) return
    const normalized = normalizePrimaryIcon(primaryIcon)
    try {
      setIsSavingPrimaryIcon(true)
      setPrimaryIconError(null)
      setPrimaryIconSaved(false)
      await updateSiteSetting('primary_icon', normalized)
      setSavedPrimaryIcon(normalized)
      setPrimaryIcon(normalized)
      setSiteSettings((prev) => {
        const next = { ...prev, primary_icon: normalized }
        publicCache.siteSettings = { loaded: true, value: next }
        return next
      })
      setPrimaryIconSaved(true)
      if (primaryIconSavedTimerRef.current) {
        clearTimeout(primaryIconSavedTimerRef.current)
      }
      primaryIconSavedTimerRef.current = setTimeout(() => {
        setPrimaryIconSaved(false)
        primaryIconSavedTimerRef.current = null
      }, 2500)
    } catch (err) {
      setPrimaryIconSaved(false)
      setPrimaryIconError(getErrorMessage(err, 'Failed to save site icon'))
    } finally {
      setIsSavingPrimaryIcon(false)
    }
  }

  const handleResetPrimaryIcon = () => {
    if (isSavingPrimaryIcon) return
    setPrimaryIcon(DEFAULT_PRIMARY_ICON)
    setPrimaryIconSaved(false)
    setPrimaryIconError(null)
  }

  useEffect(() => {
    return () => {
      if (primaryIconSavedTimerRef.current) {
        clearTimeout(primaryIconSavedTimerRef.current)
      }
    }
  }, [])

  const showConfettiTestError = (message: string) => {
    setConfettiTestError(message)
    if (confettiTestErrorTimerRef.current) {
      clearTimeout(confettiTestErrorTimerRef.current)
    }
    confettiTestErrorTimerRef.current = setTimeout(() => {
      setConfettiTestError(null)
      confettiTestErrorTimerRef.current = null
    }, 3000)
  }

  const handleTestConfettiOnProjector = async () => {
    if (isConfettiTestCoolingDown) return
    if (!effectiveSeason?.id) {
      showConfettiTestError('No active season')
      return
    }

    setIsConfettiTestCoolingDown(true)
    setConfettiTestError(null)
    if (confettiTestErrorTimerRef.current) {
      clearTimeout(confettiTestErrorTimerRef.current)
      confettiTestErrorTimerRef.current = null
    }

    if (confettiTestCooldownTimerRef.current) {
      clearTimeout(confettiTestCooldownTimerRef.current)
    }
    confettiTestCooldownTimerRef.current = setTimeout(() => {
      setIsConfettiTestCoolingDown(false)
      confettiTestCooldownTimerRef.current = null
    }, 4000)

    try {
      await triggerConfetti(effectiveSeason.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to trigger confetti'
      showConfettiTestError(msg)
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
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to save page content'), 'error')
    } finally {
      setIsSavingPage(false)
    }
  }

  // Sports & Roles Handlers
  const selectedSport = sportsList.find((s) => s.id === selectedSportId) || sportsList[0] || null

  const handleAddRole = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSport || isSavingRoleAction) return

    const trimmed = newRoleName.trim()
    if (!trimmed) {
      showToast('Role name is required.', 'error')
      return
    }
    if (selectedSport.roles.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`Role "${trimmed}" already exists in ${selectedSport.name}.`, 'error')
      return
    }

    try {
      setIsSavingRoleAction(true)
      await addSportRole(selectedSport.id, trimmed)
      setNewRoleName('')
      showToast(`Added role "${trimmed}" to ${selectedSport.name}`, 'success')
      await loadSportsAndUsage(selectedSport.id)
      await onRefresh?.()
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to add role'), 'error')
    } finally {
      setIsSavingRoleAction(false)
    }
  }

  const handleStartRename = (role: string) => {
    setRenamingRole(role)
    setRenameValue(role)
  }

  const handleConfirmRename = async (oldRole: string) => {
    if (!selectedSport || isSavingRoleAction) return
    const trimmed = renameValue.trim()
    if (!trimmed) {
      showToast('Role name is required.', 'error')
      return
    }
    if (trimmed === oldRole) {
      setRenamingRole(null)
      return
    }

    const duplicate = selectedSport.roles.some(
      (r) => r.toLowerCase() !== oldRole.toLowerCase() && r.toLowerCase() === trimmed.toLowerCase()
    )
    if (duplicate) {
      showToast(`Role "${trimmed}" already exists in ${selectedSport.name}.`, 'error')
      return
    }

    try {
      setIsSavingRoleAction(true)
      const { updatedPlayersCount } = await renameSportRole(selectedSport.id, oldRole, trimmed)
      setRenamingRole(null)
      setRenameValue('')
      showToast(
        `Role renamed to "${trimmed}". ${updatedPlayersCount} ${
          updatedPlayersCount === 1 ? 'player' : 'players'
        } updated.`,
        'success'
      )
      await loadSportsAndUsage(selectedSport.id)
      await onRefresh?.()
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to rename role'), 'error')
    } finally {
      setIsSavingRoleAction(false)
    }
  }

  const handleMoveRole = async (index: number, direction: 'up' | 'down') => {
    if (!selectedSport || isSavingRoleAction) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= selectedSport.roles.length) return

    const nextRoles = [...selectedSport.roles]
    const temp = nextRoles[index]
    nextRoles[index] = nextRoles[targetIndex]
    nextRoles[targetIndex] = temp

    try {
      setIsSavingRoleAction(true)
      await reorderSportRoles(selectedSport.id, nextRoles)
      showToast('Role order updated', 'success')
      await loadSportsAndUsage(selectedSport.id)
      await onRefresh?.()
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to reorder roles'), 'error')
    } finally {
      setIsSavingRoleAction(false)
    }
  }

  const handleDeleteRole = async (role: string) => {
    if (!selectedSport || isSavingRoleAction) return

    const usedCount = roleUsageCounts[role] || 0
    if (usedCount > 0) {
      showToast(
        `${usedCount} players use this role. Rename it or change those players first.`,
        'error'
      )
      return
    }

    try {
      setIsSavingRoleAction(true)
      await deleteSportRole(selectedSport.id, role)
      showToast(`Deleted role "${role}"`, 'success')
      await loadSportsAndUsage(selectedSport.id)
      await onRefresh?.()
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete role'), 'error')
    } finally {
      setIsSavingRoleAction(false)
    }
  }

  // Auction Settings Validation & Handlers
  const parsedDuration = Number(securedDurationInput)
  const parsedCountup = Number(priceCountupInput)
  const parsedBidUpdateMs = Number(bidUpdateMsInput)
  const parsedCatchup = Number(catchupWindowInput)
  const parsedMaxSquad = noSquadLimit ? null : Number(maxSquadSizeInput)

  const durationError = useMemo(() => {
    if (securedDurationInput.trim() === '' || isNaN(parsedDuration)) {
      return 'Enter a number between 2 and 15 seconds.'
    }
    if (parsedDuration < 2 || parsedDuration > 15) {
      return 'Secured sequence length must be between 2 and 15 seconds.'
    }
    return null
  }, [securedDurationInput, parsedDuration])

  const countupError = useMemo(() => {
    if (priceCountupInput.trim() === '' || isNaN(parsedCountup)) {
      return 'Enter a number between 0.3 and 6 seconds.'
    }
    if (parsedCountup < 0.3 || parsedCountup > 6) {
      return 'Price count-up must be between 0.3 and 6 seconds.'
    }
    if (!isNaN(parsedDuration) && parsedCountup > parsedDuration) {
      return `Price count-up (${parsedCountup}s) cannot exceed the secured sequence length (${parsedDuration}s).`
    }
    return null
  }, [priceCountupInput, parsedCountup, parsedDuration])

  const bidUpdateError = useMemo(() => {
    if (
      bidUpdateMsInput.trim() === '' ||
      isNaN(parsedBidUpdateMs) ||
      !Number.isInteger(parsedBidUpdateMs) ||
      parsedBidUpdateMs < 100 ||
      parsedBidUpdateMs > 2000
    ) {
      return 'Bid update animation must be an integer between 100 and 2000 ms.'
    }
    return null
  }, [bidUpdateMsInput, parsedBidUpdateMs])

  const catchupError = useMemo(() => {
    if (
      catchupWindowInput.trim() === '' ||
      isNaN(parsedCatchup) ||
      !Number.isInteger(parsedCatchup) ||
      parsedCatchup < 0 ||
      parsedCatchup > 120
    ) {
      return 'Catch-up window must be an integer between 0 and 120 seconds.'
    }
    return null
  }, [catchupWindowInput, parsedCatchup])

  const maxSquadError = useMemo(() => {
    if (noSquadLimit) return null
    if (
      maxSquadSizeInput.trim() === '' ||
      parsedMaxSquad === null ||
      isNaN(parsedMaxSquad) ||
      !Number.isInteger(parsedMaxSquad) ||
      parsedMaxSquad < 1
    ) {
      return 'Maximum squad size must be a whole number of at least 1.'
    }
    return null
  }, [noSquadLimit, maxSquadSizeInput, parsedMaxSquad])

  const isAuctionFormValid =
    !durationError &&
    !countupError &&
    !bidUpdateError &&
    !catchupError &&
    !maxSquadError &&
    bidIncrements.length >= 1

  const isAuctionFormDirty = useMemo(() => {
    if (!savedAuctionSettings) return false
    if (securedEnabled !== savedAuctionSettings.secured_enabled) return true
    if (parsedDuration !== Number(savedAuctionSettings.secured_duration_seconds)) return true
    if (parsedCountup !== Number(savedAuctionSettings.price_countup_seconds)) return true
    if (parsedBidUpdateMs !== Number(savedAuctionSettings.bid_update_ms)) return true
    if (parsedCatchup !== Number(savedAuctionSettings.catchup_window_seconds)) return true
    if (!areIncrementsEqual(bidIncrements, savedAuctionSettings.bid_increments)) return true
    const savedMax = savedAuctionSettings.max_squad_size ?? null
    if (parsedMaxSquad !== savedMax) return true
    return false
  }, [
    savedAuctionSettings,
    securedEnabled,
    parsedDuration,
    parsedCountup,
    parsedBidUpdateMs,
    parsedCatchup,
    bidIncrements,
    parsedMaxSquad
  ])

  const handleAddIncrementChip = () => {
    setIncrementError(null)
    const raw = newIncrementInput.trim()
    if (!raw) return
    const val = Number(raw)
    if (isNaN(val) || val <= 0) {
      setIncrementError('Bid increment must be a positive number.')
      return
    }
    if (bidIncrements.some((inc) => inc === val)) {
      setIncrementError(`Increment +${val} already exists.`)
      return
    }
    const next = [...bidIncrements, val].sort((a, b) => a - b)
    setBidIncrements(next)
    setNewIncrementInput('')
  }

  const handleRemoveIncrementChip = (val: number) => {
    setIncrementError(null)
    if (bidIncrements.length <= 1) {
      setIncrementError('At least one bid increment is required.')
      return
    }
    setBidIncrements(bidIncrements.filter((inc) => inc !== val))
  }

  const handleResetAuctionDefaults = () => {
    if (!effectiveSeason) return
    applySettingsToForm({
      season_id: effectiveSeason.id,
      ...DEFAULT_AUCTION_SETTINGS,
      bid_increments: [...DEFAULT_AUCTION_SETTINGS.bid_increments]
    })
  }

  const handleSaveAuctionSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!effectiveSeason || !isAuctionFormValid || !isAuctionFormDirty || isSavingAuctionSettings) {
      return
    }

    try {
      setIsSavingAuctionSettings(true)
      const payload: AuctionSettings = {
        season_id: effectiveSeason.id,
        bid_increments: [...bidIncrements].sort((a, b) => a - b),
        max_squad_size: noSquadLimit ? null : Math.round(Number(maxSquadSizeInput)),
        secured_enabled: securedEnabled,
        secured_duration_seconds: parsedDuration,
        price_countup_seconds: parsedCountup,
        bid_update_ms: Math.round(parsedBidUpdateMs),
        catchup_window_seconds: Math.round(parsedCatchup)
      }
      const saved = await saveAuctionSettings(payload)
      setSavedAuctionSettings(saved)
      applySettingsToForm(saved)
      showToast('Auction display and rules saved', 'success')
      await onRefresh?.()
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to save auction settings'), 'error')
    } finally {
      setIsSavingAuctionSettings(false)
    }
  }

  // Sample data for the preview overlay (uses first team of selected season if one exists)
  const previewSampleTeam = effectiveTeams[0] || null
  const previewDurationSec =
    !isNaN(parsedDuration) && parsedDuration >= 2 && parsedDuration <= 15
      ? parsedDuration
      : DEFAULT_AUCTION_SETTINGS.secured_duration_seconds
  const previewCountupSec =
    !isNaN(parsedCountup) && parsedCountup >= 0.3 && parsedCountup <= 6
      ? Math.min(parsedCountup, previewDurationSec)
      : Math.min(DEFAULT_AUCTION_SETTINGS.price_countup_seconds, previewDurationSec)

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = -1
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      nextIndex = (index + 1) % SETUP_TABS.length
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      nextIndex = (index - 1 + SETUP_TABS.length) % SETUP_TABS.length
    }
    if (nextIndex !== -1) {
      setActiveTab(SETUP_TABS[nextIndex].value)
      tabButtonRefs.current[nextIndex]?.focus()
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header & Single-Row Horizontal Tab Bar */}
      <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-5 border-b border-border">
        <h1 className="font-syne font-extrabold text-3xl sm:text-4xl tracking-tight text-text">
          System Setup
        </h1>

        <div className="w-full lg:w-auto overflow-x-auto pb-1 -mb-1">
          <div
            role="tablist"
            aria-label="System Setup sections"
            className="inline-flex flex-nowrap items-center gap-1 p-1 rounded-full bg-surface-2 border border-border w-max"
          >
            {SETUP_TABS.map((tab, index) => {
              const isSelected = activeTab === tab.value
              return (
                <button
                  key={tab.value}
                  ref={(el) => {
                    tabButtonRefs.current[index] = el
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => setActiveTab(tab.value)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                  className={`min-h-[38px] px-4 py-1.5 rounded-full text-sm font-sans whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright ${
                    isSelected
                      ? 'bg-btn-bg text-btn-fg font-medium'
                      : 'text-muted hover:text-text font-normal'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Tab 1: Display (Homepage Ticker Strip, Auction Display and Rules, Confetti) */}
      {activeTab === 'display' && (
        <div className="space-y-6">
          {/* Section 1: Homepage Ticker Strip */}
          <section className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-border">
              <h2 className="font-syne font-bold text-xl text-text tracking-tight">
                Homepage Ticker Strip
              </h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={Plus}
                onClick={() => {
                  setEditingItem(null)
                  setItemText('')
                  setIsAddModalOpen(true)
                }}
                className="rounded-full self-start sm:self-auto"
              >
                Add item
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left: Ticker Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text">Items</span>
                  <span className="text-xs text-muted tabular-nums">Max 80 chars</span>
                </div>

                {carouselError && (
                  <ErrorState
                    title="Failed to load carousel items"
                    message={carouselError}
                    onRetry={loadCarousel}
                  />
                )}

                {isLoadingCarousel ? (
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((i) => (
                      <SkeletonBlock
                        key={i}
                        className="h-14 bg-bg border border-border rounded-2xl"
                      />
                    ))}
                  </div>
                ) : carouselItems.length === 0 ? (
                  <EmptyState
                    title="No ticker items"
                    description="Add an announcement for the homepage strip."
                    actionLabel="Add item"
                    onAction={() => {
                      setEditingItem(null)
                      setItemText('')
                      setIsAddModalOpen(true)
                    }}
                  />
                ) : (
                  <div className="bg-bg border border-border rounded-2xl overflow-hidden divide-y divide-border">
                    {carouselItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors"
                      >
                        <p className="text-sm font-normal text-text break-words min-w-0 flex-1">
                          {item.text}
                        </p>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMove(index, 'up')}
                            title="Move up"
                            aria-label="Move item up"
                            className="relative hit-44 w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                          >
                            <ArrowUp size={15} weight="regular" />
                          </button>
                          <button
                            type="button"
                            disabled={index === carouselItems.length - 1}
                            onClick={() => handleMove(index, 'down')}
                            title="Move down"
                            aria-label="Move item down"
                            className="relative hit-44 w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                          >
                            <ArrowDown size={15} weight="regular" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleActive(item)}
                            className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                              item.active
                                ? 'bg-surface border-accent-bright text-accent-bright'
                                : 'bg-surface-2 border-border text-muted hover:text-text'
                            }`}
                          >
                            {item.active ? 'Active' : 'Inactive'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item)
                              setItemText(item.text)
                              setIsAddModalOpen(true)
                            }}
                            title="Edit text"
                            aria-label="Edit item"
                            className="relative hit-44 w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
                          >
                            <PencilSimple size={15} weight="regular" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCarouselItem(item)}
                            title="Delete item"
                            aria-label="Delete item"
                            className="relative hit-44 w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
                          >
                            <Trash size={15} weight="regular" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Ticker Speed & Live Preview */}
              <div className="bg-bg border border-border rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="setup-ticker-speed-slider"
                    className="text-sm font-medium text-text"
                  >
                    Ticker speed
                  </label>
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {tickerSpeed} / 10
                  </span>
                </div>

                <div className="space-y-2">
                  <input
                    id="setup-ticker-speed-slider"
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={tickerSpeed}
                    aria-label="Ticker speed"
                    onChange={(e) => {
                      const nextVal = normalizeTickerSpeed(Number(e.target.value))
                      setTickerSpeed(nextVal)
                      setTickerSpeedSaved(false)
                      setTickerSpeedError(null)
                    }}
                    className="w-full accent-accent-bright cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Slow</span>
                    <span>Fast</span>
                  </div>
                </div>

                {/* Live Preview Strip */}
                <div
                  aria-label="Ticker speed live preview"
                  className="w-full bg-surface border border-border rounded-xl py-3 overflow-hidden select-none relative"
                >
                  <div
                    ref={previewTrackRef}
                    className="flex will-change-transform animate-ticker"
                    style={{
                      animationDuration: `${previewBaseDurationSec}s`
                    }}
                  >
                    <div
                      ref={previewGroupRef}
                      className="flex shrink-0 items-center whitespace-nowrap font-dot text-[15px] md:text-[17px] leading-normal tracking-[0.16em] text-text"
                    >
                      {TICKER_PREVIEW_SAMPLE_ITEMS.map((sample, idx) => (
                        <span key={`prev-a-${idx}`} className="inline-flex items-center">
                          <span>{sample}</span>
                          <span className="mx-4 md:mx-6 text-accent select-none" aria-hidden="true">
                            /
                          </span>
                        </span>
                      ))}
                    </div>
                    <div
                      aria-hidden="true"
                      className="flex shrink-0 items-center whitespace-nowrap font-dot text-[15px] md:text-[17px] leading-normal tracking-[0.16em] text-text"
                    >
                      {TICKER_PREVIEW_SAMPLE_ITEMS.map((sample, idx) => (
                        <span key={`prev-b-${idx}`} className="inline-flex items-center">
                          <span>{sample}</span>
                          <span className="mx-4 md:mx-6 text-accent select-none" aria-hidden="true">
                            /
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {tickerSpeedError && (
                  <p role="alert" className="text-xs text-error">
                    {tickerSpeedError}
                  </p>
                )}

                <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    leftIcon={ArrowCounterClockwise}
                    disabled={isSavingTickerSpeed || tickerSpeed === DEFAULT_TICKER_SPEED}
                    onClick={handleResetTickerSpeed}
                    className="rounded-full"
                  >
                    Reset to default
                  </Button>

                  <div className="flex items-center gap-2.5 ml-auto">
                    {tickerSpeedSaved && !isTickerSpeedDirty && (
                      <span className="text-xs text-accent-bright inline-flex items-center gap-1">
                        <Check size={14} weight="regular" />
                        <span>Saved</span>
                      </span>
                    )}
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      leftIcon={FloppyDisk}
                      disabled={!isTickerSpeedDirty || isSavingTickerSpeed}
                      isLoading={isSavingTickerSpeed}
                      onClick={() => void handleSaveTickerSpeed()}
                      className="rounded-full px-4"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: Auction Display and Rules */}
          <section className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-border">
              <h2 className="font-syne font-bold text-xl text-text tracking-tight">
                Auction Display and Rules
              </h2>

              <div className="px-3.5 py-1.5 rounded-full bg-surface-2 border border-border text-xs text-text shrink-0 self-start sm:self-auto">
                Applies to the selected season:{' '}
                <strong className="font-semibold text-accent-bright">
                  {effectiveSeason?.name || 'None selected'}
                </strong>
              </div>
            </div>

            {!effectiveSeason ? (
              <EmptyState
                title="No active season selected"
                description="Select or create a season in Seasons to configure auction settings."
              />
            ) : isLoadingAuctionSettings ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <SkeletonBlock
                    key={i}
                    className="h-20 bg-bg border border-border rounded-2xl"
                  />
                ))}
              </div>
            ) : (
              <form onSubmit={handleSaveAuctionSettings} className="space-y-6">
                {/* Group 1: Animation & Timing */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-4 py-1">
                    <label
                      htmlFor="toggle-secured-enabled"
                      className="text-sm font-medium text-text cursor-pointer"
                    >
                      Secured animation
                    </label>

                    <button
                      id="toggle-secured-enabled"
                      type="button"
                      role="switch"
                      aria-checked={securedEnabled}
                      onClick={() => setSecuredEnabled((v) => !v)}
                      className="inline-flex items-center gap-3 min-h-[40px] px-3 py-1.5 rounded-full bg-bg border border-border hover:border-text/30 transition-colors shrink-0 cursor-pointer"
                    >
                      <span
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          securedEnabled ? 'bg-accent-bright' : 'bg-surface-2 border border-border'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                            securedEnabled
                              ? 'translate-x-5 bg-white'
                              : 'translate-x-0.5 bg-muted'
                          }`}
                        />
                      </span>
                      <span className="text-xs font-medium text-text min-w-[22px] text-left">
                        {securedEnabled ? 'On' : 'Off'}
                      </span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Secured sequence length */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-bg border border-border space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="secured-duration-number"
                          className="text-sm font-medium text-text"
                        >
                          Secured sequence length
                        </label>
                        <span className="font-mono text-xs text-muted tabular-nums">2–15 s</span>
                      </div>

                      <div className="flex items-center gap-3.5">
                        <input
                          type="range"
                          min={2}
                          max={15}
                          step={0.1}
                          aria-label="Secured sequence length slider"
                          value={
                            !isNaN(parsedDuration)
                              ? Math.min(15, Math.max(2, parsedDuration))
                              : 5.6
                          }
                          onChange={(e) => setSecuredDurationInput(e.target.value)}
                          className="flex-1 h-2 bg-surface-2 rounded-full accent-accent-bright cursor-pointer"
                        />
                        <div className="relative w-24 shrink-0">
                          <input
                            id="secured-duration-number"
                            type="number"
                            min={2}
                            max={15}
                            step={0.1}
                            value={securedDurationInput}
                            onChange={(e) => setSecuredDurationInput(e.target.value)}
                            className={`w-full min-h-[42px] bg-surface border rounded-xl pl-3 pr-7 py-2 font-mono text-sm font-medium text-text tabular-nums focus:outline-none ${
                              durationError
                                ? 'border-error focus:border-error'
                                : 'border-border focus:border-accent-bright'
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                            s
                          </span>
                        </div>
                      </div>

                      {durationError && (
                        <div className="flex items-center gap-1.5 text-xs text-error">
                          <WarningCircle size={15} weight="regular" className="shrink-0" />
                          <span>{durationError}</span>
                        </div>
                      )}
                    </div>

                    {/* Price count-up */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-bg border border-border space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="price-countup-number"
                          className="text-sm font-medium text-text"
                        >
                          Price count-up
                        </label>
                        <span className="font-mono text-xs text-muted tabular-nums">
                          0.3–6 s, ≤ length
                        </span>
                      </div>

                      <div className="flex items-center gap-3.5">
                        <input
                          type="range"
                          min={0.3}
                          max={6}
                          step={0.1}
                          aria-label="Price count-up slider"
                          value={
                            !isNaN(parsedCountup)
                              ? Math.min(6, Math.max(0.3, parsedCountup))
                              : 1.8
                          }
                          onChange={(e) => setPriceCountupInput(e.target.value)}
                          className="flex-1 h-2 bg-surface-2 rounded-full accent-accent-bright cursor-pointer"
                        />
                        <div className="relative w-24 shrink-0">
                          <input
                            id="price-countup-number"
                            type="number"
                            min={0.3}
                            max={6}
                            step={0.1}
                            value={priceCountupInput}
                            onChange={(e) => setPriceCountupInput(e.target.value)}
                            className={`w-full min-h-[42px] bg-surface border rounded-xl pl-3 pr-7 py-2 font-mono text-sm font-medium text-text tabular-nums focus:outline-none ${
                              countupError
                                ? 'border-error focus:border-error'
                                : 'border-border focus:border-accent-bright'
                            }`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                            s
                          </span>
                        </div>
                      </div>

                      {countupError && (
                        <div className="flex items-center gap-1.5 text-xs text-error">
                          <WarningCircle size={15} weight="regular" className="shrink-0" />
                          <span>{countupError}</span>
                        </div>
                      )}
                    </div>

                    {/* Bid update animation */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-bg border border-border space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="bid-update-ms-input"
                          className="text-sm font-medium text-text"
                        >
                          Bid update animation
                        </label>
                        <span className="font-mono text-xs text-muted tabular-nums">
                          100–2000 ms
                        </span>
                      </div>

                      <div className="relative max-w-[200px]">
                        <input
                          id="bid-update-ms-input"
                          type="number"
                          min={100}
                          max={2000}
                          step={50}
                          value={bidUpdateMsInput}
                          onChange={(e) => setBidUpdateMsInput(e.target.value)}
                          className={`w-full min-h-[42px] bg-surface border rounded-xl pl-3.5 pr-10 py-2 font-mono text-sm font-medium text-text tabular-nums focus:outline-none ${
                            bidUpdateError
                              ? 'border-error focus:border-error'
                              : 'border-border focus:border-accent-bright'
                          }`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                          ms
                        </span>
                      </div>

                      {bidUpdateError && (
                        <div className="flex items-center gap-1.5 text-xs text-error">
                          <WarningCircle size={15} weight="regular" className="shrink-0" />
                          <span>{bidUpdateError}</span>
                        </div>
                      )}
                    </div>

                    {/* Catch-up window after refresh */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-bg border border-border space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="catchup-window-input"
                          className="text-sm font-medium text-text"
                        >
                          Catch-up window after refresh
                        </label>
                        <span className="font-mono text-xs text-muted tabular-nums">0–120 s</span>
                      </div>

                      <div className="relative max-w-[200px]">
                        <input
                          id="catchup-window-input"
                          type="number"
                          min={0}
                          max={120}
                          step={1}
                          value={catchupWindowInput}
                          onChange={(e) => setCatchupWindowInput(e.target.value)}
                          className={`w-full min-h-[42px] bg-surface border rounded-xl pl-3.5 pr-9 py-2 font-mono text-sm font-medium text-text tabular-nums focus:outline-none ${
                            catchupError
                              ? 'border-error focus:border-error'
                              : 'border-border focus:border-accent-bright'
                          }`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                          s
                        </span>
                      </div>

                      {catchupError && (
                        <div className="flex items-center gap-1.5 text-xs text-error">
                          <WarningCircle size={15} weight="regular" className="shrink-0" />
                          <span>{catchupError}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Group 2: Bidding & Squad Rules */}
                <div className="pt-6 border-t border-border grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Bid increments */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-bg border border-border space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="new-bid-increment-input"
                        className="text-sm font-medium text-text"
                      >
                        Bid increments
                      </label>
                      <span className="font-mono text-xs text-muted">Min 1 value</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {bidIncrements.map((inc) => (
                        <div
                          key={inc}
                          className="h-9 pl-3 pr-1.5 rounded-full bg-surface border border-border inline-flex items-center gap-1.5 font-mono text-xs font-medium text-points tabular-nums"
                        >
                          <span>+{inc.toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveIncrementChip(inc)}
                            disabled={bidIncrements.length <= 1}
                            title={
                              bidIncrements.length <= 1
                                ? 'At least one increment is required'
                                : `Remove +${inc}`
                            }
                            aria-label={`Remove increment ${inc}`}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-error hover:bg-error/10 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                          >
                            <X size={13} weight="regular" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="new-bid-increment-input"
                        type="number"
                        min={1}
                        step="any"
                        value={newIncrementInput}
                        onChange={(e) => {
                          setNewIncrementInput(e.target.value)
                          setIncrementError(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddIncrementChip()
                          }
                        }}
                        placeholder="Add increment (e.g. 50)"
                        className="flex-1 min-h-[42px] bg-surface border border-border rounded-xl px-3.5 py-2 font-mono text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        leftIcon={Plus}
                        onClick={handleAddIncrementChip}
                        disabled={!newIncrementInput.trim()}
                        className="min-h-[42px] rounded-full shrink-0"
                      >
                        Add
                      </Button>
                    </div>

                    {incrementError && (
                      <div className="flex items-center gap-1.5 text-xs text-error">
                        <WarningCircle size={15} weight="regular" className="shrink-0" />
                        <span>{incrementError}</span>
                      </div>
                    )}
                  </div>

                  {/* Maximum squad size */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-bg border border-border space-y-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <label
                        htmlFor="max-squad-size-input"
                        className="text-sm font-medium text-text"
                      >
                        Maximum squad size
                      </label>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={noSquadLimit}
                        onClick={() => setNoSquadLimit((v) => !v)}
                        className="inline-flex items-center gap-2.5 min-h-[36px] px-3 py-1 rounded-full bg-surface border border-border hover:border-text/30 transition-colors shrink-0 cursor-pointer"
                      >
                        <span
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            noSquadLimit ? 'bg-accent-bright' : 'bg-surface-2 border border-border'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                              noSquadLimit
                                ? 'translate-x-5 bg-white'
                                : 'translate-x-0.5 bg-muted'
                            }`}
                          />
                        </span>
                        <span className="text-xs font-medium text-text">No limit</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <input
                        id="max-squad-size-input"
                        type="number"
                        min={1}
                        step={1}
                        disabled={noSquadLimit}
                        value={noSquadLimit ? '' : maxSquadSizeInput}
                        placeholder={noSquadLimit ? 'No squad limit' : '12'}
                        onChange={(e) => setMaxSquadSizeInput(e.target.value)}
                        className={`w-full max-w-[200px] min-h-[42px] bg-surface border rounded-xl px-3.5 py-2 font-mono text-sm font-medium text-text placeholder-muted focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                          maxSquadError
                            ? 'border-error focus:border-error'
                            : 'border-border focus:border-accent-bright'
                        }`}
                      />
                      {!noSquadLimit && (
                        <span className="font-mono text-xs text-muted">Min 1</span>
                      )}
                    </div>

                    {maxSquadError && (
                      <div className="flex items-center gap-1.5 text-xs text-error">
                        <WarningCircle size={15} weight="regular" className="shrink-0" />
                        <span>{maxSquadError}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Secondary Actions Left, Single Primary Save Right */}
                <div className="pt-5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      leftIcon={Play}
                      onClick={() => {
                        setPreviewReplayKey((k) => k + 1)
                        setIsPreviewOpen(true)
                      }}
                      className="rounded-full"
                    >
                      Preview secured animation
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      leftIcon={ArrowCounterClockwise}
                      onClick={handleResetAuctionDefaults}
                      disabled={isSavingAuctionSettings}
                      className="rounded-full"
                    >
                      Reset to defaults
                    </Button>
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    leftIcon={FloppyDisk}
                    disabled={!isAuctionFormDirty || !isAuctionFormValid || isSavingAuctionSettings}
                    isLoading={isSavingAuctionSettings}
                    className="rounded-full px-5 self-end sm:self-auto"
                  >
                    Save settings
                  </Button>
                </div>
              </form>
            )}
          </section>

          {/* Section 3: Confetti (rendered once, in Display tab only) */}
          <section className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="pb-5 border-b border-border">
              <h2 className="font-syne font-bold text-xl text-text tracking-tight">Confetti</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="setup-confetti-fall-speed-slider"
                    className="text-sm font-medium text-text"
                  >
                    Fall speed
                  </label>
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {confettiFallSpeed} / 10
                  </span>
                </div>
                <input
                  id="setup-confetti-fall-speed-slider"
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={confettiFallSpeed}
                  aria-label="Fall speed"
                  onChange={(e) => {
                    const nextVal = normalizeConfettiFallSpeed(Number(e.target.value))
                    setConfettiFallSpeed(nextVal)
                    setConfettiSpeedSaved(false)
                    setConfettiSpeedError(null)
                  }}
                  className="w-full accent-accent-bright cursor-pointer"
                />
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Slow</span>
                  <span>Fast</span>
                </div>
              </div>

              {(confettiSpeedError || confettiTestError) && (
                <div className="space-y-1.5">
                  {confettiSpeedError && (
                    <p role="alert" className="text-xs text-error">
                      {confettiSpeedError}
                    </p>
                  )}
                  {confettiTestError && (
                    <p role="alert" className="text-xs text-error">
                      {confettiTestError}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="pt-5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  leftIcon={Play}
                  disabled={isConfettiTestCoolingDown}
                  onClick={() => void handleTestConfettiOnProjector()}
                  className="rounded-full"
                >
                  Test on projector
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  leftIcon={ArrowCounterClockwise}
                  disabled={
                    isSavingConfettiSpeed || confettiFallSpeed === DEFAULT_CONFETTI_FALL_SPEED
                  }
                  onClick={handleResetConfettiSpeed}
                  className="rounded-full"
                >
                  Reset to default
                </Button>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                {confettiSpeedSaved && !isConfettiSpeedDirty && (
                  <span className="text-xs text-accent-bright inline-flex items-center gap-1">
                    <Check size={14} weight="regular" />
                    <span>Saved</span>
                  </span>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  leftIcon={FloppyDisk}
                  disabled={!isConfettiSpeedDirty || isSavingConfettiSpeed}
                  isLoading={isSavingConfettiSpeed}
                  onClick={() => void handleSaveConfettiSpeed()}
                  className="rounded-full px-5"
                >
                  Save
                </Button>
              </div>
            </div>
          </section>

          {/* Section 4: Site Icon */}
          <section className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="pb-5 border-b border-border space-y-1">
              <h2 className="font-syne font-bold text-xl text-text tracking-tight">Site icon</h2>
              <p className="text-xs text-muted">
                Choose the primary icon shown in the footer and About page.
              </p>
            </div>

            <div
              role="radiogroup"
              aria-label="Site icon"
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
              {PRIMARY_ICON_OPTIONS.map((opt) => {
                const isSelected = primaryIcon === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isSavingPrimaryIcon}
                    onClick={() => {
                      setPrimaryIcon(opt.value)
                      setPrimaryIconSaved(false)
                      setPrimaryIconError(null)
                    }}
                    className={`relative flex flex-col items-center text-center gap-3.5 p-5 rounded-2xl border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-bright disabled:opacity-50 ${
                      isSelected
                        ? 'border-accent-bright bg-accent-bright/10 ring-1 ring-accent-bright/40'
                        : 'border-border bg-bg hover:border-text/30 hover:bg-surface-2/60'
                    }`}
                  >
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="absolute top-3 right-3 w-5 h-5 rounded-full bg-accent-bright text-on-accent flex items-center justify-center"
                      >
                        <Check size={12} weight="bold" />
                      </span>
                    )}
                    <FooterMark size={64} previewVariant={opt.value} />
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium text-text">{opt.label}</div>
                      <div className="text-xs text-muted">{opt.description}</div>
                    </div>
                  </button>
                )
              })}
            </div>

            {primaryIconError && (
              <p role="alert" className="text-xs text-error">
                {primaryIconError}
              </p>
            )}

            <div className="pt-5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                size="md"
                leftIcon={ArrowCounterClockwise}
                disabled={isSavingPrimaryIcon || primaryIcon === DEFAULT_PRIMARY_ICON}
                onClick={handleResetPrimaryIcon}
                className="rounded-full self-start sm:self-auto"
              >
                Reset to default
              </Button>

              <div className="flex items-center gap-3 self-end sm:self-auto">
                {primaryIconSaved && !isPrimaryIconDirty && (
                  <span className="text-xs text-accent-bright inline-flex items-center gap-1">
                    <Check size={14} weight="regular" />
                    <span>Saved</span>
                  </span>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  leftIcon={FloppyDisk}
                  disabled={!isPrimaryIconDirty || isSavingPrimaryIcon}
                  isLoading={isSavingPrimaryIcon}
                  onClick={() => void handleSavePrimaryIcon()}
                  className="rounded-full px-5"
                >
                  Save
                </Button>
              </div>
            </div>
          </section>
          <Suspense fallback={<SkeletonBlock className="h-40 w-full rounded-3xl" />}>
            <PhotoOptimizerCard />
          </Suspense>
        </div>
      )}

      {/* Tab 2: Registration (Athlete Self-Registration) */}
      {activeTab === 'registration' && (
        <div className="space-y-6">
          <Suspense fallback={<SkeletonBlock className="h-72 w-full rounded-3xl" />}>
            <RegistrationSetupCard activeSeason={effectiveSeason} sports={sportsList} />
          </Suspense>
        </div>
      )}

      {/* Tab 3: Content (Public Pages Editor, Credits) */}
      {activeTab === 'content' && (
        <div className="space-y-6">
          {/* Section 1: Public Pages Editor */}
          <section className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-border">
              <h2 className="font-syne font-bold text-xl text-text tracking-tight">
                Public Pages Editor
              </h2>

              <div
                role="radiogroup"
                aria-label="Select public page"
                className="inline-flex flex-nowrap items-center gap-1 p-1 rounded-full bg-surface-2 border border-border w-max self-start sm:self-auto"
              >
                {(
                  [
                    { value: 'help_page', label: 'Help Page' },
                    { value: 'about_page', label: 'About Page' }
                  ] as const
                ).map((opt) => {
                  const isSelected = selectedPageKey === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedPageKey(opt.value)}
                      className={`min-h-[32px] px-3.5 py-1 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-btn-bg text-btn-fg font-medium'
                          : 'text-muted hover:text-text font-normal'
                      }`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <form onSubmit={handleSavePage} className="space-y-5">
              <div className="max-w-xl">
                <label
                  htmlFor="setup-page-title"
                  className="block text-sm font-medium text-text mb-2"
                >
                  Page title
                </label>
                <input
                  id="setup-page-title"
                  type="text"
                  value={pageTitle}
                  onChange={(e) => setPageTitle(e.target.value)}
                  required
                  className="w-full min-h-[44px] bg-bg border border-border rounded-2xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent-bright"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label
                    htmlFor="setup-page-body"
                    className="text-sm font-medium text-text"
                  >
                    Page body
                  </label>
                  <span className="text-xs text-muted">Markdown</span>
                </div>
                {isPreviewingPage ? (
                  <div className="w-full bg-bg border border-border rounded-2xl p-5 min-h-[220px]">
                    <h3 className="font-syne font-bold text-2xl text-text mb-4">
                      {pageTitle || 'Untitled Page'}
                    </h3>
                    {pageBody.trim() ? (
                      <Suspense fallback={<SkeletonBlock className="h-32 w-full rounded-xl" />}>
                        <MarkdownContent content={pageBody} />
                      </Suspense>
                    ) : (
                      <p className="text-xs text-muted italic">No content to preview.</p>
                    )}
                  </div>
                ) : (
                  <textarea
                    id="setup-page-body"
                    value={pageBody}
                    onChange={(e) => setPageBody(e.target.value)}
                    rows={8}
                    placeholder="Enter markdown or plain text..."
                    className="w-full bg-bg border border-border rounded-2xl p-4 text-sm text-text focus:outline-none focus:border-accent-bright leading-relaxed resize-y font-sans font-light"
                  />
                )}
              </div>

              <div className="pt-5 border-t border-border flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => setIsPreviewingPage(!isPreviewingPage)}
                  className="rounded-full"
                >
                  {isPreviewingPage ? 'Edit markdown' : 'Preview'}
                </Button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  leftIcon={FloppyDisk}
                  disabled={isSavingPage}
                  isLoading={isSavingPage}
                  className="rounded-full px-5"
                >
                  Save page
                </Button>
              </div>
            </form>
          </section>

          {/* Section 2: Credits */}
          <Suspense fallback={<SkeletonBlock className="h-64 w-full rounded-3xl" />}>
            <CreditsSetupCard />
          </Suspense>
        </div>
      )}

      {/* Tab: Reels (Reel Competition settings and submissions) */}
      {activeTab === 'reels' && (
        <div className="space-y-6">
          <Suspense fallback={<SkeletonBlock className="h-72 w-full rounded-3xl" />}>
            <ReelsSetupCard />
            <ReelSubmissionsCard />
          </Suspense>
        </div>
      )}

      {/* Tab 3: Documents (Handbook, Auction Rules) */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          <Suspense fallback={<SkeletonBlock className="h-64 w-full rounded-3xl" />}>
            <HandbookSetupCard />
            <RulesSetupCard />
          </Suspense>
        </div>
      )}

      {/* Tab 4: Sports */}
      {activeTab === 'sports' && (
        <section className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-border">
            <h2 className="font-syne font-bold text-xl text-text tracking-tight">
              Sports and Roles
            </h2>

            {sportsList.length > 0 && (
              <div className="w-full sm:w-auto overflow-x-auto pb-1 -mb-1">
                <div
                  role="radiogroup"
                  aria-label="Select sport discipline"
                  className="inline-flex flex-nowrap items-center gap-1 p-1 rounded-full bg-surface-2 border border-border w-max"
                >
                  {sportsList.map((sport) => {
                    const isSelected = (selectedSport?.id || 'cricket') === sport.id
                    return (
                      <button
                        key={sport.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => void handleSelectSport(sport.id)}
                        className={`min-h-[32px] px-3.5 py-1 rounded-full text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-btn-bg text-btn-fg font-medium'
                            : 'text-muted hover:text-text font-normal'
                        }`}
                      >
                        {sport.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={handleAddRole}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-xl"
          >
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder={`New role for ${selectedSport?.name || 'sport'}`}
              disabled={isSavingRoleAction || !selectedSport}
              className="flex-1 min-h-[42px] bg-bg border border-border rounded-2xl px-4 py-2 text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright disabled:opacity-50"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              leftIcon={Plus}
              disabled={isSavingRoleAction || !newRoleName.trim() || !selectedSport}
              isLoading={isSavingRoleAction && !renamingRole}
              className="rounded-full px-5 shrink-0"
            >
              Add role
            </Button>
          </form>

          {isLoadingSports ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBlock
                  key={i}
                  className="h-14 bg-bg border border-border rounded-2xl"
                />
              ))}
            </div>
          ) : !selectedSport || selectedSport.roles.length === 0 ? (
            <EmptyState
              title="No roles configured"
              description="Add a playing role above for this sport."
            />
          ) : (
            <div className="bg-bg border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {selectedSport.roles.map((role, index) => {
                const usedCount = roleUsageCounts[role] || 0
                const isRenamingThis = renamingRole === role

                return (
                  <div
                    key={role}
                    className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isRenamingThis ? (
                        <div className="flex items-center gap-2 flex-1 max-w-md">
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleConfirmRename(role)
                              } else if (e.key === 'Escape') {
                                setRenamingRole(null)
                              }
                            }}
                            autoFocus
                            disabled={isSavingRoleAction}
                            className="flex-1 bg-surface border border-accent-bright rounded-xl px-3.5 py-1.5 text-sm text-text focus:outline-none"
                          />
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            leftIcon={Check}
                            disabled={isSavingRoleAction || !renameValue.trim()}
                            isLoading={isSavingRoleAction}
                            onClick={() => handleConfirmRename(role)}
                            className="rounded-full"
                          >
                            Save
                          </Button>
                          <button
                            type="button"
                            disabled={isSavingRoleAction}
                            onClick={() => setRenamingRole(null)}
                            title="Cancel rename"
                            aria-label="Cancel rename"
                            className="relative hit-44 w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
                          >
                            <X size={14} weight="regular" />
                          </button>
                        </div>
                      ) : (
                        <div className="min-w-0 flex items-center gap-2.5 flex-wrap">
                          <span className="text-sm font-medium text-text">{role}</span>
                          <span aria-hidden="true" className="text-muted text-xs">
                            ·
                          </span>
                          <span className="text-xs text-muted tabular-nums">
                            {usedCount} {usedCount === 1 ? 'player' : 'players'}
                          </span>
                        </div>
                      )}
                    </div>

                    {!isRenamingThis && (
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          disabled={index === 0 || isSavingRoleAction}
                          onClick={() => handleMoveRole(index, 'up')}
                          title="Move role up"
                          aria-label={`Move ${role} up`}
                          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <ArrowUp size={15} weight="regular" />
                        </button>
                        <button
                          type="button"
                          disabled={
                            index === selectedSport.roles.length - 1 || isSavingRoleAction
                          }
                          onClick={() => handleMoveRole(index, 'down')}
                          title="Move role down"
                          aria-label={`Move ${role} down`}
                          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <ArrowDown size={15} weight="regular" />
                        </button>

                        <button
                          type="button"
                          disabled={isSavingRoleAction}
                          onClick={() => handleStartRename(role)}
                          title="Rename role"
                          aria-label={`Rename ${role}`}
                          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <PencilSimple size={15} weight="regular" />
                        </button>

                        <button
                          type="button"
                          disabled={isSavingRoleAction}
                          onClick={() => handleDeleteRole(role)}
                          title={
                            usedCount > 0
                              ? `${usedCount} players use this role. Rename it or change those players first.`
                              : 'Delete role'
                          }
                          aria-label={`Delete ${role}`}
                          className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted hover:text-error hover:bg-error/10 disabled:opacity-30 transition-colors cursor-pointer"
                        >
                          <Trash size={15} weight="regular" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Full-Screen Preview Overlay for Secured Animation */}
      {isPreviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preview secured animation"
          className="fixed inset-0 z-50 bg-bg text-text overflow-y-auto flex flex-col justify-between p-6 sm:p-10 select-none"
        >
          {/* Preview Controls Bar */}
          <div className="relative z-30 flex flex-wrap items-center justify-between gap-4 bg-surface/90 backdrop-blur-md border border-border rounded-3xl px-5 py-3.5 shadow-lg max-w-6xl w-full mx-auto">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-syne font-bold text-sm text-text">
                Secured Sequence Preview
              </span>
              <span className="text-xs font-mono text-muted tabular-nums">
                {previewDurationSec}s · {previewCountupSec}s count-up
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="md"
                leftIcon={ArrowCounterClockwise}
                onClick={() => setPreviewReplayKey((k) => k + 1)}
                className="min-h-[42px] rounded-full"
              >
                Replay
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                leftIcon={X}
                onClick={() => setIsPreviewOpen(false)}
                className="min-h-[42px] rounded-full"
              >
                Close
              </Button>
            </div>
          </div>

          {/* Shared SecuredSequence Component */}
          <div className="flex-1 flex items-center justify-center w-full max-w-7xl mx-auto my-auto py-6">
            <Suspense fallback={null}>
              <SecuredSequence
                key={previewReplayKey}
                playerName="Aarav Kulkarni"
                playerCode="0104"
                sport={previewSampleTeam?.sport || 'Cricket'}
                playingRole="All-Rounder"
                academicYearLabel="Final Year"
                photoUrl={SAMPLE_PLAYER_PHOTO_DATA_URI}
                teamName={previewSampleTeam?.name || 'Emerald Falcons'}
                teamShortCode={previewSampleTeam?.short_code || 'EF'}
                teamColor={previewSampleTeam?.color || '#10B981'}
                teamLogoUrl={previewSampleTeam?.logo_url}
                price={450}
                securedDurationSeconds={previewDurationSec}
                priceCountupSeconds={previewCountupSec}
              />
            </Suspense>
          </div>
        </div>
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
              <label
                htmlFor="setup-ticker-item-text"
                className="text-sm font-medium text-text"
              >
                Ticker text
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
              id="setup-ticker-item-text"
              type="text"
              maxLength={80}
              value={itemText}
              onChange={(e) => setItemText(e.target.value)}
              placeholder="e.g. SQUAD REGISTRATIONS CLOSING SOON"
              required
              autoFocus
              disabled={isSavingCarousel}
              className="w-full min-h-[44px] bg-bg border border-border rounded-2xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent-bright disabled:opacity-50"
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
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSavingCarousel}
              isLoading={isSavingCarousel}
              className="rounded-full px-4"
            >
              Save item
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
