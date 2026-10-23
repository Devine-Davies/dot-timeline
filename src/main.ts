import './style.css'
import { DotTimeline } from './engine/DotTimeline'
import { UNIT_SPECS, formatISO, parseDate } from './engine/dates'
import type { TimelineEvent, Unit, DotHit } from './engine/types'

interface ActiveEvent {
  eventId: string
  color: string
  visible: boolean
  order: number
}
interface ViewState {
  unit: Unit
  centerDate: string
  panelOpen: boolean
}

const categories = ['sport', 'seasons', 'finance', 'history', 'personal'] as const
const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
const isUnit = (value: unknown): value is Unit => UNIT_SPECS.some((unit) => unit.id === value)
const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}$/.test(value)) return false
  try { return Number.isFinite(parseDate(value).getTime()) } catch { return false }
}
function isEvent(value: unknown): value is TimelineEvent {
  if (!value || typeof value !== 'object') return false
  const event = value as TimelineEvent
  return typeof event.id === 'string' && typeof event.name === 'string' &&
    event.name.trim().length > 0 && event.name.length <= 120 &&
    isDate(event.start) && isDate(event.end) &&
    parseDate(event.start) <= parseDate(event.end) && isColor(event.color) &&
    categories.includes(event.category)
}
let storageFailed = false
function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(`dt:v1:${key}`) ?? 'null') }
  catch { return null }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(`dt:v1:${key}`, JSON.stringify(value)) }
  catch {
    if (!storageFailed) {
      storageFailed = true
      announce('Device storage is unavailable. Changes will last for this visit only.')
    }
  }
}
const storedCustom = read('custom')
let custom: TimelineEvent[] = Array.isArray(storedCustom)
  ? storedCustom.filter(isEvent).filter((event) => event.category === 'personal') : []
const storedActive = read('active')
let active: ActiveEvent[] = Array.isArray(storedActive) ? storedActive.filter((value): value is ActiveEvent =>
  value && typeof value.eventId === 'string' && isColor(value.color) &&
  typeof value.visible === 'boolean' && Number.isFinite(value.order),
).sort((a, b) => a.order - b.order).filter((value, index, list) =>
  list.findIndex((other) => other.eventId === value.eventId) === index) : []
const storedView = read('view') as Partial<ViewState> | null
const query = new URLSearchParams(location.search)
const initialUnit = query.get('unit') ?? storedView?.unit
const initialDate = query.get('at') ?? storedView?.centerDate
const view: ViewState = {
  unit: isUnit(initialUnit) ? initialUnit : '1w',
  centerDate: isDate(initialDate) ? initialDate : formatISO(new Date()),
  panelOpen: typeof storedView?.panelOpen === 'boolean' ? storedView.panelOpen : matchMedia('(min-width: 768px)').matches,
}
let library: TimelineEvent[] = []
let category = 'all'
let search = ''
let dragId: string | null = null
let persistTimer: ReturnType<typeof setTimeout> | undefined
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
})
const eraFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', era: 'short',
})
const dateLabel = (date: string) => {
  const parsed = parseDate(date)
  return (parsed.getUTCFullYear() <= 0 ? eraFormatter : dateFormatter).format(parsed)
}

