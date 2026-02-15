import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCog, FaCopy, FaCheck, FaSave } from 'react-icons/fa'
import Swal from 'sweetalert2'
import { pushLanguageToPlayers } from '@/services/api'

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

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme)
  }, [theme])

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
        </div>
      </div>
    </div>
  )
}

export default Settings
