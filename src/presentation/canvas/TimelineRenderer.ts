import type { ResolvedEvent, Unit } from '../../domain/timeline.ts'
import type { DotHit, ViewRange } from './types.ts'

export interface TimelineRenderer {
  setUnit(unit: Unit, zoom?: number): void
  setZoom(size: number): void
  fit(): void
  setEvents(events: ResolvedEvent[]): void
  scrollToDate(date: string, animate?: boolean): void
  scrollToToday(): void
  onHover(callback: (hit: DotHit | null) => void): () => void
  onViewChange(callback: (range: ViewRange) => void): () => void
  destroy(): void
}

export type CreateTimelineRenderer = (canvas: HTMLCanvasElement, unit: Unit) => TimelineRenderer
