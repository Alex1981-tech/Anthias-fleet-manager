import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaPlus,
  FaPlay,
  FaStop,
  FaEdit,
  FaTrash,
  FaCopy,
  FaVideo,
  FaSpinner,
  FaTh,
  FaSync,
} from 'react-icons/fa'
import Swal from 'sweetalert2'
import { cctv as cctvApi } from '@/services/api'
import type { CctvConfig } from '@/types'
import CctvFormModal from './cctv-form-modal'

const CctvPage: React.FC = () => {
  const { t } = useTranslation()
  const [configs, setConfigs] = useState<CctvConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<CctvConfig | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    try {
      const data = await cctvApi.list()
      setConfigs(data)
    } catch (err) {
      console.error('Failed to fetch CCTV configs', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  const handleAdd = () => {
    setEditingConfig(null)
    setShowForm(true)
  }

  const handleEdit = (config: CctvConfig) => {
    setEditingConfig(config)
    setShowForm(true)
  }

  const handleSave = async (data: Record<string, any>) => {
    if (editingConfig) {
      await cctvApi.update(editingConfig.id, data)
    } else {
      await cctvApi.create(data)
    }
    setShowForm(false)
    setEditingConfig(null)
    await fetchConfigs()
  }

  const handleDelete = async (config: CctvConfig) => {
    const result = await Swal.fire({
      title: t('common.confirm'),
      text: t('cctv.confirmDelete'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
    })

    if (result.isConfirmed) {
      try {
        await cctvApi.delete(config.id)
        await fetchConfigs()
        Swal.fire({
          icon: 'success',
          title: t('cctv.deleteConfig'),
          timer: 1500,
          showConfirmButton: false,
        })
      } catch (error) {
        Swal.fire({ icon: 'error', title: t('common.error'), text: String(error) })
      }
    }
  }

  const handleStart = async (config: CctvConfig) => {
    setActionInProgress(config.id)
    try {
      await cctvApi.start(config.id)
      Swal.fire({
        icon: 'success',
        title: t('cctv.streamStarted'),
        timer: 1500,
        showConfirmButton: false,
      })
      await fetchConfigs()
    } catch (error) {
      Swal.fire({ icon: 'error', title: t('cctv.streamFailed'), text: String(error) })
    } finally {
      setActionInProgress(null)
    }
  }

  const handleStop = async (config: CctvConfig) => {
    setActionInProgress(config.id)
    try {
      await cctvApi.stop(config.id)
      Swal.fire({
        icon: 'success',
        title: t('cctv.streamStopped'),
        timer: 1500,
        showConfirmButton: false,
      })
      await fetchConfigs()
    } catch (error) {
      Swal.fire({ icon: 'error', title: t('common.error'), text: String(error) })
    } finally {
      setActionInProgress(null)
    }
  }

  const handleCopyUrl = (config: CctvConfig) => {
    const url = `${window.location.origin}/cctv/${config.id}/`
    const copyFallback = (text: string) => {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url)
      } else {
        copyFallback(url)
      }
      Swal.fire({
        icon: 'success',
        title: t('cctv.urlCopied'),
        timer: 1500,
        showConfirmButton: false,
      })
    } catch {
      copyFallback(url)
      Swal.fire({
        icon: 'success',
        title: t('cctv.urlCopied'),
        timer: 1500,
        showConfirmButton: false,
      })
    }
  }

  if (loading) {
    return (
      <div className="container-fluid py-4 text-center">
        <FaSpinner className="fa-spin" size={24} />
      </div>
    )
  }

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h2 className="mb-1">{t('cctv.title')}</h2>
          <p className="text-muted mb-0">{t('cctv.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={handleAdd}>
          <FaPlus className="me-2" />
          {t('cctv.addConfig')}
        </button>
      </div>

      {configs.length === 0 ? (
        <div className="text-center py-5">
          <FaVideo size={48} className="text-muted mb-3" />
          <h5 className="text-muted">{t('cctv.noConfigs')}</h5>
          <p className="text-muted">{t('cctv.noConfigsDesc')}</p>
          <button className="btn btn-primary" onClick={handleAdd}>
            <FaPlus className="me-2" />
            {t('cctv.addConfig')}
          </button>
        </div>
      ) : (
        <div className="row g-3">
          {configs.map((config) => (
            <div key={config.id} className="col-12 col-md-6 col-xl-4">
              <div className="card fm-card h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h5 className="card-title mb-0">{config.name}</h5>
                    <span
                      className={`badge ${config.is_active ? 'bg-success' : 'bg-secondary'}`}
                    >
                      {config.is_active ? t('cctv.running') : t('cctv.stopped')}
                    </span>
                  </div>

                  <div className="text-muted small mb-3">
                    <span className="me-3">
                      <FaVideo className="me-1" />
                      {config.cameras.length} {t('cctv.cameras').toLowerCase()}
                    </span>
                    <span className="me-3">
                      {config.display_mode === 'mosaic' ? (
                        <><FaTh className="me-1" />{t('cctv.mosaic')}</>
                      ) : (
                        <><FaSync className="me-1" />{t('cctv.rotation')} ({config.rotation_interval}s)</>
                      )}
                    </span>
                    <span>{config.resolution} @ {config.fps}fps</span>
                  </div>

                  {/* Camera list */}
                  <div className="mb-3">
                    {config.cameras.map((cam) => (
                      <div key={cam.id} className="small text-muted">
                        {cam.name ? `${cam.name}: ` : ''}{cam.rtsp_url}
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="d-flex gap-2 flex-wrap">
                    {config.is_active ? (
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleStop(config)}
                        disabled={actionInProgress === config.id}
                      >
                        {actionInProgress === config.id ? (
                          <FaSpinner className="fa-spin me-1" />
                        ) : (
                          <FaStop className="me-1" />
                        )}
                        {t('cctv.stop')}
                      </button>
                    ) : (
                      <button
                        className="btn btn-outline-success btn-sm"
                        onClick={() => handleStart(config)}
                        disabled={actionInProgress === config.id}
                      >
                        {actionInProgress === config.id ? (
                          <FaSpinner className="fa-spin me-1" />
                        ) : (
                          <FaPlay className="me-1" />
                        )}
                        {t('cctv.start')}
                      </button>
                    )}

                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => handleCopyUrl(config)}
                      title={t('cctv.copyUrl')}
                    >
                      <FaCopy className="me-1" />
                      {t('cctv.copyUrl')}
                    </button>

                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => handleEdit(config)}
                    >
                      <FaEdit className="me-1" />
                      {t('common.edit')}
                    </button>

                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => handleDelete(config)}
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CctvFormModal
        show={showForm}
        onClose={() => {
          setShowForm(false)
          setEditingConfig(null)
        }}
        onSave={handleSave}
        config={editingConfig}
      />
    </div>
  )
}

export default CctvPage
