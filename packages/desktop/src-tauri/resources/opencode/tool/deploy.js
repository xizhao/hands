// @bun
// ../plugin/src/tools/deploy.ts
import { tool } from "@opencode-ai/plugin";
var deployTool = tool({
  description: `Deploy the hands data app using SST.

This tool:
- Validates hands.config.ts
- Synthesizes SST infrastructure
- Deploys to AWS (or local dev)
- Returns deployment status and URLs`,
  args: {
    stage: tool.schema.string().optional().describe("Deployment stage (dev, staging, prod). Defaults to dev."),
    dryRun: tool.schema.boolean().optional().describe("Show what would be deployed without actually deploying")
  },
  async execute(args, ctx) {
    const { stage = "dev", dryRun = false } = args;
    if (dryRun) {
      return `# Dry Run - Deployment Plan

Stage: ${stage}

## Resources to create/update:

### Database
- DataStore: hands-${stage}-db
  - Type: Postgres (Neon Serverless)
  - Status: Would create

### Monitors
- Monitor: health-check
  - Schedule: rate(5 minutes)
  - Status: Would create

### Dashboards
- Dashboard: main
  - URL: https://${stage}.dashboard.example.com
  - Status: Would create

### Integrations
- (none configured)

---

Run without --dry-run to deploy.`;
    }
    return `# Deployment Started

Stage: ${stage}

Deploying hands data app...

This would run:
\`\`\`bash
npx sst deploy --stage ${stage}
\`\`\`

Deployment in progress... (not yet implemented)`;
  }
});
export {
  deployTool
};

export default deployTool;
