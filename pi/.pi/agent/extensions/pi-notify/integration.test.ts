/**
 * Integration tests for the pi-notify extension.
 *
 * Verifies that the extension loads correctly and registers the expected
 * pi extension API hooks (agent_end, session_shutdown).
 */

import { describe, it, expect, mock } from "bun:test";
import { piCodingAgentMock, piTuiMock } from "@pi-ext/shared/test-mocks";

// Mock external dependencies with shared mock factories
mock.module("@mariozechner/pi-coding-agent", piCodingAgentMock);
mock.module("@mariozechner/pi-tui", piTuiMock);

// Mock focus-tracker to avoid accessing process.stdin during init
mock.module("./focus-tracker", () => ({
  enableFocusTracking: mock<() => void>(),
  isFocused: mock<() => boolean>().mockReturnValue(true),
  cleanup: mock<() => void>(),
}));

// Now import the extension after mocks are set up
import notifyExtension from "./index";

describe("pi-notify extension integration", () => {
  it("can be loaded without errors", () => {
    const mockApi = {
      on: mock(() => {}),
    };
    expect(() => notifyExtension(mockApi as any)).not.toThrow();
  });

  it("registers agent_end handler via pi.on()", () => {
    const events: string[] = [];
    const mockApi = {
      on: (event: string) => {
        events.push(event);
      },
    };
    notifyExtension(mockApi as any);
    expect(events).toContain("agent_end");
  });

  it("registers session_shutdown handler via pi.on()", () => {
    const events: string[] = [];
    const mockApi = {
      on: (event: string) => {
        events.push(event);
      },
    };
    notifyExtension(mockApi as any);
    expect(events).toContain("session_shutdown");
  });

  it("registers no tools or commands", () => {
    const mockApi = {
      on: mock(() => {}),
      registerTool: mock(() => {}),
      registerCommand: mock(() => {}),
    };
    notifyExtension(mockApi as any);
    expect(mockApi.registerTool).not.toHaveBeenCalled();
    expect(mockApi.registerCommand).not.toHaveBeenCalled();
  });

  it("declares @pi-ext/shared as a workspace dependency", async () => {
    const pkg = await import("./package.json");
    expect(pkg.dependencies?.["@pi-ext/shared"]).toBe("workspace:*");
  });
});