const paths = {
  close: 'M6 6l12 12M6 18 18 6',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  panel: 'M9 4v16M4 4h16v16H4z',
  crosshair: 'M12 2v4m0 12v4M2 12h4m12 0h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff: 'm3 3 18 18M10.6 5.1 12 5c6 0 10 7 10 7a19 19 0 0 1-3 3.7M6.5 6.5A22 22 0 0 0 2 12s4 7 10 7a13 13 0 0 0 5.5-1.5M10 10a3 3 0 0 0 4 4',
  plus: 'M12 5v14M5 12h14',
} as const
function icon(name: keyof typeof paths, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]}"/></svg>`
}
const iconButton = 'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-canvas'
const dialogClass = 'm-auto max-h-[calc(100dvh-40px)] w-[calc(100%-32px)] max-w-[460px] overflow-y-auto rounded-2xl border border-line bg-white p-6 text-ink shadow-2xl backdrop:bg-ink/30 backdrop:backdrop-blur-sm'
const fieldClass = 'mt-2 min-h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2 font-normal'
document.querySelector<HTMLDivElement>('#app')!.className = 'flex h-dvh w-full overflow-hidden'
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <aside id="panel" class="fixed inset-y-0 left-0 z-20 flex w-[min(360px,calc(100%-16px))] shrink-0 flex-col border-r border-line bg-white max-md:shadow-xl md:relative md:w-[360px]" aria-labelledby="panel-title" hidden>
    <div class="min-h-0 flex-1 overflow-y-auto px-6 pt-7 [scrollbar-width:thin]">
      <div class="flex items-center justify-between"><a href="./" class="text-[11px] font-semibold tracking-[.18em]" aria-label="Dot Timeline home">DOT TIMELINE</a>
        <button id="close-panel" class="${iconButton}" aria-label="Close event panel">${icon('close')}</button></div>
      <h1 id="panel-title" class="mt-6 text-[28px] font-semibold tracking-tight">Events</h1>
      <p class="mt-2 text-sm leading-6 text-muted">Highlight spans of time on your timeline.</p>
      <label for="search" class="mt-7 block text-xs font-medium">Search library</label>
      <div class="mt-2 flex items-center gap-2.5 rounded-lg border border-line px-3 text-muted focus-within:ring-2 focus-within:ring-ink">
        ${icon('search', 17)}<input id="search" class="min-h-11 w-full min-w-0 bg-transparent text-[13px] text-ink placeholder:text-muted focus:outline-none" type="search" placeholder="e.g. Olympics, tax year, summer">
      </div>
      <div id="categories" class="my-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category"></div>
      <section class="border-b border-line pb-5" aria-labelledby="active-title">
        <div class="mb-2 flex items-center justify-between"><h2 id="active-title" class="text-sm font-semibold">On your timeline</h2><span id="active-count" class="font-mono text-xs text-muted">0</span></div>
        <ol id="active-list"></ol>
        <p id="active-empty" class="py-5 text-sm leading-6 text-muted">No events yet. Add one from the library<br>or create something of your own.</p>
      </section>
      <section class="py-5" aria-labelledby="library-title"><div class="mb-1 flex items-center justify-between"><h2 id="library-title" class="text-sm font-semibold">Library</h2><span id="result-count" class="text-[10px] font-medium tracking-wide text-muted"></span></div>
        <div id="library-list"></div><p id="library-message" class="py-5 text-sm leading-6 text-muted">Loading the library…</p>
      </section>
    </div>
    <div class="shrink-0 border-t border-line bg-white px-6 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]"><button id="create-event" class="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-400 text-sm font-medium hover:bg-canvas">${icon('plus', 16)} Create custom event</button></div>
  </aside>
  <div id="backdrop" class="fixed inset-0 z-15 bg-ink/25 backdrop-blur-xs" hidden></div>
  <main id="timeline-area" class="@container relative h-full min-w-0 flex-1 overflow-hidden bg-canvas">
    <header class="pointer-events-none absolute inset-x-4 top-5 z-3 flex items-center justify-between gap-2 lg:inset-x-8 lg:top-7">
      <p id="scale-caption" class="whitespace-nowrap rounded-md border border-line bg-white px-2.5 py-2 font-mono text-[10px] text-muted lg:text-xs"></p>
      <div class="flex items-center gap-2 rounded-full bg-canvas/95 pl-2 text-[11px] text-muted lg:gap-5 lg:text-xs">
        <span class="flex items-center gap-1.5"><i class="size-2 rounded-full bg-zinc-700"></i>Past</span>
        <span class="flex items-center gap-1.5"><i class="size-2 rounded-full border border-zinc-400"></i>Future</span>
        <span class="flex items-center gap-1.5"><i class="size-2 rounded-full bg-red-500"></i>Today</span>
        <button id="help-button" class="pointer-events-auto inline-flex size-11 items-center justify-center rounded-full border border-line bg-white text-sm font-medium text-muted hover:bg-zinc-100" aria-label="How to use Dot Timeline">?</button>
      </div>
    </header>
    <canvas id="timeline" class="block size-full touch-none cursor-grab outline-offset-[-5px] active:cursor-grabbing" aria-describedby="canvas-help"></canvas>
    <p id="canvas-help" class="sr-only">Scroll up into the past and down into the future. Use arrow keys or Page Up and Page Down to navigate, and Home to return to today. Press Enter or Space to inspect the centre dot and Escape to dismiss its tooltip. Open Events to add date ranges.</p>
    <div class="pointer-events-none absolute inset-x-0 top-0 z-2 h-20 bg-linear-to-b from-canvas via-canvas/80 to-transparent"></div>
    <div class="pointer-events-none absolute inset-x-0 bottom-0 z-2 h-20 bg-linear-to-t from-canvas via-canvas/80 to-transparent"></div>
    <div id="tooltip" class="pointer-events-none absolute z-6 max-w-[min(300px,calc(100%-16px))] rounded-lg bg-zinc-800 px-4 py-3 text-xs leading-6 text-white shadow-lg [&_strong]:font-medium [&_p]:mt-1 [&_p]:text-zinc-300 [&_p]:wrap-anywhere" role="tooltip" hidden></div>
    <p id="visible-range" class="sr-only"></p>
    <nav class="absolute bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 z-5 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-white p-1.5 shadow-[0_3px_16px_#18181b0a] max-sm:gap-0 max-sm:p-1" aria-label="Timeline controls">
      <button id="panel-toggle" class="panel-toggle ${iconButton} bg-white text-ink hover:bg-zinc-100 aria-expanded:bg-zinc-100 aria-expanded:hover:bg-zinc-200" aria-label="Events" aria-controls="panel" aria-expanded="false">${icon('panel')}<span id="nav-event-count" class="sr-only">0</span></button>
      <div id="units" class="flex" role="group" aria-label="Time per dot"></div>
      <button id="today-button" class="ml-1 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-line px-3 text-xs font-medium hover:bg-canvas max-sm:ml-0 max-sm:px-2">${icon('crosshair', 14)}Today</button>
    </nav>
  </main>
  <div id="status" class="sr-only" role="status" aria-live="polite"></div>
  <dialog id="event-dialog" class="${dialogClass}" aria-labelledby="event-dialog-title">
    <form id="event-form"><div class="flex items-center justify-between gap-2"><h2 id="event-dialog-title" class="text-xl font-semibold tracking-tight">Create custom event</h2><button type="button" class="${iconButton}" id="cancel-event" aria-label="Close custom event form">${icon('close')}</button></div>
      <p class="my-4 text-sm leading-6 text-muted">A chapter of your life, a project, or something worth remembering.</p>
      <label class="my-4 block text-sm font-medium">Event name<input class="${fieldClass}" name="name" id="event-name" required maxlength="120" placeholder="e.g. My university years" autocomplete="off"></label>
      <div class="flex gap-3"><label class="min-w-0 flex-1 text-sm font-medium">Start date<input class="${fieldClass}" name="start" id="event-start" type="date" required></label><label class="min-w-0 flex-1 text-sm font-medium">End date<input class="${fieldClass}" name="end" id="event-end" type="date" required></label></div>
      <label class="my-4 flex items-center justify-between text-sm font-medium">Event colour<input class="size-11 cursor-pointer bg-transparent p-2" name="color" type="color" value="#6366f1"></label>
      <p id="form-error" class="my-3 text-sm text-red-700" role="alert"></p>
      <button type="submit" class="min-h-12 w-full rounded-lg bg-ink text-sm font-medium text-white hover:bg-zinc-700">Add to my timeline</button>
    </form>
  </dialog>
  <dialog id="help-dialog" class="${dialogClass}" aria-labelledby="help-title"><div class="flex items-center justify-between gap-2"><h2 id="help-title" class="text-xl font-semibold tracking-tight">One dot. A little time.</h2><button id="close-help" class="${iconButton}" aria-label="Close help">${icon('close')}</button></div>
    <p class="my-4 text-sm leading-6 text-muted">Zoom out to see the bigger picture. Put your own life alongside the moments that shaped the world.</p>
    <dl class="text-sm leading-6 [&_dt]:mt-4 [&_dt]:font-semibold [&_dd]:mt-1 [&_dd]:text-muted"><dt>Move through time</dt><dd>Scroll or drag the grid. On the grid, use ↑ / ↓, ← / → or Page Up / Down.</dd><dt>Find your way back</dt><dd>Press Home on the grid, or choose Today.</dd><dt>Explore a dot</dt><dd>Hover with a mouse or tap on a touch screen. With the grid focused, press Enter or Space to inspect the centre dot; Escape dismisses the tooltip.</dd><dt>Make it personal</dt><dd>Open Events. Add, hide, recolour, or reorder events. The highest event in your list colours overlapping dots. Use the arrow buttons to reorder without dragging.</dd><dt>Keep a view</dt><dd>The address bar follows your view. Bookmark or copy it to keep a place in time. Your events stay on this device.</dd></dl>
    <p class="mt-5 text-xs text-muted">Weeks start on Monday. All date calculations use UTC.</p>
  </dialog>
