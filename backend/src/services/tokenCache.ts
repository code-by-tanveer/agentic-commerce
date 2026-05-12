import { request } from 'undici';
import { env, hasJwtAuth } from '../config/env.js';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cache: CachedToken | null = null;

const SKEW_MS = 60_000;

export async function getAccessToken(): Promise<string | null> {
  if (!hasJwtAuth) return null;

  if (cache && cache.expiresAt - SKEW_MS > Date.now()) {
    return cache.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.SHOPIFY_CLIENT_ID!,
    client_secret: env.SHOPIFY_CLIENT_SECRET!,
  });

  const res = await request(env.SHOPIFY_TOKEN_URL!, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    const text = await res.body.text();
    throw new Error(`Token endpoint ${res.statusCode}: ${text}`);
  }

  const json = (await res.body.json()) as { access_token: string; expires_in?: number };
  const ttlMs = (json.expires_in ?? 3600) * 1000;
  cache = { token: json.access_token, expiresAt: Date.now() + ttlMs };
  return cache.token;
}
