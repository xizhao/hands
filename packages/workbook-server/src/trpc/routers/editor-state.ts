/**
 * Editor State tRPC Router
 *
 * Type-safe API for editor UI state management.
 * Persists state to .hands/editor.db SQLite database.
 */

import { initTRPC } from "@trpc/server";
import { z } from "zod";
import {
  addRecentItem,
  getEditorDb,
  getExpandedFolders,
  getExpandedSources,
  getRecentItems,
  getUiState,
  setFolderExpanded,
  setSourceExpanded,
  type UiState,
  updateUiState,
} from "../../db/editor-db.js";

// ============================================================================
// Context
// ============================================================================

export interface EditorStateContext {
  workbookDir: string;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<EditorStateContext>().create();
const publicProcedure = t.procedure;

// ============================================================================
// Input Schemas
// ============================================================================

const updateUiStateInput = z.object({
  sidebarWidth: z.number().optional(),
  chatExpanded: z.boolean().optional(),
  rightPanel: z.string().nullable().optional(),
  activeTab: z.string().optional(),
  pagesExpanded: z.boolean().optional(),
  dataExpanded: z.boolean().optional(),
  actionsExpanded: z.boolean().optional(),
  pluginsExpanded: z.boolean().optional(),
});

const toggleFolderInput = z.object({
  path: z.string(),
  expanded: z.boolean(),
});

const toggleSourceInput = z.object({
  sourceId: z.string(),
  expanded: z.boolean(),
});

const addRecentItemInput = z.object({
  itemType: z.string(),
  itemId: z.string(),
});

// ============================================================================
// Router
// ============================================================================

export const editorStateRouter = t.router({
  /**
   * Get current UI state
   */
  getUiState: publicProcedure.query(({ ctx }): UiState => {
    const db = getEditorDb(ctx.workbookDir);
    return getUiState(db);
  }),

  /**
   * Update UI state (partial updates supported)
   */
  updateUiState: publicProcedure.input(updateUiStateInput).mutation(({ ctx, input }) => {
    const db = getEditorDb(ctx.workbookDir);
    updateUiState(db, input);
    return getUiState(db);
  }),

  /**
   * Get all expanded folders
   */
  getExpandedFolders: publicProcedure.query(({ ctx }): string[] => {
    const db = getEditorDb(ctx.workbookDir);
    return getExpandedFolders(db);
  }),

  /**
   * Set folder expansion state
   */
  setFolderExpanded: publicProcedure.input(toggleFolderInput).mutation(({ ctx, input }) => {
    const db = getEditorDb(ctx.workbookDir);
    setFolderExpanded(db, input.path, input.expanded);
    return { success: true };
  }),

  /**
   * Get all expanded sources
   */
  getExpandedSources: publicProcedure.query(({ ctx }): string[] => {
    const db = getEditorDb(ctx.workbookDir);
    return getExpandedSources(db);
  }),

  /**
   * Set source expansion state
   */
  setSourceExpanded: publicProcedure.input(toggleSourceInput).mutation(({ ctx, input }) => {
    const db = getEditorDb(ctx.workbookDir);
    setSourceExpanded(db, input.sourceId, input.expanded);
    return { success: true };
  }),

  /**
   * Get recent items
   */
  getRecentItems: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ ctx, input }) => {
      const db = getEditorDb(ctx.workbookDir);
      return getRecentItems(db, input?.limit ?? 10);
    }),

  /**
   * Add item to recent list
   */
  addRecentItem: publicProcedure.input(addRecentItemInput).mutation(({ ctx, input }) => {
    const db = getEditorDb(ctx.workbookDir);
    addRecentItem(db, input.itemType, input.itemId);
    return { success: true };
  }),
});

export type EditorStateRouter = typeof editorStateRouter;
