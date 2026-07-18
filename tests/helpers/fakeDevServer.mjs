#!/usr/bin/env node
// TEST-ONLY fake `wrangler dev`. Stands in for the real Worker process so the
// signal integration tests can drive readiness + termination without a 60s build.
// It is invoked exactly like `wrangler dev … --port <p> …`; it listens on that port,
// answers every request with 401 (enough for the runner's readiness probe), and
// spawns one long-lived DESCENDANT so tests can prove process-group kill reaches
// descendants. It never touches D1, secrets, or the network.

import { createServer } from "node:http"
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

const args = process.argv.slice(2)
const portIdx = args.indexOf("--port")
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 0

// A descendant in THIS process group (not detached), so `kill(-pgid)` reaps it too.
const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e9)"], { stdio: "ignore" })
process.stdout.write(`DESC ${descendant.pid}\n`)
// stdout is captured to the runner's dev.log; also record the descendant pid where
// the signal test can read it (cwd is the runner-owned snapshot root).
try {
  writeFileSync(join(process.cwd(), "desc.pid"), String(descendant.pid))
} catch {
  /* best effort */
}

const server = createServer((_req, res) => {
  res.writeHead(401, { "content-type": "application/json" })
  res.end(JSON.stringify({ error: "unauthorized" }))
})
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`LISTENING ${port}\n`)
})

// Stay alive until signalled; the runner owns termination.
setInterval(() => {}, 1e9)
