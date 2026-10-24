import type { ViewLocation } from '../application/ports.ts'
import type { ViewState } from '../domain/timeline.ts'

export class BrowserViewLocation implements ViewLocation {
  private currentUrl: () => string
  private replaceUrl: (url: URL) => void
  private report: (message: string) => void
  private warned = false

  constructor(currentUrl: () => string, replaceUrl: (url: URL) => void, report: (message: string) => void) {
    this.currentUrl = currentUrl
    this.replaceUrl = replaceUrl
    this.report = report
  }

  read(): { unit: string | null; centerDate: string | null; zoom: number | null } {
    const params = new URL(this.currentUrl()).searchParams
    const at = params.get('at')
    const centerDate = at && /^\d{4}$/.test(at) ? `${at}-01-01` : at
    return { unit: params.get('unit'), centerDate, zoom: params.has('zoom') ? Number(params.get('zoom')) : null }
  }

  write(view: Readonly<ViewState>): void {
    const url = new URL(this.currentUrl())
    url.searchParams.set('unit', view.unit)
    url.searchParams.set('at', view.centerDate)
    const zoom = view.zoomByUnit?.[view.unit]
    if (zoom !== undefined) url.searchParams.set('zoom', String(zoom))
    else url.searchParams.delete('zoom')
    try { this.replaceUrl(url) }
    catch {
      if (this.warned) return
      this.warned = true
      this.report('The address bar could not update. Your timeline still works, but this view cannot be bookmarked automatically.')
    }
  }
}
