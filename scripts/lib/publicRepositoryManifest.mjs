/**
 * Shared loader and matcher for the public-repository allowlist manifest.
 *
 * The manifest (config/public-repository-manifest.json) is the authoritative
 * definition of the Atra public-repository boundary. Both the exporter and the
 * verifier consume it through this module so that they can never disagree.
 *
 * Dependency-free by design: node built-ins only, no network, no writes.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";

export const MANIFEST_RELATIVE_PATH = "config/public-repository-manifest.json";

/** Translate a manifest glob into an anchored regular expression. */
export function globToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === "*") {
      const double = pattern[i + 1] === "*";
      if (double) {
        // `**/` matches zero or more leading path segments; bare `**` matches
        // anything including separators.
        if (pattern[i + 2] === "/") {
          out += "(?:[^/]+/)*";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
      continue;
    }
    out += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

export function matchesAny(patterns, relPath) {
  return patterns.some((p) => globToRegExp(p).test(relPath));
}

export function loadManifest(repoRoot) {
  const abs = path.join(repoRoot, MANIFEST_RELATIVE_PATH);
  const raw = readFileSync(abs, "utf8");
  const manifest = JSON.parse(raw);
  if (manifest.schemaVersion !== "atra-public-repository-manifest-v1") {
    throw new Error(`manifest_schema_unsupported: ${manifest.schemaVersion}`);
  }
  if (!Array.isArray(manifest.rules) || manifest.rules.length === 0) {
    throw new Error("manifest_rules_missing");
  }
  for (const rule of manifest.rules) {
    if (!rule.pattern || !rule.disposition || !rule.classification || !rule.action) {
      throw new Error(`manifest_rule_incomplete: ${JSON.stringify(rule.pattern)}`);
    }
    if (rule.disposition !== "include" && rule.disposition !== "exclude") {
      throw new Error(`manifest_rule_disposition_invalid: ${rule.pattern}`);
    }
    if (!rule.reason || rule.reason.length < 10) {
      throw new Error(`manifest_rule_reason_missing: ${rule.pattern}`);
    }
  }
  return manifest;
}

/** List every tracked path at HEAD, NUL-separated so odd filenames survive. */
export function listTrackedPaths(repoRoot) {
  const out = execFileSync("git", ["-C", repoRoot, "ls-files", "-z"], {
    maxBuffer: 1 << 28,
  })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  return out.sort();
}

/** Stable digest pinning the exact tracked path set. */
export function trackedPathsDigest(paths) {
  const h = createHash("sha256");
  for (const p of [...paths].sort()) h.update(p, "utf8"), h.update("\0");
  return h.digest("hex");
}

/**
 * Resolve a path to its first matching rule. First match wins, so ordering in
 * the manifest is meaningful: specific carve-outs precede broad defaults.
 */
export function classify(manifest, relPath) {
  for (const rule of manifest.rules) {
    if (globToRegExp(rule.pattern).test(relPath)) return rule;
  }
  return null;
}

/** Every tracked path, with its rule. Unmatched paths surface as `rule: null`. */
export function classifyAll(manifest, trackedPaths) {
  return trackedPaths.map((p) => ({ path: p, rule: classify(manifest, p) }));
}

export function isPublic(manifest, relPath) {
  const rule = classify(manifest, relPath);
  return Boolean(rule && rule.disposition === "include");
}

/**
 * Reject any symlink that escapes the repository root. Returns offending paths.
 * A symlink is judged by where it actually resolves, not by how it is spelled.
 */
export function findEscapingSymlinks(repoRoot, relPaths) {
  const rootReal = realpathSync(repoRoot);
  const bad = [];
  for (const rel of relPaths) {
    const abs = path.join(repoRoot, rel);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      continue;
    }
    if (!st.isSymbolicLink()) continue;
    let resolved;
    try {
      resolved = realpathSync(abs);
    } catch {
      bad.push({ path: rel, reason: "symlink_unresolvable" });
      continue;
    }
    const relToRoot = path.relative(rootReal, resolved);
    if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
      bad.push({ path: rel, reason: "symlink_escapes_root" });
    }
  }
  return bad;
}

/** Reject `..` traversal and absolute paths in manifest-driven copying. */
export function assertSafeRelativePath(relPath) {
  if (path.isAbsolute(relPath)) throw new Error(`path_absolute: ${relPath}`);
  const normalized = path.normalize(relPath);
  if (normalized.startsWith("..") || normalized.split(path.sep).includes("..")) {
    throw new Error(`path_traversal: ${relPath}`);
  }
  return normalized;
}

export function sha256File(absPath) {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}
