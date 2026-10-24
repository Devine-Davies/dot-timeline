import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { BrowserViewLocation } from '../src/infrastructure/BrowserViewLocation.ts'
import { HttpEventLibraryRepository } from '../src/infrastructure/HttpEventLibraryRepository.ts'
import { LocalStorageTimelineRepository } from '../src/infrastructure/LocalStorageTimelineRepository.ts'

const event = { id: 'one', name: 'One', start: '2026-01-01', end: '2026-12-31', color: '#123456', category: 'history', source: 'https://example.com/history' }
const active = { eventId: 'one', color: '#abcdef', visible: false, order: 0 }
const view = { unit: '1m', centerDate: '2026-10-23', panelOpen: false }

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  const warnings = []
  const repository = new LocalStorageTimelineRepository(() => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }), (message) => warnings.push(message))
  return { repository, values, warnings }
}

test('localStorage preserves existing v1 keys and round trips custom, active, and view data', () => {
  const { repository, values, warnings } = storage()
  const custom = { ...event, id: 'custom-one', category: 'personal' }
  repository.saveEvents([active], [custom])
  repository.saveView(view)
  assert.deepEqual([...values.keys()], ['dt:v1:active', 'dt:v1:custom', 'dt:v1:view'])
  assert.deepEqual(repository.load(), { active: [active], custom: [custom], view })
  assert.deepEqual(warnings, [])
})

test('invalid stored entries are reported while valid entries and false preferences survive', () => {
  const { repository, warnings } = storage({
    'dt:v1:active': JSON.stringify([null, active, { ...active, order: 2 }, { ...active, eventId: 'bad', color: 'red' }]),
    'dt:v1:custom': JSON.stringify([event, { ...event, id: 'custom', category: 'personal' }, null]),
    'dt:v1:view': JSON.stringify({ unit: 'invalid', centerDate: '2026-02-29', panelOpen: false }),
  })
  const loaded = repository.load()
  assert.deepEqual(loaded.active, [active])
  assert.equal(loaded.custom.length, 1)
  assert.deepEqual(loaded.view, { panelOpen: false })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /invalid/)
})

test('malformed JSON and unexpected stored shapes produce defaults with a warning', () => {
  for (const raw of ['{', '42', '"text"', 'true']) {
    const { repository, warnings } = storage({ 'dt:v1:active': raw, 'dt:v1:custom': raw, 'dt:v1:view': raw })
    assert.deepEqual(repository.load(), { active: [], custom: [], view: {} })
    assert.equal(warnings.length, 1)
  }
  const missing = storage()
  assert.deepEqual(missing.repository.load(), { active: [], custom: [], view: {} })
  assert.deepEqual(missing.warnings, [])
})

test('unavailable storage is reported once, including blocked access to the storage getter', () => {
  for (const getStorage of [
    () => { throw new DOMException('Blocked', 'SecurityError') },
    () => ({ getItem: () => { throw new Error('Read denied') }, setItem: () => { throw new Error('Quota exceeded') } }),
  ]) {
    const warnings = []
    const repository = new LocalStorageTimelineRepository(getStorage, (message) => warnings.push(message))
    assert.deepEqual(repository.load(), { active: [], custom: [], view: {} })
    repository.saveEvents([active], [])
    repository.saveView(view)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /this visit only/)
  }
})

test('HTTP library loading respects its injected base URL and validates the bundled catalogue', async () => {
  const data = JSON.parse(await readFile(new URL('../public/library.json', import.meta.url), 'utf8'))
  let requested
  const repository = new HttpEventLibraryRepository('/subdirectory/library.json', async (url) => {
    requested = url
    return Response.json(data)
  })
  assert.equal((await repository.load()).length, 25)
  assert.equal(requested, '/subdirectory/library.json')
})

test('HTTP errors, malformed payloads, invalid events, duplicates, and missing sources reject explicitly', async () => {
  const httpError = new HttpEventLibraryRepository('/library.json', async () => new Response('', { status: 503 }))
  await assert.rejects(httpError.load(), /HTTP 503/)
  for (const data of [{}, [event, event], [{ ...event, source: 'javascript:alert(1)' }], [{ ...event, start: 'bad' }], [{ ...event, source: undefined }]]) {
    const repository = new HttpEventLibraryRepository('/library.json', async () => Response.json(data))
    await assert.rejects(repository.load(), /Invalid/)
  }
  const offline = new HttpEventLibraryRepository('/library.json', async () => { throw new Error('Offline') })
  await assert.rejects(offline.load(), /Offline/)
  const malformed = new HttpEventLibraryRepository('/library.json', async () => new Response('{'))
  await assert.rejects(malformed.load(), SyntaxError)
})

test('URL adapter reads bookmarks and replaces only timeline query parameters', () => {
  let current = 'https://example.com/timeline/?theme=dark&unit=1y&at=2000-01-01#details'
  const adapter = new BrowserViewLocation(() => current, (url) => { current = url.href }, assert.fail)
  assert.deepEqual(adapter.read(), { unit: '1y', centerDate: '2000-01-01' })
  adapter.write(view)
  const url = new URL(current)
  assert.equal(url.searchParams.get('theme'), 'dark')
  assert.equal(url.searchParams.get('unit'), '1m')
  assert.equal(url.searchParams.get('at'), '2026-10-23')
  assert.equal(url.hash, '#details')
})

test('restricted history updates are reported once without blocking the current view', () => {
  const warnings = []
  const adapter = new BrowserViewLocation(() => 'https://example.com/', () => {
    throw new DOMException('Blocked', 'SecurityError')
  }, (message) => warnings.push(message))
  adapter.write(view)
  adapter.write(view)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /could not update/)
})
