import { beforeEach, expect, mock, test } from 'bun:test'
import type { ToolPermissionContext } from './Tool.js'

let lspConnected = false

mock.module('./services/lsp/manager.js', () => ({
  getInitializationStatus: () => ({ status: 'success' }),
  getLspServerManager: () => undefined,
  isLspConnected: () => lspConnected,
  reinitializeLspServerManager: () => {},
  shutdownLspServerManager: async () => {},
  waitForInitialization: async () => {},
}))

const { getAllBaseTools, getTools } = await import('./tools.js')

beforeEach(() => {
  lspConnected = false
})

test('LSPTool is part of the base tool pool', () => {
  expect(getAllBaseTools().map(tool => tool.name)).toContain('LSP')
})

test('LSPTool is filtered from usable tools until a server is connected', () => {
  const permissionContext: ToolPermissionContext = {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }

  expect(getTools(permissionContext).map(tool => tool.name)).not.toContain('LSP')

  lspConnected = true

  expect(getTools(permissionContext).map(tool => tool.name)).toContain('LSP')
})
