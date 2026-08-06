import * as React from 'react'
import { useEffect, useState } from 'react'

import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import {
  buildClaudeNativeUsageRows,
  fetchClaudeNativeUsage,
} from '../../services/api/claudeNativeUsage.js'
import type { Utilization } from '../../services/api/usage.js'
import { formatResetText } from '../../utils/format.js'
import { logError } from '../../utils/log.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { Byline } from '../design-system/Byline.js'
import { ProgressBar } from '../design-system/ProgressBar.js'

function UsageBar({
  label,
  utilization,
  resetsAt,
  maxWidth,
}: {
  label: string
  utilization: number
  resetsAt: string | null
  maxWidth: number
}): React.ReactNode {
  const usedPercent = Math.max(0, Math.min(100, utilization))
  const resetText = resetsAt
    ? `Resets ${formatResetText(resetsAt, true, true)}`
    : undefined
  return (
    <Box flexDirection="column">
      <Text bold>{label}</Text>
      <Box flexDirection={maxWidth >= 62 ? 'row' : 'column'} gap={1}>
        <ProgressBar
          ratio={usedPercent / 100}
          width={maxWidth >= 62 ? 50 : maxWidth}
          fillColor="rate_limit_fill"
          emptyColor="rate_limit_empty"
        />
        <Text>{Math.floor(usedPercent)}% used</Text>
      </Box>
      {resetText ? <Text dimColor>{resetText}</Text> : null}
    </Box>
  )
}

function ExtraUsageSummary({ usage }: { usage: Utilization }): React.ReactNode {
  const extra = usage.extra_usage
  if (!extra?.is_enabled) return null
  if (extra.monthly_limit === null) {
    return <Text><Text bold>Extra usage</Text><Text dimColor> · Unlimited</Text></Text>
  }
  if (extra.utilization === null) return null
  return (
    <Text>
      <Text bold>Extra usage</Text>
      <Text dimColor> · {Math.floor(extra.utilization)}% used</Text>
    </Text>
  )
}

export function ClaudeNativeUsage({
  showCancelHint = true,
}: {
  showCancelHint?: boolean
}): React.ReactNode {
  const [usage, setUsage] = useState<Utilization | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { columns } = useTerminalSize()
  const maxWidth = Math.min(columns - 2, 80)

  const loadUsage = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setUsage(await fetchClaudeNativeUsage())
    } catch (err) {
      logError(err as Error)
      setError(err instanceof Error ? err.message : 'Failed to load Claude usage')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsage()
  }, [loadUsage])

  useKeybinding('settings:retry', () => void loadUsage(), {
    context: 'Settings',
    isActive: !!error && !isLoading,
  })

  if (error) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="error">Error: {error}</Text>
        {showCancelHint ? (
          <Text dimColor>
            <Byline>
              <ConfigurableShortcutHint action="settings:retry" context="Settings" fallback="r" description="retry" />
              <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="cancel" />
            </Byline>
          </Text>
        ) : null}
      </Box>
    )
  }
  if (!usage) {
    return <Text dimColor>Loading Claude usage data…</Text>
  }

  const rows = buildClaudeNativeUsageRows(usage)
  return (
    <Box flexDirection="column" gap={1} width="100%">
      {rows.length === 0 ? (
        <Text dimColor>Claude usage data is not available for this account.</Text>
      ) : null}
      {rows.map(row => (
        <UsageBar
          key={row.label}
          label={row.label}
          utilization={row.limit.utilization ?? 0}
          resetsAt={row.limit.resets_at}
          maxWidth={maxWidth}
        />
      ))}
      <ExtraUsageSummary usage={usage} />
      {showCancelHint ? (
        <Text dimColor>
          <ConfigurableShortcutHint action="confirm:no" context="Settings" fallback="Esc" description="cancel" />
        </Text>
      ) : null}
    </Box>
  )
}
