import { join } from 'path'
import { getSessionId } from '../bootstrap/state.js'
import { getClaudeConfigHomeDir } from './envUtils.js'
import { isENOENT } from './errors.js'
import { getFsImplementation } from './fsOperations.js'
import { writeFileSyncAndFlush_DEPRECATED } from './file.js'

export type GoalStatus = 'active' | 'paused' | 'blocked' | 'complete'

export type SessionGoal = {
  objective: string
  status: GoalStatus
  createdAt: string
  updatedAt: string
  blocker?: {
    reason: string
    key: string
    consecutiveTurns: number
    lastUserTurn: number
  }
}

const goalListeners = new Set<() => void>()
let goalSnapshotSessionId: string | null = null
let goalSnapshot: SessionGoal | null = null
let goalSnapshotInitialized = false

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

function getGoalFilePath(sessionId: string = getSessionId()): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Invalid session ID for goal storage')
  }
  return join(getClaudeConfigHomeDir(), 'goals', `${sessionId}.json`)
}

function isGoalStatus(value: unknown): value is GoalStatus {
  return (
    value === 'active' ||
    value === 'paused' ||
    value === 'blocked' ||
    value === 'complete'
  )
}

function parseGoal(value: unknown): SessionGoal | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Partial<SessionGoal>
  if (
    typeof candidate.objective !== 'string' ||
    !candidate.objective.trim() ||
    !isGoalStatus(candidate.status) ||
    typeof candidate.createdAt !== 'string' ||
    typeof candidate.updatedAt !== 'string'
  ) {
    return null
  }

  const blocker = candidate.blocker
  if (
    blocker !== undefined &&
    (typeof blocker !== 'object' ||
      blocker === null ||
      typeof blocker.reason !== 'string' ||
      typeof blocker.key !== 'string' ||
      typeof blocker.consecutiveTurns !== 'number' ||
      typeof blocker.lastUserTurn !== 'number')
  ) {
    return null
  }

  return candidate as SessionGoal
}

export function getSessionGoal(
  sessionId: string = getSessionId(),
): SessionGoal | null {
  const fs = getFsImplementation()
  try {
    const raw = fs.readFileSync(getGoalFilePath(sessionId), {
      encoding: 'utf8',
    })
    return parseGoal(JSON.parse(raw))
  } catch (error) {
    if (!isENOENT(error)) {
      // A damaged or unreadable goal should not prevent the user from working.
      return null
    }
    return null
  }
}

export function subscribeToSessionGoal(listener: () => void): () => void {
  goalListeners.add(listener)
  return () => goalListeners.delete(listener)
}

/** Stable snapshot for UI subscribers; updated whenever the current goal changes. */
export function getSessionGoalSnapshot(): SessionGoal | null {
  const sessionId = getSessionId()
  if (!goalSnapshotInitialized || goalSnapshotSessionId !== sessionId) {
    goalSnapshot = getSessionGoal(sessionId)
    goalSnapshotSessionId = sessionId
    goalSnapshotInitialized = true
  }
  return goalSnapshot
}

function publishSessionGoalChange(
  sessionId: string,
  goal: SessionGoal | null,
): void {
  if (sessionId === getSessionId()) {
    goalSnapshot = goal
    goalSnapshotSessionId = sessionId
    goalSnapshotInitialized = true
    for (const listener of goalListeners) listener()
  }
}

