import fs from "fs";
import path from "path";
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

  // Create components.json (shadcn config)
  const componentsPath = path.join(workbookPath, "components.json");
  if (!fs.existsSync(componentsPath)) {
    const components = {
      $schema: "https://ui.shadcn.com/schema.json",
      style: "new-york",
      rsc: true,
      tsx: true,
      tailwind: {
        config: "",
        baseColor: "neutral",
        cssVariables: true,
      },
      iconLibrary: "lucide",
      aliases: {
        components: "ui",
        ui: "ui",
        utils: "ui/lib/utils",
        lib: "ui/lib",
        hooks: "ui/hooks",
      },
    };
    fs.writeFileSync(componentsPath, JSON.stringify(components, null, 2));
    console.log(pc.green("  Created components.json"));
  }

  // Create directories
  const dirs = [
    "ui",           // shadcn components
    "ui/hooks",     // custom hooks
    "blocks",       // data blocks
    "pages",        // markdown pages
    ".hands",       // generated files
  ];
  for (const dir of dirs) {
    const dirPath = path.join(workbookPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(pc.dim(`  Created ${dir}/`));
    }
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
  console.log(pc.dim("  bun install"));
  console.log(pc.dim("  hands ui add button  # add UI components"));
  console.log(pc.dim("  hands dev"));
}
