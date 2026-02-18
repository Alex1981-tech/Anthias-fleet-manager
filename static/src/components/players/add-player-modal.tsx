import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  FaLink,
  FaRocket,
  FaArrowLeft,
  FaCheck,
  FaTimes,
  FaSpinner,
  FaClock,
  FaChevronDown,
  FaChevronUp,
  FaExternalLinkAlt,
} from 'react-icons/fa'
import { provision as provisionApi } from '@/services/api'
import type { Player, Group, ProvisionTask, ProvisionStep } from '@/types'
import PlayerForm from './player-form'

type ModalView = 'choice' | 'manual' | 'instructions' | 'provision-form' | 'provision-progress'

interface AddPlayerModalProps {
  editingPlayer: Player | null
  groups: Group[]
  onClose: () => void
  onSaved: () => void
}

const STEP_LABELS: Record<string, string> = {
  ssh_connect: 'provision.stepSshConnect',
  prerequisites: 'provision.stepPrerequisites',
  install_docker: 'provision.stepInstallDocker',
  create_dirs: 'provision.stepCreateDirs',
  upload_compose: 'provision.stepUploadCompose',
  upload_configs: 'provision.stepUploadConfigs',
  docker_pull: 'provision.stepDockerPull',
  docker_up: 'provision.stepDockerUp',
  wait_ready: 'provision.stepWaitReady',
  phonehome: 'provision.stepPhonehome',
  tailscale: 'provision.stepTailscale',
  silent_boot: 'provision.stepSilentBoot',
}

const ALL_STEPS = [
  'ssh_connect', 'prerequisites', 'install_docker', 'create_dirs',
  'upload_compose', 'upload_configs', 'docker_pull', 'docker_up',
  'wait_ready', 'phonehome', 'tailscale', 'silent_boot',
]

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return <FaSpinner className="fa-spin text-primary" />
    case 'success':
      return <FaCheck className="text-success" />
    case 'failed':
      return <FaTimes className="text-danger" />
    case 'skipped':
      return <FaCheck className="text-warning" />
    default:
      return <FaClock className="text-muted" />
  }
}

