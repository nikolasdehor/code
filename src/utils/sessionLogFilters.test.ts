import { expect, test } from 'bun:test'
import { filterSessionLogsByScope } from './sessionLogFilters.ts'

const currentWorktreeLog = { sessionId: 'current', projectPath: '/repo/main' }
const otherWorktreeLog = { sessionId: 'worktree', projectPath: '/repo/feature' }
const otherProjectLog = { sessionId: 'project', projectPath: '/other/project' }
const logs = [currentWorktreeLog, otherWorktreeLog, otherProjectLog]

test('all-projects scope includes other worktrees and projects', () => {
  expect(filterSessionLogsByScope(logs, '/repo/main', true, false, true)).toEqual(logs)
})

test('same-project scope still filters to the current worktree by default', () => {
  expect(filterSessionLogsByScope(logs, '/repo/main', true, false, false)).toEqual([
    currentWorktreeLog,
  ])
})

test('same-project scope includes all worktrees when requested', () => {
  expect(
    filterSessionLogsByScope(
      [currentWorktreeLog, otherWorktreeLog],
      '/repo/main',
      true,
      true,
      false,
    ),
  ).toEqual([currentWorktreeLog, otherWorktreeLog])
})
