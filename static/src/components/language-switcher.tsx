import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { pushLanguageToPlayers } from '@/services/api'

interface LanguageOption {
  code: string
  label: string
  flag: string
}

const languages: LanguageOption[] = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'uk', label: 'Ukrainian', flag: 'UA' },
  { code: 'fr', label: 'Français', flag: 'FR' },
  { code: 'de', label: 'Deutsch', flag: 'DE' },
  { code: 'pl', label: 'Polski', flag: 'PL' },
]

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentLang = languages.find((l) => l.code === i18n.language) || languages[0]

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code)
    document.cookie = `django_language=${code};path=/;max-age=${365 * 24 * 60 * 60}`
    document.documentElement.lang = code
    setIsOpen(false)
    pushLanguageToPlayers(code)
  }

  return (
    <div className="position-relative" ref={dropdownRef}>
      <button
        className="btn-navbar"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {currentLang.flag}
      </button>

      {isOpen && (
        <div
          className="position-absolute end-0 mt-1 py-1 bg-white rounded shadow-lg"
          style={{ minWidth: '150px', zIndex: 1060 }}
        >
          {languages.map((lang) => (
            <button
              key={lang.code}
              className={`d-flex align-items-center gap-2 w-100 border-0 bg-transparent px-3 py-2 text-start ${
                lang.code === i18n.language ? 'fw-bold text-purple' : 'text-dark'
              }`}
              style={{ fontSize: '0.875rem', cursor: 'pointer' }}
              onClick={() => changeLanguage(lang.code)}
            >
              <span style={{ fontWeight: 600, minWidth: '24px' }}>{lang.flag}</span>
              <span>{t(`language.${lang.code}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default LanguageSwitcher
