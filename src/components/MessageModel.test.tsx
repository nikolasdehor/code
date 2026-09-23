import { expect, test } from 'bun:test'
import React from 'react'
import { renderToString } from '../utils/staticRender.js'
import { MessageModel } from './MessageModel.js'

test('shows the physical Jev choice during a normal CLI conversation', async () => {
  const message = {
    type: 'assistant',
    message: {
      model: 'jev-router',
      metadata: { selected_model: 'glm-5.3-flash' },
      content: [{ type: 'text', text: 'ok' }],
    },
  }
  const rendered = await renderToString(
    <MessageModel message={message} isTranscriptMode={false} />,
    80,
  )
  expect(rendered).toContain('jev-router → glm-5.3-flash')
})