function saveGoal(goal: SessionGoal, sessionId: string = getSessionId()): void {
  const fs = getFsImplementation()
  const directory = join(getClaudeConfigHomeDir(), 'goals')
  fs.mkdirSync(directory, { mode: 0o700 })
  writeFileSyncAndFlush_DEPRECATED(
    getGoalFilePath(sessionId),
    `${JSON.stringify(goal, null, 2)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  )
  publishSessionGoalChange(sessionId, goal)
}

export function createSessionGoal(objective: string): SessionGoal {
  const normalizedObjective = objective.trim()
  if (!normalizedObjective) throw new Error('The goal cannot be empty')

  const existing = getSessionGoal()
  if (existing && existing.status !== 'complete') {
    throw new Error(
      `This session already has an unfinished goal (${existing.status}). Mark it complete with /goal complete before setting another one.`,
    )
  }

  const now = new Date().toISOString()
  const goal: SessionGoal = {
    objective: normalizedObjective,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  saveGoal(goal)
  return goal
}

/** Start or replace the goal from the interactive /goal command. */
export function startSessionGoal(objective: string): SessionGoal {
  const normalizedObjective = objective.trim()
  if (!normalizedObjective) throw new Error('The goal cannot be empty')

  const current = getSessionGoal()
  const now = new Date().toISOString()
  const goal: SessionGoal = {
    objective: normalizedObjective,
    status: 'active',
    createdAt:
      current?.objective === normalizedObjective && current.status !== 'complete'
        ? current.createdAt
        : now,
    updatedAt: now,
  }
  saveGoal(goal)
  return goal
}

export function clearSessionGoal(
  sessionId: string = getSessionId(),
): SessionGoal | null {
  const path = getGoalFilePath(sessionId)
  const goal = getSessionGoal(sessionId)
  try {
    getFsImplementation().unlinkSync(path)
  } catch (error) {
    if (!isENOENT(error)) throw error
  }
  publishSessionGoalChange(sessionId, null)
  return goal
}

export function summarizeGoalObjective(
  objective: string,
  maxChars = 54,
): string {
  if (!Number.isInteger(maxChars) || maxChars < 1) return ''
  const normalized = objective
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized.length <= maxChars) return normalized

  const prefix = normalized.slice(0, maxChars - 1)
  const lastSpace = prefix.lastIndexOf(' ')
  const summary = lastSpace >= Math.floor(maxChars * 0.6)
    ? prefix.slice(0, lastSpace)
    : prefix
  return `${summary.trimEnd()}…`
}

export function setSessionGoalStatus(
  status: 'active' | 'paused' | 'complete',
): SessionGoal | null {
  const current = getSessionGoal()
  if (!current || (current.status === 'complete' && status !== 'complete')) {
    return null
  }
  const goal: SessionGoal = {
    ...current,
    status,
    updatedAt: new Date().toISOString(),
    blocker: undefined,
  }
  saveGoal(goal)
  return goal
}

function normalizeBlocker(reason: string): string {
  return reason
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function recordGoalBlocker(
  reason: string,
  userTurn: number,
): { goal: SessionGoal | null; consecutiveTurns: number; blocked: boolean } {
  const current = getSessionGoal()
  if (!current || current.status !== 'active') {
    return { goal: current, consecutiveTurns: 0, blocked: false }
  }

  const normalizedReason = reason.trim()
  const key = normalizeBlocker(normalizedReason)
  if (!key) {
    return { goal: current, consecutiveTurns: 0, blocked: false }
  }

  const previous = current.blocker
  const isSameTurn = previous?.key === key && previous.lastUserTurn === userTurn
  const isNextTurn = previous?.key === key && previous.lastUserTurn === userTurn - 1
  const consecutiveTurns = isSameTurn
    ? previous.consecutiveTurns
    : isNextTurn
      ? previous.consecutiveTurns + 1
      : 1
  const blocked = consecutiveTurns >= 3
  const goal: SessionGoal = {
    ...current,
    status: blocked ? 'blocked' : 'active',
    updatedAt: new Date().toISOString(),
    blocker: {
      reason: normalizedReason,
      key,
      consecutiveTurns,
      lastUserTurn: userTurn,
    },
  }
  saveGoal(goal)
  return { goal, consecutiveTurns, blocked }
}

function quoteForReminder(value: string): string {
  return JSON.stringify(value).replace(/[<>&]/g, char => {
    switch (char) {
      case '<':
        return '\\u003c'
      case '>':
        return '\\u003e'
      default:
        return '\\u0026'
    }
  })
}

export function formatGoalReminder(goal: SessionGoal): string {
  const objective = quoteForReminder(goal.objective)
  if (goal.status === 'blocked') {
    return `## Persistent Goal (blocked)\n\nThe user set this goal for the current session: ${objective}\n\nThe same blocker was encountered on three consecutive turns: ${quoteForReminder(goal.blocker?.reason ?? '')}. Stop retrying actions that depend on it. Explain the blocker and ask the user for the change or information needed to continue. Resume work only after the user runs /goal resume or changes the goal.`
  }
  const blockerProgress = goal.blocker
    ? `\n\nA possible blocker has been recorded on ${goal.blocker.consecutiveTurns} of 3 consecutive user turns: ${quoteForReminder(goal.blocker.reason)}. Keep trying useful approaches. If this same blocker prevents meaningful progress for three consecutive turns, GoalUpdate can mark the goal blocked.`
    : ''
  return `## Persistent Goal\n\nThe user set this goal for the current session: ${objective}\n\nKeep working toward this objective across turns until it is complete or the user pauses it. Use GoalUpdate to mark it complete only after the objective has actually been achieved. Do not mark it paused unless the user explicitly asks to pause. Mark it blocked only after the same blocker recurs on three consecutive user turns and no useful progress is possible.${blockerProgress}`
}
