/**
 * Data Guide for Hands Agents
 *
 * Documents tables, sources, and SQL - the data layer of Hands.
 */

export const DATA_GUIDE = `
## Data Layer

Data in Hands flows through three concepts: **Tables**, **Sources**, and **SQL**.

\`\`\`
[External APIs] → Sources → [Tables] → SQL queries → [Pages/Blocks]
                   sync        store      read
\`\`\`

### Tables (PostgreSQL)

Tables are the storage layer. All data lives in PostgreSQL.

**Viewing tables:**
- Use \`schema\` tool to see all tables and columns
- Navigate to /tables/{tableName} in the UI

**Querying tables:**
\`\`\`sql
SELECT * FROM customers WHERE active = true LIMIT 10;
SELECT COUNT(*), category FROM products GROUP BY category;
\`\`\`

**Common table patterns:**
- \`customers\`, \`orders\`, \`products\` - Business data
- \`{source}_*\` - Tables prefixed with source name (e.g., \`hackernews_stories\`)

### Sources (Data Connectors)

Sources are code-based connectors that sync external data into tables. They live in \`sources/\` directory.

**Adding a source:**
\`\`\`
sources action='add' name='hackernews'
sources action='add' name='stripe'
\`\`\`

**Source lifecycle:**
1. Add source → copies code to \`sources/{name}/\`
2. User configures secrets (API keys) if needed
3. Source syncs on schedule or manually
4. Data appears in prefixed tables (e.g., \`hackernews_stories\`)

**Available sources:**
- \`hackernews\` - Top stories, comments
- \`github\` - Repos, issues, PRs (requires token)
- \`stripe\` - Customers, payments (requires key)

**Sources vs @import:**
| Sources | @import |
|---------|---------|
| Code-based API sync | One-time file ingestion |
| Runs on schedule | Single import |
| Creates prefixed tables | User-named table |
| Lives in \`sources/\` | File → table |

### SQL Queries

SQL is how data flows from tables to the UI.

**In Blocks (server components):**
\`\`\`tsx
import { sql } from "@hands/db";

const users = await sql\`SELECT * FROM users WHERE active = \${true}\`;
\`\`\`

**In Pages (LiveQuery/LiveValue):**
\`\`\`mdx
<LiveValue query="SELECT COUNT(*) FROM orders" />

<LiveQuery query="SELECT name, total FROM top_customers LIMIT 5" />
\`\`\`

**Using the sql tool directly:**
\`\`\`
sql query="SELECT * FROM customers LIMIT 5"
sql query="SELECT COUNT(*) as total, status FROM orders GROUP BY status"
\`\`\`

### Schema Discovery

Use the \`schema\` tool to explore available data:

\`\`\`
schema                           # List all tables
schema table="customers"         # Show columns for a table
\`\`\`

### Data Flow Patterns

**1. API → Dashboard:**
\`\`\`
Add source → Tables created → Build blocks → Compose in page
\`\`\`

**2. File Import → Analysis:**
\`\`\`
@import file → Table created → Query with sql → Suggest visualizations
\`\`\`

**3. Live Data in Pages:**
\`\`\`
Table exists → Add <LiveValue> or <LiveQuery> → Auto-updates on data change
\`\`\`

### Creating Tables

Tables are created by:
1. **Sources** - Automatic, prefixed with source name
2. **@import** - From CSV/JSON/Excel files
3. **Migrations** - Manual SQL (advanced)

**Do NOT create tables directly** - use sources or @import to ensure proper setup.

### Query Best Practices

- Always use parameterized queries: \`\${value}\` not string concatenation
- Limit results: \`LIMIT 100\` for safety
- Use aggregations for summaries: \`COUNT\`, \`SUM\`, \`AVG\`
- Join sparingly - prefer denormalized source data
`;

export const DATA_TOOLS_REFERENCE = `
## Data Tools Reference

### sql
Execute a SQL query and return results.
\`\`\`
sql query="SELECT * FROM users LIMIT 10"
sql query="SELECT COUNT(*) FROM orders WHERE status = 'completed'"
\`\`\`

### schema
View database schema - tables and columns.
\`\`\`
schema                    # List all tables
schema table="users"      # Show columns for users table
\`\`\`

### sources
Manage data sources.
\`\`\`
sources action='list'              # List available sources
sources action='add' name='github' # Add a source
sources action='sync' name='github' # Trigger sync
\`\`\`

### secrets
Manage API keys and credentials.
\`\`\`
secrets action='list'              # List required secrets
secrets action='check' name='GITHUB_TOKEN'  # Check if set
\`\`\`
`;
