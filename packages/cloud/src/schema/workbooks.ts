import { pgTable, text, timestamp, uuid, boolean, unique } from "drizzle-orm/pg-core";
import { users } from "./users";

// Workbook registry
export const workbooks = pgTable("workbooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),

  // D1 binding info
  d1DatabaseId: text("d1_database_id"),
  workerName: text("worker_name"),
  workerUrl: text("worker_url"),

  // Settings
  isPublic: boolean("is_public").notNull().default(false),

  deployedAt: timestamp("deployed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Collaborators with Google Docs-style roles
export const workbookCollaborators = pgTable("workbook_collaborators", {
  id: uuid("id").primaryKey().defaultRandom(),
  workbookId: uuid("workbook_id")
    .notNull()
    .references(() => workbooks.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // viewer, editor, developer, owner
  invitedBy: uuid("invited_by").references(() => users.id),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("workbook_collaborators_unique").on(table.workbookId, table.userId),
]);

// Git repositories for workbook source
export const workbookRepos = pgTable("workbook_repos", {
  id: uuid("id").primaryKey().defaultRandom(),
  workbookId: uuid("workbook_id")
    .notNull()
    .references(() => workbooks.id, { onDelete: "cascade" })
    .unique(),

  // Git remote info
  remoteUrl: text("remote_url").notNull(),
  defaultBranch: text("default_branch").notNull().default("main"),

  // Latest commit info
  headSha: text("head_sha"),
  headMessage: text("head_message"),
  headAuthor: text("head_author"),
  headAt: timestamp("head_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkbookRecord = typeof workbooks.$inferSelect;
export type NewWorkbook = typeof workbooks.$inferInsert;
export type CollaboratorRecord = typeof workbookCollaborators.$inferSelect;
export type RepoRecord = typeof workbookRepos.$inferSelect;

// Role definitions
export const ROLES = {
  viewer: {
    name: "Viewer",
    description: "Read-only access to published workbook",
    permissions: ["read"],
  },
  editor: {
    name: "Editor",
    description: "Can edit data via edit routes (CRUD on user tables)",
    permissions: ["read", "write"],
  },
  developer: {
    name: "Developer",
    description: "Can edit workbook source (pages, blocks, schema)",
    permissions: ["read", "write", "source"],
  },
  owner: {
    name: "Owner",
    description: "Full access, can manage collaborators, delete workbook",
    permissions: ["read", "write", "source", "admin"],
  },
} as const;

export type RoleType = keyof typeof ROLES;
