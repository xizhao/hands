import type { Database, SqlJsStatic } from "sql.js";

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;

/**
 * Sample data SQL for demo purposes
 */
const SAMPLE_DATA = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email) VALUES
  ('Alice Johnson', 'alice@example.com'),
  ('Bob Smith', 'bob@example.com'),
  ('Carol Williams', 'carol@example.com'),
  ('David Brown', 'david@example.com'),
  ('Eve Davis', 'eve@example.com');

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  category TEXT NOT NULL,
  in_stock INTEGER DEFAULT 1
);

INSERT INTO products (name, price, category, in_stock) VALUES
  ('Laptop Pro', 1299.99, 'Electronics', 1),
  ('Wireless Mouse', 49.99, 'Electronics', 1),
  ('Standing Desk', 599.00, 'Furniture', 1),
  ('Monitor 27"', 399.99, 'Electronics', 1),
  ('Ergonomic Chair', 449.00, 'Furniture', 0),
  ('Mechanical Keyboard', 129.99, 'Electronics', 1),
  ('Desk Lamp', 79.99, 'Furniture', 1),
  ('USB Hub', 39.99, 'Electronics', 1);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER DEFAULT 1,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

INSERT INTO orders (user_id, product_id, quantity, amount, status) VALUES
  (1, 1, 1, 1299.99, 'completed'),
  (1, 2, 2, 99.98, 'completed'),
  (2, 3, 1, 599.00, 'shipped'),
  (3, 4, 1, 399.99, 'pending'),
  (3, 6, 1, 129.99, 'pending'),
  (4, 5, 1, 449.00, 'cancelled'),
  (5, 7, 2, 159.98, 'completed'),
  (2, 8, 3, 119.97, 'shipped'),
  (1, 4, 1, 399.99, 'completed'),
  (4, 1, 1, 1299.99, 'pending');

-- Tasks table for action demos
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  assigned_to INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id)
);

INSERT INTO tasks (title, status, priority, assigned_to) VALUES
  ('Review Q4 reports', 'in_progress', 'high', 1),
  ('Update documentation', 'todo', 'medium', 2),
  ('Fix login bug', 'done', 'high', 3),
  ('Design new landing page', 'in_progress', 'medium', 1),
  ('Setup CI/CD pipeline', 'todo', 'low', 4),
  ('Customer feedback analysis', 'done', 'high', 5);
`;

/**
 * Initialize sql.js and create the demo database.
 * Returns a promise that resolves to the Database instance.
 * Subsequent calls return the same database.
 */
export async function initDatabase(): Promise<Database> {
  if (db) return db;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Load sql.js from local files (avoids COEP issues with CDN)
    const sqlPromise = new Promise<SqlJsStatic>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/sql-wasm/sql-wasm.js";
      script.onload = async () => {
        try {
          // @ts-expect-error - initSqlJs is added to window by the script
          const SQL = await window.initSqlJs({
            locateFile: () => `/sql-wasm/sql-wasm.wasm`,
          });
          resolve(SQL);
        } catch (e) {
          reject(e);
        }
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });

    const SQL = await sqlPromise;

    // Create in-memory database
    db = new SQL.Database();

    // Execute sample data setup
    db.run(SAMPLE_DATA);

    return db;
  })();

  return initPromise;
}

/**
 * Get the current database instance.
 * Throws if database is not initialized.
 */
export function getDatabase(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

/**
 * Execute a read query and return results as array of objects.
 */
export function executeQuery<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): T[] {
  const database = getDatabase();

  // Convert named params to positional if needed
  let processedSql = sql;
  const positionalParams: unknown[] = [];

  if (params) {
    // Replace :name or $name style params with ?
    processedSql = sql.replace(/[:$](\w+)/g, (match, name) => {
      if (name in params) {
        positionalParams.push(params[name]);
        return "?";
      }
      return match;
    });
  }

  try {
    const stmt = database.prepare(processedSql);
    if (positionalParams.length > 0) {
      stmt.bind(positionalParams as (string | number | null | Uint8Array)[]);
    }

    const results: T[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row as T);
    }
    stmt.free();

    return results;
  } catch (error) {
    console.error("[sql.js] Query error:", error);
    throw error;
  }
}

/**
 * Execute a mutation (INSERT, UPDATE, DELETE).
 */
export function executeMutation(
  sql: string,
  params?: Record<string, unknown>
): void {
  const database = getDatabase();

  let processedSql = sql;
  const positionalParams: unknown[] = [];

  if (params) {
    processedSql = sql.replace(/[:$](\w+)/g, (match, name) => {
      if (name in params) {
        positionalParams.push(params[name]);
        return "?";
      }
      return match;
    });
  }

  try {
    if (positionalParams.length > 0) {
      database.run(processedSql, positionalParams as (string | number | null | Uint8Array)[]);
    } else {
      database.run(processedSql);
    }
  } catch (error) {
    console.error("[sql.js] Mutation error:", error);
    throw error;
  }
}
