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

export class McpError extends Error {
  constructor(message: string, public readonly code?: number, public readonly status?: number) {
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

  const enriched = {
    ...args,
    meta: {
      ...(args.meta as Record<string, unknown> | undefined),
      'ucp-agent': { profile: env.UCP_PROFILE_URL },
    },
  };

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
        throw new McpError(json.error.message, json.error.code);
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
