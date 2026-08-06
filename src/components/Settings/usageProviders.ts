import { readCodexCredentialsAsync } from '../../utils/codexCredentials.js'
import {
  hasCurrentClaudeRiskAcceptance,
  readClaudeNativeCredentialsAsync,
} from '../../utils/claudeNativeCredentials.js'

export type ConnectedUsageProviders = {
  codex: boolean
  claude: boolean
}

export async function getConnectedUsageProviders(): Promise<ConnectedUsageProviders> {
  const [codexCredentials, claudeCredentials] = await Promise.all([
    readCodexCredentialsAsync(),
    readClaudeNativeCredentialsAsync(),
  ])
  return {
    codex: Boolean(codexCredentials),
    claude: hasCurrentClaudeRiskAcceptance(claudeCredentials),
  }
}
