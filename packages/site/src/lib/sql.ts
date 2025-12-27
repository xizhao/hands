import type { Database, SqlJsStatic } from "sql.js";

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;

/**
 * Rich sample data for demo use cases:
 * 1. RevOps Dashboard - sales pipeline, revenue trends, rep performance
 * 2. Team Survey Forms - form capture and submission
 * 3. Operations Alerts - system health, alerts, incidents
 * 4. Customer Onboarding - checklists, progress tracking, automations
 */
const SAMPLE_DATA = `
-- ============================================================================
-- REVOPS / SALES DASHBOARD
-- ============================================================================

CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company TEXT NOT NULL,
  owner TEXT NOT NULL,
  stage TEXT NOT NULL,
  amount REAL NOT NULL,
  probability INTEGER NOT NULL,
  status TEXT DEFAULT 'open',
  close_date TEXT,
  sales_cycle_days INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO deals (company, owner, stage, amount, probability, status, close_date, sales_cycle_days) VALUES
  ('Acme Industries', 'Sarah Chen', 'Contract', 125000, 90, 'open', '2025-01-20', NULL),
  ('TechStart Inc', 'Mike Torres', 'Negotiation', 85000, 70, 'open', '2025-01-28', NULL),
  ('Global Retail Co', 'Sarah Chen', 'Proposal', 210000, 50, 'open', '2025-02-15', NULL),
  ('DataFlow Systems', 'James Wilson', 'Discovery', 65000, 30, 'open', '2025-03-01', NULL),
  ('CloudNine Ltd', 'Emily Rodriguez', 'Contract', 180000, 95, 'open', '2025-01-18', NULL),
  ('Meridian Health', 'Mike Torres', 'Proposal', 145000, 60, 'open', '2025-02-10', NULL),
  ('Apex Manufacturing', 'Sarah Chen', 'Negotiation', 320000, 75, 'open', '2025-02-05', NULL),
  ('Nordic Consulting', 'James Wilson', 'Discovery', 48000, 25, 'open', '2025-03-15', NULL),
  ('Summit Partners', 'Emily Rodriguez', 'Contract', 95000, 85, 'closed_won', '2025-01-10', 45),
  ('Velocity Labs', 'Mike Torres', 'Proposal', 72000, 40, 'closed_won', '2025-01-05', 38),
  ('Quantum Dynamics', 'Sarah Chen', 'Negotiation', 155000, 0, 'closed_lost', '2025-01-08', 62),
  ('Pioneer Tech', 'James Wilson', 'Contract', 88000, 90, 'closed_won', '2025-01-12', 51);

CREATE TABLE IF NOT EXISTS revenue_monthly (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  revenue REAL NOT NULL,
  target REAL NOT NULL,
  new_arr REAL,
  churn REAL
);

INSERT INTO revenue_monthly (month, revenue, target, new_arr, churn) VALUES
  ('2024-07', 185000, 180000, 45000, 12000),
  ('2024-08', 198000, 190000, 52000, 15000),
  ('2024-09', 212000, 200000, 48000, 11000),
  ('2024-10', 225000, 215000, 55000, 14000),
  ('2024-11', 238000, 230000, 62000, 18000),
  ('2024-12', 255000, 245000, 58000, 16000),
  ('2025-01', 272000, 260000, 65000, 13000);

CREATE TABLE IF NOT EXISTS sales_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  win_rate REAL NOT NULL,
  avg_deal_size REAL NOT NULL,
  meetings_booked INTEGER,
  demos_completed INTEGER
);

INSERT INTO sales_metrics (month, win_rate, avg_deal_size, meetings_booked, demos_completed) VALUES
  ('2024-10', 0.32, 78000, 45, 28),
  ('2024-11', 0.35, 82000, 52, 35),
  ('2024-12', 0.38, 85000, 48, 32),
  ('2025-01', 0.41, 92000, 55, 38);

CREATE TABLE IF NOT EXISTS rep_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rep_name TEXT NOT NULL,
  closed_revenue REAL NOT NULL,
  quota REAL NOT NULL,
  deals_won INTEGER,
  pipeline_value REAL
);

INSERT INTO rep_performance (rep_name, closed_revenue, quota, deals_won, pipeline_value) VALUES
  ('Sarah Chen', 285000, 250000, 8, 655000),
  ('Mike Torres', 168000, 200000, 5, 302000),
  ('Emily Rodriguez', 215000, 200000, 6, 275000),
  ('James Wilson', 142000, 200000, 4, 113000);

-- ============================================================================
-- TEAM SURVEY / FORMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS survey_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
  mood TEXT NOT NULL,
  workload INTEGER NOT NULL,
  blockers TEXT,
  wins TEXT,
  suggestions TEXT
);

INSERT INTO survey_responses (submitted_at, mood, workload, blockers, wins, suggestions) VALUES
  ('2025-01-13 09:15:00', 'good', 3, 'Waiting on design specs for the dashboard', 'Shipped the new auth flow!', 'More async standups would help'),
  ('2025-01-13 10:30:00', 'great', 2, NULL, 'Closed two major deals this week', NULL),
  ('2025-01-13 11:45:00', 'stressed', 5, 'Too many meetings, cant focus', 'Finally fixed that production bug', 'Need dedicated focus time blocks'),
  ('2025-01-13 14:00:00', 'okay', 4, 'Dependencies on other teams slowing us down', NULL, 'Better cross-team communication'),
  ('2025-01-13 15:20:00', 'good', 3, NULL, 'Great customer feedback on new feature', 'Keep the Friday demos going');

-- ============================================================================
-- OPERATIONS ALERTS & MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  severity TEXT NOT NULL,
  system TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  triggered_at TEXT NOT NULL,
  acknowledged_by TEXT,
  resolved_at TEXT
);

INSERT INTO alerts (severity, system, message, status, triggered_at, acknowledged_by, resolved_at) VALUES
  ('critical', 'payments-api', 'P95 latency exceeded 2000ms threshold', 'active', '2025-01-14 10:32:00', NULL, NULL),
  ('warning', 'user-service', 'Error rate above 1% for 5 minutes', 'active', '2025-01-14 10:28:00', 'oncall-bot', NULL),
  ('warning', 'database-primary', 'Connection pool at 85% capacity', 'active', '2025-01-14 10:15:00', NULL, NULL),
  ('critical', 'checkout-flow', 'Cart abandonment spike detected', 'resolved', '2025-01-14 08:45:00', 'Sarah Chen', '2025-01-14 09:30:00'),
  ('warning', 'cdn-edge', 'Cache hit ratio dropped below 90%', 'resolved', '2025-01-14 07:20:00', 'Mike Torres', '2025-01-14 08:15:00'),
  ('info', 'deployment', 'New version deployed: v2.4.1', 'resolved', '2025-01-14 06:00:00', 'deploy-bot', '2025-01-14 06:00:00');

CREATE TABLE IF NOT EXISTS system_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  system TEXT NOT NULL,
  uptime_pct REAL NOT NULL,
  error_rate REAL,
  latency_p50 INTEGER,
  latency_p95 INTEGER
);

INSERT INTO system_health (timestamp, system, uptime_pct, error_rate, latency_p50, latency_p95) VALUES
  ('2025-01-14 10:30:00', 'payments-api', 99.2, 0.8, 145, 2450),
  ('2025-01-14 10:25:00', 'payments-api', 99.5, 0.5, 120, 1850),
  ('2025-01-14 10:20:00', 'payments-api', 99.8, 0.2, 95, 450),
  ('2025-01-14 10:15:00', 'payments-api', 99.9, 0.1, 88, 320),
  ('2025-01-14 10:10:00', 'payments-api', 99.9, 0.1, 92, 350),
  ('2025-01-14 10:30:00', 'user-service', 98.8, 1.2, 65, 280),
  ('2025-01-14 10:30:00', 'checkout-flow', 99.7, 0.3, 110, 420);

CREATE TABLE IF NOT EXISTS api_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  system TEXT NOT NULL,
  latency_p95 INTEGER NOT NULL,
  requests_per_sec INTEGER,
  error_count INTEGER
);

INSERT INTO api_metrics (timestamp, system, latency_p95, requests_per_sec, error_count) VALUES
  ('2025-01-14 10:32:00', 'payments-api', 2450, 1250, 12),
  ('2025-01-14 10:31:00', 'payments-api', 2180, 1180, 8),
  ('2025-01-14 10:30:00', 'payments-api', 1850, 1320, 5),
  ('2025-01-14 10:29:00', 'payments-api', 1420, 1150, 3),
  ('2025-01-14 10:28:00', 'payments-api', 980, 1280, 2),
  ('2025-01-14 10:27:00', 'payments-api', 650, 1190, 1),
  ('2025-01-14 10:26:00', 'payments-api', 420, 1240, 1),
  ('2025-01-14 10:25:00', 'payments-api', 380, 1180, 0),
  ('2025-01-14 10:24:00', 'payments-api', 350, 1220, 0),
  ('2025-01-14 10:23:00', 'payments-api', 320, 1150, 0);

CREATE TABLE IF NOT EXISTS incident_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (alert_id) REFERENCES alerts(id)
);

INSERT INTO incident_notes (alert_id, note, created_by, created_at) VALUES
  (1, 'Investigating - appears to be related to recent deploy', 'Sarah Chen', '2025-01-14 10:35:00'),
  (1, 'Scaling up pods as precaution', 'oncall-bot', '2025-01-14 10:36:00');

-- ============================================================================
-- CUSTOMER ONBOARDING
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  csm_name TEXT NOT NULL,
  target_go_live TEXT NOT NULL,
  plan TEXT NOT NULL,
  arr REAL NOT NULL,
  signed_at TEXT
);

INSERT INTO customers (name, csm_name, target_go_live, plan, arr, signed_at) VALUES
  ('Acme Corp', 'Lisa Wang', '2025-02-01', 'Enterprise', 180000, '2025-01-02'),
  ('TechStart Inc', 'Alex Kim', '2025-02-15', 'Growth', 48000, '2025-01-08'),
  ('Global Retail', 'Lisa Wang', '2025-03-01', 'Enterprise', 240000, '2025-01-10');

CREATE TABLE IF NOT EXISTS onboarding_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  completed INTEGER NOT NULL,
  total INTEGER NOT NULL,
  days_elapsed INTEGER NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

INSERT INTO onboarding_progress (customer_id, completed, total, days_elapsed) VALUES
  (1, 8, 12, 12),
  (2, 3, 10, 6),
  (3, 2, 12, 4);

CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  phase TEXT NOT NULL,
  task TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  due_date TEXT,
  completed_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

INSERT INTO onboarding_tasks (customer_id, phase, task, owner, status, due_date, completed_at) VALUES
  -- Acme Corp onboarding
  (1, 'Setup', 'Create account and provision workspace', 'Lisa Wang', 'done', '2025-01-03', '2025-01-03 10:00:00'),
  (1, 'Setup', 'Configure SSO integration', 'IT Team', 'done', '2025-01-05', '2025-01-04 15:30:00'),
  (1, 'Setup', 'Import historical data', 'Data Team', 'done', '2025-01-08', '2025-01-07 14:00:00'),
  (1, 'Integration', 'Connect Salesforce', 'Mike Chen', 'done', '2025-01-10', '2025-01-09 11:00:00'),
  (1, 'Integration', 'Set up Slack notifications', 'Lisa Wang', 'done', '2025-01-10', '2025-01-10 09:00:00'),
  (1, 'Integration', 'Configure webhook endpoints', 'Dev Team', 'done', '2025-01-12', '2025-01-11 16:00:00'),
  (1, 'Training', 'Admin training session', 'Lisa Wang', 'done', '2025-01-15', '2025-01-14 14:00:00'),
  (1, 'Training', 'End-user training (Group 1)', 'Lisa Wang', 'done', '2025-01-18', '2025-01-17 10:00:00'),
  (1, 'Training', 'End-user training (Group 2)', 'Lisa Wang', 'in_progress', '2025-01-22', NULL),
  (1, 'Training', 'Create custom documentation', 'Content Team', 'pending', '2025-01-25', NULL),
  (1, 'Go-Live', 'Production readiness review', 'Lisa Wang', 'pending', '2025-01-28', NULL),
  (1, 'Go-Live', 'Go-live support (Day 1)', 'Support Team', 'pending', '2025-02-01', NULL),
  -- TechStart onboarding
  (2, 'Setup', 'Create account and provision workspace', 'Alex Kim', 'done', '2025-01-09', '2025-01-09 09:00:00'),
  (2, 'Setup', 'Configure basic settings', 'Alex Kim', 'done', '2025-01-10', '2025-01-10 11:00:00'),
  (2, 'Setup', 'Import sample data', 'Alex Kim', 'done', '2025-01-11', '2025-01-11 14:00:00'),
  (2, 'Integration', 'Connect primary data source', 'Dev Team', 'in_progress', '2025-01-15', NULL),
  (2, 'Training', 'Team training session', 'Alex Kim', 'pending', '2025-02-01', NULL);

CREATE TABLE IF NOT EXISTS customer_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

INSERT INTO customer_notes (customer_id, note, created_by, created_at) VALUES
  (1, 'Kickoff call went great - team is excited to get started', 'Lisa Wang', '2025-01-03 11:00:00'),
  (1, 'SSO integration completed ahead of schedule', 'Lisa Wang', '2025-01-04 16:00:00'),
  (1, 'Customer requested additional training for finance team', 'Lisa Wang', '2025-01-14 15:00:00'),
  (2, 'Small team, moving fast - may go live early', 'Alex Kim', '2025-01-10 10:00:00');
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
          const SQL = await (window as any).initSqlJs({
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
