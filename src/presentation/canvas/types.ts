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
  cellSize: number
  minCellSize: number
  maxCellSize: number
  height: number
  today: { x: number; y: number; date: string }
}
