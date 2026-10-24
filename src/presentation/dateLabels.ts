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
