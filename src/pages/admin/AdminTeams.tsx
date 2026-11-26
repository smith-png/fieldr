import React, { useMemo, useState } from 'react'
import {
  CheckCircle,
  DownloadSimple,
  Eye,
  EyeSlash,
  Key,
  PencilSimple,
  Plus,
  ShieldCheck,
  Trash,
  UploadSimple,
  User,
  Wallet,
  WarningCircle
} from '@phosphor-icons/react'
import type { Season, Sport, Team } from '../../types'
import {
  bulkCreateTeams,
  createTeam,
  deleteStorageAsset,
  deleteTeam,
  manageOwnerLogin,
  updateTeam,
  uploadAsset
} from '../../lib/data'
import { getErrorMessage } from '../../lib/errors'
import { getValidTeamColor } from '../../lib/utils'
import { useToast } from '../../lib/ToastContext'
import { Button, Dialog, EmptyState } from '../../components/ui'
import {
  ADMIN_CARD,
  ADMIN_CARD_HEADER,
  ADMIN_CARD_TITLE,
  ADMIN_COUNT_PILL,
  ADMIN_DIALOG_CLASS,
  ADMIN_ICON_BTN,
  ADMIN_ICON_BTN_DANGER,
  ADMIN_INPUT,
  ADMIN_LABEL,
  ADMIN_PAGE_HEADER,
  ADMIN_PAGE_TITLE,
  ADMIN_PAGE_WRAPPER,
  ADMIN_SELECT,
  ADMIN_TABLE_SHELL,
  ADMIN_WELL
} from '../../components/admin/adminStyles'

const SPORT_ORDER = ['Cricket', 'Futsal', 'Volleyball']

interface AdminTeamsProps {
  activeSeason: Season | null
  teams: Team[]
  sports: Sport[]
  onRefresh: () => Promise<void>
}

