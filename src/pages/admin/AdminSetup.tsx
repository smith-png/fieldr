import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import {
  DEFAULT_AUCTION_SETTINGS,
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
  renameSportRole,
  reorderSportRoles,
  saveAuctionSettings,
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
import { SecuredSequence } from '../../components/projector/SecuredSequence'
import { CreditsSetupCard } from '../../components/admin/CreditsSetupCard'
import type {
  AuctionSettings,
  CarouselItem,
  PageContentSetting,
  Season,
  SiteSettings,
  Sport,
  Team
} from '../../types'

type SetupTab = 'carousel' | 'pages' | 'sports' | 'auction' | 'credits'

interface AdminSetupProps {
  activeSeason?: Season | null
  teams?: Team[]
  onRefresh?: () => Promise<void>
}

// Clean SVG data URI portrait for the sample preview player
const SAMPLE_PLAYER_PHOTO_DATA_URI =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 480' fill='none'><rect width='400' height='480' fill='%23141B24'/><circle cx='200' cy='168' r='72' fill='%23253244'/><path d='M72 430C72 342 128 286 200 286C272 286 328 342 328 430' fill='%23253244'/></svg>"

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
  const [activeTab, setActiveTab] = useState<SetupTab>('carousel')

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

  // Pages State
  const [siteSettings, setSiteSettings] = useState<SiteSettings>({})
  const [selectedPageKey, setSelectedPageKey] = useState<'help_page' | 'about_page'>('help_page')
  const [pageTitle, setPageTitle] = useState('')
  const [pageBody, setPageBody] = useState('')
  const [isSavingPage, setIsSavingPage] = useState(false)

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
    loadCarousel()
    loadSettings()
    loadSportsAndUsage('cricket')
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

  return (
    <div className="space-y-8">
      <PageHeader
        label="Site Configuration"
        title="System Setup"
        subtitle="Manage the homepage stadium ticker ribbon, public documentation pages, sports roles, and auction settings."
        actions={
          <SegmentedControl
            ariaLabel="Setup sections"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'carousel', label: 'Carousel' },
              { value: 'pages', label: 'Pages' },
              { value: 'sports', label: 'Sports' },
              { value: 'auction', label: 'Auction' },
              { value: 'credits', label: 'Credits' }
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

      {/* Tab 3: Sports and Roles */}
      {activeTab === 'sports' && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
              <div>
                <h2 className="font-syne font-bold text-xl text-text">Sports and Roles</h2>
                <p className="text-xs text-muted mt-1">
                  Configure playing roles for each sport discipline. Changes apply across registration forms, filters, and public rosters.
                </p>
              </div>

              {sportsList.length > 0 && (
                <SegmentedControl
                  ariaLabel="Select sport discipline"
                  size="sm"
                  value={selectedSport?.id || 'cricket'}
                  onChange={handleSelectSport}
                  options={sportsList.map((s) => ({
                    value: s.id,
                    label: s.name
                  }))}
                />
              )}
            </div>

            <form onSubmit={handleAddRole} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder={`Add a new role for ${selectedSport?.name || 'sport'}...`}
                disabled={isSavingRoleAction || !selectedSport}
                className="flex-1 bg-bg border border-border rounded-xl px-4 py-2.5 text-xs text-text placeholder-muted focus:outline-none focus:border-accent-bright disabled:opacity-50"
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                leftIcon={Plus}
                disabled={isSavingRoleAction || !newRoleName.trim() || !selectedSport}
                isLoading={isSavingRoleAction && !renamingRole}
              >
                Add Role
              </Button>
            </form>

            {isLoadingSports ? (
              <div className="space-y-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-14 bg-surface-2/60 border border-border rounded-xl animate-pulse"
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
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/50 transition-colors"
                    >
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <span className="font-mono text-xs text-muted w-6 shrink-0 tabular-nums">
                          {String(index + 1).padStart(2, '0')}
                        </span>

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
                              className="flex-1 bg-surface border border-accent-bright rounded-xl px-3 py-1.5 text-xs text-text focus:outline-none"
                            />
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              leftIcon={Check}
                              disabled={isSavingRoleAction || !renameValue.trim()}
                              isLoading={isSavingRoleAction}
                              onClick={() => handleConfirmRename(role)}
                            >
                              Save
                            </Button>
                            <button
                              type="button"
                              disabled={isSavingRoleAction}
                              onClick={() => setRenamingRole(null)}
                              title="Cancel rename"
                              className="p-1.5 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 transition-colors"
                            >
                              <X size={14} weight="bold" />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 flex items-center gap-3 flex-wrap">
                            <span className="text-sm font-medium text-text">{role}</span>
                            <span className="text-[11px] font-mono text-muted tabular-nums">
                              {usedCount} {usedCount === 1 ? 'player' : 'players'}
                            </span>
                          </div>
                        )}
                      </div>

                      {!isRenamingThis && (
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            type="button"
                            disabled={index === 0 || isSavingRoleAction}
                            onClick={() => handleMoveRole(index, 'up')}
                            title="Move role up"
                            className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                          >
                            <ArrowUp size={14} weight="bold" />
                          </button>
                          <button
                            type="button"
                            disabled={
                              index === selectedSport.roles.length - 1 || isSavingRoleAction
                            }
                            onClick={() => handleMoveRole(index, 'down')}
                            title="Move role down"
                            className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                          >
                            <ArrowDown size={14} weight="bold" />
                          </button>

                          <button
                            type="button"
                            disabled={isSavingRoleAction}
                            onClick={() => handleStartRename(role)}
                            title="Rename role"
                            className="p-2 rounded-lg border border-border text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 transition-colors"
                          >
                            <PencilSimple size={14} />
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
                            className="p-2 rounded-lg border border-border text-muted hover:text-error hover:bg-error/10 disabled:opacity-30 transition-colors"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Auction Display and Rules */}
      {activeTab === 'auction' && (
        <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 space-y-8 shadow-sm">
          {/* Header & Active Season Note */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
            <div>
              <h2 className="font-syne font-bold text-xl text-text">
                Auction display and rules
              </h2>
              <p className="text-xs text-muted mt-1">
                Configure stage projector animations, timing rules, bidding increments, and squad size limits.
              </p>
            </div>

            <div className="px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs font-mono text-text shrink-0">
              Applies to the selected season:{' '}
              <strong className="text-accent-bright font-semibold">
                {effectiveSeason?.name || 'None selected'}
              </strong>
            </div>
          </div>

          {!effectiveSeason ? (
            <EmptyState
              title="No active season selected"
              description="Select or create a tournament season in the Seasons tab to configure auction settings."
            />
          ) : isLoadingAuctionSettings ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-surface-2/60 border border-border rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSaveAuctionSettings} className="space-y-8">
              {/* 1. Secured Animation Switch */}
              <div className="p-5 rounded-2xl bg-bg border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <label
                    htmlFor="toggle-secured-enabled"
                    className="font-syne font-bold text-base text-text block cursor-pointer"
                  >
                    Secured animation
                  </label>
                  <p className="text-xs text-muted mt-1">
                    Play the full-screen team colour sweep and price count-up sequence when a player is secured. When off, the projector shows the static sold card immediately.
                  </p>
                </div>

                <button
                  id="toggle-secured-enabled"
                  type="button"
                  role="switch"
                  aria-checked={securedEnabled}
                  onClick={() => setSecuredEnabled((v) => !v)}
                  className={`min-h-[48px] px-5 py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider border transition-colors flex items-center gap-3 shrink-0 ${
                    securedEnabled
                      ? 'bg-accent-bright/15 border-accent-bright text-accent-bright'
                      : 'bg-surface-2 border-border text-muted hover:text-text'
                  }`}
                >
                  <span
                    className={`w-3 h-3 rounded-full transition-colors ${
                      securedEnabled ? 'bg-accent-bright' : 'bg-muted'
                    }`}
                  />
                  <span>{securedEnabled ? 'On' : 'Off'}</span>
                </button>
              </div>

              {/* 2 & 3. Secured Sequence Length & Price Count-Up */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 2. Secured sequence length */}
                <div className="p-5 rounded-2xl bg-bg border border-border space-y-4">
                  <div>
                    <label
                      htmlFor="secured-duration-number"
                      className="font-syne font-bold text-base text-text block"
                    >
                      Secured sequence length
                    </label>
                    <p className="text-xs text-muted mt-1">
                      Total duration of the secured animation in seconds before settling into the static sold card (2 to 15s).
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
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
                      className="flex-1 h-2 bg-surface-2 rounded-lg accent-accent-bright cursor-pointer"
                    />
                    <div className="relative w-28 shrink-0">
                      <input
                        id="secured-duration-number"
                        type="number"
                        min={2}
                        max={15}
                        step={0.1}
                        value={securedDurationInput}
                        onChange={(e) => setSecuredDurationInput(e.target.value)}
                        className="w-full min-h-[48px] bg-surface border border-border rounded-xl pl-3.5 pr-8 py-2 font-mono text-sm font-bold text-text tabular-nums focus:outline-none focus:border-accent-bright"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                        s
                      </span>
                    </div>
                  </div>

                  {durationError && (
                    <div className="flex items-center gap-2 text-xs text-error font-mono">
                      <WarningCircle size={15} weight="bold" className="shrink-0" />
                      <span>{durationError}</span>
                    </div>
                  )}
                </div>

                {/* 3. Price count-up */}
                <div className="p-5 rounded-2xl bg-bg border border-border space-y-4">
                  <div>
                    <label
                      htmlFor="price-countup-number"
                      className="font-syne font-bold text-base text-text block"
                    >
                      Price count-up
                    </label>
                    <p className="text-xs text-muted mt-1">
                      Duration for the sale price to count up from 0 to the final price (0.3 to 6s, cannot exceed sequence length).
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
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
                      className="flex-1 h-2 bg-surface-2 rounded-lg accent-accent-bright cursor-pointer"
                    />
                    <div className="relative w-28 shrink-0">
                      <input
                        id="price-countup-number"
                        type="number"
                        min={0.3}
                        max={6}
                        step={0.1}
                        value={priceCountupInput}
                        onChange={(e) => setPriceCountupInput(e.target.value)}
                        className={`w-full min-h-[48px] bg-surface border rounded-xl pl-3.5 pr-8 py-2 font-mono text-sm font-bold text-text tabular-nums focus:outline-none ${
                          countupError
                            ? 'border-error focus:border-error'
                            : 'border-border focus:border-accent-bright'
                        }`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                        s
                      </span>
                    </div>
                  </div>

                  {countupError && (
                    <div className="flex items-center gap-2 text-xs text-error font-mono">
                      <WarningCircle size={15} weight="bold" className="shrink-0" />
                      <span>{countupError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 4 & 5. Bid Update Animation & Catch-Up Window After Refresh */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 4. Bid update animation */}
                <div className="p-5 rounded-2xl bg-bg border border-border space-y-3">
                  <div>
                    <label
                      htmlFor="bid-update-ms-input"
                      className="font-syne font-bold text-base text-text block"
                    >
                      Bid update animation
                    </label>
                    <p className="text-xs text-muted mt-1">
                      Duration in milliseconds for the live bid number flip and leading-team colour flash (100 to 2000 ms).
                    </p>
                  </div>

                  <div className="relative max-w-xs">
                    <input
                      id="bid-update-ms-input"
                      type="number"
                      min={100}
                      max={2000}
                      step={50}
                      value={bidUpdateMsInput}
                      onChange={(e) => setBidUpdateMsInput(e.target.value)}
                      className="w-full min-h-[48px] bg-surface border border-border rounded-xl pl-4 pr-12 py-2.5 font-mono text-sm font-bold text-text tabular-nums focus:outline-none focus:border-accent-bright"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                      ms
                    </span>
                  </div>

                  {bidUpdateError && (
                    <div className="flex items-center gap-2 text-xs text-error font-mono">
                      <WarningCircle size={15} weight="bold" className="shrink-0" />
                      <span>{bidUpdateError}</span>
                    </div>
                  )}
                </div>

                {/* 5. Catch-up window after refresh */}
                <div className="p-5 rounded-2xl bg-bg border border-border space-y-3">
                  <div>
                    <label
                      htmlFor="catchup-window-input"
                      className="font-syne font-bold text-base text-text block"
                    >
                      Catch-up window after refresh
                    </label>
                    <p className="text-xs text-muted mt-1">
                      A projector that reloads within this time after a sale still plays the animation; later it shows the static sold card (0 to 120s).
                    </p>
                  </div>

                  <div className="relative max-w-xs">
                    <input
                      id="catchup-window-input"
                      type="number"
                      min={0}
                      max={120}
                      step={1}
                      value={catchupWindowInput}
                      onChange={(e) => setCatchupWindowInput(e.target.value)}
                      className="w-full min-h-[48px] bg-surface border border-border rounded-xl pl-4 pr-12 py-2.5 font-mono text-sm font-bold text-text tabular-nums focus:outline-none focus:border-accent-bright"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs text-muted">
                      sec
                    </span>
                  </div>

                  {catchupError && (
                    <div className="flex items-center gap-2 text-xs text-error font-mono">
                      <WarningCircle size={15} weight="bold" className="shrink-0" />
                      <span>{catchupError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 6 & 7. Bid Increments & Maximum Squad Size */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 6. Bid increments */}
                <div className="p-5 rounded-2xl bg-bg border border-border space-y-4">
                  <div>
                    <label
                      htmlFor="new-bid-increment-input"
                      className="font-syne font-bold text-base text-text block"
                    >
                      Bid increments
                    </label>
                    <p className="text-xs text-muted mt-1">
                      Quick increment buttons shown in the Auction Room. Positive numbers only, no duplicates, stored sorted ascending.
                    </p>
                  </div>

                  {/* Chips List */}
                  <div className="flex flex-wrap items-center gap-2">
                    {bidIncrements.map((inc) => (
                      <div
                        key={inc}
                        className="min-h-[42px] pl-3.5 pr-2 py-1.5 rounded-xl bg-surface border border-border flex items-center gap-2 font-mono text-sm font-bold text-points tabular-nums"
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
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-error hover:bg-error/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                          <X size={14} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Increment Input */}
                  <div className="flex items-center gap-2.5">
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
                      placeholder="Add increment (e.g. 50)..."
                      className="flex-1 min-h-[48px] bg-surface border border-border rounded-xl px-4 py-2.5 font-mono text-sm text-text placeholder-muted focus:outline-none focus:border-accent-bright"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      leftIcon={Plus}
                      onClick={handleAddIncrementChip}
                      disabled={!newIncrementInput.trim()}
                      className="min-h-[48px] shrink-0"
                    >
                      Add
                    </Button>
                  </div>

                  {incrementError && (
                    <div className="flex items-center gap-2 text-xs text-error font-mono">
                      <WarningCircle size={15} weight="bold" className="shrink-0" />
                      <span>{incrementError}</span>
                    </div>
                  )}
                </div>

                {/* 7. Maximum squad size */}
                <div className="p-5 rounded-2xl bg-bg border border-border space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <label
                        htmlFor="max-squad-size-input"
                        className="font-syne font-bold text-base text-text block"
                      >
                        Maximum squad size
                      </label>
                      <p className="text-xs text-muted mt-1">
                        Maximum number of players a franchise team can acquire in the Auction Room before its tile is locked.
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={noSquadLimit}
                      onClick={() => setNoSquadLimit((v) => !v)}
                      className={`min-h-[48px] px-4 py-2 rounded-xl font-mono text-xs font-bold uppercase tracking-wider border transition-colors flex items-center gap-2.5 shrink-0 ${
                        noSquadLimit
                          ? 'bg-accent-bright/15 border-accent-bright text-accent-bright'
                          : 'bg-surface border-border text-muted hover:text-text'
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          noSquadLimit ? 'bg-accent-bright' : 'bg-muted'
                        }`}
                      />
                      <span>No limit</span>
                    </button>
                  </div>

                  <div className="relative max-w-xs">
                    <input
                      id="max-squad-size-input"
                      type="number"
                      min={1}
                      step={1}
                      disabled={noSquadLimit}
                      value={noSquadLimit ? '' : maxSquadSizeInput}
                      placeholder={noSquadLimit ? 'No squad limit' : '12'}
                      onChange={(e) => setMaxSquadSizeInput(e.target.value)}
                      className="w-full min-h-[48px] bg-surface border border-border rounded-xl px-4 py-2.5 font-mono text-sm font-bold text-text placeholder-muted focus:outline-none focus:border-accent-bright disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {maxSquadError && (
                    <div className="flex items-center gap-2 text-xs text-error font-mono">
                      <WarningCircle size={15} weight="bold" className="shrink-0" />
                      <span>{maxSquadError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    leftIcon={Play}
                    onClick={() => {
                      setPreviewReplayKey((k) => k + 1)
                      setIsPreviewOpen(true)
                    }}
                    className="min-h-[48px]"
                  >
                    Preview secured animation
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    leftIcon={ArrowCounterClockwise}
                    onClick={handleResetAuctionDefaults}
                    disabled={isSavingAuctionSettings}
                    className="min-h-[48px]"
                  >
                    Reset to defaults
                  </Button>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  leftIcon={FloppyDisk}
                  disabled={!isAuctionFormDirty || !isAuctionFormValid || isSavingAuctionSettings}
                  isLoading={isSavingAuctionSettings}
                  className="min-h-[48px]"
                >
                  Save settings
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tab 5: Credits */}
      {activeTab === 'credits' && <CreditsSetupCard />}

      {/* Full-Screen Preview Overlay for Secured Animation */}
      {isPreviewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Preview secured animation"
          className="fixed inset-0 z-50 bg-bg text-text overflow-y-auto flex flex-col justify-between p-6 sm:p-10 select-none"
        >
          {/* Preview Controls Bar */}
          <div className="relative z-30 flex flex-wrap items-center justify-between gap-4 bg-surface/90 backdrop-blur-md border border-border rounded-2xl px-5 py-3.5 shadow-lg max-w-6xl w-full mx-auto">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-bright animate-pulse" />
              <span className="font-mono text-xs uppercase tracking-widest font-bold text-text">
                Secured Sequence Preview
              </span>
              <span className="text-xs font-mono text-muted hidden sm:inline">
                ({previewDurationSec}s sequence · {previewCountupSec}s price count-up)
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                type="button"
                variant="secondary"
                size="md"
                leftIcon={ArrowCounterClockwise}
                onClick={() => setPreviewReplayKey((k) => k + 1)}
                className="min-h-[44px]"
              >
                Replay
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                leftIcon={X}
                onClick={() => setIsPreviewOpen(false)}
                className="min-h-[44px]"
              >
                Close
              </Button>
            </div>
          </div>

          {/* Shared SecuredSequence Component */}
          <div className="flex-1 flex items-center justify-center w-full max-w-7xl mx-auto my-auto py-6">
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
