/**
 * Public-repository boundary regression tests.
 *
 * These assert that the allowlist boundary defined in
 * config/public-repository-manifest.json stays in force, and that .gitignore
 * keeps protecting the private classes it is responsible for. A new tracked
 * file must force an explicit public-classification decision rather than
 * silently inheriting a default.
 *
 * See docs/release/PUBLIC_REPOSITORY_POLICY.md.
 */

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  globToRegExp,
  loadManifest,
  listTrackedPaths,
  trackedPathsDigest,
  classify,
  matchesAny,
  assertSafeRelativePath,
  findEscapingSymlinks,
} from "../scripts/lib/publicRepositoryManifest.mjs"

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"]).toString().trim()
const manifest = loadManifest(repoRoot)
const tracked = listTrackedPaths(repoRoot)

function checkIgnored(relPath: string): boolean {
  try {
    execFileSync("git", ["-C", repoRoot, "check-ignore", "-q", "--no-index", "--", relPath], {
      stdio: "ignore",
    })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Manifest integrity
// ---------------------------------------------------------------------------

test("the manifest is the authoritative allowlist and is well formed", () => {
  assert.equal(manifest.schemaVersion, "atra-public-repository-manifest-v1")
  assert.ok(manifest.rules.length > 0)
  for (const rule of manifest.rules) {
    assert.ok(rule.pattern, "every rule declares a pattern")
    assert.ok(["include", "exclude"].includes(rule.disposition))
    assert.ok(rule.classification, `rule ${rule.pattern} declares a classification`)
    assert.ok(rule.action, `rule ${rule.pattern} declares an action`)
    assert.ok(rule.reason.length >= 10, `rule ${rule.pattern} explains itself`)
  }
})

test("inclusion is allowlist-based, never denylist-based", () => {
  // A path nobody thought about must NOT come out public.
  const invented = "some/unthought/of/new-directory/file.ts"
  const rule = classify(manifest, invented)
  assert.equal(rule, null, "an unanticipated path matches no rule and is therefore not public")
})

// ---------------------------------------------------------------------------
// Every tracked path is classified
// ---------------------------------------------------------------------------

test("every tracked path resolves to exactly one classification rule", () => {
  const unclassified = tracked.filter((p) => classify(manifest, p) === null)
  assert.deepEqual(
    unclassified,
    [],
    `unclassified tracked paths must be classified in config/public-repository-manifest.json`,
  )
})

test("a new or removed tracked path forces an explicit decision", () => {
  assert.equal(
    trackedPathsDigest(tracked),
    manifest.trackedPathsDigest,
    "the tracked path set changed: classify the new path(s) and update trackedPathsDigest",
  )
  assert.equal(manifest.trackedPathCount, tracked.length)
})

// ---------------------------------------------------------------------------
// Forbidden material is not tracked
// ---------------------------------------------------------------------------

test("no forbidden path is tracked", () => {
  const offenders = tracked.filter((p) => matchesAny(manifest.forbidden, p))
  assert.deepEqual(offenders, [])
})

test("the tracked tree carries no agent, evidence, or local-state directory", () => {
  for (const prefix of [".hermes/", "evidence/", ".d1-evidence/", ".claude/", ".codex/", ".atra/", ".open-next/", ".wrangler/"]) {
    const offenders = tracked.filter((p) => p.startsWith(prefix))
    assert.deepEqual(offenders, [], `${prefix} must not be tracked`)
  }
})

test("no environment file, private key, or local database is tracked", () => {
  const offenders = tracked.filter((p) =>
    /(^|\/)\.env($|\.)|(^|\/)\.dev\.vars$|\.(pem|key|p12|pfx|crt|cer|jks|keystore|sqlite|sqlite3|db)$/.test(p),
  )
  assert.deepEqual(offenders, [])
})

test("no generated deploy config or operator bootstrap SQL is tracked", () => {
  const offenders = tracked.filter((p) => /wrangler\.deploy.*\.json$|bootstrap\.control.*\.sql$/.test(p))
  assert.deepEqual(offenders, [])
})

test("no tracked file is already ignored by the current rules", () => {
  const out = execFileSync("git", ["-C", repoRoot, "ls-files", "-ci", "--exclude-standard", "-z"])
    .toString()
    .split("\0")
    .filter(Boolean)
  assert.deepEqual(out, [])
})

// ---------------------------------------------------------------------------
// .gitignore is a security contract
// ---------------------------------------------------------------------------

test(".gitignore exists and is tracked", () => {
  assert.ok(existsSync(path.join(repoRoot, ".gitignore")))
  assert.ok(tracked.includes(".gitignore"))
})

test(".gitignore protects every required private class", () => {
  const mustBeIgnored = [
    ".hermes/plan.md",
    ".claude/settings.json",
    ".atra/state.json",
    "evidence/run-1/result-manifest.json",
    ".d1-evidence/pack.json",
    ".env",
    ".env.production",
    ".dev.vars",
    "secret.pem",
    "secret.key",
    "server.p12",
    "local.sqlite",
    "local.db",
    "wrangler.deploy.json",
    "bootstrap.control.sql",
    "public-export/index.js",
    "release-staging/x.txt",
    ".wrangler/state/d1/db.sqlite",
    "node_modules/x/index.js",
    ".next/build.js",
    ".open-next/worker.js",
  ]
  for (const probe of mustBeIgnored) {
    assert.ok(checkIgnored(probe), `${probe} must be ignored`)
  }
})

test(".hermes/ cannot be silently recommitted after removal", () => {
  assert.ok(checkIgnored(".hermes/plan.md"))
  assert.ok(checkIgnored(".hermes/nested/anything.json"))
  assert.deepEqual(tracked.filter((p) => p.startsWith(".hermes/")), [])
})

test(".gitignore is not so broad that it hides legitimate source", () => {
  const mustRemainTrackable = [
    "app/lib/example.ts",
    "app/components/Example.tsx",
    "scripts/example.mjs",
    "tests/example.test.mts",
    "docs/EXAMPLE.md",
    "migrations/9999_example.sql",
    "config/public-repository-manifest.json",
    "public/example.svg",
    ".env.example",
    ".gitignore",
    "README.md",
  ]
  for (const probe of mustRemainTrackable) {
    assert.ok(!checkIgnored(probe), `${probe} must remain trackable`)
  }
})

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

test("no tracked symlink escapes the repository root", () => {
  assert.deepEqual(findEscapingSymlinks(repoRoot, tracked), [])
})

test("path traversal and absolute paths are rejected before any copy", () => {
  assert.throws(() => assertSafeRelativePath("../outside.txt"), /path_traversal/)
  assert.throws(() => assertSafeRelativePath("app/../../outside.txt"), /path_traversal/)
  assert.throws(() => assertSafeRelativePath("/etc/passwd"), /path_absolute/)
  assert.equal(assertSafeRelativePath("app/lib/x.ts"), "app/lib/x.ts")
})

test("glob translation is anchored and segment-aware", () => {
  assert.ok(globToRegExp("app/**").test("app/lib/x.ts"))
  assert.ok(!globToRegExp("app/**").test("other/app/lib/x.ts"))
  assert.ok(globToRegExp("**/*.pem").test("a/b/key.pem"))
  assert.ok(globToRegExp("**/*.pem").test("key.pem"))
  assert.ok(!globToRegExp("docs/*.md").test("docs/specs/API_CONTRACT.md"))
  assert.ok(globToRegExp("docs/*.md").test("docs/README.md"))
})

// ---------------------------------------------------------------------------
// Content safety of the public set
// ---------------------------------------------------------------------------

const publicPaths = tracked.filter((p) => {
  const rule = classify(manifest, p)
  return rule !== null && rule.disposition === "include"
})

test("no public file carries a developer machine path", () => {
  const allow = new Set(
    (manifest.forbiddenContent ?? []).find((r: { id: string }) => r.id === "personal_machine_path")
      ?.allowPaths ?? [],
  )
  const offenders: string[] = []
  for (const rel of publicPaths) {
    if (allow.has(rel)) continue
    const buf = readFileSync(path.join(repoRoot, rel))
    if (buf.includes(0)) continue
    if (/\/(?:Users|home)\/(?!runner\/)[A-Za-z0-9._-]+\//.test(buf.toString("utf8"))) {
      offenders.push(rel)
    }
  }
  assert.deepEqual(offenders, [])
})

test("the two allowed machine-path files are negative security fixtures, not leaks", () => {
  // They must assert REJECTION. If the assertion disappears, the allowance is
  // no longer justified and this test fails.
  const a = readFileSync(path.join(repoRoot, "tests/d1evidenceRecorder.test.mts"), "utf8")
  const b = readFileSync(path.join(repoRoot, "tests/d1migrationOperatorGates.test.mts"), "utf8")
  assert.match(a, /sensitive_value_filesystem_path/)
  assert.match(b, /contains_absolute_path/)
})

test("wrangler.json remains a placeholder template with no real database id", () => {
  const text = readFileSync(path.join(repoRoot, "wrangler.json"), "utf8")
  assert.match(text, /REPLACE_WITH_CONTROL_DB_ID/)
  assert.match(text, /REPLACE_WITH_TENANT_DB_ID/)
  assert.doesNotMatch(
    text,
    /"database_id"\s*:\s*"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/i,
    "a concrete D1 database id must never be committed",
  )
})

test("no public markdown document links to an excluded path", () => {
  const publicSet = new Set(publicPaths)
  const trackedSet = new Set(tracked)
  const offenders: string[] = []
  for (const rel of publicPaths) {
    if (!rel.endsWith(".md")) continue
    const text = readFileSync(path.join(repoRoot, rel), "utf8")
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      let target = m[1]
      if (/^(https?:|mailto:|#|tel:)/.test(target)) continue
      target = target.split("#")[0]
      if (!target) continue
      if (path.isAbsolute(target)) {
        offenders.push(`${rel} -> ${target} (absolute)`)
        continue
      }
      const resolved = path.normalize(path.join(path.dirname(rel), target))
      if (trackedSet.has(resolved) && !publicSet.has(resolved)) {
        offenders.push(`${rel} -> ${resolved}`)
      }
    }
  }
  assert.deepEqual(offenders, [])
})

test("no oversized unexpected binary is public", () => {
  const limit = manifest.maxBinaryBytes ?? 1048576
  const offenders: string[] = []
  for (const rel of publicPaths) {
    const buf = readFileSync(path.join(repoRoot, rel))
    if (buf.includes(0) && buf.length > limit) offenders.push(`${rel} (${buf.length})`)
  }
  assert.deepEqual(offenders, [])
})

// ---------------------------------------------------------------------------
// Sensitive material stays private
// ---------------------------------------------------------------------------

test("known private and sensitive documents are excluded from the public set", () => {
  const mustBePrivate = [
    "AGENTS.md",
    "AI_JUDGMENT_CRITERIA.md",
    "NODE_DECOMPOSITION_POLICY.md",
    "NODE_DECOMPOSITION_WHITEBOARD.md",
    "docs/security/REDTEAM_2026-06-29.md",
    "docs/operations/CODEX_AUTOMATION_PROMPTS.md",
    "docs/BRANCH_PROTECTION_POLICY.md",
    "docs/RISK_REGISTER.md",
    "scripts/loop/index.mts",
    "prototypes/proactive-voice-secretary/engine.mts",
  ]
  for (const rel of mustBePrivate) {
    assert.ok(tracked.includes(rel), `${rel} is expected to still be tracked privately`)
    const rule = classify(manifest, rel)
    assert.equal(rule?.disposition, "exclude", `${rel} must not be public`)
  }
})

test("a private script and the test that covers it move together", () => {
  // Keeping a test whose subject is excluded would break the public test
  // contract, because `npm test` globs tests/*.test.mts.
  const pairs: Array<[string, string]> = [
    ["scripts/loop/index.mts", "tests/loopStatusCollector.test.mts"],
    ["prototypes/proactive-voice-secretary/engine.mts", "tests/proactiveVoiceSecretary.test.mts"],
  ]
  for (const [subject, spec] of pairs) {
    assert.equal(classify(manifest, subject)?.disposition, "exclude")
    assert.equal(classify(manifest, spec)?.disposition, "exclude", `${spec} must move with ${subject}`)
  }
})

test("migrations, lockfile, and security fixtures are never excluded", () => {
  const mustBePublic = [
    "migrations/manifest.json",
    "migrations/schema-contract.json",
    "package-lock.json",
    ".gitignore",
    "tests/tenantIsolationRoutes.test.mts",
    "tests/csrfProtection.test.mts",
    "tests/redteamHardeningP0.test.mts",
  ]
  for (const rel of mustBePublic) {
    assert.ok(tracked.includes(rel), `${rel} must exist`)
    assert.equal(classify(manifest, rel)?.disposition, "include", `${rel} must stay public`)
  }
})
