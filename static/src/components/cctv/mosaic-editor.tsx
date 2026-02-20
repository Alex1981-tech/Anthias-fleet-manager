import React, { useMemo, useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaRedo } from 'react-icons/fa'

const GRID_COLS = 12
const GRID_ROWS = 12

const CAMERA_COLORS = [
  '#4a90d9', '#e67e22', '#27ae60', '#e74c3c',
  '#9b59b6', '#1abc9c', '#f39c12', '#3498db',
]

interface CameraField {
  name: string
  rtsp_url: string
}

interface MosaicEditorProps {
  cameras: CameraField[]
  /** Ordered list of camera indices — position in array = grid cell */
  order: number[]
  onChange: (order: number[]) => void
}

/**
 * Calculate grid dimensions for N cameras.
 * Returns [cols, rows].
 */
export function calcGrid(n: number): [number, number] {
  if (n <= 1) return [1, 1]
  if (n <= 4) return [2, 2]
  if (n <= 9) return [3, 3]
  const cols = Math.ceil(Math.sqrt(n))
  return [cols, Math.ceil(n / cols)]
}

/** Generate default sequential order: [0, 1, 2, ...] */
export function defaultOrder(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i)
}

const MosaicEditor: React.FC<MosaicEditorProps> = ({ cameras, order, onChange }) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const validCount = cameras.filter((c) => c.rtsp_url.trim()).length
  const [cols, rows] = useMemo(() => calcGrid(validCount), [validCount])

  // Observe container width for aspect ratio
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setContainerWidth(entry.contentRect.width)
    })
    observer.observe(el)
    setContainerWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const cellW = containerWidth / cols
  const cellH = cellW * (9 / 16) // 16:9 cells

  const handleDragStart = (pos: number) => (e: React.DragEvent) => {
    setDragFrom(pos)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOverCell = (pos: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOver !== pos) setDragOver(pos)
  }

  const handleDrop = (pos: number) => (e: React.DragEvent) => {
    e.preventDefault()
    if (dragFrom !== null && dragFrom !== pos) {
      const newOrder = [...order]
      // Swap
      const temp = newOrder[dragFrom]
      newOrder[dragFrom] = newOrder[pos]
      newOrder[pos] = temp
      onChange(newOrder)
    }
    setDragFrom(null)
    setDragOver(null)
  }

  const handleDragEnd = () => {
    setDragFrom(null)
    setDragOver(null)
  }

  const handleReset = () => {
    onChange(defaultOrder(validCount))
  }

  if (validCount < 2) return null

  return (
    <div className="fm-mosaic-editor">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <label className="form-label mb-0">{t('cctv.mosaicLayout')}</label>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={handleReset}
          title={t('cctv.autoGrid')}
        >
          <FaRedo className="me-1" />
          {t('cctv.autoGrid')}
        </button>
      </div>
      <p className="text-muted small mb-2">{t('cctv.dragSwap')}</p>

      <div ref={containerRef} className="fm-mosaic-editor-grid">
        <div
          className="fm-mosaic-grid-cells"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 3,
          }}
        >
          {order.slice(0, validCount).map((camIdx, pos) => {
            const cam = cameras[camIdx]
            const label = cam?.name?.trim() || `${t('cctv.camera')} ${camIdx + 1}`
            const color = CAMERA_COLORS[camIdx % CAMERA_COLORS.length]
            const isDragging = dragFrom === pos
            const isOver = dragOver === pos && dragFrom !== null && dragFrom !== pos

            return (
              <div
                key={pos}
                className={`fm-mosaic-camera-block${isOver ? ' fm-mosaic-drop-target' : ''}`}
                style={{
                  backgroundColor: color + '33',
                  borderColor: isOver ? '#fff' : color,
                  height: cellH || 60,
                  opacity: isDragging ? 0.4 : 1,
                }}
                draggable
                onDragStart={handleDragStart(pos)}
                onDragOver={handleDragOverCell(pos)}
                onDrop={handleDrop(pos)}
                onDragEnd={handleDragEnd}
              >
                <span className="fm-mosaic-camera-label">{label}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MosaicEditor
