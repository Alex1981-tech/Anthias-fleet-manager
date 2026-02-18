export const APP_VERSION = '1.8.2'

export interface ChangelogEntry {
  version: string
  date: string
  changeKeys: string[]
}

export const changelog: ChangelogEntry[] = [
  {
    version: '1.8.2',
    date: '2026-02-18',
    changeKeys: [
      'pi5PlayerSupport',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-02-18',
    changeKeys: [
      'irFallbackPower',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-02-18',
    changeKeys: [
      'perAssetVolume',
      'iconOnlyButtons',
    ],
  },
  {
    version: '1.7.5',
    date: '2026-02-17',
    changeKeys: [
      'cheatsheetContainerFix',
    ],
  },
  {
    version: '1.7.4',
    date: '2026-02-17',
    changeKeys: [
      'nginxAutoUpdate',
    ],
  },
  {
    version: '1.7.3',
    date: '2026-02-17',
    changeKeys: [
      'terminalCheatsheet',
      'autoSshCreds',
    ],
  },
  {
    version: '1.7.2',
    date: '2026-02-17',
    changeKeys: [
      'fullAuditCoverage',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-02-17',
    changeKeys: [
      'terminalProtocolFix',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-02-17',
    changeKeys: [
      'rbacUsers',
      'auditLog',
      'remoteTerminal',
      'bulkProvisioning',
    ],
  },
  {
    version: '1.6.1',
    date: '2026-02-17',
    changeKeys: [
      'tokenAuth',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-02-17',
    changeKeys: [
      'hoverPreview',
      'displayOffTimeline',
      'settingsLayout',
      'flagSwitcher',
      'playbackStatsFix',
    ],
  },
  {
    version: '1.5.9',
    date: '2026-02-17',
    changeKeys: [
      'cecMonitorControl',
      'scheduleTimelineRedesign',
      'slotContentModal',
      'scrollOptimistic',
    ],
  },
  {
    version: '1.5.8',
    date: '2026-02-17',
    changeKeys: [
      'macIdentity',
    ],
  },
  {
    version: '1.5.7',
    date: '2026-02-16',
    changeKeys: [
      'loginRedirectLoop',
    ],
  },
  {
    version: '1.5.6',
    date: '2026-02-16',
    changeKeys: [
      'cctvSnapshotRate',
    ],
  },
  {
    version: '1.5.5',
    date: '2026-02-16',
    changeKeys: [
      'tailscaleAutoDetect',
    ],
  },
  {
    version: '1.5.4',
    date: '2026-02-16',
    changeKeys: [
      'slotLibraryFix',
    ],
  },
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
