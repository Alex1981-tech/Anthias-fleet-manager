import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaCalendarAlt,
  FaPlus,
  FaEdit,
  FaTrash,
  FaTimes,
  FaStar,
  FaClock,
  FaBolt,
  FaGlobe,
  FaVideo,
  FaImage,
  FaPlay,
  FaFile,
  FaCheckSquare,
  FaSquare,
} from 'react-icons/fa'
import Swal from 'sweetalert2'
import { schedule as scheduleApi, players as playersApi, media as mediaApi } from '@/services/api'
import { translateApiError } from '@/utils/translateError'
import type { ScheduleSlot, ScheduleSlotItem, ScheduleStatus, PlayerAsset, MediaFile, SlotType } from '@/types'

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]

const getItemTypeIcon = (mimetype: string) => {
  if (!mimetype) return <FaFile />
  const mt = mimetype.toLowerCase()
  if (mt === 'webpage' || mt === 'web') return <FaGlobe />
  if (mt === 'video') return <FaVideo />
  if (mt === 'image') return <FaImage />
  if (mt === 'streaming' || mt === 'youtube_asset' || mt === 'youtube') return <FaPlay />
  return <FaFile />
}

interface PlayerScheduleProps {
  playerId: string
  isOnline: boolean
  onScheduleChange?: (enabled: boolean) => void
  onSlotsLoaded?: (slots: ScheduleSlot[]) => void
}

