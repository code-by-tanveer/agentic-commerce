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

const schema = z.object({
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

  // Hashing salt for IP forensics.
  IP_HASH_SALT: z.string().min(8).optional(),

  PORT: z.coerce.number().default(4000),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
});

const parsed = schema.parse(process.env);

export const env = {
  ...parsed,
  IP_HASH_SALT: parsed.IP_HASH_SALT ?? defaultIpHashSalt(),
};

export const hasJwtAuth =
  !!env.SHOPIFY_CLIENT_ID && !!env.SHOPIFY_CLIENT_SECRET && !!env.SHOPIFY_TOKEN_URL;
