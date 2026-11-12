import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowClockwise,
  ArrowSquareOut,
  FilePdf,
  FloppyDisk,
  Trash,
  UploadSimple,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { isDemoMode, supabase } from '../../lib/data'
import { Button, Dialog, EmptyState, ErrorState } from '../ui'

const HANDBOOK_BUCKET = 'handbooks'
const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20 MB

interface HandbookRow {
  id: string
  title: string
  file_path: string
  created_at: string
}

function generateRandomSegment(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const values = new Uint32Array(length)
    crypto.getRandomValues(values)
    for (let i = 0; i < length; i++) {
      out += chars[values[i] % chars.length]
    }
    return out
  }
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

function generateAccessCode(): string {
  return `FLDR-${generateRandomSegment(4)}-${generateRandomSegment(4)}`
}

function generateRandomPdfFilename(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${crypto.randomUUID()}.pdf`
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.pdf`
}

function formatHandbookDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function getHandbookPublicUrl(filePath: string): string {
  if (!supabase || !filePath) return '#'
  const { data } = supabase.storage.from(HANDBOOK_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

export const HandbookSetupCard: React.FC = () => {
  const { user } = useAuth()
  const { showToast } = useToast()

  const isAdmin = user?.role === 'admin'
  const canWrite = isAdmin && !isDemoMode && Boolean(supabase)

  const [savedCode, setSavedCode] = useState<string>('')
  const [codeInput, setCodeInput] = useState<string>('')
  const [isSavingCode, setIsSavingCode] = useState<boolean>(false)

  const [handbooks, setHandbooks] = useState<HandbookRow[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [uploadTitle, setUploadTitle] = useState<string>('')
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null)
  const [uploadStage, setUploadStage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [handbookToDelete, setHandbookToDelete] = useState<HandbookRow | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)

  const loadHandbookAdminData = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = Boolean(options?.silent)
      if (!supabase || isDemoMode) {
        setIsLoading(false)
        return
      }

      try {
        if (!silent) {
          setIsLoading(true)
        }
        setLoadError(null)

        const [settingsRes, listRes] = await Promise.all([
          supabase
            .from('handbook_settings')
            .select('id, access_code')
            .eq('id', 1)
            .maybeSingle(),
          supabase
            .from('handbooks')
            .select('id, title, file_path, created_at')
            .order('created_at', { ascending: false })
        ])

        if (settingsRes.error) {
          throw settingsRes.error
        }
        if (listRes.error) {
          throw listRes.error
        }

        const currentCode =
          typeof settingsRes.data?.access_code === 'string'
            ? settingsRes.data.access_code
            : ''
        setSavedCode(currentCode)
        if (!silent) {
          setCodeInput(currentCode)
        }

        setHandbooks(Array.isArray(listRes.data) ? (listRes.data as HandbookRow[]) : [])
      } catch (err) {
        const msg = getErrorMessage(err, 'Failed to load handbook settings')
        if (!silent) {
          setLoadError(msg)
        }
        showToast(msg, 'error')
      } finally {
        if (!silent) {
          setIsLoading(false)
        }
      }
    },
    [showToast]
  )

  useEffect(() => {
    void loadHandbookAdminData()
  }, [loadHandbookAdminData])

  const handleGenerateCode = () => {
    setCodeInput(generateAccessCode())
  }

  const handleSaveCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canWrite || !supabase) {
      showToast(
        isDemoMode
          ? 'Handbook settings cannot be modified in demo mode.'
          : 'Admin permissions required.',
        'error'
      )
      return
    }

    const nextCode = codeInput.trim()

    try {
      setIsSavingCode(true)
      const { data: updatedRows, error: updateErr } = await supabase
        .from('handbook_settings')
        .update({ access_code: nextCode })
        .eq('id', 1)
        .select('id, access_code')

      if (updateErr) {
        throw updateErr
      }

      if (!updatedRows || updatedRows.length === 0) {
        const { error: upsertErr } = await supabase
          .from('handbook_settings')
          .upsert({ id: 1, access_code: nextCode })
        if (upsertErr) {
          throw upsertErr
        }
      }

      setSavedCode(nextCode)
      setCodeInput(nextCode)
      showToast(
        nextCode
          ? 'Handbook access code saved'
          : 'Handbook access code cleared (page locked for everyone)',
        'success'
      )
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to save access code'), 'error')
    } finally {
      setIsSavingCode(false)
    }
  }

  const clearSelectedFile = () => {
    setSelectedPdf(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (!file) {
      setSelectedPdf(null)
      return
    }

    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      showToast('Only PDF files are allowed.', 'error')
      clearSelectedFile()
      return
    }

    if (file.size > MAX_PDF_BYTES) {
      showToast('PDF file must be 20 MB or smaller.', 'error')
      clearSelectedFile()
      return
    }

    setSelectedPdf(file)
  }

  const handleUploadHandbook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canWrite || !supabase) {
      showToast(
        isDemoMode
          ? 'Handbooks cannot be uploaded in demo mode.'
          : 'Admin permissions required.',
        'error'
      )
      return
    }

    const trimmedTitle = uploadTitle.trim()
    if (!trimmedTitle) {
      showToast('Please enter a handbook title.', 'error')
      return
    }

    if (!selectedPdf) {
      showToast('Please choose a PDF file to upload.', 'error')
      return
    }

    const isPdf =
      selectedPdf.type === 'application/pdf' ||
      selectedPdf.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      showToast('Only PDF files are allowed.', 'error')
      return
    }

    if (selectedPdf.size > MAX_PDF_BYTES) {
      showToast('PDF file must be 20 MB or smaller.', 'error')
      return
    }

    const filePath = generateRandomPdfFilename()

    try {
      setIsUploading(true)
      setUploadStage('Uploading PDF to storage...')

      const { error: storageErr } = await supabase.storage
        .from(HANDBOOK_BUCKET)
        .upload(filePath, selectedPdf, {
          contentType: 'application/pdf',
          upsert: false
        })

      if (storageErr) {
        throw storageErr
      }

      setUploadStage('Saving handbook entry...')

      const { data: inserted, error: insertErr } = await supabase
        .from('handbooks')
        .insert({
          title: trimmedTitle,
          file_path: filePath
        })
        .select('id, title, file_path, created_at')
        .single()

      if (insertErr) {
        await supabase.storage.from(HANDBOOK_BUCKET).remove([filePath])
        throw insertErr
      }

      setHandbooks((prev) => [inserted as HandbookRow, ...prev])
      setUploadTitle('')
      clearSelectedFile()
      showToast('Handbook uploaded', 'success')
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to upload handbook'), 'error')
    } finally {
      setIsUploading(false)
      setUploadStage(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!handbookToDelete || !canWrite || !supabase) return

    try {
      setIsDeleting(true)

      if (handbookToDelete.file_path) {
        const { error: removeStorageErr } = await supabase.storage
          .from(HANDBOOK_BUCKET)
          .remove([handbookToDelete.file_path])

        if (removeStorageErr) {
          throw removeStorageErr
        }
      }

      const { error: deleteRowErr } = await supabase
        .from('handbooks')
        .delete()
        .eq('id', handbookToDelete.id)

      if (deleteRowErr) {
        throw deleteRowErr
      }

      setHandbooks((prev) => prev.filter((h) => h.id !== handbookToDelete.id))
      setHandbookToDelete(null)
      showToast('Handbook deleted', 'success')
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete handbook'), 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  if (loadError) {
    return (
      <ErrorState
        title="Failed to load handbook configuration"
        message={loadError}
        onRetry={() => loadHandbookAdminData()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Access Code Card */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-syne font-bold text-xl text-text">Handbook Access Code</h2>
            <p className="text-xs text-muted mt-1">
              Set the code required to unlock /handbook. Saving an empty code locks the page for everyone.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted">Current code:</span>
            {isLoading ? (
              <span className="font-mono text-muted">Loading...</span>
            ) : savedCode ? (
              <span className="font-mono font-semibold text-accent-bright px-2.5 py-1 rounded-lg bg-surface-2 border border-border">
                {savedCode}
              </span>
            ) : (
              <span className="font-mono text-muted px-2.5 py-1 rounded-lg bg-surface-2 border border-border">
                Locked (Empty)
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveCode} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="admin-handbook-code"
              className="block text-xs font-mono uppercase tracking-wider text-muted mb-2"
            >
              Access Code
            </label>
            <input
              id="admin-handbook-code"
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="e.g. FLDR-ABCD-1234 (leave empty to lock)"
              disabled={!canWrite || isSavingCode || isLoading}
              spellCheck={false}
              autoComplete="off"
              className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm font-mono text-text focus:outline-none focus:border-accent-bright disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              type="button"
              variant="secondary"
              size="md"
              leftIcon={ArrowClockwise}
              disabled={!canWrite || isSavingCode || isLoading}
              onClick={handleGenerateCode}
            >
              Generate
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              leftIcon={FloppyDisk}
              isLoading={isSavingCode}
              disabled={!canWrite || isSavingCode || isLoading}
            >
              Save
            </Button>
          </div>
        </form>
      </div>

      {/* 2. Upload Card */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-5">
        <div>
          <h2 className="font-syne font-bold text-xl text-text">Upload Handbook PDF</h2>
          <p className="text-xs text-muted mt-1">
            Upload a PDF document (maximum 20 MB) to make it available on the Handbook page.
          </p>
        </div>

        <form onSubmit={handleUploadHandbook} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="handbook-title-input"
                className="block text-xs font-mono uppercase tracking-wider text-muted mb-2"
              >
                Title
              </label>
              <input
                id="handbook-title-input"
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. Season 2026 Official Rulebook"
                disabled={!canWrite || isUploading}
                required
                className="w-full bg-bg border border-border rounded-xl px-4 py-2.5 text-sm text-text focus:outline-none focus:border-accent-bright disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="handbook-pdf-input"
                className="block text-xs font-mono uppercase tracking-wider text-muted mb-2"
              >
                PDF Document (Max 20 MB)
              </label>
              <div className="flex items-center gap-2.5">
                <input
                  ref={fileInputRef}
                  id="handbook-pdf-input"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  disabled={!canWrite || isUploading}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  leftIcon={FilePdf}
                  disabled={!canWrite || isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose PDF
                </Button>
                {selectedPdf ? (
                  <div className="flex items-center gap-2 min-w-0 flex-1 bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs text-text">
                    <span className="truncate flex-1">{selectedPdf.name}</span>
                    <span className="font-mono text-muted shrink-0 tabular-nums">
                      {(selectedPdf.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      disabled={isUploading}
                      aria-label="Clear selected PDF"
                      className="text-muted hover:text-text transition-colors"
                    >
                      <X size={14} weight="bold" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted truncate">No file chosen</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-xs font-mono text-muted">
              {uploadStage ? uploadStage : ''}
            </div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              leftIcon={UploadSimple}
              isLoading={isUploading}
              disabled={!canWrite || isUploading || !uploadTitle.trim() || !selectedPdf}
            >
              {isUploading ? 'Uploading...' : 'Upload Handbook'}
            </Button>
          </div>
        </form>
      </div>

      {/* 3. List Card */}
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-syne font-bold text-xl text-text">Uploaded Handbooks</h2>
            <p className="text-xs text-muted mt-1">
              Documents currently published behind the handbook access code.
            </p>
          </div>
          <span className="text-xs font-mono text-muted tabular-nums">
            {handbooks.length} {handbooks.length === 1 ? 'file' : 'files'}
          </span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 bg-surface-2 border border-border rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : handbooks.length === 0 ? (
          <EmptyState
            title="No handbooks uploaded"
            description="Upload a PDF above to publish it on the Handbook page."
          />
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {handbooks.map((item) => {
              const publicUrl = getHandbookPublicUrl(item.file_path)
              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-2/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-syne font-bold text-base text-text break-words">
                      {item.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-mono text-muted tabular-nums">
                      <span>{formatHandbookDate(item.created_at)}</span>
                      <span className="truncate max-w-xs">{item.file_path}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-2 border border-border text-xs font-medium text-text hover:bg-border/40 transition-colors"
                    >
                      <ArrowSquareOut size={14} weight="bold" />
                      <span>Open</span>
                    </a>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      leftIcon={Trash}
                      disabled={!canWrite}
                      onClick={() => setHandbookToDelete(item)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(handbookToDelete)}
        onClose={() => {
          if (!isDeleting) {
            setHandbookToDelete(null)
          }
        }}
        title="Delete Handbook"
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-error/10 border border-error/30 flex items-start gap-3 text-xs text-text">
            <WarningCircle size={18} weight="fill" className="text-error shrink-0 mt-0.5" />
            <div>
              Are you sure you want to delete{' '}
              <span className="font-semibold">{handbookToDelete?.title}</span>? This will permanently remove the PDF file from storage.
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isDeleting}
              onClick={() => setHandbookToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              leftIcon={Trash}
              isLoading={isDeleting}
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              Delete Handbook
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
