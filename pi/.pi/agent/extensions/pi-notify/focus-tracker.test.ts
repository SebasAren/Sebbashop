import { describe, it, expect, mock, afterEach, beforeEach } from "bun:test";
import { EventEmitter } from "node:events";

import { isFocused, enableFocusTracking, disableFocusTracking, cleanup } from "./focus-tracker";

// ── Mock stdin/stdout ──────────────────────────────────────────────────────

class MockStdout {
  readonly write = mock<(chunk: string | Uint8Array) => boolean>();
}

class MockStdin extends EventEmitter {
  readonly setRawMode = mock<(mode: boolean) => this>().mockReturnValue(this as any);
  readonly resume = mock<() => this>().mockReturnValue(this as any);
  readonly pause = mock<() => this>().mockReturnValue(this as any);
}

function setupMocks(): { mockStdout: MockStdout; mockStdin: MockStdin } {
  const mockStdout = new MockStdout();
  const mockStdin = new MockStdin();

  Object.defineProperty(process, "stdout", {
    value: mockStdout as any,
    writable: false,
    configurable: true,
  });
  Object.defineProperty(process, "stdin", {
    value: mockStdin as any,
    writable: false,
    configurable: true,
  });

  return { mockStdout, mockStdin };
}

function restoreStreams(): void {
  const { PassThrough } = require("node:stream");
  Object.defineProperty(process, "stdout", {
    value: new PassThrough(),
    writable: false,
    configurable: true,
  });
  Object.defineProperty(process, "stdin", {
    value: new PassThrough(),
    writable: false,
    configurable: true,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("focus-tracker", () => {
  let mockStdout: MockStdout;
  let mockStdin: MockStdin;

  beforeEach(() => {
    const mocks = setupMocks();
    mockStdout = mocks.mockStdout;
    mockStdin = mocks.mockStdin;
  });

  afterEach(() => {
    cleanup();
    restoreStreams();
  });

  it("default state is focused=true", () => {
    expect(isFocused()).toBe(true);
  });

  it("enableFocusTracking writes ESC[?1004h to stdout", () => {
    enableFocusTracking();
    expect(mockStdout.write).toHaveBeenCalledWith("\x1b[?1004h");
  });

  it("enableFocusTracking sets stdin raw mode and resumes", () => {
    enableFocusTracking();
    expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
    expect(mockStdin.resume).toHaveBeenCalled();
  });

  it("disableFocusTracking writes ESC[?1004l to stdout", () => {
    disableFocusTracking();
    expect(mockStdout.write).toHaveBeenCalledWith("\x1b[?1004l");
  });

  it("stdin ESC[I sets focused=true", () => {
    // Start with focused=false by sending focus-out first
    enableFocusTracking();
    mockStdin.emit("data", Buffer.from("\x1b[O"));
    expect(isFocused()).toBe(false);

    // Now send focus-in
    mockStdin.emit("data", Buffer.from("\x1b[I"));
    expect(isFocused()).toBe(true);
  });

  it("stdin ESC[O sets focused=false", () => {
    enableFocusTracking();
    // Default is true, send focus-out
    mockStdin.emit("data", Buffer.from("\x1b[O"));
    expect(isFocused()).toBe(false);
  });

  it("non-focus data on stdin does not change focus state", () => {
    enableFocusTracking();
    expect(isFocused()).toBe(true);

    mockStdin.emit("data", Buffer.from("some random input"));
    expect(isFocused()).toBe(true);
  });

  it("cleanup removes data listener, restores raw mode, and pauses stdin", () => {
    enableFocusTracking();
    expect(mockStdin.listenerCount("data")).toBe(1);

    cleanup();

    expect(mockStdin.listenerCount("data")).toBe(0);
    expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
    expect(mockStdin.pause).toHaveBeenCalled();
  });

  it("enableFocusTracking can be called multiple times without duplicate listeners", () => {
    enableFocusTracking();
    enableFocusTracking();
    expect(mockStdin.listenerCount("data")).toBe(1);
    cleanup();
  });

  it("cleanup is safe to call multiple times", () => {
    expect(() => {
      cleanup();
      cleanup();
      cleanup();
    }).not.toThrow();
  });
});
