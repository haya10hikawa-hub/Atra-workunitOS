/**
 * Loop-I0 CLI entrypoint.
 *
 * Usage:
 *   node --experimental-strip-types scripts/loop/index.mts \
 *     --phase P6-I0 [--pr 87] [--run-validation] \
 *     [--out .loop-reports/p6-i0.md] [--json .loop-reports/p6-i0.json] \
 *     [--max-snippet-chars 4000]
 *
 * Local developer tooling only. Uses node built-ins only, executes commands
 * via execFile without a shell, and never stages, commits, pushes, merges,
 * deploys, publishes, tags, releases, or uploads anything.
 */

import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { collectLoopStatus, type CommandRunner } from "./loopStatusCollector.mts";
import { formatLoopJsonReport, formatLoopMarkdownReport } from "./loopReportFormatter.mts";

export interface CliOptions {
  readonly phase: string;
  readonly prNumber?: number;
  readonly runValidation: boolean;
  readonly outPath?: string;
  readonly jsonPath?: string;
  readonly maxSnippetChars?: number;
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  let phase: string | undefined;
  let prNumber: number | undefined;
  let runValidation = false;
  let outPath: string | undefined;
  let jsonPath: string | undefined;
  let maxSnippetChars: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      const value = argv[i];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case "--phase":
        phase = next();
        break;
      case "--pr": {
        const raw = next();
        if (!/^[0-9]{1,8}$/.test(raw)) throw new Error(`Invalid --pr value: ${raw}`);
        prNumber = Number(raw);
        break;
      }
      case "--run-validation":
        runValidation = true;
        break;
      case "--out":
        outPath = next();
        break;
      case "--json":
        jsonPath = next();
        break;
      case "--max-snippet-chars": {
        const raw = next();
        const parsed = Number(raw);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`Invalid --max-snippet-chars value: ${raw}`);
        }
        maxSnippetChars = parsed;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!phase || phase.trim().length === 0) {
    throw new Error("Missing required argument: --phase <phase_id>");
  }

  return { phase, prNumber, runValidation, outPath, jsonPath, maxSnippetChars };
}

/**
 * Reject output paths that escape the repository root. Reports may only be
 * written to explicit paths inside the repository.
 */
export function resolveSafeOutputPath(repoRoot: string, requestedPath: string): string {
  const root = resolve(repoRoot);
  const resolved = resolve(root, requestedPath);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error(`Unsafe output path escapes repository: ${requestedPath}`);
  }
  if (resolved === root) {
    throw new Error(`Output path must be a file inside the repository: ${requestedPath}`);
  }
  return resolved;
}

const realCommandRunner: CommandRunner = (executable, args) =>
  new Promise((resolvePromise) => {
    execFile(
      executable,
      [...args],
      { shell: false, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const exitCode =
          error && typeof (error as { code?: unknown }).code === "number"
            ? ((error as { code: number }).code)
            : error
              ? null
              : 0;
        resolvePromise({ exitCode: error ? exitCode : 0, stdout, stderr });
      },
    );
  });

async function main(): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${String(error instanceof Error ? error.message : error)}\n`);
    return 2;
  }

  const repoRoot = process.cwd();
  const outAbs = options.outPath ? resolveSafeOutputPath(repoRoot, options.outPath) : undefined;
  const jsonAbs = options.jsonPath ? resolveSafeOutputPath(repoRoot, options.jsonPath) : undefined;

  const summary = await collectLoopStatus({
    phase: options.phase,
    prNumber: options.prNumber,
    runValidation: options.runValidation,
    maxSnippetChars: options.maxSnippetChars,
    runner: realCommandRunner,
  });

  const markdown = formatLoopMarkdownReport(summary);
  const json = formatLoopJsonReport(summary);

  if (outAbs) {
    mkdirSync(dirname(outAbs), { recursive: true });
    writeFileSync(outAbs, markdown, "utf8");
    process.stderr.write(`Markdown report written: ${outAbs}\n`);
  }
  if (jsonAbs) {
    mkdirSync(dirname(jsonAbs), { recursive: true });
    writeFileSync(jsonAbs, json, "utf8");
    process.stderr.write(`JSON summary written: ${jsonAbs}\n`);
  }
  if (!outAbs && !jsonAbs) {
    process.stdout.write(`${markdown}\n`);
  }

  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${String(error instanceof Error ? error.stack : error)}\n`);
      process.exitCode = 1;
    },
  );
}
