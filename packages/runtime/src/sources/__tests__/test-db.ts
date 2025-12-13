/**
 * Shared Test Database Setup
 *
 * Creates a real PGlite instance with realistic schema and data
 * for integration testing sources, tRPC, and discovery.
 */

import { PGlite } from "@electric-sql/pglite";

/**
 * Sample schema representing a realistic SaaS app
 */
export const SCHEMA = `
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  active BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Organizations (multi-tenant)
CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  plan VARCHAR(50) DEFAULT 'free',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Organization members (join table)
CREATE TABLE org_members (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

-- Projects
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tasks
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id INTEGER REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'todo',
  priority INTEGER DEFAULT 0,
  due_date DATE,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Comments
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_org_members_org ON org_members(org_id);
CREATE INDEX idx_org_members_user ON org_members(user_id);
CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_comments_task ON comments(task_id);
`;

/**
 * Sample data for testing
 */
export const SEED_DATA = `
-- Users
INSERT INTO users (email, name, role, metadata) VALUES
  ('alice@example.com', 'Alice Johnson', 'admin', '{"theme": "dark"}'),
  ('bob@example.com', 'Bob Smith', 'user', '{"theme": "light"}'),
  ('charlie@example.com', 'Charlie Brown', 'user', NULL),
  ('diana@example.com', 'Diana Prince', 'user', '{"notifications": true}'),
  ('eve@example.com', 'Eve Wilson', 'admin', NULL);

-- Organizations
INSERT INTO organizations (name, slug, plan, settings) VALUES
  ('Acme Corp', 'acme', 'pro', '{"features": ["api", "sso"]}'),
  ('Startup Inc', 'startup', 'free', '{}'),
  ('Enterprise Co', 'enterprise', 'enterprise', '{"sla": true}');

-- Org Members
INSERT INTO org_members (org_id, user_id, role) VALUES
  (1, 1, 'owner'),
  (1, 2, 'member'),
  (1, 3, 'member'),
  (2, 4, 'owner'),
  (3, 5, 'owner'),
  (3, 1, 'member');

-- Projects
INSERT INTO projects (org_id, name, description, status) VALUES
  (1, 'Website Redesign', 'Complete overhaul of company website', 'active'),
  (1, 'Mobile App', 'iOS and Android app development', 'active'),
  (1, 'API v2', 'Next generation API', 'planning'),
  (2, 'MVP Launch', 'Initial product launch', 'active'),
  (3, 'Migration', 'Cloud migration project', 'completed');

-- Tasks
INSERT INTO tasks (project_id, assignee_id, title, description, status, priority, due_date) VALUES
  (1, 1, 'Design mockups', 'Create initial design mockups in Figma', 'done', 1, '2024-01-15'),
  (1, 2, 'Implement header', 'Build responsive header component', 'in_progress', 2, '2024-01-20'),
  (1, 2, 'Implement footer', 'Build footer with newsletter signup', 'todo', 3, '2024-01-25'),
  (1, NULL, 'SEO audit', 'Review and improve SEO', 'todo', 4, NULL),
  (2, 3, 'Setup React Native', 'Initialize RN project', 'done', 1, '2024-01-10'),
  (2, 3, 'Auth flow', 'Implement authentication', 'in_progress', 2, '2024-01-30'),
  (3, 1, 'API design', 'Design OpenAPI spec', 'todo', 1, '2024-02-01'),
  (4, 4, 'Landing page', 'Build landing page', 'done', 1, '2024-01-05'),
  (4, 4, 'Payment integration', 'Stripe integration', 'in_progress', 2, '2024-01-20'),
  (5, 5, 'Data migration', 'Migrate legacy data', 'done', 1, '2023-12-15');

-- Comments
INSERT INTO comments (task_id, user_id, body) VALUES
  (1, 1, 'First draft uploaded to Figma'),
  (1, 2, 'Looks great! A few minor tweaks needed'),
  (1, 1, 'Updated based on feedback'),
  (2, 2, 'Started working on this'),
  (2, 1, 'Remember to handle mobile breakpoints'),
  (6, 3, 'Using Firebase Auth for now'),
  (9, 4, 'Testing webhook integration');
`;

/**
 * Create a fresh test database with schema and seed data
 */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(SEED_DATA);
  return db;
}

/**
 * Create an empty test database (schema only, no data)
 */
export async function createEmptyTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SCHEMA);
  return db;
}

/**
 * Create a minimal test database for unit tests
 */
export async function createMinimalTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE test_table (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      value INTEGER
    );
    INSERT INTO test_table (name, value) VALUES ('one', 1), ('two', 2), ('three', 3);
  `);
  return db;
}

/**
 * Expected table names in the test database
 */
export const EXPECTED_TABLES = [
  "users",
  "organizations",
  "org_members",
  "projects",
  "tasks",
  "comments",
];

/**
 * Expected row counts after seeding
 */
export const EXPECTED_COUNTS = {
  users: 5,
  organizations: 3,
  org_members: 6,
  projects: 5,
  tasks: 10,
  comments: 7,
};
