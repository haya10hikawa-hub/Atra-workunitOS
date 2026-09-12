import { createHash } from 'node:crypto'

// Deliberately fail closed instead of silently editing exact evidence spans.
export const sensitive = (value) => /-----BEGIN (?:\w+ )?PRIVATE KEY-----|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:sk-|gh[pousr]_)[A-Za-z0-9_-]{16,}|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:api[_-]?key|password|secret|authorization)\s*[:=]\s*["']?\S{8,}/i.test(value)
export function isPublicUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password &&
      /\./.test(url.hostname) && !/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[)/.test(url.hostname) && !/\.(?:local|internal)$/.test(url.hostname)
  } catch { return false }
}
export function sanitizePublicRecord(raw) {
  if (!raw || typeof raw.content !== 'string') throw Error('invalid public record')
  if (!isPublicUrl(raw.source_url)) throw Error('source must have a public HTTPS URL')
  if (sensitive(JSON.stringify(raw))) throw Error('sensitive data: quarantine source before annotation')
  const { author, ...record } = raw
  const id = createHash('sha256').update(String(author ?? raw.author_anonymized ?? 'unknown')).digest('hex').slice(0, 16)
  return Object.freeze({ ...structuredClone(record), author_anonymized: `author-${id}`,
    sanitization: { boundary: 'public-source-sandbox/v1', version: '1', trust: 'untrusted' } })
}
