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

  read(): { unit: string | null; centerDate: string | null } {
    const params = new URL(this.currentUrl()).searchParams
    return { unit: params.get('unit'), centerDate: params.get('at') }
  }

  write(view: Readonly<ViewState>): void {
    const url = new URL(this.currentUrl())
    url.searchParams.set('unit', view.unit)
    url.searchParams.set('at', view.centerDate)
    try { this.replaceUrl(url) }
    catch {
      if (this.warned) return
      this.warned = true
      this.report('The address bar could not update. Your timeline still works, but this view cannot be bookmarked automatically.')
    }
  }
}
