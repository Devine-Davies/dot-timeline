import assert from 'node:assert/strict'
import { test } from 'node:test'
import { InvalidCustomEventError, InvalidGroupNameError, TimelineApplication, UnsavedGroupChangesError } from '../src/application/TimelineApplication.ts'

const event = (id, overrides = {}) => ({
  id, name: id, start: '2026-01-01', end: '2026-12-31', color: '#123456', category: 'history', ...overrides,
})
const active = (eventId, order = 0) => ({ eventId, color: '#abcdef', visible: true, order })

function setup({ stored = {}, query = {}, load = async () => [event('one'), event('two'), event('three')] } = {}) {
  let saved = { active: [], custom: [], view: {}, groups: [], activeGroupId: null, ...structuredClone(stored) }
  let location = { unit: null, centerDate: null, ...query }
  const writes = []
  let id = 0
  const repository = {
    load: () => structuredClone(saved),
    saveEvents: (active, custom) => { saved = { ...saved, active: structuredClone(active), custom: structuredClone(custom) } },
    saveView: (view) => { saved = { ...saved, view: structuredClone(view) } },
    saveGroups: (groups, activeGroupId) => { saved = { ...saved, groups: structuredClone(groups), activeGroupId } },
  }
  const app = new TimelineApplication({
    repository, library: { load },
    location: { read: () => location, write: (view) => writes.push({ ...view }) },
    today: () => '2026-10-23', createId: () => `custom-${++id}`, defaultPanelOpen: true,
  })
  return { app, repository, saved: () => saved, writes, navigate: (query) => { location = query } }
}

test('startup uses injected defaults without browser dependencies', () => {
  const { app } = setup()
  assert.deepEqual(app.view, { unit: '1w', centerDate: '2026-10-23', panelOpen: true })
  assert.deepEqual(app.active, [])
})

test('valid URL state overrides saved preferences and saved panel state is preserved', () => {
  const { app } = setup({
    stored: { view: { unit: '1y', centerDate: '2000-01-01', panelOpen: false } },
    query: { unit: '5y', centerDate: '-000026-01-01' },
  })
  assert.deepEqual(app.view, { unit: '5y', centerDate: '-000026-01-01', panelOpen: false })
  const invalid = setup({ query: { unit: 'other', centerDate: '2026-02-29' } }).app
  assert.equal(invalid.view.unit, '1w')
  assert.equal(invalid.view.centerDate, '2026-10-23')
})

test('adding events is idempotent and persists their default colour and priority', async () => {
  const { app, saved } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  app.addEvent('two')
  app.addEvent('one')
  assert.deepEqual(app.active.map((item) => item.eventId), ['one', 'two'])
  assert.equal(saved().active[1].order, 1)
  assert.equal(saved().active[0].color, '#123456')
  assert.throws(() => app.addEvent('missing'), RangeError)
})

test('custom creation validates atomically, trims names, and activates the event', () => {
  const { app, saved } = setup()
  const created = app.createCustomEvent({ name: '  My chapter  ', start: '2000-01-01', end: '2001-01-01', color: '#123456' })
  assert.equal(created.name, 'My chapter')
  assert.equal(created.category, 'personal')
  assert.equal(saved().custom.length, 1)
  assert.equal(saved().active[0].eventId, created.id)
  for (const changes of [{ name: ' ' }, { start: '2026-02-29' }, { end: '1999-12-31' }, { color: 'blue' }]) {
    assert.throws(() => app.createCustomEvent({ ...created, ...changes }), InvalidCustomEventError)
  }
  assert.equal(saved().custom.length, 1)
})

test('visibility and recolouring affect resolved events without mutating the library', async () => {
  const { app, saved } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  app.setEventColor('one', '#aabbcc')
  assert.equal(app.resolvedEvents()[0].color, '#aabbcc')
  assert.equal(app.eventById('one').color, '#123456')
  app.toggleEventVisibility('one')
  assert.deepEqual(app.resolvedEvents(), [])
  assert.equal(saved().active[0].visible, false)
  app.toggleEventVisibility('one')
  assert.equal(app.resolvedEvents()[0].color, '#aabbcc')
  assert.throws(() => app.setEventColor('one', 'bad'), RangeError)
  assert.throws(() => app.toggleEventVisibility('missing'), RangeError)
})

