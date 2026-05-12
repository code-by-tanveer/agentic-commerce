import type { FastifyBaseLogger } from 'fastify';
import type { ServerEvent, ServerEventType } from '../stream/events.js';
import type { Cache } from '../services/cache.js';

/**
 * Minimal subset of JSON Schema draft-7 sufficient for Groq's OpenAI-shape
 * tool descriptors. Kept inline rather than depending on `@types/json-schema`.
 */
export type JsonSchema = {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null';
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  default?: unknown;
} & Record<string, unknown>;

/**
 * The snapshot of preferences delivered to every tool invocation. Loaded
 * once per request from `db/repos/preferences.ts` and frozen for the life
 * of the agent loop (cycle-2.md: "tools don't re-read mid-loop").
 *
 * Keys are the fixed `PreferenceKey` enum; values are JSON-parsed entries
 * (`{ value, source, updatedAt }`). Index signature is permissive to keep
 * tools loosely coupled to the enum.
 */
export interface PreferenceEntrySnapshot {
  readonly value: unknown;
  readonly source: 'user' | 'inferred' | 'agent';
  readonly updatedAt: string;
}

export interface PreferencesSnapshot {
  readonly [key: string]: PreferenceEntrySnapshot | undefined;
}

export interface ToolContext {
  sessionId: string;
  log: FastifyBaseLogger;
  emit: (event: ServerEvent) => void;
  preferences: PreferencesSnapshot;
  cache: Cache;
  signal: AbortSignal;
}

export interface Tool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  /** JSON Schema draft-7 description of the tool's args (OpenAI tools shape). */
  parameters: JsonSchema;
  /** Which ServerEvent types this tool's results can emit (excluding tool_status). */
  emits: ServerEventType[];
  /** Validates the LLM-supplied args and returns typed args; throw on invalid. */
  parseArgs(raw: unknown): TArgs;
  /**
   * Run the tool. Implementations should respect `ctx.signal` for cancellation.
   * Should NOT emit events itself — the dispatcher converts the result into
   * events. Tools may emit progress events directly if they need to.
   */
  execute(args: TArgs, ctx: ToolContext): Promise<TResult>;
  /**
   * Convert the typed result into ServerEvents and the assistant-visible
   * tool message string. Returning both lets the registry stream UI events
   * while feeding a compact summary back to the LLM.
   */
  toEvents(
    args: TArgs,
    result: TResult,
    ctx: { toolCallId: string },
  ): { events: ServerEvent[]; assistantString: string };
}
