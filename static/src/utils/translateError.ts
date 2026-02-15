import type { TFunction } from 'i18next'

/**
 * Maps known English API error messages to i18n keys.
 * Returns translated string or the original message if no match.
 */

interface ErrorPattern {
  test: RegExp | string
  key: string
  extract?: (msg: string) => Record<string, string>
}

const patterns: ErrorPattern[] = [
  // Schedule slot errors
  { test: 'Slot not found', key: 'apiErrors.slotNotFound' },
  { test: /^Asset .+ not found$/, key: 'apiErrors.assetNotFound' },
  { test: 'This asset is already in this slot', key: 'apiErrors.assetAlreadyInSlot' },
  { test: 'Item not found', key: 'apiErrors.itemNotFound' },
  { test: /days_of_week must be a JSON array/, key: 'apiErrors.daysOfWeekInvalid' },
  { test: /days_of_week must be a non-empty/, key: 'apiErrors.daysOfWeekEmpty' },
  { test: /^Invalid day:/, key: 'apiErrors.invalidDay' },
  { test: /default slot already exists/, key: 'apiErrors.defaultSlotExists' },
  { test: /time_from and time_to are required/, key: 'apiErrors.timeRequired' },
  { test: /time_from and time_to must be different/, key: 'apiErrors.timeMustDiffer' },
  { test: /Time range overlaps with slot/, key: 'apiErrors.timeOverlap' },

  // Connection errors
  { test: /returned repeated errors/, key: 'apiErrors.repeatedErrors' },
  { test: /Failed to fetch|NetworkError|network error/i, key: 'apiErrors.networkError' },
  { test: 'Backup failed', key: 'apiErrors.backupFailed' },
  { test: 'Screenshot failed', key: 'apiErrors.screenshotFailed' },
  { test: /Upload failed/i, key: 'apiErrors.uploadFailed' },

  // HTTP errors
  {
    test: /^HTTP (\d+)$/,
    key: 'apiErrors.httpError',
    extract: (msg: string) => {
      const m = msg.match(/^HTTP (\d+)$/)
      return { code: m ? m[1] : '500' }
    },
  },
]

function matchPattern(msg: string, p: ErrorPattern): boolean {
  return typeof p.test === 'string' ? msg === p.test : p.test.test(msg)
}

export function translateApiError(message: string | undefined, t: TFunction): string {
  if (!message) return String(t('schedule.failed'))

  for (const p of patterns) {
    if (matchPattern(message, p)) {
      const params = p.extract ? p.extract(message) : undefined
      return String(t(p.key, params))
    }
  }

  // DRF serializer field errors forwarded as "field: message; field2: message2"
  // Try to translate individual parts
  if (message.includes(': ') && message.includes(';')) {
    const parts = message.split('; ')
    const translated = parts.map(part => {
      const partMsg = part.includes(': ') ? part.split(': ').slice(1).join(': ') : part
      for (const p of patterns) {
        if (matchPattern(partMsg, p)) {
          const params = p.extract ? p.extract(partMsg) : undefined
          return String(t(p.key, params))
        }
      }
      return part
    })
    return translated.join('; ')
  }

  return message
}
