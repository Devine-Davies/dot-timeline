import type { StoredTimeline, TimelineRepository } from '../application/ports.ts'
import { isActiveEvent, isDate, isTimelineEvent, isUnit, normalizeActiveEvents } from '../domain/events.ts'
import type { ActiveEvent, TimelineEvent, ViewState } from '../domain/timeline.ts'

export class LocalStorageTimelineRepository implements TimelineRepository {
  private getStorage: () => Pick<Storage, 'getItem' | 'setItem'>
  private report: (message: string) => void
  private warnings = new Set<string>()

  constructor(getStorage: () => Pick<Storage, 'getItem' | 'setItem'>, report: (message: string) => void) {
    this.getStorage = getStorage
    this.report = report
  }

  load(): StoredTimeline {
    const custom = this.readList('custom', (value): value is TimelineEvent =>
      isTimelineEvent(value) && value.category === 'personal')
    const active = this.readList('active', isActiveEvent)
    const storedView = this.read('view')
    const view: Partial<ViewState> = {}
    if (storedView !== null) {
      if (typeof storedView !== 'object' || Array.isArray(storedView)) this.invalidData()
      else {
        if ('unit' in storedView) {
          if (isUnit(storedView.unit)) view.unit = storedView.unit
          else this.invalidData()
        }
        if ('centerDate' in storedView) {
          if (isDate(storedView.centerDate)) view.centerDate = storedView.centerDate
          else this.invalidData()
        }
        if ('panelOpen' in storedView) {
          if (typeof storedView.panelOpen === 'boolean') view.panelOpen = storedView.panelOpen
          else this.invalidData()
        }
      }
    }
    return { custom, active: normalizeActiveEvents(active), view }
  }

  saveEvents(active: readonly ActiveEvent[], custom: readonly TimelineEvent[]): void {
    this.write('active', active)
    this.write('custom', custom)
  }

  saveView(view: Readonly<ViewState>): void { this.write('view', view) }

  private read(key: string): unknown {
    let raw: string | null
    try { raw = this.getStorage().getItem(`dt:v1:${key}`) }
    catch { this.unavailable(); return null }
    if (raw === null) return null
    try { return JSON.parse(raw) }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      this.invalidData()
      return null
    }
  }

  private readList<T>(key: string, valid: (value: unknown) => value is T): T[] {
    const value = this.read(key)
    if (value === null) return []
    if (!Array.isArray(value)) { this.invalidData(); return [] }
    const result = value.filter(valid)
    if (result.length !== value.length) this.invalidData()
    return result
  }

  private write(key: string, value: unknown): void {
    try { this.getStorage().setItem(`dt:v1:${key}`, JSON.stringify(value)) }
    catch { this.unavailable() }
  }

  private unavailable(): void {
    this.warn('Device storage is unavailable. Changes will last for this visit only.')
  }

  private invalidData(): void {
    this.warn('Some saved timeline data is invalid and could not be restored.')
  }

  private warn(message: string): void {
    if (this.warnings.has(message)) return
    this.warnings.add(message)
    this.report(message)
  }
}
