import type { ActiveEvent, EventGroup, TimelineEvent } from '../domain/timeline.ts'

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

export interface GroupEventPreview {
  id: string
  name: string
  color: string
}

export interface GroupActions {
  save(name: string, makeActive: boolean): void
  select(id: string, changes?: 'save' | 'discard'): void
  update(): void
  rename(name: string): void
  discard(): void
  leave(): void
  delete(): void
}

export type GroupDialogRequest =
  | { kind: 'save' | 'rename' | 'delete' | 'discard' }
  | { kind: 'switch'; group: EventGroup }
