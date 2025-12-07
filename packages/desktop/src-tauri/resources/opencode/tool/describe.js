// @bun
// ../plugin/src/tools/describe.ts
import { tool } from "@opencode-ai/plugin";
var describeTool = tool({
  description: `Generate a human-readable description of the hands data app.

This is specifically for non-technical users to understand:
- What the app does
- What data it collects
- What dashboards/reports are available
- How often things update

The output uses plain language without technical jargon.`,
  args: {
    audience: tool.schema.enum(["executive", "user", "developer"]).optional().describe("Target audience for the description. Defaults to user."),
    format: tool.schema.enum(["text", "markdown", "html"]).optional().describe("Output format. Defaults to markdown.")
  },
  async execute(args, ctx) {
    const { audience = "user" } = args;
    if (audience === "executive") {
      return `# Data App Overview

## What This App Does
This application automatically monitors and tracks key business metrics, providing real-time visibility into operations.

## Key Capabilities
- **Automated Monitoring**: Health checks run every 5 minutes to ensure systems are operational
- **Analytics Dashboard**: Visual reports accessible via web browser
- **Data Collection**: Securely ingests data from connected systems

## Business Value
- Reduces manual monitoring effort
- Provides early warning for issues
- Enables data-driven decision making

## Access
Dashboard available at: https://dashboard.example.com`;
    }
    if (audience === "developer") {
      return `# Technical Overview

## Architecture
- **Runtime**: AWS Lambda (Node.js)
- **Database**: Embedded Postgres (Neon)
- **Scheduling**: EventBridge
- **API**: API Gateway + Lambda

## Components
- 1 Monitor (health-check, rate 5min)
- 1 Dashboard (main)
- 0 Integrations

## Configuration
See \`hands.config.ts\` for full configuration.

## Deployment
\`\`\`bash
hands deploy --stage dev
\`\`\``;
    }
    return `# Your Data App

## What It Does
This app keeps track of your data and shows you helpful reports.

## Automatic Checks
The app runs automatic checks every 5 minutes to make sure everything is working correctly. If something goes wrong, you'll know right away.

## Viewing Your Data
You can see your data by visiting the dashboard in your web browser. The dashboard shows:
- Charts and graphs of your data over time
- Key numbers and statistics
- Recent activity

## How It Stays Updated
Data is automatically collected and updated. You don't need to do anything - just check the dashboard when you want to see what's happening.

## Need Help?
Ask your administrator or the person who set up this app for help.`;
  }
});
export {
  describeTool
};

export default describeTool;
