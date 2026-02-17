import React, { useState, useEffect, useRef, useCallback, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { FaCog, FaCopy, FaCheck, FaSave, FaSync, FaDownload, FaShieldAlt, FaEye, FaEyeSlash, FaUsers, FaHistory } from 'react-icons/fa'
import Swal from 'sweetalert2'
import { pushLanguageToPlayers, system } from '@/services/api'
import type { TailscaleSettings } from '@/types'
import { APP_VERSION } from '../../changelog'
import { RoleContext } from '@/components/app'
import UsersSettings from './users-settings'

const UPDATE_POLL_INTERVAL = 5000 // 5s
const UPDATE_TIMEOUT = 120000 // 120s

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation()
  const role = useContext(RoleContext)

  const [pollInterval, setPollInterval] = useState(
    localStorage.getItem('fm_poll_interval') || '60',
  )
  const [language, setLanguage] = useState(i18n.language)
  const [theme, setTheme] = useState(
    localStorage.getItem('fm_theme') || 'light',
  )
  const [serverUrl, setServerUrl] = useState(window.location.origin)
  const [copied, setCopied] = useState(false)

  // Update section state
  const [buildDate, setBuildDate] = useState('')
  const [updateInfo, setUpdateInfo] = useState<{
    latest_version: string | null
    update_available: boolean
    release_url?: string
    error?: string
  } | null>(null)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [autoUpdate, setAutoUpdate] = useState(true)

  // Tailscale state
  const [tsSettings, setTsSettings] = useState<TailscaleSettings | null>(null)
  const [tsEnabled, setTsEnabled] = useState(false)
  const [tsAuthKey, setTsAuthKey] = useState('')
  const [tsFmIp, setTsFmIp] = useState('')
  const [tsShowKey, setTsShowKey] = useState(false)
  const [tsSaving, setTsSaving] = useState(false)

  // Post-update polling state
  const [updatePolling, setUpdatePolling] = useState(false)
  const [updateTimedOut, setUpdateTimedOut] = useState(false)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }, [])

  const startUpdatePolling = useCallback(() => {
    stopPolling()
    setUpdatePolling(true)
    setUpdateTimedOut(false)

    // Timeout — after 120s show manual reload
    timeoutRef.current = setTimeout(() => {
      stopPolling()
      setUpdateTimedOut(true)
    }, UPDATE_TIMEOUT)

    // Poll version every 5s
    pollTimerRef.current = setInterval(() => {
      system.getVersion().then((res) => {
        if (res.version && res.version !== APP_VERSION) {
          stopPolling()
          window.location.reload()
        }
      }).catch(() => {
        // Backend still down — keep polling
      })
    }, UPDATE_POLL_INTERVAL)
  }, [stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [stopPolling])

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme)
  }, [theme])

  useEffect(() => {
    system.getVersion().then((res) => {
      setBuildDate(res.build_date)
    }).catch(() => {})

    system.checkForUpdate().then((res) => {
      setUpdateInfo(res)
    }).catch(() => {})

    system.getSettings().then((res) => {
      setAutoUpdate(res.auto_update)
    }).catch(() => {})

    system.getTailscale().then((res) => {
      setTsSettings(res)
      setTsEnabled(res.tailscale_enabled)
      setTsFmIp(res.fm_tailscale_ip || '')
    }).catch(() => {})
  }, [])

  const handleCheckUpdate = () => {
    setChecking(true)
    system.checkForUpdate(true).then((res) => {
      setUpdateInfo(res)
    }).catch(() => {
      setUpdateInfo({ latest_version: null, update_available: false, error: t('updates.checkFailed') })
    }).finally(() => setChecking(false))
  }

  const handleTriggerUpdate = () => {
    Swal.fire({
      title: t('updates.confirmUpdate'),
      text: t('updates.confirmUpdateDesc'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('updates.updateNow'),
      cancelButtonText: t('common.cancel'),
    }).then((result) => {
      if (result.isConfirmed) {
        setUpdating(true)
        system.triggerUpdate().then(() => {
          setUpdating(false)
          startUpdatePolling()
        }).catch((err) => {
          setUpdating(false)
          // Network error after trigger likely means containers are restarting
          if (err instanceof TypeError || (err.message && err.message.includes('fetch'))) {
            startUpdatePolling()
          } else {
            Swal.fire({
              icon: 'error',
              title: t('common.error'),
              text: t('updates.updateFailed'),
            })
          }
        })
      }
    })
  }

  const handleTailscaleSave = () => {
    setTsSaving(true)
    const data: Record<string, unknown> = {
      tailscale_enabled: tsEnabled,
      fm_tailscale_ip: tsFmIp,
    }
    if (tsAuthKey) {
      data.authkey = tsAuthKey
    }
    system.updateTailscale(data).then((res) => {
      setTsSettings(res)
      setTsAuthKey('')
      Swal.fire({
        icon: 'success',
        title: t('common.success'),
        text: t('tailscale.saved'),
        timer: 1500,
        showConfirmButton: false,
      })
    }).catch(() => {
      Swal.fire({ icon: 'error', title: t('common.error'), text: t('tailscale.saveFailed') })
    }).finally(() => setTsSaving(false))
  }

  const handleAutoUpdateToggle = (value: boolean) => {
    setAutoUpdate(value)
    system.updateSettings({ auto_update: value }).catch(() => {
      setAutoUpdate(!value)
    })
  }

  const handleSave = () => {
    localStorage.setItem('fm_poll_interval', pollInterval)
    localStorage.setItem('fm_theme', theme)

    if (language !== i18n.language) {
      i18n.changeLanguage(language)
      document.cookie = `django_language=${language};path=/;max-age=31536000`
      pushLanguageToPlayers(language)
    }

    Swal.fire({
      icon: 'success',
      title: t('common.success'),
      text: t('settings.saved'),
      timer: 1500,
      showConfirmButton: false,
    })
  }

  return (
    <div>
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaCog className="page-icon" />
            {t('settings.title')}
          </h1>
          <p className="page-subtitle">{t('settings.subtitle')}</p>
        </div>
      </div>

      <div className="row g-3">
        {/* General Settings */}
        <div className="col-lg-6">
          <div className="fm-card fm-card-accent h-100">
            <div className="fm-card-header py-2">
              <h5 className="card-title mb-0">{t('settings.general')}</h5>
            </div>
            <div className="fm-card-body py-3">
              <div className="mb-3">
                <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>
                  {t('settings.pollInterval')}
                </label>
                <select
                  className="form-select form-select-sm"
                  value={pollInterval}
                  onChange={(e) => setPollInterval(e.target.value)}
                >
                  <option value="30">30 {t('settings.seconds')}</option>
                  <option value="60">1 {t('settings.minute')}</option>
                  <option value="120">2 {t('settings.minutes')}</option>
                  <option value="300">5 {t('settings.minutes')}</option>
                </select>
                <div className="form-text" style={{ fontSize: '0.75rem' }}>{t('settings.pollIntervalDesc')}</div>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>
                  {t('settings.language')}
                </label>
                <select
                  className="form-select form-select-sm"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="uk">Українська</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="pl">Polski</option>
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>
                  {t('settings.theme')}
                </label>
                <div className="d-flex gap-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="theme"
                      id="theme-light"
                      value="light"
                      checked={theme === 'light'}
                      onChange={(e) => setTheme(e.target.value)}
                    />
                    <label className="form-check-label" htmlFor="theme-light">
                      {t('settings.lightTheme')}
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      name="theme"
                      id="theme-dark"
                      value="dark"
                      checked={theme === 'dark'}
                      onChange={(e) => setTheme(e.target.value)}
                    />
                    <label className="form-check-label" htmlFor="theme-dark">
                      {t('settings.darkTheme')}
                    </label>
                  </div>
                </div>
              </div>

              <button className="fm-btn-primary btn-sm" onClick={handleSave}>
                <FaSave />
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>

        {/* Auto-Registration */}
        <div className="col-lg-6">
          <div className="fm-card fm-card-accent h-100">
            <div className="fm-card-header py-2">
              <h5 className="card-title mb-0">{t('settings.autoRegistration')}</h5>
            </div>
            <div className="fm-card-body py-3">
              <p className="form-text mb-2" style={{ fontSize: '0.8rem' }}>{t('settings.autoRegistrationDesc')}</p>

              <div className="mb-2">
                <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>
                  {t('settings.serverUrl')}
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>
                  {t('settings.installCommand')}
                </label>
                <div className="position-relative">
                  <pre
                    className="bg-dark text-light p-2 rounded"
                    style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: 0 }}
                  >
                    {`curl -sSL ${serverUrl}/api/players/install-phonehome/?server=${encodeURIComponent(serverUrl)} | sudo bash`}
                  </pre>
                  <button
                    className={`btn btn-sm position-absolute top-0 end-0 m-1 ${copied ? 'btn-success' : 'btn-outline-light'}`}
                    onClick={() => {
                      const cmd = `curl -sSL ${serverUrl}/api/players/install-phonehome/?server=${encodeURIComponent(serverUrl)} | sudo bash`
                      navigator.clipboard.writeText(cmd)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                  >
                    {copied ? <><FaCheck /> {t('settings.copied')}</> : <><FaCopy /></>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tailscale VPN */}
        <div className="col-lg-6">
          <div className="fm-card fm-card-accent h-100">
            <div className="fm-card-header py-2">
              <h5 className="card-title mb-0">
                <FaShieldAlt className="me-2" />
                {t('tailscale.title')}
              </h5>
            </div>
            <div className="fm-card-body py-3">
              <p className="form-text mb-2" style={{ fontSize: '0.8rem' }}>{t('tailscale.description')}</p>

              <div className="form-check form-switch mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="ts-enable"
                  checked={tsEnabled}
                  onChange={(e) => setTsEnabled(e.target.checked)}
                />
                <label className="form-check-label fw-semibold" htmlFor="ts-enable">
                  {t('tailscale.enable')}
                </label>
              </div>

              {tsSettings && (
                <div className="mb-2">
                  <span className="fw-semibold" style={{ fontSize: '0.85rem' }}>{t('tailscale.status')}: </span>
                  {tsSettings.status === 'connected' ? (
                    <span className="badge bg-success">{t('tailscale.connected')}</span>
                  ) : tsSettings.status === 'disconnected' ? (
                    <span className="badge bg-warning text-dark">{t('tailscale.disconnected')}</span>
                  ) : (
                    <span className="badge bg-secondary">{t('tailscale.notInstalled')}</span>
                  )}
                </div>
              )}

              <div className="mb-2">
                <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>{t('tailscale.fmIp')}</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={tsFmIp}
                  onChange={(e) => setTsFmIp(e.target.value)}
                  placeholder={tsSettings?.detected_ip || '100.x.x.x'}
                />
                {tsSettings?.detected_ip && (
                  <div className="form-text" style={{ fontSize: '0.75rem' }}>
                    {t('tailscale.detectedIp')}: {tsSettings.detected_ip}
                  </div>
                )}
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold mb-1" style={{ fontSize: '0.85rem' }}>{t('tailscale.authKey')}</label>
                <div className="input-group input-group-sm">
                  <input
                    type={tsShowKey ? 'text' : 'password'}
                    className="form-control"
                    value={tsAuthKey}
                    onChange={(e) => setTsAuthKey(e.target.value)}
                    placeholder={tsSettings?.has_authkey ? '••••••••' : t('tailscale.authKeyPlaceholder')}
                  />
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setTsShowKey(!tsShowKey)}
                  >
                    {tsShowKey ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {tsSettings?.has_authkey && !tsAuthKey && (
                  <div className="form-text text-success" style={{ fontSize: '0.75rem' }}>{t('tailscale.authKeySet')}</div>
                )}
              </div>

              <button
                className="fm-btn-primary btn-sm"
                onClick={handleTailscaleSave}
                disabled={tsSaving}
              >
                <FaSave />
                {tsSaving ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>

        {/* Updates */}
        <div className="col-lg-6">
          <div className="fm-card fm-card-accent h-100">
            <div className="fm-card-header py-2">
              <h5 className="card-title mb-0">{t('updates.title')}</h5>
            </div>
            <div className="fm-card-body py-3">
              <div className="mb-2">
                <span className="fw-semibold" style={{ fontSize: '0.85rem' }}>{t('updates.currentVersion')}: </span>
                <span className="badge bg-primary">v{APP_VERSION}</span>
                {buildDate && buildDate !== 'unknown' && (
                  <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                    {t('updates.buildDate')}: {new Date(buildDate).toLocaleString()}
                  </div>
                )}
              </div>

              {updateInfo && !updateInfo.error && !updateInfo.update_available && (
                <div className="alert alert-success py-1 px-2 mb-2" style={{ fontSize: '0.8rem' }}>
                  {t('updates.upToDate')}
                </div>
              )}

              {updateInfo?.update_available && (
                <div className="alert alert-warning py-1 px-2 mb-2" style={{ fontSize: '0.8rem' }}>
                  {t('updates.newVersion')}: <strong>v{updateInfo.latest_version}</strong>
                  {updateInfo.release_url && (
                    <> &mdash; <a href={updateInfo.release_url} target="_blank" rel="noopener noreferrer">{t('updates.releaseNotes')}</a></>
                  )}
                </div>
              )}

              {updateInfo?.error && (
                <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: '0.8rem' }}>
                  {updateInfo.error}
                </div>
              )}

              <div className="d-flex gap-2 mb-3">
                <button
                  className="fm-btn-outline btn-sm"
                  onClick={handleCheckUpdate}
                  disabled={checking}
                >
                  <FaSync className={checking ? 'fa-spin' : ''} />
                  {checking ? t('common.loading') : t('updates.checkNow')}
                </button>

                {updateInfo?.update_available && (
                  <button
                    className="fm-btn-primary btn-sm"
                    onClick={handleTriggerUpdate}
                    disabled={updating}
                  >
                    <FaDownload />
                    {updating ? t('common.loading') : t('updates.updateNow')}
                  </button>
                )}
              </div>

              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="auto-update-toggle"
                  checked={autoUpdate}
                  onChange={(e) => handleAutoUpdateToggle(e.target.checked)}
                />
                <label className="form-check-label fw-semibold" htmlFor="auto-update-toggle">
                  {t('updates.autoUpdate')}
                </label>
                <div className="form-text" style={{ fontSize: '0.75rem' }}>{t('updates.autoUpdateDesc')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Users Management — admin only */}
      {role === 'admin' && (
        <div className="row g-3 mt-1">
          <div className="col-12">
            <UsersSettings />
          </div>
        </div>
      )}

      {/* Audit Log link — admin only */}
      {role === 'admin' && (
        <div className="row g-3 mt-1">
          <div className="col-12">
            <div className="fm-card fm-card-accent">
              <div className="fm-card-header py-2 d-flex justify-content-between align-items-center">
                <h5 className="card-title mb-0">
                  <FaHistory className="me-2" />
                  {t('audit.title')}
                </h5>
                <Link to="/audit" className="fm-btn-outline btn-sm">
                  {t('audit.viewAll')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post-update polling overlay */}
      {(updatePolling || updateTimedOut) && (
        <div className="fm-update-overlay">
          <div className="fm-update-overlay-content">
            {updatePolling && !updateTimedOut && (
              <>
                <div className="spinner" />
                <p>{t('updates.updating')}</p>
              </>
            )}
            {updateTimedOut && (
              <>
                <p>{t('updates.updateTimeout')}</p>
                <button
                  className="fm-btn-primary mt-3"
                  onClick={() => window.location.reload()}
                >
                  <FaSync />
                  {t('updates.reload')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings
