#!/usr/bin/env bun
/**
 * Release Script
 *
 * Handles version bumping and full release build.
 *
 * Usage:
 *   bun run release              # Build with current version
 *   bun run release patch        # Bump patch (0.1.0 -> 0.1.1) and build
 *   bun run release minor        # Bump minor (0.1.0 -> 0.2.0) and build
 *   bun run release major        # Bump major (0.1.0 -> 1.0.0) and build
 *   bun run release 1.2.3        # Set specific version and build
 *
 * Environment variables:
 *   APPLE_SIGNING_IDENTITY  - Developer ID cert (required for signed release)
 *   APPLE_ID                - Apple ID for notarization
 *   APPLE_PASSWORD          - App-specific password for notarization
 *   APPLE_TEAM_ID           - Team ID for notarization
 */

import { $ } from "bun";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = join(__dirname, "..");
const TAURI_CONF = join(DESKTOP_DIR, "src-tauri/tauri.conf.json");
const PACKAGE_JSON = join(DESKTOP_DIR, "package.json");
const CARGO_TOML = join(DESKTOP_DIR, "src-tauri/Cargo.toml");

type BumpType = "major" | "minor" | "patch";

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function bumpVersion(current: string, type: BumpType): string {
  const [major, minor, patch] = parseVersion(current);
  switch (type) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

function updateTauriConf(version: string) {
  const content = readFileSync(TAURI_CONF, "utf-8");
  const config = JSON.parse(content);
  config.version = version;
  writeFileSync(TAURI_CONF, JSON.stringify(config, null, 2) + "\n");
}

function updatePackageJson(version: string) {
  const content = readFileSync(PACKAGE_JSON, "utf-8");
  const pkg = JSON.parse(content);
  pkg.version = version;
  writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n");
}

function updateCargoToml(version: string) {
  let content = readFileSync(CARGO_TOML, "utf-8");
  content = content.replace(
    /^version = "[\d.]+"$/m,
    `version = "${version}"`
  );
  writeFileSync(CARGO_TOML, content);
}

function getCurrentVersion(): string {
  const content = readFileSync(TAURI_CONF, "utf-8");
  return JSON.parse(content).version;
}

async function main() {
  const arg = process.argv[2];
  let newVersion: string;
  const currentVersion = getCurrentVersion();

  // Determine new version
  if (!arg) {
    newVersion = currentVersion;
    console.log(`\n📦 Building release v${newVersion}\n`);
  } else if (["major", "minor", "patch"].includes(arg)) {
    newVersion = bumpVersion(currentVersion, arg as BumpType);
    console.log(`\n📦 Bumping ${arg}: ${currentVersion} → ${newVersion}\n`);
  } else if (/^\d+\.\d+\.\d+$/.test(arg)) {
    newVersion = arg;
    console.log(`\n📦 Setting version: ${currentVersion} → ${newVersion}\n`);
  } else {
    console.error("Usage: bun run release [major|minor|patch|x.y.z]");
    process.exit(1);
  }

  // Update version in all files if changed
  if (newVersion !== currentVersion) {
    console.log("Updating version in config files...");
    updateTauriConf(newVersion);
    updatePackageJson(newVersion);
    updateCargoToml(newVersion);
    console.log("✓ Version updated\n");
  }

  // Check signing setup
  const hasSigningIdentity = !!process.env.APPLE_SIGNING_IDENTITY;
  const hasNotarization = !!(process.env.APPLE_ID && process.env.APPLE_PASSWORD);

  console.log("Release configuration:");
  console.log(`  Version: ${newVersion}`);
  console.log(`  Signing: ${hasSigningIdentity ? "✓ Developer ID" : "⚠ Ad-hoc (dev only)"}`);
  console.log(`  Notarization: ${hasNotarization ? "✓ Enabled" : "⚠ Disabled"}`);
  console.log("");

  if (!hasSigningIdentity) {
    console.log("⚠ Warning: Building without Developer ID signature.");
    console.log("  Set APPLE_SIGNING_IDENTITY for distribution builds.\n");
  }

  // Run the full build
  console.log("Starting build...\n");

  try {
    // Build sidecars
    console.log("→ Building sidecars...");
    await $`bun run build:sidecars`.cwd(DESKTOP_DIR);

    // Build docs
    console.log("→ Building docs...");
    await $`bun run build:docs`.cwd(DESKTOP_DIR).quiet().catch(() => {
      console.log("  (docs skipped)");
    });

    // Build Tauri app
    console.log("→ Building Tauri app...");
    await $`bunx tauri build`.cwd(DESKTOP_DIR);

    // Sign and package
    console.log("→ Signing and packaging...");
    await $`bun run scripts/sign-and-package.ts`.cwd(DESKTOP_DIR);

    // Output location
    const dmgPath = `src-tauri/target/release/bundle/dmg/Hands_${newVersion}_aarch64.dmg`;

    console.log("\n" + "=".repeat(50));
    console.log(`✅ Release v${newVersion} built successfully!`);
    console.log("=".repeat(50));
    console.log(`\nOutput: ${dmgPath}\n`);

    if (!hasSigningIdentity) {
      console.log("Note: This build is ad-hoc signed (for development only).");
      console.log("For distribution, set APPLE_SIGNING_IDENTITY and rebuild.\n");
    }
  } catch (err) {
    console.error("\n❌ Build failed:", err);
    process.exit(1);
  }
}

main();
