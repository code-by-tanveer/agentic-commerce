// Test-environment env-var defaults. The backend's `config/env.ts` parses
// `process.env` at module load and Zod-fails on missing required fields
// (`GROQ_API_KEY`, `UCP_PROFILE_URL`). Tests don't talk to Groq or any UCP
// endpoint — these values are placeholders so module loading succeeds.
//
// Setting them in a setupFile (instead of inline in each test) ensures they
// land before any `import '../config/env.js'` chain resolves.

process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY ?? 'test-groq-key';
process.env.UCP_PROFILE_URL =
  process.env.UCP_PROFILE_URL ?? 'https://example.test/.well-known/ucp-profile.json';
process.env.UPLOAD_SIGNING_SECRET =
  process.env.UPLOAD_SIGNING_SECRET ?? 'test-upload-secret-32-chars-long-aaa';
process.env.IP_HASH_SALT = process.env.IP_HASH_SALT ?? 'test-ip-hash-salt-32-chars-aaa';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/tmp/agentic-test-uploads';
process.env.DB_PATH = process.env.DB_PATH ?? '/tmp/agentic-test/agentic.db';
