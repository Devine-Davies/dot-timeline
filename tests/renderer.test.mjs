import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatISO } from '../src/domain/dates.ts'
import { UNIT_SPECS } from '../src/domain/timeline.ts'
import { contrastText, DotTimeline } from '../src/presentation/canvas/DotTimeline.ts'

function setup(t, unit = '1w', width = 1208) {
  const frames = new Map()
  let nextFrame = 0
  const globals = {
    window: {
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
      setTimeout: () => 0,
    },
    ResizeObserver: class { constructor(callback) { resize = callback } observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: (id) => frames.delete(id),
  }
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  let renderer
  let resize
  let height = 600
  t.after(() => {
    renderer?.destroy()
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })

  const text = []
  const dots = []
  const bars = []
  const labels = []
  let arc
  const context = {
    setTransform() {}, clearRect() { text.length = dots.length = bars.length = labels.length = 0 },
    beginPath() { arc = undefined }, arc(x, y, radius) { arc = { x, y, radius } },
    fill() { if (arc) dots.push({ ...arc, color: this.fillStyle }) },
    stroke() {},
    fillText(label, x, y) { text.push(label); labels.push({ label, x, y, color: this.fillStyle }) },
    fillRect(x, y, width, height) { bars.push({ x, y, width, height, color: this.fillStyle }) },
  }
  class Canvas extends EventTarget {
    style = { touchAction: '' }
    attributes = new Map()
    captured = new Set()
    getContext() { return context }
    getBoundingClientRect() { return { left: 20, top: 40, width, height } }
    getAttribute(key) { return this.attributes.get(key) ?? null }
    setAttribute(key, value) { this.attributes.set(key, value) }
    removeAttribute(key) { this.attributes.delete(key) }
    focus() {}
    setPointerCapture(id) { this.captured.add(id) }
    hasPointerCapture(id) { return this.captured.has(id) }
    releasePointerCapture(id) { this.captured.delete(id) }
  }
  const canvas = new Canvas()
  renderer = new DotTimeline(canvas, { unit, events: [] })
  const hits = []
  const views = []
  renderer.onHover((hit) => hits.push(hit))
  renderer.onViewChange((view) => views.push(view))
  function draw() {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(performance.now())
  }
  function dispatch(type, values = {}) {
    const event = Object.assign(new Event(type, { cancelable: true }), values)
    canvas.dispatchEvent(event)
  }
  draw()
  const today = dots.find((dot) => dot.color === '#dc3838')
  assert.ok(today, 'The red today dot must remain visible without a label')
  const point = { clientX: today.x + 20, clientY: today.y + 40, pointerType: 'mouse' }
  return { renderer, hits, text, dots, bars, labels, views, canvas, dispatch, draw, point,
    resize: (nextWidth, nextHeight = height) => { width = nextWidth; height = nextHeight; resize(); draw() } }
}

for (const { id } of UNIT_SPECS) {
  test(`today has no persistent label and is identified only in its nearest-dot hit area at ${id}`, (t) => {
    const { hits, text, dispatch, point, views } = setup(t, id)
    assert.equal(text.some((label) => label.includes('Today')), false, id)
    assert.deepEqual(hits, [])
    const halfCell = views.at(-1).cellSize / 2
    dispatch('pointermove', { ...point, clientX: point.clientX + halfCell - 0.1 })
    assert.equal(hits.at(-1).today, formatISO(new Date()), id)
    dispatch('pointermove', { ...point, clientX: point.clientX - halfCell - 0.1 })
    assert.equal(hits.at(-1).today, undefined, id)
    assert.ok(hits.at(-1).start, 'Neighbouring dots still provide date details')
    dispatch('pointerleave', point)
    assert.equal(hits.at(-1), null)
  })
}

test('today is inspectable by touch and keyboard, and navigation and Escape dismiss it', (t) => {
  const { renderer, hits, text, dispatch, draw, point } = setup(t)
  const touch = { ...point, pointerType: 'touch', isPrimary: true, button: 0, pointerId: 1 }
  dispatch('pointerdown', touch)
  dispatch('pointerup', touch)
  assert.equal(hits.at(-1).today, formatISO(new Date()))
  dispatch('keydown', { key: 'Escape' })
  assert.equal(hits.at(-1), null)
  dispatch('keydown', { key: 'Enter' })
  assert.equal(hits.at(-1).today, formatISO(new Date()))
  dispatch('wheel', { deltaMode: 0, deltaY: 22, deltaX: 0 })
  assert.equal(hits.at(-1), null)
  renderer.scrollToToday()
  draw()
  assert.equal(text.some((label) => label.includes('Today')), false)
  dispatch('keydown', { key: ' ' })
  assert.equal(hits.at(-1).today, formatISO(new Date()))
  dispatch('keydown', { key: 'ArrowDown' })
  assert.equal(hits.at(-1), null)
})

test('today hover retains overlapping events and is cleared by dragging or a scale change', (t) => {
  const { renderer, hits, dispatch, point } = setup(t)
  const today = formatISO(new Date())
  renderer.setEvents([{ id: 'today-event', name: 'Today event', start: today, end: today, color: '#123456', category: 'personal' }])
  dispatch('pointermove', point)
  assert.equal(hits.at(-1).today, today)
  assert.equal(hits.at(-1).events[0].name, 'Today event')
  const drag = { ...point, isPrimary: true, button: 0, pointerId: 1 }
  dispatch('pointerdown', drag)
  dispatch('pointermove', { ...drag, clientY: point.clientY + 6 })
  assert.equal(hits.at(-1), null)
  dispatch('pointercancel', drag)
  dispatch('pointermove', point)
  renderer.setUnit('1y')
  assert.equal(hits.at(-1), null)
})

test('fit fills rows within the available width and all zoom inputs respect the limits', (t) => {
  const { renderer, views, draw, dispatch, resize } = setup(t, '1y')
  assert.equal(views.at(-1).cellSize, 72)
  renderer.setZoom(40)
  draw()
  assert.equal(views.at(-1).cellSize, 40)
  dispatch('keydown', { key: '+' })
  draw()
  assert.equal(views.at(-1).cellSize, 44)
  dispatch('keydown', { key: '-' })
  draw()
  assert.equal(views.at(-1).cellSize, 40)
  renderer.fit()
  draw()
  assert.equal(views.at(-1).cellSize, 72)
  resize(360)
  const narrow = views.at(-1)
  assert.ok(narrow.maxCellSize <= (360 - 61.2 - 8) / 10)
  assert.ok(narrow.cellSize <= narrow.maxCellSize)
  renderer.setZoom(6)
  draw()
  assert.equal(views.at(-1).cellSize, 12)
  for (const size of [NaN, Infinity, 0, 5, 73]) assert.throws(() => renderer.setZoom(size), RangeError)
})

test('weekly rows can fit a 360px screen below 12px without horizontal overflow', (t) => {
  const { renderer, views, dots, draw } = setup(t, '1w', 360)
  const view = views.at(-1)
  assert.equal(view.minCellSize, 6)
  assert.ok(view.cellSize >= 6 && view.cellSize < 12)
  assert.ok(dots.every((dot) => dot.x - dot.radius >= 0 && dot.x + dot.radius <= 360))
  renderer.setZoom(72)
  draw()
  assert.equal(views.at(-1).cellSize, view.maxCellSize)
})

test('zoom preserves the date and vertical pixel position under the pointer', (t) => {
  const { renderer, views, hits, point, dispatch, draw } = setup(t, '1y')
  renderer.setZoom(40)
  draw()
  const before = views.at(-1)
  const pointer = { ...point, clientX: before.today.x + 20, clientY: before.today.y + 40 }
  dispatch('pointermove', pointer)
  const date = hits.at(-1).start
  dispatch('wheel', { ...pointer, ctrlKey: true, deltaMode: 0, deltaY: -Math.log(64 / 40) / 0.01, deltaX: 0 })
  draw()
  dispatch('pointermove', pointer)
  assert.equal(hits.at(-1).start, date)
  assert.ok(Math.abs(views.at(-1).today.y - before.today.y) < 0.001)
  assert.ok(Math.abs(views.at(-1).cellSize - 64) < 0.001)
  assert.equal(views.at(-1).centerDate, before.centerDate)
})

test('touch pinch zooms without scrolling or creating a stray tap', (t) => {
  const { renderer, views, dispatch, draw, hits } = setup(t, '1y')
  renderer.setZoom(40)
  draw()
  const common = { pointerType: 'touch', button: 0, clientY: 340 }
  dispatch('pointerdown', { ...common, pointerId: 1, isPrimary: true, clientX: 500 })
  dispatch('pointerdown', { ...common, pointerId: 2, isPrimary: false, clientX: 600 })
  dispatch('pointermove', { ...common, pointerId: 2, clientX: 660 })
  draw()
  assert.equal(views.at(-1).cellSize, 64)
  dispatch('pointerup', { ...common, pointerId: 2, clientX: 660 })
  dispatch('pointerup', { ...common, pointerId: 1, clientX: 500 })
  assert.equal(hits.filter(Boolean).length, 0)
})

test('zoom buttons, unit changes and resize retain the viewed calendar date', (t) => {
  const { renderer, views, draw, resize } = setup(t, '1y')
  renderer.scrollToDate('1945-05-08', false)
  renderer.setZoom(40)
  draw()
  assert.equal(views.at(-1).centerDate, '1945-05-08')
  renderer.setUnit('1m', 56)
  draw()
  assert.equal(views.at(-1).centerDate, '1945-05-08')
  assert.equal(views.at(-1).cellSize, 56)
  resize(600, 800)
  assert.equal(views.at(-1).centerDate, '1945-05-08')
  renderer.setUnit('5y', 40)
  draw()
  assert.equal(views.at(-1).centerDate, '1945-05-08')
})

test('resizing and button zoom preserve the centre date after wheel navigation, not only explicit jumps', (t) => {
  const { renderer, views, dispatch, draw, resize } = setup(t, '1y')
  renderer.setZoom(64)
  dispatch('wheel', { deltaMode: 0, deltaY: 640, deltaX: 0 })
  draw()
  const before = views.at(-1).centerDate
  renderer.setZoom(40)
  draw()
  assert.equal(views.at(-1).centerDate, before)
  resize(360)
  assert.equal(views.at(-1).centerDate, before)
  resize(1600)
  assert.equal(views.at(-1).centerDate, before)
})

test('Safari scale gestures and Command-wheel both zoom around their supplied point', (t) => {
  const { renderer, views, dispatch, draw } = setup(t, '1y')
  renderer.setZoom(40)
  dispatch('gesturestart')
  dispatch('gesturechange', { scale: 1.6, clientX: 624, clientY: 340 })
  dispatch('gestureend')
  draw()
  assert.equal(views.at(-1).cellSize, 64)
  dispatch('wheel', { metaKey: true, clientX: 624, clientY: 340, deltaY: Math.log(64 / 40) / 0.01 })
  draw()
  assert.ok(Math.abs(views.at(-1).cellSize - 40) < 0.001)
})

test('detail thresholds show short years at 40px, full years and every event bar at 56px', (t) => {
  const { renderer, text, bars, dots, draw } = setup(t, '1y')
  const events = [
    { id: 'one', name: 'First', start: '1990-06-01', end: '1990-06-03', color: '#007d73', category: 'personal' },
    { id: 'two', name: 'Second', start: '1989-01-01', end: '1991-12-31', color: '#2463ce', category: 'history' },
  ]
  renderer.setEvents(events)
  renderer.scrollToDate('1990-01-01', false)
  renderer.setZoom(39)
  draw()
  assert.equal(text.includes('90'), false)
  assert.equal(bars.length, 0)
  renderer.setZoom(40)
  draw()
  assert.ok(text.includes('90'))
  assert.equal(text.includes('1990'), false)
  assert.equal(bars.length, 0)
  renderer.setZoom(56)
  draw()
  assert.ok(text.includes('1990'))
  const winner = dots.find((dot) => dot.color === events[0].color)
  const lanes = bars.filter((bar) => Math.abs(bar.x + bar.width / 2 - winner.x) < 0.01 && bar.y > winner.y && bar.y < winner.y + 30)
  assert.deepEqual(lanes.map((bar) => bar.color), events.map((event) => event.color))
})

test('calendar rows align years to decades, months to years, and five-year blocks to centuries', (t) => {
  const { renderer, labels, draw } = setup(t, '1y', 1600)
  renderer.scrollToDate('1945-01-01', false)
  renderer.setZoom(64)
  draw()
  assert.equal(labels.find((item) => item.label === '1940').y, labels.find((item) => item.label === '1949').y)
  assert.notEqual(labels.find((item) => item.label === '1939').y, labels.find((item) => item.label === '1940').y)
  assert.ok(labels.some((item) => item.label === '1940s'))
  renderer.setUnit('1m', 64)
  draw()
  const centerYear = labels.find((item) => item.label === '1945')
  assert.ok(centerYear)
  assert.equal(labels.find((item) => item.label === 'Jan' && item.y === centerYear.y - 6).y,
    labels.find((item) => item.label === 'Dec' && item.y === centerYear.y - 6).y)
  renderer.setUnit('5y', 56)
  draw()
  assert.equal(labels.find((item) => item.label === '1900').y, labels.find((item) => item.label === '1995').y)
})

test('large numbers of overlapping events get separate bars without covering the following row', (t) => {
  const { renderer, bars, draw, views } = setup(t, '1y')
  renderer.setEvents(Array.from({ length: 100 }, (_, index) => ({
    id: `event-${index}`, name: `Event ${index}`, start: '1990-01-01', end: '1990-12-31',
    color: '#123456', category: 'personal',
  })))
  renderer.scrollToDate('1990-01-01', false)
  renderer.setZoom(64)
  draw()
  assert.equal(bars.length, 100)
  assert.ok(bars.every((bar, index) => index === 0 || bar.y > bars[index - 1].y + bars[index - 1].height))
  assert.equal(views.at(-1).centerDate, '1990-01-01')
})

test('dot text has at least 4.5:1 contrast for arbitrary event colours', () => {
  function luminance(color) {
    const channels = [1, 3, 5].map((offset) => {
      const channel = parseInt(color.slice(offset, offset + 2), 16) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  }
  for (let red = 0; red <= 255; red += 17) {
    for (let green = 0; green <= 255; green += 17) {
      for (let blue = 0; blue <= 255; blue += 17) {
        const color = `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
        const a = luminance(color)
        const b = luminance(contrastText(color))
        assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, color)
      }
    }
  }
})
