#!/usr/bin/env node
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { generateLocalJwt, resolveLocalJwtAuthority } from "./lib/localJwt.mjs"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const allowEnvOverride = process.argv.includes("--allow-env-override")

try {
  const authority = resolveLocalJwtAuthority(repoRoot, process.env, { allowEnvOverride })
  if (!authority.ok) {
    // Safe category only — the conflicting variable NAMES, never their values.
    console.error(`auth:jwt:local: FAIL — ${authority.reason}:${authority.conflicts.join(",")}`)
    process.exit(1)
  }
  const token = await generateLocalJwt(authority.env)
  process.stdout.write(`${token}\n`)
} catch (error) {
  console.error(`auth:jwt:local: FAIL — ${error instanceof Error ? error.message : "generation_failed"}`)
  process.exit(1)
}