test('drag-sized and keyboard-sized reorders change winners and persist contiguous order', async () => {
  const { app, saved } = setup()
  await app.loadLibrary()
  for (const id of ['one', 'two', 'three']) app.addEvent(id)
  assert.equal(app.reorderEvent('three', -2), true)
  assert.deepEqual(app.resolvedEvents().map((item) => item.id), ['three', 'one', 'two'])
  assert.deepEqual(saved().active.map((item) => item.order), [0, 1, 2])
  assert.equal(app.reorderEvent('three', -1), false)
  assert.equal(app.reorderEvent('three', 1), true)
  assert.deepEqual(app.active.map((item) => item.eventId), ['one', 'three', 'two'])
  assert.throws(() => app.reorderEvent('one', 0.5), RangeError)
})

test('removing an event leaves it available, deleting custom removes both records', async () => {
  const { app, saved } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  app.addEvent('two')
  app.removeEvent('one')
  assert.ok(app.searchEvents('all', '').find((item) => item.id === 'one'))
  assert.equal(saved().active[0].order, 0)
  const created = app.createCustomEvent({ name: 'Personal', start: '2026-01-01', end: '2026-01-02', color: '#123456' })
  app.deleteCustomEvent(created.id)
  assert.equal(app.eventById(created.id), undefined)
  assert.deepEqual(saved().custom, [])
  assert.equal(saved().active.length, 1)
})

test('saved library selections survive startup and only missing IDs are pruned after loading', async () => {
  const custom = event('custom-saved', { category: 'personal' })
  const { app, saved } = setup({
    stored: { active: [active('one'), active('missing', 1), active(custom.id, 2)], custom: [custom] },
  })
  assert.equal(app.active.length, 3)
  assert.deepEqual(app.resolvedEvents().map((item) => item.id), [custom.id])
  app.flush()
  assert.equal(saved().active.length, 3)
  await app.loadLibrary()
  assert.deepEqual(app.active.map((item) => item.eventId), ['one', custom.id])
  assert.deepEqual(saved().active.map((item) => item.order), [0, 1])
})

test('library failure is propagated without discarding saved selections or custom functionality', async () => {
  const { app, saved } = setup({
    stored: { active: [active('one')] },
    load: async () => { throw new Error('Offline') },
  })
  await assert.rejects(app.loadLibrary(), /Offline/)
  const custom = app.createCustomEvent({ name: 'Offline event', start: '2026-01-01', end: '2026-01-01', color: '#123456' })
  assert.deepEqual(saved().active.map((item) => item.eventId), ['one', custom.id])
  assert.equal(app.resolvedEvents()[0].id, custom.id)
})

test('events created while the library loads survive successful reconciliation', async () => {
  let complete
  const { app } = setup({ load: () => new Promise((resolve) => { complete = resolve }) })
  const loading = app.loadLibrary()
  const custom = app.createCustomEvent({ name: 'During loading', start: '2026-01-01', end: '2026-01-01', color: '#123456' })
  complete([event('one')])
  await loading
  assert.equal(app.resolvedEvents()[0].id, custom.id)
})

test('view changes, debounced persistence, navigation, and flush use the injected ports', () => {
  const { app, saved, writes, navigate } = setup()
  app.setUnit('1m')
  app.setCenterDate('2000-02-29')
  app.setPanelOpen(false)
  assert.equal(saved().view.panelOpen, false)
  app.rememberView()
  assert.deepEqual(writes[0], app.view)
  navigate({ unit: '5y', centerDate: '-000026-01-01' })
  assert.deepEqual(app.restoreLocation(), { unit: '5y', centerDate: '-000026-01-01' })
  navigate({ unit: 'invalid', centerDate: 'invalid' })
  assert.deepEqual(app.restoreLocation(), {})
  app.flush()
  assert.deepEqual(saved().view, app.view)
  assert.throws(() => app.setUnit('invalid'), RangeError)
  assert.throws(() => app.setCenterDate('2026-02-29'), RangeError)
})

