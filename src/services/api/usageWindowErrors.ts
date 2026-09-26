const codes = new Set(['usage_window_exhausted', 'usage_accounting_pending', 'usage_accounting_unavailable'])

/** These outcomes require user action or a window reset, even in persistent mode. */
export function isUsageWindowStop(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; error?: { code?: unknown }; message?: unknown }
  if (typeof value.code === 'string' && codes.has(value.code)) return true
  if (typeof value.error?.code === 'string' && codes.has(value.error.code)) return true
  if (typeof value.message !== 'string') return false
  const category = value.message.match(/\[openai_category=([a-z_]+)(?:,host=[^\]]+)?\]/)?.[1]
  return category !== undefined && codes.has(category)
}
