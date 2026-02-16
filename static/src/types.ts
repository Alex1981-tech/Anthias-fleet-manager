export interface Group {
  id: string
  name: string
  color: string
  description: string
  created_at: string
}

export interface Player {
  id: string
  name: string
  url: string
  username: string
  group: Group | null
  group_detail?: Group | null
  is_online: boolean
  last_seen: string | null
  last_status: Record<string, unknown>
  created_at: string
}

export interface PlayerInfo {
  viewlog: string
  loadavg: number
  free_space: string
  display_power: string | null
  up_to_date: boolean
  anthias_version?: string
  device_model?: string
  uptime?: { days: number; hours: number }
  memory?: { total: number; used: number; free: number; available: number }
  ip_addresses?: string[]
  mac_address?: string
  cpu_temp?: number | null
  cpu_usage?: number
  cpu_freq?: { current: number; max: number } | null
  throttle_state?: number | null
  disk_usage?: { total_gb: number; used_gb: number; free_gb: number; percent: number }
}

export interface MediaFolder {
  id: string
  name: string
  file_count: number
  created_at: string
}

export interface MediaFile {
  id: string
  name: string
  file: string | null
  source_url: string | null
  thumbnail_url: string | null
  thumbnail_file_url: string | null
  file_type: 'image' | 'video' | 'web' | 'cctv' | 'other'
  file_size: number
  processing_status: 'ready' | 'processing' | 'failed'
  url: string
  folder: string | null
  folder_name: string | null
  cctv_config?: CctvConfig | null
  created_at: string
}

export interface PlayerAsset {
  asset_id: string
  name: string
  uri: string
  start_date: string
  end_date: string
  duration: number
  mimetype: string
  is_enabled: number | boolean
  nocache: number | boolean
  play_order: number
  skip_asset_check: number | boolean
  is_active: boolean
  is_processing: boolean
}

export interface PlaybackLogEntry {
  id: number
  player: string
  player_name: string
  asset_id: string
  asset_name: string
  mimetype: string
  event: 'started' | 'stopped'
  timestamp: string
}

export interface PlaybackStatsResponse {
  stats: Record<string, number>
}

export interface PlaybackLogResponse {
  results: PlaybackLogEntry[]
  total: number
  page: number
  page_size: number
  tracking_info: Record<string, { name: string; tracking_since: string | null }>
  asset_names: string[]
}

export type SlotType = 'default' | 'time' | 'event'

export interface ScheduleSlot {
  slot_id: string
  name: string
  slot_type: SlotType
  time_from: string
  time_to: string
  days_of_week: number[]
  is_default: boolean
  start_date: string | null
  end_date: string | null
  no_loop: boolean
  sort_order: number
  items: ScheduleSlotItem[]
  is_currently_active: boolean
}

export interface ScheduleSlotItem {
  item_id: string
  slot_id: string
  asset_id: string
  sort_order: number
  duration_override: number | null
  asset_name: string
  asset_uri: string
  asset_mimetype: string
  asset_duration: number
  effective_duration: number
}

export interface ScheduleStatus {
  schedule_enabled: boolean
  current_slot: ScheduleSlot | null
  next_change_at: string | null
  total_slots: number
  using_default: boolean
}

export interface CctvCamera {
  id: string
  name: string
  rtsp_url: string
  sort_order: number
}

export interface CctvConfig {
  id: string
  name: string
  display_mode: 'mosaic' | 'rotation'
  rotation_interval: number
  resolution: string
  fps: number
  is_active: boolean
  cameras: CctvCamera[]
  media_file_id?: string | null
  created_at: string
}

export interface DeployTask {
  id: string
  name: string
  asset_data: Record<string, unknown>
  target_players: string[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: Record<string, { status: string; name: string; error?: string }>
  created_at: string
}
