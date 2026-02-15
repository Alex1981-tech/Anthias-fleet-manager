import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaTrash,
  FaPen,
  FaImage,
  FaVideo,
  FaGlobe,
  FaFile,
  FaCheck,
  FaTimes,
  FaCloudUploadAlt,
  FaPhotoVideo,
  FaPlus,
  FaExternalLinkAlt,
  FaExpand,
  FaPlay,
  FaSpinner,
  FaExclamationTriangle,
  FaFolder,
  FaFolderOpen,
  FaFolderPlus,
  FaClock,
  FaTh,
  FaList,
} from 'react-icons/fa'
import Swal from 'sweetalert2'
import { media as mediaApi, folders as foldersApi, playbackLog, cctv as cctvApi } from '@/services/api'
import { CctvFormContent } from '@/components/cctv/cctv-form-modal'
import CctvFormModal from '@/components/cctv/cctv-form-modal'
import type { MediaFile, MediaFolder, CctvConfig } from '@/types'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']

function isImageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext))
  } catch {
    return false
  }
}

function formatPlaybackDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return `${s}s`
}

function FileTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'image':
      return <FaImage />
    case 'video':
      return <FaVideo />
    case 'web':
      return <FaGlobe />
    case 'cctv':
      return <FaVideo />
    default:
      return <FaFile />
  }
}

function FilePreview({ file }: { file: MediaFile }) {
  const thumbUrl = file.thumbnail_file_url
  const thumbStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16/9',
    objectFit: 'cover',
    borderRadius: '6px 6px 0 0',
    display: 'block',
  }
  if (file.file_type === 'cctv') {
    return (
      <div style={{ position: 'relative' }}>
        {thumbUrl ? (
          <img src={thumbUrl} alt={file.name} style={thumbStyle} />
        ) : (
          <div
            className="d-flex flex-column align-items-center justify-content-center"
            style={{
              width: '100%',
              aspectRatio: '16/9',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              borderRadius: '6px 6px 0 0',
            }}
          >
            <FaVideo style={{ fontSize: '2.5rem', color: '#dc3545', opacity: 0.8 }} />
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            background: 'rgba(220,53,69,0.9)',
            borderRadius: '4px',
            padding: '1px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <FaVideo style={{ color: '#fff', fontSize: '0.55rem' }} />
          <small style={{ color: '#fff', fontSize: '0.6rem', fontWeight: 600 }}>CCTV</small>
        </div>
      </div>
    )
  }
  if (file.file_type === 'image' && file.file) {
    return (
      <img
        src={thumbUrl || file.url}
        alt={file.name}
        style={thumbStyle}
      />
    )
  }
  if (file.file_type === 'video' && file.file) {
    return (
      <div style={{ position: 'relative' }}>
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={file.name}
            style={{ ...thumbStyle, background: '#000' }}
          />
        ) : (
          <video
            src={file.url}
            muted
            loop
            playsInline
            preload="metadata"
            className="video-thumb"
            style={thumbStyle}
          />
        )}
        <div
          className="video-play-icon"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            transition: 'opacity 0.2s',
          }}
        >
          <FaPlay style={{ color: '#fff', fontSize: '0.8rem', marginLeft: '2px' }} />
        </div>
      </div>
    )
  }
  if (file.file_type === 'web' && file.thumbnail_url) {
    return (
      <div style={{ position: 'relative' }}>
        <img
          src={file.thumbnail_url}
          alt={file.name}
          style={thumbStyle}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
            const parent = (e.target as HTMLImageElement).parentElement
            if (parent) parent.classList.add('thumb-fallback')
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '4px',
            background: 'rgba(13,110,253,0.85)',
            borderRadius: '4px',
            padding: '1px 6px',
            fontSize: '0.6rem',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
        >
          <FaGlobe style={{ fontSize: '0.5rem' }} />
          {getDomain(file.source_url || '')}
        </div>
      </div>
    )
  }
  if (file.file_type === 'web' && file.source_url && isImageUrl(file.source_url)) {
    return (
      <img
        src={file.source_url}
        alt={file.name}
        style={thumbStyle}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none'
        }}
      />
    )
  }
  if (file.file_type === 'web') {
    const domain = getDomain(file.source_url || '')
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center"
        style={{
          width: '100%',
          aspectRatio: '16/9',
          background: 'linear-gradient(135deg, #e8f4fd 0%, #d0e8f7 100%)',
          borderRadius: '6px 6px 0 0',
        }}
      >
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          style={{ width: '48px', height: '48px', marginBottom: '6px' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <small
          className="fw-medium text-truncate px-2"
          style={{ fontSize: '0.7rem', color: '#0d6efd', maxWidth: '100%' }}
        >
          {domain}
        </small>
      </div>
    )
  }
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center"
      style={{
        width: '100%',
        aspectRatio: '16/9',
        backgroundColor: 'var(--bs-gray-200)',
        borderRadius: '6px 6px 0 0',
        fontSize: '2.5rem',
        color: 'var(--bs-gray-500)',
      }}
    >
      <FileTypeIcon type={file.file_type} />
    </div>
  )
}

