import { expect, test } from 'bun:test'

import { executeEffort, resolveAvailableEffortLevel } from './effort.js'

test('/effort accepts a level exposed by a regular Verboo model', () => {
  expect(resolveAvailableEffortLevel(['low', 'high'], 'low')).toBe('low')
})

test('/effort accepts a level exposed by an unlocked Codex model', () => {
  expect(
    resolveAvailableEffortLevel(['low', 'medium', 'high'], 'medium'),
  ).toBe('medium')
})

test('/effort rejects values unavailable for the selected model', () => {
  expect(executeEffort('high', 'missing-model')).toEqual({
    message: 'Reasoning is not supported for missing-model',
  })
})
