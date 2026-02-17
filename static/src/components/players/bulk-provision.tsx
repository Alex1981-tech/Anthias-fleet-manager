import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FaSearch, FaPlay, FaCheck, FaTimes, FaSpinner, FaNetworkWired } from 'react-icons/fa'
import { bulkProvision as bulkApi } from '@/services/api'
import type { BulkProvisionTask } from '@/types'

type Step = 'method' | 'review' | 'progress' | 'results'

interface Props {
  onClose: () => void
}

const BulkProvision: React.FC<Props> = ({ onClose }) => {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>('method')

  // Step 1 — scan method
  const [scanMethod, setScanMethod] = useState<'arp' | 'range' | 'manual'>('arp')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [manualIps, setManualIps] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')

  // Step 2 — review
  const [discoveredIps, setDiscoveredIps] = useState<string[]>([])
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set())
  const [sshUser, setSshUser] = useState('pi')
  const [sshPassword, setSshPassword] = useState('258456')

  // Step 3/4 — progress/results
  const [task, setTask] = useState<BulkProvisionTask | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleScan = async () => {
    setScanning(true)
    setScanError('')
    try {
      let ips: string[]
      if (scanMethod === 'manual') {
        ips = manualIps
          .split(/[,\n]+/)
          .map(ip => ip.trim())
          .filter(ip => ip.length > 0)
        if (ips.length === 0) {
          setScanError(t('bulkProvision.noIps'))
          setScanning(false)
          return
        }
      } else {
        const scanParams: { method: string; start_ip?: string; end_ip?: string } = { method: scanMethod }
        if (scanMethod === 'range') {
          if (!rangeStart || !rangeEnd) {
            setScanError(t('bulkProvision.rangeRequired'))
            setScanning(false)
            return
          }
          scanParams.start_ip = rangeStart
          scanParams.end_ip = rangeEnd
        }
        const res = await bulkApi.scan(scanParams)
        ips = res.discovered_ips || []
      }

      setDiscoveredIps(ips)
      setSelectedIps(new Set(ips))
      setStep('review')
    } catch (err) {
      setScanError(String(err))
    } finally {
      setScanning(false)
    }
  }

  const toggleIp = (ip: string) => {
    setSelectedIps(prev => {
      const next = new Set(prev)
      if (next.has(ip)) next.delete(ip)
      else next.add(ip)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedIps.size === discoveredIps.length) {
      setSelectedIps(new Set())
    } else {
      setSelectedIps(new Set(discoveredIps))
    }
  }

  const handleStart = async () => {
    try {
      const res = await bulkApi.start({
        ips: Array.from(selectedIps),
        ssh_user: sshUser,
        ssh_password: sshPassword,
        scan_method: scanMethod,
      })
      setTask(res)
      setStep('progress')

      // Poll progress
      pollRef.current = setInterval(async () => {
        try {
          const updated = await bulkApi.get(res.id)
          setTask(updated)
          if (updated.status === 'completed' || updated.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current)
            setStep('results')
          }
        } catch { /* ignore */ }
      }, 3000)
    } catch (err) {
      setScanError(String(err))
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success': return <span className="badge bg-success"><FaCheck /> {t('bulkProvision.success')}</span>
      case 'failed': return <span className="badge bg-danger"><FaTimes /> {t('bulkProvision.failed')}</span>
      case 'running': return <span className="badge bg-primary"><FaSpinner className="fa-spin" /> {t('bulkProvision.running')}</span>
      default: return <span className="badge bg-secondary">{t('bulkProvision.pending')}</span>
    }
  }

  const renderMethod = () => (
    <div>
      <h6 className="mb-3">{t('bulkProvision.selectMethod')}</h6>
      <div className="d-flex flex-column gap-2 mb-3">
        {(['arp', 'range', 'manual'] as const).map(m => (
          <div key={m} className={`fm-card p-2 cursor-pointer ${scanMethod === m ? 'border-primary' : ''}`}
            onClick={() => setScanMethod(m)} style={{ cursor: 'pointer' }}>
            <div className="form-check">
              <input className="form-check-input" type="radio" checked={scanMethod === m} onChange={() => setScanMethod(m)} />
              <label className="form-check-label fw-semibold">{t(`bulkProvision.method_${m}`)}</label>
              <div className="text-muted" style={{ fontSize: '0.8rem' }}>{t(`bulkProvision.method_${m}_desc`)}</div>
            </div>
          </div>
        ))}
      </div>

      {scanMethod === 'range' && (
        <div className="row g-2 mb-3">
          <div className="col">
            <label className="form-label mb-1" style={{ fontSize: '0.85rem' }}>{t('bulkProvision.rangeStart')}</label>
            <input className="form-control form-control-sm" placeholder="192.168.1.1" value={rangeStart} onChange={e => setRangeStart(e.target.value)} />
          </div>
          <div className="col">
            <label className="form-label mb-1" style={{ fontSize: '0.85rem' }}>{t('bulkProvision.rangeEnd')}</label>
            <input className="form-control form-control-sm" placeholder="192.168.1.254" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} />
          </div>
        </div>
      )}

      {scanMethod === 'manual' && (
        <div className="mb-3">
          <label className="form-label mb-1" style={{ fontSize: '0.85rem' }}>{t('bulkProvision.manualIps')}</label>
          <textarea className="form-control form-control-sm" rows={3} placeholder="192.168.1.10&#10;192.168.1.11"
            value={manualIps} onChange={e => setManualIps(e.target.value)} />
        </div>
      )}

      {scanError && <div className="alert alert-danger py-1 mb-2" style={{ fontSize: '0.85rem' }}>{scanError}</div>}

      <button className="fm-btn-primary btn-sm" onClick={handleScan} disabled={scanning}>
        {scanning ? <><FaSpinner className="fa-spin" /> {t('bulkProvision.scanning')}</> : <><FaSearch /> {t('bulkProvision.scan')}</>}
      </button>
    </div>
  )

  const renderReview = () => (
    <div>
      <h6 className="mb-2">{t('bulkProvision.reviewTitle', { count: discoveredIps.length })}</h6>

      <div className="mb-2">
        <button className="btn btn-sm btn-outline-secondary" onClick={toggleAll}>
          {selectedIps.size === discoveredIps.length ? t('schedule.deselectAll') : t('schedule.selectAll')}
        </button>
      </div>

      <div className="table-responsive mb-3" style={{ maxHeight: '250px', overflowY: 'auto' }}>
        <table className="table table-sm fm-table mb-0">
          <thead>
            <tr>
              <th style={{ width: '40px' }}></th>
              <th>{t('bulkProvision.ipAddress')}</th>
            </tr>
          </thead>
          <tbody>
            {discoveredIps.map(ip => (
              <tr key={ip} onClick={() => toggleIp(ip)} style={{ cursor: 'pointer' }}>
                <td>
                  <input type="checkbox" className="form-check-input" checked={selectedIps.has(ip)} onChange={() => toggleIp(ip)} />
                </td>
                <td>{ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row g-2 mb-3">
        <div className="col">
          <label className="form-label mb-1 fw-semibold" style={{ fontSize: '0.85rem' }}>{t('provision.sshLogin')}</label>
          <input className="form-control form-control-sm" value={sshUser} onChange={e => setSshUser(e.target.value)} />
        </div>
        <div className="col">
          <label className="form-label mb-1 fw-semibold" style={{ fontSize: '0.85rem' }}>{t('provision.sshPassword')}</label>
          <input type="password" className="form-control form-control-sm" value={sshPassword} onChange={e => setSshPassword(e.target.value)} />
        </div>
      </div>

      {scanError && <div className="alert alert-danger py-1 mb-2" style={{ fontSize: '0.85rem' }}>{scanError}</div>}

      <div className="d-flex gap-2">
        <button className="btn btn-sm btn-secondary" onClick={() => setStep('method')}>{t('provision.back')}</button>
        <button className="fm-btn-primary btn-sm" onClick={handleStart} disabled={selectedIps.size === 0}>
          <FaPlay /> {t('bulkProvision.startProvision', { count: selectedIps.size })}
        </button>
      </div>
    </div>
  )

  const renderProgress = () => {
    const results = task?.results || {}
    const ips = task?.selected_ips || []
    return (
      <div>
        <h6 className="mb-2">{t('bulkProvision.provisioning')}</h6>
        <div className="table-responsive" style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <table className="table table-sm fm-table mb-0">
            <thead>
              <tr>
                <th>{t('bulkProvision.ipAddress')}</th>
                <th>{t('deploy.status')}</th>
              </tr>
            </thead>
            <tbody>
              {ips.map(ip => (
                <tr key={ip}>
                  <td>{ip}</td>
                  <td>{results[ip] ? getStatusBadge(results[ip].status) : getStatusBadge('pending')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderResults = () => {
    const results = task?.results || {}
    const ips = task?.selected_ips || []
    const successCount = ips.filter(ip => results[ip]?.status === 'success').length
    const failCount = ips.filter(ip => results[ip]?.status === 'failed').length

    return (
      <div>
        <h6 className="mb-2">{t('bulkProvision.resultsTitle')}</h6>
        <div className="d-flex gap-3 mb-3">
          <span className="badge bg-success" style={{ fontSize: '0.9rem' }}><FaCheck /> {successCount} {t('bulkProvision.success')}</span>
          {failCount > 0 && <span className="badge bg-danger" style={{ fontSize: '0.9rem' }}><FaTimes /> {failCount} {t('bulkProvision.failed')}</span>}
        </div>
        <div className="table-responsive" style={{ maxHeight: '250px', overflowY: 'auto' }}>
          <table className="table table-sm fm-table mb-0">
            <thead>
              <tr>
                <th>{t('bulkProvision.ipAddress')}</th>
                <th>{t('deploy.status')}</th>
                <th>{t('bulkProvision.error')}</th>
              </tr>
            </thead>
            <tbody>
              {ips.map(ip => (
                <tr key={ip}>
                  <td>{ip}</td>
                  <td>{results[ip] ? getStatusBadge(results[ip].status) : getStatusBadge('pending')}</td>
                  <td style={{ fontSize: '0.8rem' }}>{results[ip]?.error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="fm-btn-primary btn-sm mt-3" onClick={onClose}>{t('common.close')}</button>
      </div>
    )
  }

  return (
    <div className="modal d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h5 className="modal-title">
              <FaNetworkWired className="me-2" />
              {t('bulkProvision.title')}
            </h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {step === 'method' && renderMethod()}
            {step === 'review' && renderReview()}
            {step === 'progress' && renderProgress()}
            {step === 'results' && renderResults()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BulkProvision
