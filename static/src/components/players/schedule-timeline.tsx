import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FaCalendarAlt } from 'react-icons/fa'
import type { ScheduleSlot } from '@/types'

// ── Types ──

interface DisplaySchedule {
  enabled: boolean
  days: Record<string, { on: string; off: string } | null>
}

interface ScheduleTimelineProps {
  slots: ScheduleSlot[]
  displaySchedule?: DisplaySchedule
}

type ViewMode = 'day' | 'week'

// ── Color palette ──

const DEFAULT_COLOR = { bg: 'rgba(255,193,7,0.25)', border: '#ffc107' }
const EVENT_COLOR  = { bg: 'rgba(220,53,69,0.30)', border: '#dc3545' }

const TIME_SLOT_PALETTE = [
  { bg: 'rgba(136,25,199,0.45)', border: '#8819c7' },   // Purple
  { bg: 'rgba(25,135,199,0.40)', border: '#1987c7' },    // Blue
  { bg: 'rgba(0,166,125,0.35)',  border: '#00a67d' },    // Teal
  { bg: 'rgba(199,120,25,0.40)', border: '#c77819' },    // Orange
  { bg: 'rgba(199,25,120,0.35)', border: '#c71978' },    // Pink
  { bg: 'rgba(80,160,40,0.35)',  border: '#50a028' },    // Green
]

// ── Helpers ──

const dayOfWeekISO = (date: Date): number => {
  const d = date.getDay()
  return d === 0 ? 7 : d
}

