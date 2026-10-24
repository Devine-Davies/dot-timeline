import type { ActiveEvent, TimelineEvent } from '../domain/timeline.ts'

export interface ActiveEventEntry {
  selection: Readonly<ActiveEvent>
  event: TimelineEvent
}

export interface EventActions {
  add(event: TimelineEvent): void
  remove(event: TimelineEvent): void
  deleteCustom(event: TimelineEvent): void
  recolor(id: string, color: string): void
  toggle(id: string): void
  reorder(id: string, offset: number): boolean
  goTo(date: string): void
}
