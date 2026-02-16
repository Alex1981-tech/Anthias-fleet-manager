import type { Player, Group, PlayerInfo, PlayerAsset, DeployTask, MediaFile, MediaFolder, PlaybackLogResponse, PlaybackStatsResponse, ScheduleSlot, ScheduleSlotItem, ScheduleStatus, CctvConfig, PlayerUpdateCheckResult, ProvisionTask } from '@/types'

const BASE_URL = '/api'

function getCsrfToken(): string {
  const match = document.cookie.match(/csrftoken=([^;]+)/)
  return match ? match[1] : ''
}

async function apiRequest<T = unknown>(
  method: string,
  url: string,
  data?: Record<string, unknown> | FormData,
): Promise<T> {
  const headers: Record<string, string> = {
    'X-CSRFToken': getCsrfToken(),
  }

  const config: RequestInit = {
    method,
    headers,
    credentials: 'same-origin',
  }

  if (data) {
    if (data instanceof FormData) {
      config.body = data
    } else {
      headers['Content-Type'] = 'application/json'
      config.body = JSON.stringify(data)
    }
  }

  const response = await fetch(`${BASE_URL}${url}`, config)

  if (!response.ok) {
    if (response.status === 403 && !url.startsWith('/auth/')) {
      window.location.href = '/login'
      throw new Error('Authentication required')
    }
    let errorMessage = `HTTP ${response.status}`
    try {
      const errorData = await response.json()
      errorMessage = errorData.error || errorData.detail || errorData.message || JSON.stringify(errorData)
    } catch {
      errorMessage = response.statusText || errorMessage
    }
    throw new Error(errorMessage)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export const players = {
  list(): Promise<Player[]> {
    return apiRequest<Player[]>('GET', '/players/')
  },

  get(id: string): Promise<Player> {
    return apiRequest<Player>('GET', `/players/${id}/`)
  },

  create(data: Partial<Player> & { password?: string }): Promise<Player> {
    return apiRequest<Player>('POST', '/players/', data)
  },

  update(id: string, data: Partial<Player> & { password?: string }): Promise<Player> {
    return apiRequest<Player>('PUT', `/players/${id}/`, data)
  },

  partialUpdate(id: string, data: Partial<Player>): Promise<Player> {
    return apiRequest<Player>('PATCH', `/players/${id}/`, data)
  },

  delete(id: string): Promise<void> {
    return apiRequest<void>('DELETE', `/players/${id}/`)
  },

  testConnection(id: string): Promise<{ success: boolean; message: string }> {
    return apiRequest('POST', `/players/${id}/test-connection/`)
  },

  getInfo(id: string): Promise<PlayerInfo> {
    return apiRequest<PlayerInfo>('GET', `/players/${id}/info/`)
  },

  getAssets(id: string): Promise<PlayerAsset[]> {
    return apiRequest<PlayerAsset[]>('GET', `/players/${id}/assets/`)
  },

  updateAsset(playerId: string, assetId: string, data: Partial<PlayerAsset>): Promise<PlayerAsset> {
    return apiRequest('PATCH', `/players/${playerId}/asset-update/`, { asset_id: assetId, ...data })
  },

  deleteAsset(playerId: string, assetId: string): Promise<{ success: boolean }> {
    return apiRequest('POST', `/players/${playerId}/asset-delete/`, { asset_id: assetId })
  },

  createAsset(playerId: string, data: Record<string, unknown>): Promise<PlayerAsset> {
    return apiRequest('POST', `/players/${playerId}/asset-create/`, data)
  },

  deployContent(playerId: string, mediaFileId: string, overrides?: Record<string, unknown>): Promise<PlayerAsset> {
    return apiRequest('POST', `/players/${playerId}/asset-upload/`, { media_file_id: mediaFileId, ...overrides })
  },

  getSettings(id: string): Promise<Record<string, unknown>> {
    return apiRequest('GET', `/players/${id}/device-settings/`)
  },

  saveSettings(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return apiRequest('PATCH', `/players/${id}/device-settings/`, data)
  },

  playbackControl(id: string, command: 'next' | 'previous'): Promise<{ success: boolean }> {
    return apiRequest('POST', `/players/${id}/playback-control/`, { command })
  },

  nowPlaying(id: string): Promise<{ asset_id: string; asset_name: string; mimetype: string; started_at: string } | null> {
    return apiRequest('GET', `/players/${id}/now-playing/`)
  },

  reboot(id: string): Promise<{ success: boolean }> {
    return apiRequest('POST', `/players/${id}/reboot/`)
  },

  shutdown(id: string): Promise<{ success: boolean }> {
    return apiRequest('POST', `/players/${id}/shutdown/`)
  },

  backup(id: string): Promise<Blob> {
    return fetch(`${BASE_URL}/players/${id}/backup/`, {
      method: 'POST',
      headers: { 'X-CSRFToken': getCsrfToken() },
      credentials: 'same-origin',
    }).then((res) => {
      if (!res.ok) throw new Error('Backup failed')
      return res.blob()
    })
  },

  getScreenshot(id: string): Promise<string> {
    return fetch(`${BASE_URL}/players/${id}/screenshot/`, {
      credentials: 'same-origin',
    }).then((res) => {
      if (!res.ok) throw new Error('Screenshot failed')
      return res.blob()
    }).then((blob) => URL.createObjectURL(blob))
  },

  updateCheck(id: string): Promise<PlayerUpdateCheckResult> {
    return apiRequest<PlayerUpdateCheckResult>('GET', `/players/${id}/update-check/`)
  },

  triggerUpdate(id: string): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>('POST', `/players/${id}/update/`)
  },
}

export const schedule = {
  getSlots(playerId: string): Promise<ScheduleSlot[]> {
    return apiRequest<ScheduleSlot[]>('GET', `/players/${playerId}/schedule-slots/`)
  },

  getStatus(playerId: string): Promise<ScheduleStatus> {
    return apiRequest<ScheduleStatus>('GET', `/players/${playerId}/schedule-status/`)
  },

  createSlot(playerId: string, data: Partial<ScheduleSlot>): Promise<{ success: boolean; slot: ScheduleSlot }> {
    return apiRequest('POST', `/players/${playerId}/schedule-slot-create/`, data)
  },

  updateSlot(playerId: string, slotId: string, data: Partial<ScheduleSlot>): Promise<{ success: boolean; slot: ScheduleSlot }> {
    return apiRequest('PUT', `/players/${playerId}/schedule-slot-update/`, { slot_id: slotId, ...data })
  },

  deleteSlot(playerId: string, slotId: string): Promise<{ success: boolean }> {
    return apiRequest('POST', `/players/${playerId}/schedule-slot-delete/`, { slot_id: slotId })
  },

  addItem(playerId: string, slotId: string, data: { asset_id: string; duration_override?: number | null }): Promise<{ success: boolean; item: ScheduleSlotItem }> {
    return apiRequest('POST', `/players/${playerId}/schedule-slot-item-add/`, { slot_id: slotId, ...data })
  },

  removeItem(playerId: string, slotId: string, itemId: string): Promise<{ success: boolean }> {
    return apiRequest('POST', `/players/${playerId}/schedule-slot-item-remove/`, { slot_id: slotId, item_id: itemId })
  },

  updateItem(playerId: string, slotId: string, itemId: string, data: { duration_override?: number | null }): Promise<{ success: boolean; item: ScheduleSlotItem }> {
    return apiRequest('PUT', `/players/${playerId}/schedule-slot-item-update/`, { slot_id: slotId, item_id: itemId, ...data })
  },

  reorderItems(playerId: string, slotId: string, ids: string[]): Promise<ScheduleSlotItem[]> {
    return apiRequest('POST', `/players/${playerId}/schedule-slot-items-reorder/`, { slot_id: slotId, ids })
  },
}

export const groups = {
  list(): Promise<Group[]> {
    return apiRequest<Group[]>('GET', '/groups/')
  },

  get(id: string): Promise<Group> {
    return apiRequest<Group>('GET', `/groups/${id}/`)
  },

  create(data: Partial<Group>): Promise<Group> {
    return apiRequest<Group>('POST', '/groups/', data)
  },

  update(id: string, data: Partial<Group>): Promise<Group> {
    return apiRequest<Group>('PUT', `/groups/${id}/`, data)
  },

  delete(id: string): Promise<void> {
    return apiRequest<void>('DELETE', `/groups/${id}/`)
  },
}

export const media = {
  async list(): Promise<MediaFile[]> {
    const data = await apiRequest<{ results: MediaFile[] } | MediaFile[]>('GET', '/media/?page_size=10000')
    return Array.isArray(data) ? data : data.results
  },

  upload(file: File, name?: string, onProgress?: (pct: number) => void): Promise<MediaFile> {
    return new Promise((resolve, reject) => {
      const formData = new FormData()
      formData.append('file', file)
      if (name) formData.append('name', name)

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${BASE_URL}/media/`)
      xhr.setRequestHeader('X-CSRFToken', getCsrfToken())
      xhr.withCredentials = true

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          let msg = `Upload failed: HTTP ${xhr.status}`
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.name) msg = Array.isArray(data.name) ? data.name[0] : data.name
            else if (data.detail) msg = data.detail
            else if (data.message) msg = data.message
          } catch { /* ignore */ }
          reject(new Error(msg))
        }
      }
      xhr.onerror = () => reject(new Error('Upload failed: network error'))
      xhr.send(formData)
    })
  },

  addUrl(sourceUrl: string, name?: string): Promise<MediaFile> {
    return apiRequest<MediaFile>('POST', '/media/', {
      source_url: sourceUrl,
      name: name || sourceUrl,
    })
  },

  rename(id: string, name: string): Promise<MediaFile> {
    return apiRequest<MediaFile>('PATCH', `/media/${id}/`, { name })
  },

  delete(id: string): Promise<void> {
    return apiRequest<void>('DELETE', `/media/${id}/`)
  },

  moveToFolder(id: string, folderId: string | null): Promise<MediaFile> {
    return apiRequest<MediaFile>('PATCH', `/media/${id}/`, { folder: folderId })
  },
}

export const folders = {
  async list(): Promise<MediaFolder[]> {
    const data = await apiRequest<{ results: MediaFolder[] } | MediaFolder[]>('GET', '/folders/')
    return Array.isArray(data) ? data : data.results
  },

  create(name: string): Promise<MediaFolder> {
    return apiRequest<MediaFolder>('POST', '/folders/', { name })
  },

  update(id: string, name: string): Promise<MediaFolder> {
    return apiRequest<MediaFolder>('PATCH', `/folders/${id}/`, { name })
  },

  delete(id: string): Promise<void> {
    return apiRequest<void>('DELETE', `/folders/${id}/`)
  },
}

export const deploy = {
  async list(): Promise<DeployTask[]> {
    const data = await apiRequest<{ results: DeployTask[] } | DeployTask[]>('GET', '/deploy/')
    return Array.isArray(data) ? data : data.results
  },

  get(id: string): Promise<DeployTask> {
    return apiRequest<DeployTask>('GET', `/deploy/${id}/`)
  },

  create(data: Partial<DeployTask>): Promise<DeployTask> {
    return apiRequest<DeployTask>('POST', '/deploy/', data)
  },
}

export const playbackLog = {
  list(params: { player?: string; date_from?: string; date_to?: string; content?: string; page?: number; page_size?: number } = {}): Promise<PlaybackLogResponse> {
    const searchParams = new URLSearchParams()
    if (params.player) searchParams.set('player', params.player)
    if (params.date_from) searchParams.set('date_from', params.date_from)
    if (params.date_to) searchParams.set('date_to', params.date_to)
    if (params.content) searchParams.set('content', params.content)
    if (params.page) searchParams.set('page', String(params.page))
    if (params.page_size) searchParams.set('page_size', String(params.page_size))
    const qs = searchParams.toString()
    return apiRequest<PlaybackLogResponse>('GET', `/playback-log/${qs ? '?' + qs : ''}`)
  },

  stats(): Promise<PlaybackStatsResponse> {
    return apiRequest<PlaybackStatsResponse>('GET', '/playback-stats/')
  },
}

export async function pushLanguageToPlayers(language: string) {
  try {
    const allPlayers = await players.list()
    await Promise.allSettled(
      allPlayers.map((p) =>
        players.saveSettings(p.id, { language }).catch(() => {}),
      ),
    )
  } catch {
    // fire-and-forget: offline players just skip
  }
}

export const bulk = {
  reboot(playerIds: string[]): Promise<{ success: boolean }> {
    return apiRequest('POST', '/bulk/reboot/', { player_ids: playerIds })
  },

  shutdown(playerIds: string[]): Promise<{ success: boolean }> {
    return apiRequest('POST', '/bulk/shutdown/', { player_ids: playerIds })
  },
}

export const cctv = {
  list(): Promise<CctvConfig[]> {
    return apiRequest<CctvConfig[]>('GET', '/cctv/')
  },

  get(id: string): Promise<CctvConfig> {
    return apiRequest<CctvConfig>('GET', `/cctv/${id}/`)
  },

  create(data: Record<string, unknown>): Promise<CctvConfig> {
    return apiRequest<CctvConfig>('POST', '/cctv/', data)
  },

  update(id: string, data: Record<string, unknown>): Promise<CctvConfig> {
    return apiRequest<CctvConfig>('PUT', `/cctv/${id}/`, data)
  },

  delete(id: string): Promise<void> {
    return apiRequest<void>('DELETE', `/cctv/${id}/`)
  },

  start(id: string): Promise<{ success: boolean; status: string }> {
    return apiRequest('POST', `/cctv/${id}/start/`)
  },

  stop(id: string): Promise<{ success: boolean; status: string }> {
    return apiRequest('POST', `/cctv/${id}/stop/`)
  },

  status(id: string): Promise<{ status: string; pids: number[] }> {
    return apiRequest('GET', `/cctv/${id}/status/`)
  },

  requestStart(id: string): Promise<{ success: boolean; status: string }> {
    return apiRequest('POST', `/cctv/${id}/request-start/`)
  },
}

export const provision = {
  create(data: { ip_address: string; ssh_user?: string; ssh_password: string; ssh_port?: number; player_name?: string }): Promise<ProvisionTask> {
    return apiRequest<ProvisionTask>('POST', '/provision/', data)
  },

  get(taskId: string): Promise<ProvisionTask> {
    return apiRequest<ProvisionTask>('GET', `/provision/${taskId}/`)
  },

  retry(taskId: string, sshPassword: string): Promise<ProvisionTask> {
    return apiRequest<ProvisionTask>('POST', `/provision/${taskId}/retry/`, { ssh_password: sshPassword })
  },
}

export const system = {
  getVersion(): Promise<{ version: string; build_date: string }> {
    return apiRequest('GET', '/system/version/')
  },

  checkForUpdate(force?: boolean): Promise<{
    current_version: string
    latest_version: string | null
    update_available: boolean
    release_url?: string
    published_at?: string
    error?: string
  }> {
    const qs = force ? '?force=1' : ''
    return apiRequest('GET', `/system/update-check/${qs}`)
  },

  triggerUpdate(): Promise<{ success: boolean; message: string }> {
    return apiRequest('POST', '/system/update/')
  },

  getSettings(): Promise<{ auto_update: boolean }> {
    return apiRequest('GET', '/system/settings/')
  },

  updateSettings(data: { auto_update: boolean }): Promise<{ auto_update: boolean }> {
    return apiRequest('PATCH', '/system/settings/', data)
  },
}
