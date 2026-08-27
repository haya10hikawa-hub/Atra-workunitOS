// Deterministic shell-command reading. This is deliberately not a shell: it
// recognises the small, source-controlled command vocabulary this repository
// actually uses (package scripts, CI `run:` steps, documented `node`/`npm`
// invocations) and reports the operands it cannot interpret rather than
// dropping them.

const separatorPattern = /(?:&&|\|\||;|\||\n)/
const environmentAssignmentPattern = /^[A-Za-z_][A-Za-z0-9_]*=/
const flagPattern = /^-/

/** Split a command line into individual simple commands. */
export function splitCommandLine(commandLine) {
  return tokenizeRespectingQuotes(commandLine)
    .reduce((groups, token) => {
      if (token.quoted === false && separatorPattern.test(token.text) && token.text.trim().length > 0) {
        groups.push([])
      } else {
        groups[groups.length - 1].push(token.text)
      }
      return groups
    }, [[]])
    .filter((tokens) => tokens.length > 0)
}

/**
 * Reduce one simple command to `{ executable, operands }`. Environment
 * assignments and flags are stripped; `--flag=value` values are kept as
 * operands because operator commands pass paths that way.
 */
export function readSimpleCommand(tokens) {
  let index = 0
  while (index < tokens.length && environmentAssignmentPattern.test(tokens[index])) index += 1
  if (index >= tokens.length) return undefined
  const executable = tokens[index]
  const operands = []
  for (const token of tokens.slice(index + 1)) {
    if (!flagPattern.test(token)) {
      operands.push(token)
      continue
    }
    const equals = token.indexOf("=")
    if (equals > 0) operands.push(token.slice(equals + 1))
  }
  return { executable, operands }
}

export function readCommandLine(commandLine) {
  return splitCommandLine(commandLine).map(readSimpleCommand).filter((command) => command !== undefined)
}

/**
 * True when a documentation code span is an executable command rather than an
 * English mention of a filename. Requires a recognised executable in leading
 * position, so `` `mockEvents.mts` `` in prose is not execution reachability.
 */
const executableVocabulary = new Set([
  "node", "npm", "npx", "pnpm", "yarn", "bash", "sh", "zsh",
  "next", "wrangler", "eslint", "tsc", "electron", "opennextjs-cloudflare",
])

export function isExecutableCommand(candidate) {
  const commands = readCommandLine(candidate)
  if (commands.length === 0) return false
  return executableVocabulary.has(commands[0].executable)
}

/** `npm run <script>` / `npm test` style references to another package script. */
export function packageScriptReference(command) {
  if (command.executable !== "npm" && command.executable !== "pnpm" && command.executable !== "yarn") return undefined
  const [first, second] = command.operands
  if (first === "run" || first === "run-script") return second
  if (first === "test" || first === "start") return first
  return undefined
}

function tokenizeRespectingQuotes(commandLine) {
  const tokens = []
  let current = ""
  let quoted = false
  let quoteCharacter = ""
  const flush = () => {
    if (current.length > 0) tokens.push({ text: current, quoted })
    current = ""
    quoted = false
  }
  for (let index = 0; index < commandLine.length; index += 1) {
    const character = commandLine[index]
    if (quoteCharacter) {
      if (character === quoteCharacter) quoteCharacter = ""
      else current += character
      continue
    }
    if (character === '"' || character === "'") {
      quoteCharacter = character
      quoted = true
      continue
    }
    if (/\s/.test(character) && character !== "\n") {
      flush()
      continue
    }
    if (separatorPattern.test(character)) {
      flush()
      tokens.push({ text: character, quoted: false })
      continue
    }
    current += character
  }
  if (quoteCharacter) throw new Error(`Unterminated quote in command: ${commandLine}`)
  flush()
  return tokens
}
