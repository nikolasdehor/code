import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import pty from 'node-pty'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const tsxLoader = require.resolve('tsx/esm')

test('resume handoff keeps the PTY available to the replacement CLI', { timeout: 15_000 }, async () => {
  const target = await mkdtemp(join(tmpdir(), 'verboo-resume-handoff-'))
  const env = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${tsxLoader}`].filter(Boolean).join(' '),
    VERBOO_RESUME_HANDOFF_FIXTURE_TARGET: target,
  }
  const nodeExecutable = process.versions.bun ? 'node' : process.execPath

  const terminal = pty.spawn(
    nodeExecutable,
    [
      resolve('scripts/e2e/resume-handoff.fixture.mjs'),
      '--fixture-parent',
      '--model',
      'sonnet',
      '--effort=high',
      '--permission-mode',
      'bypassPermissions',
      '--dangerously-skip-permissions',
      '--allow-dangerously-skip-permissions',
      '--settings',
      '/tmp/should-not-cross-project',
      '--setting-sources',
      'project',
      '--add-dir',
      '/tmp/should-not-cross-project',
      '--mcp-config',
      '/tmp/should-not-cross-project',
      '--plugin-dir',
      '/tmp/should-not-cross-project',
      '--agents',
      '/tmp/should-not-cross-project',
      '--tools',
      'default',
      '--allowed-tools',
      'Bash',
      '--disallowed-tools',
      'Read',
      '--system-prompt',
      'source project prompt',
      '--append-system-prompt',
      'source project extra prompt',
      '--agent',
      'source-project-agent',
    ],
    { name: 'xterm-256color', cols: 80, rows: 24, cwd: process.cwd(), env },
  )

  let output = ''
  terminal.onData(data => {
    output += data
  })

  try {
    const result = await new Promise((resolveExit, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Handoff timed out. Output:\n${output}`)), 12_000)
      terminal.onExit(exit => {
        clearTimeout(timeout)
        resolveExit(exit)
      })
    })

    assert.equal(result.exitCode, 0, output)
    assert.match(output, /HANDOFF_TTY_OK/)
    assert.doesNotMatch(output, /setRawMode EIO/)
  } finally {
    terminal.kill()
    await rm(target, { recursive: true, force: true })
  }
})
