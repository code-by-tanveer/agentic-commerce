import type { FastifyReply } from 'fastify';
import { serverEventSchema, type ServerEvent } from './events.js';

const PING_INTERVAL_MS = 15_000;

export class SseWriter {
  private readonly reply: FastifyReply;
  private pingTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(reply: FastifyReply) {
    this.reply = reply;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    // Send headers eagerly so the client opens the stream now, not after the
    // first byte of data.
    reply.raw.flushHeaders?.();

    this.pingTimer = setInterval(() => {
      if (this.closed) return;
      try {
        this.reply.raw.write(': ping\n\n');
      } catch {
        // Best effort. If the socket is gone, close() will be invoked separately.
      }
    }, PING_INTERVAL_MS);
    // Don't hold the event loop open just for pings.
    this.pingTimer.unref?.();
  }

  /** Write a typed, Zod-validated server event. */
  write(event: ServerEvent): void {
    if (this.closed) return;
    const parsed = serverEventSchema.safeParse(event);
    if (!parsed.success) {
      // Don't ship a malformed event; surface it via a synthesized error frame.
      const errMsg = `event_validation_failed: ${parsed.error.message}`;
      const fallback = {
        type: 'error' as const,
        code: 'internal' as const,
        message: errMsg,
        retryable: false,
      };
      this.reply.raw.write(this.serialize(fallback));
      return;
    }
    this.reply.raw.write(this.serialize(parsed.data));
  }

  /** Explicit heartbeat (in addition to the auto-ping interval). */
  ping(): void {
    if (this.closed) return;
    try {
      this.reply.raw.write(': ping\n\n');
    } catch {
      // Ignore.
    }
  }

  /** Finalize the stream. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    try {
      this.reply.raw.end();
    } catch {
      // Socket might already be closed.
    }
  }

  private serialize(event: ServerEvent): string {
    return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  }
}