export const AdminTeams: React.FC<AdminTeamsProps> = ({
  activeSeason,
  teams,
  sports,
  onRefresh
}) => {
  const { success, error } = useToast()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [deleteConfirmTeam, setDeleteConfirmTeam] = useState<Team | null>(null)

  // Form states
  const [name, setName] = useState('')
  const [shortCode, setShortCode] = useState('')
  const [sport, setSport] = useState('')
  const [color, setColor] = useState('#047554')
  const [ownerDisplayName, setOwnerDisplayName] = useState('')
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState('')
  const [startingPurse, setStartingPurse] = useState('1000')
  const [logoUrl, setLogoUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isUploadingOwnerPhoto, setIsUploadingOwnerPhoto] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // CSV Import state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<
    Array<Omit<Team, 'id' | 'current_purse' | 'created_at'> & { valid: boolean; error?: string }>
  >([])
  const [isImporting, setIsImporting] = useState(false)

  // Owner Login management state
  const [loginModalTeam, setLoginModalTeam] = useState<Team | null>(null)
  const [currentLoginId, setCurrentLoginId] = useState<string | null>(null)
  const [isLoadingLoginStatus, setIsLoadingLoginStatus] = useState(false)
  const [loginIdInput, setLoginIdInput] = useState('')
  const [passwordInput, setPasswordInput] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSavingLogin, setIsSavingLogin] = useState(false)
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false)
  const [isRemovingLogin, setIsRemovingLogin] = useState(false)

  const openOwnerLoginModal = async (team: Team) => {
    setLoginModalTeam(team)
    setLoginIdInput('')
    setPasswordInput('')
    setShowPassword(false)
    setIsConfirmingRemove(false)
    setCurrentLoginId(null)
    setIsLoadingLoginStatus(true)

    try {
      const res = await manageOwnerLogin({
        action: 'status',
        team_id: team.id
      })
      setCurrentLoginId(res.login_id || null)
      if (res.login_id) {
        setLoginIdInput(res.login_id)
      }
    } catch (err: unknown) {
      error(getErrorMessage(err, 'Failed to check owner login status'))
    } finally {
      setIsLoadingLoginStatus(false)
    }
  }

  const closeOwnerLoginModal = () => {
    if (isSavingLogin || isRemovingLogin) return
    setLoginModalTeam(null)
    setLoginIdInput('')
    setPasswordInput('')
    setShowPassword(false)
    setCurrentLoginId(null)
    setIsConfirmingRemove(false)
  }

  const handleSaveLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginModalTeam) return

    const cleanLoginId = loginIdInput.trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,30}$/.test(cleanLoginId)) {
      error(
        'Login ID must be 3 to 30 characters and contain only lowercase letters, numbers, dot, dash, or underscore.'
      )
      return
    }

    if (passwordInput.length < 8) {
      error('Password must be at least 8 characters.')
      return
    }

    try {
      setIsSavingLogin(true)
      const res = await manageOwnerLogin({
        action: 'set',
        team_id: loginModalTeam.id,
        login_id: cleanLoginId,
        password: passwordInput
      })

      // Never display or store the password after saving
      setPasswordInput('')
      setCurrentLoginId(cleanLoginId)
      success(res.message || 'Owner login saved successfully')
      closeOwnerLoginModal()
    } catch (err: unknown) {
      error(getErrorMessage(err, 'Failed to save owner login'))
    } finally {
      setIsSavingLogin(false)
    }
  }

  const handleConfirmRemoveLogin = async () => {
    if (!loginModalTeam) return

    try {
      setIsRemovingLogin(true)
      const res = await manageOwnerLogin({
        action: 'remove',
        team_id: loginModalTeam.id
      })

      success(res.message || 'Owner login removed successfully')
      closeOwnerLoginModal()
    } catch (err: unknown) {
      error(getErrorMessage(err, 'Failed to remove owner login'))
    } finally {
      setIsRemovingLogin(false)
      setIsConfirmingRemove(false)
    }
  }

  // Group teams by sport in requested order: Cricket, Futsal, Volleyball
  const groupedSports = useMemo(() => {
    const map = new Map<string, Team[]>()
    for (const team of teams) {
      const rawSport = team.sport?.trim() || 'Other'
      const canonical =
        SPORT_ORDER.find((s) => s.toLowerCase() === rawSport.toLowerCase()) || rawSport
      if (!map.has(canonical)) {
        map.set(canonical, [])
      }
      map.get(canonical)!.push(team)
    }

    const orderedKeys: string[] = []
    for (const s of SPORT_ORDER) {
      if (map.has(s) && map.get(s)!.length > 0) {
        orderedKeys.push(s)
      }
    }
    for (const [key, list] of map.entries()) {
      if (!orderedKeys.includes(key) && list.length > 0) {
        orderedKeys.push(key)
      }
    }

    return orderedKeys.map((sportName) => ({
      sport: sportName,
      teams: map.get(sportName)!
    }))
  }, [teams])

  const downloadTeamsTemplate = () => {
    const header = 'sport,name,short_code,color,starting_purse,owner_display_name\n'
    const example = 'Cricket,Stallions CC,SCC,#2F5233,10000,Marcus Vance\n'
    const blob = new Blob([header + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teams_template_${activeSeason?.name || 'season'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeSeason) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (!content) return

      const lines = content
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length <= 1) {
        error('CSV is empty or missing headers')
        return
      }

      const rows: Array<
        Omit<Team, 'id' | 'current_purse' | 'created_at'> & { valid: boolean; error?: string }
      > = []
      const existingCodes = new Set(teams.map((t) => t.short_code.toUpperCase()))

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim())
        if (parts.length < 3) continue

        const [sportVal, nameVal, codeVal, colorVal, purseVal, ownerVal] = parts
        const codeClean = (codeVal || '').toUpperCase()

        let rowError: string | undefined
        if (!nameVal) rowError = 'Name is required'
        else if (!codeClean || codeClean.length > 3)
          rowError = 'Short code must be 1-3 characters'
        else if (existingCodes.has(codeClean)) rowError = `Code "${codeClean}" already in use`

        rows.push({
          season_id: activeSeason.id,
          sport: sportVal || sports[0]?.name || 'Cricket',
          name: nameVal || 'Unnamed Team',
          short_code: codeClean,
          color: colorVal || '#047554',
          starting_purse: parseInt(purseVal, 10) || 1000,
          owner_display_name: ownerVal || undefined,
          valid: !rowError,
          error: rowError
        })
      }

      setCsvRows(rows)
      setIsCsvModalOpen(true)
    }
    reader.readAsText(file)
  }

  const confirmBulkImport = async () => {
    const validRows = csvRows.filter((r) => r.valid)
    if (validRows.length === 0) return

    try {
      setIsImporting(true)
      await bulkCreateTeams(validRows)
      success(`Imported ${validRows.length} teams successfully`)
      setIsCsvModalOpen(false)
      setCsvRows([])
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      error(msg)
    } finally {
      setIsImporting(false)
    }
  }

  const openCreateModal = () => {
    setEditingTeam(null)
    setName('')
    setShortCode('')
    setSport(sports[0]?.name || 'Cricket')
    setColor('#047554')
    setOwnerDisplayName('')
    setOwnerPhotoUrl('')
    setStartingPurse('1000')
    setLogoUrl('')
    setIsModalOpen(true)
  }

  const openEditModal = (team: Team) => {
    setEditingTeam(team)
    setName(team.name)
    setShortCode(team.short_code)
    setSport(team.sport)
    setColor(team.color)
    setOwnerDisplayName(team.owner_display_name || '')
    setOwnerPhotoUrl(team.owner_photo_url || '')
    setStartingPurse(String(team.starting_purse))
    setLogoUrl(team.logo_url || '')
    setIsModalOpen(true)
  }

  const handleCloseModal = async () => {
    const initialLogo = editingTeam?.logo_url || ''
    const initialOwnerPhoto = editingTeam?.owner_photo_url || ''

    if (logoUrl && logoUrl !== initialLogo) {
      await deleteStorageAsset(logoUrl)
    }
    if (ownerPhotoUrl && ownerPhotoUrl !== initialOwnerPhoto) {
      await deleteStorageAsset(ownerPhotoUrl)
    }
    setIsModalOpen(false)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const previousLogo = logoUrl
    const initialLogo = editingTeam?.logo_url || ''

    try {
      setIsUploading(true)
      const url = await uploadAsset(file, 'team-logos', 400)
      if (previousLogo && previousLogo !== initialLogo && previousLogo !== url) {
        await deleteStorageAsset(previousLogo)
      }
      setLogoUrl(url)
      success('Logo compressed and uploaded successfully')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      error(msg)
    } finally {
      setIsUploading(false)
    }
  }

  const handleOwnerPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const previousOwnerPhoto = ownerPhotoUrl
    const initialOwnerPhoto = editingTeam?.owner_photo_url || ''

    try {
      setIsUploadingOwnerPhoto(true)
      const url = await uploadAsset(file, 'team-owners', 600)
      if (
        previousOwnerPhoto &&
        previousOwnerPhoto !== initialOwnerPhoto &&
        previousOwnerPhoto !== url
      ) {
        await deleteStorageAsset(previousOwnerPhoto)
      }
      setOwnerPhotoUrl(url)
      success('Owner photo compressed and uploaded successfully')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      error(msg)
    } finally {
      setIsUploadingOwnerPhoto(false)
    }
  }

  const handleRemoveOwnerPhoto = async () => {
    const currentPhoto = ownerPhotoUrl
    const initialOwnerPhoto = editingTeam?.owner_photo_url || ''
    if (currentPhoto && currentPhoto !== initialOwnerPhoto) {
      await deleteStorageAsset(currentPhoto)
    }
    setOwnerPhotoUrl('')
  }

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSeason) {
      error('No active season found')
      return
    }

    if (shortCode.length > 3) {
      error('Short code must be at most 3 characters')
      return
    }

    const nextLogoUrl = logoUrl.trim() || null
    const nextOwnerPhotoUrl = ownerPhotoUrl.trim() || null
    const nextOwnerName = ownerDisplayName.trim() || null

    try {
      setIsSubmitting(true)
      if (editingTeam) {
        const previousSavedLogo = editingTeam.logo_url || null
        const previousSavedOwnerPhoto = editingTeam.owner_photo_url || null

        await updateTeam(editingTeam.id, {
          name: name.trim(),
          short_code: shortCode.trim().toUpperCase(),
          sport,
          color,
          owner_display_name: nextOwnerName,
          owner_photo_url: nextOwnerPhotoUrl,
          logo_url: nextLogoUrl
        })

        if (previousSavedLogo && previousSavedLogo !== nextLogoUrl) {
          await deleteStorageAsset(previousSavedLogo)
        }
        if (previousSavedOwnerPhoto && previousSavedOwnerPhoto !== nextOwnerPhotoUrl) {
          await deleteStorageAsset(previousSavedOwnerPhoto)
        }

        success(`Team "${name}" updated`)
      } else {
        await createTeam({
          season_id: activeSeason.id,
          name: name.trim(),
          short_code: shortCode.trim().toUpperCase(),
          sport,
          color,
          owner_display_name: nextOwnerName,
          owner_photo_url: nextOwnerPhotoUrl,
          starting_purse: Number(startingPurse) || 1000,
          logo_url: nextLogoUrl
        })
        success(`Team "${name}" created successfully`)
      }

      setIsModalOpen(false)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving team'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!deleteConfirmTeam) return

    try {
      setIsSubmitting(true)
      const logoToDelete = deleteConfirmTeam.logo_url
      const ownerPhotoToDelete = deleteConfirmTeam.owner_photo_url
      await deleteTeam(deleteConfirmTeam.id)
      if (logoToDelete) {
        await deleteStorageAsset(logoToDelete)
      }
      if (ownerPhotoToDelete) {
        await deleteStorageAsset(ownerPhotoToDelete)
      }
      success(`Team "${deleteConfirmTeam.name}" deleted and assigned players released`)
      setDeleteConfirmTeam(null)
      await onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete team'
      error(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={ADMIN_PAGE_WRAPPER}>
      <header className={ADMIN_PAGE_HEADER}>
        <h1 className={ADMIN_PAGE_TITLE}>Teams &amp; Franchises</h1>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <label className="min-h-[40px] px-4 py-2 rounded-full border border-border bg-surface-2 hover:bg-surface text-sm font-normal text-text cursor-pointer transition-colors inline-flex items-center gap-2">
            <UploadSimple size={16} weight="regular" />
            <span>Import CSV</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              className="hidden"
            />
          </label>
          <Button
            type="button"
            variant="primary"
            size="md"
            leftIcon={Plus}
            onClick={openCreateModal}
            className="rounded-full px-5"
          >
            Create Team
          </Button>
        </div>
      </header>

      {/* Teams Grid Grouped by Sport */}
      {teams.length === 0 ? (
        <section className={ADMIN_CARD}>
          <EmptyState
            icon={ShieldCheck}
            title="No teams created yet"
            description="Create a franchise team to start registering players and allocating purses."
            actionLabel="Create first team"
            onAction={openCreateModal}
          />
        </section>
      ) : (
        <div className="space-y-6">
          {groupedSports.map((group) => (
            <section key={group.sport} className={ADMIN_CARD}>
              <div className={ADMIN_CARD_HEADER}>
                <h2 className={ADMIN_CARD_TITLE}>{group.sport}</h2>
                <span className={ADMIN_COUNT_PILL}>
                  {group.teams.length} {group.teams.length === 1 ? 'team' : 'teams'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {group.teams.map((team) => {
                  const teamColor = getValidTeamColor(team.color)
                  return (
                    <div
                      key={team.id}
                      style={
                        teamColor
                          ? ({ '--team-color': teamColor } as React.CSSProperties)
                          : undefined
                      }
                      className={`relative overflow-hidden p-5 rounded-2xl border-[1.5px] border-solid transition-colors flex flex-col justify-between gap-4 ${
                        teamColor
                          ? 'bg-[color:color-mix(in_srgb,var(--team-color)_6%,var(--bg))] border-[color:color-mix(in_srgb,var(--team-color)_65%,transparent)]'
                          : 'bg-bg border-border'
                      }`}
                    >
                      <div className="space-y-4">
                        {/* Row 1: Logo + Sport on left, action buttons on right */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {team.logo_url ? (
                              <img
                                src={team.logo_url}
                                alt={`${team.name} emblem`}
                                width={48}
                                height={48}
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                className="w-12 h-12 rounded-2xl object-contain bg-surface border border-border p-1 shrink-0"
                              />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-2xl flex items-center justify-center border border-border shrink-0 font-syne font-bold text-base text-white"
                                style={{ backgroundColor: teamColor || 'var(--accent-bright)' }}
                              >
                                {team.short_code}
                              </div>
                            )}
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface border border-border font-mono text-[11px] uppercase tracking-wider text-muted truncate">
                              {team.short_code}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openOwnerLoginModal(team)}
                              aria-label={`Owner login for ${team.name}`}
                              title="Owner login"
                              className={ADMIN_ICON_BTN}
                            >
                              <Key size={15} weight="regular" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(team)}
                              aria-label={`Edit ${team.name}`}
                              title="Edit team"
                              className={ADMIN_ICON_BTN}
                            >
                              <PencilSimple size={15} weight="regular" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmTeam(team)}
                              aria-label={`Delete ${team.name}`}
                              title="Delete team"
                              className={ADMIN_ICON_BTN_DANGER}
                            >
                              <Trash size={15} weight="regular" />
                            </button>
                          </div>
                        </div>

                        {/* Row 2: Team Name */}
                        <h3
                          title={team.name}
                          className="font-syne font-bold text-xl text-text tracking-tight text-balance break-words min-w-0 line-clamp-2"
                        >
                          {team.name}
                        </h3>

                        {/* Owner Info */}
                        <div className="py-3 border-y border-border text-xs flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block text-[11px] text-muted">Owner</span>
                            <span className="text-sm text-text font-medium truncate block">
                              {team.owner_display_name || 'Unassigned'}
                            </span>
                          </div>
                          {team.owner_photo_url && (
                            <img
                              src={team.owner_photo_url}
                              alt={team.owner_display_name || 'Owner'}
                              width={32}
                              height={32}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
                            />
                          )}
                        </div>
                      </div>

                      {/* Financial Metric */}
                      <div className="bg-surface rounded-xl px-3.5 py-2.5 border border-border flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <Wallet size={15} weight="regular" className="text-points shrink-0" />
                          <span>Current Purse</span>
                        </div>
                        <div className="font-mono text-sm font-bold text-points tabular-nums whitespace-nowrap">
                          {Number(team?.current_purse ?? 0).toLocaleString()} PTS
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Create / Edit Team Dialog */}
      <Dialog
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingTeam ? 'Edit Team Details' : 'Create Franchise Team'}
        size="lg"
        className={ADMIN_DIALOG_CLASS}
      >
        <form onSubmit={handleSaveTeam} className="space-y-4">
          <div className="space-y-1.5">
            <label className={ADMIN_LABEL}>Team Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Royal Strikers"
              required
              className={ADMIN_INPUT}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className={ADMIN_LABEL}>Short Code *</label>
                <span className="text-xs font-mono text-muted">Max 3 letters</span>
              </div>
              <input
                type="text"
                maxLength={3}
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                placeholder="RST"
                required
                className={`${ADMIN_INPUT} font-mono`}
              />
            </div>

            <div className="space-y-1.5">
              <label className={ADMIN_LABEL}>Sport *</label>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className={`${ADMIN_SELECT} w-full`}
              >
                {sports.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={ADMIN_LABEL}>Theme Color *</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-11 h-11 rounded-xl cursor-pointer bg-transparent border-0 shrink-0"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className={`${ADMIN_INPUT} flex-1 font-mono`}
                />
              </div>
            </div>

            {!editingTeam && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className={ADMIN_LABEL}>Starting Purse</label>
                  <span className="text-xs font-mono text-muted">PTS</span>
                </div>
                <input
                  type="number"
                  min={0}
                  value={startingPurse}
                  onChange={(e) => setStartingPurse(e.target.value)}
                  className={`${ADMIN_INPUT} font-mono tabular-nums text-points`}
                />
              </div>
            )}
          </div>

          {/* Owner Name and Owner Photo side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <label className={ADMIN_LABEL}>Owner Name</label>
              <div className="relative">
                <input
                  type="text"
                  value={ownerDisplayName}
                  onChange={(e) => setOwnerDisplayName(e.target.value)}
                  placeholder="Marcus Vance"
                  className={`${ADMIN_INPUT} pr-10`}
                />
                <User
                  size={16}
                  weight="regular"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={ADMIN_LABEL}>Owner Photo</label>
              <div className="flex items-center gap-2.5">
                {ownerPhotoUrl ? (
                  <div className="w-11 h-11 rounded-full overflow-hidden border border-border bg-surface-2 shrink-0">
                    <img
                      src={ownerPhotoUrl}
                      alt="Owner photo preview"
                      width={44}
                      height={44}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-11 h-11 rounded-full border border-border bg-surface-2 flex items-center justify-center text-muted shrink-0">
                    <User size={18} weight="regular" />
                  </div>
                )}

                <label className="flex-1 min-h-[42px] px-3.5 py-2 rounded-full bg-surface-2 border border-border hover:border-accent-bright text-center cursor-pointer inline-flex items-center justify-center gap-1.5 text-xs text-text transition-colors">
                  <UploadSimple size={15} weight="regular" />
                  <span>
                    {isUploadingOwnerPhoto
                      ? 'Compressing...'
                      : ownerPhotoUrl
                      ? 'Replace'
                      : 'Upload'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleOwnerPhotoUpload}
                    disabled={isUploadingOwnerPhoto || isSubmitting}
                    className="hidden"
                  />
                </label>

                {ownerPhotoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveOwnerPhoto}
                    disabled={isUploadingOwnerPhoto || isSubmitting}
                    className="min-h-[42px] px-3 py-2 rounded-full border border-border bg-surface-2 hover:bg-error/10 text-muted hover:text-error text-xs transition-colors shrink-0 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Logo Upload with Preview */}
          <div className="space-y-1.5">
            <label className={ADMIN_LABEL}>Team Crest</label>
            <div className="flex items-center gap-3.5">
              {logoUrl ? (
                <div className="w-14 h-14 rounded-2xl overflow-hidden border border-border bg-surface-2 shrink-0">
                  <img
                    src={logoUrl}
                    alt="Logo preview"
                    width={56}
                    height={56}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center font-mono font-bold text-white shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {shortCode || 'LOGO'}
                </div>
              )}

              <label className="flex-1 min-h-[42px] px-4 py-2 rounded-full bg-surface-2 border border-border hover:border-accent-bright text-center cursor-pointer inline-flex items-center justify-center gap-2 text-xs text-text transition-colors">
                <UploadSimple size={16} weight="regular" />
                <span>{isUploading ? 'Compressing...' : 'Upload crest image'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLogoUpload}
                  disabled={isUploading || isSubmitting}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCloseModal}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting || isUploading || isUploadingOwnerPhoto}
              isLoading={isSubmitting}
              className="rounded-full px-4"
            >
              {editingTeam ? 'Update Team' : 'Create Team'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={!!deleteConfirmTeam}
        onClose={() => setDeleteConfirmTeam(null)}
        title={deleteConfirmTeam ? `Delete "${deleteConfirmTeam.name}"?` : 'Delete Team'}
        size="sm"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            This cannot be undone. Assigned players will be released back to the available pool.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setDeleteConfirmTeam(null)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeleteTeam}
              disabled={isSubmitting}
              isLoading={isSubmitting}
              className="rounded-full px-4"
            >
              Delete Team
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CSV Bulk Import Modal */}
      <Dialog
        isOpen={isCsvModalOpen}
        onClose={() => !isImporting && setIsCsvModalOpen(false)}
        title="CSV Franchise Teams Import"
        size="lg"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 text-xs flex-wrap">
            <span className="text-muted">
              Valid:{' '}
              <strong className="text-text font-mono tabular-nums">
                {csvRows.filter((r) => r.valid).length}
              </strong>{' '}
              / {csvRows.length}
            </span>
            <button
              type="button"
              onClick={downloadTeamsTemplate}
              className="relative hit-44 h-7 px-3 rounded-full bg-surface-2 border border-border text-accent-bright hover:border-accent-bright inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <DownloadSimple size={14} weight="regular" />
              <span>Sample Template</span>
            </button>
          </div>

          <div className={ADMIN_TABLE_SHELL}>
            <div className="max-h-60 overflow-y-auto overflow-x-auto thin-scrollbar">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="bg-surface-2 text-muted font-mono uppercase text-[10px] sticky top-0 border-b border-border">
                  <tr>
                    <th className="p-3 font-normal">Sport</th>
                    <th className="p-3 font-normal">Team Name</th>
                    <th className="p-3 font-normal">Code</th>
                    <th className="p-3 font-normal">Starting Purse</th>
                    <th className="p-3 font-normal">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {csvRows.map((r, i) => (
                    <tr key={i} className={r.valid ? '' : 'bg-error/5'}>
                      <td className="p-3 font-medium text-text">{r.sport}</td>
                      <td className="p-3 text-text">{r.name}</td>
                      <td className="p-3 font-mono text-text">{r.short_code}</td>
                      <td className="p-3 font-mono tabular-nums text-points">
                        {r.starting_purse} PTS
                      </td>
                      <td className="p-3">
                        {r.valid ? (
                          <span className="text-accent-bright inline-flex items-center gap-1 text-[11px]">
                            <CheckCircle size={14} weight="regular" /> Ready
                          </span>
                        ) : (
                          <span className="text-error inline-flex items-center gap-1 text-[11px]">
                            <WarningCircle size={14} weight="regular" /> {r.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCsvModalOpen(false)}
              disabled={isImporting}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={confirmBulkImport}
              disabled={isImporting || csvRows.filter((r) => r.valid).length === 0}
              isLoading={isImporting}
              className="rounded-full px-4"
            >
              Import {csvRows.filter((r) => r.valid).length} Teams
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Owner Login Dialog */}
      <Dialog
        isOpen={Boolean(loginModalTeam)}
        onClose={closeOwnerLoginModal}
        title={`Owner login · ${loginModalTeam?.name || ''}`}
        size="md"
        className={ADMIN_DIALOG_CLASS}
      >
        <div className="space-y-5">
          {/* Status Header */}
          <div
            className={`${ADMIN_WELL} p-4 flex items-center justify-between gap-3 text-xs`}
          >
            <span className="text-muted">Current login ID</span>
            {isLoadingLoginStatus ? (
              <span className="font-mono text-muted animate-pulse">Loading...</span>
            ) : currentLoginId ? (
              <span className="font-mono font-semibold text-accent-bright bg-surface px-3 py-1 rounded-full border border-border">
                {currentLoginId}
              </span>
            ) : (
              <span className="font-mono text-muted bg-surface px-3 py-1 rounded-full border border-border">
                No login yet
              </span>
            )}
          </div>

          <form onSubmit={handleSaveLogin} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="owner-login-id" className={ADMIN_LABEL}>
                  Login ID
                </label>
                <span className="text-xs font-mono text-muted">3–30 chars · a-z 0-9 . _ -</span>
              </div>
              <input
                id="owner-login-id"
                type="text"
                value={loginIdInput}
                onChange={(e) => setLoginIdInput(e.target.value.toLowerCase())}
                placeholder="strikers_owner"
                required
                disabled={isLoadingLoginStatus || isSavingLogin || isRemovingLogin}
                className={`${ADMIN_INPUT} font-mono`}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="owner-login-password" className={ADMIN_LABEL}>
                  Password
                </label>
                <span className="text-xs font-mono text-muted">Min 8 chars</span>
              </div>
              <div className="relative">
                <input
                  id="owner-login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={currentLoginId ? 'New password to reset' : 'At least 8 characters'}
                  required
                  disabled={isLoadingLoginStatus || isSavingLogin || isRemovingLogin}
                  className={`${ADMIN_INPUT} font-mono pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="hit-44 absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-text hover:bg-surface-2 transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeSlash size={16} weight="regular" />
                  ) : (
                    <Eye size={16} weight="regular" />
                  )}
                </button>
              </div>
            </div>

            {/* Remove confirmation step banner */}
            {isConfirmingRemove && (
              <div className="p-4 rounded-2xl bg-error/10 border border-error/30 text-xs text-text space-y-2.5">
                <div className="font-semibold text-error">Remove owner login?</div>
                <p className="text-muted">
                  The team owner will no longer be able to log in to manage this franchise.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={isRemovingLogin}
                    onClick={() => setIsConfirmingRemove(false)}
                    className="rounded-full"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    isLoading={isRemovingLogin}
                    disabled={isRemovingLogin}
                    onClick={handleConfirmRemoveLogin}
                    className="rounded-full px-4"
                  >
                    Confirm Remove
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
              {currentLoginId && !isConfirmingRemove ? (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={isLoadingLoginStatus || isSavingLogin || isRemovingLogin}
                  onClick={() => setIsConfirmingRemove(true)}
                  className="rounded-full"
                >
                  Remove login
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isSavingLogin || isRemovingLogin}
                  onClick={closeOwnerLoginModal}
                  className="rounded-full"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSavingLogin}
                  disabled={
                    isLoadingLoginStatus ||
                    isSavingLogin ||
                    isRemovingLogin ||
                    !loginIdInput.trim() ||
                    passwordInput.length < 8
                  }
                  className="rounded-full px-4"
                >
                  Save login
                </Button>
              </div>
            </div>
          </form>
        </div>
      </Dialog>
    </div>
  )
}
