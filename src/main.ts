import './style.css'
import { TimelineApplication } from './application/TimelineApplication.ts'
import { formatISO } from './domain/dates.ts'
import { BrowserViewLocation } from './infrastructure/BrowserViewLocation.ts'
import { HttpEventLibraryRepository } from './infrastructure/HttpEventLibraryRepository.ts'
import { LocalStorageTimelineRepository } from './infrastructure/LocalStorageTimelineRepository.ts'
import { DotTimeline } from './presentation/canvas/DotTimeline.ts'
import { mountTimeline } from './presentation/mountTimeline.ts'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Missing application root')

const pendingMessages: string[] = []
const report = (message: string): void => {
  console.warn(message)
  const status = root.querySelector<HTMLElement>('#status')
  if (status) status.textContent = message
  else pendingMessages.push(message)
}

const application = new TimelineApplication({
  repository: new LocalStorageTimelineRepository(() => window.localStorage, report),
  library: new HttpEventLibraryRepository(`${import.meta.env.BASE_URL}library.json`, window.fetch.bind(window)),
  location: new BrowserViewLocation(
    () => window.location.href,
    (url) => window.history.replaceState(null, '', url),
    report,
  ),
  today: () => formatISO(new Date()),
  createId: () => `custom-${crypto.randomUUID()}`,
  defaultPanelOpen: window.matchMedia('(min-width: 768px)').matches,
})

const destroy = mountTimeline(root, application, (canvas, unit) => new DotTimeline(canvas, { unit, events: [] }))
if (pendingMessages.length) report(pendingMessages.join(' '))
if (import.meta.hot) import.meta.hot.dispose(destroy)
