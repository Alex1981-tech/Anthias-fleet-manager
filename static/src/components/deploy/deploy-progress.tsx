import React, { useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FaRocket, FaCheckCircle, FaTimesCircle, FaSpinner, FaClock, FaArrowLeft } from 'react-icons/fa'
import { useAppDispatch, useAppSelector } from '@/store/index'
import { fetchDeployTask } from '@/store/deploySlice'

const statusIcon = (status: string) => {
  switch (status) {
    case 'success':
      return <FaCheckCircle className="text-success" />
    case 'error':
    case 'failed':
      return <FaTimesCircle className="text-danger" />
    case 'running':
      return <FaSpinner className="fa-spin text-warning" />
    default:
      return <FaClock className="text-muted" />
  }
}

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-success'
    case 'failed':
      return 'bg-danger'
    case 'running':
      return 'bg-warning text-dark'
    default:
      return 'bg-secondary'
  }
}

const DeployProgress: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { currentTask, error } = useAppSelector((state) => state.deploy)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!id) return
    dispatch(fetchDeployTask(id))

    // Poll every 2s while task is active
    intervalRef.current = setInterval(() => {
      dispatch(fetchDeployTask(id))
    }, 2000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [dispatch, id])

  // Stop polling when task is done
  useEffect(() => {
    if (
      currentTask &&
      (currentTask.status === 'completed' || currentTask.status === 'failed')
    ) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [currentTask?.status])

  if (error) {
    return (
      <div className="fm-empty-state">
        <h3 className="empty-title">{t('common.error')}</h3>
        <p className="text-muted">{error}</p>
        <button className="fm-btn-primary" onClick={() => navigate('/deploy/history')}>
          <FaArrowLeft /> {t('deploy.history')}
        </button>
      </div>
    )
  }

  if (!currentTask) {
    return (
      <div className="fm-loading">
        <div className="spinner" />
      </div>
    )
  }

  const progressEntries = Object.entries(currentTask.progress || {})
  const total = progressEntries.length
  const completed = progressEntries.filter(([, v]) => v.status === 'success').length
  const failed = progressEntries.filter(([, v]) => v.status === 'error' || v.status === 'failed').length
  const percent = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0

  return (
    <div>
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaRocket className="page-icon" />
            {currentTask.name}
          </h1>
          <p className="page-subtitle">
            <span className={`badge ${statusBadgeClass(currentTask.status)} me-2`}>
              {currentTask.status.toUpperCase()}
            </span>
            {new Date(currentTask.created_at).toLocaleString()}
          </p>
        </div>
        <div className="page-actions">
          <Link to="/deploy/history" className="fm-btn-outline">
            <FaArrowLeft /> {t('deploy.history')}
          </Link>
        </div>
      </div>

      {/* Progress bar */}
      <div className="fm-card fm-card-accent mb-4">
        <div className="fm-card-body">
          <div className="d-flex justify-content-between mb-2">
            <span className="fw-semibold">{t('deploy.progress')}</span>
            <span>
              {completed}/{total} {t('common.success').toLowerCase()}
              {failed > 0 && (
                <span className="text-danger ms-2">{failed} {t('common.error').toLowerCase()}</span>
              )}
            </span>
          </div>
          <div className="progress" style={{ height: '12px' }}>
            <div
              className="progress-bar bg-success"
              role="progressbar"
              style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            />
            <div
              className="progress-bar bg-danger"
              role="progressbar"
              style={{ width: `${total > 0 ? (failed / total) * 100 : 0}%` }}
            />
          </div>
          <div className="text-muted mt-1" style={{ fontSize: '0.8rem' }}>
            {percent}%
          </div>
        </div>
      </div>

      {/* Per-player progress */}
      <div className="fm-card fm-card-accent">
        <div className="fm-card-header">
          <h5 className="card-title">{t('deploy.targetPlayers')}</h5>
        </div>
        <div className="fm-card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>{t('players.name')}</th>
                  <th>{t('deploy.status')}</th>
                  <th>{t('common.error')}</th>
                </tr>
              </thead>
              <tbody>
                {progressEntries.map(([playerId, info]) => (
                  <tr key={playerId}>
                    <td className="text-center">{statusIcon(info.status)}</td>
                    <td>
                      <Link to={`/players/${playerId}`} className="text-decoration-none">
                        {info.name || playerId}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(info.status)}`}>
                        {info.status}
                      </span>
                    </td>
                    <td className="text-danger" style={{ fontSize: '0.85rem' }}>
                      {info.error || ''}
                    </td>
                  </tr>
                ))}
                {progressEntries.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted py-3">
                      {t('common.loading')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DeployProgress
