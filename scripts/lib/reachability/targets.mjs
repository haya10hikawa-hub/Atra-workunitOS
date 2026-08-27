// Normalisation of a raw reference value into a repository target, with an
// explicit resolution status. Nothing is silently dropped: a value that cannot
// be resolved is reported as `unresolved` rather than omitted.

const buildOutputRoots = new Set(["node_modules", ".next", ".open-next", "dist", "coverage"])
const executableExtensionPattern = /\.(?:[cm]?[jt]sx?|sh)$/i
const globPattern = /[*?]/

export const RESOLUTION_STATUSES = [
  "resolved_file",
  "resolved_directory",
  "resolved_basename",
  "ambiguous_basename",
  "build_output",
  "glob_pattern",
  "unresolved",
  "external",
]

/**
 * All reference values are read as repository-root-relative, which is how this
 * repository writes them: package scripts and documented commands run from the
 * root, `tsconfig` paths are `baseUrl`-relative with `baseUrl: "."`, and source
 * path strings name roots such as `app/lib/workunitInbox/`.
 */
export function normalizeReferenceValue(rawValue) {
  const value = rawValue.trim()
  if (value.length === 0) return undefined
  // A repository path in this tree never contains whitespace. Requiring that
  // keeps assertion prose such as "app/ source scan must not be vacuous" out of
  // the reference set, which would otherwise read as an unresolved path.
  if (/\s/.test(value)) return undefined
  if (value.includes("://") || value.startsWith("#") || value.startsWith("data:")) return undefined
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) return undefined
  // `route.ts#GET` and `validators.ts:212-213` name a location inside a file.
  const withoutLocator = value.replace(/(?:#|:\d+(?:-\d+)?$).*$/, "")
  const withoutPrefix = withoutLocator.replace(/^(?:\.\/)+/, "")
  const normalized = withoutPrefix.replace(/\/+$/, "")
  if (normalized.length === 0 || normalized.startsWith("..")) return undefined
  return normalized
}

/**
 * `executableOperand` widens path-likeness for command operands: `node foo.mjs`
 * names a file to execute even though it has no directory segment, so it must
 * fail closed rather than pass as an external tool name.
 */
export function resolveReferenceTarget(inventory, rawValue, { executableOperand = false, expandGlobs = false } = {}) {
  const normalized = normalizeReferenceValue(rawValue)
  if (normalized === undefined) return [{ normalizedTarget: undefined, resolution: "external" }]

  const firstSegment = normalized.split("/")[0]
  if (buildOutputRoots.has(firstSegment)) {
    return [{ normalizedTarget: normalized, resolution: "build_output" }]
  }

  if (globPattern.test(normalized)) {
    // A glob names a set, not a module. Expanding it is correct for a command
    // operand — `--test tests/*.test.mts` is how the runner discovers its
    // inputs — but a configuration glob such as a `tsconfig` `include` entry
    // describes the type-check universe. Expanding those would make every
    // TypeScript file in the tree production-reachable and the measurement
    // vacuous, so they are recorded as evidence and confer nothing.
    if (!expandGlobs) return [{ normalizedTarget: normalized, resolution: "glob_pattern" }]
    const matches = expandGlob(inventory, normalized)
    if (matches.length > 0) {
      return matches.map((match) => ({ normalizedTarget: match, resolution: "resolved_file" }))
    }
    return [{ normalizedTarget: normalized, resolution: repositoryShaped(inventory, normalized, executableOperand) ? "unresolved" : "external" }]
  }

  if (inventory.hasFile(normalized)) return [{ normalizedTarget: normalized, resolution: "resolved_file" }]
  if (inventory.hasDirectory(normalized)) return [{ normalizedTarget: normalized, resolution: "resolved_directory" }]
  if (repositoryShaped(inventory, normalized, executableOperand)) {
    return [{ normalizedTarget: normalized, resolution: "unresolved" }]
  }
  // A path assembled segment by segment — `join(dir, "harness.mjs")` — leaves
  // only the base name in the source. Matching it against the inventory keeps
  // that reference visible instead of reporting the target as unreferenced.
  const byBasename = matchBasename(inventory, normalized)
  if (byBasename.length === 1) return [{ normalizedTarget: byBasename[0], resolution: "resolved_basename" }]
  if (byBasename.length > 1) return [{ normalizedTarget: normalized, resolution: "ambiguous_basename" }]
  return [{ normalizedTarget: undefined, resolution: "external" }]
}

/**
 * A value is repository-shaped when its leading segment names a source-
 * controlled top-level entry, or when it is a command operand naming an
 * executable source file. Bare single-segment strings such as `types.ts` in
 * prose are deliberately not repository-shaped: treating every English mention
 * of a filename as a reference would drown the real ones.
 */
function repositoryShaped(inventory, normalized, executableOperand) {
  const firstSegment = normalized.split("/")[0]
  if (normalized.includes("/") && (inventory.hasDirectory(firstSegment) || inventory.hasFile(firstSegment))) return true
  return executableOperand && executableExtensionPattern.test(normalized)
}

function expandGlob(inventory, pattern) {
  const expression = new RegExp(`^${pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\u0000/g, "(?:[^/]+/)*")
    .replace(/\u0001/g, ".*")}$`)
  return inventory.files.filter((file) => expression.test(file)).sort()
}

function matchBasename(inventory, normalized) {
  if (normalized.includes("/") || !executableExtensionPattern.test(normalized)) return []
  return inventory.files.filter((file) => file.endsWith(`/${normalized}`) || file === normalized).sort()
}
