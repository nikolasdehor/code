import { describe, expect, test } from 'bun:test'
import { parseNpmPackJson } from './npm-pack-json.mjs'

describe('parseNpmPackJson', () => {
  const pack = { filename: 'verboo-code-1.2.3.tgz', files: [{ path: 'dist/cli.mjs' }] }

  test('accepts npm output as a one-item array', () => {
    expect(parseNpmPackJson(JSON.stringify([pack]))).toEqual(pack)
  })

  test('accepts npm output as a single object', () => {
    expect(parseNpmPackJson(JSON.stringify(pack))).toEqual(pack)
  })

  test('accepts npm output wrapped under the package name', () => {
    expect(parseNpmPackJson(JSON.stringify({ '@verboo/code': pack }))).toEqual(pack)
  })

  test('rejects malformed npm output', () => {
    expect(() => parseNpmPackJson('not json')).toThrow('npm pack returned invalid JSON')
    expect(() => parseNpmPackJson('{}')).toThrow('without a package filename and files list')
    expect(() => parseNpmPackJson('[]')).toThrow('without a package filename and files list')
  })
})
