#!/usr/bin/env node
// Offline verification of the Atra source-available licensing framework.
//
// Runs with no network access and no dependencies outside the Node standard
// library. It verifies structure and integrity only; it makes no legal
// determination and does not re-resolve dependency licenses.

import { createHash } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// SHA-256 of the official SPDX plain-text Elastic License 2.0, taken from
// spdx/license-list-data `text/Elastic-2.0.txt`, after the deterministic
// normalization applied by normalize() below.
const ELV2_CANONICAL_SHA256 =
  "6448026f2e06ab3da9ed8ddda686694bba37179e88db92dea6d4aab516c957ea"

const REQUIRED_FILES = [
  "LICENSE",
  "NOTICE",
  "COMMERCIAL_LICENSE.md",
  "TRADEMARKS.md",
  "THIRD_PARTY_NOTICES.md",
  "CONTRIBUTING.md",
  "README.md",
  "package.json",
]

const COPYRIGHT_HOLDER = "樋川颯人"
const COMMERCIAL_CONTACT = "haya10hikawa@gmail.com"
const COPYRIGHT_LINE = `Copyright © 2026 ${COPYRIGHT_HOLDER}`

// Documents authored by Atra. LICENSE is excluded: it is verbatim upstream
// text and is checked by digest instead.
const ATRA_DOCS = [
  "NOTICE",
  "COMMERCIAL_LICENSE.md",
  "TRADEMARKS.md",
  "THIRD_PARTY_NOTICES.md",
  "CONTRIBUTING.md",
  "README.md",
]

const PLACEHOLDERS = [
  ["<LEGAL_COPYRIGHT_HOLDER>", "unsubstituted copyright-holder placeholder"],
  ["<TRADEMARK_OWNER>", "unsubstituted trademark-owner placeholder"],
  ["<COMMERCIAL_CONTACT>", "unsubstituted contact placeholder"],
  ["<COPYRIGHT_YEAR>", "unsubstituted year placeholder"],
  ["example.com", "example-domain placeholder"],
  ["TODO", "unresolved TODO marker"],
  ["FIXME", "unresolved FIXME marker"],
  ["PLACEHOLDER", "literal PLACEHOLDER marker"],
  ["Hayato Hikawa", "romanized legal name (must remain 樋川颯人)"],
  ["樋川 颯人", "legal name with inserted space (must remain 樋川颯人)"],
]

// Affirmative claims Atra must not make.
//
// Some of these phrases legitimately appear inside an explicit disclaimer —
// "Nothing in this policy claims that either name is a registered trademark"
// must be allowed while "Atra is a registered trademark" must not. Those
// patterns are marked `sentenceScoped`: they are evaluated one sentence at a
// time and a sentence carrying a negation cue is treated as a denial rather
// than an assertion. Patterns without the flag are matched against the whole
// document.
const NEGATION_CUE =
  /\b(?:no|nothing|neither|never|disclaims?|does not|do not|is not|are not|not)\b/i

const PROHIBITED_CLAIMS = [
  { pattern: /®/u, label: "registered-trademark symbol" },
  { pattern: /™/u, label: "trademark symbol" },
  { pattern: /\bis a registered trademark\b/i, label: "registered-trademark assertion", sentenceScoped: true },
  { pattern: /\bregistered trademark of\b/i, label: "registered-trademark-of assertion", sentenceScoped: true },
  { pattern: /\bis a trademark of\b/i, label: "trademark-of assertion", sentenceScoped: true },
  { pattern: /\bOSI[-\s]approved\b/i, label: "OSI-approved claim" },
  { pattern: /\bfree software\b/i, label: "free-software claim" },
  { pattern: /\bcommercial use is prohibited\b/i, label: "commercial-use-prohibited claim" },
  { pattern: /\ball businesses must pay\b/i, label: "universal-payment claim" },
  { pattern: /\bfree for (?:all|every)\b/i, label: "free-for-all-uses claim" },
  { pattern: /\bAtra\b[^.\n]{0,60}\bis\b[^.\n]{0,25}\bopen[-\s]source\b/i, label: "open-source claim about Atra", sentenceScoped: true },
  { pattern: /\bopen[-\s]source\b[^.\n]{0,40}\bAtra\b/i, label: "open-source claim about Atra (reversed)", sentenceScoped: true },
  { pattern: /\bevery commercial use requires\b/i, label: "all-commercial-use-requires-license claim" },
  { pattern: /\bofficial Atra logo is designated\b/i, label: "Atra logo designation", sentenceScoped: true },
]

