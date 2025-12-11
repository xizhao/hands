/**
 * Worker Template Generation Tests
 */

import { describe, test, expect } from "bun:test"
import { generateWorkerTemplate } from "../build/worker-template.js"
import type { HandsConfig } from "../build/index.js"

describe("generateWorkerTemplate", () => {
  const baseConfig: HandsConfig = {
    name: "test-workbook",
    blocks: { dir: "./blocks" },
  }

  test("generates correct import paths for root-level blocks", () => {
    const result = generateWorkerTemplate({
      config: baseConfig,
      blocks: [
        { id: "simple-block", path: "simple-block.tsx", parentDir: "" },
      ],
      workbookDir: "/test/workbook",
    })

    expect(result).toContain('import Block0 from "../.././blocks/simple-block.tsx"')
    expect(result).toContain('"simple-block": Block0')
  })

  test("generates correct import paths for nested blocks", () => {
    const result = generateWorkerTemplate({
      config: baseConfig,
      blocks: [
        { id: "charts/bar-chart", path: "charts/bar-chart.tsx", parentDir: "charts" },
      ],
      workbookDir: "/test/workbook",
    })

    expect(result).toContain('import Block0 from "../.././blocks/charts/bar-chart.tsx"')
    expect(result).toContain('"charts/bar-chart": Block0')
  })

  test("uses custom blocks directory", () => {
    const result = generateWorkerTemplate({
      config: {
        ...baseConfig,
        blocks: { dir: "./custom-blocks" },
      },
      blocks: [
        { id: "my-block", path: "my-block.tsx", parentDir: "" },
      ],
      workbookDir: "/test/workbook",
    })

    expect(result).toContain('import Block0 from "../.././custom-blocks/my-block.tsx"')
  })
})
