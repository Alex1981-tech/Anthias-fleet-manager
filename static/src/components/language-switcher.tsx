import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { pushLanguageToPlayers } from '@/services/api'

interface LanguageOption {
  code: string
  label: string
}

const languages: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pl', label: 'Polski' },
]

/* Inline SVG flags — work on all platforms including Windows */
const flags: Record<string, React.ReactNode> = {
  en: (
    <svg viewBox="0 0 60 30" width="28" height="18" style={{ display: 'block', borderRadius: '2px' }}>
      <clipPath id="s"><path d="M0,0 v30 h60 v-30 z"/></clipPath>
      <clipPath id="t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>
      <g clipPath="url(#s)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169"/>
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#t)" stroke="#C8102E" strokeWidth="4"/>
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10"/>
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6"/>
      </g>
    </svg>
  ),
  uk: (
    <svg viewBox="0 0 60 30" width="28" height="18" style={{ display: 'block', borderRadius: '2px' }}>
      <rect width="60" height="15" fill="#005BBB"/>
      <rect y="15" width="60" height="15" fill="#FFD500"/>
    </svg>
  ),
  fr: (
    <svg viewBox="0 0 60 30" width="28" height="18" style={{ display: 'block', borderRadius: '2px' }}>
      <rect width="20" height="30" fill="#002395"/>
      <rect x="20" width="20" height="30" fill="#fff"/>
      <rect x="40" width="20" height="30" fill="#ED2939"/>
    </svg>
  ),
  de: (
    <svg viewBox="0 0 60 30" width="28" height="18" style={{ display: 'block', borderRadius: '2px' }}>
      <rect width="60" height="10" fill="#000"/>
      <rect y="10" width="60" height="10" fill="#DD0000"/>
      <rect y="20" width="60" height="10" fill="#FFCC00"/>
    </svg>
  ),
  pl: (
    <svg viewBox="0 0 60 30" width="28" height="18" style={{ display: 'block', borderRadius: '2px' }}>
      <rect width="60" height="15" fill="#fff"/>
      <rect y="15" width="60" height="15" fill="#DC143C"/>
    </svg>
  ),
}

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
        style={{ padding: '3px', lineHeight: 0, overflow: 'hidden' }}
      >
        {flags[currentLang.code]}
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
              {flags[lang.code]}
              <span>{t(`language.${lang.code}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default LanguageSwitcher
