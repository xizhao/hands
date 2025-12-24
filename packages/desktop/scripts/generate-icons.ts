#!/usr/bin/env npx tsx
/**
 * Generate all app icons from the HandsLogo SVG.
 * Uses the exact SVG paths from the HandsLogo React component.
 */

import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, "..", "src-tauri", "icons");

// The exact HandsLogo SVG paths from packages/app/src/components/ui/hands-logo.tsx
const HANDS_LOGO_PATHS = `
  <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
  <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
  <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
`;

function createTraySvg(size: number): string {
  const padding = size * 0.1;
  const inner = size - padding * 2;
  const scale = inner / 24;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${padding}, ${padding}) scale(${scale})"
     fill="none"
     stroke="#000000"
     stroke-width="2"
     stroke-linecap="round"
     stroke-linejoin="round">
    ${HANDS_LOGO_PATHS}
  </g>
</svg>`;
}

// Theme colors from packages/app/src/lib/theme.ts (dark theme)
// background: HSL(224, 10%, 10%) = #18191d
// foreground: HSL(210, 20%, 98%) = #f9fafb
const DARK_BG = "#18191d";
const DARK_FG = "#f9fafb";

function createAppSvg(size: number): string {
  const padding = size * 0.15;
  const inner = size - padding * 2;
  const scale = inner / 24;
  const cornerRadius = size * 0.22;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="${DARK_BG}"/>
  <g transform="translate(${padding}, ${padding}) scale(${scale})"
     fill="none"
     stroke="${DARK_FG}"
     stroke-width="2"
     stroke-linecap="round"
     stroke-linejoin="round">
    ${HANDS_LOGO_PATHS}
  </g>
</svg>`;
}

async function svgToPng(svg: string, outputPath: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function generateAllIcons(): Promise<void> {
  await mkdir(ICONS_DIR, { recursive: true });

  console.log("Generating tray icons...");
  for (const [size, suffix] of [[22, ""], [44, "@2x"]] as const) {
    const svg = createTraySvg(size);
    const output = join(ICONS_DIR, `tray-icon${suffix}.png`);
    await svgToPng(svg, output);
    console.log(`  Created tray-icon${suffix}.png`);
  }

  console.log("Generating app icons...");
  for (const size of [32, 64, 128, 256, 512, 1024]) {
    const svg = createAppSvg(size);
    const output = join(ICONS_DIR, `${size}x${size}.png`);
    await svgToPng(svg, output);
    console.log(`  Created ${size}x${size}.png`);
  }

  // Retina versions
  for (const size of [128, 256, 512]) {
    const svg = createAppSvg(size * 2);
    const output = join(ICONS_DIR, `${size}x${size}@2x.png`);
    await svgToPng(svg, output);
    console.log(`  Created ${size}x${size}@2x.png`);
  }

  // Main icon.png
  const iconSvg = createAppSvg(512);
  await svgToPng(iconSvg, join(ICONS_DIR, "icon.png"));
  console.log("  Created icon.png");

  // Windows Store logos
  console.log("Generating Windows Store logos...");
  const storeSizes: [string, number][] = [
    ["StoreLogo", 50],
    ["Square30x30Logo", 30],
    ["Square44x44Logo", 44],
    ["Square71x71Logo", 71],
    ["Square89x89Logo", 89],
    ["Square107x107Logo", 107],
    ["Square142x142Logo", 142],
    ["Square150x150Logo", 150],
    ["Square284x284Logo", 284],
    ["Square310x310Logo", 310],
  ];
  for (const [name, size] of storeSizes) {
    const svg = createAppSvg(size);
    await svgToPng(svg, join(ICONS_DIR, `${name}.png`));
    console.log(`  Created ${name}.png`);
  }

  console.log("\nGenerating macOS .icns...");
  await generateIcns();

  console.log("\nDone!");
}

async function generateIcns(): Promise<void> {
  const iconsetDir = join(ICONS_DIR, "icon.iconset");
  await mkdir(iconsetDir, { recursive: true });

  const sizes = [16, 32, 64, 128, 256, 512];

  for (const size of sizes) {
    const svg = createAppSvg(size);
    await svgToPng(svg, join(iconsetDir, `icon_${size}x${size}.png`));

    const svg2x = createAppSvg(size * 2);
    await svgToPng(svg2x, join(iconsetDir, `icon_${size}x${size}@2x.png`));
  }

  // 512@2x
  const svg1024 = createAppSvg(1024);
  await svgToPng(svg1024, join(iconsetDir, "icon_512x512@2x.png"));

  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(ICONS_DIR, "icon.icns")}"`, {
      stdio: "pipe",
    });
    console.log("  Created icon.icns");
  } catch (e) {
    console.log("  Warning: Could not create icon.icns");
  }

  // Cleanup
  execSync(`rm -rf "${iconsetDir}"`);
}

generateAllIcons().catch(console.error);
