import { parseDate } from './dates.ts'
import { CATEGORIES, UNIT_SPECS, type ActiveEvent, type ResolvedEvent, type TimelineEvent, type Unit } from './timeline.ts'

export const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
export const isUnit = (value: unknown): value is Unit => UNIT_SPECS.some((unit) => unit.id === value)

export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}$/.test(value)) return false
  try { return Number.isFinite(parseDate(value).getTime()) }
  catch (error) {
    if (error instanceof RangeError) return false
    throw error
  }
}

export function isTimelineEvent(value: unknown): value is TimelineEvent {
  if (!value || typeof value !== 'object') return false
  return 'id' in value && typeof value.id === 'string' && value.id.length > 0 &&
    'name' in value && typeof value.name === 'string' &&
    value.name.trim().length > 0 && value.name.length <= 120 &&
    'start' in value && isDate(value.start) && 'end' in value && isDate(value.end) &&
    parseDate(value.start) <= parseDate(value.end) &&
    'color' in value && isColor(value.color) &&
    'category' in value && CATEGORIES.some((category) => category === value.category) &&
    (!('source' in value) || typeof value.source === 'string')
}

export function isActiveEvent(value: unknown): value is ActiveEvent {
  return !!value && typeof value === 'object' &&
    'eventId' in value && typeof value.eventId === 'string' &&
    'color' in value && isColor(value.color) &&
    'visible' in value && typeof value.visible === 'boolean' &&
    'order' in value && typeof value.order === 'number' && Number.isFinite(value.order)
}

export function normalizeActiveEvents(events: readonly ActiveEvent[]): ActiveEvent[] {
  const seen = new Set<string>()
  return [...events].sort((a, b) => a.order - b.order).filter((event) => {
    if (seen.has(event.eventId)) return false
    seen.add(event.eventId)
    return true
  }).map((event, order) => ({ ...event, order }))
}

export function resolveEvents(active: readonly ActiveEvent[], catalogue: readonly TimelineEvent[]): ResolvedEvent[] {
  const byId = new Map(catalogue.map((event) => [event.id, event]))
  return active.flatMap((item) => {
    const event = byId.get(item.eventId)
    return item.visible && event ? [{ ...event, color: item.color, order: item.order }] : []
  }).sort((a, b) => a.order - b.order)
}

export function searchEvents(events: readonly TimelineEvent[], category: string, query: string): TimelineEvent[] {
  return events.filter((event) =>
    (category === 'all' || event.category === category) &&
    event.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  ).sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())
}
