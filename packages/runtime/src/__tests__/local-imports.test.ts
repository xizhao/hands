/**
 * Local Imports Integration Tests
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { discoverBlocks } from "../blocks/discovery.js";
import { buildRSC } from "../build/rsc.js";

const FIXTURES_DIR = join(import.meta.dir, "fixtures");
const BLOCKS_DIR = join(FIXTURES_DIR, "blocks");

describe("blocks with local imports", () => {
  test("block with local import can be loaded", async () => {
    const result = await discoverBlocks(BLOCKS_DIR);

    const blockWithImport = result.blocks.find((b) => b.id === "with-local-import");
    expect(blockWithImport).toBeDefined();

    const loaded = await blockWithImport?.load();
    expect(loaded).toBeDefined();
    expect(loaded?.default).toBeDefined();
    expect(typeof loaded?.default).toBe("function");
  });
});

describe("RSC build with local imports", () => {
  const TEMP_WORKBOOK = join(import.meta.dir, "fixtures/temp-workbook");

  function setupTempWorkbook() {
    if (existsSync(TEMP_WORKBOOK)) {
      rmSync(TEMP_WORKBOOK, { recursive: true });
    }

    mkdirSync(join(TEMP_WORKBOOK, "blocks"), { recursive: true });
    mkdirSync(join(TEMP_WORKBOOK, "lib"), { recursive: true });

    writeFileSync(
      join(TEMP_WORKBOOK, "hands.json"),
      JSON.stringify({
        name: "test-local-imports",
        blocks: { dir: "./blocks" },
      }),
    );

    writeFileSync(
      join(TEMP_WORKBOOK, "lib/utils.ts"),
      `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export const VERSION = "1.0.0";
`,
    );

    writeFileSync(
      join(TEMP_WORKBOOK, "blocks/greeting.tsx"),
      `/** @jsxImportSource react */
import type { BlockFn, BlockMeta } from "@hands/stdlib"
import { greet, VERSION } from "../lib/utils"

export const meta: BlockMeta = {
  title: "Greeting Block",
  description: "Uses local utility",
}

const GreetingBlock: BlockFn<{ name?: string }> = async (props) => {
  const message = greet(props.name || "World")
  return (
    <div>
      <p>{message}</p>
      <small>v{VERSION}</small>
    </div>
  )
}

export default GreetingBlock
`,
    );

    mkdirSync(join(TEMP_WORKBOOK, "blocks/shared"), { recursive: true });
    writeFileSync(
      join(TEMP_WORKBOOK, "blocks/shared/components.tsx"),
      `/** @jsxImportSource react */
export function Wrapper({ children }: { children: React.ReactNode }) {
  return <div className="wrapper">{children}</div>
}
`,
    );

    writeFileSync(
      join(TEMP_WORKBOOK, "blocks/with-shared.tsx"),
      `/** @jsxImportSource react */
import type { BlockFn, BlockMeta } from "@hands/stdlib"
import { Wrapper } from "./shared/components"

export const meta: BlockMeta = {
  title: "With Shared",
  description: "Uses shared component",
}

const WithSharedBlock: BlockFn = async () => {
  return (
    <Wrapper>
      <p>Content inside wrapper</p>
    </Wrapper>
  )
}

export default WithSharedBlock
`,
    );
  }

  afterAll(() => {
    if (existsSync(TEMP_WORKBOOK)) {
      rmSync(TEMP_WORKBOOK, { recursive: true });
    }
  });

  test("buildRSC discovers blocks with local imports", async () => {
    setupTempWorkbook();
    const result = await buildRSC(TEMP_WORKBOOK);

    expect(result.blocks).toBeDefined();
    expect(result.workerEntry).toBeDefined();

    const greetingBlock = result.blocks?.find((b) => b.id === "greeting");
    expect(greetingBlock).toBeDefined();

    const withSharedBlock = result.blocks?.find((b) => b.id === "with-shared");
    expect(withSharedBlock).toBeDefined();
  });

  test("buildRSC generates worker with correct import paths", async () => {
    setupTempWorkbook();
    const result = await buildRSC(TEMP_WORKBOOK);

    expect(result.workerEntry).toBeDefined();

    const workerContent = await Bun.file(result.workerEntry!).text();

    expect(workerContent).toContain("greeting");
    expect(workerContent).toContain("with-shared");
    expect(workerContent).toContain('from "../.././blocks/');
  });

  test("shared components in blocks/ are not treated as blocks", async () => {
    setupTempWorkbook();
    const result = await buildRSC(TEMP_WORKBOOK);

    const sharedBlock = result.blocks?.find((b) => b.id === "shared/components");
    expect(sharedBlock).toBeUndefined();

    const sharedError = result.errors.find((e) => e.includes("shared/components"));
    expect(sharedError).toBeDefined();
  });
});
