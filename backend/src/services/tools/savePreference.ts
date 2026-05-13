import { z } from 'zod';
import {
  PREFERENCE_KEYS,
  isPreferenceKey,
  type PreferenceKey,
} from '@agentic/events';
import {
  upsertPreference,
  type PreferenceSource,
} from '../../db/repos/preferences.js';
import type { Tool } from '../../types/tool.js';

// LLM-supplied value can be a string, number, boolean, or a plain object/array
// (e.g. `{min,max}` for budget). We accept the union and JSON-stringify in the
// repo layer.
const valueSchema: z.ZodType<unknown> = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.record(z.unknown()),
  z.null(),
]);

const argsSchema = z
  .object({
    key: z.string().trim().min(1),
    value: valueSchema,
    source: z.enum(['user', 'inferred', 'agent']).optional(),
  })
  .strict();

export type SavePreferenceArgs = z.infer<typeof argsSchema>;

/**
 * 2026-05-13: task-tier keys are intentionally NOT savable via this tool.
 * They live in the in-memory scratchpad (`services/taskPrefs.ts`) and are
 * written through by `search_catalog`. Routing them here was the cause of
 * the "lamp under $15 → running shoes returns nothing" bug. The tool
 * returns a clean rejection so the agent can self-correct on the next turn
 * (the assistantString points it at the right tool/filter path).
 *
 * TODO v1.5: `size` should be scoped (size:shoe=8 vs size:dress=M) and may
 * also leave this tool, but for now it stays identity-tier and savable.
 */
const TASK_TIER_KEYS = new Set<PreferenceKey>(['budget', 'shipping_speed', 'shopping_for']);

export interface SavePreferenceResult {
  ok: true;
  key: PreferenceKey;
  value: unknown;
  source: PreferenceSource;
  updatedAt: string;
}

export interface SavePreferenceRejection {
  ok: false;
  error: 'unknown_key' | 'task_tier_key';
  attempted: string;
  validKeys: readonly PreferenceKey[];
  message?: string;
}

export type SavePreferenceOutcome = SavePreferenceResult | SavePreferenceRejection;

const description =
  'Persist a single IDENTITY-tier user shopping preference (ships_to, palette, ethics, size). ' +
  'Call this *before* responding when the user states one of those. Do NOT call it for ' +
  'task-tier keys (budget, shipping_speed, shopping_for) — those live per shopping-topic and ' +
  'are passed via `search_catalog` filters every turn instead. ' +
  `Accepted keys: ${PREFERENCE_KEYS.join(', ')} (task-tier keys here will be rejected). ` +
  'The `value` can be a string, number, boolean, or object. ' +
  'Use `source: "user"` for explicit statements (default), `"inferred"` when you deduced ' +
  'it from context, `"agent"` for proactive saves. Returns the saved entry; do not call ' +
  'again with the same value within the same turn.';

export const savePreferenceTool: Tool<SavePreferenceArgs, SavePreferenceOutcome> = {
  name: 'save_preference',
  description,
  emits: ['preference_update'],
  parameters: {
    type: 'object',
    properties: {
      key: {
        type: 'string',
        enum: [...PREFERENCE_KEYS],
        description: 'Preference key. Must be one of the supported enum values.',
      },
      value: {
        description: 'String, number, boolean, or JSON object/array. JSON-stringified at rest.',
      },
      source: {
        type: 'string',
        enum: ['user', 'inferred', 'agent'],
        description: 'How this preference was derived. Defaults to "user".',
      },
    },
    required: ['key', 'value'],
    additionalProperties: false,
  },
  parseArgs(raw) {
    return argsSchema.parse(raw);
  },
  async execute(args, ctx) {
    if (!isPreferenceKey(args.key)) {
      return {
        ok: false,
        error: 'unknown_key',
        attempted: args.key,
        validKeys: PREFERENCE_KEYS,
      } satisfies SavePreferenceRejection;
    }
    if (TASK_TIER_KEYS.has(args.key)) {
      return {
        ok: false,
        error: 'task_tier_key',
        attempted: args.key,
        validKeys: PREFERENCE_KEYS,
        message: `\`${args.key}\` is task-tier — pass it via search_catalog filters per turn instead of save_preference.`,
      } satisfies SavePreferenceRejection;
    }
    const source: PreferenceSource = args.source ?? 'user';
    const entry = await upsertPreference(ctx.sessionId, args.key, args.value, source);
    return {
      ok: true,
      key: args.key,
      value: entry.value,
      source: entry.source,
      updatedAt: entry.updatedAt,
    } satisfies SavePreferenceResult;
  },
  toEvents(_args, result, { toolCallId }) {
    if (!result.ok) {
      if (result.error === 'task_tier_key') {
        const errMsg =
          result.message ??
          `\`${result.attempted}\` is task-tier; pass via search_catalog filters.`;
        return {
          events: [
            {
              type: 'tool_status' as const,
              toolCallId,
              name: 'save_preference',
              status: 'error' as const,
              errorMessage: errMsg,
            },
          ],
          assistantString: JSON.stringify({
            error: 'task_tier_key',
            attempted: result.attempted,
            detail:
              'This key is task-tier — pass it in the next search_catalog call as a filter (e.g. filters.price for budget, filters.shipping_speed for shipping_speed). Do not call save_preference for it.',
          }),
        };
      }
      const errMsg = `unknown_key: "${result.attempted}". Valid keys: ${result.validKeys.join(', ')}.`;
      return {
        events: [
          {
            type: 'tool_status' as const,
            toolCallId,
            name: 'save_preference',
            status: 'error' as const,
            errorMessage: errMsg,
          },
        ],
        assistantString: JSON.stringify({
          error: 'unknown_preference_key',
          attempted: result.attempted,
          valid_keys: result.validKeys,
          detail: 'Call save_preference again with one of the listed keys.',
        }),
      };
    }
    return {
      events: [
        {
          type: 'preference_update' as const,
          key: result.key,
          value: result.value,
          source: result.source,
        },
      ],
      assistantString: JSON.stringify({
        ok: true,
        saved: { key: result.key, value: result.value, source: result.source },
      }),
    };
  },
};
