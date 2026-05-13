import type { FastifyBaseLogger } from 'fastify';
import { request } from 'undici';
import { env } from '../config/env.js';
import { getAccessToken } from './tokenCache.js';

interface JsonRpcOk<T> {
  jsonrpc: '2.0';
  id: number | string;
  result: T;
}

interface JsonRpcErr {
  jsonrpc: '2.0';
  id: number | string;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse<T> = JsonRpcOk<T> | JsonRpcErr;

let nextId = 1;

/**
 * UCP-defined symbolic error code carried in `error.data.code` for
 * negotiation failures (mapped to JSON-RPC `-32001`). Surface-level callers
 * (agent.classifyError) read `McpError.ucpCode` to distinguish retryable
 * transport hiccups from non-retryable client-config faults (a bad profile
 * URL is never going to fix itself on retry).
 */
export type UcpErrorCode =
  | 'invalid_profile_url'
  | 'profile_unreachable'
  | 'profile_malformed'
  | 'version_unsupported'
  | 'capabilities_incompatible';

export class McpError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly status?: number,
    public readonly ucpCode?: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

interface CallOpts {
  retries?: number;
  /**
   * Optional AbortSignal forwarded into the underlying `undici.request` call
   * (and propagated to retry/backoff sleeps). When omitted, behaviour is
   * unchanged from Cycle 1 — callers that don't pass a signal see no diff.
   * See cycle-2.md gating carry-over #1.
   */
  signal?: AbortSignal;
  /**
   * R3-cleanup (architect-code LOW): when supplied, emit a `mcp retry` debug
   * log line on each retry attempt with `{ retryAttempt, status, durationMs }`.
   * Existing callers don't need to thread anything — the parameter is
   * optional and the absence is the prior silent-retry behaviour.
   */
  log?: FastifyBaseLogger;
}

export async function callTool<T = unknown>(
  name: string,
  args: Record<string, unknown>,
  opts: CallOpts = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const signal = opts.signal;
  const log = opts.log;

  // UCP 2026-04-08 catalog/mcp binding shape normalisation. Two protocol-level
  // adjustments live here (not in `catalog.ts`) so every caller of `callTool`
  // gets spec-compliant requests without each one re-deriving the shape:
  //
  //   1. `meta.ucp-agent.profile` is required on EVERY request (verified
  //      against Shopify on 2026-05-13 — even `tools/list` errors with
  //      -32001 `invalid_profile_url` without it). The spec places this at
  //      `params.arguments.meta`, NOT `params.meta` or `params._meta`
  //      (probed: both alternatives return -32001).
  //
  //   2. `search_catalog.limit` must live inside `catalog.pagination.limit`,
  //      not at the top of `catalog`. Shopify SILENTLY ignores a top-level
  //      `limit` and always returns the default page size (10). Verified
  //      empirically: `{catalog: {query, limit: 3}}` → 10 products;
  //      `{catalog: {query, pagination: {limit: 3}}}` → 3 products. This was
  //      a real bug, not just a spec-conformance nit: every `searchCatalog`
  //      call was over-fetching by ~25%.
  //
  // Callers (`catalog.ts`) keep their ergonomic `{catalog: {query, limit}}`
  // surface; the wire shape is corrected here.
  const enriched: Record<string, unknown> = {
    ...args,
    meta: {
      ...(args.meta as Record<string, unknown> | undefined),
      'ucp-agent': { profile: env.UCP_PROFILE_URL },
    },
  };
  if (name === 'search_catalog' && enriched.catalog && typeof enriched.catalog === 'object') {
    const cat = { ...(enriched.catalog as Record<string, unknown>) };
    if ('limit' in cat || 'cursor' in cat) {
      const pagination = { ...((cat.pagination as Record<string, unknown> | undefined) ?? {}) };
      if ('limit' in cat && pagination.limit === undefined) pagination.limit = cat.limit;
      if ('cursor' in cat && pagination.cursor === undefined) pagination.cursor = cat.cursor;
      delete cat.limit;
      delete cat.cursor;
      cat.pagination = pagination;
      enriched.catalog = cat;
    }
  }

  const payload = {
    jsonrpc: '2.0' as const,
    id: nextId++,
    method: 'tools/call',
    params: { name, arguments: enriched },
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new McpError('aborted', undefined, undefined);
    const attemptStart = Date.now();
    try {
      const token = await getAccessToken();
      const res = await request(env.CATALOG_MCP_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (res.statusCode >= 500 || res.statusCode === 429) {
        const text = await res.body.text();
        lastErr = new McpError(`MCP ${res.statusCode}: ${text}`, undefined, res.statusCode);
        // R3-cleanup (architect-code LOW): structured retry observability.
        log?.debug?.(
          {
            tool: name,
            retryAttempt: attempt + 1,
            status: res.statusCode,
            durationMs: Date.now() - attemptStart,
          },
          'mcp retry',
        );
        await delay(backoff(attempt), signal);
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        const text = await res.body.text();
        throw new McpError(`MCP ${res.statusCode}: ${text}`, undefined, res.statusCode);
      }

      const json = (await res.body.json()) as JsonRpcResponse<T>;
      if ('error' in json) {
        // UCP error codes (overview spec §"Error Codes"):
        //   -32001  Discovery / negotiation failure. `error.data.code` is one
        //           of: invalid_profile_url, profile_unreachable,
        //           profile_malformed, version_unsupported. These are
        //           CLIENT-config faults — retrying without changing the
        //           profile/version won't help.
        //   -32000  Transport-level (auth/rate-limit/unavailable). May carry
        //           `error.data.retry_after` for 429/503.
        //   -32602  Invalid params (JSON-RPC standard).
        //   -32603  Internal error (server-side; safe to retry).
        const data = (json.error.data ?? null) as { code?: string; retry_after?: number } | null;
        throw new McpError(
          json.error.message,
          json.error.code,
          undefined,
          data?.code,
          data?.retry_after,
        );
      }
      return json.result;
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) throw err;
      if (attempt === retries) throw err;
      // R3-cleanup (architect-code LOW): structured retry observability for
      // the transport-error branch (no HTTP status, so log `status: undefined`).
      log?.debug?.(
        {
          tool: name,
          retryAttempt: attempt + 1,
          status: (err as { status?: number } | undefined)?.status,
          durationMs: Date.now() - attemptStart,
        },
        'mcp retry',
      );
      await delay(backoff(attempt), signal);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('MCP call failed');
}

function backoff(attempt: number): number {
  return Math.min(2_000, 200 * Math.pow(2, attempt)) + Math.floor(Math.random() * 100);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new McpError('aborted'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new McpError('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