// Split on sentence terminators and blank lines. Markdown list items are also
// treated as sentence boundaries so a bullet cannot borrow a neighbour's
// negation.
function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n\s*[-*]\s+|\n{2,}|\n(?=#)/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function violates({ pattern, sentenceScoped }, text) {
  if (!sentenceScoped) return pattern.test(text)
  return sentences(text).some((s) => pattern.test(s) && !NEGATION_CUE.test(s))
}

// Statements that must be present.
const REQUIRED_CONTENT = [
  ["NOTICE", COPYRIGHT_LINE, "exact copyright line"],
  ["NOTICE", "Elastic License 2.0", "ELv2 reference"],
  ["NOTICE", "THIRD_PARTY_NOTICES.md", "third-party pointer"],
  ["NOTICE", "TRADEMARKS.md", "name-policy pointer"],
  ["COMMERCIAL_LICENSE.md", "does not itself grant", "explicit non-grant"],
  ["COMMERCIAL_LICENSE.md", COMMERCIAL_CONTACT, "commercial contact"],
  ["TRADEMARKS.md", "No official Atra logo is designated", "no-logo statement"],
  ["TRADEMARKS.md", COPYRIGHT_HOLDER, "name-policy owner"],
  ["CONTRIBUTING.md", "not currently accepted", "closed contribution intake"],
  ["README.md", "source-available", "source-available terminology"],
  ["README.md", COMMERCIAL_CONTACT, "commercial contact"],
  ["THIRD_PARTY_NOTICES.md", "Atra-authored code is made available under Elastic-2.0.", "Atra code statement"],
  ["THIRD_PARTY_NOTICES.md", "Third-party components remain under their respective licenses.", "third-party statement"],
]

const results = []
let failed = 0

function check(name, ok, detail = "") {
  results.push({ name, ok, detail })
  if (!ok) failed += 1
}

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8")
}

// Deterministic normalization: strip a UTF-8 BOM, convert CRLF and lone CR to
// LF, and reduce trailing newlines to exactly one.
function normalize(text) {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/, "\n")
}

// 1. Required files exist.
for (const f of REQUIRED_FILES) {
  check(`file present: ${f}`, existsSync(path.join(repoRoot, f)))
}

if (failed > 0) {
  report()
  process.exit(1)
}

// 2. ELv2 text integrity.
const licenseRaw = read("LICENSE")
const licenseDigest = createHash("sha256").update(normalize(licenseRaw), "utf8").digest("hex")
check(
  "LICENSE matches canonical SPDX Elastic-2.0 digest",
  licenseDigest === ELV2_CANONICAL_SHA256,
  licenseDigest === ELV2_CANONICAL_SHA256 ? licenseDigest : `expected ${ELV2_CANONICAL_SHA256}, got ${licenseDigest}`,
)
check("LICENSE names Elastic License 2.0", licenseRaw.includes("Elastic License 2.0"))
check("LICENSE carries no Atra-specific insertion", !/\bAtra\b/.test(licenseRaw))
check("LICENSE carries no contact address", !licenseRaw.includes(COMMERCIAL_CONTACT))

// 3. Package metadata.
const pkg = JSON.parse(read("package.json"))
check("package.json license is Elastic-2.0", pkg.license === "Elastic-2.0", `got ${JSON.stringify(pkg.license)}`)
check("package.json remains private", pkg.private === true, `got ${JSON.stringify(pkg.private)}`)

// 4. Placeholders.
for (const doc of ATRA_DOCS) {
  const text = read(doc)
  for (const [needle, label] of PLACEHOLDERS) {
    check(`${doc}: no ${label}`, !text.includes(needle))
  }
}

// 5. Prohibited claims.
for (const doc of ATRA_DOCS) {
  const text = read(doc)
  for (const claim of PROHIBITED_CLAIMS) {
    check(`${doc}: no ${claim.label}`, !violates(claim, text))
  }
}

// 6. Required statements.
for (const [doc, needle, label] of REQUIRED_CONTENT) {
  check(`${doc}: has ${label}`, read(doc).includes(needle))
}

report()
process.exit(failed === 0 ? 0 : 1)

function report() {
  const width = results.reduce((n, r) => Math.max(n, r.name.length), 0)
  for (const r of results) {
    const line = `${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}`
    console.log(r.detail ? `${line}  ${r.detail}` : line)
  }
  console.log(
    `\n${results.length - failed}/${results.length} checks passed` +
      (failed ? ` — ${failed} FAILED` : ""),
  )
}
