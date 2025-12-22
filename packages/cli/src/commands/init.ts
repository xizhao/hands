import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";

export async function initCommand(name?: string) {
  const workbookName = name || path.basename(process.cwd());
  const workbookPath = name ? path.join(process.cwd(), name) : process.cwd();

  console.log(pc.blue(`Initializing workbook: ${pc.bold(workbookName)}`));

  // Create directory if name provided
  if (name && !fs.existsSync(workbookPath)) {
    fs.mkdirSync(workbookPath, { recursive: true });
  }

  // Create package.json
  const pkgPath = path.join(workbookPath, "package.json");
  if (!fs.existsSync(pkgPath)) {
    const pkg = {
      name: workbookName,
      private: true,
      dependencies: {},
      hands: {},
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log(pc.green("  Created package.json"));
  }

  // Create directories - new structure
  const dirs = [
    "pages", // MDX pages
    "pages/blocks", // Embeddable MDX fragments
    "plugins", // Custom TSX components
    "lib", // Shared utilities
    ".hands", // Generated files
  ];
  for (const dir of dirs) {
    const dirPath = path.join(workbookPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(pc.dim(`  Created ${dir}/`));
    }
  }

  // Create sample index.mdx
  const indexMdxPath = path.join(workbookPath, "pages/index.mdx");
  if (!fs.existsSync(indexMdxPath)) {
    const indexMdx = `---
title: Welcome
---

# Welcome to ${workbookName}

This is your first page. Edit \`pages/index.mdx\` to get started.

## Quick Start

- Add more pages in \`pages/\`
- Create embeddable blocks in \`pages/blocks/\`
- Build custom components in \`plugins/\`
`;
    fs.writeFileSync(indexMdxPath, indexMdx);
    console.log(pc.green("  Created pages/index.mdx"));
  }

  // Create .gitignore
  const gitignorePath = path.join(workbookPath, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    const gitignore = `node_modules/
.hands/
`;
    fs.writeFileSync(gitignorePath, gitignore);
    console.log(pc.dim("  Created .gitignore"));
  }

  console.log(pc.green(`\nWorkbook initialized! Next steps:`));
  console.log(pc.dim(`  cd ${name || "."}`));
  console.log(pc.dim("  hands dev"));
}
