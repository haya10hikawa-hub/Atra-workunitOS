#!/usr/bin/env node
/**
 * Verify the Atra public-repository boundary.
 *
 *   node scripts/verify-public-repository.mjs --check-current
 *     Check the CURRENT tracked tree against config/public-repository-manifest.json.
 *
 *   node scripts/verify-public-repository.mjs --check-export <dir>
 *     Check an exported snapshot directory produced by export-public-repository.mjs.
 *
 * Read-only: never writes, never deletes, never touches the network.
 * Exits non-zero with an explicit failure list when the boundary is violated.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  loadManifest,
  listTrackedPaths,
  trackedPathsDigest,
  classifyAll,
  classify,
  matchesAny,
  globToRegExp,
  findEscapingSymlinks,
} from "./lib/publicRepositoryManifest.mjs";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: path.dirname(new URL(import.meta.url).pathname),
})
  .toString()
  .trim();

const failures = [];
const notes = [];
const fail = (code, detail) => failures.push({ code, detail });

/** Paths whose ignore protection must hold, probed with synthetic filenames. */
const REQUIRED_IGNORED_PROBES = [
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
  "wrangler.deploy.bootstrap-exec-abc.json",
  "bootstrap.control.sql",
  "public-export/index.js",
  "release-staging/x.txt",
  ".wrangler/state/d1/db.sqlite",
  "node_modules/x/index.js",
  ".next/build.js",
  ".open-next/worker.js",
];

/** Paths that must REMAIN trackable — proof the ignore rules are not too broad. */
const REQUIRED_TRACKABLE_PROBES = [
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
];

