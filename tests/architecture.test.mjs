import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import { compile, parse } from 'svelte/compiler'
import * as engine from '../src/engine/index.ts'
import { dotStart } from '../src/domain/dates.ts'
import { DotTimeline } from '../src/presentation/canvas/DotTimeline.ts'

const root = fileURLToPath(new URL('../src/', import.meta.url))
const allowed = {
  domain: ['domain'],
  application: ['application', 'domain'],
  infrastructure: ['infrastructure', 'application', 'domain'],
  presentation: ['presentation', 'application', 'domain'],
  engine: ['engine', 'presentation', 'domain'],
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map((entry) => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(filename) : /\.(ts|svelte)$/.test(filename) ? [filename] : []
  }))).flat()
}

function importSources(source) {
  const result = []
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      assert.ok(ts.isStringLiteral(node.moduleSpecifier), 'Imports must have static module names')
      result.push(node.moduleSpecifier.text)
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      result.push(node.argument.literal.text)
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert.ok(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), 'Dynamic imports must have static module names')
      result.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}

async function dependencies(filename, text = undefined) {
  text ??= await readFile(filename, 'utf8')
  if (filename.endsWith('.ts')) return importSources(ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true))
  const component = parse(text, { filename, modern: true })
  const result = [component.instance, component.module].filter(Boolean).flatMap((script) =>
    importSources(ts.createSourceFile(`${filename}.ts`, text.slice(script.content.start, script.content.end), ts.ScriptTarget.Latest, true)),
  )
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'ImportExpression') {
      assert.equal(typeof node.source.value, 'string', 'Template imports must have static module names')
      result.push(node.source.value)
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object') visit(child)
    }
  }
  visit(component.fragment)
  return result
}

test('source dependencies point inward, including type imports and re-exports', async () => {
  for (const filename of await sourceFiles(root)) {
    const relative = path.relative(root, filename)
    const layer = relative.split(path.sep)[0]
    if (relative === 'main.ts') continue
    assert.ok(allowed[layer], `Unclassified source module: ${relative}`)
    for (const specifier of await dependencies(filename)) {
      if (layer === 'presentation' && relative.split(path.sep)[1] !== 'canvas' &&
        (specifier === 'svelte' || specifier.startsWith('svelte/'))) continue
      assert.ok(specifier.startsWith('.'), `${relative} must not depend on external packages: ${specifier}`)
      const target = path.resolve(path.dirname(filename), specifier)
      const targetLayer = path.relative(root, target).split(path.sep)[0]
      assert.ok(allowed[layer].includes(targetLayer), `${relative} violates dependency direction: ${specifier}`)
    }
  }
})

test('Svelte dependency analysis covers module scripts, type imports, and template imports', async () => {
  const imports = await dependencies('Fixture.svelte', `
    <script module lang="ts">export { writable } from 'svelte/store'</script>
    <script lang="ts">import type { Unit } from '../domain/timeline.ts'</script>
    <button onclick={() => import('../infrastructure/BrowserViewLocation.ts')}>Load</button>
  `)
  assert.deepEqual(imports.sort(), ['../domain/timeline.ts', '../infrastructure/BrowserViewLocation.ts', 'svelte/store'])
})

test('source module graph has no circular dependencies', async () => {
  const files = new Set(await sourceFiles(root))
  const graph = new Map()
  for (const filename of files) {
    const targets = (await dependencies(filename)).filter((name) => name.startsWith('.')).flatMap((name) => {
      const target = path.resolve(path.dirname(filename), name)
      return [target, `${target}.ts`, `${target}.svelte`, path.join(target, 'index.ts')].filter((candidate) => files.has(candidate))
    })
    graph.set(filename, targets)
  }
  const visiting = new Set()
  const visited = new Set()
  function visit(filename) {
    assert.equal(visiting.has(filename), false, `Circular dependency at ${path.relative(root, filename)}`)
    if (visited.has(filename)) return
    visiting.add(filename)
    for (const target of graph.get(filename) ?? []) visit(target)
    visiting.delete(filename)
    visited.add(filename)
  }
  for (const filename of graph.keys()) visit(filename)
})

test('Svelte presentation components compile without accessibility or reactivity warnings', async () => {
  const components = (await sourceFiles(root)).filter((filename) => filename.endsWith('.svelte'))
  assert.ok(components.length > 0, 'The app must have Svelte presentation components')
  for (const filename of components) {
    const result = compile(await readFile(filename, 'utf8'), { filename, generate: 'client', dev: true })
    assert.deepEqual(result.warnings.map((warning) => `${warning.code}: ${warning.message}`), [], path.relative(root, filename))
  }
})

test('the original public engine imports remain compatible', () => {
  assert.equal(engine.DotTimeline, DotTimeline)
  assert.equal(engine.dotStart, dotStart)
  assert.equal(engine.UNIT_SPECS.length, 5)
  assert.equal(typeof engine.displayDate, 'function')
})
