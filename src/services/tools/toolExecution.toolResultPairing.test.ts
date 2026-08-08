import { expect, test } from 'bun:test'
import type { Message } from '../../types/message.js'
import {
  createAssistantMessage,
  createUserMessage,
} from '../../utils/messages.js'
import {
  ensureTerminalToolResult,
  type MessageUpdateLazy,
} from './toolExecution.js'

async function collect(
  updates: AsyncIterable<MessageUpdateLazy>,
): Promise<Message[]> {
  const messages: Message[] = []
  for await (const update of updates) {
    messages.push(update.message)
  }
  return messages
}

function toolResultIds(message: Message): string[] {
  if (message.type !== 'user' || !Array.isArray(message.message.content)) {
    return []
  }
  return message.message.content.flatMap(block =>
    block.type === 'tool_result' ? [block.tool_use_id] : [],
  )
}

test('ensureTerminalToolResult emits one error result when a tool stream ends empty', async () => {
  const assistant = createAssistantMessage({ content: 'running tool' })
  let missingCount = 0

  async function* emptyUpdates(): AsyncGenerator<MessageUpdateLazy, void> {}

  const messages = await collect(
    ensureTerminalToolResult(
      emptyUpdates(),
      'toolu_missing',
      assistant,
      () => missingCount++,
    ),
  )

  expect(missingCount).toBe(1)
  expect(messages).toHaveLength(1)
  expect(toolResultIds(messages[0]!)).toEqual(['toolu_missing'])
  expect(messages[0]).toMatchObject({
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'toolu_missing',
          is_error: true,
        },
      ],
    },
  })
})

test('ensureTerminalToolResult preserves an existing result without duplicating it', async () => {
  const assistant = createAssistantMessage({ content: 'running tool' })
  const existingResult = createUserMessage({
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_ok',
        content: 'done',
      },
    ],
  })
  let missingCount = 0

  async function* existingUpdates(): AsyncGenerator<MessageUpdateLazy, void> {
    yield { message: existingResult }
  }

  const messages = await collect(
    ensureTerminalToolResult(
      existingUpdates(),
      'toolu_ok',
      assistant,
      () => missingCount++,
    ),
  )

  expect(missingCount).toBe(0)
  expect(messages).toEqual([existingResult])
  expect(messages.flatMap(toolResultIds)).toEqual(['toolu_ok'])
})
