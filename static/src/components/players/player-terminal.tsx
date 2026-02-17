import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaTerminal, FaTimes, FaRedo } from 'react-icons/fa'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface Props {
  playerId: string
  onClose: () => void
}

const PlayerTerminal: React.FC<Props> = ({ playerId, onClose }) => {
  const { t } = useTranslation()
  const termRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  const connect = () => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/terminal/${playerId}/`)
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      setStatus('connected')
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims) {
          ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
        }
      }
    }

    ws.onmessage = (event) => {
      if (terminalRef.current) {
        terminalRef.current.write(event.data)
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
    }

    ws.onerror = () => {
      setStatus('disconnected')
    }
  }

  useEffect(() => {
    if (!termRef.current) return

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#585b7066',
      },
    })
    terminalRef.current = terminal

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())

    terminal.open(termRef.current)
    fitAddon.fit()

    terminal.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data)
      }
    })

    const handleResize = () => {
      fitAddon.fit()
      const dims = fitAddon.proposeDimensions()
      if (dims && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
      }
    }

    window.addEventListener('resize', handleResize)

    connect()

    return () => {
      window.removeEventListener('resize', handleResize)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      terminal.dispose()
    }
  }, [playerId])

  const handleReconnect = () => {
    if (terminalRef.current) {
      terminalRef.current.clear()
    }
    connect()
  }

  return (
    <div className="fm-card fm-card-accent mb-3">
      <div className="fm-card-header py-2 d-flex justify-content-between align-items-center">
        <h5 className="card-title mb-0">
          <FaTerminal className="me-2" />
          {t('terminal.title')}
          <span className={`badge ms-2 ${status === 'connected' ? 'bg-success' : status === 'connecting' ? 'bg-warning text-dark' : 'bg-danger'}`} style={{ fontSize: '0.7rem' }}>
            {t(`terminal.${status}`)}
          </span>
        </h5>
        <div className="d-flex gap-1">
          {status === 'disconnected' && (
            <button className="btn btn-sm btn-outline-primary" onClick={handleReconnect} title={t('terminal.reconnect')}>
              <FaRedo />
            </button>
          )}
          <button className="btn btn-sm btn-outline-secondary" onClick={onClose} title={t('common.close')}>
            <FaTimes />
          </button>
        </div>
      </div>
      <div className="fm-card-body p-0">
        <div ref={termRef} style={{ height: '400px', backgroundColor: '#1e1e2e' }} />
      </div>
    </div>
  )
}

export default PlayerTerminal
