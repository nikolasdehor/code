import { PassThrough } from 'node:stream'

import { afterEach, expect, mock, test } from 'bun:test'
import React from 'react'

import { createRoot, Text } from '../../ink.js'

let codexConnected = false
let claudeConnected = false

mock.module('./usageProviders.js', () => ({
  getConnectedUsageProviders: async () => ({
    codex: codexConnected,
    claude: claudeConnected,
  }),
}))

mock.module('./VerbooUsage.js', () => ({
  VerbooUsage: () => <Text>verboo-current-usage</Text>,
}))
mock.module('./CodexUsage.js', () => ({
  CodexUsage: () => <Text>codex-account-usage</Text>,
}))
mock.module('./ClaudeNativeUsage.js', () => ({
  ClaudeNativeUsage: () => <Text>claude-account-usage</Text>,
}))

function createTestStreams() {
  let output = ''
  const stdout = new PassThrough()
  const stdin = new PassThrough() as PassThrough & {
    isTTY: boolean
    setRawMode: (mode: boolean) => void
    ref: () => void
    unref: () => void
  }
  stdin.isTTY = true
  stdin.setRawMode = () => {}
  stdin.ref = () => {}
  stdin.unref = () => {}
  ;(stdout as unknown as { columns: number }).columns = 120
  stdout.on('data', chunk => {
    output += chunk.toString()
  })
  return { stdout, stdin, getOutput: () => output }
}

async function renderUsage(suffix: string): Promise<string> {
  const { Usage } = await import(`./Usage.js?${suffix}`)
  const streams = createTestStreams()
  const root = await createRoot({
    stdout: streams.stdout as unknown as NodeJS.WriteStream,
    stdin: streams.stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
  })
  root.render(<Usage />)
  await Bun.sleep(20)
  const output = streams.getOutput()
  root.unmount()
  streams.stdin.end()
  streams.stdout.end()
  await Bun.sleep(0)
  return output
}

afterEach(() => {
  codexConnected = false
  claudeConnected = false
})

test('preserves the current Verboo-only usage screen with no optional login', async () => {
  const output = await renderUsage(`fallback-${Date.now()}`)

  expect(output).toContain('verboo-current-usage')
  expect(output).not.toContain('codex-account-usage')
  expect(output).not.toContain('claude-account-usage')
  expect(output).not.toContain('Codex')
})

test('renders Codex and Claude usage together after both are connected', async () => {
  codexConnected = true
  claudeConnected = true
  const output = await renderUsage(`both-${Date.now()}`)

  expect(output).toContain('Verboo')
  expect(output).toContain('verboo-current-usage')
  expect(output).toContain('Codex')
  expect(output).toContain('codex-account-usage')
  expect(output).toContain('Claude')
  expect(output).toContain('claude-account-usage')
})
