import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"
import { isCodeFilePath } from "../typescriptModuleGraph.mjs"

const execFileAsync = promisify(execFile)

// Directories whose contents are build output or vendored code. They are never
// source-controlled, but an explicit list keeps the inventory honest if one is
// ever committed by accident.
const excludedRoots = new Set(["node_modules", ".next", ".open-next", "dist", "coverage"])

/**
 * Source-controlled file inventory. Reachability is a statement about the tree
 * under version control, so the inventory is `git ls-files` rather than a
 * filesystem walk: an untracked scratch file must not change the canonical
 * output for a given tree.
 */
export async function listTrackedFiles(rootDir) {
  const { stdout } = await execFileAsync("git", ["-C", rootDir, "ls-files", "-z"], {
    maxBuffer: 64 * 1024 * 1024,
  })
  const files = stdout.split("\0").filter((entry) => entry.length > 0)
  if (files.length === 0) throw new Error(`No source-controlled files under ${rootDir}`)
  const kept = files.filter((file) => !excludedRoots.has(file.split("/")[0]))
  return [...new Set(kept)].sort()
}

export async function buildInventory(rootDir, listFilesFor = listTrackedFiles) {
  const files = await listFilesFor(rootDir)
  for (const file of files) {
    if (path.isAbsolute(file) || file.split("/").includes("..")) {
      throw new Error(`Inventory entry is not a repository-relative path: ${file}`)
    }
  }
  const fileSet = new Set(files)
  const directorySet = new Set()
  for (const file of files) {
    const segments = file.split("/")
    for (let index = 1; index < segments.length; index += 1) {
      directorySet.add(segments.slice(0, index).join("/"))
    }
  }
  return {
    files,
    modules: files.filter((file) => isCodeFilePath(file)),
    hasFile: (candidate) => fileSet.has(candidate),
    hasDirectory: (candidate) => directorySet.has(candidate),
  }
}
