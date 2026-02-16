import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaPlug } from 'react-icons/fa'
import Swal from 'sweetalert2'
import { useAppDispatch } from '@/store/index'
import { createPlayer, updatePlayer } from '@/store/playersSlice'
import { players as playersApi } from '@/services/api'
import type { Player, Group } from '@/types'

interface PlayerFormProps {
  player: Player | null
  groups: Group[]
  onClose: () => void
  onSaved: () => void
  embedded?: boolean
}

const PlayerForm: React.FC<PlayerFormProps> = ({ player, groups, onClose, onSaved, embedded }) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const isEditing = player !== null

  const [name, setName] = useState(player?.name || '')
  const [url, setUrl] = useState(player?.url || '')
  const [username, setUsername] = useState(player?.username || '')
  const [password, setPassword] = useState('')
  const [groupId, setGroupId] = useState(
    player?.group_detail?.id || player?.group?.id || '',
  )
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const handleTestConnection = async () => {
    if (!player) return
    setTesting(true)
    try {
      const result = await playersApi.testConnection(player.id)
      if (result.success) {
        Swal.fire({
          icon: 'success',
          title: t('players.connectionSuccess'),
          timer: 2000,
          showConfirmButton: false,
        })
      } else {
        Swal.fire({
          icon: 'error',
          title: t('players.connectionFailed'),
          text: result.message,
        })
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: t('players.connectionFailed'),
        text: String(error),
      })
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const data: Record<string, string | null> = {
      name,
      url,
      username,
      group: groupId || null,
    }

    if (password) {
      data.password = password
    }

    try {
      if (isEditing && player) {
        await dispatch(updatePlayer({ id: player.id, data })).unwrap()
      } else {
        await dispatch(createPlayer(data)).unwrap()
      }
      Swal.fire({
        icon: 'success',
        title: t('common.success'),
        timer: 1500,
        showConfirmButton: false,
      })
      onSaved()
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: t('common.error'),
        text: String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit}>
      <div className="modal-body">
        <div className="mb-3">
          <label className="form-label fw-semibold">
            {t('players.name')}
          </label>
          <input
            type="text"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Lobby Screen 1"
          />
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">
            {t('players.url')}
          </label>
          <input
            type="url"
            className="form-control"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="http://192.168.1.10"
          />
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">
            {t('players.group')}
          </label>
          <select
            className="form-select"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">{t('players.noGroup')}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">
            {t('players.username')}
          </label>
          <input
            type="text"
            className="form-control"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin"
          />
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">
            {t('players.password')}
          </label>
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEditing ? '(unchanged)' : ''}
          />
        </div>
      </div>

      <div className="modal-footer d-flex justify-content-between">
        <div>
          {isEditing && (
            <button
              type="button"
              className="fm-btn-outline fm-btn-sm"
              onClick={handleTestConnection}
              disabled={testing}
            >
              <FaPlug />
              {testing ? t('common.loading') : t('players.testConnection')}
            </button>
          )}
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="fm-btn-primary"
            disabled={saving}
          >
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </form>
  )

  if (embedded) {
    return formContent
  }

  return (
    <div
      className="modal d-block"
      tabIndex={-1}
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-bold text-purple-dark">
              {isEditing ? t('players.editPlayer') : t('players.addPlayer')}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label={t('common.close')}
            />
          </div>
          {formContent}
        </div>
      </div>
    </div>
  )
}

export default PlayerForm
