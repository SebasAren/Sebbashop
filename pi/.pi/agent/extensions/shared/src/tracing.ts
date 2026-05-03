/**
 * Tracing module — OpenTelemetry tracing via Langfuse.
 *
 * Provides a singleton `initTracing()` that lazily initializes the
 * OpenTelemetry SDK with LangfuseSpanProcessor when LANGFUSE env vars
 * are set. When env vars are missing, returns no-op stubs that safely
 * swallow all calls (no throwing, no memory leaks).
 *
 * Usage:
 *   const { startObservation } = initTracing();
 *   const span = startObservation("my-operation", { input: { ... } });
 *   // ... do work ...
 *   span.update({ output: { ... } });
 *   span.end();
 */

import { spawnSync } from "node:child_process";
import { startObservation as langfuseStartObservation } from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

// ── Types ─────────────────────────────────────────────────────────────────

/** Minimal observation shape compatible with Langfuse span/tool/generation. */
export interface ObservationLike {
  update: (attrs: Record<string, unknown>) => ObservationLike;
  end: () => void;
  startObservation: (
    name: string,
    attrs?: Record<string, unknown>,
    opts?: { asType?: string },
  ) => ObservationLike;
}

/** Return type of initTracing(). */
export interface TracingInstance {
  startObservation: (
    name: string,
    attrs?: Record<string, unknown>,
    opts?: { asType?: string },
  ) => ObservationLike;
}

// ── No-op stubs ───────────────────────────────────────────────────────────

const noopSpan: ObservationLike = {
  update: () => noopSpan,
  end: () => {},
  startObservation: () => noopSpan,
};

const noopStartObservation = (): ObservationLike => noopSpan;

const noopTracing: TracingInstance = {
  startObservation: noopStartObservation,
};

// ── Singleton state (cached per mode) ─────────────────────────────────────

let realTracing: TracingInstance | undefined;

// ── Helper ─────────────────────────────────────────────────────────────────

function hasEnvVars(): boolean {
  return !!(
    process.env.LANGFUSE_PUBLIC_KEY &&
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_HOST
  );
}

// ── Real tracer initialization ────────────────────────────────────────────

let sdk: NodeSDK | undefined;

function initRealTracing(): TracingInstance {
  if (realTracing) return realTracing;

  sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_HOST,
      }),
    ],
  });

  try {
    sdk.start();
  } catch {
    // Langfuse SDK warns but doesn't throw on missing env vars in the processor.
    // Guard against unexpected initialization errors.
  }

  realTracing = {
    startObservation: langfuseStartObservation as TracingInstance["startObservation"],
  };

  return realTracing;
}

// ── Branch resolution (cached per cwd) ──────────────────────────────────

const cachedBranches = new Map<string, string>();
const BRANCH_UNKNOWN = "unknown";

/**
 * Resolve the current git branch name, cached per cwd so that exploring
 * multiple repos in the same process gets correct branch for each.
 * Falls back to "unknown" on any error (no git repo, ENOENT, etc.).
 */
function getBranch(cwd: string): string {
  const cached = cachedBranches.get(cwd);
  if (cached) return cached;

  try {
    const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      encoding: "buffer",
    });
    if (result.status === 0 && result.stdout && result.stdout.length > 0) {
      const branch = result.stdout.toString().trim();
      cachedBranches.set(cwd, branch);
      return branch;
    }
  } catch {
    // fall through to unknown
  }

  cachedBranches.set(cwd, BRANCH_UNKNOWN);
  return BRANCH_UNKNOWN;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Return type of startExploreTrace().
 */
export interface ExploreTraceResult {
  /** The root observation span for the explore call. */
  observation: ObservationLike;
  /**
   * Create a child observation under the root.
   * Pass name and optional attributes (e.g., { input, metadata }).
   */
  child: (name: string, attrs?: Record<string, unknown>) => ObservationLike;
}

/**
 * Create a root explore trace observation.
 *
 * Calls initTracing() internally, resolves the git branch, and creates a
 * root span named "explore" with the query, cwd, model, and branch as
 * attributes. Returns the observation and a child helper.
 *
 * The branch is resolved from `git rev-parse --abbrev-ref HEAD` and
 * cached per cwd so that multiple repos in one process each get the
 * correct branch.
 */
export function startExploreTrace(query: string, cwd: string, model: string): ExploreTraceResult {
  const tracing = initTracing();
  const branch = getBranch(cwd);

  const observation = tracing.startObservation("explore", {
    input: { query },
    metadata: { cwd, model, branch },
  });

  const child = (name: string, attrs?: Record<string, unknown>): ObservationLike =>
    observation.startObservation(name, attrs);

  return { observation, child };
}

/**
 * Initialize tracing (lazy singleton).
 *
 * Returns a no-op tracer when LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY,
 * and LANGFUSE_HOST are not all set. Otherwise initializes the OpenTelemetry
 * SDK with LangfuseSpanProcessor and returns the real Langfuse SDK binding.
 *
 * The real tracer is a singleton: the SDK is initialized only once.
 * The no-op path returns a shared constant directly — no lazy-init wrappers needed.
 *
 * Safe to call multiple times — only initializes SDK once.
 */
export function initTracing(): TracingInstance {
  if (hasEnvVars()) {
    return initRealTracing();
  }

  return noopTracing;
}