test('saved state round trips, and event query results cannot mutate the catalogue', async () => {
  const { app, saved } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  app.setEventColor('one', '#abcdef')
  app.toggleEventVisibility('one')
  app.createCustomEvent({ name: 'My event', start: '2000-01-01', end: '2001-01-01', color: '#123456' })
  const second = setup({ stored: saved() }).app
  await second.loadLibrary()
  assert.deepEqual(second.active, app.active)
  const found = second.eventById('one')
  found.name = 'Changed'
  second.searchEvents('all', '')[0].name = 'Changed too'
  assert.equal(second.eventById('one').name, 'one')
})

test('saving a group snapshots order, colours, visibility and custom events, and activates by default', async () => {
  const { app, saved } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  app.addEvent('two')
  app.setEventColor('two', '#112233')
  app.toggleEventVisibility('one')
  app.reorderEvent('two', -1)
  const custom = app.createCustomEvent({ name: 'My chapter', start: '2000-01-01', end: '2001-01-01', color: '#456789' })
  const group = app.saveGroup('  Big events  ')
  assert.equal(group.name, 'Big events')
  assert.equal(group.savedAt, '2026-10-23')
  assert.deepEqual(group.events, app.active)
  assert.deepEqual(group.custom, [custom])
  assert.equal(app.activeGroup.id, group.id)
  assert.equal(saved().activeGroupId, group.id)
  assert.equal(app.groupChanges, 0)
  app.setEventColor('two', '#ffffff')
  assert.equal(group.events[0].color, '#112233')
  assert.equal(saved().groups[0].events[0].color, '#112233')
})

test('group names are validated atomically and empty timelines cannot be saved as new groups', async () => {
  const { app } = setup()
  assert.throws(() => app.saveGroup('Empty'), RangeError)
  await app.loadLibrary()
  app.addEvent('one')
  for (const name of ['', '   ', 'x'.repeat(121)]) assert.throws(() => app.saveGroup(name), InvalidGroupNameError)
  assert.deepEqual(app.groups, [])
  app.saveGroup('Valid')
  assert.throws(() => app.renameGroup('  '), InvalidGroupNameError)
  assert.equal(app.activeGroup.name, 'Valid')
})

test('saving without activation preserves the current group, and renaming does not save edits', async () => {
  const { app } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  const inactive = app.saveGroup('Inactive', false)
  assert.equal(app.activeGroup, undefined)
  app.selectGroup(inactive.id)
  app.addEvent('two')
  const alternate = app.saveGroup('Alternate', false)
  assert.equal(app.activeGroup.id, inactive.id)
  assert.equal(app.groupChanges, 1)
  app.renameGroup('  Renamed  ')
  assert.equal(app.activeGroup.name, 'Renamed')
  assert.equal(app.groupChanges, 1)
  assert.equal(app.groups.find((group) => group.id === alternate.id).events.length, 2)
})

test('dirty groups count additions, removals, colour, visibility and relative reordering, and clear on undo', async () => {
  const { app } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  app.addEvent('two')
  app.saveGroup('Original')
  app.addEvent('three')
  assert.equal(app.groupChanges, 1)
  app.removeEvent('three')
  assert.equal(app.groupChanges, 0)
  app.reorderEvent('two', -1)
  assert.equal(app.groupChanges, 1)
  app.reorderEvent('two', 1)
  assert.equal(app.groupChanges, 0)
  app.setEventColor('one', '#ffffff')
  app.toggleEventVisibility('two')
  assert.equal(app.groupChanges, 2)
  app.updateGroup()
  assert.equal(app.groupChanges, 0)
  assert.equal(app.activeGroup.events[0].color, '#ffffff')
  assert.equal(app.activeGroup.events[1].visible, false)
  app.removeEvent('one')
  assert.equal(app.groupChanges, 1)
  app.discardGroupChanges()
  assert.equal(app.groupChanges, 0)
  assert.deepEqual(app.active, app.activeGroup.events)
})

