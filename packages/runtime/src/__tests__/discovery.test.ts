/**
 * Block Discovery Tests
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverBlocks } from "../blocks/discovery.js";

const FIXTURES_DIR = join(import.meta.dir, "fixtures/blocks");

describe("discoverBlocks", () => {
  test("provides load function that imports the block", async () => {
    const result = await discoverBlocks(FIXTURES_DIR);
    const simpleBlock = result.blocks.find((b) => b.id === "simple-block");

    expect(simpleBlock?.load).toBeDefined();

    const loaded = await simpleBlock?.load();
    expect(loaded).toBeDefined();
    expect(loaded!.default).toBeDefined();
    expect(typeof loaded!.default).toBe("function");
    expect(loaded!.meta?.title).toBe("Simple Block");
  });

  test("excludes directories matching exclude patterns", async () => {
    const result = await discoverBlocks(FIXTURES_DIR, {
      exclude: ["charts/*"],
    });

    const blockIds = result.blocks.map((b) => b.id);
    expect(blockIds).not.toContain("charts/bar-chart");
    expect(blockIds).toContain("simple-block");
  });
});

describe("discoverBlocks with invalid blocks", () => {
  const TEMP_DIR = join(import.meta.dir, "fixtures/temp-blocks");

  beforeAll(() => {
    mkdirSync(TEMP_DIR, { recursive: true });

    writeFileSync(join(TEMP_DIR, "no-export.tsx"), `export const foo = 42;`);

    writeFileSync(
      join(TEMP_DIR, "valid.tsx"),
      `/** @jsxImportSource react */
export default async function ValidBlock() {
  return <div>Valid</div>
}
export const meta = { title: "Valid" };`,
    );
  });

  afterAll(() => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
  });

  test("reports errors for invalid blocks", async () => {
    const result = await discoverBlocks(TEMP_DIR);

    expect(result.blocks.length).toBeGreaterThanOrEqual(1);

    const invalidError = result.errors.find((e) => e.file === "no-export.tsx");
    expect(invalidError).toBeDefined();
    expect(invalidError?.error).toContain("default export");
  });
});
