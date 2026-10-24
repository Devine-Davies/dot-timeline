import { UNIT_SPECS, type ResolvedEvent, type TimelineEvent, type Unit } from '../../domain/timeline.ts'
import { DAY, MAX_TIME, MIN_TIME, dotEnd, dotStart, formatISO, indexForDate, parseDate, unitAnchor } from '../../domain/dates.ts'
import { displayDate, displayMonthYear } from '../dateLabels.ts'
import type { DotHit, ViewRange } from './types.ts'

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
    this.offset = this.row(this.todayIndex) * this.cell - this.height / 2
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('lostpointercapture', this.onLostCapture)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('keydown', this.onKey)
    this.reducedMotion.addEventListener('change', this.onMotionPreference)
    this.scheduleMidnight()
    this.invalidate()
  }

  private get perRow(): number {
    return UNIT_SPECS.find((entry) => entry.id === this.unit)!.perRow
  }

  private get todayCol(): number { return Math.floor(this.perRow / 2) }
  private row(index: number): number { return Math.floor((index + this.todayCol) / this.perRow) }
  private firstIndex(row: number): number { return row * this.perRow - this.todayCol }
  private start(index: number): Date { return dotStart(index, this.unit, this.anchor) }
  private end(index: number): Date { return dotEnd(index, this.unit, this.anchor) }
  private index(date: string): number { return indexForDate(date, this.unit, this.anchor) }
  private get centerIndex(): number {
    return this.clampIndex(Math.round((this.offset + this.height / 2) / this.cell) * this.perRow)
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

  setUnit(unit: Unit): void {
    if (this.destroyed || unit === this.unit) return
    if (!UNIT_SPECS.some((entry) => entry.id === unit)) throw new RangeError(`Unknown timeline unit: ${unit}`)
    const center = this.centerDate
    this.cancelMotion()
    this.unit = unit
    this.anchor = unitAnchor(unit)
    this.focusedDate = center
    this.updateBounds()
    const index = this.index(center)
    this.todayIndex = this.index(this.today)
    this.layout()
    this.offset = this.row(index) * this.cell - this.height / 2
    this.setEvents(this.events)
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
    this.events = events.map((event) => ({ ...event }))
    this.ranges = ranges
    this.rowLookup.clear()
    this.clearHover()
    this.invalidate()
  }

  scrollToDate(date: string, animate = true): void {
    if (this.destroyed) return
    const index = this.clampIndex(this.index(date))
    this.focusedDate = formatISO(parseDate(date))
    const target = this.row(index) * this.cell - this.height / 2
    this.cancelMotion()
    if (animate && !this.reducedMotion.matches) {
      this.motion = { from: this.offset, to: target, start: performance.now(), duration: 450 }
    } else this.offset = target
    this.clearHover()
    this.invalidate()
  }

  scrollToToday(): void { this.scrollToDate(formatISO(new Date())) }

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

  private layout(): void {
    const gutter = Math.min(52, this.width * 0.17)
    this.cell = Math.min(22, Math.max(0.1, (this.width - gutter - 12) / this.perRow))
    this.gridLeft = gutter + Math.max(0, (this.width - gutter - this.cell * this.perRow) / 2) + this.cell / 2
  }

  private resize = (): void => {
    if (this.destroyed) return
    const center = this.height ? this.centerIndex : this.todayIndex
    this.cancelMotion()
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.dpr = Math.max(1, window.devicePixelRatio || 1)
    this.canvas.width = Math.round(this.width * this.dpr)
    this.canvas.height = Math.round(this.height * this.dpr)
    this.layout()
    this.offset = this.row(center) * this.cell - this.height / 2
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
      this.offset = this.row(this.index(center)) * this.cell - this.height / 2
      this.invalidate()
      this.scheduleMidnight()
    }, DAY - ((now % DAY + DAY) % DAY) + 30)
  }

  private cancelMotion(): void { this.motion = null; this.velocity = 0; this.lastFrame = 0 }
  private clampOffset(): void {
    const min = this.row(this.minIndex) * this.cell - this.height / 2
    const max = this.row(this.maxIndex) * this.cell - this.height / 2
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
      Math.max(this.row(this.minIndex), Math.ceil(this.offset / this.cell)),
      Math.min(this.row(this.maxIndex), Math.floor((this.offset + this.height) / this.cell)),
    ]
  }

  private visibleRange(): ViewRange {
    const [first, last] = this.visibleRows()
    return {
      from: formatISO(this.start(this.clampIndex(this.firstIndex(first)))),
      to: formatISO(this.end(this.clampIndex(this.firstIndex(last) + this.perRow - 1))),
      centerDate: this.centerDate,
    }
  }

  private emitView(): void {
    const range = this.visibleRange()
    const key = `${range.from}/${range.to}/${range.centerDate}`
    if (key === this.viewKey) return
    this.viewKey = key
    this.canvas.setAttribute('aria-label',
      `Timeline, ${displayDate(parseDate(range.from))} to ${displayDate(parseDate(range.to))}. Use arrow keys or Page Up and Page Down to explore; Home returns to today. Enter or Space shows dot details; Escape hides them.`)
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
    const radius = Math.min(4, this.cell * 0.24)
    ctx.lineWidth = Math.max(0.7, Math.min(1.3, this.cell * 0.08))
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textBaseline = 'middle'
    for (let row = first; row <= last; row++) {
      const y = row * this.cell - this.offset
      const candidates = this.rangesForRow(row)
      if (((row % 2) + 2) % 2 === 0) {
        const date = this.start(this.clampIndex(this.firstIndex(row)))
        ctx.fillStyle = '#667085'
        ctx.textAlign = 'left'
        const label = this.unit === '1y' || this.unit === '5y'
          ? displayDate(date, true) : displayMonthYear(date)
        ctx.fillText(label, 2, y, Math.max(1, this.gridLeft - this.cell / 2 - 8))
      }
      for (let col = 0; col < this.perRow; col++) {
        const index = this.firstIndex(row) + col
        if (index < this.minIndex || index > this.maxIndex) continue
        const x = this.gridLeft + col * this.cell
        const event = candidates.find((range) => index >= range.first && index <= range.last)?.event
        const isToday = index === this.todayIndex
        const color = event?.color ?? (index < this.todayIndex ? '#292e35' : '#a8b2c1')
        if (isToday) {
          ctx.beginPath()
          ctx.arc(x, y, Math.min(11, this.cell * 0.49), 0, Math.PI * 2)
          ctx.fillStyle = '#dc38381a'
          ctx.fill()
        }
        ctx.beginPath()
        ctx.arc(x, y, isToday ? Math.min(6, this.cell * 0.38) : radius, 0, Math.PI * 2)
        ctx.fillStyle = isToday ? '#dc3838' : color
        ctx.strokeStyle = isToday ? '#dc3838' : color
        if (index <= this.todayIndex || event) ctx.fill()
        else ctx.stroke()
        if (isToday) {
          ctx.save()
          ctx.font = '12px system-ui, sans-serif'
          ctx.textAlign = 'left'
          const label = `Today  ${displayDate(parseDate(this.today))}`
          const labelWidth = Math.min(ctx.measureText(label).width + 42, this.width - 16)
          const labelX = Math.max(8, Math.min(x - labelWidth / 2, this.width - 8 - labelWidth))
          const labelY = Math.max(8, y - 48)
          ctx.shadowColor = '#1018280d'
          ctx.shadowBlur = 12
          ctx.shadowOffsetY = 4
          ctx.beginPath()
          ctx.roundRect(labelX, labelY, labelWidth, 32, 8)
          ctx.fillStyle = '#ffffff'
          ctx.fill()
          ctx.shadowColor = 'transparent'
          ctx.strokeStyle = '#e1e5eb'
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(labelX + 15, labelY + 16, 4, 0, Math.PI * 2)
          ctx.fillStyle = '#dc3838'
          ctx.fill()
          ctx.fillStyle = '#292e35'
          ctx.fillText(label, labelX + 28, labelY + 16, Math.max(1, labelWidth - 36))
          ctx.restore()
        }
      }
    }
  }

  private hitAt(clientX: number, clientY: number): DotHit | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const col = Math.round((x - this.gridLeft) / this.cell)
    const row = Math.round((y + this.offset) / this.cell)
    const index = this.firstIndex(row) + col
    if (col < 0 || col >= this.perRow || y < 0 || y > this.height || index < this.minIndex || index > this.maxIndex) return null
    const dotX = this.gridLeft + col * this.cell
    const dotY = row * this.cell - this.offset
    if (Math.abs(x - dotX) > this.cell / 2 || Math.abs(y - dotY) > this.cell / 2) return null
    const candidates = this.rowLookup.get(row) ?? this.ranges
    return {
      index, start: formatISO(this.start(index)), end: formatISO(this.end(index)),
      events: candidates.filter((range) => index >= range.first && index <= range.last).map((range) => ({ ...range.event })),
      x: dotX, y: dotY,
    }
  }

  private emitHover(hit: DotHit | null): void {
    if (hit?.index === this.lastHover || (!hit && this.lastHover === null)) return
    this.lastHover = hit?.index ?? null
    this.hoverListeners.forEach((callback) => callback(hit))
  }

  private clearHover(): void { this.emitHover(null) }
  private onPointerLeave = (event: PointerEvent): void => {
    if (!this.pointer && event.pointerType !== 'touch') this.clearHover()
  }

  private onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey) return
    event.preventDefault()
    this.cancelMotion()
    const scale = event.deltaMode === 1 ? this.cell : event.deltaMode === 2 ? this.height : 1
    this.offset += (event.deltaY || event.deltaX) * scale
    this.clearHover()
    this.invalidate()
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0 || this.pointer) return
    this.cancelMotion()
    this.canvas.focus({ preventScroll: true })
    this.pointer = { id: event.pointerId, y: event.clientY, startX: event.clientX, startY: event.clientY, time: event.timeStamp, moved: false }
    this.canvas.setPointerCapture(event.pointerId)
  }

  private onPointerMove = (event: PointerEvent): void => {
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
    const pointer = this.pointer
    if (!pointer || pointer.id !== event.pointerId) return
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
    if (this.pointer?.id !== event.pointerId) return
    this.pointer = null
    this.cancelMotion()
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    this.clearHover()
  }

  private onLostCapture = (event: PointerEvent): void => {
    if (this.pointer?.id === event.pointerId) this.onPointerCancel(event)
  }

  private onKey = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'Escape') {
      event.preventDefault()
      this.clearHover()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.cancelMotion()
      const index = this.centerIndex
      const row = this.row(index)
      const col = index - this.firstIndex(row)
      const rect = this.canvas.getBoundingClientRect()
      this.emitHover(this.hitAt(
        rect.left + this.gridLeft + col * this.cell,
        rect.top + row * this.cell - this.offset,
      ))
      return
    }
    const increments: Record<string, number> = {
      ArrowUp: -this.cell, ArrowDown: this.cell,
      ArrowLeft: -this.cell, ArrowRight: this.cell,
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
