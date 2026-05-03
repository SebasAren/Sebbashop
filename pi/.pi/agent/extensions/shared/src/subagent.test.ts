import { describe, it, expect, afterEach, beforeEach } from "bun:test";

// Test the model resolution and fallback logic independently.
// The full runSubagent retry integration is tested below using mock sessions.

import { getModel, getFallbackModel, shouldUseFallback } from "./model";
import { runSubagent } from "./subagent";
import type { RunSubagentOptions } from "./subagent";

describe("getModel", () => {
  const original = process.env.CHEAP_MODEL;

  afterEach(() => {
    if (original !== undefined) {
      process.env.CHEAP_MODEL = original;
    } else {
      delete process.env.CHEAP_MODEL;
    }
  });

  it("returns undefined when CHEAP_MODEL is not set", () => {
    delete process.env.CHEAP_MODEL;
    expect(getModel()).toBeUndefined();
  });

  it("returns the CHEAP_MODEL value when set", () => {
    process.env.CHEAP_MODEL = "test-model";
    expect(getModel()).toBe("test-model");
  });
});

describe("getFallbackModel", () => {
  const original = process.env.FALLBACK_MODEL;

  afterEach(() => {
    if (original !== undefined) {
      process.env.FALLBACK_MODEL = original;
    } else {
      delete process.env.FALLBACK_MODEL;
    }
  });

  it("returns undefined when FALLBACK_MODEL is not set", () => {
    delete process.env.FALLBACK_MODEL;
    expect(getFallbackModel()).toBeUndefined();
  });

  it("returns the FALLBACK_MODEL value when set", () => {
    process.env.FALLBACK_MODEL = "fallback-model";
    expect(getFallbackModel()).toBe("fallback-model");
  });
});

