#!/usr/bin/env node
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { formatLocalJwtVerification, resolveLocalJwtAuthority, verifyLocalJwt } from "./lib/localJwt.mjs"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const allowEnvOverride = process.argv.includes("--allow-env-override")
// Only positional args (after node + script) are candidate tokens; flags are skipped.
const token = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? process.env.JWT

try {
  const authority = resolveLocalJwtAuthority(repoRoot, process.env, { allowEnvOverride })
  if (!authority.ok) {
    console.error(`auth:jwt:verify-local: FAIL — ${authority.reason}:${authority.conflicts.join(",")}`)
    process.exit(1)
  }
  const result = await verifyLocalJwt(token, authority.env)
  process.stdout.write(`${formatLocalJwtVerification(result)}\n`)
  if (!result.ok) process.exit(1)
} catch {
  console.error("auth:jwt:verify-local: FAIL — verification_failed")
  process.exit(1)
}
