import pc from "picocolors";
import { findWorkbookRoot } from "../utils.js";

export const blockCommand = {
  async add(name: string) {
    const workbookPath = await findWorkbookRoot();

    if (!workbookPath) {
      console.error(pc.red("Error: Not in a workbook directory"));
      process.exit(1);
    }

    console.log(pc.blue(`Adding block template: ${name}...`));

    // TODO: Implement block template adding
    // - Fetch from hands block registry
    // - Copy to blocks/
    // - Install any required deps

    console.log(pc.yellow("⚠ Block templates not yet implemented"));
  },

  async list() {
    console.log(pc.blue("Available block templates:"));

    // TODO: Fetch from hands block registry
    const templates = [
      { name: "chart", description: "Basic chart block with recharts" },
      { name: "table", description: "Data table with sorting/filtering" },
      { name: "form", description: "Form block with validation" },
      { name: "kanban", description: "Kanban board block" },
      { name: "calendar", description: "Calendar view block" },
    ];

    for (const t of templates) {
      console.log(`  ${pc.green(t.name)} - ${pc.dim(t.description)}`);
    }

    console.log(pc.dim("\nUse 'hands block add <name>' to add a template"));
  },
};
