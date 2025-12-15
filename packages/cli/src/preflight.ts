import fs from "fs";
import path from "path";
import pc from "picocolors";

interface PreflightCheck {
  name: string;
  check: (workbookPath: string) => Promise<boolean | string>;
}

const checks: PreflightCheck[] = [
  {
    name: "package.json exists",
    check: async (workbookPath) => {
      const pkgPath = path.join(workbookPath, "package.json");
      if (!fs.existsSync(pkgPath)) {
        return "Missing package.json. Run 'hands init' to create one.";
      }
      return true;
    },
  },
  {
    name: "package.json is valid",
    check: async (workbookPath) => {
      const pkgPath = path.join(workbookPath, "package.json");
      try {
        const content = fs.readFileSync(pkgPath, "utf-8");
        JSON.parse(content);
        return true;
      } catch {
        return "package.json is not valid JSON";
      }
    },
  },
  {
    name: "node_modules installed",
    check: async (workbookPath) => {
      const nodeModules = path.join(workbookPath, "node_modules");
      if (!fs.existsSync(nodeModules)) {
        return "node_modules not found. Run 'bun install' first.";
      }
      return true;
    },
  },
  {
    name: "blocks directory exists",
    check: async (workbookPath) => {
      const blocksDir = path.join(workbookPath, "blocks");
      if (!fs.existsSync(blocksDir)) {
        fs.mkdirSync(blocksDir, { recursive: true });
        console.log(pc.dim("  Created blocks/ directory"));
      }
      return true;
    },
  },
  {
    name: ".hands directory exists",
    check: async (workbookPath) => {
      const handsDir = path.join(workbookPath, ".hands");
      if (!fs.existsSync(handsDir)) {
        fs.mkdirSync(handsDir, { recursive: true });
        console.log(pc.dim("  Created .hands/ directory"));
      }
      return true;
    },
  },
];

export async function preflight(workbookPath: string): Promise<boolean> {
  console.log(pc.dim("Running preflight checks..."));

  let allPassed = true;

  for (const check of checks) {
    const result = await check.check(workbookPath);
    if (result === true) {
      console.log(pc.green(`  ✓ ${check.name}`));
    } else {
      console.log(pc.red(`  ✗ ${check.name}`));
      console.log(pc.red(`    ${result}`));
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log(pc.green("Preflight checks passed\n"));
  }

  return allPassed;
}
