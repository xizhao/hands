/**
 * Session Storage Layer
 *
 * Persists sessions, messages, and parts to SQLite via DatabaseContext.
 * Uses internal tables prefixed with _ to separate from user data.
 */

import type { Session, MessageWithParts, Part, Todo } from "../core";
import type { DatabaseContext } from "./tools";
import { generateId } from "../core";

// ============================================================================
// Types
// ============================================================================

export interface SessionStorage {
  // Sessions
  listSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  createSession(options?: { title?: string; parentId?: string }): Promise<Session>;
  updateSession(id: string, updates: { title?: string; updated?: number }): Promise<Session>;
  deleteSession(id: string): Promise<void>;
  getSessionChildren(parentId: string): Promise<Session[]>;

  // Messages
  listMessages(sessionId: string): Promise<MessageWithParts[]>;
  getMessage(sessionId: string, messageId: string): Promise<MessageWithParts | null>;
  createMessage(sessionId: string, message: MessageWithParts): Promise<void>;
  updateMessage(sessionId: string, message: MessageWithParts): Promise<void>;
  deleteMessage(sessionId: string, messageId: string): Promise<void>;

  // Parts
  createPart(messageId: string, sessionId: string, part: Part): Promise<void>;
  updatePart(part: Part): Promise<void>;
  deletePart(partId: string): Promise<void>;

  // Todos (stored per-session)
  listTodos(sessionId: string): Promise<Todo[]>;
  saveTodos(sessionId: string, todos: Todo[]): Promise<void>;
}

// ============================================================================
// Row Types (SQLite format)
// ============================================================================

interface SessionRow {
  id: string;
  parent_id: string | null;
  title: string | null;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  session_id: string;
  parent_id: string | null;
  role: "user" | "assistant";
  model_id: string | null;
  provider_id: string | null;
  created_at: number;
  completed_at: number | null;
  cost: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  finish_reason: string | null;
}

interface PartRow {
  id: string;
  message_id: string;
  session_id: string;
  type: string;
  data: string; // JSON
}

// ============================================================================
// SQLite Session Storage Implementation
// ============================================================================

