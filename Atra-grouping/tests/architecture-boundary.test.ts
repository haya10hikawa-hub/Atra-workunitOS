import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const retrievalRoot = new URL("../backend/retrieval/", import.meta.url);

async function TypeScriptFiles(directory: URL): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory() && entry.name !== "node_modules") return TypeScriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path.pathname] : [];
    }),
  );
  return files.flat();
}

describe("Gold leakage architecture boundary", () => {
  it("does not allow retrieval to depend on Gold contracts", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("package.json", retrievalRoot), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(packageJson.dependencies).not.toHaveProperty("@atra/gold-contracts");
  });

  it("does not import Gold labels or workflow modules from retrieval source", async () => {
    const files = await TypeScriptFiles(retrievalRoot);
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, join("backend/retrieval", file)).not.toMatch(
        /@atra\/gold-contracts|backend\/gold|gold-contracts/,
      );
    }
  });
});

describe("build coverage", () => {
  it("typechecks every executable workspace source tree", async () => {
    const config = JSON.parse(
      await readFile(new URL("../tsconfig.build.json", import.meta.url), "utf8"),
    ) as { include?: string[] };
    expect(config.include).toEqual(
      expect.arrayContaining([
        "packages/*/src/**/*.ts",
        "fixtures/src/**/*.ts",
        "backend/*/src/**/*.ts",
        "frontend/src/**/*.ts",
        "evaluation/src/**/*.ts",
      ]),
    );
  });
});
