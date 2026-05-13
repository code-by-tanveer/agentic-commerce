import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { chatCompletion } from '../groqClient.js';
import { verifyUploadUrl } from '../uploads.js';
import { parseVisionOutput, VISION_PROMPT } from '../visionPrompt.js';
import type { Tool } from '../../types/tool.js';

/**
 * `extract_style_from_image` — multimodal style-attribute extractor.
 *
 * Security-critical: this is the SSRF gate for the vision pipeline (ARCH §7).
 * The tool refuses any URL that wasn't minted by `POST /api/upload`. Vision
 * input is always a local file read off disk and re-encoded as a base64
 * data URL; external URLs are never fetched here.
 *
 * Emits one `moodboard` SSE event on success. On low-confidence vision
 * output (`attributes: []`), the agent's system prompt (agent.ts addendum)
 * instructs it to ask a clarifying question instead of guessing.
 */

const argsSchema = z
  .object({
    image_url: z.string().trim().min(1).max(8192),
  })
  .strict();

export type ExtractStyleArgs = z.infer<typeof argsSchema>;

export interface ExtractStyleResult {
  ok: true;
  imageUrl: string;
  description: string;
  attributes: string[];
  suggestedQuery: string;
}

export interface ExtractStyleError {
  ok: false;
  imageUrl: string;
  error: 'invalid_image_url' | 'image_read_failed' | 'vision_failed';
  detail: string;
}

export type ExtractStyleToolResult = ExtractStyleResult | ExtractStyleError;

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const description =
  'Extract style attributes from a user-uploaded image. Use ONLY with image URLs returned from POST /api/upload (signed:* scheme). The tool refuses any other URL — never pass an external https:// link. Returns {description, attributes, suggestedQuery}; if the model could not confidently extract attributes (attributes is empty), ask one clarifying question before searching.';

export const extractStyleFromImageTool: Tool<ExtractStyleArgs, ExtractStyleToolResult> = {
  name: 'extract_style_from_image',
  description,
  emits: ['moodboard'],
  parameters: {
    type: 'object',
    properties: {
      image_url: {
        type: 'string',
        description:
          'A signed: URL returned by POST /api/upload. External URLs (http/https) are rejected.',
      },
    },
    required: ['image_url'],
    additionalProperties: false,
  },
  parseArgs(raw) {
    return argsSchema.parse(raw);
  },
  async execute(args, ctx): Promise<ExtractStyleToolResult> {
    if (ctx.signal.aborted) throw new Error('aborted');

    // SSRF gate. The vision model NEVER fetches user-supplied URLs — only
    // backend-minted signed: URLs that point at a local file on disk.
    const verified = verifyUploadUrl(args.image_url);
    if (!verified) {
      return {
        ok: false,
        imageUrl: args.image_url,
        error: 'invalid_image_url',
        detail:
          'image_url must be a signed URL minted by /api/upload — external URLs are not allowed.',
      };
    }

    // Read the file off disk and re-encode as a base64 data URL.
    let buf: Buffer;
    try {
      buf = await readFile(verified.localPath);
    } catch (err) {
      ctx.log.warn({ err, file: verified.filename }, 'extract_style_from_image: read failed');
      return {
        ok: false,
        imageUrl: args.image_url,
        error: 'image_read_failed',
        detail: 'The uploaded image was not found on disk (it may have been purged).',
      };
    }

    const ext = extname(verified.filename).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      // Should not happen — upload route already restricted the extension.
      return {
        ok: false,
        imageUrl: args.image_url,
        error: 'image_read_failed',
        detail: `Unsupported image extension on disk: ${ext}`,
      };
    }
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

    if (ctx.signal.aborted) throw new Error('aborted');

    let raw: string;
    try {
      const resp = await chatCompletion({
        model: env.GROQ_VISION_MODEL,
        max_tokens: env.VISION_MAX_INPUT_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        signal: ctx.signal,
        usageTag: 'vision',
      });
      raw = resp.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      const detail = err instanceof Error ? err.message : 'vision_call_failed';
      ctx.log.error({ err }, 'extract_style_from_image: vision call failed');
      return {
        ok: false,
        imageUrl: args.image_url,
        error: 'vision_failed',
        detail,
      };
    }

    const parsed = parseVisionOutput(raw);
    return {
      ok: true,
      imageUrl: args.image_url,
      description: parsed.description,
      attributes: parsed.attributes,
      suggestedQuery: parsed.suggestedQuery,
    };
  },
  toEvents(args, result, { toolCallId }) {
    if (!result.ok) {
      return {
        events: [
          {
            type: 'tool_status' as const,
            toolCallId,
            name: 'extract_style_from_image',
            status: 'error' as const,
            errorMessage: result.detail,
          },
        ],
        assistantString: JSON.stringify({
          ok: false,
          error: result.error,
          detail: result.detail,
        }),
      };
    }

    return {
      events: [
        {
          type: 'moodboard' as const,
          toolCallId,
          imageUrl: result.imageUrl,
          description: result.description,
          attributes: result.attributes,
          suggestedQuery: result.suggestedQuery,
        },
      ],
      assistantString: JSON.stringify({
        ok: true,
        description: result.description,
        attributes: result.attributes,
        suggestedQuery: result.suggestedQuery,
      }),
    };
  },
};
