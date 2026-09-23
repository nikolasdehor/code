import React from 'react'
import { stringWidth } from '../ink/stringWidth.js'
import { Box, Text } from '../ink.js'
import type { NormalizedMessage } from '../types/message.js'
type Props = {
  message: NormalizedMessage;
  isTranscriptMode: boolean;
};
export function MessageModel({ message, isTranscriptMode }: Props) {
  if (
    message.type !== 'assistant' ||
    message.message.content.length === 0
  ) {
    return null
  }

  const requested = message.message.model
  const selected = message.message.metadata?.selected_model
  const display =
    typeof selected === 'string' && selected.length > 0
      ? `${requested} → ${selected}`
      : isTranscriptMode
        ? requested
        : null
  if (!display) return null

  return (
    <Box minWidth={stringWidth(display) + 8}>
      <Text dimColor>{display}</Text>
    </Box>
  )
}
