/**
 * Thumbnail Storage
 *
 * Stores and retrieves page/block thumbnails for preview and LQIP loading states.
 * Thumbnails are stored in the hands_admin schema, keyed by type:contentId:theme.
 */

import type { PGlite } from "@electric-sql/pglite";

const SCHEMA = "hands_admin";
const TABLE = `${SCHEMA}.thumbnails`;

export interface Thumbnail {
  id: string;
  type: "page" | "block";
  contentId: string;
  theme: "light" | "dark";
  thumbnail: string; // base64 PNG
  lqip: string; // base64 PNG (tiny blurred version)
  contentHash?: string;
  createdAt: Date;
}

export interface ThumbnailInput {
  type: "page" | "block";
  contentId: string;
  theme: "light" | "dark";
  thumbnail: string;
  lqip: string;
  contentHash?: string;
}

/**
 * Initialize the thumbnails table in the hands_admin schema
 */
export async function initThumbnailsTable(db: PGlite): Promise<void> {
  // Ensure the hands_admin schema exists
  await db.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      content_id TEXT NOT NULL,
      theme TEXT NOT NULL,
      thumbnail_b64 TEXT NOT NULL,
      lqip_b64 TEXT NOT NULL,
      content_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(type, content_id, theme)
    )
  `);

  // Index for lookups by content
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_thumbnails_content
    ON ${TABLE} (type, content_id)
  `);
}

/**
 * Generate thumbnail ID from components
 */
function getThumbnailId(type: string, contentId: string, theme: string): string {
  return `${type}:${contentId}:${theme}`;
}

/**
 * Save or update a thumbnail
 */
export async function saveThumbnail(db: PGlite, input: ThumbnailInput): Promise<void> {
  const id = getThumbnailId(input.type, input.contentId, input.theme);

  await db.query(
    `
    INSERT INTO ${TABLE} (id, type, content_id, theme, thumbnail_b64, lqip_b64, content_hash, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (type, content_id, theme)
    DO UPDATE SET
      thumbnail_b64 = EXCLUDED.thumbnail_b64,
      lqip_b64 = EXCLUDED.lqip_b64,
      content_hash = EXCLUDED.content_hash,
      created_at = NOW()
    `,
    [id, input.type, input.contentId, input.theme, input.thumbnail, input.lqip, input.contentHash ?? null],
  );
}

/**
 * Get thumbnail for a specific type/content/theme combination
 */
export async function getThumbnail(
  db: PGlite,
  type: "page" | "block",
  contentId: string,
  theme: "light" | "dark",
): Promise<Thumbnail | null> {
  const result = await db.query<{
    id: string;
    type: string;
    content_id: string;
    theme: string;
    thumbnail_b64: string;
    lqip_b64: string;
    content_hash: string | null;
    created_at: Date;
  }>(
    `SELECT * FROM ${TABLE} WHERE type = $1 AND content_id = $2 AND theme = $3`,
    [type, contentId, theme],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    type: row.type as "page" | "block",
    contentId: row.content_id,
    theme: row.theme as "light" | "dark",
    thumbnail: row.thumbnail_b64,
    lqip: row.lqip_b64,
    contentHash: row.content_hash ?? undefined,
    createdAt: row.created_at,
  };
}

/**
 * Get all thumbnails for a content item (both themes)
 */
export async function getThumbnails(
  db: PGlite,
  type: "page" | "block",
  contentId: string,
): Promise<{ light?: Thumbnail; dark?: Thumbnail }> {
  const result = await db.query<{
    id: string;
    type: string;
    content_id: string;
    theme: string;
    thumbnail_b64: string;
    lqip_b64: string;
    content_hash: string | null;
    created_at: Date;
  }>(`SELECT * FROM ${TABLE} WHERE type = $1 AND content_id = $2`, [type, contentId]);

  const thumbnails: { light?: Thumbnail; dark?: Thumbnail } = {};

  for (const row of result.rows) {
    const thumb: Thumbnail = {
      id: row.id,
      type: row.type as "page" | "block",
      contentId: row.content_id,
      theme: row.theme as "light" | "dark",
      thumbnail: row.thumbnail_b64,
      lqip: row.lqip_b64,
      contentHash: row.content_hash ?? undefined,
      createdAt: row.created_at,
    };
    thumbnails[thumb.theme] = thumb;
  }

  return thumbnails;
}

/**
 * Delete thumbnails for a content item (all themes)
 */
export async function deleteThumbnails(
  db: PGlite,
  type: "page" | "block",
  contentId: string,
): Promise<void> {
  await db.query(`DELETE FROM ${TABLE} WHERE type = $1 AND content_id = $2`, [type, contentId]);
}

/**
 * Delete a specific thumbnail
 */
export async function deleteThumbnail(
  db: PGlite,
  type: "page" | "block",
  contentId: string,
  theme: "light" | "dark",
): Promise<void> {
  await db.query(`DELETE FROM ${TABLE} WHERE type = $1 AND content_id = $2 AND theme = $3`, [
    type,
    contentId,
    theme,
  ]);
}
