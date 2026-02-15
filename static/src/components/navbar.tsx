import React, { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FaThLarge, FaPhotoVideo, FaHistory, FaCog, FaBars, FaTimes } from 'react-icons/fa'
import LanguageSwitcher from './language-switcher'
import { APP_VERSION } from '../changelog'
import { system } from '@/services/api'

const Navbar: React.FC = () => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState(false)

  useEffect(() => {
    const check = () => {
      system.checkForUpdate().then((res) => {
        setUpdateAvailable(res.update_available)
      }).catch(() => {})
    }
    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const toggleMenu = () => setIsOpen(!isOpen)
  const closeMenu = () => setIsOpen(false)

  const navItems = [
    { to: '/', icon: <FaThLarge className="nav-icon" />, label: t('nav.dashboard'), end: true },
    { to: '/content', icon: <FaPhotoVideo className="nav-icon" />, label: t('nav.content'), end: true },
    { to: '/deploy/history', icon: <FaHistory className="nav-icon" />, label: t('nav.history'), end: false },
    { to: '/settings', icon: <FaCog className="nav-icon" />, label: t('nav.settings'), end: false },
  ]

  return (
    <nav className="fm-navbar">
      <div className="container-fluid d-flex align-items-center px-3 h-100">
        <NavLink to="/" className="navbar-brand" onClick={closeMenu}>
          <img src="/static/img/logo.svg" alt="Anthias Fleet Manager" />
        </NavLink>
        <NavLink to="/changelog" className="fm-version-badge" onClick={closeMenu}>
          v{APP_VERSION}
          {updateAvailable && <span className="fm-update-dot" title={t('updates.newVersion')} />}
        </NavLink>

        <button
          className="btn-navbar d-lg-none ms-auto me-2"
          onClick={toggleMenu}
          aria-label="Toggle navigation"
        >
          {isOpen ? <FaTimes /> : <FaBars />}
        </button>

        <div className={`flex-grow-1 d-lg-flex align-items-center justify-content-center ${isOpen ? 'd-flex flex-column flex-lg-row position-absolute start-0 end-0 bg-purple-dark p-3 p-lg-0' : 'd-none'}`}
          style={isOpen ? { top: '85px', zIndex: 1030, backgroundColor: '#270035' } : {}}>
          <ul className="navbar-nav d-flex flex-column flex-lg-row list-unstyled mb-0 gap-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'active' : ''}`
                  }
                  onClick={closeMenu}
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="navbar-actions d-none d-lg-flex">
          <LanguageSwitcher />
        </div>

        {isOpen && (
          <div className="d-lg-none position-absolute end-0 p-3" style={{ top: '85px', zIndex: 1031 }}>
            <LanguageSwitcher />
          </div>
        )}
      </div>
    </nav>
  )
}

export default Navbar
