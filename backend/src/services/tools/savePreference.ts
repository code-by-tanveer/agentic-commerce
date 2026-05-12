import { z } from 'zod';
import {
  PREFERENCE_KEYS,
  isPreferenceKey,
  upsertPreference,
  type PreferenceKey,
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

export interface SavePreferenceResult {
  ok: true;
  key: PreferenceKey;
  value: unknown;
  source: PreferenceSource;
  updatedAt: string;
}

export interface SavePreferenceRejection {
  ok: false;
  error: 'unknown_key';
  attempted: string;
  validKeys: readonly PreferenceKey[];
}

export type SavePreferenceOutcome = SavePreferenceResult | SavePreferenceRejection;

const description =
  'Persist a single user shopping preference (e.g. size, budget, ships-to country). ' +
  'Call this *before* responding when the user states a preference. Accepted keys: ' +
  `${PREFERENCE_KEYS.join(', ')}. ` +
  'The `value` can be a string, number, boolean, or object (e.g. `{min, max}` for budget). ' +
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
