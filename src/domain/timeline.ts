export type Unit = '1w' | '2w' | '1m' | '1y' | '5y'

export interface TimelineEvent {
  id: string
  name: string
  start: string
  end: string
  color: string
  category: 'sport' | 'seasons' | 'finance' | 'history' | 'personal'
  source?: string
}

export type ResolvedEvent = TimelineEvent & { order: number }

export interface ActiveEvent {
  eventId: string
  color: string
  visible: boolean
  order: number
}

export interface EventGroup {
  id: string
  name: string
  savedAt: string
  events: ActiveEvent[]
  custom: TimelineEvent[]
}

export interface ViewState {
  unit: Unit
  centerDate: string
  panelOpen: boolean
  zoomByUnit: Partial<Record<Unit, number>>
}

export function isZoom(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 6 && value <= 72
}

export const CATEGORIES = ['sport', 'seasons', 'finance', 'history', 'personal'] as const

export const UNIT_SPECS: ReadonlyArray<{
  id: Unit
  label: string
  perRow: number
  rowLabel: string
  kind: 'days' | 'months'
  step: number
}> = [
  { id: '1w', label: '1 week', perRow: 52, rowLabel: '~1 year', kind: 'days', step: 7 },
  { id: '2w', label: '2 weeks', perRow: 26, rowLabel: '~1 year', kind: 'days', step: 14 },
  { id: '1m', label: '1 month', perRow: 12, rowLabel: '1 year', kind: 'months', step: 1 },
  { id: '1y', label: '1 year', perRow: 10, rowLabel: '1 decade', kind: 'months', step: 12 },
  { id: '5y', label: '5 years', perRow: 20, rowLabel: '1 century', kind: 'months', step: 60 },
]
