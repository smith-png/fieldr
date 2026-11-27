import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, Plus, Star, Trash, X } from '@phosphor-icons/react'
import { getActiveSeason, getPlayers } from '../../lib/data'
import { getPremiumPlayerIds, setPlayerPremium } from '../../lib/data/premiumCards'
import { getErrorMessage } from '../../lib/errors'
import { useToast } from '../../lib/ToastContext'
import type { Player, Season } from '../../types'
import { Button, Dialog, EmptyState, SkeletonBlock } from '../ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_DIALOG_CLASS,
  ADMIN_INPUT,
  ADMIN_TABLE_SHELL
} from './adminStyles'

const MAX_DROPDOWN_RESULTS = 8

interface AdminPremiumCardsCardProps {
  activeSeason?: Season | null
}

export const AdminPremiumCardsCard: React.FC<AdminPremiumCardsCardProps> = ({
  activeSeason
}) => {
  const { showToast } = useToast()

  const pickerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const [resolvedSeason, setResolvedSeason] = useState<Season | null>(activeSeason ?? null)
  const [players, setPlayers] = useState<Player[]>([])
  const [premiumIds, setPremiumIds] = useState<Set<string>>(() => new Set())
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isClearing, setIsClearing] = useState(false)
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  // Sync season prop or fall back to getActiveSeason() if prop is omitted
  useEffect(() => {
    if (activeSeason !== undefined) {
      setResolvedSeason(activeSeason)
      return
    }

    let cancelled = false
    getActiveSeason()
      .then((season) => {
        if (!cancelled) setResolvedSeason(season)
      })
      .catch(() => {
        if (!cancelled) setResolvedSeason(null)
      })
    return () => {
      cancelled = true
    }
  }, [activeSeason])

  const seasonId = resolvedSeason?.id ?? null

  const loadData = useCallback(async () => {
    if (!seasonId) {
      setPlayers([])
      setPremiumIds(new Set())
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const [seasonPlayers, storedPremiumIds] = await Promise.all([
        getPlayers(seasonId),
        getPremiumPlayerIds(seasonId)
      ])
      const sortedPlayers = seasonPlayers
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      setPlayers(sortedPlayers)
      setPremiumIds(new Set(storedPremiumIds))
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load players'), 'error')
      setPlayers([])
      setPremiumIds(new Set())
    } finally {
      setIsLoading(false)
    }
  }, [seasonId, showToast])

  useEffect(() => {
    setSearchQuery('')
    setIsDropdownOpen(false)
    setHighlightedIndex(0)
    void loadData()
  }, [loadData])

  // Close dropdown when tapping/clicking outside the picker
  useEffect(() => {
    if (!isDropdownOpen) return
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!pickerRef.current) return
      if (!pickerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown)
    }
  }, [isDropdownOpen])

  const premiumPlayers = useMemo(
    () => players.filter((player) => premiumIds.has(player.id)),
    [players, premiumIds]
  )

  const trimmedQuery = searchQuery.trim().toLowerCase()

  const searchResults = useMemo(() => {
    if (!trimmedQuery) return []
    const matches: Player[] = []
    for (const player of players) {
      if (premiumIds.has(player.id)) continue
      const matchesQuery =
        player.name.toLowerCase().includes(trimmedQuery) ||
        player.sport.toLowerCase().includes(trimmedQuery) ||
        player.playing_role.toLowerCase().includes(trimmedQuery)
      if (matchesQuery) {
        matches.push(player)
        if (matches.length >= MAX_DROPDOWN_RESULTS) break
      }
    }
    return matches
  }, [players, premiumIds, trimmedQuery])

  // Keep highlighted index valid whenever result list changes
  useEffect(() => {
    setHighlightedIndex(0)
    optionRefs.current = optionRefs.current.slice(0, searchResults.length)
  }, [trimmedQuery, searchResults.length])

  // Scroll highlighted option into view during keyboard navigation
  useEffect(() => {
    if (!isDropdownOpen) return
    const el = optionRefs.current[highlightedIndex]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex, isDropdownOpen])

  const activePremiumCount = premiumPlayers.length
  const showDropdown = isDropdownOpen && trimmedQuery.length > 0

  const handleSetPremium = useCallback(
    async (player: Player, nextIsPremium: boolean) => {
      if (!seasonId || isClearing || pendingIds.has(player.id)) return

      const wasPremium = premiumIds.has(player.id)
      if (wasPremium === nextIsPremium) return

      setPendingIds((prev) => {
        const next = new Set(prev)
        next.add(player.id)
        return next
      })
      setPremiumIds((prev) => {
        const next = new Set(prev)
        if (nextIsPremium) {
          next.add(player.id)
        } else {
          next.delete(player.id)
        }
        return next
      })

      try {
        await setPlayerPremium(seasonId, player.id, nextIsPremium)
      } catch (err) {
        setPremiumIds((prev) => {
          const rollback = new Set(prev)
          if (wasPremium) {
            rollback.add(player.id)
          } else {
            rollback.delete(player.id)
          }
          return rollback
        })
        showToast(
          getErrorMessage(err, `Failed to update premium status for ${player.name}`),
          'error'
        )
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev)
          next.delete(player.id)
          return next
        })
      }
    },
    [seasonId, isClearing, pendingIds, premiumIds, showToast]
  )

  const handleAddFromPicker = useCallback(
    (player: Player) => {
      void handleSetPremium(player, true)
      setSearchQuery('')
      setIsDropdownOpen(false)
      setHighlightedIndex(0)
      inputRef.current?.focus()
    },
    [handleSetPremium]
  )

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (isDropdownOpen) {
        event.preventDefault()
        setIsDropdownOpen(false)
      }
      return
    }

    if (!trimmedQuery) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isDropdownOpen) {
        setIsDropdownOpen(true)
        setHighlightedIndex(0)
      } else if (searchResults.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % searchResults.length)
      }
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isDropdownOpen) {
        setIsDropdownOpen(true)
        setHighlightedIndex(Math.max(0, searchResults.length - 1))
      } else if (searchResults.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length)
      }
      return
    }

    if (event.key === 'Enter') {
      if (showDropdown && searchResults.length > 0) {
        event.preventDefault()
        const selected = searchResults[highlightedIndex] ?? searchResults[0]
        if (selected) {
          handleAddFromPicker(selected)
        }
      }
    }
  }

  const handleConfirmClearAll = async () => {
    if (!seasonId || isClearing) return

    const idsToClear = Array.from(premiumIds)
    setIsClearDialogOpen(false)
    if (idsToClear.length === 0) return

    setIsClearing(true)
    setPremiumIds(new Set())

    try {
      const results = await Promise.allSettled(
        idsToClear.map((playerId) => setPlayerPremium(seasonId, playerId, false))
      )

      const failedIds: string[] = []
      let firstError: unknown = null
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedIds.push(idsToClear[index])
          if (!firstError) firstError = result.reason
        }
      })

      if (failedIds.length > 0) {
        setPremiumIds((prev) => {
          const restored = new Set(prev)
          for (const id of failedIds) restored.add(id)
          return restored
        })
        showToast(
          getErrorMessage(firstError, 'Failed to clear all premium cards'),
          'error'
        )
      } else {
        showToast('Cleared all premium cards', 'success')
      }
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <section className={ADMIN_CARD}>
      <div className={ADMIN_CARD_HEADER}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className={ADMIN_CARD_TITLE}>Premium cards</h2>
            <span className={ADMIN_COUNT_PILL}>{activePremiumCount} premium</span>
          </div>
          <p className="text-sm text-muted">
            {resolvedSeason
              ? `Choose which ${resolvedSeason.name} athletes appear as premium foil cards.`
              : 'Select an active season to manage premium cards.'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={Trash}
          disabled={!seasonId || activePremiumCount === 0 || isLoading || isClearing}
          isLoading={isClearing}
          onClick={() => setIsClearDialogOpen(true)}
          className="rounded-full shrink-0"
        >
          Clear all
        </Button>
      </div>

      {!seasonId ? (
        <EmptyState
          icon={Star}
          title="No active season"
          description="Create or activate a season to configure premium cards."
        />
      ) : isLoading ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-11 w-full rounded-xl" />
          <SkeletonBlock className="h-44 w-full rounded-2xl" />
        </div>
      ) : players.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No players in this season"
          description="Add athletes to the active season before marking premium cards."
        />
      ) : (
        <div className="space-y-4">
          {/* Add-athlete picker search bar + dropdown */}
          <div ref={pickerRef} className="relative">
            <MagnifyingGlass
              size={16}
              weight="bold"
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={showDropdown}
              aria-controls="premium-athlete-picker-listbox"
              aria-autocomplete="list"
              aria-activedescendant={
                showDropdown && searchResults[highlightedIndex]
                  ? `premium-picker-option-${searchResults[highlightedIndex].id}`
                  : undefined
              }
              aria-label="Search athletes to add as premium"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setIsDropdownOpen(e.target.value.trim().length > 0)
              }}
              onFocus={() => {
                if (searchQuery.trim().length > 0) {
                  setIsDropdownOpen(true)
                }
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search athletes to add as premium..."
              className={`${ADMIN_INPUT} min-h-[44px] pl-10 pr-11`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  setIsDropdownOpen(false)
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X size={16} weight="bold" aria-hidden="true" />
              </button>
            )}

            {showDropdown && (
              <div
                id="premium-athlete-picker-listbox"
                role="listbox"
                aria-label="Matching athletes"
                className="absolute left-0 right-0 top-full mt-2 z-30 rounded-2xl border border-border bg-surface shadow-xl overflow-hidden max-h-[min(360px,50vh)] overflow-y-auto overscroll-contain"
              >
                {searchResults.length === 0 ? (
                  <div className="px-4 py-4 text-center text-sm text-muted">
                    No matching athletes
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {searchResults.map((player, index) => {
                      const isHighlighted = index === highlightedIndex
                      const isPending = pendingIds.has(player.id)
                      return (
                        <li key={player.id} role="presentation">
                          <button
                            ref={(el) => {
                              optionRefs.current[index] = el
                            }}
                            id={`premium-picker-option-${player.id}`}
                            type="button"
                            role="option"
                            aria-selected={isHighlighted}
                            disabled={isPending || isClearing}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            onClick={() => handleAddFromPicker(player)}
                            className={`w-full min-h-[48px] px-4 py-2 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                              isHighlighted ? 'bg-surface-2' : 'bg-surface hover:bg-surface-2/70'
                            }`}
                          >
                            <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-3">
                              <span className="text-sm font-medium text-text truncate">
                                {player.name}
                              </span>
                              <div className="flex items-center gap-1.5 text-xs text-muted min-w-0">
                                <span className="truncate">{player.sport}</span>
                                {player.playing_role && (
                                  <>
                                    <span aria-hidden="true" className="text-border">
                                      /
                                    </span>
                                    <span className="truncate">{player.playing_role}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            <span className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-full border border-border bg-bg text-xs font-medium text-text shrink-0">
                              <Plus size={13} weight="bold" aria-hidden="true" />
                              Add
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Premium-only athlete list (44px minimum touch rows) */}
          {premiumPlayers.length === 0 ? (
            <div className={`${ADMIN_TABLE_SHELL} px-4 py-8 text-center text-sm text-muted`}>
              No premium athletes yet. Search above to add some.
            </div>
          ) : (
            <div className={`${ADMIN_TABLE_SHELL} max-h-[420px] overflow-y-auto`}>
              <ul className="divide-y divide-border" aria-label="Premium athletes">
                {premiumPlayers.map((player) => {
                  const isPending = pendingIds.has(player.id)
                  return (
                    <li
                      key={player.id}
                      className="flex items-center justify-between gap-3 min-h-[44px] px-4 py-1.5 hover:bg-surface-2/60 transition-colors"
                    >
                      <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-3">
                        <span className="text-sm font-medium text-text truncate">
                          {player.name}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted min-w-0">
                          <span className="truncate">{player.sport}</span>
                          {player.playing_role && (
                            <>
                              <span aria-hidden="true" className="text-border">
                                /
                              </span>
                              <span className="truncate">{player.playing_role}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleSetPremium(player, false)}
                        disabled={isPending || isClearing}
                        aria-label={`Remove ${player.name} from premium cards`}
                        title={`Remove ${player.name} from premium cards`}
                        className="inline-flex h-[44px] w-[44px] -mr-2 items-center justify-center rounded-full text-accent-bright hover:bg-accent-bright/10 transition-colors cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Star size={19} weight="fill" aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <Dialog
        isOpen={isClearDialogOpen}
        onClose={() => setIsClearDialogOpen(false)}
        title="Clear all premium cards"
        description={`Remove premium status from all ${activePremiumCount} selected ${
          activePremiumCount === 1 ? 'athlete' : 'athletes'
        } for this season?`}
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsClearDialogOpen(false)}
            className="rounded-full"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => void handleConfirmClearAll()}
            className="rounded-full"
          >
            Clear all
          </Button>
        </div>
      </Dialog>
    </section>
  )
}
