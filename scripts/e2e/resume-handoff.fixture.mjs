import { handoffToResume, waitForResumeHandoffReady, finishResumeHandoffAfterCleanup } from '../../src/utils/resumeHandoff.ts'

const handoffFlag = '--internal-resume-handoff-parent-pid'

if (process.argv.includes(handoffFlag)) {
  await waitForResumeHandoffReady()
  if (process.cwd() !== process.env.VERBOO_RESUME_HANDOFF_FIXTURE_TARGET) process.exit(3)
  if (!process.argv.includes('--resume') || !process.argv.includes('00000000-0000-4000-8000-000000000001')) process.exit(4)
  const childArgs = process.argv.slice(2)
  const projectScopedOptions = [
    '--permission-mode',
    '--dangerously-skip-permissions',
    '--allow-dangerously-skip-permissions',
    '--settings',
    '--setting-sources',
    '--add-dir',
    '--mcp-config',
    '--plugin-dir',
    '--agents',
    '--tools',
    '--allowed-tools',
    '--disallowed-tools',
    '--system-prompt',
    '--append-system-prompt',
    '--agent',
  ]
  if (childArgs.some(arg => projectScopedOptions.includes(arg.split('=', 1)[0]))) process.exit(5)
  if (!childArgs.includes('--model') || !childArgs.includes('sonnet')) process.exit(6)
  if (!childArgs.includes('--effort=high')) process.exit(7)
  if (childArgs.includes('/tmp/should-not-cross-project')) process.exit(8)
  process.stdin.setRawMode(true)
  process.stdout.write('HANDOFF_TTY_OK\n')
  process.stdin.setRawMode(false)
  process.exit(0)
}

if (process.argv.includes('--fixture-parent')) {
  process.stdin.setRawMode(true)
  const started = await handoffToResume(
    process.env.VERBOO_RESUME_HANDOFF_FIXTURE_TARGET,
    '00000000-0000-4000-8000-000000000001',
    () => {
      process.stdin.setRawMode(false)
      if (!finishResumeHandoffAfterCleanup(0, code => process.exit(code))) {
        throw new Error('Replacement child was not registered')
      }
    },
  )

  if (!started) process.exit(2)
}
