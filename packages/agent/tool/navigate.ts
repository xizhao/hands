import { tool } from "@opencode-ai/plugin";

/**
 * Navigate tool - guide users to pages in the desktop app
 *
 * When the agent completes work, it can use this tool to show the user
 * the result by navigating them to a specific page.
 *
 * Returns structured JSON that the UI renders as a clickable navigation card.
 */

interface NavigateOutput {
  type: "navigate";
  page: string;
  title?: string;
  description?: string;
  anchor?: string;
}

const navigate = tool({
  description: `Navigate the user to a page in the workbook.

Use this tool after completing work to show the user the result. For example:
- After building a dashboard page, navigate to that page
- After creating a report, show the user where to find it

**Parameters:**
- \`page\`: The page route (e.g., "/dashboard", "/reports/sales")
- \`title\`: Optional - display title for the navigation card (e.g., "Sales Dashboard")
- \`description\`: Optional - brief description of what they'll see
- \`anchor\`: Optional - section to scroll to (e.g., "#revenue")

**Examples:**
- Show dashboard: navigate page="/dashboard" title="Dashboard"
- Show report: navigate page="/reports/monthly" title="Monthly Report" description="Your sales summary"`,

  args: {
    page: tool.schema
      .string()
      .describe("Page route starting with '/' (e.g., '/dashboard')"),
    title: tool.schema
      .string()
      .optional()
      .describe("Display title for the navigation card"),
    description: tool.schema
      .string()
      .optional()
      .describe("Brief description of what the user will see"),
    anchor: tool.schema
      .string()
      .optional()
      .describe("Section to scroll to (e.g., '#metrics')"),
  },

  async execute(args, ctx) {
    const { page, title, description, anchor } = args;

    // Validate page format
    if (!page.startsWith("/")) {
      return `Error: Page routes must start with "/" (e.g., "/dashboard"). Got: "${page}"`;
    }

    // Build the navigation output
    const output: NavigateOutput = {
      type: "navigate",
      page,
      title: title || page.replace(/^\//, "").replace(/\//g, " > ") || "Home",
      description,
      anchor,
    };

    return JSON.stringify(output);
  },
});

export default navigate;
