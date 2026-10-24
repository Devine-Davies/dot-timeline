import './style.css'
import { mount, unmount } from 'svelte'
import { writable } from 'svelte/store'
import { TimelineApplication } from './application/TimelineApplication.ts'
import { formatISO } from './domain/dates.ts'
import { BrowserViewLocation } from './infrastructure/BrowserViewLocation.ts'
import { HttpEventLibraryRepository } from './infrastructure/HttpEventLibraryRepository.ts'
import { LocalStorageTimelineRepository } from './infrastructure/LocalStorageTimelineRepository.ts'
import { DotTimeline } from './presentation/canvas/DotTimeline.ts'
import type { CreateTimelineRenderer } from './presentation/canvas/TimelineRenderer.ts'
import App from './presentation/App.svelte'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Missing application root')

const notifications = writable('')
const report = (message: string): void => {
  console.warn(message)
  notifications.set(message)
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

const createRenderer: CreateTimelineRenderer = (canvas, unit) => new DotTimeline(canvas, { unit, events: [] })
const app = mount(App, {
  target: root,
  props: {
    application,
    notifications,
    createRenderer,
  },
})
if (import.meta.hot) import.meta.hot.dispose(() => { void unmount(app) })
