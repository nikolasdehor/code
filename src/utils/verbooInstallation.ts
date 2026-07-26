import { randomUUID } from 'crypto'
import { getSecureStorage } from './secureStorage/index.js'

// A generated installation UUID isolates native OAuth sessions without reading
// hardware identifiers. It deliberately survives logout so a later login
// replaces the session for this installation instead of accumulating tokens.
export function getOrCreateVerbooInstallationId(): string {
  const storage = getSecureStorage()
  const current = storage.read() ?? {}
  if (current.verbooInstallationId) return current.verbooInstallationId

  const installationId = randomUUID()
  // Refresh persistence below remains the authoritative failure boundary. If
  // this preliminary write fails, the caller can still finish its normal
  // atomic token-save path and report storage_error rather than masking it as
  // a network failure.
  storage.update({ ...current, verbooInstallationId: installationId })
  return installationId
}
