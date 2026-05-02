import { describe, it, expect, mock } from "bun:test";
import { piCodingAgentMock, typeboxMock } from "../shared/src/test-mocks";

// Mock external dependencies
mock.module("playwright", () => ({
  chromium: {
    launch: mock(() =>
      Promise.resolve({
        newPage: mock(() =>
          Promise.resolve({
            setContent: mock(() => Promise.resolve()),
            screenshot: mock(() => Promise.resolve(Buffer.from("fake-png"))),
            setDefaultTimeout: mock(() => {}),
          }),
        ),
        close: mock(() => Promise.resolve()),
      }),
    ),
  },
}));

mock.module("highlight.js", () => ({
  default: {
    highlightElement: mock(() => {}),
    configure: mock(() => {}),
  },
}));

mock.module("marked", () => ({
  marked: {
    parse: mock((text: string) => `<p>${text}</p>`),
  },
}));

mock.module("./copyToClipboard", () => ({
  copyToClipboard: mock(() => {}),
}));

mock.module("./getLastAssistantMessage", () => ({
  getLastAssistantMessage: (entries: any[]) => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type !== "message") continue;
      if (entry.message.role !== "assistant") continue;
      const textBlocks = entry.message.content.filter((b: any) => b.type === "text");
      if (textBlocks.length === 0) continue;
      return textBlocks.map((b: any) => b.text).join("\n");
    }
    return null;
  },
}));

mock.module("@mariozechner/pi-coding-agent", piCodingAgentMock);
mock.module("typebox", typeboxMock);

import extractExtension from "./index";

describe("extract-share integration", () => {
  it("can be loaded without errors", () => {
    const mockApi = {
      registerCommand: mock(() => {}),
      registerShortcut: mock(() => {}),
    };
    expect(() => extractExtension(mockApi as any)).not.toThrow();
  });

  it("registers a command named 'extract'", () => {
    const registered: { name: string }[] = [];
    const mockApi = {
      registerCommand: (name: string, _opts: any) => registered.push({ name }),
      registerShortcut: mock(() => {}),
    };
    extractExtension(mockApi as any);
    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe("extract");
  });

  it("registers a shortcut 'ctrl+shift+e'", () => {
    const registered: { shortcut: string }[] = [];
    const mockApi = {
      registerCommand: mock(() => {}),
      registerShortcut: (shortcut: string, _opts: any) => registered.push({ shortcut }),
    };
    extractExtension(mockApi as any);
    expect(registered).toHaveLength(1);
    expect(registered[0].shortcut).toBe("ctrl+shift+e");
  });

  it("command handler resolves without error when invoked with full pipeline", async () => {
    let handler: Function = () => {};
    const notifyMock = mock(() => {});
    const mockApi = {
      registerCommand: (_name: string, opts: any) => {
        handler = opts.handler;
      },
      registerShortcut: mock(() => {}),
    };
    extractExtension(mockApi as any);

    const mockCtx = {
      sessionManager: {
        getBranch: () => [
          {
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Integration test message" }],
            },
          },
        ],
      },
      hasUI: true,
      ui: { notify: notifyMock },
    };

    await expect(handler("", mockCtx as any)).resolves.toBeUndefined();
    expect(notifyMock).toHaveBeenCalledWith("Message copied to clipboard", "info");
  });

  it("shows error when no assistant message is found", async () => {
    let handler: Function = () => {};
    const notifyMock = mock(() => {});
    const mockApi = {
      registerCommand: (_name: string, opts: any) => {
        handler = opts.handler;
      },
      registerShortcut: mock(() => {}),
    };
    extractExtension(mockApi as any);

    const mockCtx = {
      sessionManager: { getBranch: () => [] },
      hasUI: true,
      ui: { notify: notifyMock },
    };

    await handler("", mockCtx as any);
    expect(notifyMock).toHaveBeenCalledWith("No assistant message found to extract", "error");
  });
});