describe("shouldUseFallback", () => {
  it("returns true for rate limit errors", () => {
    expect(shouldUseFallback("429 Rate limit exceeded")).toBe(true);
    expect(shouldUseFallback("rate_limit_error")).toBe(true);
    expect(shouldUseFallback("Too many requests")).toBe(true);
  });

  it("returns true for server errors", () => {
    expect(shouldUseFallback("503 Service Unavailable")).toBe(true);
    expect(shouldUseFallback("502 Bad Gateway")).toBe(true);
    expect(shouldUseFallback("Internal server error")).toBe(true);
  });

  it("returns true for connection errors", () => {
    expect(shouldUseFallback("ECONNREFUSED")).toBe(true);
    expect(shouldUseFallback("connection reset")).toBe(true);
    expect(shouldUseFallback("ETIMEDOUT")).toBe(true);
  });

  it("returns false for non-transient errors", () => {
    expect(shouldUseFallback("Invalid API key")).toBe(false);
    expect(shouldUseFallback("Permission denied")).toBe(false);
    expect(shouldUseFallback(undefined)).toBe(false);
    expect(shouldUseFallback("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mock session factory for testing runSubagent retry / fallback logic
// ---------------------------------------------------------------------------

interface MockSessionConfig {
  output?: string;
  errorMessage?: string;
  /** Model name to attach to the turn_end event (mirrors SDK behavior). */
  model?: string;
  /** Tool calls to emit as tool_execution_start/tool_execution_end events. */
  toolCalls?: Array<{ toolName: string; args: Record<string, unknown>; isError?: boolean }>;
}

/**
 * Create a mock AgentSession that emits tool_execution_start events (if
 * configured) followed by a single `turn_end` event when `prompt()` is
 * called, producing a result described by `config`.
 */
function createMockSession(config: MockSessionConfig) {
  const listeners: Array<(event: any) => void> = [];

  return {
    subscribe: (cb: (event: any) => void) => {
      listeners.push(cb);
      return () => {
        const idx = listeners.indexOf(cb);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    prompt: async (_query: string) => {
      // Emit tool_execution_start + tool_execution_end for each tool call
      for (const toolCall of config.toolCalls || []) {
        for (const listener of listeners) {
          listener({
            type: "tool_execution_start",
            toolName: toolCall.toolName,
            args: toolCall.args,
          });
        }
        for (const listener of listeners) {
          listener({
            type: "tool_execution_end",
            toolName: toolCall.toolName,
            toolCallId: "mock-call-id",
            result: null,
            isError: toolCall.isError ?? false,
          });
        }
      }
      // Emit turn_end
      for (const listener of listeners) {
        listener({
          type: "turn_end",
          message: {
            role: "assistant",
            errorMessage: config.errorMessage,
            model: config.model,
            content: config.output ? [{ type: "text", text: config.output }] : [],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              cost: { total: 0.001 },
              totalTokens: 15,
            },
          },
        });
      }
    },
    abort: async () => {},
    steer: async () => {},
    dispose: () => {},
    agent: { waitForIdle: async () => {} },
  } as any;
}

/**
 * Create a mock AgentSession whose `prompt()` behavior cycles through
 * a sequence of configs. Each call to `prompt()` produces the next config's
 * result. This is needed for testing session reuse across retries.
 */
function createMockSessionWithBehaviors(configs: MockSessionConfig[]) {
  const listeners: Array<(event: any) => void> = [];
  let promptIndex = 0;

  return {
    subscribe: (cb: (event: any) => void) => {
      listeners.push(cb);
      return () => {
        const idx = listeners.indexOf(cb);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    prompt: async (_query: string) => {
      const config = configs[Math.min(promptIndex, configs.length - 1)];
      promptIndex++;
      for (const listener of listeners) {
        listener({
          type: "turn_end",
          message: {
            role: "assistant",
            errorMessage: config.errorMessage,
            model: config.model,
            content: config.output ? [{ type: "text", text: config.output }] : [],
            usage: {
              input: 10,
              output: 5,
              cacheRead: 0,
              cacheWrite: 0,
              cost: { total: 0.001 },
              totalTokens: 15,
            },
          },
        });
      }
    },
    abort: async () => {},
    steer: async () => {},
    dispose: () => {},
    agent: { waitForIdle: async () => {} },
  } as any;
}

/**
 * Create a `createSession` factory that cycles through a sequence of mock
 * session configs. Each call to the factory produces the next config's session.
 * If the factory is called more times than configs provided, it reuses the
 * last config.
 */
function createMockSessionFactory(configs: MockSessionConfig[]) {
  let index = 0;
  return async (_systemPrompt: string, _cwd: string, _modelName?: string) => {
    const config = configs[Math.min(index, configs.length - 1)];
    index++;
    return createMockSession(config);
  };
}

/** Build minimal RunSubagentOptions with sensible defaults for retry tests. */
function baseOptions(overrides: Partial<RunSubagentOptions> = {}): RunSubagentOptions {
  return {
    cwd: "/tmp",
    query: "test query",
    systemPrompt: "test system prompt",
    createSession: createMockSessionFactory([{ output: "ok" }]),
    model: "test-model",
    // Zero delay so tests run fast
    _retryDelayMs: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// runSubagent retry tests
// ---------------------------------------------------------------------------

describe("runSubagent retry logic", () => {
  // Save/restore FALLBACK_MODEL to isolate tests from the environment
  const savedFallback = process.env.FALLBACK_MODEL;
  afterEach(() => {
    if (savedFallback !== undefined) process.env.FALLBACK_MODEL = savedFallback;
    else delete process.env.FALLBACK_MODEL;
  });

  // Ensure no fallback model leaks from env into these tests unless explicitly set
  beforeEach(() => {
    delete process.env.FALLBACK_MODEL;
  });

  it("returns immediately on first success (no retry)", async () => {
    const createSession = createMockSessionFactory([{ output: "success" }]);

    const result = await runSubagent(baseOptions({ createSession }));

    expect(result.output).toBe("success");
    expect(result.errorMessage).toBeUndefined();
  });

  it("retries on transient failure and returns when second attempt succeeds", async () => {
    // Single session reused across attempts — prompt() fails first, succeeds second
    const session = createMockSessionWithBehaviors([
      { errorMessage: "429 Rate limit exceeded" },
      { output: "recovered" },
    ]);
    const createSession = async () => session;

    const result = await runSubagent(baseOptions({ createSession, maxRetries: 1 }));

    expect(result.output).toBe("recovered");
    expect(result.errorMessage).toBeUndefined();
  });

  it("retries up to maxRetries then gives up", async () => {
    const createSession = createMockSessionFactory([
      { errorMessage: "503 Service Unavailable" },
      { errorMessage: "503 Service Unavailable" },
      { errorMessage: "503 Service Unavailable" },
    ]);

    const result = await runSubagent(baseOptions({ createSession, maxRetries: 2 }));

    // Should have retried twice (3 total attempts) and returned the last failure
    expect(result.errorMessage).toBe("503 Service Unavailable");
  });

  it("does not retry when maxRetries is 0", async () => {
    const createSession = createMockSessionFactory([
      { errorMessage: "429 Rate limit exceeded" },
      { output: "should not reach" },
    ]);

    const result = await runSubagent(baseOptions({ createSession, maxRetries: 0 }));

    // First (and only) attempt failed — no retry
    expect(result.errorMessage).toBe("429 Rate limit exceeded");
  });

  it("does not retry on non-transient errors", async () => {
    const createSession = createMockSessionFactory([
      { errorMessage: "Invalid API key" },
      { output: "should not reach" },
    ]);

    const result = await runSubagent(baseOptions({ createSession, maxRetries: 2 }));

    // "Invalid API key" is not a transient error — no retry
    expect(result.errorMessage).toBe("Invalid API key");
  });

  it("switches to fallback model after retries exhausted", async () => {
    // Primary session fails on both attempts (original + 1 retry)
    const primarySession = createMockSessionWithBehaviors([
      { errorMessage: "429 Rate limit exceeded" },
      { errorMessage: "429 Rate limit exceeded" },
    ]);
    // Fallback session succeeds
    const fallbackSession = createMockSession({
      output: "fallback success",
      model: "fallback-model",
    });
    let callCount = 0;
    const createSession = async () => {
      return callCount++ === 0 ? primarySession : fallbackSession;
    };

    const result = await runSubagent(
      baseOptions({
        createSession,
        maxRetries: 1,
        fallbackModel: "fallback-model",
      }),
    );

    expect(result.output).toBe("fallback success");
    expect(result.errorMessage).toBeUndefined();
  });

  it("does not use fallback when it equals the primary model", async () => {
    const createSession = createMockSessionFactory([
      { errorMessage: "429 Rate limit exceeded" },
      { output: "should not reach" },
    ]);

    const result = await runSubagent(
      baseOptions({
        createSession,
        maxRetries: 0,
        model: "same-model",
        fallbackModel: "same-model",
      }),
    );

    // Fallback is same as primary — no fallback attempt
    expect(result.errorMessage).toBe("429 Rate limit exceeded");
  });

  it("returns fallback failure when fallback also fails", async () => {
    const createSession = createMockSessionFactory([
      { errorMessage: "429 Rate limit exceeded" },
      { errorMessage: "502 Bad Gateway" }, // fallback attempt
    ]);

    const result = await runSubagent(
      baseOptions({
        createSession,
        maxRetries: 0,
        fallbackModel: "fallback-model",
      }),
    );

    // Fallback also failed — return its failure
    expect(result.errorMessage).toBe("502 Bad Gateway");
  });

  it("calls onUpdate with retry message during retries", async () => {
    const createSession = createMockSessionFactory([
      { errorMessage: "429 Rate limit exceeded" },
      { output: "ok" },
    ]);
    const updates: string[] = [];

    await runSubagent(
      baseOptions({
        createSession,
        maxRetries: 1,
        onUpdate: (update) => updates.push(update.text),
      }),
    );

    expect(updates.some((text) => text.includes("Retrying (1/1)"))).toBe(true);
  });

  it("uses default maxRetries of 3 when not specified", async () => {
    // Session reused across retries — fails first 2 times, succeeds on 3rd retry
    // (attempt 0 + retries 1, 2, 3 → but succeeds at retry 2, which is within 3 max)
    const session = createMockSessionWithBehaviors([
      { errorMessage: "429 Rate limit exceeded" },
      { errorMessage: "429 Rate limit exceeded" },
      { output: "ok after default retry" },
    ]);
    const createSession = async () => session;

    const result = await runSubagent(baseOptions({ createSession }));

    expect(result.output).toBe("ok after default retry");
    expect(result.errorMessage).toBeUndefined();
  });

  it("SUBAGENT_MAX_RETRIES env var overrides the default maxRetries", async () => {
    const original = process.env.SUBAGENT_MAX_RETRIES;
    try {
      process.env.SUBAGENT_MAX_RETRIES = "1";

      const session = createMockSessionWithBehaviors([
        { errorMessage: "429 Rate limit exceeded" },
        { output: "ok after env retry" },
      ]);
      const createSession = async () => session;

      const result = await runSubagent(baseOptions({ createSession }));

      expect(result.output).toBe("ok after env retry");
      expect(result.errorMessage).toBeUndefined();
    } finally {
      if (original !== undefined) process.env.SUBAGENT_MAX_RETRIES = original;
      else delete process.env.SUBAGENT_MAX_RETRIES;
    }
  });

  it("SUBAGENT_MAX_RETRIES env var is clamped to >= 0", async () => {
    const original = process.env.SUBAGENT_MAX_RETRIES;
    try {
      process.env.SUBAGENT_MAX_RETRIES = "-5";

      const createSession = createMockSessionFactory([
        { errorMessage: "429 Rate limit exceeded" },
        { output: "should not reach" },
      ]);

      const result = await runSubagent(baseOptions({ createSession }));

      // Negative value clamped to 0 — no retry, returns failure
      expect(result.errorMessage).toBe("429 Rate limit exceeded");
    } finally {
      if (original !== undefined) process.env.SUBAGENT_MAX_RETRIES = original;
      else delete process.env.SUBAGENT_MAX_RETRIES;
    }
  });

  it("reuses the same session across retries (createSession called once)", async () => {
    let sessionCount = 0;
    const session = createMockSessionWithBehaviors([
      { errorMessage: "429 Rate limit exceeded" },
      { output: "recovered via session reuse" },
    ]);
    const createSession = async () => {
      sessionCount++;
      return session;
    };

    await runSubagent(baseOptions({ createSession, maxRetries: 1 }));

    // Session should be created only once and reused for the retry
    expect(sessionCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// onToolCall callback tests
// ---------------------------------------------------------------------------

describe("onToolCall callback", () => {
  it("calls onToolCall with toolName, argsSummary, durationMs, success for each tool call", async () => {
    const calls: Array<{
      toolName: string;
      argsSummary: string;
      durationMs: number;
      success: boolean;
    }> = [];

    const session = createMockSession({
      output: "search complete",
      toolCalls: [
        { toolName: "read", args: { path: "test.ts" } },
        { toolName: "grep", args: { pattern: "function" } },
      ],
    });

    await runSubagent(
      baseOptions({
        createSession: async () => session,
        onToolCall: (info) => calls.push(info),
      }),
    );

    expect(calls.length).toBe(2);

    // First call: read
    expect(calls[0].toolName).toBe("read");
    expect(calls[0].argsSummary).toContain("test.ts");
    expect(typeof calls[0].durationMs).toBe("number");
    expect(calls[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(calls[0].success).toBe(true);

    // Second call: grep
    expect(calls[1].toolName).toBe("grep");
    expect(calls[1].argsSummary).toContain("function");
    expect(typeof calls[1].durationMs).toBe("number");
    expect(calls[1].durationMs).toBeGreaterThanOrEqual(0);
    expect(calls[1].success).toBe(true);
  });

  it("reports success=false when tool_execution_end.isError is true", async () => {
    const calls: Array<{
      toolName: string;
      argsSummary: string;
      durationMs: number;
      success: boolean;
    }> = [];

    const session = createMockSession({
      toolCalls: [{ toolName: "bash", args: { command: "invalid" }, isError: true }],
    });

    await runSubagent(
      baseOptions({
        createSession: async () => session,
        onToolCall: (info) => calls.push(info),
      }),
    );

    expect(calls.length).toBe(1);
    expect(calls[0].toolName).toBe("bash");
    expect(calls[0].success).toBe(false);
  });

  it("does not call onToolCall when no tool calls occur", async () => {
    const calls: Array<{
      toolName: string;
      argsSummary: string;
      durationMs: number;
      success: boolean;
    }> = [];

    const session = createMockSession({
      output: "direct response",
    });

    await runSubagent(
      baseOptions({
        createSession: async () => session,
        onToolCall: (info) => calls.push(info),
      }),
    );

    expect(calls.length).toBe(0);
  });
});
