import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaServer,
  FaMicrochip,
  FaMemory,
  FaHdd,
  FaClock,
  FaThermometerHalf,
  FaSyncAlt,
} from 'react-icons/fa'
import { system } from '@/services/api'
import type { ServerTelemetry } from '@/types'

const POLL_INTERVAL = 30_000

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function getBarColor(percent: number): string {
  if (percent >= 80) return 'var(--telemetry-red)'
  if (percent >= 60) return 'var(--telemetry-yellow)'
  return 'var(--telemetry-green)'
}

const ServerTelemetryCard: React.FC = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<ServerTelemetry | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchTelemetry = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const result = await system.getTelemetry()
      setData(result)
    } catch {
      // silently ignore — telemetry is non-critical
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchTelemetry()
    const interval = setInterval(() => fetchTelemetry(), POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchTelemetry])

  if (loading) {
    return (
      <div className="fm-telemetry-card">
        <div className="telemetry-header">
          <FaServer className="telemetry-header-icon" />
          <span>{t('dashboard.serverTelemetry')}</span>
        </div>
        <div className="telemetry-loading">
          <div className="spinner" />
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="fm-telemetry-card">
      <div className="telemetry-header">
        <FaServer className="telemetry-header-icon" />
        <span>{t('dashboard.serverTelemetry')}</span>
        <span className="telemetry-uptime">
          <FaClock /> {formatUptime(data.uptime_seconds)}
        </span>
        {data.cpu_temp != null && (
          <span className="telemetry-temp">
            <FaThermometerHalf /> {data.cpu_temp}&deg;C
          </span>
        )}
        <button
          className="telemetry-refresh-btn"
          onClick={() => fetchTelemetry(true)}
          disabled={refreshing}
          title={t('common.refresh')}
        >
          <FaSyncAlt className={refreshing ? 'fa-spin' : ''} />
        </button>
      </div>

      <div className="telemetry-body">
        <div className="telemetry-metric">
          <div className="metric-label">
            <FaMicrochip className="metric-icon" />
            {t('dashboard.cpu')}
          </div>
          <div className="metric-bar-wrap">
            <div className="metric-bar">
              <div
                className="metric-bar-fill"
                style={{
                  width: `${Math.min(data.cpu_percent, 100)}%`,
                  backgroundColor: getBarColor(data.cpu_percent),
                }}
              />
            </div>
          </div>
          <div className="metric-value">{data.cpu_percent}%</div>
          <div className="metric-detail">
            {data.cpu_count} {t('dashboard.cores')}{data.cpu_freq_mhz != null && ` / ${data.cpu_freq_mhz} MHz`}
          </div>
        </div>

        <div className="telemetry-metric">
          <div className="metric-label">
            <FaMemory className="metric-icon" />
            {t('dashboard.memory')}
          </div>
          <div className="metric-bar-wrap">
            <div className="metric-bar">
              <div
                className="metric-bar-fill"
                style={{
                  width: `${Math.min(data.memory_percent, 100)}%`,
                  backgroundColor: getBarColor(data.memory_percent),
                }}
              />
            </div>
          </div>
          <div className="metric-value">{data.memory_used_gb}/{data.memory_total_gb} GB</div>
          <div className="metric-detail">{data.memory_percent}%</div>
        </div>

        <div className="telemetry-metric">
          <div className="metric-label">
            <FaHdd className="metric-icon" />
            {t('dashboard.disk')}
          </div>
          <div className="metric-bar-wrap">
            <div className="metric-bar">
              <div
                className="metric-bar-fill"
                style={{
                  width: `${Math.min(data.disk_percent, 100)}%`,
                  backgroundColor: getBarColor(data.disk_percent),
                }}
              />
            </div>
          </div>
          <div className="metric-value">{data.disk_used_gb}/{data.disk_total_gb} GB</div>
          <div className="metric-detail">{data.disk_percent}%</div>
        </div>
      </div>
    </div>
  )
}

export default ServerTelemetryCard
