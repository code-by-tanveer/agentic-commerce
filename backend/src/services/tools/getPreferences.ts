import { z } from 'zod';
import type { PreferencesSnapshot, Tool } from '../../types/tool.js';

const argsSchema = z.object({}).strict();

export type GetPreferencesArgs = z.infer<typeof argsSchema>;

export interface GetPreferencesResult {
  preferences: PreferencesSnapshot;
}

const description =
  'Read the currently-saved shopping preferences for this session. Use when you ' +
  'need to recall what the user told you earlier (size, budget, ships-to, palette, ' +
  'ethics, shipping_speed) and the context is unclear. Returns a JSON map of ' +
  '`key -> { value, source, updatedAt }`. No UI side effect — this is for your ' +
  'planning only.';

export const getPreferencesTool: Tool<GetPreferencesArgs, GetPreferencesResult> = {
  name: 'get_preferences',
  description,
  emits: [],
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  parseArgs(raw) {
    return argsSchema.parse(raw ?? {});
  },
  async execute(_args, ctx) {
    // Snapshot is loaded once per request by `agent.ts` and frozen on
    // `ctx.preferences`. We do NOT re-read the repo here — that would
    // race against in-flight saves and break the cycle-2.md rule.
    return { preferences: ctx.preferences };
  },
  toEvents(_args, result) {
    // No FE event — preferences are only re-injected into the LLM context.
    return {
      events: [],
      assistantString: JSON.stringify({
        preferences: result.preferences,
        note: 'Map of saved preferences. Empty object = no preferences saved yet.',
      }),
    };
  },
};
