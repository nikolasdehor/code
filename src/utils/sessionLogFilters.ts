export type ProjectPathLog = {
  projectPath?: string
}

/**
 * Keep the worktree scope for same-project resume lists. The all-projects
 * view already spans worktrees and projects, so applying the current-worktree
 * filter there would hide the sessions that Ctrl+A is meant to reveal.
 */
export function filterSessionLogsByScope<T extends ProjectPathLog>(
  logs: T[],
  currentCwd: string,
  hasMultipleWorktrees: boolean,
  showAllWorktrees: boolean,
  showAllProjects: boolean,
): T[] {
  if (!hasMultipleWorktrees || showAllWorktrees || showAllProjects) {
    return logs
  }

  return logs.filter(log => log.projectPath === currentCwd)
}
