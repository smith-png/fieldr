import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  FilePdf,
  Trash,
  UploadSimple,
  WarningCircle,
  X
} from '@phosphor-icons/react'
import { useAuth } from '../../lib/AuthContext'
import { useToast } from '../../lib/ToastContext'
import { getErrorMessage } from '../../lib/errors'
import { isDemoMode, supabase } from '../../lib/data'
import {
  deleteRulesDocument,
  formatRulesDate,
  getRulesDocuments,
  getRulesPublicUrl,
  uploadRulesPdf
} from '../../lib/data/rules'
import { Button, Dialog, EmptyState, ErrorState } from '../ui'
import type { RulesDocument } from '../../types'

const MAX_PDF_BYTES = 20 * 1024 * 1024 // 20 MB

export const RulesSetupCard: React.FC = () => {
  const { user } = useAuth()
  const { showToast } = useToast()

  const isAdmin = user?.role === 'admin'
  const canWrite = isAdmin && !isDemoMode && Boolean(supabase)

  const [documents, setDocuments] = useState<RulesDocument[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [uploadTitle, setUploadTitle] = useState<string>('')
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null)
  const [uploadStage, setUploadStage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [documentToDelete, setDocumentToDelete] = useState<RulesDocument | null>(null)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)

  const loadDocuments = useCallback(
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
        const list = await getRulesDocuments()
        setDocuments(list)
      } catch (err) {
        const msg = getErrorMessage(err, 'Failed to load auction rules documents')
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
    void loadDocuments()
  }, [loadDocuments])

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

  const handleUploadRules = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canWrite || !supabase) {
      showToast(
        isDemoMode
          ? 'Rules documents cannot be uploaded in demo mode.'
          : 'Admin permissions required.',
        'error'
      )
      return
    }

    const trimmedTitle = uploadTitle.trim()
    if (!trimmedTitle) {
      showToast('Please enter a rules document title.', 'error')
      return
    }

    if (!selectedPdf) {
      showToast('Please choose a PDF file to upload.', 'error')
      return
    }

    try {
      setIsUploading(true)
      setUploadStage('Uploading PDF to storage...')
      const inserted = await uploadRulesPdf(selectedPdf, trimmedTitle)

      setDocuments((prev) => [inserted, ...prev])
      setUploadTitle('')
      clearSelectedFile()
      showToast('Auction rules uploaded', 'success')
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to upload auction rules'), 'error')
    } finally {
      setIsUploading(false)
      setUploadStage(null)
    }
  }

  const handleConfirmDelete = async () => {
    if (!documentToDelete || !canWrite || !supabase) return

    try {
      setIsDeleting(true)
      await deleteRulesDocument(documentToDelete)
      setDocuments((prev) => prev.filter((d) => d.id !== documentToDelete.id))
      setDocumentToDelete(null)
      showToast('Auction rules document deleted', 'success')
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete rules document'), 'error')
    } finally {
      setIsDeleting(false)
    }
  }

  if (loadError) {
    return (
      <ErrorState
        title="Failed to load rules documents"
        message={loadError}
        onRetry={() => loadDocuments()}
      />
    )
  }

  return (
    <section className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6">
      {/* Card Header */}
      <div className="flex items-center justify-between gap-3 pb-5 border-b border-border">
        <h2 className="font-syne font-bold text-xl text-text tracking-tight">Auction Rules</h2>
        <span className="font-mono text-xs text-muted tabular-nums">
          {documents.length} {documents.length === 1 ? 'file' : 'files'}
        </span>
      </div>

      {/* Section 1: Upload PDF */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text">Upload PDF</h3>

        <form onSubmit={handleUploadRules} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="rules-title-input"
                className="block text-xs font-medium text-muted mb-1.5"
              >
                Title
              </label>
              <input
                id="rules-title-input"
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Season 2026 Official Auction Rules"
                disabled={!canWrite || isUploading}
                required
                className="w-full min-h-[42px] bg-bg border border-border rounded-2xl px-4 py-2 text-sm text-text focus:outline-none focus:border-accent-bright disabled:opacity-50"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="rules-pdf-input"
                  className="text-xs font-medium text-muted"
                >
                  PDF file
                </label>
                <span className="font-mono text-xs text-muted">Max 20 MB</span>
              </div>
              <div className="flex items-center gap-2.5 min-h-[42px]">
                <input
                  ref={fileInputRef}
                  id="rules-pdf-input"
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
                  className="rounded-full shrink-0"
                >
                  Choose PDF
                </Button>
                {selectedPdf ? (
                  <div className="flex items-center gap-2 min-w-0 flex-1 bg-bg border border-border rounded-full px-3.5 py-2 text-xs text-text">
                    <span className="truncate flex-1">{selectedPdf.name}</span>
                    <span className="font-mono text-muted shrink-0 tabular-nums">
                      {(selectedPdf.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      disabled={isUploading}
                      aria-label="Clear selected PDF"
                      className="text-muted hover:text-text transition-colors cursor-pointer"
                    >
                      <X size={14} weight="regular" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted truncate">No file chosen</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-mono text-muted">{uploadStage || ''}</div>
            <Button
              type="submit"
              variant="primary"
              size="md"
              leftIcon={UploadSimple}
              isLoading={isUploading}
              disabled={!canWrite || isUploading || !uploadTitle.trim() || !selectedPdf}
              className="rounded-full px-5"
            >
              {isUploading ? 'Uploading...' : 'Upload rules PDF'}
            </Button>
          </div>
        </form>
      </div>

      {/* Section 2: Uploaded List */}
      <div className="pt-6 border-t border-border space-y-3.5">
        <h3 className="text-sm font-medium text-text">Uploaded documents</h3>

        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-14 bg-bg border border-border rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            title="No rules documents uploaded"
            description="Upload a PDF above to publish it."
          />
        ) : (
          <div className="bg-bg border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {documents.map((item) => {
              const publicUrl = getRulesPublicUrl(item.file_path)
              return (
                <div
                  key={item.id}
                  className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-2/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text break-words">
                      {item.title}
                    </div>
                    <div className="mt-0.5 text-xs text-muted tabular-nums">
                      {formatRulesDate(item.created_at)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <a
                      href={publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 min-h-[34px] px-3.5 py-1.5 rounded-full bg-surface border border-border text-xs font-medium text-text hover:bg-surface-2 transition-colors"
                    >
                      <ArrowSquareOut size={14} weight="regular" />
                      <span>Open</span>
                    </a>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      leftIcon={Trash}
                      disabled={!canWrite}
                      onClick={() => setDocumentToDelete(item)}
                      className="rounded-full"
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
        isOpen={Boolean(documentToDelete)}
        onClose={() => {
          if (!isDeleting) {
            setDocumentToDelete(null)
          }
        }}
        title="Delete Rules Document"
        size="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-error/10 border border-error/30 flex items-start gap-3 text-xs text-text">
            <WarningCircle size={18} weight="regular" className="text-error shrink-0 mt-0.5" />
            <div>
              Delete <span className="font-semibold">{documentToDelete?.title}</span>? The PDF file will be permanently removed from storage.
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isDeleting}
              onClick={() => setDocumentToDelete(null)}
              className="rounded-full"
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
              className="rounded-full px-4"
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  )
}
