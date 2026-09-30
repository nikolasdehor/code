/**
 * npm versions have emitted both an array and a single object for `npm pack
 * --json`. Normalize both shapes while rejecting output that cannot safely
 * describe the tarball consumed by the package verification step.
 */
export function parseNpmPackJson(stdout) {
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    throw new Error(`npm pack returned invalid JSON: ${error.message}`)
  }

  let pack = Array.isArray(parsed) ? parsed[0] : parsed
  // npm 12 can wrap the one packed workspace under its package name.
  if (pack && typeof pack === 'object' && typeof pack.filename !== 'string' && Object.keys(pack).length === 1) {
    const wrapped = Object.values(pack)[0]
    pack = Array.isArray(wrapped) ? wrapped[0] : wrapped
  }
  if (!pack || typeof pack !== 'object' || typeof pack.filename !== 'string' || !Array.isArray(pack.files)) {
    const shape = pack && typeof pack === 'object' ? `object fields: ${Object.keys(pack).join(', ') || '(none)'}` : typeof pack
    throw new Error(`npm pack returned JSON without a package filename and files list (${shape})`)
  }
  return pack
}
