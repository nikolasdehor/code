import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startCli } from './terminal.mjs'
import { CODEX_FIXTURE_README } from './codex-router.mjs'

const testTimeout = 90_000

async function startCodexCli(prompt) {
  return startCli({ model: 'gpt-5.5', routerOptions: {}, codexOptions: {}, args: ['--effort', 'high', prompt] })
}

function expectCleanProtocol(cli) {
  assert.deepEqual(cli.codexRouter.violations, [])
  assert.deepEqual(cli.router.unexpected, [])
}

function textFrames(cli, marker) {
  return cli.frames.filter(frame => frame.text.replace(/\s+/g, ' ').includes(marker))
}

function textChunks(cli, marker) {
  return cli.chunks.filter(chunk => chunk.text.includes(marker))
}

function mainRequests(cli, marker) {
  return cli.codexRouter.requests.filter(request =>
    request.body.text?.format?.type !== 'json_schema' &&
    request.currentUserPrompt.includes(marker),
  )
}

async function waitForText(cli, marker, timeout = 30_000) {
  await cli.waitFor(() => textFrames(cli, marker).length > 0 || textChunks(cli, marker).length > 0, timeout)
}

async function sendTurn(cli, prompt, expectedText) {
  await cli.waitFor(() => /Describe a task|❯/.test(cli.screen()), 10_000)
  cli.write(`${prompt}\r`)
  await waitForText(cli, expectedText)
}

test('real CLI PTY sends a valid Codex request, streams a reply, and preserves follow-up context', { timeout: testTimeout }, async () => {
  const startedAt = Date.now()
  const cli = await startCodexCli('CODEX_E2E_SIMPLE: Say exactly that the Codex transport answered.')
  try {
    await waitForText(cli, 'CODEX_E2E_SIMPLE_REPLY', 20_000)
    await cli.waitFor(() => textFrames(cli, 'CODEX_E2E_SIMPLE_REPLY').length > 0, 20_000)
    const firstFrame = textFrames(cli, 'CODEX_E2E_SIMPLE_REPLY')[0]
    assert.ok(firstFrame.at - startedAt < 20_000, `first answer exceeded 20 seconds (${firstFrame.at - startedAt}ms)`)
    assert.equal(mainRequests(cli, 'CODEX_E2E_SIMPLE').length, 1, 'one user turn must create exactly one inference request')
    assert.ok(cli.codexRouter.catalogRequests.length >= 1, 'the real CLI must load its Codex model catalog from the fixture endpoint')

    await sendTurn(cli, 'CODEX_E2E_FOLLOWUP: What was the exact phrase from your previous answer?', 'CODEX_E2E_FOLLOWUP_REPLY')
    assert.equal(mainRequests(cli, 'CODEX_E2E_SIMPLE').length, 1)
    assert.equal(mainRequests(cli, 'CODEX_E2E_FOLLOWUP').length, 1, 'the follow-up must create exactly one additional inference request')
    const followupInput = JSON.stringify(mainRequests(cli, 'CODEX_E2E_FOLLOWUP')[0].body.input)
    assert.ok(followupInput.includes('CODEX_E2E_SIMPLE_REPLY'), 'the prior assistant turn must be sent back to Codex')
    assert.ok(followupInput.includes('CODEX_E2E_FOLLOWUP'), 'the current user turn must be sent to Codex')
    expectCleanProtocol(cli)
  } finally {
    await cli.stop()
  }
})

test('real CLI executes a Codex function call, returns the Read result, then finishes the turn', { timeout: testTimeout }, async () => {
  const cli = await startCodexCli('CODEX_E2E_TOOL: Read README.md and report the exact fixture marker.')
  try {
    await waitForText(cli, 'CODEX_E2E_TOOL_REPLY')
    const toolRequests = mainRequests(cli, 'CODEX_E2E_TOOL')
    assert.equal(toolRequests.length, 2, 'a tool turn must issue one model request and one post-tool continuation')

    const first = toolRequests[0].body
    const readCall = first.tools.find(tool => tool.name === 'Read')
    assert.ok(readCall, 'the installed CLI must expose its real Read tool to Codex')
    const toolOutput = toolRequests[1].body.input.find(item => item.type === 'function_call_output')
    assert.ok(toolOutput, 'the Read result must be returned as a Responses function_call_output')
    assert.ok(JSON.stringify(toolOutput.output).includes(CODEX_FIXTURE_README), 'the real workspace file content must reach the model continuation')
    assert.ok(JSON.stringify(toolRequests[1].body.input).includes(`call_${toolRequests[0].id}`), 'the tool result must keep the original call ID')
    expectCleanProtocol(cli)
  } finally {
    await cli.stop()
  }
})

