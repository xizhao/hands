import pc from "picocolors";
import { findWorkbookRoot, readComponentsConfig } from "../utils.js";

interface AddOptions {
  registry?: string;
}

export async function addCommand(components: string[], options: AddOptions) {
  const workbookPath = await findWorkbookRoot();

  if (!workbookPath) {
    console.error(pc.red("Error: Not in a workbook directory"));
    process.exit(1);
  }

  const config = readComponentsConfig(workbookPath);
  const registryUrl = options.registry || "https://ui.shadcn.com";

  console.log(pc.blue(`Adding components from ${pc.dim(registryUrl)}...`));

  for (const component of components) {
    console.log(pc.dim(`  Adding ${component}...`));

    // TODO: Fetch component from registry
    // TODO: Write to blocks/ui/
    // TODO: Update package.json with deps

    console.log(pc.yellow(`  ⚠ Component fetching not yet implemented: ${component}`));
  }

  console.log(pc.dim("\nRun 'bun install' to install new dependencies"));
}
