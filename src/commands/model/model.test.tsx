import { beforeEach, expect, mock, test } from 'bun:test'

const models = [
  {
    id: 'gpt-codex-primary',
    displayName: 'Codex Primary',
    description: 'Primary model',
    supportedReasoningLevels: [],
    priority: 1,
  },
  {
    id: 'gpt-codex-hidden',
    displayName: 'Codex Hidden',
    description: 'Still returned by the account API',
    supportedReasoningLevels: [],
    visibility: 'hidden',
    supportedInApi: false,
    priority: 2,
  },
]
const verbooModels = [
  {
    id: 'verboo-default',
    displayName: 'Verboo Default',
    raw: {},
  },
]

const fetchCodexModels = mock(async () => models)
const assertCodexModelAvailable = mock(async (model: string) => {
  const match = models.find(candidate => candidate.id === model)
  if (!match) {
    throw new Error(
      `O modelo '${model}' não está disponível para esta conta Codex. Execute /model para escolher um modelo do catálogo atual.`,
    )
  }
  return match
})

mock.module('../../services/api/codexModels.js', () => ({
  assertCodexModelAvailable,
  clearCodexModelsCache: () => {},
  fetchCodexModels,
  getCachedCodexModels: () => models,
  getCodexModel: (model: string) =>
    models.find(candidate => candidate.id === model),
  getCodexReasoningEffort: () => undefined,
  getCodexReasoningLevels: () => [],
  parseCodexModelsResponse: () => models,
  requireCodexModel: assertCodexModelAvailable,
}))

mock.module('../../services/api/verbooModels.js', () => ({
  clearVerbooModelsCache: () => {},
  fetchVerbooModels: mock(async () => verbooModels),
  getCachedVerbooModels: () => verbooModels,
  getVerbooModelMeta: (modelId: string) =>
    verbooModels.find(model => model.id === modelId),
  getVerbooModelReasoning: () => undefined,
  getVerbooReasoningEffort: () => undefined,
}))

async function importFreshModelModule(
  suffix: string,
): Promise<typeof import('./model.js')> {
  return import(`./model.js?${suffix}`) as Promise<typeof import('./model.js')>
}

beforeEach(() => {
  fetchCodexModels.mockClear()
  assertCodexModelAvailable.mockClear()
})

test('/model rejects values absent from every unlocked catalog', async () => {
  const messages: string[] = []
  const setAppState = mock(() => {})
  const { call } = await importFreshModelModule('codex-reject-unknown')

  await call(
    message => {
      if (message) messages.push(message)
    },
    {
      getAppState: () => ({
        mainLoopModel: 'gpt-codex-primary',
        mainLoopModelForSession: null,
      }),
      setAppState,
    } as never,
    'arbitrary-model',
  )

  expect(setAppState).not.toHaveBeenCalled()
  expect(messages[0]).toContain("'arbitrary-model' não está disponível")
})

test('/model keeps Verboo available and adds every unlocked Codex model', async () => {
  const { call } = await importFreshModelModule('codex-all-api-models')
  const result = await call(() => {}, {} as never, '')

  expect(result).toBeTruthy()
  expect(
    (result as { props: { models: Array<{ id: string }> } }).props.models.map(
      model => model.id,
    ),
  ).toEqual(['verboo-default', 'gpt-codex-primary', 'gpt-codex-hidden'])
})

test('shouldAutoRefreshRouteCatalog preserves upstream discovery behavior', async () => {
  const { shouldAutoRefreshRouteCatalog } =
    await importFreshModelModule('descriptor-refresh-modes')

  expect(
    shouldAutoRefreshRouteCatalog({
      catalog: {
        source: 'dynamic',
        discovery: { kind: 'openai-compatible' },
        discoveryRefreshMode: 'manual',
      },
      hasCachedModels: true,
      staticEntryCount: 0,
      stale: true,
    }),
  ).toBe(false)
})
