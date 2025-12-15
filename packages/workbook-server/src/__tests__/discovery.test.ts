/**
 * Workbook Discovery Tests
 *
 * Tests the unified workbook discovery module.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverBlocks, discoverWorkbook } from "../workbook/discovery.js";

const FIXTURES_DIR = join(import.meta.dir, "fixtures/blocks");

describe("discoverBlocks", () => {
  test("discovers blocks from directory", async () => {
    const result = await discoverBlocks(FIXTURES_DIR);
    const simpleBlock = result.items.find((b) => b.id === "simple-block");

    expect(simpleBlock).toBeDefined();
    expect(simpleBlock?.meta.title).toBe("Simple Block");
  });

  test("excludes directories matching exclude patterns", async () => {
    const result = await discoverBlocks(FIXTURES_DIR, {
      exclude: ["charts/*"],
    });

    const blockIds = result.items.map((b) => b.id);
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

    expect(result.items.length).toBeGreaterThanOrEqual(1);

    const invalidError = result.errors.find((e) => e.file === "no-export.tsx");
    expect(invalidError).toBeDefined();
    expect(invalidError?.error).toContain("default export");
  });
});

describe("discoverWorkbook", () => {
  const TEMP_WORKBOOK = join(import.meta.dir, "fixtures/temp-workbook");

  beforeAll(() => {
    // Create workbook structure
    mkdirSync(join(TEMP_WORKBOOK, "blocks"), { recursive: true });
    mkdirSync(join(TEMP_WORKBOOK, "pages"), { recursive: true });
    mkdirSync(join(TEMP_WORKBOOK, "ui"), { recursive: true });

    // Add a block
    writeFileSync(
      join(TEMP_WORKBOOK, "blocks/test-block.tsx"),
      `export default function TestBlock() { return <div>Test</div>; }`,
    );

    // Add a page
    writeFileSync(
      join(TEMP_WORKBOOK, "pages/index.md"),
      `# Home Page`,
    );

    // Add a client component
    writeFileSync(
      join(TEMP_WORKBOOK, "ui/button.tsx"),
      `"use client";\nexport function Button() { return <button>Click</button>; }`,
    );

    // Add a server component
    writeFileSync(
      join(TEMP_WORKBOOK, "ui/card.tsx"),
      `export function Card() { return <div>Card</div>; }`,
    );
  });

  afterAll(() => {
    if (existsSync(TEMP_WORKBOOK)) {
      rmSync(TEMP_WORKBOOK, { recursive: true });
    }
  });

  test("discovers blocks, pages, and components", async () => {
    const manifest = await discoverWorkbook({ rootPath: TEMP_WORKBOOK });

    expect(manifest.blocks).toHaveLength(1);
    expect(manifest.blocks[0].id).toBe("test-block");

    expect(manifest.pages).toHaveLength(1);
    expect(manifest.pages[0].route).toBe("/");

    expect(manifest.components).toHaveLength(2);
    const button = manifest.components.find((c) => c.name === "button");
    const card = manifest.components.find((c) => c.name === "card");
    expect(button?.isClientComponent).toBe(true);
    expect(card?.isClientComponent).toBe(false);
  });
});
