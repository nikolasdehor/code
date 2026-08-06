import { expect, test } from 'bun:test'

import {
  parseClaudeNativeModelsResponse,
  requireClaudeNativeModel,
} from './claudeNativeModels.js'

const payload = {
  data: [
    {
      id: 'claude-opus-current',
      display_name: 'Claude Opus Current',
      max_input_tokens: 200_000,
      max_tokens: 64_000,
      capabilities: {
        image_input: { supported: true },
        effort: {
          supported: true,
          low: { supported: true },
          high: { supported: true },
          max: { supported: false },
        },
      },
    },
    {
      id: 'claude-hidden-from-memory',
      display_name: 'Every API model is preserved',
    },
  ],
  has_more: false,
  last_id: 'claude-hidden-from-memory',
}

test('keeps every exact ID and capability returned by the Claude Models API', () => {
  const page = parseClaudeNativeModelsResponse(payload)

  expect(page.models.map(model => model.id)).toEqual([
    'claude-opus-current',
    'claude-hidden-from-memory',
  ])
  expect(page.models[0]).toMatchObject({
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    vision: true,
    supportedReasoningLevels: ['low', 'high'],
  })
})

test('accepts only exact IDs returned by the Claude Models API', () => {
  const { models } = parseClaudeNativeModelsResponse(payload)

  expect(requireClaudeNativeModel(models, 'claude-opus-current')).toMatchObject({
    id: 'claude-opus-current',
  })
  expect(() => requireClaudeNativeModel(models, 'CLAUDE-OPUS-CURRENT')).toThrow(
    "'CLAUDE-OPUS-CURRENT' não está disponível",
  )
  expect(() => requireClaudeNativeModel(models, 'anything')).toThrow(
    "'anything' não está disponível",
  )
})