export const PlayerSchedule = ({ playerId, isOnline, onScheduleChange, onSlotsLoaded }: PlayerScheduleProps) => {
  const { t } = useTranslation()
  const [slots, setSlots] = useState<ScheduleSlot[]>([])
  const [status, setStatus] = useState<ScheduleStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Media files for thumbnails
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])

  // Hover preview state
  const [hoveredItem, setHoveredItem] = useState<ScheduleSlotItem | null>(null)
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Inline duration editing
  const [editingDuration, setEditingDuration] = useState<{ slotId: string; itemId: string } | null>(null)
  const [editDurationValue, setEditDurationValue] = useState('')

  // Modals
  const [showSlotModal, setShowSlotModal] = useState(false)
  const [editingSlot, setEditingSlot] = useState<ScheduleSlot | null>(null)
  const [showAddItemModal, setShowAddItemModal] = useState(false)
  const [addItemSlot, setAddItemSlot] = useState<ScheduleSlot | null>(null)

  const findMediaFile = useCallback((name: string): MediaFile | null => {
    if (!mediaFiles.length) return null
    return mediaFiles.find(f => f.name === name) || null
  }, [mediaFiles])

  const getItemPreviewUrl = useCallback((item: ScheduleSlotItem): string | null => {
    if (item.asset_mimetype === 'webpage') return item.asset_uri
    const mf = findMediaFile(item.asset_name)
    if (mf && mf.url) return mf.url
    return null
  }, [findMediaFile])

  const fetchData = useCallback(async () => {
    if (!isOnline) {
      setLoading(false)
      setError(t('schedule.connectionError'))
      return
    }
    try {
      setLoading(true)
      setError(null)
      const [slotsData, statusData] = await Promise.all([
        scheduleApi.getSlots(playerId),
        scheduleApi.getStatus(playerId),
      ])
      setSlots(slotsData)
      setStatus(statusData)
      onScheduleChange?.(statusData.schedule_enabled)
      onSlotsLoaded?.(slotsData)
    } catch (err: unknown) {
      setError(translateApiError(err instanceof Error ? err.message : String(err), t))
    } finally {
      setLoading(false)
    }
  }, [playerId, isOnline, t, onScheduleChange, onSlotsLoaded])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Load media files for thumbnails
  useEffect(() => {
    mediaApi.list().then(files => setMediaFiles(files)).catch(() => {})
  }, [])

  const formatTime = (s: string) => (s ? s.substring(0, 5) : '')

  const getDayLabels = (days: number[]) =>
    days
      .sort((a, b) => a - b)
      .map((d) => t(`schedule.days.${d}`))
      .join(', ')

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
  }

  // ── Slot CRUD ──

  const handleCreateSlot = () => {
    setEditingSlot(null)
    setShowSlotModal(true)
  }

  const handleEditSlot = (slot: ScheduleSlot) => {
    setEditingSlot(slot)
    setShowSlotModal(true)
  }

  const handleDeleteSlot = async (slot: ScheduleSlot) => {
    const result = await Swal.fire({
      title: t('common.confirm'),
      text: t('schedule.deleteConfirm', { name: slot.name }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonText: t('common.cancel'),
      confirmButtonText: t('common.delete'),
    })
    if (!result.isConfirmed) return
    try {
      await scheduleApi.deleteSlot(playerId, slot.slot_id)
      fetchData()
    } catch {
      Swal.fire(t('common.error'), t('schedule.failed'), 'error')
    }
  }

  const handleSlotSaved = () => {
    setShowSlotModal(false)
    setEditingSlot(null)
    fetchData()
  }

  // ── Item CRUD ──

  const handleAddItem = (slot: ScheduleSlot) => {
    setAddItemSlot(slot)
    setShowAddItemModal(true)
  }

  const handleRemoveItem = async (slot: ScheduleSlot, item: ScheduleSlotItem) => {
    const result = await Swal.fire({
      title: t('common.confirm'),
      text: t('schedule.removeItemConfirm', { name: item.asset_name }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonText: t('common.cancel'),
      confirmButtonText: t('schedule.remove'),
    })
    if (!result.isConfirmed) return
    try {
      await scheduleApi.removeItem(playerId, slot.slot_id, item.item_id)
      fetchData()
    } catch {
      Swal.fire(t('common.error'), t('schedule.failed'), 'error')
    }
  }

  const handleItemAdded = () => {
    setShowAddItemModal(false)
    setAddItemSlot(null)
    fetchData()
  }

  const handleDurationClick = (slot: ScheduleSlot, item: ScheduleSlotItem) => {
    setEditingDuration({ slotId: slot.slot_id, itemId: item.item_id })
    setEditDurationValue(String(item.duration_override ?? item.effective_duration))
  }

  const handleDurationSave = async (slot: ScheduleSlot, item: ScheduleSlotItem) => {
    const val = parseInt(editDurationValue, 10)
    if (isNaN(val) || val < 1) {
      setEditingDuration(null)
      return
    }
    try {
      await scheduleApi.updateItem(playerId, slot.slot_id, item.item_id, { duration_override: val })
      fetchData()
    } catch {
      Swal.fire(t('common.error'), t('schedule.failed'), 'error')
    }
    setEditingDuration(null)
  }

  // ── Thumbnail helper ──

  const renderItemThumbnail = (item: ScheduleSlotItem) => {
    const mf = findMediaFile(item.asset_name)
    const mt = item.asset_mimetype?.toLowerCase() || ''
    const thumbStyle: React.CSSProperties = { width: 64, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 4, display: 'block' }

    if (mt === 'image' && mf?.url) {
      return <img src={mf.url} alt="" style={thumbStyle} />
    }
    if (mt === 'video' && mf?.url) {
      return <video src={mf.url} muted playsInline preload="metadata" style={{ ...thumbStyle, background: '#000' }} />
    }
    const thumbSrc = mf?.thumbnail_file_url || mf?.thumbnail_url
    if (thumbSrc) {
      return <img src={thumbSrc} alt="" style={thumbStyle} />
    }
    return (
      <div
        className="d-flex align-items-center justify-content-center text-muted"
        style={{ ...thumbStyle, background: 'var(--bs-tertiary-bg, #f0f0f0)', fontSize: '0.9rem' }}
      >
        {getItemTypeIcon(item.asset_mimetype)}
      </div>
    )
  }

  // ── Rendering ──

  const defaultSlot = slots.find((s) => s.is_default || s.slot_type === 'default')
  const eventSlots = slots
    .filter((s) => s.slot_type === 'event')
    .sort((a, b) => (a.time_from < b.time_from ? -1 : 1))
  const timeSlots = slots
    .filter((s) => !s.is_default && s.slot_type !== 'default' && s.slot_type !== 'event')
    .sort((a, b) => (a.time_from < b.time_from ? -1 : 1))

  const renderSlotCard = (slot: ScheduleSlot) => (
    <div
      key={slot.slot_id}
      className={`fm-card mb-3 ${slot.is_currently_active ? 'fm-card-accent' : ''}`}
    >
      <div className="fm-card-header d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center gap-2">
          <strong>{slot.name || t('schedule.unnamed')}</strong>
          {slot.is_currently_active && (
            <span className="fm-badge-online">{t('schedule.active')}</span>
          )}
          {slot.is_default && (
            <span className="badge bg-warning text-dark">{t('schedule.defaultSlot')}</span>
          )}
          {slot.slot_type === 'event' && (
            <span className="badge bg-danger">{t('schedule.eventSlot')}</span>
          )}
          {!slot.is_default && (
            <span className="text-muted small">
              {formatTime(slot.time_from)}{slot.slot_type !== 'event' && <> – {formatTime(slot.time_to)}</>}
              {slot.days_of_week?.length > 0 && <> ({getDayLabels(slot.days_of_week)})</>}
              {slot.slot_type === 'event' && slot.start_date && <> — {slot.start_date}</>}
            </span>
          )}
        </div>
        <div className="d-flex gap-1">
          <button
            className="fm-btn-outline fm-btn-sm"
            onClick={() => handleEditSlot(slot)}
            title={t('common.edit')}
          >
            <FaEdit />
          </button>
          <button
            className="fm-btn-danger fm-btn-sm"
            onClick={() => handleDeleteSlot(slot)}
            title={t('common.delete')}
          >
            <FaTrash />
          </button>
        </div>
      </div>
      <div className="fm-card-body">
        {slot.items.length === 0 ? (
          <p className="text-muted mb-2">{t('schedule.noItems')}</p>
        ) : (
          <table className="fm-table mb-2" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: '30px' }}>#</th>
                <th style={{ width: '72px' }}></th>
                <th>{t('assets.name')}</th>
                <th style={{ width: '80px' }}>{t('schedule.type')}</th>
                <th style={{ width: '100px' }}>{t('assets.duration')}</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {slot.items
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((item, idx) => (
                  <tr key={item.item_id}>
                    <td className="text-muted">{idx + 1}</td>
                    <td style={{ padding: '4px' }}>
                      {renderItemThumbnail(item)}
                    </td>
                    <td>
                      <div
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={(e) => {
                          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
                          setHoveredItem(item)
                          setHoverRect(e.currentTarget.getBoundingClientRect())
                        }}
                        onMouseLeave={() => {
                          hoverTimeoutRef.current = setTimeout(() => setHoveredItem(null), 200)
                        }}
                      >
                        <span
                          className="fw-semibold"
                          style={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}
                        >
                          {item.asset_name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="badge bg-secondary">
                        {item.asset_mimetype?.split('/')[0] || '—'}
                      </span>
                    </td>
                    <td>
                      {editingDuration?.slotId === slot.slot_id && editingDuration?.itemId === item.item_id ? (
                        <input
                          type="number"
                          min="1"
                          className="form-control form-control-sm"
                          style={{ width: '80px' }}
                          value={editDurationValue}
                          onChange={(e) => setEditDurationValue(e.target.value)}
                          onBlur={() => handleDurationSave(slot, item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleDurationSave(slot, item)
                            if (e.key === 'Escape') setEditingDuration(null)
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          style={{ cursor: 'pointer', borderBottom: '1px dashed var(--bs-gray-400)' }}
                          onClick={() => handleDurationClick(slot, item)}
                          title={t('schedule.clickToEditDuration')}
                        >
                          {formatDuration(item.effective_duration)}
                          {item.duration_override !== null && (
                            <span className="text-muted small ms-1">*</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="fm-btn-danger fm-btn-sm"
                        onClick={() => handleRemoveItem(slot, item)}
                        title={t('schedule.remove')}
                        style={{ padding: '2px 6px' }}
                      >
                        <FaTimes />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
        <button
          className="fm-btn-outline fm-btn-sm"
          onClick={() => handleAddItem(slot)}
        >
          <FaPlus className="me-1" />
          {t('schedule.addItem')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fm-card fm-card-accent-purple mt-3">
      <div className="fm-card-header d-flex justify-content-between align-items-center">
        <h5 className="card-title mb-0 d-flex align-items-center gap-2">
          <FaCalendarAlt />
          {t('schedule.title')}
        </h5>
        <button
          className="fm-btn-primary fm-btn-sm"
          onClick={handleCreateSlot}
          disabled={!isOnline}
        >
          <FaPlus className="me-1" />
          {t('schedule.addSlot')}
        </button>
      </div>
      <div className="fm-card-body">
        {loading ? (
          <div className="fm-loading">
            <div className="spinner" />
          </div>
        ) : error ? (
          <p className="text-muted">{error}</p>
        ) : slots.length === 0 ? null : (
          <>
            {/* Status bar */}
            {status && status.schedule_enabled && (
              <div className="alert alert-info py-2 mb-3">
                <strong>{t('schedule.statusLabel')}:</strong>{' '}
                {status.current_slot ? (
                  <>
                    {t('schedule.activeNow')}: <strong>{status.current_slot.name}</strong>
                    {status.using_default && (
                      <span className="badge bg-secondary ms-1">{t('schedule.defaultSlot')}</span>
                    )}
                  </>
                ) : (
                  t('schedule.noActiveSlot')
                )}
              </div>
            )}

            {/* Default slot */}
            {defaultSlot && (
              <div className="mb-2">
                <h6 className="d-flex align-items-center gap-1 mb-2">
                  <FaStar className="text-warning" />
                  {t('schedule.defaultSlot')}
                </h6>
                {renderSlotCard(defaultSlot)}
              </div>
            )}

            {/* Event slots */}
            {eventSlots.length > 0 && (
              <div className="mb-2">
                <h6 className="d-flex align-items-center gap-1 mb-2">
                  <FaBolt className="text-danger" />
                  {t('schedule.eventSlots')}
                </h6>
                {eventSlots.map(renderSlotCard)}
              </div>
            )}

            {/* Time slots */}
            {timeSlots.length > 0 && (
              <div>
                <h6 className="d-flex align-items-center gap-1 mb-2">
                  <FaClock />
                  {t('schedule.timeSlots')}
                </h6>
                {timeSlots.map(renderSlotCard)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Hover tooltip for slot items */}
      {hoveredItem && hoverRect && (() => {
        const previewUrl = getItemPreviewUrl(hoveredItem)
        const mf = findMediaFile(hoveredItem.asset_name)
        return (
          <div
            style={{
              position: 'fixed',
              left: Math.min(hoverRect.left, window.innerWidth - 320),
              top: hoverRect.bottom + 8 + 240 > window.innerHeight
                ? hoverRect.top - 8 - 240
                : hoverRect.bottom + 8,
              zIndex: 10000,
              width: '300px',
              pointerEvents: 'none',
            }}
          >
            <div
              className="shadow-lg"
              style={{
                background: 'var(--bs-body-bg, #fff)',
                border: '1px solid var(--bs-border-color, #dee2e6)',
                borderRadius: '8px',
                overflow: 'hidden',
              }}
            >
              {hoveredItem.asset_mimetype === 'video' && previewUrl ? (
                <video
                  src={previewUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  style={{ width: '100%', height: '170px', objectFit: 'cover', display: 'block', background: '#000' }}
                />
              ) : hoveredItem.asset_mimetype === 'image' && previewUrl ? (
                <img
                  src={previewUrl}
                  alt={hoveredItem.asset_name}
                  style={{ width: '100%', height: '170px', objectFit: 'cover', display: 'block', background: '#000' }}
                />
              ) : hoveredItem.asset_mimetype === 'webpage' ? (
                <div
                  style={{
                    width: '100%',
                    height: '170px',
                    background: 'linear-gradient(135deg, #e8f4fd 0%, #d0e8f7 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {mf && (mf.thumbnail_file_url || mf.thumbnail_url) ? (
                    <img src={mf.thumbnail_file_url || mf.thumbnail_url!} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <>
                      <FaGlobe style={{ fontSize: '2rem', color: '#0d6efd', marginBottom: '8px' }} />
                      <small className="text-muted px-3 text-center" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                        {hoveredItem.asset_uri}
                      </small>
                    </>
                  )}
                </div>
              ) : (
                <div
                  className="d-flex flex-column align-items-center justify-content-center"
                  style={{
                    width: '100%',
                    height: '170px',
                    background: 'var(--bs-gray-200, #e9ecef)',
                    color: 'var(--bs-gray-500, #adb5bd)',
                    fontSize: '2.5rem',
                  }}
                >
                  {getItemTypeIcon(hoveredItem.asset_mimetype)}
                </div>
              )}
              <div className="p-2">
                <div className="fw-semibold mb-1" style={{ fontSize: '0.85rem', wordBreak: 'break-word' }}>
                  {hoveredItem.asset_name}
                </div>
                <div className="d-flex gap-3 text-muted" style={{ fontSize: '0.75rem' }}>
                  <span>{hoveredItem.asset_mimetype}</span>
                  <span>{formatDuration(hoveredItem.effective_duration)}</span>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Slot create/edit modal */}
      {showSlotModal && (
        <SlotFormModal
          playerId={playerId}
          existingSlot={editingSlot}
          onClose={() => {
            setShowSlotModal(false)
            setEditingSlot(null)
          }}
          onSaved={handleSlotSaved}
        />
      )}

      {/* Add item modal */}
      {showAddItemModal && addItemSlot && (
        <AddItemModal
          playerId={playerId}
          slot={addItemSlot}
          mediaFiles={mediaFiles}
          onClose={() => {
            setShowAddItemModal(false)
            setAddItemSlot(null)
          }}
          onAdded={handleItemAdded}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────
// Slot Form Modal (create / edit) — with type selection
// ────────────────────────────────────────────

const SlotFormModal = ({
  playerId,
  existingSlot,
  onClose,
  onSaved,
}: {
  playerId: string
  existingSlot: ScheduleSlot | null
  onClose: () => void
  onSaved: () => void
}) => {
  const { t } = useTranslation()
  const isEditing = !!existingSlot

  // Determine initial slot type from existing slot
  const getInitialType = (): SlotType | null => {
    if (!existingSlot) return null
    if (existingSlot.slot_type) return existingSlot.slot_type
    if (existingSlot.is_default) return 'default'
    return 'time'
  }

  const [slotType, setSlotType] = useState<SlotType | null>(getInitialType())
  const [name, setName] = useState(existingSlot?.name || '')
  const [timeFrom, setTimeFrom] = useState(
    existingSlot ? existingSlot.time_from.substring(0, 5) : '09:00',
  )
  const [timeTo, setTimeTo] = useState(
    existingSlot ? existingSlot.time_to.substring(0, 5) : '18:00',
  )
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(
    existingSlot ? [...existingSlot.days_of_week] : [...ALL_DAYS],
  )
  const [recurrence, setRecurrence] = useState<'once' | 'daily' | 'weekly'>(
    existingSlot?.start_date && (!existingSlot?.days_of_week?.length)
      ? 'once'
      : existingSlot?.days_of_week?.length === 7
        ? 'daily'
        : 'weekly',
  )
  const [startDate, setStartDate] = useState(existingSlot?.start_date || '')
  const [endDate, setEndDate] = useState(existingSlot?.end_date || '')
  const [submitting, setSubmitting] = useState(false)

  const toggleDay = (d: number) =>
    setDaysOfWeek((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!slotType) return
    setSubmitting(true)
    try {
      const data: Partial<ScheduleSlot> & Record<string, unknown> = {
        name,
        slot_type: slotType,
        is_default: slotType === 'default',
      }
      if (slotType === 'time') {
        data.time_from = timeFrom
        data.time_to = timeTo
        data.days_of_week = daysOfWeek
      }
      if (slotType === 'event') {
        data.time_from = timeFrom
        data.no_loop = true
        if (recurrence === 'once') {
          data.start_date = startDate || null
          data.days_of_week = []
        } else if (recurrence === 'daily') {
          data.days_of_week = [...ALL_DAYS]
          data.start_date = startDate || null
          data.end_date = endDate || null
        } else {
          data.days_of_week = daysOfWeek
          data.start_date = startDate || null
          data.end_date = endDate || null
        }
      }
      if (isEditing && existingSlot) {
        await scheduleApi.updateSlot(playerId, existingSlot.slot_id, data)
      } else {
        await scheduleApi.createSlot(playerId, data)
      }
      Swal.fire({ title: t('common.success'), icon: 'success', timer: 2000, showConfirmButton: false })
      onSaved()
    } catch (err: unknown) {
      Swal.fire(t('common.error'), translateApiError(err instanceof Error ? err.message : String(err), t), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = () => {
    if (!slotType || !name.trim()) return false
    if (slotType === 'time' && daysOfWeek.length === 0) return false
    if (slotType === 'event' && recurrence === 'weekly' && daysOfWeek.length === 0) return false
    return true
  }

  // ── Type selection step ──
  const renderTypeSelection = () => (
    <div className="d-flex flex-column gap-3">
      {/* Default */}
      <button
        type="button"
        className="btn btn-outline-secondary text-start p-3 d-flex align-items-start gap-3"
        onClick={() => setSlotType('default')}
      >
        <FaStar className="text-warning mt-1" style={{ fontSize: '1.5rem', flexShrink: 0 }} />
        <div>
          <div className="fw-bold">{t('schedule.slotTypeDefault')}</div>
          <small className="text-muted">{t('schedule.slotTypeDefaultDesc')}</small>
        </div>
      </button>

      {/* Time */}
      <button
        type="button"
        className="btn btn-outline-secondary text-start p-3 d-flex align-items-start gap-3"
        onClick={() => setSlotType('time')}
      >
        <FaClock className="text-primary mt-1" style={{ fontSize: '1.5rem', flexShrink: 0 }} />
        <div>
          <div className="fw-bold">{t('schedule.slotTypeTime')}</div>
          <small className="text-muted">{t('schedule.slotTypeTimeDesc')}</small>
        </div>
      </button>

      {/* Event */}
      <button
        type="button"
        className="btn btn-outline-secondary text-start p-3 d-flex align-items-start gap-3"
        onClick={() => { setSlotType('event'); setRecurrence('once') }}
      >
        <FaBolt className="text-danger mt-1" style={{ fontSize: '1.5rem', flexShrink: 0 }} />
        <div>
          <div className="fw-bold">{t('schedule.slotTypeEvent')}</div>
          <small className="text-muted">{t('schedule.slotTypeEventDesc')}</small>
        </div>
      </button>
    </div>
  )

  // ── Default form ──
  const renderDefaultForm = () => (
    <div className="mb-3">
      <label className="form-label fw-semibold">{t('schedule.slotName')}</label>
      <input
        type="text"
        className="form-control"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('schedule.slotNamePlaceholder')}
        required
      />
      <div className="form-text mt-2">{t('schedule.defaultHint')}</div>
    </div>
  )

  // ── Time form ──
  const renderTimeForm = () => (
    <>
      <div className="mb-3">
        <label className="form-label fw-semibold">{t('schedule.slotName')}</label>
        <input
          type="text"
          className="form-control"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('schedule.slotNamePlaceholder')}
          required
        />
      </div>
      <div className="row mb-3">
        <div className="col-6">
          <label className="form-label fw-semibold">{t('schedule.timeFrom')}</label>
          <input
            type="time"
            className="form-control"
            value={timeFrom}
            onChange={(e) => setTimeFrom(e.target.value)}
            required
          />
        </div>
        <div className="col-6">
          <label className="form-label fw-semibold">{t('schedule.timeTo')}</label>
          <input
            type="time"
            className="form-control"
            value={timeTo}
            onChange={(e) => setTimeTo(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="form-label fw-semibold">{t('schedule.daysOfWeek')}</label>
        <div className="d-flex flex-wrap gap-2">
          {ALL_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              className={`btn btn-sm ${daysOfWeek.includes(d) ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => toggleDay(d)}
            >
              {t(`schedule.days.${d}`)}
            </button>
          ))}
        </div>
      </div>
    </>
  )

  // ── Event form ──
  const renderEventForm = () => (
    <>
      <div className="mb-3">
        <label className="form-label fw-semibold">{t('schedule.slotName')}</label>
        <input
          type="text"
          className="form-control"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('schedule.slotNamePlaceholder')}
          required
        />
      </div>
      <div className="mb-3">
        <label className="form-label fw-semibold">{t('schedule.timeFrom')}</label>
        <input
          type="time"
          className="form-control"
          value={timeFrom}
          onChange={(e) => setTimeFrom(e.target.value)}
          required
        />
        <div className="form-text">{t('schedule.autoEndTime')}</div>
      </div>

      {/* Recurrence */}
      <div className="mb-3">
        <label className="form-label fw-semibold">{t('schedule.recurrence')}</label>
        <div className="d-flex gap-2">
          {(['once', 'daily', 'weekly'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`btn btn-sm ${recurrence === r ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => {
                setRecurrence(r)
                if (r === 'daily') setDaysOfWeek([...ALL_DAYS])
              }}
            >
              {t(`schedule.recurrence${r.charAt(0).toUpperCase() + r.slice(1)}`)}
            </button>
          ))}
        </div>
      </div>

      {/* One-time: date picker */}
      {recurrence === 'once' && (
        <div className="mb-3">
          <label className="form-label fw-semibold">{t('schedule.startDate')}</label>
          <input
            type="date"
            className="form-control"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
      )}

      {/* Weekly: days of week */}
      {recurrence === 'weekly' && (
        <div className="mb-3">
          <label className="form-label fw-semibold">{t('schedule.daysOfWeek')}</label>
          <div className="d-flex flex-wrap gap-2">
            {ALL_DAYS.map((d) => (
              <button
                key={d}
                type="button"
                className={`btn btn-sm ${daysOfWeek.includes(d) ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => toggleDay(d)}
              >
                {t(`schedule.days.${d}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Date range for daily/weekly */}
      {recurrence !== 'once' && (
        <div className="row mb-3">
          <div className="col-6">
            <label className="form-label text-muted small">{t('schedule.startDate')}</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="col-6">
            <label className="form-label text-muted small">{t('schedule.endDate')}</label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="form-text mt-1">{t('schedule.dateRangeHint')}</div>
        </div>
      )}
    </>
  )

  // ── Header with type badge ──
  const getTypeIcon = () => {
    if (slotType === 'default') return <FaStar className="text-warning me-2" />
    if (slotType === 'time') return <FaClock className="text-primary me-2" />
    if (slotType === 'event') return <FaBolt className="text-danger me-2" />
    return null
  }

  const getTypeLabel = () => {
    if (slotType === 'default') return t('schedule.slotTypeDefault')
    if (slotType === 'time') return t('schedule.slotTypeTime')
    if (slotType === 'event') return t('schedule.slotTypeEvent')
    return ''
  }

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title d-flex align-items-center">
                {slotType && !isEditing && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary me-2"
                    onClick={() => setSlotType(null)}
                    title={t('common.cancel')}
                  >
                    &larr;
                  </button>
                )}
                {isEditing ? (
                  <>{getTypeIcon()}{t('schedule.editSlot')}</>
                ) : slotType ? (
                  <>{getTypeIcon()}{getTypeLabel()}</>
                ) : (
                  t('schedule.chooseSlotType')
                )}
              </h5>
              <button type="button" className="btn-close" onClick={onClose} />
            </div>
            <div className="modal-body">
              {!slotType && !isEditing ? (
                renderTypeSelection()
              ) : slotType === 'default' ? (
                renderDefaultForm()
              ) : slotType === 'event' ? (
                renderEventForm()
              ) : (
                renderTimeForm()
              )}
            </div>
            {slotType && (
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting || !canSubmit()}
                >
                  {submitting
                    ? t('schedule.saving')
                    : isEditing
                      ? t('common.save')
                      : t('schedule.create')}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────
// Add Item Modal (multi-select + library tab)
// ────────────────────────────────────────────

const getContentIcon = (fileType: string) => {
  if (fileType === 'image') return <FaImage className="text-success" />
  if (fileType === 'video') return <FaVideo className="text-primary" />
  if (fileType === 'web') return <FaGlobe className="text-info" />
  return <FaFile className="text-secondary" />
}

const AddItemModal = ({
  playerId,
  slot,
  mediaFiles,
  onClose,
  onAdded,
}: {
  playerId: string
  slot: ScheduleSlot
  mediaFiles: MediaFile[]
  onClose: () => void
  onAdded: () => void
}) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'assets' | 'library'>('assets')

  // Assets tab state
  const [assets, setAssets] = useState<PlayerAsset[]>([])
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [addProgress, setAddProgress] = useState({ current: 0, total: 0 })

  // Library tab state
  const [libraryFiles, setLibraryFiles] = useState<MediaFile[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set())
  const [deployProgress, setDeployProgress] = useState({ current: 0, total: 0 })

  // Duration override for new items
  const [itemDuration, setItemDuration] = useState('10')

  const findMediaForAsset = useCallback((asset: PlayerAsset): MediaFile | null => {
    return mediaFiles.find(f => f.name === asset.name) || null
  }, [mediaFiles])

  useEffect(() => {
    const load = async () => {
      try {
        const data = await playersApi.getAssets(playerId)
        const existingIds = new Set(slot.items.map((i) => i.asset_id))
        setAssets(data.filter((a) => !existingIds.has(a.asset_id)))
      } catch {
        setAssets([])
      } finally {
        setLoadingAssets(false)
      }
    }
    load()
  }, [playerId, slot])

  // Load library files when switching to library tab
  useEffect(() => {
    if (activeTab === 'library' && libraryFiles.length === 0 && !loadingLibrary) {
      setLoadingLibrary(true)
      mediaApi.list().then(files => {
        setLibraryFiles(files)
      }).catch(() => {
        setLibraryFiles([])
      }).finally(() => {
        setLoadingLibrary(false)
      })
    }
  }, [activeTab, libraryFiles.length, loadingLibrary])

  // Toggle asset selection
  const toggleAsset = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllAssets = () => {
    setSelectedIds(new Set(assets.map(a => a.asset_id)))
  }

  const deselectAllAssets = () => {
    setSelectedIds(new Set())
  }

  // Toggle library file selection
  const toggleFile = (id: string) => {
    setSelectedFileIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllFiles = () => {
    setSelectedFileIds(new Set(libraryFiles.map(f => f.id)))
  }

  const deselectAllFiles = () => {
    setSelectedFileIds(new Set())
  }

  // Submit assets (from player)
  const handleSubmitAssets = async () => {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    const ids = Array.from(selectedIds)
    setAddProgress({ current: 0, total: ids.length })
    const durVal = parseInt(itemDuration, 10)
    const durOverride = !isNaN(durVal) && durVal > 0 ? durVal : null

    try {
      for (let i = 0; i < ids.length; i++) {
        setAddProgress({ current: i + 1, total: ids.length })
        const asset = assets.find(a => a.asset_id === ids[i])
        const mt = asset?.mimetype?.toLowerCase() || ''
        const isVideo = mt === 'video'
        await scheduleApi.addItem(playerId, slot.slot_id, {
          asset_id: ids[i],
          ...(!isVideo && durOverride ? { duration_override: durOverride } : {}),
        })
      }
      Swal.fire({ title: t('common.success'), icon: 'success', timer: 2000, showConfirmButton: false })
      onAdded()
    } catch (err: unknown) {
      Swal.fire(t('common.error'), translateApiError(err instanceof Error ? err.message : String(err), t), 'error')
    } finally {
      setSubmitting(false)
      setAddProgress({ current: 0, total: 0 })
    }
  }

  // Submit files (from library — deploy then add)
  const handleSubmitLibrary = async () => {
    if (selectedFileIds.size === 0) return
    setSubmitting(true)
    const fileIds = Array.from(selectedFileIds)
    setDeployProgress({ current: 0, total: fileIds.length })
    const durVal = parseInt(itemDuration, 10)
    const durOverride = !isNaN(durVal) && durVal > 0 ? durVal : null

    try {
      for (let i = 0; i < fileIds.length; i++) {
        setDeployProgress({ current: i + 1, total: fileIds.length })
        const file = libraryFiles.find(f => f.id === fileIds[i])
        const ft = file?.file_type?.toLowerCase() || ''
        const isVideo = ft === 'video'
        const result = await playersApi.deployContent(playerId, fileIds[i])
        const assetId = result?.asset_id
        if (assetId) {
          await scheduleApi.addItem(playerId, slot.slot_id, {
            asset_id: assetId,
            ...(!isVideo && durOverride ? { duration_override: durOverride } : {}),
          })
        }
      }
      Swal.fire({ title: t('common.success'), icon: 'success', timer: 2000, showConfirmButton: false })
      onAdded()
    } catch (err: unknown) {
      Swal.fire(t('common.error'), translateApiError(err instanceof Error ? err.message : String(err), t), 'error')
    } finally {
      setSubmitting(false)
      setDeployProgress({ current: 0, total: 0 })
    }
  }

  const cardThumbStyle: React.CSSProperties = {
    width: '100%',
    aspectRatio: '16/9',
    objectFit: 'cover',
    borderRadius: '6px 6px 0 0',
    display: 'block',
  }

  const renderAssetCardThumb = (asset: PlayerAsset) => {
    const mf = findMediaForAsset(asset)
    const mt = asset.mimetype?.toLowerCase() || ''

    if (mt === 'image' && mf?.url) {
      return <img src={mf.url} alt="" style={cardThumbStyle} />
    }
    if (mt === 'video' && mf?.url) {
      return <video src={mf.url} muted playsInline preload="metadata" style={{ ...cardThumbStyle, background: '#000' }} />
    }
    const cardThumb = mf?.thumbnail_file_url || mf?.thumbnail_url
    if (cardThumb) {
      return <img src={cardThumb} alt="" style={cardThumbStyle} />
    }
    return (
      <div
        className="d-flex align-items-center justify-content-center text-muted"
        style={{ ...cardThumbStyle, background: 'var(--bs-tertiary-bg, #f0f0f0)', fontSize: '1.5rem' }}
      >
        {getItemTypeIcon(asset.mimetype)}
      </div>
    )
  }

  const renderFileCardThumb = (file: MediaFile) => {
    if (file.file_type === 'video' && file.url) {
      return <video src={file.url} muted playsInline preload="metadata" style={{ ...cardThumbStyle, background: '#000' }} />
    }
    if (file.file_type === 'image' && file.url) {
      return <img src={file.url} alt="" style={cardThumbStyle} />
    }
    if (file.thumbnail_file_url || file.thumbnail_url) {
      return <img src={file.thumbnail_file_url || file.thumbnail_url!} alt="" style={cardThumbStyle} />
    }
    return (
      <div
        className="d-flex align-items-center justify-content-center"
        style={{ ...cardThumbStyle, background: 'var(--bs-gray-200, #e9ecef)', fontSize: '1.5rem', color: 'var(--bs-gray-500, #adb5bd)' }}
      >
        {getContentIcon(file.file_type)}
      </div>
    )
  }

  return (
    <div className="modal d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="modal-dialog modal-xl" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{t('schedule.addItemToSlot')}: {slot.name}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {/* Tabs */}
            <ul className="nav nav-tabs mb-3">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === 'assets' ? 'active' : ''}`}
                  onClick={() => setActiveTab('assets')}
                >
                  {t('schedule.fromAssets')}
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link ${activeTab === 'library' ? 'active' : ''}`}
                  onClick={() => setActiveTab('library')}
                >
                  {t('schedule.fromLibrary')}
                </button>
              </li>
            </ul>

            {/* Assets tab */}
            {activeTab === 'assets' && (
              <>
                {loadingAssets ? (
                  <div className="text-center py-3">
                    <div className="spinner-border spinner-border-sm" />
                  </div>
                ) : assets.length === 0 ? (
                  <p className="text-muted">{t('schedule.noAvailableAssets')}</p>
                ) : (
                  <>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label fw-semibold mb-0">
                        {t('schedule.selectAsset')}
                        {selectedIds.size > 0 && (
                          <span className="badge bg-primary ms-2">{selectedIds.size}</span>
                        )}
                      </label>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={selectAllAssets}
                        >
                          {t('schedule.selectAll')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={deselectAllAssets}
                        >
                          {t('schedule.deselectAll')}
                        </button>
                      </div>
                    </div>
                    <div className="row g-2" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {assets.map((asset) => {
                        const isSelected = selectedIds.has(asset.asset_id)
                        return (
                          <div key={asset.asset_id} className="col-4 col-md-3 col-lg-2">
                            <div
                              className="card h-100"
                              style={{
                                cursor: 'pointer',
                                border: isSelected ? '2px solid var(--bs-primary)' : undefined,
                                transition: 'border 0.15s',
                              }}
                              onClick={() => toggleAsset(asset.asset_id)}
                              onMouseEnter={(e) => {
                                const vid = e.currentTarget.querySelector('video')
                                if (vid) vid.play().catch(() => {})
                              }}
                              onMouseLeave={(e) => {
                                const vid = e.currentTarget.querySelector('video')
                                if (vid) { vid.pause(); vid.currentTime = 0 }
                              }}
                            >
                              <div style={{ position: 'relative' }}>
                                {renderAssetCardThumb(asset)}
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                    fontSize: '1rem',
                                    color: isSelected ? 'var(--bs-primary)' : 'rgba(255,255,255,0.8)',
                                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                  }}
                                >
                                  {isSelected ? <FaCheckSquare /> : <FaSquare />}
                                </div>
                              </div>
                              <div className="card-body p-1">
                                <div className="fw-medium text-truncate" style={{ fontSize: '0.75rem' }} title={asset.name}>
                                  {asset.name}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Library tab */}
            {activeTab === 'library' && (
              <>
                {loadingLibrary ? (
                  <div className="text-center py-3">
                    <div className="spinner-border spinner-border-sm" />
                  </div>
                ) : libraryFiles.length === 0 ? (
                  <p className="text-muted">{t('assets.noContent')}</p>
                ) : (
                  <>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label fw-semibold mb-0">
                        {t('schedule.fromLibrary')}
                        {selectedFileIds.size > 0 && (
                          <span className="badge bg-primary ms-2">{selectedFileIds.size}</span>
                        )}
                      </label>
                      <div className="d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={selectAllFiles}
                        >
                          {t('schedule.selectAll')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={deselectAllFiles}
                        >
                          {t('schedule.deselectAll')}
                        </button>
                      </div>
                    </div>
                    <div className="row g-2" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {libraryFiles.map((file) => {
                        const isSelected = selectedFileIds.has(file.id)
                        return (
                          <div key={file.id} className="col-4 col-md-3 col-lg-2">
                            <div
                              className="card h-100"
                              style={{
                                cursor: 'pointer',
                                border: isSelected ? '2px solid var(--bs-primary)' : undefined,
                                transition: 'border 0.15s',
                              }}
                              onClick={() => toggleFile(file.id)}
                              onMouseEnter={(e) => {
                                const vid = e.currentTarget.querySelector('video')
                                if (vid) vid.play().catch(() => {})
                              }}
                              onMouseLeave={(e) => {
                                const vid = e.currentTarget.querySelector('video')
                                if (vid) { vid.pause(); vid.currentTime = 0 }
                              }}
                            >
                              <div style={{ position: 'relative' }}>
                                {renderFileCardThumb(file)}
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 4,
                                    fontSize: '1rem',
                                    color: isSelected ? 'var(--bs-primary)' : 'rgba(255,255,255,0.8)',
                                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                                  }}
                                >
                                  {isSelected ? <FaCheckSquare /> : <FaSquare />}
                                </div>
                              </div>
                              <div className="card-body p-1">
                                <div className="fw-medium text-truncate" style={{ fontSize: '0.75rem' }} title={file.name}>
                                  {file.name}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
            )}

          </div>
          <div className="modal-footer">
            {/* Duration input */}
            <div className="d-flex align-items-center gap-2 me-auto">
              <label className="form-label mb-0 fw-semibold text-nowrap" style={{ fontSize: '0.85rem' }}>
                {t('assets.duration')}:
              </label>
              <div className="input-group input-group-sm" style={{ width: '120px' }}>
                <input
                  type="number"
                  className="form-control"
                  min="1"
                  value={itemDuration}
                  onChange={(e) => setItemDuration(e.target.value)}
                  disabled={submitting}
                />
                <span className="input-group-text">{t('assets.sec')}</span>
              </div>
              {/* Progress indicator */}
              {submitting && addProgress.total > 0 && (
                <span className="text-muted ms-2">
                  {t('schedule.addingProgress', { current: addProgress.current, total: addProgress.total })}
                </span>
              )}
              {submitting && deployProgress.total > 0 && (
                <span className="text-muted ms-2">
                  {t('schedule.addingProgress', { current: deployProgress.current, total: deployProgress.total })}
                </span>
              )}
            </div>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </button>
            {activeTab === 'assets' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting || selectedIds.size === 0}
                onClick={handleSubmitAssets}
              >
                {submitting ? t('schedule.adding') : `${t('schedule.addItem')} (${selectedIds.size})`}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting || selectedFileIds.size === 0}
                onClick={handleSubmitLibrary}
              >
                {submitting ? t('schedule.adding') : `${t('schedule.deployAndAdd')} (${selectedFileIds.size})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
