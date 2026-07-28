export interface TaskProgressItem {
  id?: string
  type: string
  outputOffset?: number
}

export interface WatchdogState {
  initialized: boolean
  lastProgressMs: number
  lastHeartbeatLogMs: number
  loggedStall: boolean
  prevTaskSnapshot: string
  prevSdkEventCount: number
}

export const WAITING_HEARTBEAT_MS = 30_000
export const WAITING_STALL_TIMEOUT_MS = 180_000

export function createWatchdogState(nowMs: number = Date.now()): WatchdogState {
  return {
    initialized: false,
    lastProgressMs: nowMs,
    lastHeartbeatLogMs: 0,
    loggedStall: false,
    prevTaskSnapshot: '',
    prevSdkEventCount: 0,
  }
}

export function computeTaskSnapshot(tasks: TaskProgressItem[]): string {
  return tasks
    .map(t => `${t.id ?? t.type}:${t.outputOffset ?? 0}`)
    .sort()
    .join(',')
}

export interface WatchdogTickResult {
  action: 'none' | 'heartbeat' | 'stall'
  elapsedMs: number
  taskSnapshot: string
}

export type LogDiagnosticsFn = (
  level: 'info' | 'warn',
  event: string,
  details: Record<string, unknown>,
) => void

export function tickWaitingWatchdog(
  state: WatchdogState,
  tasks: TaskProgressItem[],
  sdkEventCount: number,
  logFn?: LogDiagnosticsFn,
  nowMs: number = Date.now(),
): WatchdogTickResult {
  const currentSnapshot = computeTaskSnapshot(tasks)

  const isInitialRun = !state.initialized

  if (isInitialRun) {
    state.initialized = true
    state.prevTaskSnapshot = currentSnapshot
    state.prevSdkEventCount = sdkEventCount
    // Initialize lastProgressMs on first tick so elapsed time starts
    // from when waiting_for_agents actually begins, not from when the
    // state was created. Prevents false stall when waiting_for_agents
    // starts late (H4 fix).
    state.lastProgressMs = nowMs
  } else {
    const snapshotChanged = currentSnapshot !== state.prevTaskSnapshot
    const sdkEventsArrived = sdkEventCount !== state.prevSdkEventCount

    if (snapshotChanged || sdkEventsArrived) {
      state.prevTaskSnapshot = currentSnapshot
      state.prevSdkEventCount = sdkEventCount
      state.lastProgressMs = nowMs
      state.loggedStall = false
    }
  }

  const elapsedMs = nowMs - state.lastProgressMs

  if (elapsedMs >= WAITING_STALL_TIMEOUT_MS) {
    if (!state.loggedStall) {
      state.loggedStall = true
      logFn?.('warn', 'waiting_for_agents_stalled', {
        timeout_ms: WAITING_STALL_TIMEOUT_MS,
        elapsed_ms: elapsedMs,
        task_snapshot: currentSnapshot,
      })
      return { action: 'stall', elapsedMs, taskSnapshot: currentSnapshot }
    }
    return { action: 'none', elapsedMs, taskSnapshot: currentSnapshot }
  }

  if (
    state.lastProgressMs > 0 &&
    elapsedMs >= WAITING_HEARTBEAT_MS &&
    nowMs - state.lastHeartbeatLogMs >= WAITING_HEARTBEAT_MS
  ) {
    state.lastHeartbeatLogMs = nowMs
    logFn?.('info', 'waiting_for_agents', {
      elapsed_ms: elapsedMs,
      task_snapshot: currentSnapshot,
    })
    return { action: 'heartbeat', elapsedMs, taskSnapshot: currentSnapshot }
  }

  return { action: 'none', elapsedMs, taskSnapshot: currentSnapshot }
}
