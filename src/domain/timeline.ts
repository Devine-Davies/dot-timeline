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

export interface ViewState {
  unit: Unit
  centerDate: string
  panelOpen: boolean
}

export const CATEGORIES = ['sport', 'seasons', 'finance', 'history', 'personal'] as const

export const UNIT_SPECS: ReadonlyArray<{
  id: Unit
  label: string
  perRow: number
  kind: 'days' | 'months'
  step: number
}> = [
  { id: '1w', label: '1 week', perRow: 52, kind: 'days', step: 7 },
  { id: '2w', label: '2 weeks', perRow: 26, kind: 'days', step: 14 },
  { id: '1m', label: '1 month', perRow: 12, kind: 'months', step: 1 },
  { id: '1y', label: '1 year', perRow: 10, kind: 'months', step: 12 },
  { id: '5y', label: '5 years', perRow: 20, kind: 'months', step: 60 },
]
