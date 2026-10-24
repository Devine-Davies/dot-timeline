import { isZoom, UNIT_SPECS, type ResolvedEvent, type TimelineEvent, type Unit } from '../../domain/timeline.ts'
import { DAY, MAX_TIME, MIN_TIME, dotEnd, dotStart, formatISO, indexForDate, parseDate, unitAnchor } from '../../domain/dates.ts'
import { displayDate, displayMonthYear } from '../dateLabels.ts'
import type { DotHit, ViewRange } from './types.ts'

const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' })
const dayLabel = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function contrastText(color: string): string {
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return 1.05 / (luminance + 0.05) >= 4.5 ? '#ffffff' : '#000000'
}

interface EventRange {
  first: number
  last: number
  firstRow: number
  lastRow: number
  event: ResolvedEvent
}

interface Motion {
  from: number
  to: number
  start: number
  duration: number
}

export class DotTimeline {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private unit: Unit
  private events: Array<TimelineEvent & { order?: number }> = []
  private anchor: Date
  private ranges: EventRange[] = []
  private rowLookup = new Map<number, EventRange[]>()
  private hoverListeners = new Set<(hit: DotHit | null) => void>()
  private viewListeners = new Set<(range: ViewRange) => void>()
  private observer: ResizeObserver
  private dprQuery: MediaQueryList | null = null
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private width = 0
  private height = 0
  private dpr = 1
  private cell = 22
  private requestedCell = 72
  private maxCell = 72
  private minCell = 12
  private overlapCount = 0
  private gridLeft = 52
  private offset = 0
  private minIndex = 0
  private maxIndex = 0
  private frame = 0
  private dirty = true
  private destroyed = false
  private velocity = 0
  private lastFrame = 0
  private motion: Motion | null = null
  private pointer: { id: number; y: number; startX: number; startY: number; time: number; moved: boolean } | null = null
  private touches = new Map<number, { x: number; y: number }>()
  private pinch: { distance: number; cell: number } | null = null
  private gestureCell: number | null = null
  private lastHover: number | null = null
  private viewKey = ''
  private today = ''
  private focusedDate = ''
  private todayIndex = 0
  private midnightTimer = 0
  private originalTouchAction: string
  private originalRole: string | null
  private originalTabIndex: string | null
  private originalLabel: string | null
  private originalLive: string | null

