#!/usr/bin/env bun
import solidPlugin from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "bun",
  format: "esm",
  minify: false,
  sourcemap: "linked",
  external: ["solid-js", "@opentui/core", "@opentui/solid", "@opencode-ai/sdk"],
  plugins: [solidPlugin],
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log("Build succeeded:", result.outputs.map((o) => o.path))