test('real CLI renders a long answer incrementally and retains the final segment', { timeout: testTimeout }, async () => {
  const startedAt = Date.now()
  const cli = await startCodexCli('CODEX_E2E_LONG: Produce a long but finite streaming report.')
  try {
    await waitForText(cli, 'CODEX_E2E_LONG_FINAL_MARKER', 30_000)
    const firstChunk = textChunks(cli, 'LONG_SEGMENT_001')[0]
    const middleChunk = textChunks(cli, 'LONG_SEGMENT_080')[0]
    const finalChunk = textChunks(cli, 'CODEX_E2E_LONG_FINAL_MARKER')[0]
    assert.ok(firstChunk, 'the first portion of the streamed report must reach the terminal')
    assert.ok(middleChunk, 'a middle portion of the streamed report must reach the terminal')
    assert.ok(finalChunk, 'the final portion of the streamed report must reach the terminal')
    assert.ok(firstChunk.at < middleChunk.at && middleChunk.at < finalChunk.at, 'initial, middle, and final report sections must reach the terminal in order')
    assert.ok(finalChunk.at - firstChunk.at >= 500, 'the fixture must prove incremental terminal delivery rather than a single buffered response')
    assert.ok(finalChunk.at - startedAt < 30_000, 'the complete long answer must arrive within 30 seconds')
    const request = mainRequests(cli, 'CODEX_E2E_LONG')[0].body
    assert.ok(request.max_output_tokens >= 1024, 'long-form requests must keep a usable output-token budget')
    expectCleanProtocol(cli)
  } finally {
    await cli.stop()
  }
})

test('real CLI retries one empty completion and makes the exhausted retry visible', { timeout: testTimeout }, async () => {
  const cli = await startCodexCli('CODEX_E2E_EMPTY_RECOVER: Return an empty response once, then answer.')
  try {
    await waitForText(cli, 'CODEX_E2E_EMPTY_RECOVERED_AFTER_ONE_RETRY')
    assert.equal(mainRequests(cli, 'CODEX_E2E_EMPTY_RECOVER').length, 2, 'one empty completion must trigger exactly one retry')

    await sendTurn(cli, 'CODEX_E2E_EMPTY_EXHAUST: Return an empty response on both attempts.', 'no assistant response after 2 attempts')
    assert.equal(mainRequests(cli, 'CODEX_E2E_EMPTY_EXHAUST').length, 2, 'the retry limit must remain exactly one')
    expectCleanProtocol(cli)
  } finally {
    await cli.stop()
  }
})

test('real CLI reports an upstream 429 and remains usable for the next user turn', { timeout: testTimeout }, async () => {
  const cli = await startCodexCli('CODEX_E2E_HTTP_429: simulate an upstream rate limit.')
  try {
    await cli.waitFor(() => mainRequests(cli, 'CODEX_E2E_HTTP_429').length === 11, 70_000)
    await cli.waitFor(() => cli.frames.some(frame => frame.text.replace(/\s+/g, ' ').includes('Codex fixture rate limit')), 10_000)
    assert.equal(mainRequests(cli, 'CODEX_E2E_HTTP_429').length, 11, 'the configured foreground retry budget must be honored in full before surfacing the persistent 429')
    await sendTurn(cli, 'CODEX_E2E_RECOVERY: confirm the session still accepts input.', 'CODEX_E2E_RECOVERY_REPLY')
    assert.equal(mainRequests(cli, 'CODEX_E2E_RECOVERY').length, 1, 'the next user turn must reach Codex after a visible provider error')
    expectCleanProtocol(cli)
  } finally {
    await cli.stop()
  }
})

test('real CLI cancels a stalled Codex stream and can answer a new turn afterward', { timeout: testTimeout }, async () => {
  const cli = await startCodexCli('CODEX_E2E_ABORT_STREAM: begin a response and wait for cancellation.')
  try {
    await waitForText(cli, 'CODEX_E2E_PARTIAL_BEFORE_CANCEL')
    cli.write('\x1b')
    await cli.waitFor(() => cli.codexRouter.abortedRequests.length === 1, 10_000)
    await cli.waitFor(() => /Interrupted|Stopped|interrupted|stopped/.test(cli.screen()), 10_000)
    assert.equal(mainRequests(cli, 'CODEX_E2E_ABORT_STREAM').length, 1, 'cancelling must abort the in-flight request without a hidden restart')
    await sendTurn(cli, 'CODEX_E2E_RECOVERY: answer after the canceled request.', 'CODEX_E2E_RECOVERY_REPLY')
    assert.equal(mainRequests(cli, 'CODEX_E2E_RECOVERY').length, 1, 'the CLI must recover for a later user turn')
    expectCleanProtocol(cli)
  } finally {
    await cli.stop()
  }
})
