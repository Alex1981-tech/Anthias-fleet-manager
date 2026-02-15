import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FaPlus, FaTimes, FaGripVertical } from 'react-icons/fa'
import type { CctvConfig } from '@/types'

interface CameraField {
  name: string
  rtsp_url: string
}

/* ===== Reusable form content (no modal shell) ===== */

interface CctvFormContentProps {
  config?: CctvConfig | null
  onSave: (data: Record<string, any>) => Promise<void>
  saving?: boolean
  submitLabel?: string
}

export const CctvFormContent: React.FC<CctvFormContentProps> = ({
  config,
  onSave,
  saving: externalSaving,
  submitLabel,
}) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [displayMode, setDisplayMode] = useState<'mosaic' | 'rotation'>('mosaic')
  const [rotationInterval, setRotationInterval] = useState(10)
  const [resolution, setResolution] = useState('1920x1080')
  const [fps, setFps] = useState(15)
  const [cameras, setCameras] = useState<CameraField[]>([{ name: '', rtsp_url: '' }])
  const [saving, setSaving] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  useEffect(() => {
    if (config) {
      setName(config.name)
      setDisplayMode(config.display_mode)
      setRotationInterval(config.rotation_interval)
      setResolution(config.resolution)
      setFps(config.fps)
      setCameras(
        config.cameras.length > 0
          ? config.cameras.map((c) => ({ name: c.name, rtsp_url: c.rtsp_url }))
          : [{ name: '', rtsp_url: '' }],
      )
    } else {
      setName('')
      setDisplayMode('mosaic')
      setRotationInterval(10)
      setResolution('1920x1080')
      setFps(15)
      setCameras([{ name: '', rtsp_url: '' }])
    }
  }, [config])

  const addCamera = () => {
    setCameras([...cameras, { name: '', rtsp_url: '' }])
  }

  const removeCamera = (index: number) => {
    if (cameras.length <= 1) return
    setCameras(cameras.filter((_, i) => i !== index))
  }

  const updateCamera = (index: number, field: keyof CameraField, value: string) => {
    const updated = [...cameras]
    updated[index] = { ...updated[index], [field]: value }
    setCameras(updated)
  }

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const updated = [...cameras]
    const [moved] = updated.splice(dragIndex, 1)
    updated.splice(index, 0, moved)
    setCameras(updated)
    setDragIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validCameras = cameras.filter((c) => c.rtsp_url.trim())
    if (validCameras.length === 0) return

    setSaving(true)
    try {
      const data: Record<string, any> = {
        name,
        display_mode: displayMode,
        rotation_interval: rotationInterval,
        resolution,
        fps,
        cameras: validCameras.map((c, i) => ({
          name: c.name,
          rtsp_url: c.rtsp_url,
          sort_order: i,
        })),
      }
      await onSave(data)
    } finally {
      setSaving(false)
    }
  }

  const isSaving = externalSaving || saving
  const validCameraCount = cameras.filter((c) => c.rtsp_url.trim()).length

  return (
    <form onSubmit={handleSubmit}>
      {/* Config Name */}
      <div className="mb-3">
        <label className="form-label">{t('cctv.configName')}</label>
        <input
          type="text"
          className="form-control"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('cctv.configNamePlaceholder')}
          required
        />
      </div>

      {/* Cameras */}
      <div className="mb-3">
        <label className="form-label">{t('cctv.cameras')}</label>
        {cameras.map((cam, i) => (
          <div
            key={i}
            className="d-flex gap-2 mb-2 align-items-start"
            draggable
            onDragStart={() => handleDragStart(i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragEnd={handleDragEnd}
            style={{ opacity: dragIndex === i ? 0.5 : 1 }}
          >
            <span className="mt-2 text-muted" style={{ cursor: 'grab' }}>
              <FaGripVertical />
            </span>
            <input
              type="text"
              className="form-control"
              style={{ maxWidth: 180 }}
              value={cam.name}
              onChange={(e) => updateCamera(i, 'name', e.target.value)}
              placeholder={t('cctv.cameraNamePlaceholder')}
            />
            <input
              type="text"
              className="form-control flex-grow-1"
              value={cam.rtsp_url}
              onChange={(e) => updateCamera(i, 'rtsp_url', e.target.value)}
              placeholder="rtsp://user:pass@192.168.1.100:554/stream1"
              required
            />
            <button
              type="button"
              className="btn btn-outline-danger btn-sm mt-1"
              onClick={() => removeCamera(i)}
              disabled={cameras.length <= 1}
            >
              <FaTimes />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={addCamera}
        >
          <FaPlus className="me-1" />
          {t('cctv.addCamera')}
        </button>
      </div>

      {/* Display Mode */}
      <div className="mb-3">
        <label className="form-label">{t('cctv.displayMode')}</label>
        <div className="btn-group w-100">
          <button
            type="button"
            className={`btn ${displayMode === 'mosaic' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setDisplayMode('mosaic')}
          >
            {t('cctv.mosaic')}
          </button>
          <button
            type="button"
            className={`btn ${displayMode === 'rotation' ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setDisplayMode('rotation')}
          >
            {t('cctv.rotation')}
          </button>
        </div>
      </div>

      {/* Rotation Interval — only for rotation mode */}
      {displayMode === 'rotation' && (
        <div className="mb-3">
          <label className="form-label">{t('cctv.rotationInterval')}</label>
          <div className="input-group" style={{ maxWidth: 200 }}>
            <input
              type="number"
              className="form-control"
              value={rotationInterval}
              onChange={(e) => setRotationInterval(parseInt(e.target.value) || 10)}
              min={3}
              max={120}
            />
            <span className="input-group-text">{t('cctv.rotationIntervalSec')}</span>
          </div>
        </div>
      )}

      {/* Resolution & FPS */}
      <div className="row g-3 mb-3">
        <div className="col-6">
          <label className="form-label">{t('cctv.resolution')}</label>
          <select
            className="form-select"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            <option value="1920x1080">1920x1080 (Full HD)</option>
            <option value="1280x720">1280x720 (HD)</option>
            <option value="854x480">854x480 (SD)</option>
          </select>
        </div>
        <div className="col-6">
          <label className="form-label">{t('cctv.fps')}</label>
          <select
            className="form-select"
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value))}
          >
            <option value="10">10</option>
            <option value="15">15</option>
            <option value="25">25</option>
          </select>
        </div>
      </div>

      <button
        type="submit"
        className="fm-btn-primary w-100"
        disabled={isSaving || !name.trim() || validCameraCount === 0}
      >
        {isSaving ? t('common.loading') : (submitLabel || t('common.save'))}
      </button>
    </form>
  )
}


/* ===== Modal wrapper for editing ===== */

interface CctvFormModalProps {
  show: boolean
  onClose: () => void
  onSave: (data: Record<string, any>) => Promise<void>
  config?: CctvConfig | null
}

const CctvFormModal: React.FC<CctvFormModalProps> = ({ show, onClose, onSave, config }) => {
  const { t } = useTranslation()

  if (!show) return null

  return (
    <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              {config ? t('cctv.editConfig') : t('cctv.addConfig')}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            <CctvFormContent
              config={config}
              onSave={async (data) => {
                await onSave(data)
                onClose()
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default CctvFormModal
