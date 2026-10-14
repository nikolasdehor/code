import { spawn, type ChildProcess } from 'child_process'
import { isInBundledMode } from './bundledMode.js'

export const RESUME_HANDOFF_PARENT_PID_FLAG =
  '--internal-resume-handoff-parent-pid'
export const RESUME_HANDOFF_ENV_VAR = 'VERBOO_RESUME_HANDOFF'
const HANDOFF_READY_MESSAGE = 'verboo-resume-handoff-ready'

type IpcProcess = NodeJS.Process & {
  send?: (message: unknown, callback?: (error: Error | null) => void) => boolean
}

let resolveResumeHandoffReady: (() => void) | undefined
let resumeHandoffReadyPromise: Promise<void> | undefined
let pendingResumeHandoffChild: ChildProcess | undefined

// Install this before main() starts loading configuration. The old process
// may finish cleanup while the replacement is still importing the CLI.
if (
  process.argv.includes(RESUME_HANDOFF_PARENT_PID_FLAG) &&
  typeof (process as IpcProcess).send === 'function'
) {
  resumeHandoffReadyPromise = new Promise(resolve => {
    resolveResumeHandoffReady = resolve
  })

  const markReady = (message?: unknown) => {
    if (message !== HANDOFF_READY_MESSAGE && message !== undefined) return
    resolveResumeHandoffReady?.()
    process.off('message', markReady)
    process.off('disconnect', markReady)
  }

  process.on('message', markReady)
  process.once('disconnect', markReady)
}

// Only preserve model preferences when switching projects. Project settings,
// permissions, integrations, tools, and prompt context must be loaded from the
// selected project's own configuration.
const REUSABLE_VALUE_OPTIONS = new Set([
  '--model',
  '--fallback-model',
  '--effort',
  '--thinking',
  '--max-thinking-tokens',
])

/**
 * Relaunch the CLI in the selected session's project. The replacement waits
 * for this process to release Ink and finish session cleanup before it starts
 * rendering into the shared terminal.
 */
export function handoffToResume(
  projectPath: string,
  sessionId: string,
  exitApp: () => void,
): Promise<boolean> {
  const cliScript = process.argv[1]
  const bundled = isInBundledMode()
  if (!bundled && !cliScript) return Promise.resolve(false)

  const resumeArgs = [
    ...getReusableCliArgs(process.argv.slice(2)),
    RESUME_HANDOFF_PARENT_PID_FLAG,
    String(process.pid),
    '--resume',
    sessionId,
  ]
  const commandArgs = bundled ? resumeArgs : [cliScript!, ...resumeArgs]

  return new Promise(resolve => {
    let child: ChildProcess
    try {
      child = spawn(process.execPath, commandArgs, {
        cwd: projectPath,
        env: {
          ...process.env,
          [RESUME_HANDOFF_ENV_VAR]: '1',
        },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      })
    } catch {
      resolve(false)
      return
    }

    child.once('error', () => resolve(false))
    child.once('spawn', () => {
      pendingResumeHandoffChild = child
      process.env[RESUME_HANDOFF_ENV_VAR] = '1'
      try {
        exitApp()
        resolve(true)
      } catch {
        pendingResumeHandoffChild = undefined
        delete process.env[RESUME_HANDOFF_ENV_VAR]
        child.kill()
        resolve(false)
      }
    })
  })
}

/** Wait for the outgoing CLI to restore the terminal before rendering. */
export async function waitForResumeHandoffReady(): Promise<void> {
  const flagIndex = process.argv.indexOf(RESUME_HANDOFF_PARENT_PID_FLAG, 2)
  if (flagIndex === -1) return

  const parentPid = Number(process.argv[flagIndex + 1])
  process.argv.splice(flagIndex, 2)
  if (resumeHandoffReadyPromise) {
    await resumeHandoffReadyPromise
  } else if (Number.isSafeInteger(parentPid) && parentPid > 0 && parentPid !== process.pid) {
    while (isProcessRunning(parentPid)) {
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  delete process.env[RESUME_HANDOFF_ENV_VAR]
}

/** Keep the terminal-owning parent alive until the replacement exits. */
export function finishResumeHandoffAfterCleanup(
  exitCode: number,
  forceExit: (code: number) => never,
): boolean {
  const child = pendingResumeHandoffChild
  if (!child) return false

  pendingResumeHandoffChild = undefined

  if (child.exitCode !== null || child.signalCode !== null) {
    forceExit(child.exitCode ?? exitCode)
  }

  child.once('exit', code => forceExit(code ?? exitCode))

  const childWithIpc = child as ChildProcess & {
    connected?: boolean
    send?: (message: unknown, callback?: (error: Error | null) => void) => boolean
  }
  if (!childWithIpc.connected || typeof childWithIpc.send !== 'function') {
    child.kill()
    forceExit(exitCode)
  }

  childWithIpc.send(HANDOFF_READY_MESSAGE, error => {
    if (error) child.kill()
  })

  return true
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function getReusableCliArgs(args: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '--') break

    const option = arg.split('=', 1)[0]!
    if (!REUSABLE_VALUE_OPTIONS.has(option)) continue
    result.push(arg)

    if (arg.includes('=')) continue
    if (args[i + 1] && !args[i + 1]!.startsWith('-')) {
      result.push(args[++i]!)
    }
  }
  return result
}
