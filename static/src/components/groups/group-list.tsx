import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaLayerGroup,
  FaPlus,
  FaEdit,
  FaTrash,
} from 'react-icons/fa'
import Swal from 'sweetalert2'
import { useAppDispatch, useAppSelector } from '@/store/index'
import { fetchGroups, createGroup, updateGroup, deleteGroup } from '@/store/groupsSlice'
import { fetchPlayers } from '@/store/playersSlice'
import type { Group } from '@/types'

const GroupList: React.FC = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { groups, loading } = useAppSelector((state) => state.groups)
  const { players } = useAppSelector((state) => state.players)

  const [showForm, setShowForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [formName, setFormName] = useState('')
  const [formColor, setFormColor] = useState('#8819C7')
  const [formDescription, setFormDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    dispatch(fetchGroups())
    dispatch(fetchPlayers())
  }, [dispatch])

  const getPlayersInGroup = (groupId: string) => {
    return players.filter((p) => {
      const pGroupId = p.group_detail?.id || p.group?.id
      return pGroupId === groupId
    })
  }

  const handleAdd = () => {
    setEditingGroup(null)
    setFormName('')
    setFormColor('#8819C7')
    setFormDescription('')
    setShowForm(true)
  }

  const handleEdit = (group: Group) => {
    setEditingGroup(group)
    setFormName(group.name)
    setFormColor(group.color || '#8819C7')
    setFormDescription(group.description || '')
    setShowForm(true)
  }

  const handleDelete = async (group: Group) => {
    const result = await Swal.fire({
      title: t('common.confirm'),
      text: t('groups.confirmDelete'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: t('common.delete'),
      cancelButtonText: t('common.cancel'),
    })

    if (result.isConfirmed) {
      try {
        await dispatch(deleteGroup(group.id)).unwrap()
        Swal.fire({
          icon: 'success',
          title: t('groups.deleted'),
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

  const handleFormClose = () => {
    setShowForm(false)
    setEditingGroup(null)
  }

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    const data = {
      name: formName,
      color: formColor,
      description: formDescription,
    }

    try {
      if (editingGroup) {
        await dispatch(updateGroup({ id: editingGroup.id, data })).unwrap()
      } else {
        await dispatch(createGroup(data)).unwrap()
      }
      Swal.fire({
        icon: 'success',
        title: t('common.success'),
        timer: 1500,
        showConfirmButton: false,
      })
      setShowForm(false)
      setEditingGroup(null)
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

  return (
    <div>
      <div className="fm-page-header">
        <div>
          <h1 className="page-title">
            <FaLayerGroup className="page-icon" />
            {t('groups.title')}
          </h1>
        </div>
        <div className="page-actions">
          <button className="fm-btn-primary" onClick={handleAdd}>
            <FaPlus />
            {t('groups.addGroup')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="fm-loading">
          <div className="spinner" />
        </div>
      ) : groups.length === 0 ? (
        <div className="fm-empty-state">
          <div className="empty-icon">
            <FaLayerGroup />
          </div>
          <h3 className="empty-title">{t('common.noResults')}</h3>
          <button className="fm-btn-primary" onClick={handleAdd}>
            <FaPlus />
            {t('groups.addGroup')}
          </button>
        </div>
      ) : (
        <div className="row g-3">
          {groups.map((group) => {
            const groupPlayers = getPlayersInGroup(group.id)
            return (
              <div key={group.id} className="col-sm-6 col-lg-4">
                <div className="fm-card fm-card-accent">
                  <div className="fm-card-header">
                    <div className="d-flex align-items-center gap-2">
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '4px',
                          backgroundColor: group.color || '#8819C7',
                          flexShrink: 0,
                        }}
                      />
                      <h5 className="card-title mb-0">{group.name}</h5>
                    </div>
                    <div className="card-actions">
                      <button
                        className="fm-btn-icon"
                        onClick={() => handleEdit(group)}
                        title={t('common.edit')}
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="fm-btn-icon"
                        onClick={() => handleDelete(group)}
                        title={t('common.delete')}
                        style={{ color: '#dc3545' }}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  </div>
                  <div className="fm-card-body">
                    {group.description && (
                      <p className="text-muted mb-2" style={{ fontSize: '0.875rem' }}>
                        {group.description}
                      </p>
                    )}
                    <div className="d-flex align-items-center gap-2">
                      <span
                        className="fm-group-tag"
                        style={{
                          backgroundColor: group.color ? `${group.color}20` : undefined,
                          color: group.color || undefined,
                        }}
                      >
                        {groupPlayers.length} {t('groups.players')}
                      </span>
                    </div>
                    {groupPlayers.length > 0 && (
                      <div className="mt-2">
                        {groupPlayers.slice(0, 5).map((p) => (
                          <div
                            key={p.id}
                            className="d-flex align-items-center gap-2 py-1"
                            style={{ fontSize: '0.8rem' }}
                          >
                            <span
                              className={`status-dot ${
                                p.is_online ? 'status-online' : 'status-offline'
                              }`}
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: p.is_online ? '#28a745' : '#dc3545',
                                flexShrink: 0,
                              }}
                            />
                            <span className="text-muted">{p.name}</span>
                          </div>
                        ))}
                        {groupPlayers.length > 5 && (
                          <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                            +{groupPlayers.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Group Form Modal */}
      {showForm && (
        <div
          className="modal d-block"
          tabIndex={-1}
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={handleFormClose}
        >
          <div
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-bold text-purple-dark">
                  {editingGroup ? t('groups.editGroup') : t('groups.addGroup')}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={handleFormClose}
                  aria-label={t('common.close')}
                />
              </div>
              <form onSubmit={handleFormSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label fw-semibold">
                      {t('groups.name')}
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                      placeholder="1st Floor"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold">
                      {t('groups.color')}
                    </label>
                    <div className="d-flex align-items-center gap-2">
                      <input
                        type="color"
                        className="form-control form-control-color"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        style={{ width: '50px', height: '38px' }}
                      />
                      <input
                        type="text"
                        className="form-control"
                        value={formColor}
                        onChange={(e) => setFormColor(e.target.value)}
                        placeholder="#8819C7"
                        style={{ maxWidth: '120px' }}
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-semibold">
                      {t('groups.description')}
                    </label>
                    <textarea
                      className="form-control"
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      rows={3}
                      placeholder={t('groups.description')}
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleFormClose}
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
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GroupList
