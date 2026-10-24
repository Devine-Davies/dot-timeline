import type { ActiveEvent, EventGroup, TimelineEvent, ViewState } from '../domain/timeline.ts'

export interface StoredTimeline {
  active: ActiveEvent[]
  custom: TimelineEvent[]
  view: Partial<ViewState>
  groups: EventGroup[]
  activeGroupId: string | null
}

export interface TimelineRepository {
  load(): StoredTimeline
  saveEvents(active: readonly ActiveEvent[], custom: readonly TimelineEvent[]): void
  saveView(view: Readonly<ViewState>): void
  saveGroups(groups: readonly EventGroup[], activeGroupId: string | null): void
}

export interface EventLibraryRepository {
  load(): Promise<TimelineEvent[]>
}

export interface ViewLocation {
  read(): { unit: string | null; centerDate: string | null; zoom?: number | null }
  write(view: Readonly<ViewState>): void
}