function gitCheckIgnore(relPath) {
  try {
    execFileSync("git", ["-C", repoRoot, "check-ignore", "-q", "--no-index", "--", relPath], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function checkGitignoreContract() {
  if (!existsSync(path.join(repoRoot, ".gitignore"))) {
    fail("GITIGNORE_MISSING", ".gitignore must exist; it is a security contract.");
    return;
  }
  for (const probe of REQUIRED_IGNORED_PROBES) {
    if (!gitCheckIgnore(probe)) {
      fail("GITIGNORE_DOES_NOT_PROTECT", probe);
    }
  }
  for (const probe of REQUIRED_TRACKABLE_PROBES) {
    if (gitCheckIgnore(probe)) {
      fail("GITIGNORE_TOO_BROAD", `${probe} must remain trackable but is ignored.`);
    }
  }
}

function checkClassificationCoverage(manifest, tracked) {
  const classified = classifyAll(manifest, tracked);
  const unclassified = classified.filter((c) => !c.rule).map((c) => c.path);
  for (const p of unclassified) fail("UNCLASSIFIED_PATH", p);

  const digest = trackedPathsDigest(tracked);
  if (manifest.trackedPathsDigest !== digest) {
    fail(
      "TRACKED_PATH_SET_CHANGED",
      `manifest pins ${manifest.trackedPathsDigest} but the tree is ${digest} ` +
        `(${tracked.length} paths). A path was added or removed: record a ` +
        `classification decision in ${"config/public-repository-manifest.json"} and update the digest.`,
    );
  }
  if (manifest.trackedPathCount !== tracked.length) {
    fail(
      "TRACKED_PATH_COUNT_CHANGED",
      `manifest declares ${manifest.trackedPathCount}, tree has ${tracked.length}.`,
    );
  }
  return classified;
}

function checkForbiddenTracked(manifest, tracked) {
  for (const p of tracked) {
    if (matchesAny(manifest.forbidden, p)) fail("FORBIDDEN_PATH_TRACKED", p);
  }
}

function checkForbiddenContent(manifest, classified) {
  const publicPaths = classified
    .filter((c) => c.rule && c.rule.disposition === "include")
    .map((c) => c.path);

  for (const rule of manifest.forbiddenContent ?? []) {
    const re = new RegExp(rule.pattern);
    const allow = new Set(rule.allowPaths ?? []);
    for (const rel of publicPaths) {
      if (allow.has(rel)) continue;
      const abs = path.join(repoRoot, rel);
      let buf;
      try {
        buf = readFileSync(abs);
      } catch {
        continue;
      }
      if (buf.includes(0) && !/\.(mts|ts|tsx|mjs|js|json|md|sql|css)$/.test(rel)) continue;
      if (re.test(buf.toString("utf8"))) {
        fail("FORBIDDEN_CONTENT", `${rule.id} in ${rel}`);
      }
    }
  }
}

function checkBinaries(manifest, classified) {
  const limit = manifest.maxBinaryBytes ?? 1048576;
  for (const { path: rel, rule } of classified) {
    if (!rule || rule.disposition !== "include") continue;
    const abs = path.join(repoRoot, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.size <= limit) continue;
    // Oversized files are permitted only when text (source/lockfiles).
    const buf = readFileSync(abs);
    if (buf.includes(0)) fail("OVERSIZED_BINARY", `${rel} (${st.size} bytes)`);
  }
}

/**
 * A public markdown document must not link to a path that the boundary
 * excludes: that would ship a dangling reference into the public mirror.
 */
function checkPublicDocLinks(manifest, classified) {
  const publicSet = new Set(
    classified.filter((c) => c.rule && c.rule.disposition === "include").map((c) => c.path),
  );
  const trackedSet = new Set(classified.map((c) => c.path));

  for (const rel of publicSet) {
    if (!rel.endsWith(".md")) continue;
    const text = readFileSync(path.join(repoRoot, rel), "utf8");
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      let target = m[1];
      if (/^(https?:|mailto:|#|tel:)/.test(target)) continue;
      target = target.split("#")[0];
      if (!target) continue;
      if (path.isAbsolute(target)) {
        fail("PUBLIC_DOC_ABSOLUTE_LINK", `${rel} -> ${target}`);
        continue;
      }
      const resolved = path.normalize(path.join(path.dirname(rel), target));
      if (!trackedSet.has(resolved)) continue; // not a repo path (or already gone)
      if (!publicSet.has(resolved)) {
        fail("PUBLIC_DOC_LINKS_TO_PRIVATE", `${rel} -> ${resolved}`);
      }
    }
  }
}

function checkSymlinks(tracked) {
  for (const bad of findEscapingSymlinks(repoRoot, tracked)) {
    fail("SYMLINK_ESCAPES_ROOT", `${bad.path} (${bad.reason})`);
  }
}

/** Tracked files that current ignore rules say should not be tracked. */
function checkTrackedButIgnored() {
  const out = execFileSync("git", ["-C", repoRoot, "ls-files", "-ci", "--exclude-standard", "-z"], {
    maxBuffer: 1 << 26,
  })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const p of out) fail("TRACKED_BUT_IGNORED", p);
}

// ---------------------------------------------------------------------------
// Export-directory verification
// ---------------------------------------------------------------------------

function walk(dir, base = dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, base, acc);
    else acc.push(path.relative(base, abs));
  }
  return acc;
}

function checkExportDirectory(manifest, dir) {
  if (!existsSync(dir)) {
    fail("EXPORT_DIR_MISSING", dir);
    return;
  }
  const files = walk(dir).sort();
  const manifestFile = "public-export-manifest.json";

  for (const rel of files) {
    if (rel === manifestFile) continue;
    if (matchesAny(manifest.forbidden, rel)) fail("EXPORT_FORBIDDEN_PATH", rel);
    const rule = classify(manifest, rel);
    if (!rule) {
      fail("EXPORT_UNCLASSIFIED_PATH", rel);
    } else if (rule.disposition !== "include") {
      fail("EXPORT_PRIVATE_PATH_PRESENT", `${rel} (${rule.classification})`);
    }
  }

  for (const forbiddenDir of [".git", ".hermes", "evidence", ".d1-evidence", "node_modules", ".open-next", ".wrangler", ".claude", ".codex", ".atra"]) {
    if (existsSync(path.join(dir, forbiddenDir))) {
      fail("EXPORT_FORBIDDEN_DIRECTORY", forbiddenDir);
    }
  }

  for (const bad of findEscapingSymlinks(dir, files)) {
    fail("EXPORT_SYMLINK_ESCAPES_ROOT", `${bad.path} (${bad.reason})`);
  }

  notes.push(`export directory contains ${files.length} files`);
}

// ---------------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const checkCurrent = argv.includes("--check-current");
  const exportIdx = argv.indexOf("--check-export");
  const exportDir = exportIdx !== -1 ? argv[exportIdx + 1] : null;

  if (!checkCurrent && !exportDir) {
    console.error("usage: verify-public-repository.mjs --check-current | --check-export <dir>");
    process.exit(2);
  }

  const manifest = loadManifest(repoRoot);

  if (checkCurrent) {
    const tracked = listTrackedPaths(repoRoot);
    const classified = checkClassificationCoverage(manifest, tracked);
    checkForbiddenTracked(manifest, tracked);
    checkTrackedButIgnored();
    checkGitignoreContract();
    checkSymlinks(tracked);
    checkForbiddenContent(manifest, classified);
    checkBinaries(manifest, classified);
    checkPublicDocLinks(manifest, classified);

    const pub = classified.filter((c) => c.rule && c.rule.disposition === "include").length;
    notes.push(`${tracked.length} tracked paths; ${pub} public, ${tracked.length - pub} private`);
  }

  if (exportDir) checkExportDirectory(manifest, path.resolve(exportDir));

  for (const n of notes) console.log(`note: ${n}`);

  // Recorded publication blockers. These do NOT mean the boundary is wrong —
  // the boundary is enforced above. They mean publication is not yet permitted.
  const blockers = manifest.publicationBlockers ?? [];
  if (blockers.length) {
    console.log(`\nPUBLICATION_BLOCKERS (${blockers.length}) — the boundary is defined, but publication is NOT authorized:`);
    for (const b of blockers) {
      console.log(`  [${b.severity}] ${b.id}`);
      console.log(`      ${b.detail}`);
      console.log(`      required owner: ${b.requiredOwner}`);
    }
  }

  if (failures.length) {
    console.error(`\nPUBLIC_REPOSITORY_BOUNDARY_FAILED (${failures.length} finding(s)):`);
    const grouped = new Map();
    for (const f of failures) {
      if (!grouped.has(f.code)) grouped.set(f.code, []);
      grouped.get(f.code).push(f.detail);
    }
    for (const [code, details] of grouped) {
      console.error(`\n  ${code} (${details.length}):`);
      for (const d of details.slice(0, 25)) console.error(`    - ${d}`);
      if (details.length > 25) console.error(`    ... and ${details.length - 25} more`);
    }
    process.exit(1);
  }

  console.log("PUBLIC_REPOSITORY_BOUNDARY_OK");
}

main();
