/**
 * Tests for startExploreTrace — the explore root-span helper.
 *
 * Separate test file from tracing.test.ts because it needs additional mocks
 * (node:child_process, @langfuse/tracing) that would affect the initTracing tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, mock } from "bun:test";

// Track startObservation calls from the mocked @langfuse/tracing
const startObservationCalls: Array<{ name: string; attrs: Record<string, unknown> }> = [];

// Create a reusable mock observation span
const testObservation = {
  update: () => testObservation,
  end: () => {},
  startObservation: (name: string, attrs: Record<string, unknown>) => {
    startObservationCalls.push({ name, attrs });
    return testObservation;
  },
};

// Mock OTel SDK modules (prevent real SDK init before importing tracing)
mock.module("@opentelemetry/sdk-node", () => ({
  NodeSDK: class {
    start() {}
  },
}));

mock.module("@langfuse/otel", () => ({
  LangfuseSpanProcessor: class {},
}));

// Mock child_process to prevent real git calls
mock.module("node:child_process", () => ({
  spawnSync: () => ({
    stdout: Buffer.from("feature-branch\n"),
    status: 0,
  }),
}));

// Mock @langfuse/tracing to capture startObservation call arguments
mock.module("@langfuse/tracing", () => ({
  startObservation: (name: string, attrs: Record<string, unknown>) => {
    startObservationCalls.push({ name, attrs });
    return testObservation;
  },
}));

import { startExploreTrace } from "./tracing";

describe("startExploreTrace", () => {
  beforeAll(() => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test-key";
    process.env.LANGFUSE_SECRET_KEY = "sk-test-key";
    process.env.LANGFUSE_HOST = "https://example.com";
  });

  afterAll(() => {
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_HOST;
  });

  beforeEach(() => {
    startObservationCalls.length = 0;
  });

  it("creates a root observation named 'explore' with query, cwd, model, and branch", () => {
    const result = startExploreTrace("find auth logic", "/repo/src", "gpt-4o-mini");

    // Should have created exactly one root observation
    expect(startObservationCalls.length).toBe(1);
    expect(startObservationCalls[0].name).toBe("explore");

    const attrs = startObservationCalls[0].attrs;
    expect(attrs).toMatchObject({
      input: { query: "find auth logic" },
      metadata: {
        cwd: "/repo/src",
        model: "gpt-4o-mini",
        branch: "feature-branch",
      },
    });

    expect(result.observation).toBeDefined();
    expect(typeof result.observation.update).toBe("function");
    expect(typeof result.observation.end).toBe("function");
    expect(typeof result.observation.startObservation).toBe("function");
  });

  it("returns a child helper that creates child observations", () => {
    const result = startExploreTrace("test", "/tmp", "model");

    expect(typeof result.child).toBe("function");

    const childSpan = result.child("query-planning", { input: { query: "test" } });
    expect(childSpan).toBeDefined();

    // Should have created root + child observations
    expect(startObservationCalls.length).toBe(2);
    expect(startObservationCalls[1].name).toBe("query-planning");

    // child helper should return an observation-like object
    expect(typeof childSpan.update).toBe("function");
    expect(typeof childSpan.end).toBe("function");
    expect(typeof childSpan.startObservation).toBe("function");
  });

  it("resolves branch from git rev-parse --abbrev-ref HEAD", () => {
    startExploreTrace("test query", "/tmp/cwd", "test-model");

    expect(startObservationCalls.length).toBe(1);
    const metadata = startObservationCalls[0].attrs.metadata as Record<string, unknown>;
    expect(metadata.branch).toBe("feature-branch");
  });
});
