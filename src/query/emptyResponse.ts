export const MAX_EMPTY_MODEL_RESPONSE_RETRIES = 1

export type EmptyModelResponseDisposition = 'continue' | 'retry' | 'error'

/**
 * Decide how the query loop handles a completed model request that emitted no
 * assistant message. An aborted stream and any response containing an
 * assistant message follow the normal query path.
 */
export function getEmptyModelResponseDisposition({
  assistantMessageCount,
  retryCount,
  aborted,
}: {
  assistantMessageCount: number
  retryCount: number
  aborted: boolean
}): EmptyModelResponseDisposition {
  if (aborted || assistantMessageCount > 0) return 'continue'
  return retryCount < MAX_EMPTY_MODEL_RESPONSE_RETRIES ? 'retry' : 'error'
}
