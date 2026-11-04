// Manifest contract tests: the tarball is only shareable if every consumer of
// the package manifest accepts it. `@deepseek-ai/dsh-client-modules` validates
// `dsh.client` strictly before it will ever request `./client`, so these checks
// mirror that parser instead of trusting the JSON by eye.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

test('dsh.client declares a web platform and an explicit boolean immediately', () => {
  const client = manifest.dsh?.client
  assert.ok(client, 'package declares no dsh.client')
  assert.equal(typeof client.platform, 'string')
  assert.equal(client.platform, 'web')
  assert.equal(typeof client.immediately, 'boolean')
  if (client.external !== undefined) {
    assert.ok(Array.isArray(client.external), 'dsh.client.external must be an array')
    assert.ok(
      client.external.every((name) => typeof name === 'string'),
      'dsh.client.external entries must be strings',
    )
  }
})

test('exports["./client"] resolves to a real file some way or another', () => {
  const exported = manifest.exports?.['./client']
  assert.ok(exported !== undefined, 'a dsh.client declaration requires an "./client" export')
  const rel = typeof exported === 'string' ? exported : exported?.default
  assert.equal(typeof rel, 'string', 'exports["./client"] must be a string or { default: string }')
  assert.ok(existsSync(join(root, rel)), `exports["./client"] points at a missing file: ${rel}`)
})

test('the host entry and the bundle patch referenced by the manifest exist', () => {
  const entry = typeof manifest.exports?.['.'] === 'string' ? manifest.exports['.'] : manifest.main
  assert.equal(typeof entry, 'string')
  assert.ok(existsSync(join(root, entry)), `host entry is missing: ${entry}`)

  const patch = join(root, manifest.dsh?.bundle?.patch ?? '')
  assert.ok(manifest.dsh?.bundle?.patch, 'dsh.bundle.patch is missing')
  assert.ok(existsSync(patch), `bundle patch is missing: ${manifest.dsh.bundle.patch}`)

  const body = readFileSync(patch, 'utf8')
  assert.match(body, /-\s*insert:/, 'patch must insert a loader entry')
  assert.ok(
    body.includes(`name: ${manifest.name}`),
    'the inserted entry must mount this very package',
  )
})

test('everything the package needs to run is inside its published file list', () => {
  const files = manifest.files ?? []
  for (const required of ['lib', 'cordis.patch.yml', 'README.md']) {
    assert.ok(files.includes(required), `files is missing "${required}" — a packed install would break`)
  }
  assert.equal(manifest.private, false, 'a private package cannot be shared by name')
})
