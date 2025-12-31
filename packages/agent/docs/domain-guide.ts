/**
 * Domain Architecture Guide
 *
 * The database is authoritative. Tables become domains. Pages are derived views.
 * Agents are stewards of the domain model.
 */

export const DOMAIN_ARCHITECTURE = `
## Domain Model

Hands uses a **database-authoritative** architecture:

\`\`\`
DB tables → domains + relations → views (MDX pages)
\`\`\`

- **Tables** are the source of truth (SQLite)
- **Domains** are tables with their relationships (auto-discovered)
- **Pages** are documentation views derived from the schema

### Your Responsibility as an Agent

You are a **steward** of the domain model. This means:

1. **Check existing schema first** - What domains already exist?
2. **Think about relationships** - How does new data connect to existing data?
3. **Model before importing** - Design the domain structure before creating tables
4. **Maintain integrity** - Use foreign keys, proper naming, clean structure

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Table names | snake_case, plural | \`orders\`, \`line_items\` |
| Primary keys | \`id\` (integer) | \`id INTEGER PRIMARY KEY\` |
| Foreign keys | \`{table_singular}_id\` | \`customer_id\`, \`order_id\` |
| Junction tables | \`{table1}_{table2}\` | \`order_products\` |

### When Adding Data

Ask yourself:

1. **Does this fit an existing domain?**
   → Add to or extend existing table

2. **Is this a new domain?**
   → Design schema, consider relationships to existing tables

3. **Is this a relationship between domains?**
   → Create proper foreign keys, or junction table for many-to-many

### Domain Relationships

**One-to-Many** - Foreign key on the "many" side:
\`\`\`sql
-- One customer has many orders
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  ...
);
\`\`\`

**Many-to-Many** - Junction table:
\`\`\`sql
-- Orders can have many products, products can be in many orders
CREATE TABLE order_products (
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER,
  PRIMARY KEY (order_id, product_id)
);
\`\`\`

### Pages as Derived Views

Each domain can have a page that documents it. Pages are **derived** from the schema:
- Auto-generated when the domain is first accessed
- Updated when schema changes (via SpecBar "Push")
- Contain schema documentation, relationships, sample queries

**You don't manually manage pages** - they flow from the domain model.
`;

export const IMPORT_WORKFLOW = `
## Import Workflow

When importing data, follow this workflow:

### 1. Analyze the Data Structure
- What entities/objects does this data represent?
- What are the natural primary keys?
- Are there relationships between entities?

### 2. Check Existing Schema
Use the \`schema\` tool to see what tables already exist:
- Does this data fit an existing domain?
- Can we extend an existing table?
- Would new tables relate to existing ones?

### 3. Design the Domain Model
Before creating any tables:
- Propose the table structure (columns, types)
- Identify foreign key relationships
- Use proper naming conventions
- Consider normalization (avoid duplicate data)

### 4. Confirm with User
Present the proposed schema:
- "I'll create a \`customers\` table with these columns..."
- "This will link to your existing \`orders\` table via \`customer_id\`..."
- Wait for confirmation before proceeding

### 5. Create Tables, Then Import
1. Create tables with proper schema
2. Import data into the tables
3. Verify data integrity

### Example

**User drops:** \`sales_data.csv\` with columns: date, customer_name, customer_email, product, quantity, price

**Good approach:**
1. Recognize this is denormalized - customer info repeats
2. Propose: \`customers\` table + \`products\` table + \`sales\` table
3. \`sales\` references both via foreign keys
4. Import into normalized structure

**Bad approach:**
1. Create single \`sales_data\` table with all columns
2. Duplicate customer/product info in every row
`;
