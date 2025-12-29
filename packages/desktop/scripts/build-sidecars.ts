#!/usr/bin/env bun
/**
 * Build sidecars for Tauri distribution
 *
 * Compiles TypeScript services into standalone binaries using `bun build --compile`
 * Output goes to src-tauri/binaries/ with platform-specific naming
 */

import { $ } from "bun";
import { existsSync, mkdirSync, copyFileSync, cpSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../.."); // monorepo root
const BINARIES_DIR = join(__dirname, "../src-tauri/binaries");

// Detect current platform target triple
function getTargetTriple(): string {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const platform = process.platform;

  if (platform === "darwin") {
    return `${arch}-apple-darwin`;
  } else if (platform === "win32") {
    return `${arch}-pc-windows-msvc`;
  } else if (platform === "linux") {
    return `${arch}-unknown-linux-gnu`;
  }

  throw new Error(`Unsupported platform: ${platform}`);
}

interface Sidecar {
  name: string;
  entry: string;
}

const SIDECARS: Sidecar[] = [
  {
    name: "hands-agent",
    entry: "packages/agent/src/index.ts",
  },
  {
    name: "hands-workbook-server",
    entry: "packages/workbook-server/src/index.ts",
  },
  {
    name: "hands-cli",
    entry: "packages/workbook-server/src/config/cli.ts",
  },
];

async function bundleAgentTools(): Promise<void> {
  const agentDir = join(ROOT, "packages/agent");
  const bundleScript = join(agentDir, "scripts/bundle-tools.ts");

  console.log("Bundling agent tools...");

  // Run the bundle script - this generates embedded-tools.generated.ts
  await $`cd ${agentDir} && bun run ${bundleScript}`;

  console.log("  ✓ Tools bundled and generated");
}

async function buildSidecar(sidecar: Sidecar, targetTriple: string): Promise<void> {
  const entryPath = join(ROOT, sidecar.entry);
  const outputName = `${sidecar.name}-${targetTriple}`;
  const outputPath = join(BINARIES_DIR, outputName);

  console.log(`Building ${sidecar.name}...`);
  console.log(`  Entry: ${entryPath}`);
  console.log(`  Output: ${outputPath}`);

  if (!existsSync(entryPath)) {
    throw new Error(`Entry file not found: ${entryPath}`);
  }

  // Use bun build --compile to create standalone binary
  // Run from monorepo root for proper workspace resolution
  await $`cd ${ROOT} && bun build --compile --minify ${entryPath} --outfile ${outputPath}`;

  // Ad-hoc sign the binary (required for macOS Gatekeeper)
  if (process.platform === "darwin") {
    await $`codesign --force --sign - ${outputPath}`;
    console.log(`  ✓ Built and signed ${outputName}`);
  } else {
    console.log(`  ✓ Built ${outputName}`);
  }
}

async function copyOpencode(targetTriple: string): Promise<void> {
  console.log("Copying opencode binary...");

  // Find the actual opencode binary (not the wrapper script)
  // `which opencode` might return a node wrapper script, so we use `which -a`
  // to get all matches and find the real binary
  const result = Bun.spawnSync(["which", "-a", "opencode"]);
  const paths = result.stdout.toString().trim().split("\n").filter(Boolean);

  let opencodePath: string | null = null;

  for (const path of paths) {
    // Check if this is an actual binary (not a script)
    const fileResult = Bun.spawnSync(["file", path]);
    const fileType = fileResult.stdout.toString();
    if (fileType.includes("Mach-O") || fileType.includes("ELF")) {
      opencodePath = path;
      break;
    }
  }

  if (!opencodePath) {
    throw new Error("opencode binary not found in PATH. Please install it with: npm install -g opencode");
  }

  console.log(`  Source: ${opencodePath}`);

  const outputName = `opencode-${targetTriple}`;
  const outputPath = join(BINARIES_DIR, outputName);
  console.log(`  Output: ${outputPath}`);

  // Copy the binary
  copyFileSync(opencodePath, outputPath);

  // Ad-hoc sign on macOS (required for Gatekeeper)
  if (process.platform === "darwin") {
    await $`codesign --force --sign - ${outputPath}`;
    console.log(`  ✓ Copied and signed ${outputName}`);
  } else {
    console.log(`  ✓ Copied ${outputName}`);
  }
}

/**
 * Copy nodejs-polars native modules for the polars tool
 * These are needed at runtime since native addons can't be bundled
 */
async function copyPolarsNativeModules(): Promise<void> {
  console.log("Copying nodejs-polars native modules...");

  const libDir = join(BINARIES_DIR, "lib", "node_modules");

  // Clean and recreate lib directory
  if (existsSync(libDir)) {
    rmSync(libDir, { recursive: true });
  }
  mkdirSync(libDir, { recursive: true });

  // Find nodejs-polars in node_modules (bun uses .bun/ structure)
  const bunModules = join(ROOT, "node_modules/.bun");

  // Copy main nodejs-polars package
  const polarsDir = join(bunModules, "nodejs-polars@0.17.0/node_modules/nodejs-polars");
  if (!existsSync(polarsDir)) {
    throw new Error(`nodejs-polars not found at ${polarsDir}. Run 'bun install' first.`);
  }
  cpSync(polarsDir, join(libDir, "nodejs-polars"), { recursive: true });
  console.log("  ✓ Copied nodejs-polars");

  // Copy platform-specific native binary
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const platform = process.platform;
  let nativePkgName: string;

  if (platform === "darwin") {
    nativePkgName = `nodejs-polars-darwin-${arch}`;
  } else if (platform === "win32") {
    nativePkgName = `nodejs-polars-win32-${arch}-msvc`;
  } else {
    nativePkgName = `nodejs-polars-linux-${arch}-gnu`;
  }

  const nativeDir = join(bunModules, `${nativePkgName}@0.17.0/node_modules/${nativePkgName}`);
  if (!existsSync(nativeDir)) {
    throw new Error(`Native module ${nativePkgName} not found at ${nativeDir}. Run 'bun install' first.`);
  }
  cpSync(nativeDir, join(libDir, nativePkgName), { recursive: true });
  console.log(`  ✓ Copied ${nativePkgName}`);

  // Sign the native binary for notarization (macOS only)
  if (platform === "darwin") {
    const nodeFile = join(libDir, nativePkgName, `nodejs-polars.darwin-${arch}.node`);
    if (existsSync(nodeFile)) {
      // Sign with Developer ID (uses APPLE_SIGNING_IDENTITY env var or defaults to ad-hoc)
      const identity = process.env.APPLE_SIGNING_IDENTITY || "Developer ID Application";
      await $`codesign --force --timestamp --options runtime --sign ${identity} ${nodeFile}`;
      console.log(`  ✓ Signed ${nativePkgName} native binary`);
    }
  }
}

async function main(): Promise<void> {
  const targetTriple = getTargetTriple();
  console.log(`\nBuilding sidecars for target: ${targetTriple}\n`);

  // Ensure binaries directory exists
  if (!existsSync(BINARIES_DIR)) {
    mkdirSync(BINARIES_DIR, { recursive: true });
  }

  // Bundle agent tools first (generates embedded-tools.generated.ts)
  await bundleAgentTools();

  // Build each sidecar
  for (const sidecar of SIDECARS) {
    await buildSidecar(sidecar, targetTriple);
  }

  // Copy opencode binary
  await copyOpencode(targetTriple);

  // Copy nodejs-polars native modules for the polars tool
  await copyPolarsNativeModules();

  console.log("\n✓ All sidecars built successfully\n");
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
