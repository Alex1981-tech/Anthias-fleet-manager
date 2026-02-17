import React, { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { FaHistory, FaFilter } from 'react-icons/fa'
import { audit as auditApi } from '@/services/api'
import type { AuditLogEntry } from '@/types'

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-success',
  update: 'bg-primary',
  delete: 'bg-danger',
  deactivate: 'bg-danger',
  login: 'bg-info',
  login_failed: 'bg-warning text-dark',
  logout: 'bg-secondary',
  reboot: 'bg-warning text-dark',
  provision: 'bg-purple',
  bulk_provision: 'bg-purple',
}

const AuditLog: React.FC = () => {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterAction, setFilterAction] = useState('')
  const [filterTargetType, setFilterTargetType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const pageSize = 30

  const load = useCallback(() => {
    setLoading(true)
    auditApi.list({
      action: filterAction || undefined,
      target_type: filterTargetType || undefined,
      from: filterFrom || undefined,
      to: filterTo || undefined,
      page,
      page_size: pageSize,
    }).then((res) => {
      setEntries(res.results)
      setTotal(res.total)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [filterAction, filterTargetType, filterFrom, filterTo, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaHistory className="page-icon" />
            {t('audit.title')}
          </h1>
          <p className="page-subtitle">{t('audit.subtitle')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="fm-card fm-card-accent mb-3">
        <div className="fm-card-body py-2">
          <div className="row g-2 align-items-end">
            <div className="col-auto">
              <label className="form-label mb-0" style={{ fontSize: '0.8rem' }}><FaFilter /> {t('audit.action')}</label>
              <select className="form-select form-select-sm" value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}>
                <option value="">{t('common.all')}</option>
                {['create', 'update', 'delete', 'deactivate', 'login', 'login_failed', 'logout', 'reboot', 'provision', 'bulk_provision'].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="col-auto">
              <label className="form-label mb-0" style={{ fontSize: '0.8rem' }}>{t('audit.targetType')}</label>
              <select className="form-select form-select-sm" value={filterTargetType} onChange={(e) => { setFilterTargetType(e.target.value); setPage(1) }}>
                <option value="">{t('common.all')}</option>
                {['player', 'user', 'media', 'session', 'settings'].map(tt => (
                  <option key={tt} value={tt}>{tt}</option>
                ))}
              </select>
            </div>
            <div className="col-auto">
              <label className="form-label mb-0" style={{ fontSize: '0.8rem' }}>{t('audit.dateFrom')}</label>
              <input type="datetime-local" className="form-control form-control-sm" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setPage(1) }} />
            </div>
            <div className="col-auto">
              <label className="form-label mb-0" style={{ fontSize: '0.8rem' }}>{t('audit.dateTo')}</label>
              <input type="datetime-local" className="form-control form-control-sm" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setPage(1) }} />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="fm-card fm-card-accent">
        <div className="fm-card-body py-2">
          {loading ? (
            <p className="text-muted text-center py-3">{t('common.loading')}</p>
          ) : entries.length === 0 ? (
            <p className="text-muted text-center py-3">{t('audit.noEntries')}</p>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table table-sm fm-table mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: '150px' }}>{t('audit.time')}</th>
                      <th>{t('audit.user')}</th>
                      <th>{t('audit.action')}</th>
                      <th>{t('audit.targetType')}</th>
                      <th>{t('audit.target')}</th>
                      <th>{t('audit.ip')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td style={{ fontSize: '0.8rem' }}>{new Date(e.timestamp).toLocaleString()}</td>
                        <td>{e.username || '—'}</td>
                        <td>
                          <span className={`badge ${ACTION_COLORS[e.action] || 'bg-secondary'}`}>
                            {e.action}
                          </span>
                        </td>
                        <td>{e.target_type}</td>
                        <td className="text-truncate" style={{ maxWidth: '200px' }}>
                          {e.target_name || e.target_id || '—'}
                        </td>
                        <td style={{ fontSize: '0.8rem' }}>{e.ip_address || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="d-flex justify-content-between align-items-center mt-2">
                  <span style={{ fontSize: '0.8rem' }}>{t('audit.showing', { count: entries.length, total })}</span>
                  <div className="d-flex gap-1">
                    <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      {t('history.prev')}
                    </button>
                    <span className="btn btn-sm btn-light disabled">{page}/{totalPages}</span>
                    <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      {t('history.next')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuditLog
