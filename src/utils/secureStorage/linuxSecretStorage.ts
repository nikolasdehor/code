import { execaSync } from 'execa'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { jsonParse, jsonStringify } from '../slowOperations.js'
import {
  CREDENTIALS_SERVICE_SUFFIX,
  getSecureStorageServiceName,
  getUsername,
} from './macOsKeychainHelpers.js'
import type { SecureStorage, SecureStorageData, SecureStorageReadResult } from './index.js'

// KWallet's Secret Service adapter accepts writes larger than this but
// truncates the stored secret at 8192 bytes while still returning success.
// Store a compact, versioned representation so the shared credentials record
// remains safe as provider accounts accumulate.
const KWalletSecretLimitBytes = 8192
const COMPRESSED_PAYLOAD_PREFIX = 'verboo-secure-v1:'

function encodePayload(data: SecureStorageData): string {
  const json = jsonStringify(data)
  return `${COMPRESSED_PAYLOAD_PREFIX}${deflateRawSync(Buffer.from(json, 'utf8')).toString('base64')}`
}

function decodePayload(payload: string): SecureStorageData {
  if (!payload.startsWith(COMPRESSED_PAYLOAD_PREFIX)) {
    return jsonParse(payload)
  }

  const encoded = payload.slice(COMPRESSED_PAYLOAD_PREFIX.length)
  const json = inflateRawSync(Buffer.from(encoded, 'base64')).toString('utf8')
  return jsonParse(json)
}

type SecretToolLookupRun =
  | { spawnFailed: true; exitCode: null; stdout: ''; stderr: '' }
  | { spawnFailed: false; exitCode: number; stdout: string; stderr: string }

/**
 * Classifies the outcome of a `secret-tool lookup` invocation.
 *
 * A spawn failure means the secret-tool binary is not installed: there is no
 * vault on this machine, so no native record exists and none can be shadowed.
 * It is classified as `missing` so the documented plaintext fallback engages.
 * It used to be an `error`, and the fail-closed path in
 * `preserveProviderAccountsOnSharedWrites` (index.ts) then refused to persist
 * a freshly obtained login token anywhere — customers on bare Linux images
 * (no libsecret-tools) experienced an endless re-login loop reporting
 * "Secret Service read failed.".
 *
 * A tool that ran but whose vault/service failed keeps the `error`
 * classification: a native record may still exist, and a fallback write must
 * not shadow it (see the delete-on-migration logic in fallbackStorage.ts).
 */
export function classifySecretToolLookup(outcome: {
  spawnFailed: boolean
  exitCode: number | null
}): 'ok' | 'missing' | 'vault-error' {
  if (outcome.spawnFailed) return 'missing'
  if (outcome.exitCode === 0) return 'ok'
  if (outcome.exitCode === 1) return 'missing'
  return 'vault-error'
}

function runSecretToolLookup(serviceName: string, username: string): SecretToolLookupRun {
  try {
    const result = execaSync(
      'secret-tool',
      ['lookup', 'service', serviceName, 'account', username],
      { reject: false },
    )
    // With reject:false, a missing binary RESOLVES (it does not throw) with
    // failed:true, code 'ENOENT' and an undefined exit code. A regular
    // non-zero exit (e.g. 1 for a missing item) always carries a number.
    if (typeof result.exitCode !== 'number') {
      return { spawnFailed: true, exitCode: null, stdout: '', stderr: '' }
    }
    return {
      spawnFailed: false,
      exitCode: result.exitCode,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    }
  } catch {
    return { spawnFailed: true, exitCode: null, stdout: '', stderr: '' }
  }
}

/**
 * Linux-specific secure storage implementation using the secret-tool CLI.
 * secret-tool interacts with the Secret Service API (GNOME Keyring, KWallet, etc.).
 */
export const linuxSecretStorage: SecureStorage = {
  name: 'libsecret',
  read(): SecureStorageData | null {
    const serviceName = getSecureStorageServiceName(CREDENTIALS_SERVICE_SUFFIX)
    const run = runSecretToolLookup(serviceName, getUsername())
    if (!run.spawnFailed && run.exitCode === 0 && run.stdout) {
      try {
        return decodePayload(run.stdout)
      } catch {
        // fall through
      }
    }
    return null
  },
  readResult(): SecureStorageReadResult {
    const serviceName = getSecureStorageServiceName(CREDENTIALS_SERVICE_SUFFIX)
    const run = runSecretToolLookup(serviceName, getUsername())
    const classification = classifySecretToolLookup(run)
    if (classification === 'ok') {
      if (!run.stdout) {
        return { kind: 'error', warning: 'Secret Service read failed.' }
      }
      try {
        return { kind: 'ok', data: decodePayload(run.stdout) }
      } catch {
        return { kind: 'error', warning: 'Secret Service returned malformed JSON.' }
      }
    }
    if (classification === 'missing') return { kind: 'missing' }
    return { kind: 'error', warning: run.stderr.trim() || 'Secret Service read failed.' }
  },
  async readAsync(): Promise<SecureStorageData | null> {
    // Reusing sync implementation for simplicity as it wraps a CLI call
    return this.read()
  },
  update(data: SecureStorageData): { success: boolean; warning?: string } {
    try {
      const username = getUsername()
      const serviceName = getSecureStorageServiceName(
        CREDENTIALS_SERVICE_SUFFIX,
      )
      const payload = encodePayload(data)
      if (Buffer.byteLength(payload, 'utf8') > KWalletSecretLimitBytes) {
        return {
          success: false,
          warning: 'Secure Service payload exceeds the Linux keyring limit.',
        }
      }
      // secret-tool store --label=[label] service [service] account [account]
      // The payload is passed via stdin
      const result = execaSync(
        'secret-tool',
        [
          'store',
          '--label',
          serviceName,
          'service',
          serviceName,
          'account',
          username,
        ],
        { input: payload, reject: false },
      )

      // A missing secret-tool binary resolves with failed:true and an
      // undefined exit code (see runSecretToolLookup), so this returns
      // success:false and fallbackStorage.update routes the write to the
      // plaintext fallback.
      return { success: result.exitCode === 0 }
    } catch {
      return { success: false }
    }
  },
  delete(): boolean {
    try {
      const username = getUsername()
      const serviceName = getSecureStorageServiceName(
        CREDENTIALS_SERVICE_SUFFIX,
      )
      // secret-tool clear service [service] account [account]
      const result = execaSync(
        'secret-tool',
        ['clear', 'service', serviceName, 'account', username],
        { reject: false },
      )
      return result.exitCode === 0
    } catch {
      return false
    }
  },
}