const parseTime = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const fmtTime = (minutes: number): string => {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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

const getMonday = (date: Date) => {
  const d = new Date(date)
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const toISODate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const slotsForDay = (slots: ScheduleSlot[], dow: number): ScheduleSlot[] =>
  slots.filter(s => {
    if (s.is_default || s.slot_type === 'default') return true
    if (s.days_of_week?.length > 0) return s.days_of_week.includes(dow)
    return true
  })

/** Total effective duration of all items in a slot (in seconds) */
const slotDurationSec = (slot: ScheduleSlot): number =>
  slot.items.reduce((sum, it) => sum + (it.effective_duration || 0), 0)

/** Build a stable color map: time slot_id → palette index */
const buildSlotColorMap = (slots: ScheduleSlot[]): Map<string, number> => {
  const map = new Map<string, number>()
  let idx = 0
  for (const s of slots) {
    if (!s.is_default && s.slot_type !== 'default' && s.slot_type !== 'event') {
      if (!map.has(s.slot_id)) {
        map.set(s.slot_id, idx % TIME_SLOT_PALETTE.length)
        idx++
      }
    }
  }
  return map
}

const getTimeSlotColor = (slotId: string, colorMap: Map<string, number>) => {
  const idx = colorMap.get(slotId)
  return idx !== undefined ? TIME_SLOT_PALETTE[idx] : TIME_SLOT_PALETTE[0]
}

// ── Display-off overlay ranges ──

interface OffRange { leftPct: number; widthPct: number }

const getDisplayOffRanges = (displaySchedule: DisplaySchedule | undefined, dow: number): OffRange[] => {
  if (!displaySchedule?.enabled) return []
  const dayKey = String(dow)
  const dayCfg = displaySchedule.days[dayKey]

  // null means screen off all day
  if (dayCfg === null) {
    return [{ leftPct: 0, widthPct: 100 }]
  }
  // undefined — day not configured, assume always on
  if (dayCfg === undefined) return []

  const onMin = parseTime(dayCfg.on)
  const offMin = parseTime(dayCfg.off)

  const ranges: OffRange[] = []
  // Off from 00:00 to on-time
  if (onMin > 0) {
    ranges.push({ leftPct: 0, widthPct: (onMin / 1440) * 100 })
  }
  // Off from off-time to 24:00
  if (offMin < 1440) {
    ranges.push({ leftPct: (offMin / 1440) * 100, widthPct: ((1440 - offMin) / 1440) * 100 })
  }
  return ranges
}

// ── Day View ──

const DayView: React.FC<{
  slots: ScheduleSlot[]
  selectedDate: Date
  colorMap: Map<string, number>
  displaySchedule?: DisplaySchedule
  t: (k: string) => string
}> = ({ slots, selectedDate, colorMap, displaySchedule, t }) => {
  const now = new Date()
  const isToday = isSameDay(selectedDate, now)
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const nowPct = (currentMinutes / 1440) * 100
  const dow = dayOfWeekISO(selectedDate)
  const active = slotsForDay(slots, dow)
  const defaultSlot = active.find(s => s.is_default || s.slot_type === 'default')
  const timeSlots = active.filter(s => !s.is_default && s.slot_type !== 'default' && s.slot_type !== 'event')
  const eventSlots = active.filter(s => s.slot_type === 'event')
  const offRanges = getDisplayOffRanges(displaySchedule, dow)

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
              background: DEFAULT_COLOR.bg,
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
          const color = getTimeSlotColor(slot.slot_id, colorMap)

          return (
            <div
              key={slot.slot_id}
              className="fm-timeline-bar fm-timeline-bar-time"
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

        {/* Event blocks */}
        {eventSlots.map(slot => {
          const from = parseTime(slot.time_from)
          const durationSec = slotDurationSec(slot)
          const durationMin = durationSec / 60
          const leftPct = (from / 1440) * 100
          const widthPct = durationMin > 0 ? (durationMin / 1440) * 100 : 0

          // Calculate end time for tooltip
          const endMin = from + durationMin

          return (
            <div
              key={slot.slot_id}
              className="fm-timeline-bar fm-timeline-bar-event"
              style={{
                left: `${leftPct}%`,
                width: `${Math.max(widthPct, 0.3)}%`,
                minWidth: durationMin > 0 ? undefined : '4px',
                background: EVENT_COLOR.bg,
                borderLeft: `3px solid ${EVENT_COLOR.border}`,
              }}
              onMouseEnter={(e) => setTooltip({ slot, x: e.clientX, y: e.clientY })}
              onMouseMove={(e) => tooltip && setTooltip({ slot, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
            >
              <span className="fm-timeline-bar-label">{slot.name}</span>
            </div>
          )
        })}

        {/* Display-off overlay */}
        {offRanges.map((r, i) => (
          <div
            key={`off-${i}`}
            className="fm-timeline-display-off"
            style={{ left: `${r.leftPct}%`, width: `${r.widthPct}%` }}
            title={t('schedule.timeline.displayOff')}
          />
        ))}

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
                ? (() => {
                    const from = parseTime(tooltip.slot.time_from)
                    const dur = slotDurationSec(tooltip.slot) / 60
                    return `${t('schedule.timeline.eventSlot')} ${fmtTime(from)} – ${fmtTime(from + dur)}`
                  })()
                : `${tooltip.slot.time_from?.substring(0, 5)} – ${tooltip.slot.time_to?.substring(0, 5)}`}
          </div>
          <div>{tooltip.slot.items.length} {t('schedule.timeline.items')}</div>
        </div>
      )}
    </div>
  )
}

// ── Week View ──

const WeekView: React.FC<{
  slots: ScheduleSlot[]
  weekStart: Date
  colorMap: Map<string, number>
  displaySchedule?: DisplaySchedule
  t: (k: string) => string
}> = ({ slots, weekStart, colorMap, displaySchedule, t }) => {
  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const nowPct = (currentMinutes / 1440) * 100

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    const dow = dayOfWeekISO(date)
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
        const offRanges = getDisplayOffRanges(displaySchedule, dow)

        const dayLabel = `${t(`schedule.days.${dow}`)} ${date.getDate()}`

        return (
          <div key={dow} className={`fm-timeline-week-row ${isToday ? 'fm-timeline-week-today' : ''}`}>
            <div className="fm-timeline-week-label">
              {dayLabel}
            </div>
            <div className="fm-timeline-week-track-wrap">
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
                      background: DEFAULT_COLOR.bg,
                    }}
                  />
                )}

                {/* Time slots */}
                {timeSlots.map(slot => {
                  const from = parseTime(slot.time_from)
                  const to = parseTime(slot.time_to)
                  const leftPct = (from / 1440) * 100
                  const widthPct = ((to > from ? to - from : 1440 - from + to) / 1440) * 100
                  const color = getTimeSlotColor(slot.slot_id, colorMap)
                  return (
                    <div
                      key={slot.slot_id}
                      className="fm-timeline-bar fm-timeline-bar-time"
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

                {/* Event blocks */}
                {eventSlots.map(slot => {
                  const from = parseTime(slot.time_from)
                  const durationMin = slotDurationSec(slot) / 60
                  const leftPct = (from / 1440) * 100
                  const widthPct = durationMin > 0 ? (durationMin / 1440) * 100 : 0
                  return (
                    <div
                      key={slot.slot_id}
                      className="fm-timeline-bar fm-timeline-bar-event"
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(widthPct, 0.3)}%`,
                        minWidth: durationMin > 0 ? undefined : '4px',
                        background: EVENT_COLOR.bg,
                        borderLeft: `2px solid ${EVENT_COLOR.border}`,
                      }}
                      title={`${slot.name} (${slot.time_from?.substring(0, 5)}, ${slot.items.length} ${t('schedule.timeline.items')})`}
                    />
                  )
                })}

                {/* Display-off overlay */}
                {offRanges.map((r, i) => (
                  <div
                    key={`off-${i}`}
                    className="fm-timeline-display-off"
                    style={{ left: `${r.leftPct}%`, width: `${r.widthPct}%` }}
                  />
                ))}

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

export const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({ slots, displaySchedule }) => {
  const { t } = useTranslation()
  const [view, setView] = useState<ViewMode>('day')
  const now = new Date()

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))

  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  // Build stable color map for time slots
  const colorMap = useMemo(() => buildSlotColorMap(slots), [slots])

  // Collect unique time slot colors for legend
  const legendTimeSlots = useMemo(() => {
    const seen = new Map<number, string>()
    for (const s of slots) {
      if (!s.is_default && s.slot_type !== 'default' && s.slot_type !== 'event') {
        const idx = colorMap.get(s.slot_id)
        if (idx !== undefined && !seen.has(idx)) {
          seen.set(idx, s.name)
        }
      }
    }
    return Array.from(seen.entries()).map(([idx, name]) => ({
      color: TIME_SLOT_PALETTE[idx],
      name,
    }))
  }, [slots, colorMap])

  const hasEvents = slots.some(s => s.slot_type === 'event')
  const showDisplayOff = displaySchedule?.enabled

  if (slots.length === 0) {
    return null
  }

  const views: { key: ViewMode; label: string }[] = [
    { key: 'day', label: t('schedule.timeline.day') },
    { key: 'week', label: t('schedule.timeline.week') },
  ]

  const isToday = isSameDay(selectedDate, now)
  const isCurrentWeek = isSameDay(weekStart, getMonday(now))

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
              <span className="fm-timeline-legend-swatch" style={{ background: DEFAULT_COLOR.border }} />
              {t('schedule.timeline.defaultSlot')}
            </span>
            {legendTimeSlots.map((ls, i) => (
              <span key={i} className="fm-timeline-legend-item">
                <span className="fm-timeline-legend-swatch" style={{ background: ls.color.border }} />
                {ls.name}
              </span>
            ))}
            {hasEvents && (
              <span className="fm-timeline-legend-item">
                <span className="fm-timeline-legend-swatch" style={{ background: EVENT_COLOR.border }} />
                {t('schedule.timeline.eventSlot')}
              </span>
            )}
            {showDisplayOff && (
              <span className="fm-timeline-legend-item">
                <span className="fm-timeline-legend-swatch fm-timeline-legend-swatch-off" />
                {t('schedule.timeline.displayOff')}
              </span>
            )}
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
        {view === 'day' && <DayView slots={slots} selectedDate={selectedDate} colorMap={colorMap} displaySchedule={displaySchedule} t={t} />}
        {view === 'week' && <WeekView slots={slots} weekStart={weekStart} colorMap={colorMap} displaySchedule={displaySchedule} t={t} />}
      </div>
    </div>
  )
}
