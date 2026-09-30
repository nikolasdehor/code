import { useSyncExternalStore, type ReactNode } from 'react'
import { Box, Text } from '../../ink.js'
import {
  getSessionGoalSnapshot,
  subscribeToSessionGoal,
  summarizeGoalObjective,
} from '../../utils/goals.js'

export function GoalIndicator(): ReactNode {
  const goal = useSyncExternalStore(
    subscribeToSessionGoal,
    getSessionGoalSnapshot,
    getSessionGoalSnapshot,
  )

  if (!goal || goal.status === 'complete') return null

  const label = goal.status === 'active' ? 'Goal active' : `Goal ${goal.status}`
  const color =
    goal.status === 'active'
      ? 'green'
      : goal.status === 'blocked'
        ? 'red'
        : 'yellow'

  return (
    <Box flexShrink={1} gap={1}>
      <Text color={color} bold>
        {label}:
      </Text>
      <Text dimColor wrap="truncate">
        {summarizeGoalObjective(goal.objective)}
      </Text>
    </Box>
  )
}
