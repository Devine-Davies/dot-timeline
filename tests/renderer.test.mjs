import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatISO } from '../src/domain/dates.ts'
import { UNIT_SPECS } from '../src/domain/timeline.ts'
import { DotTimeline } from '../src/presentation/canvas/DotTimeline.ts'

function setup(t, unit = '1w') {
  const frames = new Map()
  let nextFrame = 0
  const globals = {
    window: {
      devicePixelRatio: 1,
      matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
      setTimeout: () => 0,
    },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame },
    cancelAnimationFrame: (id) => frames.delete(id),
  }
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  let renderer
  t.after(() => {
    renderer?.destroy()
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })

  const text = []
  const dots = []
  let arc
  const context = {
    setTransform() {}, clearRect() { text.length = dots.length = 0 },
    beginPath() { arc = undefined }, arc(x, y, radius) { arc = { x, y, radius } },
    fill() { if (arc) dots.push({ ...arc, color: this.fillStyle }) },
    stroke() {},
    fillText(label) { text.push(label) },
  }
  class Canvas extends EventTarget {
    style = { touchAction: '' }
    attributes = new Map()
    captured = new Set()
    getContext() { return context }
    getBoundingClientRect() { return { left: 20, top: 40, width: 1208, height: 600 } }
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
  renderer.onHover((hit) => hits.push(hit))
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
  return { renderer, hits, text, dispatch, draw, point }
}

for (const { id } of UNIT_SPECS) {
  test(`today has no persistent label and is identified only in its nearest-dot hit area at ${id}`, (t) => {
    const { hits, text, dispatch, point } = setup(t, id)
    assert.equal(text.some((label) => label.includes('Today')), false, id)
    assert.deepEqual(hits, [])
    dispatch('pointermove', { ...point, clientX: point.clientX + 10.9 })
    assert.equal(hits.at(-1).today, formatISO(new Date()), id)
    dispatch('pointermove', { ...point, clientX: point.clientX + 11.1 })
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
