#!/usr/bin/env node
/**
 * Produce a deterministic public snapshot of Atra from the allowlist manifest.
 *
 *   node scripts/export-public-repository.mjs --verify
 *     Export to an invocation-owned temporary directory, verify it, print the
 *     digest summary, then delete it. Nothing is retained.
 *
 *   node scripts/export-public-repository.mjs --out <dir-outside-repo>
 *     Export and RETAIN the snapshot at <dir>. The destination must be outside
 *     the repository so a snapshot can never be committed back into it.
 *
 * The exporter copies only what the manifest includes. It refuses to copy a
 * path that traverses, escapes via symlink, matches a forbidden pattern, or
 * carries an unresolved placeholder. It never copies .git/ or ignored state.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  lstatSync,
  statSync,
  existsSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadManifest,
  listTrackedPaths,
  classify,
  matchesAny,
  assertSafeRelativePath,
  findEscapingSymlinks,
  sha256File,
} from "./lib/publicRepositoryManifest.mjs";

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: path.dirname(new URL(import.meta.url).pathname),
})
  .toString()
  .trim();

function parseArgs() {
  const argv = process.argv.slice(2);
  const verify = argv.includes("--verify");
  const outIdx = argv.indexOf("--out");
  const out = outIdx !== -1 ? argv[outIdx + 1] : null;
  if (!verify && !out) {
    console.error("usage: export-public-repository.mjs --verify | --out <dir-outside-repo>");
    process.exit(2);
  }
  return { verify, out };
}

/** A retained destination must live outside the repository. */
function assertDestinationOutsideRepo(dest) {
  const rootReal = realpathSync(repoRoot);
  const destAbs = path.resolve(dest);
  const rel = path.relative(rootReal, destAbs);
  if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
    throw new Error(
      `export_destination_inside_repository: ${destAbs}. A public snapshot must ` +
        `never be written inside the private repository.`,
    );
  }
}

function main() {
  const { verify, out } = parseArgs();
  const manifest = loadManifest(repoRoot);
  const tracked = listTrackedPaths(repoRoot);

  const problems = [];
  const selected = [];

  for (const rel of tracked) {
    let safe;
    try {
      safe = assertSafeRelativePath(rel);
    } catch (err) {
      problems.push(`${rel}: ${err.message}`);
      continue;
    }
    const rule = classify(manifest, safe);
    if (!rule) {
      problems.push(`${safe}: unclassified_path`);
      continue;
    }
    if (rule.disposition !== "include") continue;
    if (matchesAny(manifest.forbidden, safe)) {
      problems.push(`${safe}: forbidden_pattern`);
      continue;
    }
    selected.push(safe);
  }

  // Symlink escape check on the selected set, before any copying happens.
  for (const bad of findEscapingSymlinks(repoRoot, selected)) {
    problems.push(`${bad.path}: ${bad.reason}`);
  }

  // Unresolved placeholders and oversized binaries.
  const limit = manifest.maxBinaryBytes ?? 1048576;
  const placeholderRule = (manifest.forbiddenContent ?? []).find(
    (r) => r.id === "unresolved_placeholder",
  );
  for (const rel of selected) {
    const abs = path.join(repoRoot, rel);
    const st = statSync(abs);
    const buf = readFileSync(abs);
    const binary = buf.includes(0);
    if (binary && st.size > limit) {
      problems.push(`${rel}: oversized_binary(${st.size})`);
    }
    if (placeholderRule && !(placeholderRule.allowPaths ?? []).includes(rel)) {
      if (!binary && new RegExp(placeholderRule.pattern).test(buf.toString("utf8"))) {
        problems.push(`${rel}: unresolved_placeholder`);
      }
    }
  }

  if (problems.length) {
    console.error(`PUBLIC_EXPORT_REFUSED (${problems.length} problem(s)):`);
    for (const p of problems.slice(0, 40)) console.error(`  - ${p}`);
    if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`);
    process.exit(1);
  }

  const retain = Boolean(out);
  if (retain) assertDestinationOutsideRepo(out);

  const dest = retain
    ? path.resolve(out)
    : mkdtempSync(path.join(tmpdir(), "atra-public-export-"));

  let ok = false;
  try {
    if (retain) {
      if (existsSync(dest)) {
        throw new Error(`export_destination_exists: ${dest}`);
      }
      mkdirSync(dest, { recursive: true });
    }

    const entries = [];
    for (const rel of selected) {
      const from = path.join(repoRoot, rel);
      const to = path.join(dest, rel);
      mkdirSync(path.dirname(to), { recursive: true });
      // Copy contents, never a symlink, and never dereference outside the root.
      cpSync(from, to, { dereference: false, errorOnExist: true, force: false });
      const st = lstatSync(to);
      entries.push({
        path: rel,
        mode: `0${(st.mode & 0o777).toString(8)}`,
        size: st.size,
        sha256: sha256File(to),
        classification: classify(manifest, rel).classification,
      });
    }

    entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    // The snapshot manifest carries relative paths only — never machine paths.
    const snapshot = {
      schemaVersion: "atra-public-export-manifest-v1",
      sourceManifestSchemaVersion: manifest.schemaVersion,
      fileCount: entries.length,
      files: entries,
    };
    const snapshotJson = `${JSON.stringify(snapshot, null, 2)}\n`;
    writeFileSync(path.join(dest, "public-export-manifest.json"), snapshotJson);

    const aggregate = execFileSync("shasum", ["-a", "256"], { input: snapshotJson })
      .toString()
      .split(/\s+/)[0];

    console.log(`exported ${entries.length} files`);
    console.log(`public-export-manifest.json sha256 = ${aggregate}`);
    if (retain) console.log(`retained at ${dest}`);
    else console.log(`temporary export at ${dest}`);

    // Self-verify the snapshot we just produced.
    execFileSync(
      process.execPath,
      [path.join(repoRoot, "scripts", "verify-public-repository.mjs"), "--check-export", dest],
      { stdio: "inherit" },
    );

    ok = true;
  } finally {
    if (!retain) {
      rmSync(dest, { recursive: true, force: true });
      if (ok) console.log("temporary export removed");
    }
  }
}

main();
