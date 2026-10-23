import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
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
    return entry.isDirectory() ? sourceFiles(filename) : filename.endsWith('.ts') ? [filename] : []
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

test('source dependencies point inward, including type imports and re-exports', async () => {
  for (const filename of await sourceFiles(root)) {
    const relative = path.relative(root, filename)
    const layer = relative.split(path.sep)[0]
    if (relative === 'main.ts') continue
    assert.ok(allowed[layer], `Unclassified source module: ${relative}`)
    const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true)
    for (const specifier of importSources(source)) {
      assert.ok(specifier.startsWith('.'), `${relative} must not depend on external packages: ${specifier}`)
      const target = path.resolve(path.dirname(filename), specifier)
      const targetLayer = path.relative(root, target).split(path.sep)[0]
      assert.ok(allowed[layer].includes(targetLayer), `${relative} violates dependency direction: ${specifier}`)
    }
  }
})

test('source module graph has no circular dependencies', async () => {
  const files = new Set(await sourceFiles(root))
  const graph = new Map()
  for (const filename of files) {
    const source = ts.createSourceFile(filename, await readFile(filename, 'utf8'), ts.ScriptTarget.Latest, true)
    const targets = importSources(source).filter((name) => name.startsWith('.')).flatMap((name) => {
      const target = path.resolve(path.dirname(filename), name)
      return [target, `${target}.ts`, path.join(target, 'index.ts')].filter((candidate) => files.has(candidate))
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

test('the original public engine imports remain compatible', () => {
  assert.equal(engine.DotTimeline, DotTimeline)
  assert.equal(engine.dotStart, dotStart)
  assert.equal(engine.UNIT_SPECS.length, 5)
  assert.equal(typeof engine.displayDate, 'function')
})
