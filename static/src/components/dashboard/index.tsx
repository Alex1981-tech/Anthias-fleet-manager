import React, { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaDesktop,
  FaCheckCircle,
  FaTimesCircle,
  FaLayerGroup,
  FaPlus,
  FaSearch,
  FaThLarge,
} from 'react-icons/fa'
import { useAppDispatch, useAppSelector } from '@/store/index'
import { fetchPlayers } from '@/store/playersSlice'
import { fetchGroups } from '@/store/groupsSlice'
import PlayerCard from './player-card'
import ServerTelemetryCard from './server-telemetry'
import AddPlayerModal from '../players/add-player-modal'

const Dashboard: React.FC = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { players, loading } = useAppSelector((state) => state.players)
  const { groups } = useAppSelector((state) => state.groups)

  const [filterGroup, setFilterGroup] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showPlayerForm, setShowPlayerForm] = useState(false)

  useEffect(() => {
    dispatch(fetchPlayers())
    dispatch(fetchGroups())
  }, [dispatch])

  const stats = useMemo(() => {
    const total = players.length
    const online = players.filter((p) => p.is_online).length
    const offline = total - online
    return { total, online, offline, groups: groups.length }
  }, [players, groups])

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      if (filterGroup !== 'all') {
        const playerGroupId = player.group_detail?.id || player.group?.id || null
        if (playerGroupId !== filterGroup) return false
      }
      if (filterStatus === 'online' && !player.is_online) return false
      if (filterStatus === 'offline' && player.is_online) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !player.name.toLowerCase().includes(q) &&
          !player.url.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [players, filterGroup, filterStatus, searchQuery])

  const statCards = [
    {
      icon: <FaDesktop />,
      iconClass: 'stat-icon-purple',
      value: stats.total,
      label: t('dashboard.totalPlayers'),
    },
    {
      icon: <FaCheckCircle />,
      iconClass: 'stat-icon-green',
      value: stats.online,
      label: t('dashboard.online'),
    },
    {
      icon: <FaTimesCircle />,
      iconClass: 'stat-icon-red',
      value: stats.offline,
      label: t('dashboard.offline'),
    },
    {
      icon: <FaLayerGroup />,
      iconClass: 'stat-icon-yellow',
      value: stats.groups,
      label: t('dashboard.groups'),
    },
  ]

  return (
    <div>
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaThLarge className="page-icon" />
            {t('dashboard.title')}
          </h1>
        </div>
        <div className="page-actions">
          <button className="fm-btn-primary" onClick={() => setShowPlayerForm(true)}>
            <FaPlus />
            {t('dashboard.addPlayer')}
          </button>
        </div>
      </div>

      <div className="row g-3 mb-4 align-items-stretch">
        <div className="col-lg-4 d-flex">
          <div className="row g-3 flex-grow-1 align-content-stretch">
            {statCards.map((card, idx) => (
              <div key={idx} className="col-6 d-flex">
                <div className="fm-stat-card flex-grow-1">
                  <div className={`stat-icon ${card.iconClass}`}>{card.icon}</div>
                  <div className="stat-content">
                    <div className="stat-value">{card.value}</div>
                    <div className="stat-label">{card.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="col-lg-8">
          <ServerTelemetryCard />
        </div>
      </div>

      <div className="fm-search-bar">
        <div className="search-input-wrapper">
          <FaSearch className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder={t('common.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
        >
          <option value="all">{t('common.all')} {t('groups.title')}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">{t('common.all')}</option>
          <option value="online">{t('dashboard.online')}</option>
          <option value="offline">{t('dashboard.offline')}</option>
        </select>
      </div>

      {loading ? (
        <div className="fm-loading">
          <div className="spinner" />
        </div>
      ) : filteredPlayers.length === 0 ? (
        <div className="fm-empty-state">
          <div className="empty-icon">
            <FaDesktop />
          </div>
          <h3 className="empty-title">
            {players.length === 0
              ? t('dashboard.noPlayers')
              : t('common.noResults')}
          </h3>
          <p className="empty-text">
            {players.length === 0 ? t('dashboard.noPlayersDesc') : ''}
          </p>
          {players.length === 0 && (
            <button className="fm-btn-primary" onClick={() => setShowPlayerForm(true)}>
              <FaPlus />
              {t('dashboard.addPlayer')}
            </button>
          )}
        </div>
      ) : (
        <div className="row g-3">
          {filteredPlayers.map((player) => (
            <div key={player.id} className="col-sm-6 col-lg-4 col-xl-3">
              <PlayerCard player={player} />
            </div>
          ))}
        </div>
      )}

      {showPlayerForm && (
        <AddPlayerModal
          editingPlayer={null}
          groups={groups}
          onClose={() => setShowPlayerForm(false)}
          onSaved={() => {
            setShowPlayerForm(false)
            dispatch(fetchPlayers())
          }}
        />
      )}
    </div>
  )
}

export default Dashboard
