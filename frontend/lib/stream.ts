// SSE-over-POST client for /api/chat. Uses @microsoft/fetch-event-source because
// the native EventSource is GET-only and we need to POST the conversation
// history. ADR-0002 covers the why.
//
// Yields validated ServerEvent objects. Ignores `ping` heartbeat frames. On
// network drop mid-stream throws a typed StreamError; we DO NOT auto-reconnect
// (resuming a half-finished agent turn is incorrect — also ADR-0002).

import {
  fetchEventSource,
  type EventSourceMessage,
} from '@microsoft/fetch-event-source';
import {
  EVENT_SCHEMAS,
  type ServerEvent,
  type ServerEventType,
} from './events';

export interface ChatRequestMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequestBody {
  sessionId?: string;
  messages: ChatRequestMessage[];
}

export type StreamErrorKind =
  | 'network'
  | 'http'
  | 'parse'
  | 'aborted';

export class StreamError extends Error {
  constructor(
    public readonly kind: StreamErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'StreamError';
  }
}

// fetch-event-source throws this on non-2xx responses to signal "stop, don't
// retry". We re-throw our own typed error.
class FatalError extends Error {}

/**
 * Open a streaming chat. Yields ServerEvents in arrival order. The consumer
 * is responsible for finalizing UI state on `done` or surfacing a retry
 * affordance on throw.
 */
export async function* streamChat(
  body: ChatRequestBody,
  signal?: AbortSignal,
): AsyncIterable<ServerEvent> {
  // Bridge from the callback-style fetch-event-source into an async iterator.
  const queue: ServerEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  let thrown: unknown = null;

  function push(ev: ServerEvent): void {
    queue.push(ev);
    resolveNext?.();
    resolveNext = null;
  }

  function finish(err?: unknown): void {
    if (err !== undefined) thrown = err;
    done = true;
    resolveNext?.();
    resolveNext = null;
  }

  // Kick off the fetch. We deliberately do not await this promise inside the
  // generator body — the iterator pumps events while the request streams.
  const requestPromise = fetchEventSource('/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
    signal,
    openWhenHidden: true,
    async onopen(response) {
      if (
        response.ok &&
        response.headers.get('content-type')?.includes('text/event-stream')
      ) {
        return;
      }
      throw new FatalError(`HTTP ${response.status}`);
    },
    onmessage(msg: EventSourceMessage) {
      // Heartbeat — discard silently.
      if (msg.event === 'ping') return;
      // No event line → ignore (some proxies inject blank keep-alives).
      if (!msg.event) return;
      const schema = (EVENT_SCHEMAS as Record<string, (typeof EVENT_SCHEMAS)[ServerEventType]>)[
        msg.event
      ];
      if (!schema) {
        // Unknown event type — log + drop; safer than crashing the stream.
        // R3-cleanup (architect-code LOW): fixed prefix for greppability —
        // searching `agentic.stream.unknown_event` in browser logs surfaces
        // every wire-drift incident in one query.
        // eslint-disable-next-line no-console
        console.warn('[agentic.stream.unknown_event]', msg.event);
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(msg.data);
      } catch {
        finish(new StreamError('parse', `bad JSON in event ${msg.event}`));
        return;
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        finish(
          new StreamError(
            'parse',
            `event ${msg.event} failed validation: ${parsed.error.message}`,
          ),
        );
        return;
      }
      push(parsed.data as ServerEvent);
    },
    onclose() {
      finish();
    },
    onerror(err) {
      // Throwing here stops retries. fetch-event-source otherwise retries
      // forever, which violates our "no auto-reconnect" rule.
      if (err instanceof FatalError) {
        throw new StreamError('http', err.message);
      }
      if (signal?.aborted) {
        throw new StreamError('aborted', 'aborted');
      }
      throw new StreamError('network', err?.message ?? 'connection lost');
    },
  })
    .catch((err) => {
      finish(err);
    });

  try {
    // Drain the queue, awaiting more events as needed.
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
    }
    if (thrown) {
      throw thrown instanceof StreamError
        ? thrown
        : new StreamError('network', (thrown as Error)?.message ?? 'stream error');
    }
  } finally {
    // Make sure the underlying request settles before the generator returns,
    // so the caller's signal-based cancellation propagates cleanly.
    await requestPromise.catch(() => {});
  }
}
