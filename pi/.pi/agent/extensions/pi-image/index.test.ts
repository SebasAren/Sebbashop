import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { piCodingAgentMock, piTuiMock, typeboxMock } from "@pi-ext/shared/test-mocks";

mock.module("@mariozechner/pi-coding-agent", piCodingAgentMock);
mock.module("@mariozechner/pi-tui", piTuiMock);
mock.module("typebox", typeboxMock);

import ext from "./index";

// ── Helpers ────────────────────────────────────────────────────────────────

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const ORIGINAL_FETCH = globalThis.fetch;
const mockFetch = mock<(url: string, options?: any) => Promise<Response>>();

function makeTheme() {
  return {
    fg: (_color: string, text: string) => text,
    bg: () => "",
    bold: (text: string) => text,
  };
}

describe("pi-image extension", () => {
  let registeredTools: any[];
  let tool: any;
  let savedFiles: string[];

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    mockFetch.mockReset();
    globalThis.fetch = mockFetch;

    registeredTools = [];
    const mockApi = {
      registerTool: (t: any) => registeredTools.push(t),
      registerCommand: mock(() => {}),
    };
    ext(mockApi as any);
    tool = registeredTools[0];
    savedFiles = [];
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete process.env.OPENROUTER_API_KEY;

    for (const file of savedFiles) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  describe("registration", () => {
    it("registers a tool named 'generate_image'", () => {
      expect(registeredTools).toHaveLength(1);
      expect(registeredTools[0].name).toBe("generate_image");
    });

    it("has renderCall and renderResult functions", () => {
      expect(typeof tool.renderCall).toBe("function");
      expect(typeof tool.renderResult).toBe("function");
    });
  });

  describe("renderCall", () => {
    it("shows prompt and quality in the rendered text", () => {
      const result = tool.renderCall(
        { prompt: "a sunset over mountains", quality: "best" },
        makeTheme(),
        {},
      );

      expect(result.text).toContain("Generate Image");
      expect(result.text).toContain("a sunset over mountains");
      expect(result.text).toContain("best");
    });

    it("shows default quality as fast when not specified", () => {
      const result = tool.renderCall({ prompt: "a cat" }, makeTheme(), {});

      expect(result.text).toContain("a cat");
      expect(result.text).toContain("fast");
    });

    it("reuses context.lastComponent when available", () => {
      const existing = { setText: mock(() => {}) };
      const result = tool.renderCall({ prompt: "test" }, makeTheme(), {
        lastComponent: existing as any,
      });

      expect(result).toBe(existing);
      expect(existing.setText).toHaveBeenCalled();
    });
  });

  describe("renderResult", () => {
    it("shows file path and metadata", () => {
      const result = tool.renderResult(
        {
          content: [
            { type: "text" as const, text: "Generated image saved to /tmp/pi-img-abc123.png" },
          ],
          details: {
            model: "flux.2-max",
            aspectRatio: "16:9",
            sizeBytes: 12345,
            path: "/tmp/pi-img-abc123.png",
          },
        },
        { expanded: true, isPartial: false },
        makeTheme(),
        {},
      );

      expect(result.text).toContain("/tmp/pi-img-abc123.png");
      expect(result.text).toContain("flux.2-max");
      expect(result.text).toContain("16:9");
    });

    it("reuses context.lastComponent when available", () => {
      const existing = { setText: mock(() => {}) };
      const result = tool.renderResult(
        {
          content: [{ type: "text" as const, text: "Generated image saved" }],
          details: { model: "test", aspectRatio: "1:1", sizeBytes: 100, path: "/tmp/test.png" },
        },
        { expanded: true, isPartial: false },
        makeTheme(),
        { lastComponent: existing as any },
      );

      expect(result).toBe(existing);
      expect(existing.setText).toHaveBeenCalled();
    });
  });

  describe("execute — happy path", () => {
    it("returns file path and metadata on successful image generation", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Here's your image",
                  images: [
                    {
                      type: "image_url",
                      image_url: { url: PNG_DATA_URL },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await tool.execute(
        "call-1",
        { prompt: "a sunset" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      // Content text mentions the saved path
      expect(result.content[0].text).toMatch(/\/tmp\/pi-img-[a-f0-9]+\.png/);
      // Content includes inline image data (same flow as read tool)
      expect(result.content[1]).toEqual({
        type: "image",
        data: expect.any(String),
        mimeType: "image/png",
      });
      expect(result.content[1].data.length).toBeGreaterThan(0);
      // Details contain model, aspectRatio, sizeBytes, path
      expect(result.details.model).toBeTruthy();
      expect(result.details.aspectRatio).toBe("1:1");
      expect(typeof result.details.sizeBytes).toBe("number");
      expect(result.details.sizeBytes).toBeGreaterThan(0);
      expect(result.details.path).toMatch(/\/tmp\/pi-img-[a-f0-9]+\.png/);
      // File actually exists on disk
      expect(existsSync(result.details.path)).toBe(true);

      savedFiles.push(result.details.path);
    });

    it("uses fast model and 1:1 aspect ratio by default", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Here's your image",
                  images: [
                    {
                      type: "image_url",
                      image_url: { url: PNG_DATA_URL },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await tool.execute(
        "call-2",
        { prompt: "test" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      expect(result.details.aspectRatio).toBe("1:1");
      // Default quality is "fast", model should be IMAGE_MODEL_FAST or its default
      expect(result.details.model).toBe(
        process.env.IMAGE_MODEL_FAST || "google/gemini-3.1-flash-image-preview",
      );

      savedFiles.push(result.details.path);
    });

    it("throws when no images are returned", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "No image generated",
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      await expect(
        tool.execute(
          "call-3",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow("No images generated");
    });
  });

  describe("execute — quality & aspect ratio", () => {
    it("uses best model when quality is 'best'", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Here's your image",
                  images: [
                    {
                      type: "image_url",
                      image_url: { url: PNG_DATA_URL },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await tool.execute(
        "call-best",
        { prompt: "a sunset", quality: "best" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      expect(result.details.model).toBe(
        process.env.IMAGE_MODEL_BEST || "google/gemini-3-pro-image-preview",
      );

      savedFiles.push(result.details.path);
    });

    it("passes aspect_ratio 16:9 to the API", async () => {
      let requestBody: any;
      mockFetch.mockImplementation(async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Here's your image",
                  images: [
                    {
                      type: "image_url",
                      image_url: { url: PNG_DATA_URL },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const result = await tool.execute(
        "call-ar",
        { prompt: "a sunset", aspect_ratio: "16:9" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      // Request body should contain the aspect ratio
      expect(requestBody!.image_config).toEqual({ aspect_ratio: "16:9" });
      // Result details should reflect the passed aspect ratio
      expect(result.details.aspectRatio).toBe("16:9");

      savedFiles.push(result.details.path);
    });

    it("uses quality env var overrides", async () => {
      // Set custom env var overrides
      const origFast = process.env.IMAGE_MODEL_FAST;
      const origBest = process.env.IMAGE_MODEL_BEST;
      process.env.IMAGE_MODEL_FAST = "custom/fast-model";
      process.env.IMAGE_MODEL_BEST = "custom/best-model";

      const requestBodies: any[] = [];
      mockFetch.mockImplementation(async (_url, options) => {
        requestBodies.push(JSON.parse(options.body));
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Here's your image",
                  images: [
                    {
                      type: "image_url",
                      image_url: { url: PNG_DATA_URL },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const resultFast = await tool.execute(
        "call-env-1",
        { prompt: "test", quality: "fast" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      const resultBest = await tool.execute(
        "call-env-2",
        { prompt: "test", quality: "best" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      expect(requestBodies[0].model).toBe("custom/fast-model");
      expect(requestBodies[1].model).toBe("custom/best-model");

      // Clean up env
      process.env.IMAGE_MODEL_FAST = origFast;
      process.env.IMAGE_MODEL_BEST = origBest;

      savedFiles.push(resultFast.details.path);
      savedFiles.push(resultBest.details.path);
    });
  });

  describe("execute — inline image", () => {
    it("includes base64 image in the content array for framework rendering", async () => {
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Here's your image",
                  images: [
                    {
                      type: "image_url",
                      image_url: { url: PNG_DATA_URL },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      const result = await tool.execute(
        "call-inline",
        { prompt: "test" },
        new AbortController().signal,
        mock(() => {}),
        {},
      );

      // Result content has two entries: text + inline image
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe("text");
      expect(result.content[1].type).toBe("image");
      expect(result.content[1].mimeType).toBe("image/png");
      expect(result.content[1].data).toMatch(/^[A-Za-z0-9+/=]+$/);

      savedFiles.push(result.details.path);
    });
  });

  describe("execute — error handling", () => {
    it("throws on network error", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      await expect(
        tool.execute(
          "call-4",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow();
    });

    it("throws when OPENROUTER_API_KEY is missing", async () => {
      delete process.env.OPENROUTER_API_KEY;

      await expect(
        tool.execute(
          "call-5",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow(/OPENROUTER_API_KEY/);
    });

    it("throws on non-OK API response", async () => {
      mockFetch.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

      await expect(
        tool.execute(
          "call-6",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        ),
      ).rejects.toThrow(/OpenRouter image request failed/);
    });

    it("does not return error as content — always throws", async () => {
      mockFetch.mockRejectedValue(new Error("Network failure"));

      let caught = false;
      try {
        await tool.execute(
          "call-7",
          { prompt: "a sunset" },
          new AbortController().signal,
          mock(() => {}),
          {},
        );
      } catch {
        caught = true;
      }

      expect(caught).toBe(true);
    });
  });
});
