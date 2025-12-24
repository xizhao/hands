# Cloud Services

The `@hands/core/services` module provides access to external cloud services via OAuth connections. Actions can use `ctx.services` to send emails, post to Slack, query GitHub, and more.

## Available Services

### Email (Gmail)

Send emails via the connected Google account:

```typescript
await ctx.services.email.send({
  to: "user@example.com",
  subject: "Order Confirmation",
  body: "Your order #1234 has been confirmed.",
  html: false,  // optional: send as HTML
  cc: ["cc@example.com"],   // optional
  bcc: ["bcc@example.com"], // optional
});
```

### Slack

Post messages to Slack channels:

```typescript
// Send a simple message
await ctx.services.slack.send({
  channel: "#alerts",
  text: "Sync completed successfully!",
});

// Send with Block Kit
await ctx.services.slack.send({
  channel: "#alerts",
  text: "Fallback text",
  blocks: [
    {
      type: "section",
      text: { type: "mrkdwn", text: "*New order received*" }
    }
  ],
});

// Reply in thread
await ctx.services.slack.send({
  channel: "#alerts",
  text: "Thread reply",
  thread_ts: "1234567890.123456",
});

// List available channels
const channels = await ctx.services.slack.channels();
// Returns: [{ id: "C123", name: "general", is_private: false }]
```

### GitHub

Interact with GitHub repositories:

```typescript
// List issues
const issues = await ctx.services.github.issues({
  owner: "myorg",
  repo: "myrepo",
  state: "open",    // "open" | "closed" | "all"
  per_page: 100,
});

// Create an issue
const issue = await ctx.services.github.createIssue({
  owner: "myorg",
  repo: "myrepo",
  title: "Bug: Something is broken",
  body: "Details here...",
  labels: ["bug"],
  assignees: ["username"],
});

// List user's repos
const repos = await ctx.services.github.repos({
  per_page: 50,
  sort: "updated",  // "created" | "updated" | "pushed" | "full_name"
});

// Raw GitHub API call
const data = await ctx.services.github.fetch({
  path: "/repos/owner/repo/pulls",
  method: "GET",
});
```

### Salesforce

Query Salesforce objects via SOQL:

```typescript
const result = await ctx.services.salesforce.query({
  soql: "SELECT Id, Name, Email FROM Contact WHERE LastModifiedDate > LAST_N_DAYS:7",
  instanceUrl: "https://yourinstance.salesforce.com",
});

console.log(result.records); // Array of Contact objects
console.log(result.totalSize); // Total matching records
```

### Generic Authenticated Fetch

Make authenticated requests to any connected provider:

```typescript
const result = await ctx.services.fetch({
  provider: "github",  // "google" | "slack" | "github" | "salesforce" | "quickbooks" | "shopify"
  url: "https://api.github.com/user",
  method: "GET",
  headers: { "X-Custom-Header": "value" },
  body: { data: "for POST/PUT" },
});

if (result.ok) {
  console.log(result.data);
} else {
  console.error(`Error: ${result.status}`);
}
```

### Check Service Status

Check which services are connected:

```typescript
const status = await ctx.services.status();

if (status.slack?.valid) {
  console.log(`Slack connected as ${status.slack.email}`);
}

if (!status.github) {
  console.log("GitHub not connected");
}
```

## Import for Direct Use

You can also import the services client directly (outside of actions):

```typescript
import { createServices } from "@hands/core/services";

const services = createServices({
  cloudUrl: "https://api.hands.app",
  authToken: "user-jwt-token",
});

await services.email.send({ ... });
```

## Error Handling

Service calls throw `ServiceError` when they fail:

```typescript
import { ServiceError } from "@hands/core/services";

try {
  await ctx.services.slack.send({ channel: "#alerts", text: "Hello" });
} catch (err) {
  if (err instanceof ServiceError) {
    console.error(`${err.provider} error: ${err.message}`);
    if (err.statusCode === 404) {
      console.log("Service not connected - connect it in Settings > Integrations");
    }
  }
}
```

## Connecting Services

Users connect services via the Settings > Integrations page in the desktop app. Each service uses OAuth to securely authorize access without storing passwords.

Supported providers:
- **Google** - Gmail, Calendar, Drive
- **Slack** - Messaging, channels
- **GitHub** - Repos, issues, PRs
- **Salesforce** - CRM data via SOQL
- **QuickBooks** - Accounting data
- **Shopify** - E-commerce data
