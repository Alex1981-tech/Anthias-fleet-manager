import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FaInfoCircle, FaSyncAlt } from 'react-icons/fa'
import type { Player } from '@/types'
import { players as playersApi } from '@/services/api'
import Swal from 'sweetalert2'

interface PlayerCardProps {
  player: Player
}

const PlayerCard: React.FC<PlayerCardProps> = ({ player }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const group = player.group_detail || player.group
  const lastSeen = player.last_seen
    ? new Date(player.last_seen).toLocaleString()
    : '--'

  const handleCardClick = () => {
    navigate(`/players/${player.id}`)
  }

  const handleInfoClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/players/${player.id}`)
  }

  const handleRebootClick = async (e: React.MouseEvent) => {
    e.stopPropagation()

    const result = await Swal.fire({
      title: t('players.reboot'),
      text: `${t('common.confirm')}: ${player.name}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('players.reboot'),
      cancelButtonText: t('common.cancel'),
    })

    if (result.isConfirmed) {
      try {
        await playersApi.reboot(player.id)
        Swal.fire({
          icon: 'success',
          title: t('common.success'),
          timer: 1500,
          showConfirmButton: false,
        })
      } catch {
        Swal.fire({
          icon: 'error',
          title: t('common.error'),
        })
      }
    }
  }

  return (
    <div className="fm-player-card" onClick={handleCardClick}>
      <div className="player-card-header">
        <h5 className="player-name">{player.name}</h5>
        <span className={player.is_online ? 'fm-badge-online' : 'fm-badge-offline'}>
          {player.is_online ? t('players.online') : t('players.offline')}
        </span>
      </div>

      <div className="player-card-body">
        <div className="player-info-row">
          <span className="info-label">{t('players.url')}</span>
          <span className="info-value" style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {player.url}
          </span>
        </div>

        <div className="player-info-row">
          <span className="info-label">{t('players.group')}</span>
          <span className="info-value">
            {group ? (
              <span
                className="fm-group-tag"
                style={{
                  backgroundColor: group.color ? `${group.color}20` : undefined,
                  color: group.color || undefined,
                }}
              >
                {group.name}
              </span>
            ) : (
              <span className="text-muted">{t('players.noGroup')}</span>
            )}
          </span>
        </div>

        <div className="player-info-row">
          <span className="info-label">{t('players.status')}</span>
          <span className="info-value">
            <span className="fm-status-indicator">
              <span
                className={`status-dot ${
                  player.is_online ? 'status-online' : 'status-offline'
                }`}
              />
              <span
                className={`status-text ${
                  player.is_online ? 'text-online' : 'text-offline'
                }`}
              >
                {player.is_online ? t('players.online') : t('players.offline')}
              </span>
            </span>
          </span>
        </div>

        <div className="player-info-row">
          <span className="info-label">{t('players.lastSeen')}</span>
          <span className="info-value">{lastSeen}</span>
        </div>
      </div>

      <div className="player-card-footer">
        <button
          className="fm-btn-icon"
          onClick={handleInfoClick}
          title={t('players.info')}
        >
          <FaInfoCircle />
        </button>
        <button
          className="fm-btn-icon"
          onClick={handleRebootClick}
          title={t('players.reboot')}
        >
          <FaSyncAlt />
        </button>
      </div>
    </div>
  )
}

export default PlayerCard
