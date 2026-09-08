import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

const root = path.resolve(import.meta.dirname, "..")
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

test("V0 product direction stays frozen and discoverable", () => {
  const state = read("PRODUCT_STATE.md")
  assert.match(state, /STATUS: EXPLORATION/)
  assert.match(state, /Atra V0: FROZEN/)
  assert.match(state, /Current product direction: UNRESOLVED/)
  for (const file of [
    "docs/current/README.md",
    "docs/research/README.md",
    "docs/archive/v0/README.md",
  ]) assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`)
  assert.match(read("AGENTS.md"), /PRODUCT_DIRECTION = UNRESOLVED/)
  assert.match(read("README.md"), /PRODUCT_STATE\.md/)
  assert.match(read("docs/archive/v0/README.md"), /HISTORICAL ONLY/)
})
