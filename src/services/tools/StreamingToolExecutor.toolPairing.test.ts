import { expect, test } from 'bun:test'
import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { z } from 'zod/v4'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import {
  getEmptyToolPermissionContext,
  type Tool,
  type ToolUseContext,
} from '../../Tool.js'
import type { AssistantMessage, Message } from '../../types/message.js'
import { createAssistantMessage } from '../../utils/messages.js'
import { StreamingToolExecutor } from './StreamingToolExecutor.js'

function createTool(name: string, outcome: 'success' | 'error'): Tool {
  return {
    name,
    inputSchema: z.object({}),
    maxResultSizeChars: 0,
    async call() {
      if (outcome === 'error') {
        throw new Error(`${name} failed`)
      }
      return { data: `${name} complete` }
    },
    async description() {
      return name
    },
    async prompt() {
      return ''
    },
    isConcurrencySafe() {
      return true
    },
    isEnabled() {
      return true
    },
    isReadOnly() {
      return true
    },
    async checkPermissions(input) {
      return { behavior: 'allow', updatedInput: input }
    },
    toAutoClassifierInput() {
      return ''
    },
    userFacingName() {
      return name
    },
    mapToolResultToToolResultBlockParam(content, toolUseId) {
      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: typeof content === 'string' ? content : '',
      }
    },
    renderToolUseMessage() {
      return null
    },
  } as Tool
}

function createContext(tools: Tool[]): ToolUseContext {
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'gpt-5.4-codex',
      tools,
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: true,
      agentDefinitions: { agents: [], errors: [] },
      querySource: 'repl_main_thread',
    },
    abortController: new AbortController(),
    messages: [],
    readFileState: {},
    getAppState: () => ({
      toolPermissionContext: getEmptyToolPermissionContext(),
      sessionHooks: new Map(),
    }),
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
  } as unknown as ToolUseContext
}

function collectToolResults(messages: Message[]) {
  return messages.flatMap(message => {
    if (message.type !== 'user' || !Array.isArray(message.message.content)) {
      return []
    }
    return message.message.content.flatMap(block =>
      block.type === 'tool_result'
        ? [{ id: block.tool_use_id, isError: block.is_error === true }]
        : [],
    )
  })
}

test('parallel tools produce one terminal result each when one tool fails', async () => {
  const successTool = createTool('ParallelSuccess', 'success')
  const errorTool = createTool('ParallelError', 'error')
  const context = createContext([successTool, errorTool])
  const executor = new StreamingToolExecutor(
    [successTool, errorTool],
    (async () => ({ behavior: 'allow' })) as CanUseToolFn,
    context,
  )
  const assistant = createAssistantMessage({
    content: 'run parallel tools',
  }) as AssistantMessage

  executor.addTool(
    {
      type: 'tool_use',
      id: 'call_success',
      name: successTool.name,
      input: {},
    } as ToolUseBlock,
    assistant,
  )
  executor.addTool(
    {
      type: 'tool_use',
      id: 'call_error',
      name: errorTool.name,
      input: {},
    } as ToolUseBlock,
    assistant,
  )

  const messages: Message[] = []
  for await (const update of executor.getRemainingResults()) {
    if (update.message) messages.push(update.message)
  }

  const results = collectToolResults(messages)
  expect(results).toHaveLength(2)
  expect(results).toEqual(
    expect.arrayContaining([
      { id: 'call_success', isError: false },
      { id: 'call_error', isError: true },
    ]),
  )
})
