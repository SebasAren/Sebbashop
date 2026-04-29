import { describe, it, expect, mock, beforeEach } from "bun:test";
import { piCodingAgentMock, piTuiMock } from "@pi-ext/shared/test-mocks";

mock.module("@mariozechner/pi-coding-agent", piCodingAgentMock);
mock.module("@mariozechner/pi-tui", piTuiMock);

// Import after mocks
import ext from "./index";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("pi-notify extension", () => {
  let events: Map<string, (...args: unknown[]) => void>;
  let pi: { on: ReturnType<typeof mock> };
  let mockIsFocused: ReturnType<typeof mock>;
  let mockEnableFocusTracking: ReturnType<typeof mock>;
  let mockCleanup: ReturnType<typeof mock>;
  const mockNotify = mock<(title: string, body: string) => boolean>().mockReturnValue(true);

  beforeEach(() => {
    mockIsFocused = mock<() => boolean>().mockReturnValue(true);
    mockEnableFocusTracking = mock<() => void>();
    mockCleanup = mock<() => void>();
    mockNotify.mockReset();
    mockNotify.mockReturnValue(true);

    events = new Map();
    pi = {
      on: mock((event: string, handler: (...args: unknown[]) => void) => {
        events.set(event, handler);
      }),
    };
  });

  it("hooks agent_end event", () => {
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });
    expect(events.has("agent_end")).toBe(true);
  });

  it("hooks session_shutdown event", () => {
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });
    expect(events.has("session_shutdown")).toBe(true);
  });

  it("calls enableFocusTracking on initialization", () => {
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });
    expect(mockEnableFocusTracking).toHaveBeenCalledTimes(1);
  });

  it("calls notify when unfocused on agent_end", () => {
    mockIsFocused.mockReturnValue(false);
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const handler = events.get("agent_end")!;
    handler({ type: "agent_end", messages: [] });

    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("skips notify when focused on agent_end", () => {
    mockIsFocused.mockReturnValue(true);
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const handler = events.get("agent_end")!;
    handler({ type: "agent_end", messages: [] });

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("includes turn count in notification body ('Turn N complete')", () => {
    mockIsFocused.mockReturnValue(false);
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const messages = [{ role: "user" }, { role: "assistant" }, { role: "user" }];
    const handler = events.get("agent_end")!;
    handler({ type: "agent_end", messages });

    expect(mockNotify).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/Turn\s+3\b/),
    );
  });

  it("uses descriptive title in notification", () => {
    mockIsFocused.mockReturnValue(false);
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const handler = events.get("agent_end")!;
    handler({ type: "agent_end", messages: [] });

    expect(mockNotify).toHaveBeenCalledWith(expect.stringMatching(/pi/i), expect.any(String));
  });

  it("calls cleanup on session_shutdown", () => {
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const handler = events.get("session_shutdown")!;
    handler({ type: "session_shutdown", reason: "quit" });

    expect(mockCleanup).toHaveBeenCalledTimes(1);
  });

  it("falls back to always-notify when focus tracking unavailable", () => {
    mockEnableFocusTracking.mockImplementation(() => {
      throw new Error("stdin unavailable");
    });
    // isFocused is still the default mock returning true, but fallback
    // should ignore focus state and always notify
    mockIsFocused.mockReturnValue(true);
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const handler = events.get("agent_end")!;
    handler({ type: "agent_end", messages: [] });

    // Should notify even though "focused", because focus tracking failed
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("turn count is 0 for empty messages", () => {
    mockIsFocused.mockReturnValue(false);
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const handler = events.get("agent_end")!;
    handler({ type: "agent_end", messages: [] });

    expect(mockNotify).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/Turn\s+0/));
  });

  it("does not throw when focus tracking errors and agent_end fires", () => {
    mockEnableFocusTracking.mockImplementation(() => {
      throw new Error("stdin unavailable");
    });
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const handler = events.get("agent_end")!;
    expect(() => {
      handler({ type: "agent_end", messages: [] });
    }).not.toThrow();
  });

  it("does not throw on session_shutdown when focus tracking failed", () => {
    mockEnableFocusTracking.mockImplementation(() => {
      throw new Error("stdin unavailable");
    });
    ext(pi, {
      notify: mockNotify,
      enableFocusTracking: mockEnableFocusTracking,
      isFocused: mockIsFocused,
      cleanup: mockCleanup,
    });

    const handler = events.get("session_shutdown")!;
    expect(() => {
      handler({ type: "session_shutdown", reason: "quit" });
    }).not.toThrow();
  });
});