test('switching an edited group requires an explicit save or discard decision, while selecting itself is safe', async () => {
  const { app } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  const first = app.saveGroup('First')
  app.addEvent('two')
  const second = app.saveGroup('Second')
  app.setEventColor('two', '#aabbcc')
  assert.throws(() => app.selectGroup(first.id), UnsavedGroupChangesError)
  assert.equal(app.activeGroup.id, second.id)
  assert.equal(app.active[1].color, '#aabbcc')
  app.selectGroup(second.id)
  assert.equal(app.groupChanges, 1)
  assert.throws(() => app.selectGroup('missing', 'save'), RangeError)
  assert.equal(app.groupChanges, 1)
  app.selectGroup(first.id, 'save')
  assert.deepEqual(app.active.map((item) => item.eventId), ['one'])
  app.selectGroup(second.id)
  assert.equal(app.active[1].color, '#aabbcc')
  app.removeEvent('two')
  app.selectGroup(first.id, 'discard')
  app.selectGroup(second.id)
  assert.deepEqual(app.active.map((item) => item.eventId), ['one', 'two'])
})

test('groups and dirty working selections survive reload, without exposing mutable snapshots', async () => {
  const { app, saved } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  const first = app.saveGroup('First')
  app.addEvent('two')
  app.flush()
  const second = setup({ stored: saved() }).app
  await second.loadLibrary()
  assert.equal(second.activeGroup.id, first.id)
  assert.equal(second.groupChanges, 1)
  const groups = second.groups
  groups[0].events[0].color = '#000000'
  second.activeGroup.name = 'Overwritten'
  assert.equal(second.activeGroup.name, 'First')
  assert.equal(second.activeGroup.events[0].color, '#123456')
  second.discardGroupChanges()
  assert.deepEqual(second.active.map((item) => item.eventId), ['one'])
})

test('discard and group activation restore saved custom events after deletion, including offline', async () => {
  const { app, saved } = setup({ load: async () => { throw new Error('Offline') } })
  await assert.rejects(app.loadLibrary(), /Offline/)
  const custom = app.createCustomEvent({ name: 'Offline chapter', start: '2000-01-01', end: '2001-01-01', color: '#123456' })
  const group = app.saveGroup('Personal')
  app.deleteCustomEvent(custom.id)
  assert.equal(app.groupChanges, 1)
  app.discardGroupChanges()
  assert.equal(app.eventById(custom.id).name, custom.name)
  app.leaveGroup()
  app.deleteCustomEvent(custom.id)
  app.selectGroup(group.id)
  assert.equal(app.active[0].eventId, custom.id)
  assert.equal(saved().custom.length, 1)
  app.activeGroup.custom[0].name = 'Changed copy'
  assert.equal(app.activeGroup.custom[0].name, custom.name)
})

test('leaving and deleting groups keep current events and custom definitions, even with edits', async () => {
  const { app, saved } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  const first = app.saveGroup('First')
  app.addEvent('two')
  const working = structuredClone(app.active)
  app.leaveGroup()
  assert.equal(app.activeGroup, undefined)
  assert.equal(app.groupChanges, 0)
  assert.deepEqual(app.active, working)
  assert.equal(app.groups.length, 1)
  app.selectGroup(first.id)
  app.addEvent('three')
  const custom = app.createCustomEvent({ name: 'Keep me', start: '2000-01-01', end: '2001-01-01', color: '#123456' })
  const beforeDelete = structuredClone(app.active)
  app.deleteGroup()
  assert.deepEqual(app.active, beforeDelete)
  assert.ok(app.eventById(custom.id))
  assert.deepEqual(saved().groups, [])
  assert.equal(saved().activeGroupId, null)
  for (const action of [() => app.updateGroup(), () => app.discardGroupChanges(), () => app.leaveGroup(), () => app.deleteGroup()]) {
    assert.throws(action, RangeError)
  }
})

test('removing all events can update an existing group to an empty saved selection', async () => {
  const { app } = setup()
  await app.loadLibrary()
  app.addEvent('one')
  const group = app.saveGroup('Empty later')
  app.removeEvent('one')
  app.updateGroup()
  assert.deepEqual(app.activeGroup.events, [])
  assert.equal(app.groupChanges, 0)
  app.leaveGroup()
  app.addEvent('two')
  app.selectGroup(group.id)
  assert.deepEqual(app.active, [])
})
