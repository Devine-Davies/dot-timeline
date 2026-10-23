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
  panelOpen: typeof storedView?.panelOpen === 'boolean' ? storedView.panelOpen : false,
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

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <aside id="panel" aria-labelledby="panel-title" hidden>
    <div class="panel-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h2 id="panel-title">Your timeline</h2></div>
      <button id="close-panel" class="icon-button" aria-label="Close event panel">×</button></div>
    <p class="panel-intro">A little history. A little of your own.</p>
    <label class="search-box"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Search the event library" aria-label="Search the event library"></label>
    <div id="categories" class="chips" role="group" aria-label="Filter by category"></div>
    <section class="active-section" aria-labelledby="active-title">
      <div class="section-heading"><h3 id="active-title">On your timeline <span id="active-count">0</span></h3><span class="subtle">TOP COLOUR WINS</span></div>
      <ol id="active-list" class="event-list"></ol>
      <p id="active-empty" class="empty">Your story starts here.<br>Add an event below or make your own.</p>
    </section>
    <section aria-labelledby="library-title"><div class="section-heading"><h3 id="library-title">Explore the library</h3><span id="result-count" class="subtle"></span></div>
      <div id="library-list" class="event-list"></div><p id="library-message" class="empty">Loading the library…</p>
    </section>
    <div class="panel-footer"><button id="create-event" class="primary-button"><span aria-hidden="true">＋</span> Create custom event</button><p>Saved on this device. No account needed.</p></div>
  </aside>
  <div id="backdrop" hidden></div>
  <main id="timeline-area">
    <header class="masthead"><div><a class="wordmark" href="./" aria-label="Dot Timeline home"><span class="brand-dot"></span>dot timeline<span class="wordmark-period">.</span></a><p>A little perspective on a lot of time.</p></div>
      <button id="help-button" class="icon-button help-button" aria-label="How to use Dot Timeline">?</button></header>
    <div class="view-caption"><span class="eyebrow">THE BIG PICTURE</span><h1>Make time tangible.</h1><p id="scale-caption"></p></div>
    <canvas id="timeline" aria-describedby="canvas-help"></canvas>
    <p id="canvas-help" class="sr-only">Scroll up into the past and down into the future. Use arrow keys or Page Up and Page Down to navigate, and Home to return to today. Press Enter or Space to inspect the centre dot and Escape to dismiss its tooltip. Open Events to add date ranges.</p>
    <div class="edge-fade top-fade"></div><div class="edge-fade bottom-fade"></div>
    <div id="tooltip" role="tooltip" hidden></div>
    <div class="timeline-footer"><span id="visible-range"></span><span>SCROLL TO EXPLORE <span aria-hidden="true">↕</span></span></div>
    <nav class="nav-pill" aria-label="Timeline controls">
      <button id="panel-toggle" class="panel-toggle" aria-controls="panel" aria-expanded="false"><span aria-hidden="true">☷</span><span>Events</span><span id="nav-event-count" class="count-badge">0</span></button>
      <span class="nav-divider"></span><div id="units" role="group" aria-label="Time per dot"></div><span class="nav-divider"></span>
      <button id="today-button"><span class="today-icon" aria-hidden="true"></span>Today</button>
    </nav>
  </main>
  <div id="status" class="sr-only" role="status" aria-live="polite"></div>
  <dialog id="event-dialog" aria-labelledby="event-dialog-title">
    <form id="event-form"><div class="dialog-heading"><div><span class="eyebrow">A MOMENT THAT MATTERS</span><h2 id="event-dialog-title">Add your own event</h2></div><button type="button" class="icon-button" id="cancel-event" aria-label="Close custom event form">×</button></div>
      <p>A chapter of your life, a project, or something worth remembering.</p>
      <label>Event name<input name="name" id="event-name" required maxlength="120" placeholder="e.g. My university years" autocomplete="off"></label>
      <div class="date-fields"><label>Start date<input name="start" id="event-start" type="date" required></label><label>End date<input name="end" id="event-end" type="date" required></label></div>
      <label class="color-field">Event colour<input name="color" type="color" value="#237b64"></label>
      <p id="form-error" class="form-error" role="alert"></p>
      <button type="submit" class="primary-button">Add to my timeline <span aria-hidden="true">↗</span></button>
    </form>
  </dialog>
  <dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-heading"><h2 id="help-title">One dot. A little time.</h2><button id="close-help" class="icon-button" aria-label="Close help">×</button></div>
    <p>Zoom out to see the bigger picture. Put your own life alongside the moments that shaped the world.</p>
    <dl class="help-list"><dt>Move through time</dt><dd>Scroll or drag the grid. On the grid, use ↑ / ↓, ← / → or Page Up / Down.</dd><dt>Find your way back</dt><dd>Press Home on the grid, or choose Today.</dd><dt>Explore a dot</dt><dd>Hover with a mouse or tap on a touch screen. With the grid focused, press Enter or Space to inspect the centre dot; Escape dismisses the tooltip.</dd><dt>Make it personal</dt><dd>Open Events. Add, hide, recolour, or reorder events. The highest event in your list colours overlapping dots. Use the arrow buttons to reorder without dragging.</dd><dt>Keep a view</dt><dd>The address bar follows your view. Bookmark or copy it to keep a place in time. Your events stay on this device.</dd></dl>
    <p class="subtle">Weeks start on Monday. All date calculations use UTC.</p>
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
    row.className = `active-event${item.visible ? '' : ' is-hidden'}`
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
    heading.className = 'event-topline'
    const swatch = document.createElement('input')
    swatch.type = 'color'
    swatch.value = item.color
    swatch.className = 'event-color'
    swatch.setAttribute('aria-label', `Colour for ${event.name}`)
    swatch.addEventListener('input', () => {
      item.color = swatch.value
      engine.setEvents(active.flatMap((entry) => {
        const source = eventById(entry.eventId)
        return entry.visible && source ? [{ ...source, color: entry.color, order: entry.order }] : []
      }))
      save('active', active)
    })
    const title = button(event.name, 'event-name', () => engine.scrollToDate(event.start, true))
    title.title = `Go to ${event.name}`
    const visibility = button(item.visible ? '◉' : '○', 'icon-button visibility-button', () => {
      item.visible = !item.visible
      syncEvents()
      list.querySelectorAll<HTMLButtonElement>('.visibility-button')[index]?.focus()
    })
    visibility.setAttribute('aria-label', `${item.visible ? 'Hide' : 'Show'} ${event.name}`)
    visibility.setAttribute('aria-pressed', `${item.visible}`)
    heading.append(swatch, title, visibility)
    const dates = document.createElement('p')
    dates.className = 'event-dates'
    dates.textContent = `${dateLabel(event.start)} — ${dateLabel(event.end)}`
    const actions = document.createElement('div')
    actions.className = 'event-actions'
    const up = button('↑', 'icon-button reorder', () => reorder(item.eventId, -1))
    up.setAttribute('aria-label', `Move ${event.name} up`)
    up.disabled = index === 0
    const down = button('↓', 'icon-button reorder', () => reorder(item.eventId, 1))
    down.setAttribute('aria-label', `Move ${event.name} down`)
    down.disabled = index === active.length - 1
    const remove = button('Remove', 'text-button remove-button', () => {
      active = active.filter((entry) => entry.eventId !== item.eventId)
      syncEvents()
      announce(`${event.name} removed. You can add it again from the library.`)
      const next = list.querySelector<HTMLButtonElement>('.event-name')
      ;(next ?? get('create-event')).focus()
    })
    actions.append(up, down, remove)
    row.append(heading, dates, actions)
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
    row.className = 'library-event'
    const mark = document.createElement('span')
    mark.className = 'library-swatch'
    mark.style.backgroundColor = event.color
    const info = document.createElement('div')
    const title = document.createElement('h4')
    title.textContent = event.name
    const dates = document.createElement('p')
    dates.className = 'event-dates'
    dates.textContent = `${dateLabel(event.start)} — ${dateLabel(event.end)}`
    info.append(title, dates)
    if (event.source && /^https?:\/\//.test(event.source)) {
      const source = document.createElement('a')
      source.href = event.source
      source.target = '_blank'
      source.rel = 'noopener noreferrer'
      source.className = 'source-link'
      source.textContent = `${event.category} · source ↗`
      source.setAttribute('aria-label', `Date source for ${event.name} (opens in a new tab)`)
      info.append(source)
    } else {
      const personal = document.createElement('span')
      personal.className = 'source-link'
      personal.textContent = 'personal · only on this device'
      info.append(personal)
    }
    const added = active.some((item) => item.eventId === event.id)
    const add = button(added ? '✓' : '+', 'add-button', () => {
      addEvent(event)
      announce(`${event.name} added to your timeline.`)
      get('active-list').querySelectorAll<HTMLButtonElement>('.event-name')[active.length - 1]?.focus()
    })
    add.disabled = added
    add.setAttribute('aria-label', `${added ? 'Added' : 'Add'} ${event.name}`)
    row.append(mark, info, add)
    if (event.category === 'personal') {
      const remove = button('Delete custom event', 'text-button delete-custom', () => {
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
  const chip = button(value === 'all' ? 'Everything' : value[0]!.toUpperCase() + value.slice(1), 'chip', () => {
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
  const spec = UNIT_SPECS.find((unit) => unit.id === view.unit)!
  get('scale-caption').textContent = `One dot, ${spec.label.toLowerCase()}. One row, ${view.unit === '5y' ? 'a century' : view.unit === '1y' ? 'a decade' : view.unit.includes('w') ? 'about a year' : 'a year'}.`
}
for (const spec of UNIT_SPECS) {
  const control = button(spec.label, 'unit-button', () => {
    view.unit = spec.id
    engine.setUnit(spec.id)
    updateUnits()
    hideTooltip()
  })
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