const AddPlayerModal: React.FC<AddPlayerModalProps> = ({ editingPlayer, groups, onClose, onSaved }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  // Skip to manual form when editing
  const [view, setView] = useState<ModalView>(editingPlayer ? 'manual' : 'choice')

  // Provision form state
  const [ipAddress, setIpAddress] = useState('')
  const [sshUser, setSshUser] = useState('pi')
  const [sshPassword, setSshPassword] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [sshPort, setSshPort] = useState(22)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  // Provision progress state
  const [taskId, setTaskId] = useState<string | null>(null)
  const [task, setTask] = useState<ProvisionTask | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [retryPassword, setRetryPassword] = useState('')
  const [showRetryForm, setShowRetryForm] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logRef = useRef<HTMLPreElement>(null)

  // Poll provision task
  const pollTask = useCallback(async (id: string) => {
    try {
      const data = await provisionApi.get(id)
      setTask(data)
      if (data.status === 'success' || data.status === 'failed') {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
        if (data.status === 'success') {
          onSaved()
        }
      }
    } catch {
      // ignore polling errors
    }
  }, [onSaved])

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [])

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current && showLog) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [task?.log_output, showLog])

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setSubmitting(true)

    try {
      const result = await provisionApi.create({
        ip_address: ipAddress,
        ssh_user: sshUser,
        ssh_password: sshPassword,
        ssh_port: sshPort,
        player_name: playerName,
      })
      setTaskId(result.id)
      setTask(result)
      setView('provision-progress')
      setSshPassword('')

      // Start polling
      pollRef.current = setInterval(() => pollTask(result.id), 2000)
    } catch (error) {
      setFormError(String(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetry = async () => {
    if (!taskId || !retryPassword) return
    setSubmitting(true)
    setFormError('')

    try {
      const result = await provisionApi.retry(taskId, retryPassword)
      setTask(result)
      setShowRetryForm(false)
      setRetryPassword('')

      pollRef.current = setInterval(() => pollTask(taskId), 2000)
    } catch (error) {
      setFormError(String(error))
    } finally {
      setSubmitting(false)
    }
  }

  const getStepStatus = (stepName: string): string => {
    if (!task) return 'pending'
    const step = task.steps.find((s: ProvisionStep) => s.name === stepName)
    return step?.status || 'pending'
  }

  const getStepMessage = (stepName: string): string => {
    if (!task) return ''
    const step = task.steps.find((s: ProvisionStep) => s.name === stepName)
    return step?.message || ''
  }

  const progressPct = task ? Math.round((task.current_step / task.total_steps) * 100) : 0

  const renderChoice = () => (
    <div className="modal-body">
      <div className="row g-3">
        <div className="col-6">
          <div
            className="fm-card h-100 text-center p-4"
            style={{ cursor: 'pointer', transition: 'transform 0.15s' }}
            onClick={() => setView('manual')}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = '')}
          >
            <FaLink size={32} className="text-primary mb-3" />
            <h6 className="fw-bold">{t('provision.addExisting')}</h6>
            <small className="text-muted">{t('provision.addExistingDesc')}</small>
          </div>
        </div>
        <div className="col-6">
          <div
            className="fm-card h-100 text-center p-4"
            style={{ cursor: 'pointer', transition: 'transform 0.15s' }}
            onClick={() => setView('instructions')}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = '')}
          >
            <FaRocket size={32} className="text-warning mb-3" />
            <h6 className="fw-bold">{t('provision.installNew')}</h6>
            <small className="text-muted">{t('provision.installNewDesc')}</small>
          </div>
        </div>
      </div>
    </div>
  )

  const renderInstructions = () => (
    <div className="modal-body">
      <h6 className="fw-bold mb-3">{t('provision.instructionsTitle')}</h6>
      <div className="alert alert-info py-2 small mb-3">
        <strong>{t('provision.supportedBoards')}:</strong> Raspberry Pi 4, Raspberry Pi 5
      </div>
      <ol className="list-unstyled">
        <li className="mb-3 d-flex align-items-start gap-2">
          <span style={{ fontSize: '1.3rem' }}>1.</span>
          <div>
            <strong>{t('provision.instrFlash')}</strong>
            <br />
            <small className="text-muted">{t('provision.instrFlashDesc')}</small>
          </div>
        </li>
        <li className="mb-3 d-flex align-items-start gap-2">
          <span style={{ fontSize: '1.3rem' }}>2.</span>
          <div>
            <strong>{t('provision.instrConnect')}</strong>
            <br />
            <small className="text-muted">{t('provision.instrConnectDesc')}</small>
          </div>
        </li>
        <li className="mb-3 d-flex align-items-start gap-2">
          <span style={{ fontSize: '1.3rem' }}>3.</span>
          <div>
            <strong>{t('provision.instrSsh')}</strong>
            <br />
            <small className="text-muted">{t('provision.instrSshDesc')}</small>
          </div>
        </li>
        <li className="mb-3 d-flex align-items-start gap-2">
          <span style={{ fontSize: '1.3rem' }}>4.</span>
          <div>
            <strong>{t('provision.instrIp')}</strong>
            <br />
            <small className="text-muted">{t('provision.instrIpDesc')}</small>
          </div>
        </li>
      </ol>
      <div className="d-flex justify-content-between">
        <button className="btn btn-secondary btn-sm" onClick={() => setView('choice')}>
          <FaArrowLeft className="me-1" /> {t('common.cancel')}
        </button>
        <button className="fm-btn-primary" onClick={() => setView('provision-form')}>
          {t('provision.next')}
        </button>
      </div>
    </div>
  )

  const renderProvisionForm = () => (
    <form onSubmit={handleProvisionSubmit}>
      <div className="modal-body">
        {formError && (
          <div className="alert alert-danger py-2 small">{formError}</div>
        )}
        <div className="mb-3">
          <label className="form-label fw-semibold">{t('provision.ipAddress')} *</label>
          <input
            type="text"
            className="form-control"
            value={ipAddress}
            onChange={e => setIpAddress(e.target.value)}
            required
            placeholder="192.168.1.100"
            pattern="^(\d{1,3}\.){3}\d{1,3}$"
          />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">{t('provision.sshLogin')}</label>
          <input
            type="text"
            className="form-control"
            value={sshUser}
            onChange={e => setSshUser(e.target.value)}
            placeholder="pi"
          />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">{t('provision.sshPassword')} *</label>
          <input
            type="password"
            className="form-control"
            value={sshPassword}
            onChange={e => setSshPassword(e.target.value)}
            required
          />
        </div>
        <div className="mb-3">
          <label className="form-label fw-semibold">{t('provision.playerNameLabel')}</label>
          <input
            type="text"
            className="form-control"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder={t('provision.playerNamePlaceholder')}
          />
        </div>
        <div>
          <button
            type="button"
            className="btn btn-link btn-sm p-0 text-decoration-none"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? <FaChevronUp className="me-1" /> : <FaChevronDown className="me-1" />}
            {t('provision.advanced')}
          </button>
          {showAdvanced && (
            <div className="mt-2">
              <label className="form-label fw-semibold">{t('provision.sshPort')}</label>
              <input
                type="number"
                className="form-control"
                value={sshPort}
                onChange={e => setSshPort(Number(e.target.value))}
                min={1}
                max={65535}
              />
            </div>
          )}
        </div>
      </div>
      <div className="modal-footer d-flex justify-content-between">
        <button type="button" className="btn btn-secondary" onClick={() => setView('instructions')}>
          <FaArrowLeft className="me-1" /> {t('provision.back')}
        </button>
        <button type="submit" className="fm-btn-primary" disabled={submitting}>
          {submitting ? <><FaSpinner className="fa-spin me-1" /> {t('provision.installing')}</> : t('provision.install')}
        </button>
      </div>
    </form>
  )

  const renderProgress = () => (
    <div className="modal-body">
      {/* Progress bar */}
      <div className="progress mb-3" style={{ height: '6px' }}>
        <div
          className={`progress-bar ${task?.status === 'failed' ? 'bg-danger' : task?.status === 'success' ? 'bg-success' : 'progress-bar-striped progress-bar-animated'}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Steps list */}
      <div className="mb-3" style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {ALL_STEPS.map((stepName, i) => {
          const stepStatus = getStepStatus(stepName)
          const message = getStepMessage(stepName)
          return (
            <div key={stepName} className="d-flex align-items-center gap-2 py-1" style={{ fontSize: '0.85rem' }}>
              <span style={{ width: 20, textAlign: 'center' }}>
                <StepIcon status={stepStatus} />
              </span>
              <span className={stepStatus === 'pending' ? 'text-muted' : ''}>
                {i + 1}. {t(STEP_LABELS[stepName] || stepName)}
              </span>
              {message && stepStatus !== 'pending' && (
                <small className="text-muted ms-auto" style={{ maxWidth: '40%', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {message}
                </small>
              )}
            </div>
          )
        })}
      </div>

      {/* Success banner */}
      {task?.status === 'success' && (
        <div className="alert alert-success py-2 d-flex align-items-center justify-content-between">
          <span><FaCheck className="me-2" />{t('provision.success')}</span>
          {task.player_id && (
            <button
              className="btn btn-success btn-sm"
              onClick={() => {
                onClose()
                navigate(`/players/${task.player_id}`)
              }}
            >
              {t('provision.goToPlayer')} <FaExternalLinkAlt className="ms-1" />
            </button>
          )}
        </div>
      )}

      {/* Error banner */}
      {task?.status === 'failed' && (
        <div className="alert alert-danger py-2">
          <FaTimes className="me-2" />
          {task.error_message || t('provision.failed')}
        </div>
      )}

      {/* Retry form */}
      {task?.status === 'failed' && !showRetryForm && (
        <button className="btn btn-warning btn-sm" onClick={() => setShowRetryForm(true)}>
          {t('provision.retry')}
        </button>
      )}

      {showRetryForm && (
        <div className="mt-2">
          {formError && <div className="alert alert-danger py-1 small">{formError}</div>}
          <div className="d-flex gap-2 align-items-end">
            <div className="flex-grow-1">
              <label className="form-label small fw-semibold">{t('provision.sshPassword')}</label>
              <input
                type="password"
                className="form-control form-control-sm"
                value={retryPassword}
                onChange={e => setRetryPassword(e.target.value)}
              />
            </div>
            <button
              className="btn btn-warning btn-sm"
              onClick={handleRetry}
              disabled={submitting || !retryPassword}
            >
              {submitting ? <FaSpinner className="fa-spin" /> : t('provision.retry')}
            </button>
          </div>
        </div>
      )}

      {/* Log output */}
      <div className="mt-3">
        <button
          className="btn btn-link btn-sm p-0 text-decoration-none"
          onClick={() => setShowLog(!showLog)}
        >
          {showLog ? <FaChevronUp className="me-1" /> : <FaChevronDown className="me-1" />}
          {t('provision.showLog')}
        </button>
        {showLog && (
          <pre
            ref={logRef}
            className="mt-2 p-2 rounded small"
            style={{
              maxHeight: '200px',
              overflowY: 'auto',
              backgroundColor: 'var(--bs-dark, #1a1a2e)',
              color: 'var(--bs-light, #e0e0e0)',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {task?.log_output || t('provision.noLog')}
          </pre>
        )}
      </div>
    </div>
  )

  // For manual and provision-progress views, use wider modal
  const isWide = view === 'provision-progress' || view === 'provision-form' || view === 'instructions'

  const getTitle = (): string => {
    if (editingPlayer) return t('players.editPlayer')
    if (view === 'manual') return t('players.addPlayer')
    if (view === 'instructions' || view === 'provision-form') return t('provision.installNew')
    if (view === 'provision-progress') return t('provision.installing')
    return t('players.addPlayer')
  }

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className={`modal-dialog modal-dialog-centered ${isWide ? '' : ''}`}
        style={{ maxWidth: isWide ? '560px' : '500px' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold text-purple-dark">{getTitle()}</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label={t('common.close')}
            />
          </div>

          {view === 'choice' && renderChoice()}
          {view === 'manual' && (
            <PlayerForm
              player={editingPlayer}
              groups={groups}
              onClose={onClose}
              onSaved={onSaved}
              embedded
            />
          )}
          {view === 'instructions' && renderInstructions()}
          {view === 'provision-form' && renderProvisionForm()}
          {view === 'provision-progress' && renderProgress()}

          {/* Close button for progress on success */}
          {view === 'provision-progress' && task?.status === 'success' && (
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onClose}>
                {t('common.close')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AddPlayerModal
