import { expect, test } from 'bun:test'

import {
  parseCodexModelsResponse,
  requireCodexModel,
} from './codexModels.js'

const payload = {
  models: [
    {
      slug: 'gpt-codex-later',
      display_name: 'Later',
      priority: 20,
      visibility: 'hidden',
      supported_in_api: false,
      supported_reasoning_levels: [],
    },
    {
      slug: 'gpt-codex-first',
      display_name: 'First',
      priority: 1,
      supported_reasoning_levels: [
        { effort: 'low' },
        { effort: 'xhigh' },
      ],
    },
  ],
}

test('keeps every slug returned by the Codex models API', () => {
  const models = parseCodexModelsResponse(payload)

  expect(models.map(model => model.id)).toEqual([
    'gpt-codex-first',
    'gpt-codex-later',
  ])
  expect(models[1]).toMatchObject({
    visibility: 'hidden',
    supportedInApi: false,
  })
})

test('accepts exact API slugs and rejects arbitrary model values', () => {
  const models = parseCodexModelsResponse(payload)

  expect(requireCodexModel(models, 'gpt-codex-first')).toMatchObject({
    id: 'gpt-codex-first',
  })
  expect(() => requireCodexModel(models, 'GPT-CODEX-FIRST')).toThrow(
    "'GPT-CODEX-FIRST' não está disponível",
  )
  expect(() => requireCodexModel(models, 'anything')).toThrow(
    "'anything' não está disponível",
  )
})
