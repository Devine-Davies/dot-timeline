import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAY, MAX_TIME, MIN_TIME, dotEnd, dotStart, formatISO, indexForDate, parseDate, unitAnchor } from '../src/domain/dates.ts'
import { isActiveEvent, isColor, isDate, isTimelineEvent, normalizeActiveEvents, resolveEvents, searchEvents } from '../src/domain/events.ts'
import { UNIT_SPECS } from '../src/domain/timeline.ts'
import { groupChangeCount, isEventGroup } from '../src/domain/eventGroups.ts'

const event = (id, overrides = {}) => ({
  id, name: id, start: '2026-01-01', end: '2026-12-31', color: '#123456', category: 'history', ...overrides,
})
const active = (eventId, order, overrides = {}) => ({ eventId, order, color: '#abcdef', visible: true, ...overrides })

test('dates validate real UTC calendar days, leap years, and astronomical years', () => {
  for (const date of ['2024-02-29', '0000-02-29', '-000001-12-31', '+010000-01-01']) {
    assert.equal(isDate(date), true, date)
    assert.equal(formatISO(parseDate(date)), date)
  }
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '-000000-01-01', '', '2026-01-01T00:00:00Z', null]) {
    assert.equal(isDate(date), false, String(date))
  }
  assert.equal(parseDate('2026-01-01T12:30:20.12Z').toISOString(), '2026-01-01T12:30:20.120Z')
  assert.throws(() => parseDate('2026-01-01T24:00:00Z'), RangeError)
})

test('weeks begin on Monday and fortnights retain their fixed epoch', () => {
  assert.equal(formatISO(unitAnchor('1w', parseDate('2026-10-25'))), '2026-10-19')
  assert.equal(formatISO(unitAnchor('2w', parseDate('1970-01-04'))), '1969-12-22')
  assert.equal(formatISO(unitAnchor('2w', parseDate('1970-01-18'))), '1970-01-05')
  assert.equal(formatISO(unitAnchor('2w', parseDate('1970-01-19'))), '1970-01-19')
})

test('month and year spans use calendar arithmetic and inclusive end dates', () => {
  const anchor = parseDate('2024-01-01')
  assert.equal(formatISO(dotStart(1, '1m', anchor)), '2024-02-01')
  assert.equal(formatISO(dotEnd(1, '1m', anchor)), '2024-02-29')
  assert.equal(formatISO(dotStart(-1, '1m', anchor)), '2023-12-01')
  assert.equal(formatISO(dotEnd(0, '1y', anchor)), '2024-12-31')
  assert.equal(formatISO(unitAnchor('5y', parseDate('-000001-06-01'))), '-000005-01-01')
})

test('index/date round trips work in the past and future at every scale', () => {
  for (const { id } of UNIT_SPECS) {
    const anchor = unitAnchor(id, parseDate('2026-10-23'))
    for (const index of [-1000, -1, 0, 1, 1000]) {
      assert.equal(indexForDate(formatISO(dotStart(index, id, anchor)), id, anchor), index)
      assert.equal(indexForDate(formatISO(dotEnd(index, id, anchor)), id, anchor), index)
    }
  }
})

test('date navigation is bounded by the Date range and rejects invalid inputs', () => {
  for (const { id } of UNIT_SPECS) {
    assert.equal(dotStart(-1e12, id).getTime(), MIN_TIME)
    assert.equal(dotStart(1e12, id).getTime(), MAX_TIME)
    assert.equal(dotEnd(1e12, id).getTime(), MAX_TIME)
  }
  assert.equal(dotEnd(0, '1w', parseDate('2026-01-05')).getTime() - parseDate('2026-01-05').getTime(), 6 * DAY)
  assert.throws(() => dotStart(NaN, '1w'), RangeError)
  assert.throws(() => dotStart(0, 'invalid'), RangeError)
})

test('event validation rejects malformed ranges, names, categories, and colours', () => {
  assert.equal(isTimelineEvent(event('valid')), true)
  for (const invalid of [
    null, event(''), event('bad', { name: ' ' }), event('bad', { name: 'x'.repeat(121) }),
    event('bad', { start: '2027-01-01' }), event('bad', { color: 'red' }),
    event('bad', { category: 'other' }), event('bad', { source: 3 }),
  ]) assert.equal(isTimelineEvent(invalid), false)
  assert.equal(isColor('#ABCdef'), true)
  assert.equal(isActiveEvent(active('one', Infinity)), false)
  assert.equal(isActiveEvent(active('one', 0, { visible: 'true' })), false)
})

test('active event normalization keeps the first priority per ID and contiguous order', () => {
  const input = [active('two', 4), active('one', -1), active('two', 2)]
  assert.deepEqual(normalizeActiveEvents(input), [active('one', 0), active('two', 1)])
  assert.equal(input[0].order, 4)
})

test('resolution honours visibility, colour overrides, custom precedence, and priority', () => {
  const resolved = resolveEvents([
    active('later', 1), active('first', 0), active('hidden', 2, { visible: false }), active('missing', 3),
  ], [event('first'), event('later'), event('hidden'), event('first', { name: 'Custom replacement' })])
  assert.deepEqual(resolved.map((item) => item.id), ['first', 'later'])
  assert.equal(resolved[0].name, 'Custom replacement')
  assert.equal(resolved[0].color, '#abcdef')
})

test('library queries combine case-insensitive search, categories, and historical sorting', () => {
  const events = [
    event('recent', { name: 'Roman study', category: 'personal' }),
    event('ancient', { name: 'Roman Empire', start: '-000026-01-01', end: '0476-09-04' }),
    event('other', { name: 'Something else' }),
  ]
  assert.deepEqual(searchEvents(events, 'all', 'ROMAN').map((item) => item.id), ['ancient', 'recent'])
  assert.deepEqual(searchEvents(events, 'history', 'roman').map((item) => item.id), ['ancient'])
  assert.deepEqual(events.map((item) => item.id), ['recent', 'ancient', 'other'])
})

test('group changes compare content and relative order rather than shifted indices or colour case', () => {
  const saved = [active('one', 0), active('two', 1), active('three', 2)]
  assert.equal(groupChangeCount(saved, [active('two', 0), active('three', 1)]), 1)
  assert.equal(groupChangeCount(saved, [active('new', 0), ...saved.map((item) => ({ ...item, order: item.order + 1 }))]), 1)
  assert.equal(groupChangeCount(saved, [active('two', 0), active('one', 1), active('three', 2)]), 1)
  assert.equal(groupChangeCount(saved, saved.map((item) => ({ ...item, color: '#ABCDEF' }))), 0)
  assert.equal(groupChangeCount(saved, [active('two', 0, { color: '#000000' }), active('one', 1)]), 3)
})

test('saved groups validate nested selections and personal snapshots', () => {
  const custom = event('personal', { category: 'personal' })
  const group = { id: 'group', name: 'Personal', savedAt: '2026-10-23', events: [active(custom.id, 0)], custom: [custom] }
  assert.equal(isEventGroup(group), true)
  assert.equal(isEventGroup({ ...group, custom: [custom, custom] }), false)
  assert.equal(isEventGroup({ ...group, custom: [event('personal')] }), false)
  assert.equal(isEventGroup({ ...group, events: [active('other', 0)] }), false)
})