`

function get<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T }
function announce(message: string) { get('status').textContent = message }
function button(label: string, className: string, onClick: () => void) {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = label
  element.className = className
  element.addEventListener('click', onClick)
  return element
}
const engine = new DotTimeline(get<HTMLCanvasElement>('timeline'), { unit: view.unit, events: [] })
engine.scrollToDate(view.centerDate, false)
const eventById = (id: string) => custom.find((event) => event.id === id) ?? library.find((event) => event.id === id)
function syncEvents() {
  active = active.map((event, order) => ({ ...event, order }))
  engine.setEvents(active.flatMap((item) => {
    const event = eventById(item.eventId)
    return item.visible && event ? [{ ...event, color: item.color, order: item.order }] : []
  }))
  save('active', active)
  save('custom', custom)
  renderActive()
  renderLibrary()
}
function addEvent(event: TimelineEvent) {
  if (active.some((item) => item.eventId === event.id)) return
  active.push({ eventId: event.id, color: event.color, visible: true, order: active.length })
  syncEvents()
  announce(`${event.name} added to your timeline.`)
}
function reorder(id: string, offset: number) {
  const index = active.findIndex((item) => item.eventId === id)
  const target = index + offset
  if (index < 0 || target < 0 || target >= active.length) return
  const [item] = active.splice(index, 1)
  active.splice(target, 0, item!)
  syncEvents()
  get('active-list').querySelectorAll<HTMLButtonElement>('.event-name')[target]?.focus()
  announce('Event priority updated.')
}
function renderActive() {
  const list = get('active-list')
  list.replaceChildren()
  get('active-count').textContent = `${active.length}`
  get('nav-event-count').textContent = `${active.length}`
  get('active-empty').hidden = active.length > 0
  active.forEach((item, index) => {
    const event = eventById(item.eventId)
    if (!event) return
    const row = document.createElement('li')
    row.className = `active-event group border-b border-line/70 py-2 last:border-0 [&.dragging]:opacity-40${item.visible ? '' : ' is-hidden [&_.event-name]:opacity-40 [&_.event-color]:opacity-40 [&_.event-dates]:opacity-40'}`
    row.draggable = true
    row.addEventListener('dragstart', (e) => {
      dragId = item.eventId
      e.dataTransfer?.setData('text/plain', item.eventId)
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      row.classList.add('dragging')
    })
    row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging') })
    row.addEventListener('dragover', (e) => { if (dragId) e.preventDefault() })
    row.addEventListener('drop', (e) => {
      e.preventDefault()
      if (!dragId) return
      const from = active.findIndex((entry) => entry.eventId === dragId)
      reorder(dragId, index - from)
      dragId = null
    })
    const heading = document.createElement('div')
    heading.className = 'event-topline flex items-center gap-1'
    const swatch = document.createElement('input')
    swatch.type = 'color'
    swatch.value = item.color
    swatch.className = 'event-color size-11 shrink-0 cursor-pointer bg-transparent p-[15px]'
    swatch.setAttribute('aria-label', `Colour for ${event.name}`)
    swatch.addEventListener('input', () => {
      item.color = swatch.value
      engine.setEvents(active.flatMap((entry) => {
        const source = eventById(entry.eventId)
        return entry.visible && source ? [{ ...source, color: entry.color, order: entry.order }] : []
      }))
      save('active', active)
    })
    const title = button(event.name, 'event-name min-h-11 min-w-0 flex-1 rounded text-left text-sm font-medium leading-5 wrap-anywhere hover:text-muted', () => engine.scrollToDate(event.start, true))
    title.title = `Go to ${event.name}`
    const visibility = button('', `icon-button visibility-button ${iconButton}`, () => {
      item.visible = !item.visible
      syncEvents()
      list.querySelectorAll<HTMLButtonElement>('.visibility-button')[index]?.focus()
    })
    visibility.innerHTML = icon(item.visible ? 'eye' : 'eyeOff', 17)
    visibility.setAttribute('aria-label', `${item.visible ? 'Hide' : 'Show'} ${event.name}`)
    visibility.setAttribute('aria-pressed', `${item.visible}`)
    heading.append(swatch, title, visibility)
    const dates = document.createElement('p')
    dates.className = 'event-dates -mt-1 pl-12 font-mono text-[10px] leading-5 text-muted'
    dates.textContent = `${dateLabel(event.start)} — ${dateLabel(event.end)}`
    const details = document.createElement('details')
    details.className = 'ml-12'
    const summary = document.createElement('summary')
    summary.className = 'flex min-h-11 cursor-pointer list-none items-center text-[11px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden'
    summary.textContent = 'Manage event ···'
    const actions = document.createElement('div')
    actions.className = 'event-actions flex items-center'
    const up = button('↑', `icon-button reorder ${iconButton} disabled:opacity-30`, () => reorder(item.eventId, -1))
    up.setAttribute('aria-label', `Move ${event.name} up`)
    up.disabled = index === 0
    const down = button('↓', `icon-button reorder ${iconButton} disabled:opacity-30`, () => reorder(item.eventId, 1))
    down.setAttribute('aria-label', `Move ${event.name} down`)
    down.disabled = index === active.length - 1
    const remove = button('Remove', 'text-button remove-button ml-auto min-h-11 rounded px-2 text-xs text-muted underline underline-offset-4 hover:bg-canvas', () => {
      active = active.filter((entry) => entry.eventId !== item.eventId)
      syncEvents()
      announce(`${event.name} removed. You can add it again from the library.`)
      const next = list.querySelector<HTMLButtonElement>('.event-name')
      ;(next ?? get('create-event')).focus()
    })
    actions.append(up, down, remove)
    details.append(summary, actions)
    row.append(heading, dates, details)
    list.append(row)
  })
}
function renderLibrary() {
  const list = get('library-list')
  list.replaceChildren()
  const results = [...library, ...custom].filter((event) =>
    (category === 'all' || event.category === category) &&
    event.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  ).sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())
  get('result-count').textContent = `${results.length} EVENTS`
  const message = get('library-message')
  message.hidden = results.length > 0
  if (!results.length) message.textContent = 'No matching events. Try another search or create your own.'
  results.forEach((event) => {
    const row = document.createElement('article')
    row.className = 'library-event grid grid-cols-[12px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line/70 py-4 last:border-0'
    const mark = document.createElement('span')
    mark.className = 'library-swatch mt-1.5 size-2.5 self-start rounded-full border-2'
    mark.style.borderColor = event.color
    const info = document.createElement('div')
    const title = document.createElement('h4')
    title.className = 'text-sm font-medium leading-5 wrap-anywhere'
    title.textContent = event.name
    const dates = document.createElement('p')
    dates.className = 'event-dates mt-1 font-mono text-[10px] leading-5 text-muted'
    dates.textContent = `${dateLabel(event.start)} — ${dateLabel(event.end)}`
    info.append(title, dates)
    if (event.source && /^https?:\/\//.test(event.source)) {
      const source = document.createElement('a')
      source.href = event.source
      source.target = '_blank'
      source.rel = 'noopener noreferrer'
      source.className = 'source-link inline-flex min-h-11 items-center text-[10px] text-muted underline decoration-line underline-offset-4 hover:text-ink'
      source.textContent = `${event.category} · source ↗`
      source.setAttribute('aria-label', `Date source for ${event.name} (opens in a new tab)`)
      info.append(source)
    } else {
      const personal = document.createElement('span')
      personal.className = 'source-link mt-1 block text-[10px] text-muted'
      personal.textContent = 'personal · only on this device'
      info.append(personal)
    }
    const added = active.some((item) => item.eventId === event.id)
    const add = button(added ? 'Added' : 'Add', 'add-button min-h-11 min-w-11 self-start rounded-lg border border-line px-2.5 text-xs font-medium hover:bg-canvas disabled:border-transparent disabled:text-muted disabled:opacity-60', () => {
      addEvent(event)
      announce(`${event.name} added to your timeline.`)
      get('active-list').querySelectorAll<HTMLButtonElement>('.event-name')[active.length - 1]?.focus()
    })
    add.disabled = added
    add.setAttribute('aria-label', `${added ? 'Added' : 'Add'} ${event.name}`)
    row.append(mark, info, add)
    if (event.category === 'personal') {
      const remove = button('Delete custom event', 'text-button delete-custom col-span-2 col-start-2 min-h-11 justify-self-start rounded text-[11px] text-muted underline underline-offset-4 hover:text-ink', () => {
        if (!confirm(`Delete “${event.name}” from this device?`)) return
        custom = custom.filter((item) => item.id !== event.id)
        active = active.filter((item) => item.eventId !== event.id)
        syncEvents()
        get('create-event').focus()
      })
      row.append(remove)
    }
    list.append(row)
  })
}
for (const value of ['all', ...categories]) {
  const chip = button(value === 'all' ? 'All' : value[0]!.toUpperCase() + value.slice(1), 'chip min-h-11 rounded-full border border-line px-3 text-xs hover:bg-canvas aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white', () => {
    category = value
    for (const child of get('categories').children) child.setAttribute('aria-pressed', `${(child as HTMLElement).dataset.category === value}`)
    renderLibrary()
  })
  chip.dataset.category = value
  chip.setAttribute('aria-pressed', `${value === category}`)
  get('categories').append(chip)
}
get<HTMLInputElement>('search').addEventListener('input', (event) => {
  search = (event.target as HTMLInputElement).value
  renderLibrary()
})
const mobile = matchMedia('(max-width: 767px)')
function applyPanel(focus = false) {
  get('panel').hidden = !view.panelOpen
  get('backdrop').hidden = !(view.panelOpen && mobile.matches)
  get('panel-toggle').setAttribute('aria-expanded', `${view.panelOpen}`)
  document.body.classList.toggle('panel-open', view.panelOpen)
  document.body.classList.toggle('mobile-panel', view.panelOpen && mobile.matches)
  get('timeline-area').inert = view.panelOpen && mobile.matches
  if (mobile.matches && view.panelOpen) {
    get('panel').setAttribute('role', 'dialog')
    get('panel').setAttribute('aria-modal', 'true')
  } else {
    get('panel').removeAttribute('role')
    get('panel').removeAttribute('aria-modal')
  }
  if (focus && view.panelOpen) get('close-panel').focus()
  if (focus && !view.panelOpen) get('panel-toggle').focus()
  save('view', view)
}
function setPanel(open: boolean) { view.panelOpen = open; applyPanel(true) }
get('panel-toggle').addEventListener('click', () => setPanel(!view.panelOpen))
get('close-panel').addEventListener('click', () => setPanel(false))
get('backdrop').addEventListener('click', () => setPanel(false))
mobile.addEventListener('change', () => applyPanel(true))
document.addEventListener('keydown', (event) => {
  if (get<HTMLDialogElement>('event-dialog').open || get<HTMLDialogElement>('help-dialog').open) return
  if (!view.panelOpen) return
  if (event.key === 'Escape') { setPanel(false); return }
  if (event.key !== 'Tab' || !mobile.matches) return
  const focusable = [...get('panel').querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]')]
    .filter((element) => element.getClientRects().length > 0)
  const first = focusable[0], last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
})
function updateUnits() {
  for (const child of get('units').children) child.setAttribute('aria-pressed', `${(child as HTMLElement).dataset.unit === view.unit}`)
  const scales: Record<Unit, string> = { '1w': '1 week', '2w': '2 weeks', '1m': '1 month', '1y': '1 year', '5y': '5 years' }
  get('scale-caption').textContent = `1 dot = ${scales[view.unit]}`
}
for (const spec of UNIT_SPECS) {
  const control = button('', 'unit-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 font-mono text-xs text-muted hover:bg-canvas aria-pressed:bg-ink aria-pressed:text-white max-sm:px-0 @min-[600px]:font-sans', () => {
    view.unit = spec.id
    engine.setUnit(spec.id)
    updateUnits()
    hideTooltip()
  })
  const compact = document.createElement('span')
  compact.className = '@min-[600px]:hidden'
  compact.textContent = spec.id
  const expanded = document.createElement('span')
  expanded.className = 'hidden @min-[600px]:inline'
  expanded.textContent = spec.label
  control.append(compact, expanded)
  control.setAttribute('aria-label', spec.label)
  control.dataset.unit = spec.id
  get('units').append(control)
}
get('today-button').addEventListener('click', () => { engine.scrollToToday(); hideTooltip() })
function hideTooltip() { get('tooltip').hidden = true }
function showTooltip(hit: DotHit | null) {
  const tooltip = get('tooltip')
  if (!hit || (view.panelOpen && mobile.matches)) { hideTooltip(); return }
  const title = document.createElement('strong')
  title.textContent = `${dateLabel(hit.start)} — ${dateLabel(hit.end)}`
  const content = document.createElement('p')
  content.textContent = hit.events.length ? hit.events.map((event) => event.name).join(' · ') : 'A little piece of time.'
  tooltip.replaceChildren(title, content)
  tooltip.hidden = false
  const canvas = get('timeline').getBoundingClientRect()
  const area = get('timeline-area').getBoundingClientRect()
  const left = canvas.left - area.left + hit.x
  const top = canvas.top - area.top + hit.y
  tooltip.style.left = `${Math.max(8, Math.min(left - tooltip.offsetWidth / 2, area.width - tooltip.offsetWidth - 8))}px`
  tooltip.style.top = `${Math.max(8, Math.min(top - tooltip.offsetHeight - 16, area.height - tooltip.offsetHeight - 8))}px`
}
engine.onHover(showTooltip)
engine.onViewChange((range) => {
  view.centerDate = range.centerDate
  get('visible-range').textContent = `${dateLabel(range.from)} — ${dateLabel(range.to)}`
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    save('view', view)
    const url = new URL(location.href)
    url.searchParams.set('unit', view.unit)
    url.searchParams.set('at', view.centerDate)
    try { history.replaceState(null, '', url) } catch { /* The view still works when history is restricted. */ }
  }, 180)
})
window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search)
  const unit = params.get('unit'), at = params.get('at')
  if (isUnit(unit)) { view.unit = unit; engine.setUnit(unit); updateUnits() }
  if (isDate(at)) engine.scrollToDate(at, false)
})
const eventDialog = get<HTMLDialogElement>('event-dialog')
get('create-event').addEventListener('click', () => {
  get<HTMLFormElement>('event-form').reset()
  get<HTMLInputElement>('event-start').value = formatISO(new Date())
  get<HTMLInputElement>('event-end').value = formatISO(new Date())
  get('form-error').textContent = ''
  eventDialog.showModal()
  get('event-name').focus()
})
get('cancel-event').addEventListener('click', () => eventDialog.close())
get<HTMLFormElement>('event-form').addEventListener('submit', (e) => {
  e.preventDefault()
  const data = new FormData(e.currentTarget as HTMLFormElement)
  const start = String(data.get('start')), end = String(data.get('end'))
  const event: TimelineEvent = {
    id: `custom-${crypto.randomUUID()}`,
    name: String(data.get('name')).trim(), start, end,
    color: String(data.get('color')), category: 'personal',
  }
  if (!isEvent(event)) {
    get('form-error').textContent = 'Enter a name and valid dates. The end must be on or after the start.'
    return
  }
  custom.push(event)
  addEvent(event)
  eventDialog.close()
})
const helpDialog = get<HTMLDialogElement>('help-dialog')
get('help-button').addEventListener('click', () => helpDialog.showModal())
get('close-help').addEventListener('click', () => helpDialog.close())
applyPanel(view.panelOpen && mobile.matches)
updateUnits()
syncEvents()
fetch(`${import.meta.env.BASE_URL}library.json`)
  .then((response) => { if (!response.ok) throw new Error('Library unavailable'); return response.json() as Promise<unknown> })
  .then((data) => {
    if (!Array.isArray(data)) throw new Error('Invalid library')
    library = data.filter(isEvent).filter((event) => typeof event.source === 'string' && /^https?:\/\//.test(event.source))
    active = active.filter((item) => eventById(item.eventId))
    syncEvents()
  })
  .catch(() => {
    renderLibrary()
    get('library-message').hidden = false
    get('library-message').textContent = 'The library could not load. Refresh to try again. Your custom events still work.'
  })
window.addEventListener('pagehide', () => { save('view', view); save('active', active); save('custom', custom) })
