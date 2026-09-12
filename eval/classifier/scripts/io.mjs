import { readFile, writeFile, mkdir, readdir, realpath } from 'node:fs/promises'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hash } from './validate/integrity.mjs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const checkedSnapshots = new Map()
export const root = process.env.ATRA_GOLD_ROOT ? resolve(process.env.ATRA_GOLD_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
export async function writeNew(path, data) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
}
export async function jsonFiles(directory) {
  try { return (await readdir(directory)).filter(n => n.endsWith('.json')).sort().map(n => resolve(directory, n)) }
  catch (error) { if (error.code === 'ENOENT') return []; throw error }
}
export async function safePath(base, relative) {
  const path = await realpath(resolve(base, relative))
  const canonical = await realpath(base)
  if (!path.startsWith(canonical + sep)) throw Error('path escapes benchmark sandbox')
  return path
}
export async function verifyLocalEvidence(episode, manifest) {
  const errors = []
  try {
    const path = await safePath(root, manifest.local_path)
    if (hash(await readFile(path)) !== manifest.checksum) errors.push('manifest local checksum mismatch')
    for (const source of episode.sources) {
      const [relative, pointer] = source.provenance.raw_reference.split('#')
      const raw = await readFile(await safePath(root, relative))
      if (hash(raw) !== source.provenance.raw_hash) errors.push('raw evidence checksum mismatch')
      const document = JSON.parse(raw)
      const value = pointer?.split('/').filter(Boolean).reduce((v, key) => v?.[key], document)
      if (document.extraction?.format === 'public-chat-xml/v1') {
        const archive = await safePath(root, document.extraction.archive_path)
        if (document.extraction.archive_path !== manifest.local_path) errors.push('chat archive manifest mismatch')
        const key = `${hash(raw)}:${manifest.checksum}`
        if (!checkedSnapshots.has(key)) {
          const script = fileURLToPath(new URL('./import/xml_snapshot.py', import.meta.url))
          checkedSnapshots.set(key, exec('python3', ['-B', script, 'verify', archive, await safePath(root, relative)], { maxBuffer: 2048 }))
        }
        await checkedSnapshots.get(key)
        if (!value || value.text !== source.content) errors.push('chat raw evidence content mismatch')
        if (source.source_url !== `${manifest.source_url}#${encodeURIComponent(document.extraction.member)}:message-${pointer.split('/').at(-1)}`) errors.push('chat raw evidence URL mismatch')
      } else {
        if (!value || [value.title, value.body].filter(Boolean).join('\n\n') !== source.content) errors.push('raw evidence content mismatch')
        if (value?.html_url !== source.source_url) errors.push('raw evidence URL mismatch')
      }
    }
  } catch { errors.push('local evidence missing or unsafe reference') }
  return errors
}
