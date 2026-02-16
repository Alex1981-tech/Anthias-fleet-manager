import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  FaDesktop,
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrash,
} from 'react-icons/fa'
import Swal from 'sweetalert2'
import { useAppDispatch, useAppSelector } from '@/store/index'
import { fetchPlayers, deletePlayer } from '@/store/playersSlice'
import { fetchGroups } from '@/store/groupsSlice'
import AddPlayerModal from './add-player-modal'
import type { Player } from '@/types'

const PlayerList: React.FC = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { players, loading } = useAppSelector((state) => state.players)
  const { groups } = useAppSelector((state) => state.groups)

  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null)

  useEffect(() => {
    dispatch(fetchPlayers())
    dispatch(fetchGroups())
  }, [dispatch])

  const filteredPlayers = players.filter((player) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      player.name.toLowerCase().includes(q) ||
      player.url.toLowerCase().includes(q)
    )
  })

  const handleDelete = async (player: Player) => {
    const result = await Swal.fire({
      title: t('common.confirm'),
      text: t('players.confirmDelete'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
    })

    if (result.isConfirmed) {
      try {
        await dispatch(deletePlayer(player.id)).unwrap()
        Swal.fire({
          icon: 'success',
          title: t('players.deleted'),
          timer: 1500,
          showConfirmButton: false,
        })
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: t('common.error'),
          text: String(error),
        })
      }
    }
  }

  const handleEdit = (player: Player) => {
    setEditingPlayer(player)
    setShowForm(true)
  }

  const handleAdd = () => {
    setEditingPlayer(null)
    setShowForm(true)
  }

  const handleFormClose = () => {
    setShowForm(false)
    setEditingPlayer(null)
  }

  const handleFormSaved = () => {
    setShowForm(false)
    setEditingPlayer(null)
    dispatch(fetchPlayers())
  }

  const getPlayerGroup = (player: Player) => {
    return player.group_detail || player.group
  }

  return (
    <div>
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaDesktop className="page-icon" />
            {t('players.title')}
          </h1>
        </div>
        <div className="page-actions">
          <button className="fm-btn-primary" onClick={handleAdd}>
            <FaPlus />
            {t('players.addPlayer')}
          </button>
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
      </div>

      {loading ? (
        <div className="fm-loading">
          <div className="spinner" />
        </div>
      ) : (
        <div className="fm-card">
          <div className="fm-card-body p-0">
            <table className="fm-table">
              <thead>
                <tr>
                  <th>{t('players.name')}</th>
                  <th>{t('players.url')}</th>
                  <th>{t('players.group')}</th>
                  <th>{t('players.status')}</th>
                  <th>{t('players.lastSeen')}</th>
                  <th>{t('players.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-muted">
                      {players.length === 0
                        ? t('dashboard.noPlayers')
                        : t('common.noResults')}
                    </td>
                  </tr>
                ) : (
                  filteredPlayers.map((player) => {
                    const group = getPlayerGroup(player)
                    return (
                      <tr key={player.id}>
                        <td>
                          <Link
                            to={`/players/${player.id}`}
                            className="fw-semibold text-decoration-none"
                          >
                            {player.name}
                          </Link>
                        </td>
                        <td>
                          <code className="text-muted" style={{ fontSize: '0.8rem' }}>
                            {player.url}
                          </code>
                        </td>
                        <td>
                          {group ? (
                            <span
                              className="fm-group-tag"
                              style={{
                                backgroundColor: group.color
                                  ? `${group.color}20`
                                  : undefined,
                                color: group.color || undefined,
                              }}
                            >
                              {group.name}
                            </span>
                          ) : (
                            <span className="text-muted">{t('players.noGroup')}</span>
                          )}
                        </td>
                        <td>
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
                              {player.is_online
                                ? t('players.online')
                                : t('players.offline')}
                            </span>
                          </span>
                        </td>
                        <td>
                          {player.last_seen
                            ? new Date(player.last_seen).toLocaleString()
                            : '--'}
                        </td>
                        <td>
                          <div className="d-flex gap-1">
                            <button
                              className="fm-btn-icon"
                              onClick={() => handleEdit(player)}
                              title={t('common.edit')}
                            >
                              <FaEdit />
                            </button>
                            <button
                              className="fm-btn-icon"
                              onClick={() => handleDelete(player)}
                              title={t('common.delete')}
                              style={{ color: '#dc3545' }}
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <AddPlayerModal
          editingPlayer={editingPlayer}
          groups={groups}
          onClose={handleFormClose}
          onSaved={handleFormSaved}
        />
      )}
    </div>
  )
}

export default PlayerList
