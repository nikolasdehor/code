import { expect, test } from 'bun:test'
import { isUsageWindowStop } from './usageWindowErrors.js'
import { classifyOpenAIHttpFailure, buildOpenAICompatibilityErrorMessage } from './openaiErrorClassification.js'
import { readWithRetry, retryAfterMilliseconds } from './readRetry.js'

test('window exhaustion and unknown accounting stop automatic inference retries', () => {
  for (const code of ['usage_window_exhausted', 'usage_accounting_pending', 'usage_accounting_unavailable']) {
    const failure = classifyOpenAIHttpFailure({ status: code === 'usage_window_exhausted' ? 429 : 503, body: JSON.stringify({ error: { code, message: 'Uso pausado.' } }) })
    expect(failure.retryable).toBe(false)
    expect(isUsageWindowStop({ error: { code } })).toBe(true)
    expect(isUsageWindowStop(new Error(buildOpenAICompatibilityErrorMessage('Uso pausado.', failure)))).toBe(true)
  }
  expect(isUsageWindowStop(new Error('[openai_category=usage_window_exhausted_extra]'))).toBe(false)
  expect(classifyOpenAIHttpFailure({ status: 429, body: '{"error":{"code":"rate_limit"}}' }).retryable).toBe(true)
})

test('usage reads retry transient failures and never retry validation or cancellation', async () => {
  let calls = 0
  expect(await readWithRetry(async () => { if (++calls < 3) throw new TypeError('offline'); return 42 }, () => ({ retry: true, delayMs: 0 }))).toBe(42)
  expect(calls).toBe(3)
  calls = 0
  await expect(readWithRetry(async () => { calls++; throw new Error('validation') }, () => ({ retry: false }))).rejects.toThrow('validation')
  expect(calls).toBe(1)
  const controller = new AbortController()
  controller.abort()
  await expect(readWithRetry(async () => { calls++; return 0 }, () => ({ retry: true }), controller.signal)).rejects.toThrow()
  expect(calls).toBe(1)
  await expect(readWithRetry(async () => { calls++; throw new Error('rate limited') }, () => ({ retry: true, delayMs: 60_000 }))).rejects.toThrow('rate limited')
  expect(calls).toBe(2)
  expect(retryAfterMilliseconds('2')).toBe(2000)
  expect(retryAfterMilliseconds(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(3000)
})