export function createSessionStorage(db: DatabaseContext): SessionStorage {
  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  async function listSessions(): Promise<Session[]> {
    const rows = await db.query<SessionRow>(
      "SELECT * FROM _sessions WHERE parent_id IS NULL ORDER BY updated_at DESC"
    );
    return (rows as SessionRow[]).map(rowToSession);
  }

  async function getSession(id: string): Promise<Session | null> {
    const rows = await db.query<SessionRow>(
      "SELECT * FROM _sessions WHERE id = ?",
      [id]
    );
    const row = (rows as SessionRow[])[0];
    return row ? rowToSession(row) : null;
  }

  async function createSession(options?: { title?: string; parentId?: string }): Promise<Session> {
    const id = generateId("ses");
    const now = Date.now();

    await db.execute(
      "INSERT INTO _sessions (id, parent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, options?.parentId ?? null, options?.title ?? null, now, now]
    );

    return {
      id,
      title: options?.title,
      parentId: options?.parentId,
      time: { created: now, updated: now },
    };
  }

  async function updateSession(
    id: string,
    updates: { title?: string; updated?: number }
  ): Promise<Session> {
    const session = await getSession(id);
    if (!session) throw new Error(`Session not found: ${id}`);

    const updated = updates.updated ?? Date.now();

    if (updates.title !== undefined) {
      await db.execute(
        "UPDATE _sessions SET title = ?, updated_at = ? WHERE id = ?",
        [updates.title, updated, id]
      );
      session.title = updates.title;
    } else {
      await db.execute(
        "UPDATE _sessions SET updated_at = ? WHERE id = ?",
        [updated, id]
      );
    }

    session.time.updated = updated;
    return session;
  }

  async function deleteSession(id: string): Promise<void> {
    // CASCADE will delete messages and parts
    await db.execute("DELETE FROM _sessions WHERE id = ?", [id]);
  }

  async function getSessionChildren(parentId: string): Promise<Session[]> {
    const rows = await db.query<SessionRow>(
      "SELECT * FROM _sessions WHERE parent_id = ? ORDER BY created_at ASC",
      [parentId]
    );
    return (rows as SessionRow[]).map(rowToSession);
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  async function listMessages(sessionId: string): Promise<MessageWithParts[]> {
    const messageRows = await db.query<MessageRow>(
      "SELECT * FROM _messages WHERE session_id = ? ORDER BY created_at ASC",
      [sessionId]
    );

    const messages: MessageWithParts[] = [];

    for (const row of messageRows as MessageRow[]) {
      const partRows = await db.query<PartRow>(
        "SELECT * FROM _parts WHERE message_id = ?",
        [row.id]
      );

      messages.push({
        info: rowToMessage(row),
        parts: (partRows as PartRow[]).map(rowToPart),
      });
    }

    return messages;
  }

  async function getMessage(sessionId: string, messageId: string): Promise<MessageWithParts | null> {
    const rows = await db.query<MessageRow>(
      "SELECT * FROM _messages WHERE id = ? AND session_id = ?",
      [messageId, sessionId]
    );

    const row = (rows as MessageRow[])[0];
    if (!row) return null;

    const partRows = await db.query<PartRow>(
      "SELECT * FROM _parts WHERE message_id = ?",
      [messageId]
    );

    return {
      info: rowToMessage(row),
      parts: (partRows as PartRow[]).map(rowToPart),
    };
  }

  async function createMessage(sessionId: string, message: MessageWithParts): Promise<void> {
    const info = message.info;

    await db.execute(
      `INSERT INTO _messages (
        id, session_id, parent_id, role, model_id, provider_id,
        created_at, completed_at, cost, tokens_input, tokens_output, finish_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        info.id,
        sessionId,
        info.role === "assistant" ? (info as any).parentId ?? null : null,
        info.role,
        info.role === "assistant" ? (info as any).modelId ?? null : null,
        info.role === "assistant" ? (info as any).providerId ?? null : null,
        info.time.created,
        info.role === "assistant" ? (info as any).time?.completed ?? null : null,
        info.role === "assistant" ? (info as any).cost ?? null : null,
        info.role === "assistant" ? (info as any).tokens?.input ?? null : null,
        info.role === "assistant" ? (info as any).tokens?.output ?? null : null,
        info.role === "assistant" ? (info as any).finish ?? null : null,
      ]
    );

    // Insert parts
    for (const part of message.parts) {
      await createPart(info.id, sessionId, part);
    }

    // Update session timestamp
    await db.execute(
      "UPDATE _sessions SET updated_at = ? WHERE id = ?",
      [Date.now(), sessionId]
    );
  }

  async function updateMessage(sessionId: string, message: MessageWithParts): Promise<void> {
    const info = message.info;

    await db.execute(
      `UPDATE _messages SET
        completed_at = ?, cost = ?, tokens_input = ?, tokens_output = ?, finish_reason = ?
      WHERE id = ?`,
      [
        info.role === "assistant" ? (info as any).time?.completed ?? null : null,
        info.role === "assistant" ? (info as any).cost ?? null : null,
        info.role === "assistant" ? (info as any).tokens?.input ?? null : null,
        info.role === "assistant" ? (info as any).tokens?.output ?? null : null,
        info.role === "assistant" ? (info as any).finish ?? null : null,
        info.id,
      ]
    );

    // Upsert parts
    for (const part of message.parts) {
      const existing = await db.query<{ id: string }>(
        "SELECT id FROM _parts WHERE id = ?",
        [part.id]
      );

      if ((existing as { id: string }[]).length > 0) {
        await updatePart(part);
      } else {
        await createPart(info.id, sessionId, part);
      }
    }
  }

  async function deleteMessage(sessionId: string, messageId: string): Promise<void> {
    // CASCADE will delete parts
    await db.execute(
      "DELETE FROM _messages WHERE id = ? AND session_id = ?",
      [messageId, sessionId]
    );
  }

  // ---------------------------------------------------------------------------
  // Parts
  // ---------------------------------------------------------------------------

  async function createPart(messageId: string, sessionId: string, part: Part): Promise<void> {
    const data = partToData(part);

    await db.execute(
      "INSERT INTO _parts (id, message_id, session_id, type, data) VALUES (?, ?, ?, ?, ?)",
      [part.id, messageId, sessionId, part.type, JSON.stringify(data)]
    );
  }

  async function updatePart(part: Part): Promise<void> {
    const data = partToData(part);

    await db.execute(
      "UPDATE _parts SET data = ? WHERE id = ?",
      [JSON.stringify(data), part.id]
    );
  }

  async function deletePart(partId: string): Promise<void> {
    await db.execute("DELETE FROM _parts WHERE id = ?", [partId]);
  }

  // ---------------------------------------------------------------------------
  // Todos
  // ---------------------------------------------------------------------------

  async function listTodos(sessionId: string): Promise<Todo[]> {
    // Todos are stored as a JSON array in session metadata
    // For simplicity, we'll add a _todos column or table later
    // For now, return empty
    return [];
  }

  async function saveTodos(sessionId: string, todos: Todo[]): Promise<void> {
    // TODO: implement todo persistence
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function rowToSession(row: SessionRow): Session {
    return {
      id: row.id,
      title: row.title ?? undefined,
      parentId: row.parent_id ?? undefined,
      time: {
        created: row.created_at,
        updated: row.updated_at,
      },
    };
  }

  function rowToMessage(row: MessageRow): MessageWithParts["info"] {
    if (row.role === "user") {
      return {
        id: row.id,
        sessionId: row.session_id,
        role: "user",
        time: { created: row.created_at },
      };
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      role: "assistant",
      parentId: row.parent_id ?? "",
      time: {
        created: row.created_at,
        completed: row.completed_at ?? undefined,
      },
      modelId: row.model_id ?? undefined,
      providerId: row.provider_id ?? undefined,
      cost: row.cost ?? undefined,
      tokens: row.tokens_input != null ? {
        input: row.tokens_input,
        output: row.tokens_output ?? 0,
      } : undefined,
      finish: row.finish_reason ?? undefined,
    };
  }

  function rowToPart(row: PartRow): Part {
    const data = JSON.parse(row.data);

    // Reconstruct part with base fields
    return {
      id: row.id,
      sessionId: row.session_id,
      messageId: row.message_id,
      type: row.type,
      ...data,
    } as Part;
  }

  function partToData(part: Part): Record<string, unknown> {
    // Extract type-specific data, excluding base fields
    const { id, sessionId, messageId, type, ...data } = part as any;
    return data;
  }

  return {
    listSessions,
    getSession,
    createSession,
    updateSession,
    deleteSession,
    getSessionChildren,
    listMessages,
    getMessage,
    createMessage,
    updateMessage,
    deleteMessage,
    createPart,
    updatePart,
    deletePart,
    listTodos,
    saveTodos,
  };
}
