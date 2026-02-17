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
  mac_address?: string
  tailscale_ip: string | null
  tailscale_enabled: boolean
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

export interface TailscaleSettings {
  tailscale_enabled: boolean
  has_authkey: boolean
  fm_tailscale_ip: string
  detected_ip: string
  status: 'connected' | 'disconnected' | 'not_installed'
}

export interface PlayerUpdateCheckResult {
  current_version: string
  current_sha: string
  latest_sha: string
  latest_version: string
  update_available: boolean
  error?: string
}

export interface CecStatus {
  cec_available: boolean
  tv_on: boolean
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

export interface ProvisionStep {
  step: number
  name: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  message: string
  timestamp: string
}

export type UserRole = 'viewer' | 'editor' | 'admin'

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_active: boolean
  role: UserRole
  last_login: string | null
  date_joined: string
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  user: number | null
  username: string | null
  action: string
  target_type: string
  target_id: string
  target_name: string
  details: Record<string, unknown>
  ip_address: string | null
}

export interface AuditLogResponse {
  results: AuditLogEntry[]
  total: number
  page: number
  page_size: number
}

export interface BulkProvisionTask {
  id: string
  created_at: string
  created_by: number | null
  created_by_username: string | null
  status: 'pending' | 'scanning' | 'provisioning' | 'completed' | 'failed'
  scan_method: string
  ip_range_start: string | null
  ip_range_end: string | null
  discovered_ips: string[]
  selected_ips: string[]
  results: Record<string, {
    status: string
    player_id?: string | null
    task_id?: string
    error?: string
  }>
}

export interface ProvisionTask {
  id: string
  ip_address: string
  ssh_user: string
  ssh_port: number
  player_name: string
  status: 'pending' | 'running' | 'success' | 'failed'
  current_step: number
  total_steps: number
  steps: ProvisionStep[]
  error_message: string
  log_output: string
  player_id: string | null
  player_name_result: string | null
  created_at: string
  updated_at: string
}