/* ===== Preview Modal ===== */

function PreviewModal({
  file,
  onClose,
}: {
  file: MediaFile | null
  onClose: () => void
}) {
  const { t } = useTranslation()

  if (!file) return null

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className={`modal-dialog modal-dialog-centered ${file.file_type === 'cctv' ? 'modal-xl' : 'modal-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content" style={{ borderRadius: '12px', overflow: 'hidden' }}>
          <div className="modal-header py-2 px-3">
            <h6 className="modal-title d-flex align-items-center gap-2 mb-0">
              <FileTypeIcon type={file.file_type} />
              <span className="text-truncate" style={{ maxWidth: '400px' }}>
                {file.name}
              </span>
            </h6>
            <div className="d-flex align-items-center gap-2">
              {file.source_url && file.file_type !== 'cctv' && (
                <a
                  href={file.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline-primary py-0"
                  title={t('content.openUrl')}
                >
                  <FaExternalLinkAlt style={{ fontSize: '0.7rem' }} />
                </a>
              )}
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
          </div>
          <div
            className="modal-body p-0 d-flex align-items-center justify-content-center"
            style={{ minHeight: '300px', maxHeight: '75vh', backgroundColor: '#1a1a1a' }}
          >
            {file.file_type === 'image' && file.url && (
              <img
                src={file.url}
                alt={file.name}
                style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }}
              />
            )}
            {file.file_type === 'video' && file.url && (
              <video
                src={file.url}
                controls
                autoPlay
                style={{ maxWidth: '100%', maxHeight: '75vh' }}
              />
            )}
            {file.file_type === 'web' && file.source_url && (
              isImageUrl(file.source_url) ? (
                <img
                  src={file.source_url}
                  alt={file.name}
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }}
                />
              ) : (
                <iframe
                  src={file.source_url}
                  title={file.name}
                  style={{
                    width: '100%',
                    height: '75vh',
                    border: 'none',
                    backgroundColor: '#fff',
                  }}
                />
              )
            )}
            {file.file_type === 'cctv' && file.source_url && (
              <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', backgroundColor: '#000' }}>
                <iframe
                  src={file.source_url}
                  title={file.name}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                  allow="autoplay"
                />
              </div>
            )}
            {file.file_type === 'other' && (
              <div className="text-center text-white p-5">
                <FaFile size={64} className="mb-3" style={{ opacity: 0.5 }} />
                <p>{t('content.noPreview')}</p>
                {file.url && (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-light btn-sm"
                  >
                    {t('content.download')}
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="modal-footer py-2 px-3">
            <small className="text-muted me-auto">
              {file.file_size > 0 && formatFileSize(file.file_size)}
              {file.file_size > 0 && ' · '}
              {file.file_type.toUpperCase()}
            </small>
            <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===== Add Content Modal ===== */

function AddContentModal({
  show,
  onClose,
  onUpload,
  onAddUrl,
  onCctvCreated,
}: {
  show: boolean
  onClose: () => void
  onUpload: (files: FileList | null) => void
  onAddUrl: (url: string, name: string) => Promise<void>
  onCctvCreated: () => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'file' | 'url' | 'cctv'>('file')
  const [dragOver, setDragOver] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlName, setUrlName] = useState('')
  const [addingUrl, setAddingUrl] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!show) return null

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!urlValue) return
    setAddingUrl(true)
    try {
      await onAddUrl(urlValue, urlName)
      setUrlValue('')
      setUrlName('')
      onClose()
    } finally {
      setAddingUrl(false)
    }
  }

  const handleCctvSave = async (data: Record<string, any>) => {
    await cctvApi.create(data)
    Swal.fire({
      icon: 'success',
      title: t('common.success'),
      text: t('cctv.streamStarted'),
      timer: 1500,
      showConfirmButton: false,
    })
    onCctvCreated()
    onClose()
  }

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        style={{ maxWidth: '700px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content" style={{ borderRadius: '12px', overflow: 'hidden' }}>
          <div className="modal-header py-2 px-3">
            <h6 className="modal-title mb-0">
              <FaPlus className="me-2" />
              {t('content.add')}
            </h6>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body p-0">
            {/* Tabs */}
            <div className="d-flex border-bottom">
              <button
                className={`btn btn-link flex-fill py-2 text-decoration-none rounded-0 ${activeTab === 'file' ? 'fw-bold border-bottom border-2 border-primary text-primary' : 'text-muted'}`}
                onClick={() => setActiveTab('file')}
              >
                <FaCloudUploadAlt className="me-1" />
                {t('content.tabFile')}
              </button>
              <button
                className={`btn btn-link flex-fill py-2 text-decoration-none rounded-0 ${activeTab === 'url' ? 'fw-bold border-bottom border-2 border-primary text-primary' : 'text-muted'}`}
                onClick={() => setActiveTab('url')}
              >
                <FaGlobe className="me-1" />
                {t('content.tabUrl')}
              </button>
              <button
                className={`btn btn-link flex-fill py-2 text-decoration-none rounded-0 ${activeTab === 'cctv' ? 'fw-bold border-bottom border-2 border-primary text-primary' : 'text-muted'}`}
                onClick={() => setActiveTab('cctv')}
              >
                <FaVideo className="me-1" />
                {t('content.tabCctv')}
              </button>
            </div>

            <div className="p-3" style={{ minHeight: '320px', maxHeight: '65vh', overflowY: 'auto' }}>
              {activeTab === 'file' ? (
                <>
                  <div
                    className={`border border-2 border-dashed rounded p-4 text-center ${dragOver ? 'border-primary bg-light' : 'border-secondary'}`}
                    style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOver(false)
                      onUpload(e.dataTransfer.files)
                      onClose()
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <FaCloudUploadAlt size={32} className="text-muted mb-2" />
                    <p className="mb-1 fw-medium">
                      {dragOver ? t('content.dropzoneActive') : t('content.dropzone')}
                    </p>
                    <small className="text-muted">{t('content.supportedFormats')}</small>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      onUpload(e.target.files)
                      onClose()
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                  />
                </>
              ) : activeTab === 'url' ? (
                <form onSubmit={handleUrlSubmit}>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">{t('content.urlLabel')}</label>
                    <input
                      type="url"
                      className="form-control"
                      value={urlValue}
                      onChange={(e) => setUrlValue(e.target.value)}
                      placeholder="https://example.com"
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label fw-semibold">{t('content.nameLabel')}</label>
                    <input
                      type="text"
                      className="form-control"
                      value={urlName}
                      onChange={(e) => setUrlName(e.target.value)}
                      placeholder={t('content.namePlaceholder')}
                    />
                  </div>
                  <button
                    type="submit"
                    className="fm-btn-primary w-100"
                    disabled={addingUrl || !urlValue}
                  >
                    <FaPlus />
                    {addingUrl ? t('common.loading') : t('content.addUrl')}
                  </button>
                </form>
              ) : (
                <CctvFormContent
                  onSave={handleCctvSave}
                  submitLabel={t('content.addCctv')}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===== Content Page ===== */

type FilterType = 'all' | 'video' | 'image' | 'web' | 'cctv'

const ContentPage: React.FC = () => {
  const { t } = useTranslation()

  const [files, setFiles] = useState<MediaFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [previewFile, setPreviewFile] = useState<MediaFile | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // CCTV edit modal
  const [editCctvConfig, setEditCctvConfig] = useState<CctvConfig | null>(null)
  const [showCctvEditModal, setShowCctvEditModal] = useState(false)

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('content-view-mode')
    return saved === 'list' ? 'list' : 'grid'
  })
  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    localStorage.setItem('content-view-mode', mode)
  }

  // Filters
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  // Folders
  const [folders, setFolders] = useState<MediaFolder[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null = all, 'none' = no folder, uuid = specific
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Playback stats
  const [playbackStats, setPlaybackStats] = useState<Record<string, number>>({})

  const loadFiles = useCallback(async () => {
    try {
      const data = await mediaApi.list()
      setFiles(data)
    } catch {
      // silently fail
    } finally {
      setLoadingFiles(false)
    }
  }, [])

  const loadFolders = useCallback(async () => {
    try {
      const data = await foldersApi.list()
      setFolders(data)
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    loadFiles()
    loadFolders()
    playbackLog.stats().then((r) => setPlaybackStats(r.stats)).catch(() => {})
  }, [loadFiles, loadFolders])

  // Auto-refresh while any file is processing
  useEffect(() => {
    const hasProcessing = files.some((f) => f.processing_status === 'processing')
    if (!hasProcessing) return
    const interval = setInterval(() => loadFiles(), 3000)
    return () => clearInterval(interval)
  }, [files, loadFiles])

  // Close modals on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewFile) setPreviewFile(null)
        if (showAddModal) setShowAddModal(false)
        if (showCctvEditModal) setShowCctvEditModal(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewFile, showAddModal])

  // --- Upload handler ---
  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      setUploadProgress(0)
      try {
        await mediaApi.upload(file, file.name, (pct) => setUploadProgress(pct))
        Swal.fire({
          icon: 'success',
          title: t('common.success'),
          text: t('content.fileUploaded'),
          timer: 1500,
          showConfirmButton: false,
        })
      } catch (err) {
        const msg = String(err)
        if (msg.toLowerCase().includes('already exists')) {
          Swal.fire({
            icon: 'info',
            title: t('content.duplicateTitle'),
            text: t('content.duplicateText', { name: file.name }),
            timer: 3000,
            showConfirmButton: false,
          })
        } else {
          Swal.fire({ icon: 'error', title: t('common.error'), text: msg })
        }
      } finally {
        setUploadProgress(null)
      }
    }
    loadFiles()
    loadFolders()
  }

  // --- Add URL handler ---
  const handleAddUrl = async (url: string, name: string) => {
    try {
      await mediaApi.addUrl(url, name || undefined)
      loadFiles()
      Swal.fire({
        icon: 'success',
        title: t('common.success'),
        text: t('content.urlAdded'),
        timer: 1500,
        showConfirmButton: false,
      })
    } catch (err) {
      const msg = String(err)
      if (msg.toLowerCase().includes('already exists')) {
        Swal.fire({
          icon: 'info',
          title: t('content.duplicateTitle'),
          text: t('content.duplicateText', { name: name || url }),
          timer: 3000,
          showConfirmButton: false,
        })
      } else {
        Swal.fire({ icon: 'error', title: t('common.error'), text: msg })
      }
      throw err
    }
  }

  // --- Rename / Delete ---
  const handleRenameStart = (e: React.MouseEvent, file: MediaFile) => {
    e.stopPropagation()
    setEditingId(file.id)
    setEditName(file.name)
  }

  const handleRenameSave = async (id: string) => {
    try {
      await mediaApi.rename(id, editName)
      setEditingId(null)
      loadFiles()
    } catch (err) {
      Swal.fire({ icon: 'error', title: t('common.error'), text: String(err) })
    }
  }

  const handleDelete = async (e: React.MouseEvent, file: MediaFile) => {
    e.stopPropagation()
    const result = await Swal.fire({
      icon: 'warning',
      title: t('common.confirm'),
      text: t('content.confirmDelete'),
      showCancelButton: true,
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      confirmButtonColor: '#dc3545',
    })
    if (result.isConfirmed) {
      try {
        await mediaApi.delete(file.id)
        loadFiles()
        loadFolders()
        Swal.fire({
          icon: 'success',
          title: t('content.deleted'),
          timer: 1200,
          showConfirmButton: false,
        })
      } catch (err) {
        Swal.fire({ icon: 'error', title: t('common.error'), text: String(err) })
      }
    }
  }

  // --- Folder operations ---
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      await foldersApi.create(newFolderName.trim())
      setNewFolderName('')
      setShowNewFolder(false)
      loadFolders()
      Swal.fire({ icon: 'success', title: t('content.folderCreated'), timer: 1200, showConfirmButton: false })
    } catch (err) {
      Swal.fire({ icon: 'error', title: t('common.error'), text: String(err) })
    }
  }

  const handleDeleteFolder = async (e: React.MouseEvent, folder: MediaFolder) => {
    e.stopPropagation()
    const result = await Swal.fire({
      icon: 'warning',
      title: t('common.confirm'),
      text: t('content.confirmDeleteFolder'),
      showCancelButton: true,
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
      confirmButtonColor: '#dc3545',
    })
    if (result.isConfirmed) {
      try {
        await foldersApi.delete(folder.id)
        if (activeFolder === folder.id) setActiveFolder(null)
        loadFolders()
        loadFiles()
        Swal.fire({ icon: 'success', title: t('content.folderDeleted'), timer: 1200, showConfirmButton: false })
      } catch (err) {
        Swal.fire({ icon: 'error', title: t('common.error'), text: String(err) })
      }
    }
  }

  const handleMoveToFolder = async (fileId: string, folderId: string | null) => {
    try {
      await mediaApi.moveToFolder(fileId, folderId)
      loadFiles()
      loadFolders()
    } catch (err) {
      Swal.fire({ icon: 'error', title: t('common.error'), text: String(err) })
    }
  }

  // --- CCTV edit handler ---
  const handleCctvEdit = async (file: MediaFile) => {
    if (!file.cctv_config) {
      // Fetch config from cctv API using media_file's source_url
      try {
        const configs = await cctvApi.list()
        const config = configs.find((c) => c.media_file_id === file.id)
        if (config) {
          setEditCctvConfig(config)
          setShowCctvEditModal(true)
        }
      } catch {
        Swal.fire({ icon: 'error', title: t('common.error'), text: 'Failed to load CCTV config' })
      }
    } else {
      setEditCctvConfig(file.cctv_config)
      setShowCctvEditModal(true)
    }
  }

  const handleCctvSave = async (data: Record<string, any>) => {
    if (!editCctvConfig) return
    try {
      await cctvApi.update(editCctvConfig.id, data)
      setShowCctvEditModal(false)
      setEditCctvConfig(null)
      loadFiles()
      Swal.fire({ icon: 'success', title: t('common.success'), timer: 1200, showConfirmButton: false })
    } catch (err) {
      Swal.fire({ icon: 'error', title: t('common.error'), text: String(err) })
    }
  }

  // --- Filtering ---
  const filteredFiles = files.filter((f) => {
    if (activeFilter !== 'all' && f.file_type !== activeFilter) return false
    if (activeFolder === 'none' && f.folder !== null) return false
    if (activeFolder && activeFolder !== 'none' && f.folder !== activeFolder) return false
    return true
  })

  const filterButtons: { key: FilterType; icon: React.ReactNode; label: string }[] = [
    { key: 'all', icon: null, label: t('content.filterAll') },
    { key: 'video', icon: <FaVideo />, label: t('content.filterVideo') },
    { key: 'image', icon: <FaImage />, label: t('content.filterImage') },
    { key: 'web', icon: <FaGlobe />, label: t('content.filterWeb') },
    { key: 'cctv', icon: <FaVideo />, label: 'CCTV' },
  ]

  return (
    <div>
      {/* Page header */}
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaPhotoVideo className="page-icon" />
            {t('content.title')}
          </h1>
        </div>
        <button className="fm-btn-primary" onClick={() => setShowAddModal(true)}>
          <FaPlus />
          {t('content.add')}
        </button>
      </div>

      {/* Upload progress bar */}
      {uploadProgress !== null && (
        <div className="mb-3">
          <div className="d-flex justify-content-between mb-1">
            <small>{t('content.uploading')}</small>
            <small>{uploadProgress}%</small>
          </div>
          <div className="progress" style={{ height: '6px' }}>
            <div className="progress-bar" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Content Library */}
      <div className="fm-card fm-card-accent">
        <div className="fm-card-header">
          <h5 className="card-title">
            {t('content.library')}
            <span className="badge bg-secondary ms-2" style={{ fontSize: '0.7rem' }}>
              {files.length}
            </span>
          </h5>
        </div>
        <div className="fm-card-body">
          {/* Type filters + view toggle */}
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            {filterButtons.map((fb) => (
              <button
                key={fb.key}
                className={`btn btn-sm ${activeFilter === fb.key ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ borderRadius: '20px', fontSize: '0.78rem', padding: '3px 12px' }}
                onClick={() => setActiveFilter(fb.key)}
              >
                {fb.icon && <span className="me-1">{fb.icon}</span>}
                {fb.label}
              </button>
            ))}
            {activeFolder && (
              <button
                className="btn btn-sm btn-outline-secondary"
                style={{ borderRadius: '20px', fontSize: '0.78rem', padding: '3px 12px' }}
                onClick={() => setActiveFolder(null)}
              >
                <FaTimes className="me-1" style={{ fontSize: '0.6rem' }} />
                {activeFolder === 'none' ? t('content.noFolder') : folders.find(f => f.id === activeFolder)?.name}
              </button>
            )}
            {activeFolder && activeFolder !== 'none' && (
              <button
                className="btn btn-sm btn-outline-danger"
                style={{ borderRadius: '20px', fontSize: '0.78rem', padding: '3px 12px' }}
                onClick={(e) => {
                  const folder = folders.find(f => f.id === activeFolder)
                  if (folder) handleDeleteFolder(e, folder)
                }}
              >
                <FaTrash className="me-1" style={{ fontSize: '0.6rem' }} />
                {t('content.deleteFolder')}
              </button>
            )}
            {/* View mode toggle */}
            <div className="btn-group ms-auto" role="group">
              <button
                className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => handleViewMode('grid')}
                title={t('content.viewGrid')}
                style={{ padding: '3px 8px' }}
              >
                <FaTh style={{ fontSize: '0.8rem' }} />
              </button>
              <button
                className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => handleViewMode('list')}
                title={t('content.viewList')}
                style={{ padding: '3px 8px' }}
              >
                <FaList style={{ fontSize: '0.8rem' }} />
              </button>
            </div>
          </div>

          {/* Folders grid — Windows-style icons */}
          <div className="mb-3">
              <div className="d-flex flex-wrap gap-3 align-items-start">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="text-center"
                    style={{
                      width: '96px',
                      cursor: 'pointer',
                      padding: '8px 4px',
                      borderRadius: '8px',
                      border: activeFolder === folder.id ? '2px solid var(--bs-primary)' : '2px solid transparent',
                      background: activeFolder === folder.id ? 'var(--bs-primary-bg-subtle)' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => setActiveFolder(activeFolder === folder.id ? null : folder.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      handleDeleteFolder(e as any, folder)
                    }}
                    title={`${folder.name} (${folder.file_count})`}
                  >
                    {activeFolder === folder.id ? (
                      <FaFolderOpen style={{ fontSize: '2.4rem', color: '#ffc107' }} />
                    ) : (
                      <FaFolder style={{ fontSize: '2.4rem', color: '#ffc107' }} />
                    )}
                    <div
                      className="mt-1"
                      style={{ fontSize: '0.75rem', lineHeight: '1.2', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {folder.name}
                    </div>
                    <small className="text-muted" style={{ fontSize: '0.62rem' }}>{folder.file_count}</small>
                  </div>
                ))}

                {/* Create new folder */}
                {showNewFolder ? (
                  <div className="text-center" style={{ width: '130px', padding: '8px 4px' }}>
                    <FaFolderPlus style={{ fontSize: '2.4rem', color: 'var(--bs-secondary)' }} />
                    <div className="mt-1 d-flex gap-1 align-items-center">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                        placeholder={t('content.folderName')}
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateFolder()
                          if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') }
                        }}
                        autoFocus
                      />
                    </div>
                    <div className="d-flex gap-1 justify-content-center mt-1">
                      <button className="btn btn-sm btn-primary py-0 px-2" onClick={handleCreateFolder}>
                        <FaCheck style={{ fontSize: '0.6rem' }} />
                      </button>
                      <button className="btn btn-sm btn-secondary py-0 px-2" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>
                        <FaTimes style={{ fontSize: '0.6rem' }} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="text-center"
                    style={{
                      width: '96px',
                      cursor: 'pointer',
                      padding: '8px 4px',
                      borderRadius: '8px',
                      border: '2px dashed var(--bs-border-color)',
                      opacity: 0.5,
                      transition: 'all 0.15s',
                    }}
                    onClick={() => setShowNewFolder(true)}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
                  >
                    <FaFolderPlus style={{ fontSize: '2.4rem', color: 'var(--bs-secondary)' }} />
                    <div className="mt-1" style={{ fontSize: '0.72rem', lineHeight: '1.2', color: 'var(--bs-secondary-color)' }}>
                      {t('content.createFolder')}
                    </div>
                  </div>
                )}
              </div>
              {folders.length > 0 && <hr className="my-3" />}
            </div>

          {/* File grid / list */}
          {loadingFiles ? (
            <p className="text-muted text-center">{t('common.loading')}</p>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-4">
              <FaPhotoVideo size={48} className="text-muted mb-3" style={{ display: 'block', margin: '0 auto' }} />
              <p className="text-muted mb-0">{files.length === 0 ? t('content.empty') : t('common.noResults')}</p>
              {files.length === 0 && <small className="text-muted">{t('content.emptyHint')}</small>}
            </div>
          ) : viewMode === 'list' ? (
            /* ===== LIST VIEW ===== */
            <div className="table-responsive">
              <table className="fm-table table table-hover mb-0" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '72px' }} />
                  <col />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '100px' }} />
                  {folders.length > 0 && <col style={{ width: '130px' }} />}
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '110px' }} />
                </colgroup>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr key={file.id}>
                      {/* Thumbnail */}
                      <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                        {file.processing_status === 'processing' ? (
                          <div
                            style={{
                              width: '64px',
                              aspectRatio: '16/9',
                              background: 'var(--bs-gray-200)',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <FaSpinner style={{ fontSize: '1rem', animation: 'fm-spin 1s linear infinite', color: 'var(--bs-gray-500)' }} />
                          </div>
                        ) : file.file_type === 'image' && file.file ? (
                          <img
                            src={file.thumbnail_file_url || file.url}
                            alt={file.name}
                            style={{ width: '64px', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '4px', display: 'block', cursor: 'pointer' }}
                            onClick={() => setPreviewFile(file)}
                          />
                        ) : file.file_type === 'video' && file.file ? (
                          file.thumbnail_file_url ? (
                            <img
                              src={file.thumbnail_file_url}
                              alt={file.name}
                              style={{ width: '64px', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '4px', display: 'block', background: '#000', cursor: 'pointer' }}
                              onClick={() => setPreviewFile(file)}
                            />
                          ) : (
                            <video
                              src={file.url}
                              muted
                              preload="metadata"
                              style={{ width: '64px', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '4px', display: 'block', cursor: 'pointer' }}
                              onClick={() => setPreviewFile(file)}
                            />
                          )
                        ) : file.file_type === 'web' && file.source_url && (file.thumbnail_url || isImageUrl(file.source_url)) ? (
                          <img
                            src={file.thumbnail_url || file.source_url}
                            alt={file.name}
                            style={{ width: '64px', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '4px', display: 'block', cursor: 'pointer' }}
                            onClick={() => setPreviewFile(file)}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : file.file_type === 'web' ? (
                          <div
                            style={{
                              width: '64px',
                              aspectRatio: '16/9',
                              background: 'linear-gradient(135deg, #e8f4fd 0%, #d0e8f7 100%)',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                            onClick={() => setPreviewFile(file)}
                          >
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${getDomain(file.source_url || '')}&sz=32`}
                              alt=""
                              style={{ width: '24px', height: '24px' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          </div>
                        ) : file.file_type === 'cctv' ? (
                          file.thumbnail_file_url ? (
                            <img
                              src={file.thumbnail_file_url}
                              alt={file.name}
                              style={{ width: '64px', aspectRatio: '16/9', objectFit: 'cover', borderRadius: '4px', display: 'block', cursor: 'pointer' }}
                              onClick={() => handleCctvEdit(file)}
                            />
                          ) : (
                            <div
                              style={{
                                width: '64px',
                                aspectRatio: '16/9',
                                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                              onClick={() => handleCctvEdit(file)}
                            >
                              <FaVideo style={{ fontSize: '1rem', color: '#dc3545' }} />
                            </div>
                          )
                        ) : (
                          <div
                            style={{
                              width: '64px',
                              aspectRatio: '16/9',
                              backgroundColor: 'var(--bs-gray-200)',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '1.2rem',
                              color: 'var(--bs-gray-500)',
                              cursor: 'pointer',
                            }}
                            onClick={() => setPreviewFile(file)}
                          >
                            <FileTypeIcon type={file.file_type} />
                          </div>
                        )}
                      </td>
                      {/* Name */}
                      <td style={{ padding: '4px 6px', verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {editingId === file.id ? (
                          <div className="d-flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSave(file.id)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              autoFocus
                            />
                            <button className="btn btn-sm btn-success py-0" onClick={() => handleRenameSave(file.id)}>
                              <FaCheck style={{ fontSize: '0.65rem' }} />
                            </button>
                            <button className="btn btn-sm btn-secondary py-0" onClick={() => setEditingId(null)}>
                              <FaTimes style={{ fontSize: '0.65rem' }} />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div
                              className="fw-medium text-truncate"
                              style={{ fontSize: '0.8rem', cursor: 'pointer' }}
                              title={file.name}
                              onClick={() => { if (file.processing_status !== 'processing') setPreviewFile(file) }}
                            >
                              {file.name}
                            </div>
                            {file.processing_status === 'failed' && (
                              <small className="text-danger d-flex align-items-center gap-1" style={{ fontSize: '0.65rem' }}>
                                <FaExclamationTriangle /> {t('content.conversionFailed')}
                              </small>
                            )}
                          </div>
                        )}
                      </td>
                      {/* Type */}
                      <td style={{ padding: '4px 6px', verticalAlign: 'middle', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span className="d-inline-flex align-items-center gap-1">
                          <FileTypeIcon type={file.file_type} />
                          {file.file_type.charAt(0).toUpperCase() + file.file_type.slice(1)}
                        </span>
                      </td>
                      {/* Size */}
                      <td className="text-muted" style={{ padding: '4px 6px', verticalAlign: 'middle', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.file_size > 0 ? formatFileSize(file.file_size) : '—'}
                      </td>
                      {/* Folder */}
                      {folders.length > 0 && (
                        <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                          <select
                            className="form-select form-select-sm"
                            style={{ fontSize: '0.7rem', padding: '2px 24px 2px 6px', borderRadius: '4px', color: file.folder ? 'var(--bs-body-color)' : 'var(--bs-secondary)' }}
                            value={file.folder || ''}
                            onChange={(e) => handleMoveToFolder(file.id, e.target.value || null)}
                          >
                            <option value="">{t('content.noFolder')}</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      {/* Playback duration */}
                      <td className="text-muted" style={{ padding: '4px 6px', verticalAlign: 'middle', fontSize: '0.75rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {playbackStats[file.name] > 0 && (
                          <span className="d-inline-flex align-items-center gap-1 text-info">
                            <FaClock />
                            {formatPlaybackDuration(playbackStats[file.name])}
                          </span>
                        )}
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                        <div className="d-flex align-items-center justify-content-end gap-1">
                          {file.source_url ? (
                            <a
                              href={file.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-sm btn-outline-primary py-0 px-1"
                              title={t('content.openUrl')}
                            >
                              <FaExternalLinkAlt style={{ fontSize: '0.65rem' }} />
                            </a>
                          ) : (
                            <span style={{ width: '26px' }} />
                          )}
                          {file.file_type === 'cctv' ? (
                            <button
                              className="btn btn-sm btn-outline-secondary py-0 px-1"
                              title={t('common.edit')}
                              onClick={(e) => { e.stopPropagation(); handleCctvEdit(file) }}
                            >
                              <FaPen style={{ fontSize: '0.65rem' }} />
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-outline-secondary py-0 px-1"
                              title={t('content.rename')}
                              onClick={(e) => handleRenameStart(e, file)}
                            >
                              <FaPen style={{ fontSize: '0.65rem' }} />
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-outline-danger py-0 px-1"
                            title={t('common.delete')}
                            onClick={(e) => handleDelete(e, file)}
                          >
                            <FaTrash style={{ fontSize: '0.65rem' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* ===== GRID VIEW ===== */
            <div className="row g-3">
              {filteredFiles.map((file) => (
                <div key={file.id} className="col-6 col-md-4 col-lg-3">
                  <div
                    className="card h-100"
                    style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                    onClick={() => {
                      if (editingId !== file.id && file.processing_status !== 'processing') setPreviewFile(file)
                    }}
                    onMouseEnter={(e) => {
                      const card = e.currentTarget
                      card.style.transform = 'translateY(-2px)'
                      card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                      const video = card.querySelector<HTMLVideoElement>('.video-thumb')
                      if (video) {
                        video.play().catch(() => {})
                        const playIcon = card.querySelector<HTMLElement>('.video-play-icon')
                        if (playIcon) playIcon.style.opacity = '0'
                      }
                      const overlay = card.querySelector<HTMLElement>('.preview-overlay')
                      if (overlay) overlay.style.opacity = '1'
                    }}
                    onMouseLeave={(e) => {
                      const card = e.currentTarget
                      card.style.transform = ''
                      card.style.boxShadow = ''
                      const video = card.querySelector<HTMLVideoElement>('.video-thumb')
                      if (video) {
                        video.pause()
                        video.currentTime = 0
                        const playIcon = card.querySelector<HTMLElement>('.video-play-icon')
                        if (playIcon) playIcon.style.opacity = '1'
                      }
                      const overlay = card.querySelector<HTMLElement>('.preview-overlay')
                      if (overlay) overlay.style.opacity = '0'
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      <FilePreview file={file} />
                      <div
                        className="preview-overlay"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: '6px 6px 0 0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: 0,
                          transition: 'opacity 0.2s',
                          pointerEvents: 'none',
                        }}
                      >
                        <FaExpand style={{ color: '#fff', fontSize: '1.5rem' }} />
                      </div>
                      {file.processing_status === 'processing' && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0,0,0,0.6)',
                            borderRadius: '6px 6px 0 0',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            zIndex: 2,
                          }}
                        >
                          <FaSpinner
                            style={{ color: '#fff', fontSize: '1.5rem', animation: 'fm-spin 1s linear infinite' }}
                          />
                          <small style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 500 }}>
                            {t('content.converting')}
                          </small>
                        </div>
                      )}
                      {file.processing_status === 'failed' && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            background: '#dc3545',
                            borderRadius: '4px',
                            padding: '2px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            zIndex: 2,
                          }}
                        >
                          <FaExclamationTriangle style={{ color: '#fff', fontSize: '0.65rem' }} />
                          <small style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 500 }}>
                            {t('content.conversionFailed')}
                          </small>
                        </div>
                      )}
                      {/* Folder badge on thumbnail */}
                      {file.folder_name && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '6px',
                            left: '6px',
                            background: 'rgba(0,0,0,0.6)',
                            borderRadius: '4px',
                            padding: '1px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            zIndex: 1,
                          }}
                        >
                          <FaFolder style={{ color: '#ffc107', fontSize: '0.55rem' }} />
                          <small style={{ color: '#fff', fontSize: '0.6rem' }}>{file.folder_name}</small>
                        </div>
                      )}
                    </div>
                    <div className="card-body p-2">
                      {editingId === file.id ? (
                        <div className="d-flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSave(file.id)
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                            autoFocus
                          />
                          <button className="btn btn-sm btn-success" onClick={() => handleRenameSave(file.id)}>
                            <FaCheck />
                          </button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setEditingId(null)}>
                            <FaTimes />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="fw-medium text-truncate"
                          style={{ fontSize: '0.8rem' }}
                          title={file.name}
                        >
                          {file.name}
                        </div>
                      )}
                      <div className="d-flex align-items-center gap-1 mt-1" style={{ fontSize: '0.7rem' }}>
                        <FileTypeIcon type={file.file_type} />
                        {file.file_type === 'cctv' ? (
                          <span className="text-danger fw-semibold">CCTV</span>
                        ) : file.file_size > 0 ? (
                          <span className="text-muted">{formatFileSize(file.file_size)}</span>
                        ) : file.source_url ? (
                          <span className="text-muted">{getDomain(file.source_url)}</span>
                        ) : (
                          <span className="text-muted">{file.file_type.toUpperCase()}</span>
                        )}
                      </div>
                      {/* Folder select */}
                      {folders.length > 0 && (
                        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="form-select form-select-sm"
                            style={{ fontSize: '0.7rem', padding: '2px 24px 2px 6px', borderRadius: '4px', color: file.folder ? 'var(--bs-body-color)' : 'var(--bs-secondary)' }}
                            value={file.folder || ''}
                            onChange={(e) => handleMoveToFolder(file.id, e.target.value || null)}
                          >
                            <option value="">{t('content.noFolder')}</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="d-flex align-items-center gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                        {file.source_url && file.file_type !== 'cctv' && (
                          <a
                            href={file.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline-primary py-0 px-1"
                            title={t('content.openUrl')}
                          >
                            <FaExternalLinkAlt style={{ fontSize: '0.65rem' }} />
                          </a>
                        )}
                        {file.file_type === 'cctv' ? (
                          <button
                            className="btn btn-sm btn-outline-secondary py-0 px-1"
                            title={t('common.edit')}
                            onClick={(e) => { e.stopPropagation(); handleCctvEdit(file) }}
                          >
                            <FaPen style={{ fontSize: '0.65rem' }} />
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline-secondary py-0 px-1"
                            title={t('content.rename')}
                            onClick={(e) => handleRenameStart(e, file)}
                          >
                            <FaPen style={{ fontSize: '0.65rem' }} />
                          </button>
                        )}
                        <button
                          className="btn btn-sm btn-outline-danger py-0 px-1"
                          title={t('common.delete')}
                          onClick={(e) => handleDelete(e, file)}
                        >
                          <FaTrash style={{ fontSize: '0.65rem' }} />
                        </button>
                        {playbackStats[file.name] > 0 && (
                          <span className="ms-auto d-flex align-items-center gap-1 text-info" style={{ fontSize: '0.8rem' }} title={t('content.totalPlayTime')}>
                            <FaClock />
                            {formatPlaybackDuration(playbackStats[file.name])}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />

      {/* Add Content Modal */}
      <AddContentModal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        onUpload={handleUpload}
        onAddUrl={handleAddUrl}
        onCctvCreated={() => { loadFiles(); loadFolders() }}
      />

      {/* CCTV Edit Modal */}
      <CctvFormModal
        show={showCctvEditModal}
        onClose={() => { setShowCctvEditModal(false); setEditCctvConfig(null) }}
        onSave={handleCctvSave}
        config={editCctvConfig}
      />
    </div>
  )
}

export default ContentPage
