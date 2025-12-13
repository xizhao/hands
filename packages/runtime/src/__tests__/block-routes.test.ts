/**
 * Block Route Resolution Tests
 *
 * Tests the HTTP route handling for blocks to ensure:
 * - Blocks in registry are accessible
 * - Missing blocks return 404
 * - Nested block paths work (e.g., charts/bar-chart)
 * - Query params are passed correctly
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HandsConfig } from "../build/index.js";
import { generateWorkerTemplate } from "../build/worker-template.js";

// We test the worker template generation and routing logic
// without spinning up a full Vite server

describe("Block Route Resolution", () => {
  describe("Worker Template Generation", () => {
    const mockConfig: HandsConfig = {
      name: "test-workbook",
      blocks: { dir: "./blocks" },
    };

    test("generates BLOCKS registry with correct block IDs", () => {
      const blocks = [
        { id: "welcome", path: "welcome.tsx", parentDir: "" },
        { id: "charts/bar-chart", path: "charts/bar-chart.tsx", parentDir: "charts" },
        { id: "deep/nested/block", path: "deep/nested/block.tsx", parentDir: "deep/nested" },
      ];

      const template = generateWorkerTemplate({
        config: mockConfig,
        blocks,
        workbookDir: "/tmp/test-workbook",
      });

      // Check that all blocks are in the registry
      expect(template).toContain('"welcome": Block0');
      expect(template).toContain('"charts/bar-chart": Block1');
      expect(template).toContain('"deep/nested/block": Block2');
    });

    test("generates correct import paths for blocks", () => {
      const blocks = [
        { id: "welcome", path: "welcome.tsx", parentDir: "" },
        { id: "charts/bar-chart", path: "charts/bar-chart.tsx", parentDir: "charts" },
      ];

      const template = generateWorkerTemplate({
        config: mockConfig,
        blocks,
        workbookDir: "/tmp/test-workbook",
      });

      // Import paths should be relative to the .hands/src directory
      expect(template).toContain('import Block0 from "../.././blocks/welcome.tsx"');
      expect(template).toContain('import Block1 from "../.././blocks/charts/bar-chart.tsx"');
    });

    test("generates 404 handler for missing blocks", () => {
      const template = generateWorkerTemplate({
        config: mockConfig,
        blocks: [],
        workbookDir: "/tmp/test-workbook",
      });

      // The route handler should check BLOCKS registry and return 404
      expect(template).toContain("const Block = BLOCKS[blockId]");
      expect(template).toContain("if (!Block)");
      expect(template).toContain("return c.json({ error: `Block not found: ${blockId}` }, 404)");
    });

    test("generates /blocks list endpoint", () => {
      const blocks = [
        { id: "welcome", path: "welcome.tsx", parentDir: "" },
        { id: "dashboard", path: "dashboard.tsx", parentDir: "" },
      ];

      const template = generateWorkerTemplate({
        config: mockConfig,
        blocks,
        workbookDir: "/tmp/test-workbook",
      });

      // Should have a /blocks endpoint that lists all blocks
      expect(template).toContain('app.get("/blocks", (c) => {');
      expect(template).toContain("blocks: Object.keys(BLOCKS)");
    });

    test("supports nested block paths with Hono path pattern", () => {
      const template = generateWorkerTemplate({
        config: mockConfig,
        blocks: [],
        workbookDir: "/tmp/test-workbook",
      });

      // Hono route should use {.+} pattern for multi-segment paths
      expect(template).toContain('app.get("/blocks/:blockId{.+}"');
    });

    test("strips edit param from props", () => {
      const template = generateWorkerTemplate({
        config: mockConfig,
        blocks: [],
        workbookDir: "/tmp/test-workbook",
      });

      // Edit param should be removed before passing to component
      expect(template).toContain("delete props.edit");
    });

    test("generates manifest endpoint with blocks from registry", () => {
      const template = generateWorkerTemplate({
        config: mockConfig,
        blocks: [],
        workbookDir: "/tmp/test-workbook",
      });

      // Manifest should use BLOCKS registry
      expect(template).toContain("const blocks = Object.keys(BLOCKS).map(id => {");
    });
  });

  describe("Block Registry Lookup", () => {
    // Test the lookup logic that would run in the worker

    test("exact match for simple block ID", () => {
      const BLOCKS: Record<string, unknown> = {
        welcome: () => null,
        dashboard: () => null,
      };

      const blockId = "welcome";
      const Block = BLOCKS[blockId];
      expect(Block).toBeDefined();
    });

    test("exact match for nested block ID", () => {
      const BLOCKS: Record<string, unknown> = {
        "charts/bar-chart": () => null,
        "charts/line-chart": () => null,
        "deep/nested/block": () => null,
      };

      expect(BLOCKS["charts/bar-chart"]).toBeDefined();
      expect(BLOCKS["deep/nested/block"]).toBeDefined();
    });

    test("returns undefined for missing block", () => {
      const BLOCKS: Record<string, unknown> = {
        welcome: () => null,
      };

      expect(BLOCKS["nonexistent"]).toBeUndefined();
      expect(BLOCKS["welcome/extra"]).toBeUndefined();
    });

    test("block ID is case-sensitive", () => {
      const BLOCKS: Record<string, unknown> = {
        Welcome: () => null,
      };

      expect(BLOCKS["Welcome"]).toBeDefined();
      expect(BLOCKS["welcome"]).toBeUndefined();
    });
  });
});

describe("Block Discovery Integration", () => {
  const TEMP_DIR = join(import.meta.dir, "fixtures/temp-route-blocks");

  beforeAll(() => {
    mkdirSync(TEMP_DIR, { recursive: true });
    mkdirSync(join(TEMP_DIR, "charts"), { recursive: true });

    // Create test blocks
    writeFileSync(
      join(TEMP_DIR, "welcome.tsx"),
      `/** @jsxImportSource react */
export default async function Welcome() {
  return <div>Welcome</div>
}
export const meta = { title: "Welcome" };`,
    );

    writeFileSync(
      join(TEMP_DIR, "charts/bar-chart.tsx"),
      `/** @jsxImportSource react */
export default async function BarChart() {
  return <div>Bar Chart</div>
}
export const meta = { title: "Bar Chart" };`,
    );
  });

  afterAll(() => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
  });

  test("discovered blocks can be found by route handler", async () => {
    const { discoverBlocks } = await import("../blocks/discovery.js");
    const result = await discoverBlocks(TEMP_DIR);

    // Build the same registry structure the worker would have
    const BLOCKS: Record<string, unknown> = {};
    for (const block of result.blocks) {
      BLOCKS[block.id] = block.load;
    }

    // Simulate route handler lookup
    expect(BLOCKS["welcome"]).toBeDefined();
    expect(BLOCKS["charts/bar-chart"]).toBeDefined();
    expect(BLOCKS["nonexistent"]).toBeUndefined();
  });

  test("worker template includes all discovered blocks", async () => {
    const { discoverBlocks } = await import("../blocks/discovery.js");
    const result = await discoverBlocks(TEMP_DIR);

    const blocks = result.blocks.map((b) => ({
      id: b.id,
      path: `${b.id}.tsx`,
      parentDir: b.id.includes("/") ? b.id.substring(0, b.id.lastIndexOf("/")) : "",
    }));

    const template = generateWorkerTemplate({
      config: { name: "test" },
      blocks,
      workbookDir: TEMP_DIR,
    });

    // All discovered blocks should be in the template
    for (const block of result.blocks) {
      expect(template).toContain(`"${block.id}":`);
    }
  });
});
