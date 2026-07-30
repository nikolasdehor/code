import { beforeEach, expect, mock, test } from 'bun:test'
import { HOOK_EVENTS } from './entrypoints/sdk/coreTypes.js'

let lspConnected = false

mock.module('./services/lsp/manager.js', () => ({
  getInitializationStatus: () => ({ status: 'success' }),
  getLspServerManager: () => undefined,
  isLspConnected: () => lspConnected,
  reinitializeLspServerManager: () => {},
  shutdownLspServerManager: async () => {},
  waitForInitialization: async () => {},
}))

// Several tools consume hook constants through the public SDK barrel. Mock the
// narrow runtime surface so this unit test does not initialize the SDK barrel
// and create a tools -> SDK -> tools import cycle.
mock.module('./entrypoints/agentSdkTypes.js', () => ({ HOOK_EVENTS }))

const { getAllBaseTools, getTools } = await import('./tools.js')
const { getEmptyToolPermissionContext } = await import('./Tool.js')

beforeEach(() => {
  lspConnected = false
})

test('LSPTool is part of the base tool pool', () => {
  expect(getAllBaseTools().map(tool => tool.name)).toContain('LSP')
})

test('LSPTool is filtered from usable tools until a server is connected', () => {
  const permissionContext = getEmptyToolPermissionContext()

  expect(getTools(permissionContext).map(tool => tool.name)).not.toContain('LSP')

  lspConnected = true

  expect(getTools(permissionContext).map(tool => tool.name)).toContain('LSP')
})
