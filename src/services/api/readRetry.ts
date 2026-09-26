/** Bounded GET-only retries. The caller classifies HTTP/network failures. */
export async function readWithRetry<T>(
  request: (signal: AbortSignal) => Promise<T>,
  classify: (error: unknown) => { retry: boolean; delayMs?: number },
  signal?: AbortSignal,
): Promise<T> {
  const deadline = Date.now() + 35_000
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted()
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => controller.abort(new DOMException('A consulta excedeu o prazo.', 'TimeoutError')), Math.min(10_000, Math.max(1, deadline - Date.now())))
    let failure: unknown
    try {
      const result = await request(controller.signal)
      controller.signal.throwIfAborted()
      return result
    } catch (error) {
      signal?.throwIfAborted()
      failure = controller.signal.aborted ? controller.signal.reason : error
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
    const decision = classify(failure)
    const delay = Math.max(0, decision.delayMs ?? (attempt + 1) * 300)
    if (attempt >= 2 || !decision.retry || Date.now() + delay >= deadline) throw failure
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(signal?.reason) }
      const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, delay)
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })
    })
  }
}

export const retryableReadStatus = new Set([408, 429, 500, 502, 503, 504])
export function retryAfterMilliseconds(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(String(value))
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}
