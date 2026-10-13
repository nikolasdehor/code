import { describe, expect, test } from 'bun:test'
import {
  codexStreamToAnthropic,
  type AnthropicStreamEvent,
} from './codexShim.js'

describe('Codex empty completed response', () => {
  test('translates an empty completed payload into an empty Anthropic message envelope', async () => {
    const response = new Response(
      [
        'event: response.completed',
        'data: {"type":"response.completed","response":{"id":"resp_empty","status":"completed","output":[]}}',
        '',
        '',
      ].join('\n'),
      { headers: { 'content-type': 'text/event-stream' } },
    )

    const events: AnthropicStreamEvent[] = []
    for await (const event of codexStreamToAnthropic(response, 'gpt-6-luna')) {
      events.push(event)
    }

    expect(events.map(event => event.type)).toEqual([
      'message_start',
      'message_delta',
      'message_stop',
    ])
    expect(events.some(event => event.type.startsWith('content_block_'))).toBe(
      false,
    )
  })
})
