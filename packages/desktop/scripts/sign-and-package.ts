#!/usr/bin/env bun
/**
 * Sign and repackage the Tauri app bundle
 *
 * Tauri's bundler doesn't properly sign external binaries (sidecars),
 * so we need to re-sign the entire bundle and recreate the DMG.
 *
 * Environment variables:
 * - APPLE_SIGNING_IDENTITY: Developer ID Application certificate name
 *   e.g., "Developer ID Application: Your Name (TEAMID)"
 * - APPLE_ID: Apple ID email for notarization (optional)
 * - APPLE_PASSWORD: App-specific password for notarization (optional)
 * - APPLE_TEAM_ID: Team ID for notarization (optional)
 */

import { $ } from "bun";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAURI_DIR = join(__dirname, "../src-tauri");
const BUNDLE_DIR = join(TAURI_DIR, "target/release/bundle");
const APP_PATH = join(BUNDLE_DIR, "macos/Hands.app");
const ENTITLEMENTS = join(TAURI_DIR, "Entitlements.plist");
const TAURI_CONF = join(TAURI_DIR, "tauri.conf.json");

// Read version from tauri.conf.json
function getVersion(): string {
  try {
    const content = readFileSync(TAURI_CONF, "utf-8");
    return JSON.parse(content).version || "0.1.0";
  } catch {
    return "0.1.0";
  }
}

// Detect architecture
function getArch(): string {
  return process.arch === "arm64" ? "aarch64" : "x86_64";
}

const VERSION = getVersion();
const ARCH = getArch();
const DMG_PATH = join(BUNDLE_DIR, `dmg/Hands_${VERSION}_${ARCH}.dmg`);

// Get signing identity from env or use ad-hoc
const SIGNING_IDENTITY = process.env.APPLE_SIGNING_IDENTITY || "-";
const IS_DEV_SIGNED = SIGNING_IDENTITY !== "-";

async function signBinary(path: string, deep = false) {
  const args = ["--force", "--options", "runtime", "--sign", SIGNING_IDENTITY];
  if (deep) args.push("--deep");
  if (existsSync(ENTITLEMENTS)) {
    args.push("--entitlements", ENTITLEMENTS);
  }
  args.push(path);
  await $`codesign ${args}`;
}

async function main() {
  console.log("\n🔐 Signing app bundle...");
  console.log(`   Identity: ${IS_DEV_SIGNED ? SIGNING_IDENTITY : "ad-hoc (development)"}`);

  // Sign sidecars individually first (they need entitlements)
  const sidecars = [
    "hands-agent-aarch64-apple-darwin",
    "hands-workbook-server-aarch64-apple-darwin",
    "hands-cli-aarch64-apple-darwin",
  ];

  for (const sidecar of sidecars) {
    const sidecarPath = join(APP_PATH, "Contents/MacOS", sidecar);
    if (existsSync(sidecarPath)) {
      console.log(`   Signing sidecar: ${sidecar}`);
      await signBinary(sidecarPath);
    }
  }

  // Sign the main app bundle
  console.log("   Signing app bundle...");
  await signBinary(APP_PATH, true);

  // Verify signature
  try {
    await $`codesign --verify --deep --strict ${APP_PATH}`.quiet();
    console.log("✓ Signature valid");
  } catch {
    console.error("✗ Signature verification failed");
    process.exit(1);
  }

  // Notarize if we have credentials and a real identity
  if (IS_DEV_SIGNED && process.env.APPLE_ID && process.env.APPLE_PASSWORD) {
    console.log("\n📤 Notarizing app...");
    const teamId = process.env.APPLE_TEAM_ID || "";

    try {
      // Create a zip for notarization
      const zipPath = join(BUNDLE_DIR, "Hands.zip");
      await $`ditto -c -k --keepParent ${APP_PATH} ${zipPath}`;

      // Submit for notarization
      const notarizeArgs = [
        "notarytool", "submit", zipPath,
        "--apple-id", process.env.APPLE_ID,
        "--password", process.env.APPLE_PASSWORD,
        "--wait",
      ];
      if (teamId) notarizeArgs.push("--team-id", teamId);

      await $`xcrun ${notarizeArgs}`;

      // Staple the notarization ticket
      await $`xcrun stapler staple ${APP_PATH}`;

      // Cleanup
      await $`rm -f ${zipPath}`;

      console.log("✓ Notarization complete");
    } catch (err) {
      console.error("⚠ Notarization failed:", err);
      console.log("  Continuing without notarization...");
    }
  } else if (IS_DEV_SIGNED) {
    console.log("\n⚠ Skipping notarization (set APPLE_ID and APPLE_PASSWORD to enable)");
  }

  console.log("\n📦 Recreating DMG...");

  // Remove old DMG
  await $`rm -f ${DMG_PATH}`.quiet().catch(() => {});

  // Create staging folder with app + Applications symlink
  const stagingDir = `/tmp/Hands-dmg-staging`;
  await $`rm -rf ${stagingDir}`.quiet().catch(() => {});
  await $`mkdir -p ${stagingDir}`;
  await $`cp -R ${APP_PATH} ${stagingDir}/`;
  await $`ln -s /Applications ${stagingDir}/Applications`;

  // Create new DMG using hdiutil
  const dmgName = `Hands_${VERSION}_${ARCH}`;
  const tempDmg = `/tmp/${dmgName}-temp.dmg`;

  // Create temporary DMG from staging folder
  await $`hdiutil create -volname "Hands" -srcfolder ${stagingDir} -ov -format UDRW ${tempDmg}`;

  // Convert to compressed DMG
  await $`hdiutil convert ${tempDmg} -format UDZO -o ${DMG_PATH}`;

  // Cleanup
  await $`rm -f ${tempDmg}`;
  await $`rm -rf ${stagingDir}`;

  // Sign the DMG too if we have a real identity
  if (IS_DEV_SIGNED) {
    console.log("   Signing DMG...");
    await $`codesign --force --sign ${SIGNING_IDENTITY} ${DMG_PATH}`;
  }

  console.log(`✓ DMG created: ${DMG_PATH}`);
  console.log("\n✅ Signing and packaging complete\n");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
