import { randomBytes } from 'node:crypto';
import { z } from 'zod';

let generatedSalt: string | null = null;
function defaultIpHashSalt(): string {
  if (!generatedSalt) {
    generatedSalt = randomBytes(16).toString('hex');
    // eslint-disable-next-line no-console
    console.warn(
      `[env] IP_HASH_SALT not set; generated an ephemeral dev value. Set IP_HASH_SALT in production.`,
    );
  }
  return generatedSalt;
}

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    UCP_PROFILE_URL: z.string().url(),
    CATALOG_MCP_URL: z.string().url().default('https://catalog.shopify.com/api/ucp/mcp'),
    SHOPIFY_CLIENT_ID: z.string().optional(),
    SHOPIFY_CLIENT_SECRET: z.string().optional(),
    SHOPIFY_TOKEN_URL: z.string().url().optional(),

    // Groq / LLM.
    GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
    GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
    GROQ_FALLBACK_MODEL: z.string().default('llama-3.1-8b-instant'),
    GROQ_VISION_MODEL: z.string().default('meta-llama/llama-4-scout-17b-16e-instruct'),

    // Persistence.
    DB_PATH: z.string().default('data/agentic.db'),
    UPLOAD_DIR: z.string().default('data/uploads'),
    UPLOAD_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),

    // Vision spend cap (input tokens). Bounds the size of the base64-encoded
    // image data URL we ship to Groq vision.
    VISION_MAX_INPUT_TOKENS: z.coerce.number().int().min(256).max(32_000).default(4096),

    // R3-cleanup (architect-code MEDIUM): upload size cap promoted from a
    // 3-site magic number (index.ts multipart, routes/upload.ts 2x).
    UPLOAD_MAX_BYTES: z.coerce.number().int().min(1024).default(8 * 1024 * 1024),

    // R3-cleanup (architect-code LOW): per-file-local magic numbers
    // (`agent.ts::MAX_TURNS`, `reasoning.ts::MAX_CHIPS`) promoted here so ops
    // can tune turn budget and chip strip width without a code edit.
    AGENT_MAX_TURNS: z.coerce.number().int().min(1).max(16).default(4),
    REASONING_MAX_CHIPS: z.coerce.number().int().min(1).max(8).default(4),

    // Hashing salt for IP forensics.
    IP_HASH_SALT: z.string().min(8).optional(),

    // Dedicated HMAC key for signed upload URLs (ARCH §9, Cycle 6). In dev,
    // falls back to IP_HASH_SALT with a boot warning. In prod, REQUIRED — a
    // refine() below throws if missing.
    UPLOAD_SIGNING_SECRET: z.string().min(8).optional(),

    // Backend URL the FE share page server-fetches against. No default; in
    // prod this is required (the FE will otherwise try localhost:PORT which
    // is the FE port). Documented in `frontend/.env.example`.
    BACKEND_URL: z.string().url().optional(),

    PORT: z.coerce.number().default(4000),
    ALLOWED_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      if (!val.UPLOAD_SIGNING_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['UPLOAD_SIGNING_SECRET'],
          message:
            'UPLOAD_SIGNING_SECRET is required in production (separate HMAC key for signed upload URLs).',
        });
      }
      if (!val.BACKEND_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BACKEND_URL'],
          message:
            'BACKEND_URL is required in production (FE share-page fetches it server-side).',
        });
      }
      if (
        Array.isArray(val.ALLOWED_ORIGINS) &&
        val.ALLOWED_ORIGINS.some((o) => /localhost/i.test(o))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALLOWED_ORIGINS'],
          message:
            'production must not allow localhost origin in ALLOWED_ORIGINS.',
        });
      }
    }
  });

const parsed = schema.parse(process.env);

// In non-prod, UPLOAD_SIGNING_SECRET falls back to IP_HASH_SALT with a single
// boot-time warning. This preserves the Cycle 4 behaviour for local dev while
// satisfying the Cycle 6 security-MEDIUM split for production.
const resolvedIpHashSalt = parsed.IP_HASH_SALT ?? defaultIpHashSalt();
let resolvedUploadSecret = parsed.UPLOAD_SIGNING_SECRET;
if (!resolvedUploadSecret && parsed.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.warn(
    `[env] UPLOAD_SIGNING_SECRET not set; falling back to IP_HASH_SALT for dev. Set UPLOAD_SIGNING_SECRET in production.`,
  );
  resolvedUploadSecret = resolvedIpHashSalt;
}

export const env = {
  ...parsed,
  IP_HASH_SALT: resolvedIpHashSalt,
  UPLOAD_SIGNING_SECRET: resolvedUploadSecret as string,
};

export const hasJwtAuth =
  !!env.SHOPIFY_CLIENT_ID && !!env.SHOPIFY_CLIENT_SECRET && !!env.SHOPIFY_TOKEN_URL;

// R3-cleanup (architect-code MEDIUM): rate-limit matrix unified here so the
// audit happens in one place instead of grepping five routes. The previous
// scattered `{ max, timeWindow }` literals across `routes/chat.ts`,
// `routes/upload.ts`, `routes/preferences.ts`, `routes/session.ts`, and
// `routes/summary.ts` are now imports of the corresponding entry.
export const RATE_LIMITS = {
  chat:        { max: 10, timeWindow: '1 minute' as const },
  upload:      { max: 5,  timeWindow: '1 minute' as const },
  session:     { max: 60, timeWindow: '1 minute' as const },
  summary:     { max: 60, timeWindow: '1 minute' as const },
  preferences: { max: 60, timeWindow: '1 minute' as const },
} as const;
