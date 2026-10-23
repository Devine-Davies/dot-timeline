import type { ActiveEvent, TimelineEvent, ViewState } from '../domain/timeline.ts'

export interface StoredTimeline {
  active: ActiveEvent[]
  custom: TimelineEvent[]
  view: Partial<ViewState>
}

export interface TimelineRepository {
  load(): StoredTimeline
  saveEvents(active: readonly ActiveEvent[], custom: readonly TimelineEvent[]): void
  saveView(view: Readonly<ViewState>): void
}

export interface EventLibraryRepository {
  load(): Promise<TimelineEvent[]>
}

export interface ViewLocation {
  read(): { unit: string | null; centerDate: string | null }
  write(view: Readonly<ViewState>): void
}
