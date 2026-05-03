/**
 * Tests for explore tracing integration — verifies that execute() correctly
 * wires startExploreTrace, pre-search child spans, and onToolCall child spans.
 *
 * Uses mock.module to control @pi-ext/shared and ./pre-search so we can
 * assert on the tracing call chain without actually running a subagent.
 */

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { piCodingAgentMock, piTuiMock, typeboxMock } from "@pi-ext/shared/test-mocks";

// ── Mock factories ─────────────────────────────────────────────────────────

const mockChild = mock(() => {
  const span = {
    update: mock(() => span),
    end: mock(() => {}),
    startObservation: mock(() => span),
  };
  return span;
});

const mockObservation = {
  update: mock(() => mockObservation as any),
  end: mock(() => {}),
  startObservation: mockChild,
};

const mockStartExploreTrace = mock(() => ({
  observation: mockObservation,
  child: mockChild,
}));

let capturedRunSubagentOptions: Record<string, unknown> | null = null;

const mockRunSubagent = mock(async (options: any) => {
  capturedRunSubagentOptions = options;
  return {
    exitCode: 0,
    output: "## Summary\nTest result output.",
    model: "test-model",
    usage: {
      input: 50,
      output: 30,
      turns: 2,
      cost: 0.002,
      contextTokens: 80,
    },
  };
});

const mockPreSearch = mock(async () => ({
  text: "\n\n[PRE-SEARCH RESULTS]\nQuery analysis: architecture | entities: auth, user | scope: src",
  stats: {
    indexSize: 10,
    queryTimeMs: 5,
    filesSurfaced: 3,
    fallbackToRipgrep: false,
    hitBuildCap: false,
    rerankUsed: false,
  },
}));

// Set up all mocks (order: shared mocks first, then external deps, then local modules)
mock.module("@pi-ext/shared", () => ({
  resolveRealCwd: (cwd: string) => cwd,
  runSubagent: mockRunSubagent,
  getModel: () => "test-model",
  startExploreTrace: mockStartExploreTrace,
}));
mock.module("./pre-search", () => ({
  preSearch: mockPreSearch,
  invalidateFilePath: () => {},
}));
mock.module("@mariozechner/pi-coding-agent", piCodingAgentMock);
mock.module("@mariozechner/pi-tui", piTuiMock);
mock.module("typebox", typeboxMock);

// Import the extension after mocks are set up
import exploreExtension from "./index";

// ── Test helpers ───────────────────────────────────────────────────────────

function setup() {
  const registeredTools: Array<{ name: string; execute: Function }> = [];
  const mockApi = {
    registerTool: (tool: any) => {
      registeredTools.push(tool);
    },
    registerCommand: mock(() => {}),
    on: mock(() => {}),
  };
  exploreExtension(mockApi as any);
  return { execute: registeredTools[0].execute };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("explore tracing integration", () => {
  beforeEach(() => {
    // Clear all mocks between tests
    mockStartExploreTrace.mockClear();
    mockChild.mockClear();
    mockObservation.update.mockClear();
    mockObservation.end.mockClear();
    mockRunSubagent.mockClear();
    mockPreSearch.mockClear();
    capturedRunSubagentOptions = null;
  });

  it("calls startExploreTrace with query, cwd, and model", async () => {
    const { execute } = setup();

    await execute("call-1", { query: "find auth module" }, undefined, undefined, {
      cwd: "/test/repo",
    });

    expect(mockStartExploreTrace).toHaveBeenCalledTimes(1);
    expect(mockStartExploreTrace).toHaveBeenCalledWith(
      "find auth module",
      "/test/repo",
      "test-model",
    );
  });

  it("creates child spans for pre-search step", async () => {
    const { execute } = setup();

    await execute("call-1", { query: "find auth" }, undefined, undefined, {
      cwd: "/test/repo",
    });

    // At minimum, a "pre-search" child span should be created
    const childNames = mockChild.mock.calls.map((c) => c[0] as string);
    expect(childNames.length).toBeGreaterThan(0);
    expect(childNames.some((n) => n.includes("pre-search") || n.includes("search"))).toBe(true);
  });

  it("passes onToolCall to runSubagent that creates child spans", async () => {
    const { execute } = setup();

    await execute("call-1", { query: "find auth" }, undefined, undefined, {
      cwd: "/test/repo",
    });

    // runSubagent should have been called with onToolCall
    expect(mockRunSubagent).toHaveBeenCalledTimes(1);
    expect(capturedRunSubagentOptions).not.toBeNull();
    expect(typeof (capturedRunSubagentOptions as any)?.onToolCall).toBe("function");

    // Invoke the captured onToolCall with fake tool data
    const onToolCall = (capturedRunSubagentOptions as any).onToolCall as Function;
    const toolCallChildCount = mockChild.mock.calls.length;

    onToolCall({
      toolName: "read",
      argsSummary: "read: src/auth.ts",
      durationMs: 150,
      success: true,
    });

    // A new child span should have been created for this tool call
    expect(mockChild.mock.calls.length).toBeGreaterThan(toolCallChildCount);
    const newCalls = mockChild.mock.calls.slice(toolCallChildCount);
    const toolSpanArg = newCalls.find((c: any) => c[0] === "read");
    expect(toolSpanArg).toBeDefined();

    // The returned span should have been ended
    const toolSpanResult = mockChild.mock.results.find((r: any) => r.value && r.value.end);
    expect(toolSpanResult).toBeDefined();
    expect(toolSpanResult.value.end).toHaveBeenCalledTimes(1);
  });

  it("sets output on the root observation and ends it", async () => {
    const { execute } = setup();

    await execute("call-1", { query: "find auth" }, undefined, undefined, {
      cwd: "/test/repo",
    });

    // observation.update should have been called with output containing usage stats
    expect(mockObservation.update).toHaveBeenCalled();
    const updateCalls = mockObservation.update.mock.calls;
    const outputCall = updateCalls.find(
      (c: any) => c[0]?.output && typeof c[0].output === "object",
    );
    expect(outputCall).toBeDefined();

    // observation.end should have been called
    expect(mockObservation.end).toHaveBeenCalledTimes(1);
  });
});
