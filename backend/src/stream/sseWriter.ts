import { once } from 'node:events';
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
    // Emit an opening comment line so Node treats the response body as
    // started — this is what makes the underlying socket's 'close' event
    // fire reliably when the client disconnects mid-stream (vs being
    // buffered indefinitely until the first real write).
    try {
      reply.raw.write(': open\n\n');
    } catch {
      // best effort
    }

    this.pingTimer = setInterval(() => {
      if (this.closed) return;
      try {
        // ARCH §6 specifies named-event heartbeats (`event: ping`). The
        // earlier comment-form `: ping\n\n` also kept proxies happy, but
        // pinning the spec lets the FE filter on type rather than guess.
        // Pings are tiny; we don't gate them on the drain event (worst case
        // the kernel coalesces). Backpressure handling on real writes below.
        this.reply.raw.write('event: ping\ndata: {}\n\n');
      } catch {
        // Best effort. If the socket is gone, close() will be invoked separately.
      }
    }, PING_INTERVAL_MS);
    // Don't hold the event loop open just for pings.
    this.pingTimer.unref?.();
  }

  /**
   * Write a typed, Zod-validated server event.
   *
   * polish-round-2 T2.6: `reply.raw.write` returns `false` when the kernel
   * send buffer is full; the previous version silently ignored that, which
   * could pile a large `products` payload into Node's internal buffers under
   * a slow consumer. We now `await once(reply.raw, 'drain')` whenever the
   * underlying write signals backpressure. Callers must `await` this method.
   */
  async write(event: ServerEvent): Promise<void> {
    if (this.closed) return;
    const parsed = serverEventSchema.safeParse(event);
    const payload = parsed.success
      ? this.serialize(parsed.data)
      : this.serialize({
          // Don't ship a malformed event; surface a synthesized error frame.
          type: 'error' as const,
          code: 'internal' as const,
          message: `event_validation_failed: ${parsed.error.message}`,
          retryable: false,
        });
    await this.writeRaw(payload);
  }

  /** Explicit heartbeat (in addition to the auto-ping interval). */
  async ping(): Promise<void> {
    if (this.closed) return;
    await this.writeRaw('event: ping\ndata: {}\n\n');
  }

  /**
   * Single point of contact with the underlying socket. Honors backpressure
   * by awaiting `drain` when `write` returns false. Errors are swallowed
   * (closed-socket race) — `close()` is the only authoritative shutdown.
   */
  private async writeRaw(chunk: string): Promise<void> {
    if (this.closed) return;
    try {
      const ok = this.reply.raw.write(chunk);
      if (!ok) {
        // Kernel buffer full. Wait for drain before returning so the caller
        // applies the backpressure to its own producer (Groq stream chunks).
        await once(this.reply.raw, 'drain');
      }
    } catch {
      // Socket closed mid-write. Ignore — the close listener will tear down.
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
