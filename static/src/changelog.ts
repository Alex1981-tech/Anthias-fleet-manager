export const APP_VERSION = '1.5.3'

export interface ChangelogEntry {
  version: string
  date: string
  changeKeys: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '1.5.3',
    date: '2026-02-16',
    changeKeys: [
      'multiFileUploadFix',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-02-16',
    changeKeys: [
      'tailscaleIntegration',
      'provisionFixes',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-02-16',
    changeKeys: [
      'provisionPlayer',
    ],
  },
  {
    version: '1.4.9',
    date: '2026-02-16',
    changeKeys: [
      'cctvStreamLifecycle',
    ],
  },
  {
    version: '1.4.8',
    date: '2026-02-16',
    changeKeys: [
      'registerTokenAuth',
      'eslintSetup',
      'ssrfDnsFix',
      'silentExceptionLogging',
      'forgetPlayerButton',
      'testSuiteFix',
    ],
  },
  {
    version: '1.4.7',
    date: '2026-02-16',
    changeKeys: [
      'cctvNowPlayingDetection',
      'emptySlotFallback',
    ],
  },
  {
    version: '1.4.6',
    date: '2026-02-16',
    changeKeys: [
      'reliableUpdateProcess',
    ],
  },
  {
    version: '1.4.5',
    date: '2026-02-16',
    changeKeys: [
      'standardPlayerCompat',
    ],
  },
  {
    version: '1.4.4',
    date: '2026-02-16',
    changeKeys: [
      'cctvLiveViewFix',
    ],
  },
  {
    version: '1.4.3',
    date: '2026-02-15',
    changeKeys: [
      'friendlyUpdateUx',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-02-15',
    changeKeys: [
      'cctvLiveView',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-02-15',
    changeKeys: [
      'reliableUpdates',
    ],
  },
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
