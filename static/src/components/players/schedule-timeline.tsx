import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCalendarAlt } from 'react-icons/fa'
import type { ScheduleSlot } from '@/types'

interface ScheduleTimelineProps {
  slots: ScheduleSlot[]
}

type ViewMode = 'day' | 'week'

const SLOT_COLORS: Record<string, { bg: string; border: string }> = {
  default: { bg: 'rgba(255,193,7,0.25)', border: '#ffc107' },
  time:    { bg: 'rgba(136,25,199,0.45)', border: '#8819c7' },
  event:   { bg: 'rgba(220,53,69,0.2)',   border: '#dc3545' },
}

const getSlotColor = (slot: ScheduleSlot) =>
  slot.is_default ? SLOT_COLORS.default : (SLOT_COLORS[slot.slot_type] || SLOT_COLORS.time)

// ── Helpers ──

const dayOfWeekISO = (date: Date): number => {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

const parseTime = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const addDays = (d: Date, n: number) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Monday of the week containing `date`
const getMonday = (date: Date) => {
  const d = new Date(date)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const formatDateShort = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
}

const toISODate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Get slots active on a given day of week (1=Mon..7=Sun)
const slotsForDay = (slots: ScheduleSlot[], dow: number): ScheduleSlot[] =>
  slots.filter(s => {
    if (s.is_default || s.slot_type === 'default') return true
    if (s.days_of_week?.length > 0) return s.days_of_week.includes(dow)
    return true
  })

// ── Event markers (triangles above the track) ──

const EventMarkers: React.FC<{
  events: ScheduleSlot[]
  tooltip: { slot: ScheduleSlot; x: number; y: number } | null
  setTooltip: (v: { slot: ScheduleSlot; x: number; y: number } | null) => void
}> = ({ events, tooltip, setTooltip }) => {
  if (events.length === 0) return null

  return (
    <div className="fm-timeline-events">
      {events.map(slot => {
        const from = parseTime(slot.time_from)
        const leftPct = (from / 1440) * 100
        const color = getSlotColor(slot)

        return (
          <div
            key={slot.slot_id}
            className="fm-timeline-event-marker"
            style={{ left: `${leftPct}%` }}
            onMouseEnter={(e) => setTooltip({ slot, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setTooltip({ slot, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="fm-timeline-event-label">{slot.name}</span>
            <svg width="14" height="10" viewBox="0 0 14 10" className="fm-timeline-event-triangle">
              <polygon points="0,0 14,0 7,10" fill={color.border} />
            </svg>
          </div>
        )
      })}
    </div>
  )
}

// ── Day View ──

const DayView: React.FC<{ slots: ScheduleSlot[]; selectedDate: Date; t: (k: string) => string }> = ({ slots, selectedDate, t }) => {
  const now = new Date()
  const isToday = isSameDay(selectedDate, now)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const nowPct = (currentMinutes / 1440) * 100
  const dow = dayOfWeekISO(selectedDate)
  const active = slotsForDay(slots, dow)
  const defaultSlot = active.find(s => s.is_default || s.slot_type === 'default')
  const timeSlots = active.filter(s => !s.is_default && s.slot_type !== 'default' && s.slot_type !== 'event')
  const eventSlots = active.filter(s => s.slot_type === 'event')

  const [tooltip, setTooltip] = useState<{ slot: ScheduleSlot; x: number; y: number } | null>(null)

  return (
    <div className="fm-timeline-day">
      {/* Hour labels */}
      <div className="fm-timeline-hours">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>

      {/* Event markers above the track */}
      <EventMarkers events={eventSlots} tooltip={tooltip} setTooltip={setTooltip} />

      {/* Track */}
      <div className="fm-timeline-track">
        {/* Grid lines */}
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
          <div key={h} className="fm-timeline-gridline" style={{ left: `${(h / 24) * 100}%` }} />
        ))}

        {/* Default slot background */}
        {defaultSlot && (
          <div
            className="fm-timeline-bar fm-timeline-bar-default"
            style={{
              left: 0,
              width: '100%',
              background: getSlotColor(defaultSlot).bg,
            }}
            onMouseEnter={(e) => setTooltip({ slot: defaultSlot, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTooltip(null)}
          />
        )}

        {/* Time slots */}
        {timeSlots.map(slot => {
          const from = parseTime(slot.time_from)
          const to = parseTime(slot.time_to)
          const leftPct = (from / 1440) * 100
          const widthPct = ((to > from ? to - from : 1440 - from + to) / 1440) * 100
          const color = getSlotColor(slot)

          return (
            <div
              key={slot.slot_id}
              className="fm-timeline-bar"
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(widthPct, 0.5)}%`,
                background: color.bg,
                borderLeft: `3px solid ${color.border}`,
              }}
              onMouseEnter={(e) => setTooltip({ slot, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => tooltip && setTooltip({ slot, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
            >
              <span className="fm-timeline-bar-label">{slot.name}</span>
            </div>
          )
        })}

        {/* Current time marker — only if viewing today */}
        {isToday && (
          <div className="fm-timeline-now" style={{ left: `${nowPct}%` }}>
            <div className="fm-timeline-now-dot" />
            <div className="fm-timeline-now-line" />
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fm-timeline-tooltip"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 40,
          }}
        >
          <strong>{tooltip.slot.name}</strong>
          <div>
            {tooltip.slot.is_default
              ? t('schedule.timeline.defaultSlot')
              : tooltip.slot.slot_type === 'event'
                ? `${t('schedule.timeline.eventSlot')} — ${tooltip.slot.time_from?.substring(0, 5)}`
                : `${tooltip.slot.time_from?.substring(0, 5)} – ${tooltip.slot.time_to?.substring(0, 5)}`}
          </div>
          <div>{tooltip.slot.items.length} {t('schedule.timeline.items')}</div>
        </div>
      )}
    </div>
  )
}

// ── Week View ──

const WeekView: React.FC<{ slots: ScheduleSlot[]; weekStart: Date; t: (k: string) => string }> = ({ slots, weekStart, t }) => {
  const now = new Date()
  const todayDow = dayOfWeekISO(now)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const nowPct = (currentMinutes / 1440) * 100

  // Build 7 days starting from weekStart (Monday)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const dow = dayOfWeekISO(date) // 1..7
    return { date, dow, isToday: isSameDay(date, now) }
  })

  return (
    <div className="fm-timeline-week">
      {/* Hour labels */}
      <div className="fm-timeline-week-hours">
        <div className="fm-timeline-week-label" />
        {[0, 6, 12, 18, 24].map(h => (
          <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>

      {/* Rows */}
      {days.map(({ date, dow, isToday }) => {
        const daySlots = slotsForDay(slots, dow)
        const defaultSlot = daySlots.find(s => s.is_default || s.slot_type === 'default')
        const timeSlots = daySlots.filter(s => !s.is_default && s.slot_type !== 'default' && s.slot_type !== 'event')
        const eventSlots = daySlots.filter(s => s.slot_type === 'event')

        const dayLabel = `${t(`schedule.days.${dow}`)} ${date.getDate()}`

        return (
          <div key={dow} className={`fm-timeline-week-row ${isToday ? 'fm-timeline-week-today' : ''}`}>
            <div className="fm-timeline-week-label">
              {dayLabel}
            </div>
            <div className="fm-timeline-week-track-wrap">
              {/* Event triangles above mini-track */}
              {eventSlots.length > 0 && (
                <div className="fm-timeline-week-events">
                  {eventSlots.map(slot => {
                    const from = parseTime(slot.time_from)
                    const leftPct = (from / 1440) * 100
                    const color = getSlotColor(slot)
                    return (
                      <div
                        key={slot.slot_id}
                        className="fm-timeline-event-marker fm-timeline-event-marker-sm"
                        style={{ left: `${leftPct}%` }}
                        title={`${slot.name} (${slot.time_from?.substring(0, 5)})`}
                      >
                        <svg width="8" height="6" viewBox="0 0 8 6">
                          <polygon points="0,0 8,0 4,6" fill={color.border} />
                        </svg>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="fm-timeline-week-track">
                {/* Grid */}
                {[0, 6, 12, 18, 24].map(h => (
                  <div key={h} className="fm-timeline-gridline" style={{ left: `${(h / 24) * 100}%` }} />
                ))}

                {/* Default bg */}
                {defaultSlot && (
                  <div
                    className="fm-timeline-bar fm-timeline-bar-default"
                    style={{
                      left: 0,
                      width: '100%',
                      background: getSlotColor(defaultSlot).bg,
                    }}
                  />
                )}

                {/* Time slots */}
                {timeSlots.map(slot => {
                  const from = parseTime(slot.time_from)
                  const to = parseTime(slot.time_to)
                  const leftPct = (from / 1440) * 100
                  const widthPct = ((to > from ? to - from : 1440 - from + to) / 1440) * 100
                  const color = getSlotColor(slot)
                  return (
                    <div
                      key={slot.slot_id}
                      className="fm-timeline-bar"
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(widthPct, 0.5)}%`,
                        background: color.bg,
                        borderLeft: `2px solid ${color.border}`,
                      }}
                      title={`${slot.name} (${slot.time_from?.substring(0, 5)}–${slot.time_to?.substring(0, 5)})`}
                    />
                  )
                })}

                {/* Now marker only for today */}
                {isToday && (
                  <div className="fm-timeline-now fm-timeline-now-sm" style={{ left: `${nowPct}%` }}>
                    <div className="fm-timeline-now-line" />
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Component ──

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({ slots }) => {
  const { t } = useTranslation()
  const [view, setView] = useState<ViewMode>('day')
  const now = new Date()

  // Day navigation
  const [selectedDate, setSelectedDate] = useState(new Date())
  // Week navigation (Monday of selected week)
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))

  // Update current time marker every minute
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  if (slots.length === 0) {
    return null
  }

  const views: { key: ViewMode; label: string }[] = [
    { key: 'day', label: t('schedule.timeline.day') },
    { key: 'week', label: t('schedule.timeline.week') },
  ]

  const isToday = isSameDay(selectedDate, now)
  const isCurrentWeek = isSameDay(weekStart, getMonday(now))

  // Week range label
  const weekEnd = addDays(weekStart, 6)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const weekLabel = `${pad2(weekStart.getDate())}.${pad2(weekStart.getMonth() + 1)} – ${pad2(weekEnd.getDate())}.${pad2(weekEnd.getMonth() + 1)}.${weekEnd.getFullYear()}`

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = new Date(e.target.value + 'T00:00:00')
    if (!isNaN(d.getTime())) {
      setSelectedDate(d)
      setWeekStart(getMonday(d))
    }
  }

  const goToday = () => {
    setSelectedDate(new Date())
    setWeekStart(getMonday(new Date()))
  }

  return (
    <div className="fm-card fm-card-accent-purple mt-3">
      <div className="fm-card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <h5 className="card-title mb-0">{t('schedule.timeline.title')}</h5>

          {/* Date picker */}
          <div className="fm-timeline-nav">
            <FaCalendarAlt className="fm-timeline-cal-icon" />
            <input
              type="date"
              className="fm-timeline-date-input"
              value={toISODate(selectedDate)}
              onChange={handleDateChange}
            />
            {view === 'week' && (
              <span className="fm-timeline-week-range">{weekLabel}</span>
            )}
            {((view === 'day' && !isToday) || (view === 'week' && !isCurrentWeek)) && (
              <button type="button" className="fm-timeline-today-btn" onClick={goToday}>
                {t('schedule.timeline.today')}
              </button>
            )}
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {/* Legend */}
          <div className="fm-timeline-legend d-none d-md-flex">
            <span className="fm-timeline-legend-item">
              <span className="fm-timeline-legend-swatch" style={{ background: SLOT_COLORS.default.border }} />
              {t('schedule.timeline.defaultSlot')}
            </span>
            <span className="fm-timeline-legend-item">
              <span className="fm-timeline-legend-swatch" style={{ background: SLOT_COLORS.time.border }} />
              {t('schedule.timeline.timeSlot')}
            </span>
            <span className="fm-timeline-legend-item">
              <span className="fm-timeline-legend-swatch fm-timeline-legend-swatch-event" style={{ background: SLOT_COLORS.event.border }} />
              {t('schedule.timeline.eventSlot')}
            </span>
          </div>
          {/* View selector */}
          <div className="fm-timeline-pills">
            {views.map(v => (
              <button
                key={v.key}
                type="button"
                className={`fm-timeline-pill ${view === v.key ? 'fm-timeline-pill-active' : ''}`}
                onClick={() => setView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="fm-card-body">
        {view === 'day' && <DayView slots={slots} selectedDate={selectedDate} t={t} />}
        {view === 'week' && <WeekView slots={slots} weekStart={weekStart} t={t} />}
      </div>
    </div>
  )
}
