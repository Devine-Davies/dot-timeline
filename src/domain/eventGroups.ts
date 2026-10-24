import { isActiveEvent, isDate, isTimelineEvent } from './events.ts'
import type { ActiveEvent, EventGroup } from './timeline.ts'

export function isGroupName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120
}

export function isEventGroup(value: unknown): value is EventGroup {
  if (!value || typeof value !== 'object') return false
  const events = 'events' in value ? value.events : undefined
  return 'id' in value && typeof value.id === 'string' && value.id.length > 0 &&
    'name' in value && isGroupName(value.name) &&
    'savedAt' in value && isDate(value.savedAt) &&
    Array.isArray(events) && events.every(isActiveEvent) &&
    new Set(events.map((event) => event.eventId)).size === events.length &&
    'custom' in value && Array.isArray(value.custom) &&
    value.custom.every((event) => isTimelineEvent(event) && event.category === 'personal') &&
    new Set(value.custom.map((event) => event.id)).size === value.custom.length &&
    value.custom.every((event) => events.some((selection: ActiveEvent) => selection.eventId === event.id))
}

export function copyGroup(group: EventGroup): EventGroup {
  return { ...group, events: group.events.map((event) => ({ ...event })), custom: group.custom.map((event) => ({ ...event })) }
}

export function groupChangeCount(saved: readonly ActiveEvent[], current: readonly ActiveEvent[]): number {
  const savedById = new Map(saved.map((event) => [event.eventId, event]))
  const currentById = new Map(current.map((event) => [event.eventId, event]))
  let changes = saved.filter((event) => !currentById.has(event.eventId)).length
  for (const event of current) {
    const original = savedById.get(event.eventId)
    if (!original || original.color.toLowerCase() !== event.color.toLowerCase() || original.visible !== event.visible) changes++
  }
  // Additions and removals shift indices, but only a different relative order is a reorder.
  const savedOrder = saved.filter((event) => currentById.has(event.eventId)).map((event) => event.eventId)
  const currentOrder = current.filter((event) => savedById.has(event.eventId)).map((event) => event.eventId)
  if (savedOrder.some((id, index) => id !== currentOrder[index])) changes++
  return changes
}
