import { nanoid } from 'nanoid';
import { db } from '../sqlite.js';

export type MessageRole = 'user' | 'assistant' | 'tool';
export type MessageStatus = 'done' | 'truncated' | 'error';

export interface MessageInput {
  role: MessageRole;
  blocks: unknown; // serialized to JSON
  toolName?: string | null;
  toolCallId?: string | null;
  /**
   * polish-round-2 T2.1: ADR-0002 compliance. Defaults to 'done'.
   * `truncated` is used by the BE agent loop on FE-abort / mid-stream error;
   * `error` is reserved for explicit failure persistence.
   */
  status?: MessageStatus;
}

export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  ordinal: number;
  blocks: unknown;
  toolName: string | null;
  toolCallId: string | null;
  status: MessageStatus;
  createdAt: string;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  ordinal: number;
  blocks_json: string;
  tool_name: string | null;
  tool_call_id: string | null;
  status: string | null;
  created_at: string;
}

function rowToMessage(r: MessageRow): Message {
  let blocks: unknown;
  try {
    blocks = JSON.parse(r.blocks_json);
  } catch {
    blocks = r.blocks_json;
  }
  const status: MessageStatus =
    r.status === 'truncated' || r.status === 'error' ? r.status : 'done';
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role as MessageRole,
    ordinal: r.ordinal,
    blocks,
    toolName: r.tool_name,
    toolCallId: r.tool_call_id,
    status,
    createdAt: r.created_at,
  };
}

const insertStmt = () =>
  db.prepare(
    `INSERT INTO messages(id, session_id, role, ordinal, blocks_json, tool_name, tool_call_id, status, created_at)
     VALUES (@id, @session_id, @role, @ordinal, @blocks_json, @tool_name, @tool_call_id, @status, @created_at)`,
  );

const nextOrdinalStmt = () =>
  db.prepare<[string]>(
    'SELECT COALESCE(MAX(ordinal), 0) + 1 AS next FROM messages WHERE session_id = ?',
  );

const listStmt = () =>
  db.prepare<[string, number]>(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY ordinal ASC LIMIT ?',
  );

export async function appendMessage(
  sessionId: string,
  message: MessageInput,
): Promise<Message> {
  const next = (nextOrdinalStmt().get(sessionId) as { next: number }).next;
  const id = nanoid();
  const createdAt = new Date().toISOString();
  const status: MessageStatus = message.status ?? 'done';
  insertStmt().run({
    id,
    session_id: sessionId,
    role: message.role,
    ordinal: next,
    blocks_json: JSON.stringify(message.blocks ?? null),
    tool_name: message.toolName ?? null,
    tool_call_id: message.toolCallId ?? null,
    status,
    created_at: createdAt,
  });
  return Promise.resolve({
    id,
    sessionId,
    role: message.role,
    ordinal: next,
    blocks: message.blocks,
    toolName: message.toolName ?? null,
    toolCallId: message.toolCallId ?? null,
    status,
    createdAt,
  });
}

export async function listMessages(
  sessionId: string,
  limit = 200,
): Promise<Message[]> {
  const rows = listStmt().all(sessionId, limit) as MessageRow[];
  return Promise.resolve(rows.map(rowToMessage));
}
