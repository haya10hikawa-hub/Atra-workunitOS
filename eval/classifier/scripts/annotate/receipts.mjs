import { readFile } from 'node:fs/promises'
import { root, readJson, safePath } from '../io.mjs'
import { annotationDigest, hash } from '../validate/integrity.mjs'

// Receipts establish local audit consistency, not cryptographic provider identity.
export async function verifyRunReceipts(episode) {
  const errors = []
  for (const [pass, id] of [['A', episode.annotation.run_id], ['B', episode.annotation.independent_review.run_id]]) {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) { errors.push('unsafe annotation run ID'); continue }
    try {
      const receipt = await readJson(await safePath(root, `gold_candidate_v0/runs/${id}/receipt.json`))
      const response = await readFile(await safePath(root, receipt.response_path))
      const request = await readFile(await safePath(root, receipt.request_path))
      if (receipt.run_id !== id || receipt.pass !== pass || receipt.status !== 'COMPLETED' || receipt.response_sha256 !== hash(response) || receipt.request_sha256 !== hash(request)) errors.push('annotation run receipt mismatch')
      const parsed = JSON.parse(response)
      if (pass === 'A' && annotationDigest(parsed) !== annotationDigest(episode)) errors.push('reconstruction response differs from accepted annotation')
      const prompt = JSON.parse(request)
      if (pass === 'A' && JSON.stringify(prompt.candidate?.sources) !== JSON.stringify(episode.sources)) errors.push('reconstruction request source mismatch')
      if (pass === 'B' && (prompt.annotation_digest !== annotationDigest(episode) || annotationDigest(prompt.episode) !== annotationDigest(episode))) errors.push('critic request annotation mismatch')
      if (pass === 'B' && JSON.stringify(parsed) !== JSON.stringify(episode.annotation.independent_review)) errors.push('critic response differs from accepted review')
      if (receipt.annotation_digest !== annotationDigest(episode)) errors.push('run receipt bound to a different annotation')
    } catch { errors.push(`missing or invalid actual Pass ${pass} run receipt`) }
  }
  return errors
}