  constructor(canvas: HTMLCanvasElement, options: { unit: Unit; events: Array<TimelineEvent & { order?: number }> }) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('A 2D canvas context is required')
    this.canvas = canvas
    this.context = context
    this.unit = options.unit
    this.anchor = unitAnchor(options.unit)
    this.originalTouchAction = canvas.style.touchAction
    this.originalRole = canvas.getAttribute('role')
    this.originalTabIndex = canvas.getAttribute('tabindex')
    this.originalLabel = canvas.getAttribute('aria-label')
    this.originalLive = canvas.getAttribute('aria-live')
    canvas.style.touchAction = 'none'
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-live', 'polite')
    canvas.tabIndex = 0
    this.updateBounds()
    this.today = formatISO(new Date())
    this.focusedDate = this.today
    this.todayIndex = this.index(this.today)
    this.setEvents(options.events)
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(canvas)
    this.watchDpr()
    this.resize()
    this.offset = this.row(this.todayIndex) * this.rowHeight - this.height / 2
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('lostpointercapture', this.onLostCapture)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('keydown', this.onKey)
    canvas.addEventListener('gesturestart', this.onGestureStart, { passive: false })
    canvas.addEventListener('gesturechange', this.onGestureChange, { passive: false })
    canvas.addEventListener('gestureend', this.onGestureEnd)
    this.reducedMotion.addEventListener('change', this.onMotionPreference)
    this.scheduleMidnight()
    this.invalidate()
  }

  private get perRow(): number {
    return UNIT_SPECS.find((entry) => entry.id === this.unit)!.perRow
  }

  private get rowShift(): number {
    const year = this.anchor.getUTCFullYear()
    if (this.unit === '1y') return ((year % 10) + 10) % 10
    if (this.unit === '5y') return ((Math.floor(year / 5) % 20) + 20) % 20
    if (this.unit === '1m') return this.anchor.getUTCMonth()
    return Math.floor(this.perRow / 2)
  }
  private get rowHeight(): number {
    return this.cell < 56 ? this.cell : Math.max(this.cell, this.cell * 0.64 + 8 + this.overlapCount * 6)
  }
  private row(index: number): number { return Math.floor((index + this.rowShift) / this.perRow) }
  private firstIndex(row: number): number { return row * this.perRow - this.rowShift }
  private start(index: number): Date { return dotStart(index, this.unit, this.anchor) }
  private end(index: number): Date { return dotEnd(index, this.unit, this.anchor) }
  private index(date: string): number { return indexForDate(date, this.unit, this.anchor) }
  private get centerIndex(): number {
    const row = Math.round((this.offset + this.height / 2) / this.rowHeight)
    const col = Math.max(0, Math.min(this.perRow - 1, Math.round((this.width / 2 - this.gridLeft) / this.cell)))
    return this.clampIndex(this.firstIndex(row) + col)
  }
  private get centerDate(): string {
    const index = this.centerIndex
    return this.row(index) === this.row(this.index(this.focusedDate))
      ? this.focusedDate : formatISO(this.start(index))
  }

  private clampIndex(index: number): number {
    return Math.max(this.minIndex, Math.min(this.maxIndex, index))
  }

  private updateBounds(): void {
    this.minIndex = this.index(formatISO(new Date(MIN_TIME)))
    this.maxIndex = this.index(formatISO(new Date(MAX_TIME)))
  }

  setUnit(unit: Unit, zoom?: number): void {
    if (this.destroyed) return
    if (zoom !== undefined && !isZoom(zoom)) throw new RangeError(`Invalid timeline zoom: ${zoom}`)
    if (unit === this.unit) { if (zoom !== undefined) this.setZoom(zoom); return }
    if (!UNIT_SPECS.some((entry) => entry.id === unit)) throw new RangeError(`Unknown timeline unit: ${unit}`)
    const center = this.centerDate
    this.cancelMotion()
    this.unit = unit
    this.requestedCell = zoom ?? 72
    this.anchor = unitAnchor(unit)
    this.focusedDate = center
    this.updateBounds()
    const index = this.index(center)
    this.todayIndex = this.index(this.today)
    this.layout()
    this.setEvents(this.events)
    this.offset = this.row(index) * this.rowHeight - this.height / 2
    this.clearHover()
    this.invalidate()
  }

  /** Lower explicit order wins; input order is the default. Spans are inclusive. */
  setEvents(events: Array<TimelineEvent & { order?: number }>): void {
    if (this.destroyed) return
    const ranges = events.map((event, order) => {
      const start = parseDate(event.start)
      const end = parseDate(event.end)
      if (end.getTime() < start.getTime()) throw new RangeError(`Event ends before it starts: ${event.id}`)
      const first = this.index(event.start)
      const last = this.index(event.end)
      return { first, last, firstRow: this.row(first), lastRow: this.row(last), event: { ...event, order: Number.isFinite(event.order) ? event.order! : order } }
    }).sort((a, b) => a.event.order - b.event.order)
    const center = (this.offset + this.height / 2) / this.rowHeight
    const boundaries = ranges.flatMap((range) => [[range.first, 1], [range.last + 1, -1]])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let overlaps = 0
    this.overlapCount = 0
    for (const [, delta] of boundaries) {
      overlaps += delta
      this.overlapCount = Math.max(this.overlapCount, overlaps)
    }
    this.offset = center * this.rowHeight - this.height / 2
    this.events = events.map((event) => ({ ...event }))
    this.ranges = ranges
    this.rowLookup.clear()
    this.viewKey = ''
    this.clearHover()
    this.invalidate()
  }

  scrollToDate(date: string, animate = true): void {
    if (this.destroyed) return
    const index = this.clampIndex(this.index(date))
    this.focusedDate = formatISO(parseDate(date))
    const target = this.row(index) * this.rowHeight - this.height / 2
    this.cancelMotion()
    if (animate && !this.reducedMotion.matches) {
      this.motion = { from: this.offset, to: target, start: performance.now(), duration: 450 }
    } else this.offset = target
    this.clearHover()
    this.invalidate()
  }

  scrollToToday(): void { this.scrollToDate(formatISO(new Date())) }

  setZoom(size: number): void {
    if (!isZoom(size)) throw new RangeError(`Invalid timeline zoom: ${size}`)
    this.zoomAt(size, this.width / 2, this.height / 2)
  }

  fit(): void {
    this.zoomAt(this.maxCell, this.width / 2, this.height / 2)
    this.layout()
    this.invalidate()
  }

  private zoomAt(size: number, x: number, y: number): void {
    if (this.destroyed) return
    this.requestedCell = size
    const next = Math.max(this.minCell, Math.min(this.maxCell, size))
    if (Math.abs(next - this.cell) < 0.001) return
    this.focusedDate = this.centerDate
    const row = (this.offset + y) / this.rowHeight
    const col = (x - this.gridLeft) / this.cell
    this.cancelMotion()
    this.cell = next
    this.layout()
    this.gridLeft = Math.max(this.gutter + this.cell / 2,
      Math.min(this.width - 8 - (this.perRow - 0.5) * this.cell, x - col * this.cell))
    this.offset = row * this.rowHeight - y
    this.clearHover()
    this.invalidate()
  }

  onHover(callback: (hit: DotHit | null) => void): () => void {
    if (this.destroyed) return () => {}
    this.hoverListeners.add(callback)
    return () => { this.hoverListeners.delete(callback) }
  }

  onViewChange(callback: (range: ViewRange) => void): () => void {
    if (this.destroyed) return () => {}
    this.viewListeners.add(callback)
    callback(this.visibleRange())
    return () => { this.viewListeners.delete(callback) }
  }

  private get gutter(): number {
    return Math.min(this.unit === '1w' && this.width < 600 ? 32 : 88, this.width * 0.17)
  }

  private layout(): void {
    this.maxCell = Math.min(72, Math.max(0.1, Math.floor((this.width - this.gutter - 8) / this.perRow * 100) / 100))
    this.minCell = Math.min(this.maxCell, this.unit === '1w' ? 6 : 12)
    this.cell = Math.max(this.minCell, Math.min(this.maxCell, this.requestedCell))
    this.gridLeft = this.gutter + Math.max(0, (this.width - this.gutter - this.cell * this.perRow) / 2) + this.cell / 2
  }

  private resize = (): void => {
    if (this.destroyed) return
    if (this.height) this.focusedDate = this.centerDate
    const center = this.height ? (this.offset + this.height / 2) / this.rowHeight : this.row(this.todayIndex)
    this.cancelMotion()
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.dpr = Math.max(1, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.layout()
    this.offset = center * this.rowHeight - this.height / 2
    this.clearHover()
    this.invalidate()
  }

  private watchDpr = (): void => {
    this.dprQuery?.removeEventListener('change', this.onDpr)
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    this.dprQuery.addEventListener('change', this.onDpr)
  }

  private onDpr = (): void => { this.watchDpr(); this.resize() }
  private onMotionPreference = (): void => {
    if (this.reducedMotion.matches) {
      if (this.motion) this.offset = this.motion.to
      this.cancelMotion()
      this.invalidate()
    }
  }

  private scheduleMidnight(): void {
    const now = Date.now()
    this.midnightTimer = window.setTimeout(() => {
      if (this.destroyed) return
      const center = this.centerDate
      this.today = formatISO(new Date())
      this.anchor = unitAnchor(this.unit)
      this.updateBounds()
      this.todayIndex = this.index(this.today)
      this.setEvents(this.events)
      this.focusedDate = center
      this.offset = this.row(this.index(center)) * this.rowHeight - this.height / 2
      this.invalidate()
      this.scheduleMidnight()
    }, DAY - ((now % DAY + DAY) % DAY) + 30)
  }

  private cancelMotion(): void { this.motion = null; this.velocity = 0; this.lastFrame = 0 }
  private clampOffset(): void {
    const min = this.row(this.minIndex) * this.rowHeight - this.height / 2
    const max = this.row(this.maxIndex) * this.rowHeight - this.height / 2
    const next = Math.max(min, Math.min(max, this.offset))
    if (next !== this.offset) this.velocity = 0
    this.offset = next
  }

  private invalidate(): void {
    if (this.destroyed) return
    this.dirty = true
    if (!this.frame) this.frame = requestAnimationFrame(this.tick)
  }

  private tick = (time: number): void => {
    this.frame = 0
    if (this.destroyed) return
    if (this.motion) {
      const progress = Math.min(1, Math.max(0, (time - this.motion.start) / this.motion.duration))
      this.offset = this.motion.from + (this.motion.to - this.motion.from) * (1 - (1 - progress) ** 3)
      if (progress === 1) this.motion = null
      this.dirty = true
    } else if (!this.pointer && Math.abs(this.velocity) > 0.01) {
      const elapsed = this.lastFrame ? Math.min(40, time - this.lastFrame) : 16
      this.offset += this.velocity * elapsed
      this.velocity *= Math.exp(-elapsed / 210)
      this.dirty = true
    } else if (!this.pointer) this.velocity = 0
    this.lastFrame = time
    this.clampOffset()
    if (this.dirty) { this.dirty = false; this.draw(); this.emitView() }
    if (this.motion || (!this.pointer && this.velocity !== 0)) this.invalidate()
  }

  private visibleRows(): [number, number] {
    return [
      Math.max(this.row(this.minIndex), Math.floor(this.offset / this.rowHeight)),
      Math.min(this.row(this.maxIndex), Math.ceil((this.offset + this.height) / this.rowHeight)),
    ]
  }

  private visibleRange(): ViewRange {
    const [first, last] = this.visibleRows()
    return {
      from: formatISO(this.start(this.clampIndex(this.firstIndex(first)))),
      to: formatISO(this.end(this.clampIndex(this.firstIndex(last) + this.perRow - 1))),
      centerDate: this.centerDate,
      cellSize: this.cell,
      minCellSize: this.minCell,
      maxCellSize: this.maxCell,
      height: this.height,
      today: {
        x: this.gridLeft + (this.todayIndex - this.firstIndex(this.row(this.todayIndex))) * this.cell,
        y: this.row(this.todayIndex) * this.rowHeight - this.offset,
        date: this.today,
      },
    }
  }

  private emitView(): void {
    const range = this.visibleRange()
    const key = `${range.from}/${range.to}/${range.centerDate}/${range.cellSize}/${range.maxCellSize}/${range.today.x}/${range.today.y}`
    if (key === this.viewKey) return
    this.viewKey = key
    const visibleEvents = this.events.filter((event) =>
      parseDate(event.start) <= parseDate(range.to) && parseDate(event.end) >= parseDate(range.from))
    const eventDescription = this.events.length
      ? `Events: ${visibleEvents.map((event) => event.name).join(', ') || 'none in this range'}. ` : ''
    this.canvas.setAttribute('aria-label',
      `Timeline, ${displayDate(parseDate(range.from))} to ${displayDate(parseDate(range.to))}. ${eventDescription}Use arrow keys or Page Up and Page Down to explore; Home returns to today. Plus and minus zoom. Enter or Space shows dot details; Escape hides them.`)
    this.viewListeners.forEach((callback) => callback(range))
  }

  private prepareRows(first: number, last: number): void {
    if (this.ranges.length <= 50) return
    for (const row of this.rowLookup.keys()) {
      if (row < first || row > last) this.rowLookup.delete(row)
    }
    for (let row = first; row <= last; row++) {
      if (!this.rowLookup.has(row)) {
        this.rowLookup.set(row, this.ranges.filter((range) => range.firstRow <= row && range.lastRow >= row))
      }
    }
  }

  private rangesForRow(row: number): EventRange[] {
    return this.ranges.length > 50 ? (this.rowLookup.get(row) ?? []) : this.ranges
  }

  private draw(): void {
    const ctx = this.context
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.width, this.height)
    const [first, last] = this.visibleRows()
    this.prepareRows(first, last)
    const radius = this.cell * 0.32
    ctx.lineWidth = Math.max(0.7, Math.min(1.3, this.cell * 0.08))
    ctx.font = `${Math.max(10, Math.min(12, this.cell * 0.22))}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.textBaseline = 'middle'
    for (let row = first; row <= last; row++) {
      const y = row * this.rowHeight - this.offset
      const candidates = this.rangesForRow(row)
      if (this.cell >= 40 || ((row % 2) + 2) % 2 === 0) {
        ctx.font = `${Math.max(10, Math.min(12, this.cell * 0.22))}px ui-monospace, SFMono-Regular, Menlo, monospace`
        const date = this.start(this.clampIndex(this.firstIndex(row)))
        ctx.fillStyle = '#667085'
        ctx.textAlign = 'right'
        const label = this.unit === '1y' || this.unit === '5y'
          ? `${displayDate(date, true)}${date.getUTCFullYear() > 0 ? 's' : ''}`
          : this.unit === '1m' ? displayDate(date, true) : displayMonthYear(date)
        ctx.fillText(label, this.gridLeft - this.cell * 0.9, y, Math.max(1, this.gridLeft - this.cell * 0.9 - 4))
      }
      for (let col = 0; col < this.perRow; col++) {
        const index = this.firstIndex(row) + col
        if (index < this.minIndex || index > this.maxIndex) continue
        const x = this.gridLeft + col * this.cell
        const matches = candidates.filter((range) => index >= range.first && index <= range.last)
        const event = matches[0]?.event
        const isToday = index === this.todayIndex
        const color = event?.color ?? (index < this.todayIndex ? '#292e35' : '#a8b2c1')
        if (isToday) {
          ctx.beginPath()
          ctx.arc(x, y, this.cell * 0.49, 0, Math.PI * 2)
          ctx.fillStyle = '#dc38381a'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(x, y, isToday ? this.cell * 0.4 : radius, 0, Math.PI * 2)
        ctx.fillStyle = isToday ? '#dc3838' : color
        ctx.strokeStyle = isToday ? '#dc3838' : color
        if (index <= this.todayIndex || event) ctx.fill()
        else ctx.stroke()
        if (index === this.lastHover) {
          ctx.beginPath()
          ctx.arc(x, y, radius + 4, 0, Math.PI * 2)
          ctx.strokeStyle = '#202124'
          ctx.stroke()
        }
        if (this.cell >= 40) {
          ctx.font = `600 ${Math.min(12, this.cell * 0.26)}px ui-monospace, SFMono-Regular, Menlo, monospace`
          const date = this.start(index)
          const shortYear = String(Math.abs(date.getUTCFullYear())).slice(-2).padStart(2, '0')
          const label = this.unit === '1y' || this.unit === '5y'
            ? this.cell >= 56 ? displayDate(date, true) : date.getUTCFullYear() <= 0 ? displayDate(date, true) : shortYear
            : this.unit === '1m'
              ? monthLabel.format(date)
              : dayLabel.format(date)
          ctx.textAlign = 'center'
          ctx.fillStyle = index <= this.todayIndex || event ? contrastText(isToday ? '#dc3838' : color) : '#596170'
          if (this.cell >= 56 && this.unit !== '1y' && this.unit !== '5y') {
            ctx.fillText(label, x, y - 6, radius * 1.8)
            ctx.fillText(displayDate(date, true), x, y + 7, radius * 1.8)
          } else ctx.fillText(label, x, y + 0.5, radius * 1.8)
        }
        if (this.cell >= 56) {
          matches.forEach((range, lane) => {
            ctx.fillStyle = range.event.color
            ctx.fillRect(x - radius * 0.85, y + radius + 5 + lane * 6, radius * 1.7, 3)
          })
        }
      }
    }
  }

  private hitAt(clientX: number, clientY: number): DotHit | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const col = Math.round((x - this.gridLeft) / this.cell)
    const row = Math.round((y + this.offset) / this.rowHeight)
    const index = this.firstIndex(row) + col
    if (col < 0 || col >= this.perRow || y < 0 || y > this.height || index < this.minIndex || index > this.maxIndex) return null
    const dotX = this.gridLeft + col * this.cell
    const dotY = row * this.rowHeight - this.offset
    if (Math.abs(x - dotX) > this.cell / 2 || Math.abs(y - dotY) > this.rowHeight / 2) return null
    const candidates = this.rowLookup.get(row) ?? this.ranges
    return {
      index, start: formatISO(this.start(index)), end: formatISO(this.end(index)),
      today: index === this.todayIndex ? this.today : undefined,
      events: candidates.filter((range) => index >= range.first && index <= range.last).map((range) => ({ ...range.event })),
      x: dotX, y: dotY,
    }
  }

  private emitHover(hit: DotHit | null): void {
    if (hit?.index === this.lastHover || (!hit && this.lastHover === null)) return
    this.lastHover = hit?.index ?? null
    this.invalidate()
    this.hoverListeners.forEach((callback) => callback(hit))
  }

  private clearHover(): void { this.emitHover(null) }
  private onPointerLeave = (event: PointerEvent): void => {
    if (!this.pointer && event.pointerType !== 'touch') this.clearHover()
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const rect = this.canvas.getBoundingClientRect()
      this.zoomAt(this.cell * Math.exp(-event.deltaY * 0.01), event.clientX - rect.left, event.clientY - rect.top)
      return
    }
    this.cancelMotion()
    const scale = event.deltaMode === 1 ? this.rowHeight : event.deltaMode === 2 ? this.height : 1
    this.offset += (event.deltaY || event.deltaX) * scale
    this.clearHover()
    this.invalidate()
  }

  private onGestureStart = (event: Event): void => {
    event.preventDefault()
    this.gestureCell = this.cell
    this.cancelMotion()
  }

  private onGestureChange = (event: Event): void => {
    if (this.gestureCell === null || !('scale' in event) || typeof event.scale !== 'number') return
    event.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const x = 'clientX' in event && typeof event.clientX === 'number' ? event.clientX - rect.left : this.width / 2
    const y = 'clientY' in event && typeof event.clientY === 'number' ? event.clientY - rect.top : this.height / 2
    this.zoomAt(this.gestureCell * event.scale, x, y)
  }

  private onGestureEnd = (): void => { this.gestureCell = null }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      this.canvas.setPointerCapture(event.pointerId)
      if (this.touches.size >= 2) {
        this.pointer = null
        this.cancelMotion()
        const [a, b] = [...this.touches.values()]
        this.pinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cell: this.cell }
        this.clearHover()
        return
      }
    }
    if (!event.isPrimary || event.button !== 0 || this.pointer) return
    this.cancelMotion()
    this.canvas.focus({ preventScroll: true })
    this.pointer = { id: event.pointerId, y: event.clientY, startX: event.clientX, startY: event.clientY, time: event.timeStamp, moved: false }
    this.canvas.setPointerCapture(event.pointerId)
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (this.touches.has(event.pointerId)) {
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (this.pinch && this.touches.size >= 2) {
        const [a, b] = [...this.touches.values()]
        const rect = this.canvas.getBoundingClientRect()
        this.zoomAt(this.pinch.cell * Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.distance,
          (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top)
        return
      }
    }
    const pointer = this.pointer
    if (!pointer) { if (event.pointerType !== 'touch') this.emitHover(this.hitAt(event.clientX, event.clientY)); return }
    if (event.pointerId !== pointer.id) return
    const moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5
    if (moved) pointer.moved = true
    if (pointer.moved) {
      const delta = pointer.y - event.clientY
      const elapsed = Math.max(1, event.timeStamp - pointer.time)
      this.offset += delta
      this.velocity = Math.max(-3, Math.min(3, delta / elapsed))
      this.clearHover()
      this.invalidate()
    }
    pointer.y = event.clientY
    pointer.time = event.timeStamp
  }

  private onPointerUp = (event: PointerEvent): void => {
    this.touches.delete(event.pointerId)
    if (this.pinch) {
      if (this.touches.size < 2) this.pinch = null
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
      return
    }
    const pointer = this.pointer
    if (!pointer || pointer.id !== event.pointerId) {
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
      return
    }
    this.pointer = null
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    if (!pointer.moved) {
      this.velocity = 0
      this.emitHover(this.hitAt(event.clientX, event.clientY))
    } else {
      if (this.reducedMotion.matches || event.timeStamp - pointer.time > 100) this.velocity = 0
      this.lastFrame = 0
      this.invalidate()
    }
  }

  private onPointerCancel = (event: PointerEvent): void => {
    this.touches.delete(event.pointerId)
    this.pinch = null
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    if (this.pointer?.id !== event.pointerId) return
    this.pointer = null
    this.cancelMotion()
    this.clearHover()
  }

  private onLostCapture = (event: PointerEvent): void => {
    if (this.pointer?.id === event.pointerId || this.touches.has(event.pointerId)) this.onPointerCancel(event)
  }

  private onKey = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === '+' || event.key === '=' || event.key === '-' || event.key === '_') {
      event.preventDefault()
      this.zoomAt(this.cell + (event.key === '+' || event.key === '=' ? 4 : -4), this.width / 2, this.height / 2)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      this.clearHover()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.cancelMotion()
      const index = this.index(this.centerDate)
      const row = this.row(index)
      const col = index - this.firstIndex(row)
      const rect = this.canvas.getBoundingClientRect()
      this.emitHover(this.hitAt(
        rect.left + this.gridLeft + col * this.cell,
        rect.top + row * this.rowHeight - this.offset,
      ))
      return
    }
    const increments: Record<string, number> = {
      ArrowUp: -this.rowHeight, ArrowDown: this.rowHeight,
      ArrowLeft: -this.rowHeight, ArrowRight: this.rowHeight,
      PageUp: -this.height * 0.85, PageDown: this.height * 0.85,
    }
    if (event.key === 'Home') { event.preventDefault(); this.scrollToToday(); return }
    if (!(event.key in increments)) return
    event.preventDefault()
    this.cancelMotion()
    this.offset += increments[event.key]
    this.clearHover()
    this.invalidate()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.frame)
    clearTimeout(this.midnightTimer)
    this.cancelMotion()
    if (this.pointer && this.canvas.hasPointerCapture(this.pointer.id)) this.canvas.releasePointerCapture(this.pointer.id)
    this.pointer = null
    for (const id of this.touches.keys()) {
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
    }
    this.touches.clear()
    this.pinch = null
    this.observer.disconnect()
    this.dprQuery?.removeEventListener('change', this.onDpr)
    this.reducedMotion.removeEventListener('change', this.onMotionPreference)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('lostpointercapture', this.onLostCapture)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('keydown', this.onKey)
    this.canvas.removeEventListener('gesturestart', this.onGestureStart)
    this.canvas.removeEventListener('gesturechange', this.onGestureChange)
    this.canvas.removeEventListener('gestureend', this.onGestureEnd)
    this.canvas.style.touchAction = this.originalTouchAction
    for (const [name, value] of [['role', this.originalRole], ['tabindex', this.originalTabIndex], ['aria-label', this.originalLabel], ['aria-live', this.originalLive]]) {
      if (value === null) this.canvas.removeAttribute(name!)
      else this.canvas.setAttribute(name!, value!)
    }
    this.clearHover()
    this.hoverListeners.clear()
    this.viewListeners.clear()
    this.rowLookup.clear()
  }
}
