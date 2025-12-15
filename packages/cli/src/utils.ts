import fs from "fs";
import path from "path";

/**
 * Find the workbook root by looking for package.json with hands config
 * Walks up from current directory
 */
export async function findWorkbookRoot(): Promise<string | null> {
  let dir = process.cwd();

  while (dir !== path.dirname(dir)) {
    const pkgPath = path.join(dir, "package.json");

    if (fs.existsSync(pkgPath)) {
      try {
        const content = fs.readFileSync(pkgPath, "utf-8");
        const pkg = JSON.parse(content);

        // Check if this is a workbook (has hands config or is private with blocks dir)
        if (pkg.hands || (pkg.private && fs.existsSync(path.join(dir, "blocks")))) {
          return dir;
        }
      } catch {
        // Invalid JSON, continue up
      }
    }

    dir = path.dirname(dir);
  }

  // Fallback: if current dir has blocks/, treat it as workbook
  if (fs.existsSync(path.join(process.cwd(), "blocks"))) {
    return process.cwd();
  }

  return null;
}

/**
 * Read workbook's package.json
 */
export function readWorkbookPackage(workbookPath: string): Record<string, unknown> | null {
  const pkgPath = path.join(workbookPath, "package.json");
  try {
    const content = fs.readFileSync(pkgPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Read workbook's components.json
 */
export function readComponentsConfig(workbookPath: string): Record<string, unknown> | null {
  const configPath = path.join(workbookPath, "components.json");
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
