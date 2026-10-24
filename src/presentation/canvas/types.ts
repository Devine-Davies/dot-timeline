import type { ResolvedEvent } from '../../domain/timeline.ts'

export interface DotHit {
  index: number
  start: string
  end: string
  today?: string
  events: ResolvedEvent[]
  x: number
  y: number
}

export interface ViewRange {
  from: string
  to: string
  centerDate: string
}
