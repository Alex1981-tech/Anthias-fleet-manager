import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FaHistory, FaPlay, FaFilter, FaChevronLeft, FaChevronRight, FaInfoCircle } from 'react-icons/fa'
import { playbackLog, players as playersApi } from '@/services/api'
import type { PlaybackLogEntry, PlaybackLogResponse, Player } from '@/types'

const DeployHistory: React.FC = () => {
  const { t } = useTranslation()

  const [entries, setEntries] = useState<PlaybackLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [loading, setLoading] = useState(true)
  const [trackingInfo, setTrackingInfo] = useState<PlaybackLogResponse['tracking_info']>({})
  const [assetNames, setAssetNames] = useState<string[]>([])

  // Filters
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [content, setContent] = useState('')

  // Applied filters (only update on button click)
  const [appliedFilters, setAppliedFilters] = useState<{
    player: string; date_from: string; date_to: string; content: string
  }>({ player: '', date_from: '', date_to: '', content: '' })

  useEffect(() => {
    playersApi.list().then(setPlayers).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await playbackLog.list({
        player: appliedFilters.player || undefined,
        date_from: appliedFilters.date_from || undefined,
        date_to: appliedFilters.date_to || undefined,
        content: appliedFilters.content || undefined,
        page,
        page_size: pageSize,
      })
      setEntries(data.results)
      setTotal(data.total)
      setTrackingInfo(data.tracking_info)
      if (data.asset_names) setAssetNames(data.asset_names)
    } catch {
      setEntries([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [appliedFilters, page, pageSize])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleFilter = () => {
    setPage(1)
    setAppliedFilters({
      player: selectedPlayer,
      date_from: dateFrom ? new Date(dateFrom).toISOString() : '',
      date_to: dateTo ? new Date(dateTo).toISOString() : '',
      content,
    })
  }

  const totalPages = Math.ceil(total / pageSize)

  const trackingSinceDisplay = () => {
    const infos = Object.values(trackingInfo).filter((i) => i.tracking_since)
    if (infos.length === 0) return null

    if (appliedFilters.player) {
      const info = trackingInfo[appliedFilters.player]
      if (!info?.tracking_since) return null
      return (
        <span>
          <FaInfoCircle className="me-1" />
          {t('history.trackingSince')}: {new Date(info.tracking_since).toLocaleString()}
        </span>
      )
    }

    // Show earliest tracking date across all players
    const earliest = infos.reduce((min, i) => {
      if (!min || (i.tracking_since && i.tracking_since < min)) return i.tracking_since!
      return min
    }, '' as string)

    return (
      <span>
        <FaInfoCircle className="me-1" />
        {t('history.trackingSince')}: {new Date(earliest).toLocaleString()}
        {' '}({infos.length} {t('nav.players').toLowerCase()})
      </span>
    )
  }

  return (
    <div>
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaHistory className="page-icon" />
            {t('history.title')}
          </h1>
          <p className="page-subtitle">
            {t('history.subtitle')}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="fm-card fm-card-accent mb-3">
        <div className="fm-card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label small text-muted">{t('history.filterByPlayer')}</label>
              <select
                className="form-select"
                value={selectedPlayer}
                onChange={(e) => setSelectedPlayer(e.target.value)}
              >
                <option value="">{t('history.allPlayers')}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small text-muted">{t('history.dateFrom')}</label>
              <input
                type="datetime-local"
                className="form-control"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="col-md-2">
              <label className="form-label small text-muted">{t('history.dateTo')}</label>
              <input
                type="datetime-local"
                className="form-control"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small text-muted">{t('history.filterByContent')}</label>
              <select
                className="form-select"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              >
                <option value="">{t('common.all')}</option>
                {assetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <button className="fm-btn-primary w-100" onClick={handleFilter}>
                <FaFilter className="me-1" />
                {t('history.filter')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tracking info */}
      {trackingSinceDisplay() && (
        <div className="alert alert-info d-flex align-items-center mb-3" style={{ fontSize: '0.85rem' }}>
          {trackingSinceDisplay()}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="fm-loading">
          <div className="spinner" />
        </div>
      ) : entries.length === 0 ? (
        <div className="fm-empty-state">
          <div className="empty-icon">
            <FaHistory />
          </div>
          <h3 className="empty-title">{t('history.noData')}</h3>
          <p className="text-muted">{t('history.noDataHint')}</p>
        </div>
      ) : (
        <>
          <div className="fm-card fm-card-accent">
            <div className="fm-card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: '180px' }}>{t('history.time')}</th>
                      <th>{t('history.player')}</th>
                      <th>{t('history.asset')}</th>
                      <th>{t('history.type')}</th>
                      <th style={{ width: '60px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id}>
                        <td style={{ fontSize: '0.85rem' }}>
                          {new Date(entry.timestamp).toLocaleString()}
                        </td>
                        <td className="fw-medium">{entry.player_name}</td>
                        <td>{entry.asset_name}</td>
                        <td>
                          <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                            {entry.mimetype || '-'}
                          </span>
                        </td>
                        <td>
                          <span className="badge bg-success">
                            <FaPlay style={{ fontSize: '0.6rem' }} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                {t('history.page')} {page} / {totalPages} ({total})
              </span>
              <div className="d-flex gap-2">
                <button
                  className="fm-btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <FaChevronLeft className="me-1" />
                  {t('history.prev')}
                </button>
                <button
                  className="fm-btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  {t('history.next')}
                  <FaChevronRight className="ms-1" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default DeployHistory
