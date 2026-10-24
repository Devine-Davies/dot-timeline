import { isColor, isDate, isTimelineEvent, isUnit, normalizeActiveEvents, resolveEvents, searchEvents } from '../domain/events.ts'
import { copyGroup, groupChangeCount, isGroupName } from '../domain/eventGroups.ts'
import type { ActiveEvent, EventGroup, TimelineEvent, Unit, ViewState } from '../domain/timeline.ts'
import type { EventLibraryRepository, TimelineRepository, ViewLocation } from './ports.ts'

interface Dependencies {
  repository: TimelineRepository
  library: EventLibraryRepository
  location: ViewLocation
  today: () => string
  createId: () => string
  defaultPanelOpen: boolean
}

export class InvalidCustomEventError extends Error {
  constructor() {
    super('Enter a name and valid dates. The end must be on or after the start.')
    this.name = 'InvalidCustomEventError'
  }
}

export class InvalidGroupNameError extends Error {
  constructor() {
    super('Enter a group name of 1 to 120 characters.')
    this.name = 'InvalidGroupNameError'
  }
}

export class UnsavedGroupChangesError extends Error {
  constructor() {
    super('Save or discard changes before switching groups.')
    this.name = 'UnsavedGroupChangesError'
  }
}

export class TimelineApplication {
  private activeEvents: ActiveEvent[]
  private customEvents: TimelineEvent[]
  private libraryEvents: TimelineEvent[] = []
  private viewState: ViewState
  private eventGroups: EventGroup[]
  private activeGroupId: string | null
  private dependencies: Dependencies

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies
    const stored = dependencies.repository.load()
    const query = dependencies.location.read()
    const unit = query.unit ?? stored.view.unit
    const centerDate = query.centerDate ?? stored.view.centerDate
    this.activeEvents = normalizeActiveEvents(stored.active)
    this.customEvents = stored.custom.map((event) => ({ ...event }))
    this.eventGroups = stored.groups.map(copyGroup)
    this.activeGroupId = stored.activeGroupId
    this.viewState = {
      unit: isUnit(unit) ? unit : '1w',
      centerDate: isDate(centerDate) ? centerDate : dependencies.today(),
      panelOpen: stored.view.panelOpen ?? dependencies.defaultPanelOpen,
    }
  }

  get active(): readonly Readonly<ActiveEvent>[] { return this.activeEvents }
  get view(): Readonly<ViewState> { return this.viewState }
  get groups(): EventGroup[] { return this.eventGroups.map(copyGroup) }
  get activeGroup(): EventGroup | undefined {
    const group = this.eventGroups.find((item) => item.id === this.activeGroupId)
    return group ? copyGroup(group) : undefined
  }
  get groupChanges(): number {
    const group = this.activeGroup
    return group ? groupChangeCount(group.events, this.activeEvents) : 0
  }

  saveGroup(name: string, makeActive = true): EventGroup {
    this.validateGroupName(name)
    if (!this.activeEvents.length) throw new RangeError('Add an event before saving a group.')
    const group: EventGroup = {
      id: this.dependencies.createId(), name: name.trim(), savedAt: this.dependencies.today(),
      events: this.activeEvents.map((event) => ({ ...event })), custom: this.groupCustomEvents(),
    }
    this.eventGroups = [...this.eventGroups, group]
    if (makeActive) this.activeGroupId = group.id
    this.saveGroups()
    return copyGroup(group)
  }

  updateGroup(): void {
    const group = this.requireActiveGroup()
    this.eventGroups = this.eventGroups.map((item) => item.id === group.id ? {
      ...item, savedAt: this.dependencies.today(), events: this.activeEvents.map((event) => ({ ...event })),
      custom: this.groupCustomEvents(),
    } : item)
    this.saveGroups()
  }

  renameGroup(name: string): void {
    this.validateGroupName(name)
    const group = this.requireActiveGroup()
    this.eventGroups = this.eventGroups.map((item) => item.id === group.id ? { ...item, name: name.trim() } : item)
    this.saveGroups()
  }

  selectGroup(id: string, changes?: 'save' | 'discard'): void {
    const group = this.eventGroups.find((item) => item.id === id)
    if (!group) throw new RangeError(`Unknown event group: ${id}`)
    if (id === this.activeGroupId) return
    if (this.groupChanges) {
      if (!changes) throw new UnsavedGroupChangesError()
      if (changes === 'save') this.updateGroup()
    }
    this.activeGroupId = id
    this.restoreGroup(group)
  }

  discardGroupChanges(): void { this.restoreGroup(this.requireActiveGroup()) }

  leaveGroup(): void {
    this.requireActiveGroup()
    this.activeGroupId = null
    this.saveGroups()
  }

  deleteGroup(): void {
    const group = this.requireActiveGroup()
    this.eventGroups = this.eventGroups.filter((item) => item.id !== group.id)
    this.activeGroupId = null
    this.saveGroups()
  }

  eventById(id: string): TimelineEvent | undefined {
    const event = this.customEvents.find((item) => item.id === id) ??
      this.libraryEvents.find((item) => item.id === id)
    return event ? { ...event } : undefined
  }

  resolvedEvents() {
    return resolveEvents(this.activeEvents, [...this.libraryEvents, ...this.customEvents])
  }

  searchEvents(category: string, query: string): TimelineEvent[] {
    return searchEvents([...this.libraryEvents, ...this.customEvents], category, query)
      .map((event) => ({ ...event }))
  }

  async loadLibrary(): Promise<void> {
    this.libraryEvents = (await this.dependencies.library.load()).map((event) => ({ ...event }))
    this.activeEvents = this.activeEvents.filter((item) => this.eventById(item.eventId))
    this.saveEvents()
  }

  addEvent(id: string): void {
    const event = this.eventById(id)
    if (!event) throw new RangeError(`Unknown event: ${id}`)
    if (this.activeEvents.some((item) => item.eventId === id)) return
    this.activeEvents = [...this.activeEvents, {
      eventId: id, color: event.color, visible: true, order: this.activeEvents.length,
    }]
    this.saveEvents()
  }

  createCustomEvent(input: Pick<TimelineEvent, 'name' | 'start' | 'end' | 'color'>): TimelineEvent {
    const event = { ...input, id: this.dependencies.createId(), name: input.name.trim(), category: 'personal' as const }
    if (!isTimelineEvent(event)) throw new InvalidCustomEventError()
    this.customEvents = [...this.customEvents, event]
    this.addEvent(event.id)
    return { ...event }
  }

  setEventColor(id: string, color: string): void {
    if (!isColor(color)) throw new RangeError(`Invalid event color: ${color}`)
    this.updateEvent(id, { color })
  }

  toggleEventVisibility(id: string): void {
    this.updateEvent(id, { visible: !this.requireActiveEvent(id).visible })
  }

  removeEvent(id: string): void {
    this.requireActiveEvent(id)
    this.activeEvents = this.activeEvents.filter((event) => event.eventId !== id)
    this.saveEvents()
  }

  deleteCustomEvent(id: string): void {
    if (!this.customEvents.some((event) => event.id === id)) throw new RangeError(`Unknown custom event: ${id}`)
    this.customEvents = this.customEvents.filter((event) => event.id !== id)
    this.activeEvents = this.activeEvents.filter((event) => event.eventId !== id)
    this.saveEvents()
  }

  reorderEvent(id: string, offset: number): boolean {
    if (!Number.isInteger(offset)) throw new RangeError('Event offset must be an integer')
    this.requireActiveEvent(id)
    const index = this.activeEvents.findIndex((event) => event.eventId === id)
    const target = index + offset
    if (target < 0 || target >= this.activeEvents.length || target === index) return false
    const next = [...this.activeEvents]
    const [event] = next.splice(index, 1)
    next.splice(target, 0, event!)
    this.activeEvents = next
    this.saveEvents()
    return true
  }

  setUnit(unit: Unit): void {
    if (!isUnit(unit)) throw new RangeError(`Unknown timeline unit: ${unit}`)
    this.viewState = { ...this.viewState, unit }
  }

  setCenterDate(centerDate: string): void {
    if (!isDate(centerDate)) throw new RangeError(`Invalid center date: ${centerDate}`)
    this.viewState = { ...this.viewState, centerDate }
  }

  setPanelOpen(panelOpen: boolean): void {
    this.viewState = { ...this.viewState, panelOpen }
    this.dependencies.repository.saveView(this.viewState)
  }

  restoreLocation(): { unit?: Unit; centerDate?: string } {
    const query = this.dependencies.location.read()
    const restored: { unit?: Unit; centerDate?: string } = {}
    if (isUnit(query.unit)) { restored.unit = query.unit; this.setUnit(query.unit) }
    if (isDate(query.centerDate)) { restored.centerDate = query.centerDate; this.setCenterDate(query.centerDate) }
    return restored
  }

  rememberView(): void {
    this.dependencies.repository.saveView(this.viewState)
    this.dependencies.location.write(this.viewState)
  }

  flush(): void {
    this.dependencies.repository.saveView(this.viewState)
    this.saveEvents()
    this.saveGroups()
  }

  private validateGroupName(name: string): void {
    if (!isGroupName(name)) throw new InvalidGroupNameError()
  }

  private requireActiveGroup(): EventGroup {
    const group = this.eventGroups.find((item) => item.id === this.activeGroupId)
    if (!group) throw new RangeError('No event group is active.')
    return group
  }

  private groupCustomEvents(): TimelineEvent[] {
    return this.customEvents.filter((event) => this.activeEvents.some((item) => item.eventId === event.id))
      .map((event) => ({ ...event }))
  }

  private restoreGroup(group: EventGroup): void {
    const missing = group.custom.filter((event) => !this.customEvents.some((item) => item.id === event.id))
    this.customEvents = [...this.customEvents, ...missing.map((event) => ({ ...event }))]
    this.activeEvents = normalizeActiveEvents(group.events)
    this.saveEvents()
    this.saveGroups()
  }

  private saveGroups(): void {
    this.dependencies.repository.saveGroups(this.eventGroups, this.activeGroupId)
  }

  private requireActiveEvent(id: string): ActiveEvent {
    const event = this.activeEvents.find((item) => item.eventId === id)
    if (!event) throw new RangeError(`Unknown active event: ${id}`)
    return event
  }

  private updateEvent(id: string, changes: Partial<Pick<ActiveEvent, 'color' | 'visible'>>): void {
    this.requireActiveEvent(id)
    this.activeEvents = this.activeEvents.map((event) => event.eventId === id ? { ...event, ...changes } : event)
    this.saveEvents()
  }

  private saveEvents(): void {
    this.activeEvents = this.activeEvents.map((event, order) => ({ ...event, order }))
    this.dependencies.repository.saveEvents(this.activeEvents, this.customEvents)
  }
}
