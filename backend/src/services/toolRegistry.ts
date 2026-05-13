import { performance } from 'node:perf_hooks';
import type { ChatCompletionTool } from 'groq-sdk/resources/chat/completions';
import type { ServerEvent } from '../stream/events.js';
import type { Tool, ToolContext } from '../types/tool.js';

export interface DispatchResult {
  assistantString: string;
  events: ServerEvent[];
}

export class ToolRegistry {
  // Tools are stored as `Tool<unknown, unknown>` because they're heterogenous.
  private readonly tools = new Map<string, Tool<unknown, unknown>>();

  register<TArgs, TResult>(tool: Tool<TArgs, TResult>): this {
    this.tools.set(tool.name, tool as Tool<unknown, unknown>);
    return this;
  }

  get(name: string): Tool<unknown, unknown> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool<unknown, unknown>[] {
    return Array.from(this.tools.values());
  }

  /**
   * Convert the registry to the OpenAI-shape `tools[]` array Groq expects.
   */
  toGroqSchema(): ChatCompletionTool[] {
    return this.list().map(
      (t): ChatCompletionTool => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          // groq-sdk's ChatCompletionTool['function']['parameters'] is `Record<string, unknown>`.
          parameters: t.parameters as unknown as Record<string, unknown>,
        },
      }),
    );
  }

  /**
   * Validate, execute, and convert the result of a tool call into events
   * plus the assistant-visible tool message string. On validation failure
   * returns a structured tool message so the LLM can recover.
   */
  async dispatch(
    name: string,
    rawArgs: unknown,
    ctx: ToolContext,
    meta: { toolCallId: string },
  ): Promise<DispatchResult> {
    // polish-round-2 T2.14: per-tool latency log line so Pino-fed dashboards
    // can compute p95 per tool. One log line per dispatch, every path emits.
    const startedAt = performance.now();
    const finish = (ok: boolean, extra: Record<string, unknown> = {}): void => {
      const durationMs = Math.round(performance.now() - startedAt);
      ctx.log.info(
        { tool: name, durationMs, ok, sessionId: ctx.sessionId, ...extra },
        'tool dispatch',
      );
    };

    const tool = this.tools.get(name);
    if (!tool) {
      const msg = `unknown_tool: ${name}`;
      finish(false, { reason: 'unknown_tool' });
      return {
        assistantString: JSON.stringify({ error: msg }),
        events: [
          {
            type: 'tool_status',
            toolCallId: meta.toolCallId,
            name,
            status: 'error',
            errorMessage: msg,
          },
        ],
      };
    }

    let args: unknown;
    try {
      args = tool.parseArgs(rawArgs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid arguments';
      finish(false, { reason: 'invalid_arguments' });
      return {
        assistantString: JSON.stringify({ error: 'invalid_arguments', detail: message }),
        events: [
          {
            type: 'tool_status',
            toolCallId: meta.toolCallId,
            name,
            args: rawArgs,
            status: 'error',
            errorMessage: message,
          },
        ],
      };
    }

    try {
      const result = await tool.execute(args, ctx);
      const out = tool.toEvents(args, result, { toolCallId: meta.toolCallId });
      const errored = out.events.some(
        (e) => e.type === 'tool_status' && e.status === 'error',
      );
      finish(!errored);
      return out;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'tool execution failed';
      ctx.log.error({ err, tool: name }, 'tool execution error');
      finish(false, { reason: 'execute_threw' });
      return {
        assistantString: JSON.stringify({ error: 'tool_error', detail: message }),
        events: [
          {
            type: 'tool_status',
            toolCallId: meta.toolCallId,
            name,
            args,
            status: 'error',
            errorMessage: message,
          },
        ],
      };
    }
  }
}
