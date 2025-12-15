/**
 * Preflight Check Tests
 *
 * Tests the preflight validation system that ensures
 * environment is ready before starting the runtime.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type PreflightResult, runPreflight } from "../preflight.js";

const TEMP_DIR = join(import.meta.dir, "fixtures/temp-preflight");

describe("Preflight Checks", () => {
  beforeAll(() => {
    // Clean up any existing temp dir
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(TEMP_DIR)) {
      rmSync(TEMP_DIR, { recursive: true });
    }
  });

  describe("Workbook Validation", () => {
    test("fails if workbook directory does not exist", async () => {
      const result = await runPreflight({
        workbookDir: "/nonexistent/path/to/workbook",
        autoFix: false,
        verbose: false,
      });

      const workbookCheck = result.checks.find((c) => c.name === "Workbook directory");
      expect(workbookCheck?.ok).toBe(false);
      expect(result.ok).toBe(false);
    });

    test("fails if hands.json is missing", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const handsJsonCheck = result.checks.find((c) => c.name === "hands.json");
      expect(handsJsonCheck?.ok).toBe(false);
    });

    test("fails if hands.json is invalid JSON", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), "{ invalid json }");

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const handsJsonCheck = result.checks.find((c) => c.name === "hands.json");
      expect(handsJsonCheck?.ok).toBe(false);
      expect(handsJsonCheck?.message).toContain("Invalid JSON");

      rmSync(TEMP_DIR, { recursive: true });
    });

    test("fails if hands.json missing name field", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ version: 1 }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const handsJsonCheck = result.checks.find((c) => c.name === "hands.json");
      expect(handsJsonCheck?.ok).toBe(false);
      expect(handsJsonCheck?.message).toContain("name");

      rmSync(TEMP_DIR, { recursive: true });
    });

    test("passes with valid hands.json", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const handsJsonCheck = result.checks.find((c) => c.name === "hands.json");
      expect(handsJsonCheck?.ok).toBe(true);
      expect(handsJsonCheck?.message).toContain("test-workbook");

      rmSync(TEMP_DIR, { recursive: true });
    });
  });

  describe("Directory Auto-Fix", () => {
    test("creates blocks/ directory when autoFix is true", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: true,
        verbose: false,
      });

      const blocksCheck = result.checks.find((c) => c.name === "blocks/ directory");
      expect(blocksCheck?.ok).toBe(true);
      expect(blocksCheck?.fixed).toBe(true);
      expect(existsSync(join(TEMP_DIR, "blocks"))).toBe(true);

      rmSync(TEMP_DIR, { recursive: true });
    });

    test("creates sources/ directory when autoFix is true", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: true,
        verbose: false,
      });

      const sourcesCheck = result.checks.find((c) => c.name === "sources/ directory");
      expect(sourcesCheck?.ok).toBe(true);
      expect(sourcesCheck?.fixed).toBe(true);
      expect(existsSync(join(TEMP_DIR, "sources"))).toBe(true);

      rmSync(TEMP_DIR, { recursive: true });
    });
  });

  describe("Dependencies Validation", () => {
    test("skips dependency check if .hands directory does not exist", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const depsCheck = result.checks.find((c) => c.name === ".hands/ dependencies");
      expect(depsCheck?.ok).toBe(true);
      expect(depsCheck?.message).toContain("first build");

      rmSync(TEMP_DIR, { recursive: true });
    });

    test("detects missing node_modules in .hands", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands"), { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));
      writeFileSync(join(TEMP_DIR, ".hands/package.json"), JSON.stringify({ name: "test" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const depsCheck = result.checks.find((c) => c.name === ".hands/ dependencies");
      expect(depsCheck?.ok).toBe(false);
      expect(depsCheck?.message).toContain("bun install");

      rmSync(TEMP_DIR, { recursive: true });
    });

    test("detects missing critical dependencies", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands/node_modules"), { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));
      writeFileSync(join(TEMP_DIR, ".hands/package.json"), JSON.stringify({ name: "test" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const depsCheck = result.checks.find((c) => c.name === ".hands/ dependencies");
      expect(depsCheck?.ok).toBe(false);
      expect(depsCheck?.message).toContain("Missing");
      expect(depsCheck?.message).toContain("vite");
      expect(depsCheck?.message).toContain("rwsdk");
      expect(depsCheck?.message).toContain("react");

      rmSync(TEMP_DIR, { recursive: true });
    });

    test("detects incomplete rwsdk install (missing dist/vite)", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands/node_modules/vite"), { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands/node_modules/rwsdk"), { recursive: true }); // rwsdk exists but incomplete
      mkdirSync(join(TEMP_DIR, ".hands/node_modules/react"), { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));
      writeFileSync(join(TEMP_DIR, ".hands/package.json"), JSON.stringify({ name: "test" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const depsCheck = result.checks.find((c) => c.name === ".hands/ dependencies");
      expect(depsCheck?.ok).toBe(false);
      expect(depsCheck?.message).toContain("rwsdk/vite");
      expect(depsCheck?.message).toContain("incomplete");

      rmSync(TEMP_DIR, { recursive: true });
    });

    test("passes when all critical deps and subpaths exist", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands/node_modules/vite"), { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands/node_modules/rwsdk/dist/vite"), { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands/node_modules/react"), { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));
      writeFileSync(join(TEMP_DIR, ".hands/package.json"), JSON.stringify({ name: "test" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const depsCheck = result.checks.find((c) => c.name === ".hands/ dependencies");
      expect(depsCheck?.ok).toBe(true);
      expect(depsCheck?.message).toBe("All present");

      rmSync(TEMP_DIR, { recursive: true });
    });
  });

  describe("Corrupted State Detection", () => {
    test("detects corrupted .hands (node_modules without package.json)", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands/node_modules"), { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));
      // Intentionally not creating .hands/package.json

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: false,
        verbose: false,
      });

      const buildDirCheck = result.checks.find((c) => c.name === ".hands/ build directory");
      expect(buildDirCheck?.ok).toBe(false);
      expect(buildDirCheck?.message).toContain("Corrupted");

      rmSync(TEMP_DIR, { recursive: true });
    });

    test("auto-fixes corrupted .hands by clearing it", async () => {
      mkdirSync(TEMP_DIR, { recursive: true });
      mkdirSync(join(TEMP_DIR, ".hands/node_modules"), { recursive: true });
      writeFileSync(join(TEMP_DIR, "hands.json"), JSON.stringify({ name: "test-workbook" }));

      const result = await runPreflight({
        workbookDir: TEMP_DIR,
        autoFix: true,
        verbose: false,
      });

      const buildDirCheck = result.checks.find((c) => c.name === ".hands/ build directory");
      expect(buildDirCheck?.ok).toBe(true);
      expect(buildDirCheck?.fixed).toBe(true);
      expect(existsSync(join(TEMP_DIR, ".hands"))).toBe(false);

      rmSync(TEMP_DIR, { recursive: true });
    });
  });
});
