import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from '@/locales/en.json'
import uk from '@/locales/uk.json'
import fr from '@/locales/fr.json'
import de from '@/locales/de.json'
import pl from '@/locales/pl.json'

const resources = {
  en: { translation: en },
  uk: { translation: uk },
  fr: { translation: fr },
  de: { translation: de },
  pl: { translation: pl },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'uk', 'fr', 'de', 'pl'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['cookie', 'localStorage', 'navigator'],
      caches: ['cookie', 'localStorage'],
      lookupCookie: 'django_language',
      lookupLocalStorage: 'i18nextLng',
    },
  })

export default i18n
