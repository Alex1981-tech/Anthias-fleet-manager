export const APP_VERSION = '1.4.0'

export interface ChangelogEntry {
  version: string
  date: string
  changeKeys: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '1.4.0',
    date: '2026-02-15',
    changeKeys: [
      'cctvPolish',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-02-15',
    changeKeys: [
      'cctvStreamFixes',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-02-15',
    changeKeys: [
      'updateReliability',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-02-15',
    changeKeys: [
      'cctvContentIntegration',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-02-15',
    changeKeys: [
      'cctvStreams',
      'historyFilters',
    ],
  },
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
