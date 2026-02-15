export const APP_VERSION = '1.1.0'

export interface ChangelogEntry {
  version: string
  date: string
  changeKeys: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-02-15',
    changeKeys: [
      'autoDeployUpdate',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-02-15',
    changeKeys: [
      'initialRelease',
      'dashboard',
      'contentLibrary',
      'deployContent',
      'playbackHistory',
      'scheduleManagement',
      'playerScreenshots',
      'autoRegistration',
      'darkLightTheme',
      'multiLanguage',
      'securityHardening',
    ],
  },
]
