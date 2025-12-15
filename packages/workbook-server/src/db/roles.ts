/**
 * Database Role Management
 *
 * Sets up PostgreSQL roles for permission enforcement:
 * - hands_reader: Read-only access to public schema (for blocks)
 * - hands_writer: Full DML on public schema (for actions/sources)
 * - hands_admin: Full access including hands schema (for runtime internals)
 *
 * The hands schema is hidden from reader/writer roles.
 */

import type { PGlite } from "@electric-sql/pglite";

/**
 * SQL to set up all roles and permissions
 * This is idempotent - safe to run multiple times
 */
export const ROLE_SETUP_SQL = `
-- Create hands schema for internal runtime tables
CREATE SCHEMA IF NOT EXISTS hands;

-- Create roles if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hands_reader') THEN
    CREATE ROLE hands_reader WITH NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hands_writer') THEN
    CREATE ROLE hands_writer WITH NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hands_admin') THEN
    CREATE ROLE hands_admin WITH NOLOGIN;
  END IF;
END $$;

-- hands_reader: SELECT only on public schema + temp tables
-- Explicitly NO access to hands schema
GRANT USAGE ON SCHEMA public TO hands_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hands_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO hands_reader;
-- Revoke any access to hands schema (explicit deny)
REVOKE ALL ON SCHEMA hands FROM hands_reader;

-- hands_writer: Full DML on public schema
-- Explicitly NO access to hands schema
GRANT USAGE ON SCHEMA public TO hands_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hands_writer;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hands_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hands_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hands_writer;
-- Revoke any access to hands schema (explicit deny)
REVOKE ALL ON SCHEMA hands FROM hands_writer;

-- hands_admin: Full access to both schemas
GRANT ALL ON SCHEMA hands TO hands_admin;
GRANT ALL ON ALL TABLES IN SCHEMA hands TO hands_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA hands TO hands_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA hands GRANT ALL ON TABLES TO hands_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA hands GRANT ALL ON SEQUENCES TO hands_admin;
GRANT ALL ON SCHEMA public TO hands_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO hands_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO hands_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO hands_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO hands_admin;
`;

/**
 * Ensure all roles are set up in the database
 * Safe to call multiple times (idempotent)
 */
export async function ensureRoles(db: PGlite): Promise<void> {
  console.log("[db] Setting up roles...");
  await db.exec(ROLE_SETUP_SQL);
  console.log("[db] Roles configured: hands_reader, hands_writer, hands_admin");
}

/**
 * Role names for use with SET ROLE
 */
export const Roles = {
  READER: "hands_reader",
  WRITER: "hands_writer",
  ADMIN: "hands_admin",
} as const;

export type RoleName = (typeof Roles)[keyof typeof Roles];
