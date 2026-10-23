import { UNIT_SPECS, type Unit } from './types'
export { UNIT_SPECS } from './types'

export const DAY = 86_400_000
export const MIN_TIME = -8_640_000_000_000_000
export const MAX_TIME = 8_640_000_000_000_000

export function clampTime(time: number): number {
  if (Number.isNaN(time)) throw new RangeError('Invalid date')
  return Math.max(MIN_TIME, Math.min(MAX_TIME, time))
}

/** Accepts ISO calendar dates or UTC timestamps, including astronomical year zero. */
export function parseDate(value: string): Date {
  const match = /^(\d{4}|[+-]\d{6})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z)?$/.exec(value)
  if (!match || match[1] === '-000000') throw new RangeError(`Invalid ISO date: ${value}`)
  const [, year, month, day, hour, minute, second, fraction] = match
  const values = [+year, +month - 1, +day, +(hour ?? 0), +(minute ?? 0), +(second ?? 0)]
  const date = new Date(0)
  date.setUTCFullYear(values[0], values[1], values[2])
  date.setUTCHours(values[3], values[4], values[5], +(fraction ?? '').padEnd(3, '0'))
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== values[0] || date.getUTCMonth() !== values[1] ||
    date.getUTCDate() !== values[2] || date.getUTCHours() !== values[3] ||
    date.getUTCMinutes() !== values[4] || date.getUTCSeconds() !== values[5]
  ) throw new RangeError(`Invalid ISO date: ${value}`)
  return date
}

/** Date-only ISO, with signed six-digit years outside 0000–9999. */
export function formatISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

function spec(unit: Unit) {
  const result = UNIT_SPECS.find((entry) => entry.id === unit)
  if (!result) throw new RangeError(`Unknown timeline unit: ${unit}`)
  return result
}

/** The current period is index zero; fortnights retain an epoch-stable parity. */
export function unitAnchor(unit: Unit, reference = new Date()): Date {
  if (!Number.isFinite(reference.getTime())) throw new RangeError('Invalid anchor')
  if (unit === '1w' || unit === '2w') {
    const midnight = Math.floor(reference.getTime() / DAY) * DAY
    const monday = midnight - ((reference.getUTCDay() + 6) % 7) * DAY
    const epoch = 4 * DAY
    return new Date(clampTime(unit === '2w' ? epoch + Math.floor((monday - epoch) / (14 * DAY)) * 14 * DAY : monday))
  }
  const year = reference.getUTCFullYear()
  return calendarDate(unit === '5y' ? Math.floor(year / 5) * 5 : year, unit === '1m' ? reference.getUTCMonth() : 0)
}

function anchorParts(unit: Unit, anchor?: Date) {
  const date = anchor ?? unitAnchor(unit)
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid anchor')
  const midnight = Math.floor(date.getTime() / DAY) * DAY
  return {
    monday: midnight - ((date.getUTCDay() + 6) % 7) * DAY,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
  }
}

function calendarDate(year: number, month: number): Date {
  year += Math.floor(month / 12)
  month = ((month % 12) + 12) % 12
  const date = new Date(0)
  date.setUTCFullYear(year, month, 1)
  date.setUTCHours(0, 0, 0, 0)
  if (Number.isFinite(date.getTime())) return date
  return new Date(year < 0 ? MIN_TIME : MAX_TIME)
}

/** Index zero begins at the supplied anchor, or the period containing today. */
export function dotStart(index: number, unit: Unit, anchor?: Date): Date {
  if (!Number.isFinite(index)) throw new RangeError('Invalid dot index')
  const { kind, step } = spec(unit)
  const origin = anchorParts(unit, anchor)
  index = Math.floor(index)
  if (kind === 'days') return new Date(clampTime(origin.monday + index * step * DAY))
  return calendarDate(origin.year, origin.month + index * step)
}

/** Inclusive final UTC calendar day of a dot. */
export function dotEnd(index: number, unit: Unit, anchor?: Date): Date {
  const next = dotStart(Math.floor(index) + 1, unit, anchor).getTime()
  const start = dotStart(index, unit, anchor).getTime()
  if (next === MAX_TIME) return new Date(MAX_TIME)
  return new Date(clampTime(Math.max(start, next - DAY)))
}

export function indexForDate(value: string, unit: Unit, anchor?: Date): number {
  const date = parseDate(value)
  const { kind, step } = spec(unit)
  const origin = anchorParts(unit, anchor)
  if (kind === 'days') return Math.floor((date.getTime() - origin.monday) / (step * DAY))
  return Math.floor(((date.getUTCFullYear() - origin.year) * 12 + date.getUTCMonth() - origin.month) / step)
}

const yearFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', timeZone: 'UTC' })
const ancientYearFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', era: 'short', timeZone: 'UTC' })
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
})
const ancientDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'short', year: 'numeric', era: 'short', timeZone: 'UTC',
})
const monthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' })
const ancientMonthFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric', era: 'short', timeZone: 'UTC' })

export function displayMonthYear(date: Date): string {
  return (date.getUTCFullYear() <= 0 ? ancientMonthFormatter : monthFormatter).format(date)
}

export function displayDate(date: Date, yearOnly = false): string {
  const ancient = date.getUTCFullYear() <= 0
  return (yearOnly
    ? ancient ? ancientYearFormatter : yearFormatter
    : ancient ? ancientDateFormatter : dateFormatter).format(date)
}
