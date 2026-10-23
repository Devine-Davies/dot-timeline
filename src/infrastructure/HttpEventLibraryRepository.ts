import type { EventLibraryRepository } from '../application/ports.ts'
import { isTimelineEvent } from '../domain/events.ts'
import type { TimelineEvent } from '../domain/timeline.ts'

export class HttpEventLibraryRepository implements EventLibraryRepository {
  private url: string
  private request: typeof fetch

  constructor(url: string, request: typeof fetch) {
    this.url = url
    this.request = request
  }

  async load(): Promise<TimelineEvent[]> {
    const response = await this.request(this.url)
    if (!response.ok) throw new Error(`Library unavailable (HTTP ${response.status})`)
    const data: unknown = await response.json()
    if (!Array.isArray(data)) throw new Error('Invalid event library')
    const events: TimelineEvent[] = []
    const ids = new Set<string>()
    for (const value of data) {
      if (!isTimelineEvent(value) || !value.source || !/^https?:\/\//.test(value.source) || ids.has(value.id)) {
        throw new Error('Invalid or duplicate library event')
      }
      ids.add(value.id)
      events.push(value)
    }
    return events
  }
}
