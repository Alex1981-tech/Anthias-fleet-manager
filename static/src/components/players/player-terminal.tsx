import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaTerminal, FaTimes, FaRedo, FaBook, FaChevronDown, FaChevronRight, FaPaste } from 'react-icons/fa'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface Props {
  playerId: string
  onClose: () => void
}

interface CmdGroup {
  titleKey: string
  commands: { label: string; cmd: string; desc?: string }[]
}

const CMD_GROUPS: CmdGroup[] = [
  {
    titleKey: 'docker',
    commands: [
      { label: 'docker ps', cmd: 'docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', desc: 'containers' },
      { label: 'logs server', cmd: 'docker logs --tail 50 screenly-server', desc: 'last 50' },
      { label: 'logs viewer', cmd: 'docker logs --tail 50 screenly-viewer', desc: 'last 50' },
      { label: 'logs nginx', cmd: 'docker logs --tail 30 screenly-nginx', desc: 'last 30' },
      { label: 'restart all', cmd: 'cd ~/screenly && docker compose restart' },
      { label: 'restart server', cmd: 'docker restart screenly-server' },
      { label: 'restart viewer', cmd: 'docker restart screenly-viewer' },
      { label: 'disk usage', cmd: 'docker system df' },
      { label: 'prune images', cmd: 'docker image prune -f' },
    ],
  },
  {
    titleKey: 'system',
    commands: [
      { label: 'uptime', cmd: 'uptime' },
      { label: 'memory', cmd: 'free -h' },
      { label: 'disk', cmd: 'df -h /' },
      { label: 'temp', cmd: 'vcgencmd measure_temp' },
      { label: 'top processes', cmd: 'ps aux --sort=-%mem | head -10' },
      { label: 'reboot', cmd: 'sudo reboot' },
    ],
  },
  {
    titleKey: 'network',
    commands: [
      { label: 'IP address', cmd: "ip -4 addr show | grep 'inet ' | awk '{print $2}'" },
      { label: 'ping FM', cmd: 'ping -c 3 $(ip route | grep default | awk \'{print $3}\')' },
      { label: 'open ports', cmd: 'ss -tlnp' },
      { label: 'DNS test', cmd: 'nslookup google.com' },
    ],
  },
  {
    titleKey: 'anthias',
    commands: [
      { label: 'API info', cmd: 'curl -s http://localhost/api/v2/info | python3 -m json.tool' },
      { label: 'assets list', cmd: 'curl -s http://localhost/api/v2/assets | python3 -m json.tool | head -40' },
      { label: 'schedule status', cmd: 'curl -s http://localhost/api/v2/schedule/status | python3 -m json.tool' },
      { label: 'viewlog DB', cmd: 'sqlite3 /data/.screenly/viewlog.db "SELECT * FROM viewlog ORDER BY timestamp DESC LIMIT 5;"' },
      { label: 'screenly.db', cmd: 'sqlite3 /data/.screenly/screenly.db ".tables"' },
      { label: 'HDMI status', cmd: 'ls /sys/class/drm/card*/status 2>/dev/null | xargs -I{} sh -c \'echo "{}: $(cat {})"\'', desc: 'connected?' },
      { label: 'CEC scan', cmd: 'cec-ctl --playback -S 2>/dev/null || echo "cec-ctl not available"' },
    ],
  },
  {
    titleKey: 'files',
    commands: [
      { label: 'compose', cmd: 'cat ~/screenly/docker-compose.yml | head -60' },
      { label: 'assets dir', cmd: 'ls -lh /data/.screenly/screenly_assets/ | head -20' },
      { label: 'config.txt', cmd: 'cat /boot/firmware/config.txt | grep -v "^#" | grep -v "^$"' },
      { label: 'asoundrc', cmd: 'cat ~/.asoundrc 2>/dev/null || echo "no .asoundrc"' },
    ],
  },
]

const PlayerTerminal: React.FC<Props> = ({ playerId, onClose }) => {
  const { t } = useTranslation()
  const termRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [showCheatsheet, setShowCheatsheet] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const sendCommand = (cmd: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd + '\n')
    }
  }

  const toggleGroup = (key: string) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Refit terminal when cheatsheet panel toggles
  useEffect(() => {
    if (fitAddonRef.current && terminalRef.current) {
      // Small delay for DOM to update flex layout
      const timer = setTimeout(() => {
        fitAddonRef.current!.fit()
        const dims = fitAddonRef.current!.proposeDimensions()
        if (dims && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }))
        }
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [showCheatsheet])

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
          <button
            className={`btn btn-sm ${showCheatsheet ? 'btn-primary' : 'btn-outline-primary'}`}
            onClick={() => setShowCheatsheet(!showCheatsheet)}
            title={t('terminal.cheatsheet')}
          >
            <FaBook />
          </button>
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
      <div className="fm-card-body p-0 d-flex" style={{ height: '420px' }}>
        {/* Terminal */}
        <div ref={termRef} style={{ flex: 1, backgroundColor: '#1e1e2e', minWidth: 0 }} />

        {/* Cheatsheet panel */}
        {showCheatsheet && (
          <div
            className="border-start overflow-auto"
            style={{
              width: '280px',
              minWidth: '280px',
              backgroundColor: 'var(--bs-body-bg)',
              fontSize: '0.78rem',
            }}
          >
            <div className="px-2 py-1 border-bottom" style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bs-body-bg)', zIndex: 1 }}>
              <strong><FaBook className="me-1" />{t('terminal.cheatsheet')}</strong>
              <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>({t('terminal.clickToRun')})</span>
            </div>
            {CMD_GROUPS.map((group) => {
              const isCollapsed = collapsed[group.titleKey]
              return (
                <div key={group.titleKey}>
                  <div
                    className="px-2 py-1 border-bottom d-flex align-items-center"
                    style={{ cursor: 'pointer', backgroundColor: 'var(--bs-tertiary-bg)' }}
                    onClick={() => toggleGroup(group.titleKey)}
                  >
                    {isCollapsed ? <FaChevronRight style={{ fontSize: '0.6rem' }} className="me-1" /> : <FaChevronDown style={{ fontSize: '0.6rem' }} className="me-1" />}
                    <strong style={{ fontSize: '0.75rem' }}>{t(`terminal.group_${group.titleKey}`)}</strong>
                  </div>
                  {!isCollapsed && group.commands.map((c, i) => (
                    <div
                      key={i}
                      className="px-2 py-1 border-bottom fm-cheatsheet-cmd"
                      style={{ cursor: 'pointer' }}
                      onClick={() => sendCommand(c.cmd)}
                      title={c.cmd}
                    >
                      <div className="d-flex align-items-center justify-content-between">
                        <span>
                          <FaPaste className="me-1 text-muted" style={{ fontSize: '0.6rem' }} />
                          <code style={{ fontSize: '0.75rem' }}>{c.label}</code>
                        </span>
                        {c.desc && <span className="text-muted" style={{ fontSize: '0.65rem' }}>{c.desc}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default PlayerTerminal
