import { describe, expect, test } from 'bun:test'
import {
  getEmptyModelResponseDisposition,
  MAX_EMPTY_MODEL_RESPONSE_RETRIES,
} from './emptyResponse.js'

describe('getEmptyModelResponseDisposition', () => {
  test('retries once when a completed model request emits no assistant message', () => {
    expect(
      getEmptyModelResponseDisposition({
        assistantMessageCount: 0,
        retryCount: 0,
        aborted: false,
      }),
    ).toBe('retry')
  })

  test('surfaces an error after the empty response retry is exhausted', () => {
    expect(MAX_EMPTY_MODEL_RESPONSE_RETRIES).toBe(1)
    expect(
      getEmptyModelResponseDisposition({
        assistantMessageCount: 0,
        retryCount: MAX_EMPTY_MODEL_RESPONSE_RETRIES,
        aborted: false,
      }),
    ).toBe('error')
  })

  test('keeps normal assistant responses on the existing path', () => {
    expect(
      getEmptyModelResponseDisposition({
        assistantMessageCount: 1,
        retryCount: 0,
        aborted: false,
      }),
    ).toBe('continue')
  })

  test('does not retry or replace an intentional abort', () => {
    expect(
      getEmptyModelResponseDisposition({
        assistantMessageCount: 0,
        retryCount: 0,
        aborted: true,
      }),
    ).toBe('continue')
  })
})
