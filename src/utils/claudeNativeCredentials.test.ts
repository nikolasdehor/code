import { expect, test } from 'bun:test'

import { CLAUDE_RISK_NOTICE_VERSION } from '../services/api/claudeNativeConfig.js'
import {
  hasCurrentClaudeRiskAcceptance,
  type ClaudeNativeCredentialBlob,
} from './claudeNativeCredentials.js'

function credentials(
  overrides: Partial<ClaudeNativeCredentialBlob> = {},
): ClaudeNativeCredentialBlob {
  return {
    accessToken: 'token',
    scopes: ['user:inference'],
    accountId: 'account-1',
    riskAcceptance: {
      version: CLAUDE_RISK_NOTICE_VERSION,
      acceptedAt: '2026-08-06T00:00:00.000Z',
      accountId: 'account-1',
    },
    ...overrides,
  }
}

test('requires the current notice version bound to the authenticated account', () => {
  expect(hasCurrentClaudeRiskAcceptance(credentials())).toBe(true)
  expect(
    hasCurrentClaudeRiskAcceptance(
      credentials({
        riskAcceptance: {
          version: CLAUDE_RISK_NOTICE_VERSION - 1,
          acceptedAt: '2026-08-06T00:00:00.000Z',
          accountId: 'account-1',
        },
      }),
    ),
  ).toBe(false)
  expect(
    hasCurrentClaudeRiskAcceptance(
      credentials({
        riskAcceptance: {
          version: CLAUDE_RISK_NOTICE_VERSION,
          acceptedAt: '2026-08-06T00:00:00.000Z',
          accountId: 'another-account',
        },
      }),
    ),
  ).toBe(false)
})
