import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import {
  getSessionGoal,
  recordGoalBlocker,
  setSessionGoalStatus,
} from '../../utils/goals.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { GOAL_UPDATE_TOOL_NAME } from './constants.js'
import { DESCRIPTION, PROMPT } from './prompt.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    status: z.enum(['complete', 'paused', 'blocked']).describe(
      'The new status for the current session goal',
    ),
    reason: z.string().optional().describe(
      'A concise explanation, required when marking the goal blocked',
    ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    message: z.string(),
    status: z.string().optional(),
    consecutiveTurns: z.number().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

type Output = z.infer<OutputSchema>

function countUserTurns(messages: Array<{ type: string; isMeta?: boolean }>): number {
  return messages.reduce(
    (count, message) =>
      message.type === 'user' && !message.isMeta ? count + 1 : count,
    0,
  )
}

export const GoalUpdateTool = buildTool({
  name: GOAL_UPDATE_TOOL_NAME,
  searchHint: 'update persistent session goal status',
  maxResultSizeChars: 10_000,
  strict: true,
  userFacingName() {
    return ''
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  toAutoClassifierInput(input) {
    return `${input.status}${input.reason ? `: ${input.reason}` : ''}`
  },
  renderToolUseMessage() {
    return null
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  async call({ status, reason }, context) {
    if (status === 'blocked' && !reason?.trim()) {
      return {
        data: {
          success: false,
          message: 'A concise reason is required when marking a goal blocked.',
        },
      }
    }

    if (context.agentId) {
      return {
        data: {
          success: false,
          message: 'Only the main session can update its persistent goal.',
        },
      }
    }

    const current = getSessionGoal()
    if (!current) {
      return {
        data: { success: false, message: 'No goal is set for this session.' },
      }
    }

    if (current.status !== 'active') {
      return {
        data: {
          success: false,
          status: current.status,
          message: `The goal is ${current.status}. Use /goal resume after the user is ready to continue.`,
        },
      }
    }

    if (status === 'blocked') {
      const result = recordGoalBlocker(
        reason ?? '',
        countUserTurns(context.messages),
      )
      if (!result.goal) {
        return {
          data: { success: false, message: 'No goal is set for this session.' },
        }
      }
      if (!result.blocked) {
        return {
          data: {
            success: false,
            status: result.goal.status,
            consecutiveTurns: result.consecutiveTurns,
            message: `The blocker was recorded for ${result.consecutiveTurns} of 3 consecutive user turns. Continue making useful progress where possible; do not describe the goal as blocked yet.`,
          },
        }
      }
      return {
        data: {
          success: true,
          status: result.goal.status,
          consecutiveTurns: result.consecutiveTurns,
          message: `Goal marked blocked after the same blocker recurred for three consecutive user turns: ${result.goal.blocker?.reason}`,
        },
      }
    }

    const goal = setSessionGoalStatus(status)
    if (!goal) {
      return {
        data: { success: false, message: 'The goal could not be updated.' },
      }
    }
    return {
      data: {
        success: true,
        status: goal.status,
        message:
          goal.status === 'complete'
            ? 'Goal marked complete.'
            : 'Goal paused because the user requested it.',
      },
    }
  },
  mapToolResultToToolResultBlockParam(output: Output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: jsonStringify(output),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
