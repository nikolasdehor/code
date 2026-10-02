// NOTE: these tests exercise the real secret-tool spawn, so they must run in
// their own process (CI does this via `bun run test:isolated`, one file per
// process). platformStorage.test.ts installs a process-global mock.module("execa")
// that would shadow the real spawn if both files ran in one process.
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  classifySecretToolLookup,
  linuxSecretStorage,
} from './linuxSecretStorage.js'

describe('classifySecretToolLookup', () => {
  test('a spawn failure means the vault cannot exist: missing, not error', () => {
    // Regression guard: this used to classify as `error`, which made the
    // fail-closed write path refuse to persist fresh login tokens and left
    // customers without secret-tool in an endless re-login loop.
    expect(classifySecretToolLookup({ spawnFailed: true, exitCode: null })).toBe('missing')
  })

  test('exit 0 is a successful lookup', () => {
    expect(classifySecretToolLookup({ spawnFailed: false, exitCode: 0 })).toBe('ok')
  })

  test('exit 1 is a missing item (secret-tool convention)', () => {
    expect(classifySecretToolLookup({ spawnFailed: false, exitCode: 1 })).toBe('missing')
  })

  test('any other exit code is a vault/service failure', () => {
    // A native record may still exist: this must stay `error` so a fallback
    // write never shadows it.
    expect(classifySecretToolLookup({ spawnFailed: false, exitCode: 2 })).toBe('vault-error')
    expect(classifySecretToolLookup({ spawnFailed: false, exitCode: 127 })).toBe('vault-error')
  })
})

describe('linuxSecretStorage without the secret-tool binary', () => {
  const originalPath = process.env.PATH
  const emptyDir = mkdtempSync(join(tmpdir(), 'no-secret-tool-'))

  afterAll(() => {
    process.env.PATH = originalPath
  })

  test('readResult is missing (not error) when secret-tool is absent', () => {
    process.env.PATH = emptyDir
    const result = linuxSecretStorage.readResult?.()
    expect(result).toEqual({ kind: 'missing' })
  })

  test('update fails cleanly so the fallback storage takes the write', () => {
    process.env.PATH = emptyDir
    const result = linuxSecretStorage.update({})
    expect(result.success).toBe(false)
  })
})