import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { FaSignInAlt } from 'react-icons/fa'
import Swal from 'sweetalert2'

const Login: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const getCsrfToken = (): string => {
    const match = document.cookie.match(/csrftoken=([^;]+)/)
    return match ? match[1] : ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        credentials: 'same-origin',
        body: JSON.stringify({ username, password }),
      })

      if (response.ok) {
        navigate('/')
      } else {
        const data = await response.json()
        Swal.fire({
          icon: 'error',
          title: t('common.error'),
          text: data.detail || t('auth.invalidCredentials'),
        })
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: t('common.error'),
        text: String(error),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
      <div className="fm-card fm-card-accent" style={{ maxWidth: '420px', width: '100%' }}>
        <div className="fm-card-header text-center">
          <h4 className="card-title mb-0">
            <span className="brand-highlight">Anthias</span> Fleet Manager
          </h4>
        </div>
        <div className="fm-card-body">
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label fw-semibold">{t('auth.username')}</label>
              <input
                type="text"
                className="form-control"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="mb-4">
              <label className="form-label fw-semibold">{t('auth.password')}</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="fm-btn-primary w-100"
              disabled={loading}
            >
              <FaSignInAlt />
              {loading ? t('common.loading') : t('auth.login')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
