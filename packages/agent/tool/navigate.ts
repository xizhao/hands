import { tool } from "@opencode-ai/plugin";

/**
 * Navigate tool - guide users to pages in the desktop app
 *
 * When the agent completes work, it can use this tool to show the user
 * the result by navigating them to a specific page.
 *
 * Returns structured JSON that the UI renders as a clickable navigation card.
 */

type RouteType = "block" | "table" | "action";

export interface NavigateOutput {
  type: "navigate";
  routeType: RouteType;
  id: string;
  title?: string;
  description?: string;
  autoNavigate?: boolean;
  refresh?: boolean;
}

const ROUTE_PREFIXES: Record<RouteType, string> = {
  block: "/blocks",
  table: "/tables",
  action: "/actions",
};

const navigate = tool({
  description: `Navigate the user to a page in the workbook.

Use this tool after completing work to show the user the result. For example:
- After building a dashboard block, navigate to that block
- After importing data to a table, navigate to that table to show progress
- After creating an action, navigate to show it

**Parameters:**
- \`routeType\`: The type of page - "block", "table", or "action"
- \`id\`: The ID of the item (block name, table name, or action name)
- \`title\`: Optional - display title for the navigation card
- \`description\`: Optional - brief description of what they'll see
- \`autoNavigate\`: Optional - if true, automatically navigate the user (default: true for foreground, false for background)
- \`refresh\`: Optional - if true, refreshes the data on that page (useful after inserting data)

**Examples:**
- Show a block: navigate routeType="block" id="dashboard" title="Dashboard"
- Show table with data: navigate routeType="table" id="orders" title="Orders" description="500 rows imported" refresh=true
- Show action: navigate routeType="action" id="sync-data" title="Sync Action"`,

  args: {
    routeType: tool.schema
      .enum(["block", "table", "action"])
      .describe('Type of page: "block", "table", or "action"'),
    id: tool.schema.string().describe("ID of the item (e.g., 'dashboard', 'orders', 'sync-data')"),
    title: tool.schema.string().optional().describe("Display title for the navigation card"),
    description: tool.schema
      .string()
      .optional()
      .describe("Brief description of what the user will see"),
    autoNavigate: tool.schema
      .boolean()
      .optional()
      .describe("Auto-navigate the user (default: true for foreground threads)"),
    refresh: tool.schema
      .boolean()
      .optional()
      .describe("Refresh the data on the page (use after inserting/updating data)"),
  },

  async execute(args, ctx) {
    const { routeType, id, title, description, autoNavigate, refresh } = args;

    // Validate routeType
    if (!["block", "table", "action"].includes(routeType)) {
      return `Error: routeType must be "block", "table", or "action". Got: "${routeType}"`;
    }

    // Check if this is a background session (subagent/background)
    // For now, default autoNavigate to true - the UI can decide based on focus
    const shouldAutoNavigate = autoNavigate ?? true;

    // Build the navigation output
    const output: NavigateOutput = {
      type: "navigate",
      routeType: routeType as RouteType,
      id,
      title: title || id,
      description,
      autoNavigate: shouldAutoNavigate,
      refresh: refresh ?? false,
    };

    return JSON.stringify(output);
  },
});

export default navigate;
