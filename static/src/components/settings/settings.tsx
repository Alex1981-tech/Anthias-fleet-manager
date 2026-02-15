import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCog, FaCopy, FaCheck, FaSave, FaSync, FaDownload } from 'react-icons/fa'
import Swal from 'sweetalert2'
import { pushLanguageToPlayers, system } from '@/services/api'
import { APP_VERSION } from '../../changelog'

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation()

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
          Swal.fire({
            icon: 'success',
            title: t('common.success'),
            text: t('updates.updateTriggered'),
            timer: 3000,
            showConfirmButton: false,
          })
        }).catch(() => {
          Swal.fire({
            icon: 'error',
            title: t('common.error'),
            text: t('updates.updateFailed'),
          })
        }).finally(() => setUpdating(false))
      }
    })
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

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="fm-card fm-card-accent">
            <div className="fm-card-header">
              <h5 className="card-title">{t('settings.general')}</h5>
            </div>
            <div className="fm-card-body">
              {/* Poll interval */}
              <div className="mb-4">
                <label className="form-label fw-semibold">
                  {t('settings.pollInterval')}
                </label>
                <select
                  className="form-select"
                  value={pollInterval}
                  onChange={(e) => setPollInterval(e.target.value)}
                  style={{ maxWidth: '300px' }}
                >
                  <option value="30">30 {t('settings.seconds')}</option>
                  <option value="60">1 {t('settings.minute')}</option>
                  <option value="120">2 {t('settings.minutes')}</option>
                  <option value="300">5 {t('settings.minutes')}</option>
                </select>
                <div className="form-text">{t('settings.pollIntervalDesc')}</div>
              </div>

              {/* Language */}
              <div className="mb-4">
                <label className="form-label fw-semibold">
                  {t('settings.language')}
                </label>
                <select
                  className="form-select"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  style={{ maxWidth: '300px' }}
                >
                  <option value="en">English</option>
                  <option value="uk">Українська</option>
                  <option value="fr">Français</option>
                  <option value="de">Deutsch</option>
                  <option value="pl">Polski</option>
                </select>
              </div>

              {/* Theme */}
              <div className="mb-4">
                <label className="form-label fw-semibold">
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

              <button className="fm-btn-primary" onClick={handleSave}>
                <FaSave />
                {t('common.save')}
              </button>
            </div>
          </div>

          {/* Auto-Registration */}
          <div className="fm-card fm-card-accent mt-4">
            <div className="fm-card-header">
              <h5 className="card-title">{t('settings.autoRegistration')}</h5>
            </div>
            <div className="fm-card-body">
              <p className="form-text mb-3">{t('settings.autoRegistrationDesc')}</p>

              <div className="mb-3">
                <label className="form-label fw-semibold">
                  {t('settings.serverUrl')}
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  style={{ maxWidth: '400px' }}
                />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold">
                  {t('settings.installCommand')}
                </label>
                <div className="position-relative">
                  <pre
                    className="bg-dark text-light p-3 rounded"
                    style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                  >
                    {`curl -sSL ${serverUrl}/api/players/install-phonehome/?server=${encodeURIComponent(serverUrl)} | sudo bash`}
                  </pre>
                  <button
                    className={`btn btn-sm position-absolute top-0 end-0 m-2 ${copied ? 'btn-success' : 'btn-outline-light'}`}
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

          {/* Updates */}
          <div className="fm-card fm-card-accent mt-4">
            <div className="fm-card-header">
              <h5 className="card-title">{t('updates.title')}</h5>
            </div>
            <div className="fm-card-body">
              {/* Current version info */}
              <div className="mb-3">
                <span className="fw-semibold">{t('updates.currentVersion')}: </span>
                <span className="badge bg-primary">v{APP_VERSION}</span>
                {buildDate && buildDate !== 'unknown' && (
                  <span className="text-muted ms-2">
                    {t('updates.buildDate')}: {new Date(buildDate).toLocaleString()}
                  </span>
                )}
              </div>

              {/* Update status */}
              {updateInfo && !updateInfo.error && !updateInfo.update_available && (
                <div className="alert alert-success py-2 mb-3">
                  {t('updates.upToDate')}
                </div>
              )}

              {updateInfo?.update_available && (
                <div className="alert alert-warning py-2 mb-3">
                  {t('updates.newVersion')}: <strong>v{updateInfo.latest_version}</strong>
                  {updateInfo.release_url && (
                    <> &mdash; <a href={updateInfo.release_url} target="_blank" rel="noopener noreferrer">{t('updates.releaseNotes')}</a></>
                  )}
                </div>
              )}

              {updateInfo?.error && (
                <div className="alert alert-danger py-2 mb-3">
                  {updateInfo.error}
                </div>
              )}

              {/* Action buttons */}
              <div className="d-flex gap-2 mb-4">
                <button
                  className="fm-btn-outline"
                  onClick={handleCheckUpdate}
                  disabled={checking}
                >
                  <FaSync className={checking ? 'fa-spin' : ''} />
                  {checking ? t('common.loading') : t('updates.checkNow')}
                </button>

                {updateInfo?.update_available && (
                  <button
                    className="fm-btn-primary"
                    onClick={handleTriggerUpdate}
                    disabled={updating}
                  >
                    <FaDownload />
                    {updating ? t('common.loading') : t('updates.updateNow')}
                  </button>
                )}
              </div>

              {/* Auto-update toggle */}
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
                <div className="form-text">{t('updates.autoUpdateDesc')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
