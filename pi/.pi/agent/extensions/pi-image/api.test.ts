/**
 * Tests for the OpenRouter Image Generation API Client.
 *
 * These tests mock the OpenAI SDK (openai package) to verify that
 * generateImageApi sends the correct parameters and parses responses.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ── Mock OpenAI SDK ──────────────────────────────────────────────────────
// Mock before importing api.ts so that `new OpenAI()` uses our mock class.

const mockCreate = mock<(params: any) => any>();
let openAIConstructorArgs: { apiKey: string; baseURL?: string } | null = null;

mock.module("openai", () => ({
  default: class OpenAI {
    apiKey: string;
    baseURL: string | undefined;
    chat: { completions: { create: typeof mockCreate } };

    constructor(options: { apiKey: string; baseURL?: string }) {
      openAIConstructorArgs = options;
      this.apiKey = options.apiKey;
      this.baseURL = options.baseURL;
      this.chat = {
        completions: {
          create: mockCreate,
        },
      };
    }
  },
}));

// ── Import after mock setup ──────────────────────────────────────────────

import { generateImageApi } from "./api";

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a mock OpenRouter response shape that matches what
 * the OpenAI SDK returns for image-generation chat completions.
 */
function mockResponse(images?: Array<{ image_url: { url: string } }>): Record<string, any> {
  return {
    id: "chatcmpl-test-123",
    object: "chat.completion",
    created: 1_234_567_890,
    model: "test-model",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: {
          role: "assistant",
          content: "Here's your generated image",
          ...(images ? { images } : {}),
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("generateImageApi", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
    openAIConstructorArgs = null;
    mockCreate.mockReset();
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  // ── SDK configuration ───────────────────────────────────────────────

  it("creates OpenAI client with OpenRouter baseURL and the API key", async () => {
    mockCreate.mockReturnValue(
      mockResponse([{ image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." } }]),
    );

    await generateImageApi("a sunset over mountains", "fast", "16:9");

    expect(openAIConstructorArgs).not.toBeNull();
    expect(openAIConstructorArgs!.baseURL).toBe("https://openrouter.ai/api/v1/");
    expect(openAIConstructorArgs!.apiKey).toBe("test-openrouter-key");
  });

  // ── Request parameters ──────────────────────────────────────────────

  it("sends model, text content, modalities, and aspect_ratio to the SDK", async () => {
    let createParams: any = null;
    mockCreate.mockImplementation((params: any) => {
      createParams = params;
      return mockResponse([
        { image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." } },
      ]);
    });

    await generateImageApi("a sunset over mountains", "fast", "16:9");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(createParams.model).toBe("fast");
    expect(createParams.messages).toEqual([{ role: "user", content: "a sunset over mountains" }]);
    expect(createParams.modalities).toEqual(["image", "text"]);
    expect(createParams.image_config).toEqual({ aspect_ratio: "16:9" });
  });

  // ── Response parsing ────────────────────────────────────────────────

  it("returns images array with base64 data and mimeType from the SDK response", async () => {
    mockCreate.mockReturnValue(
      mockResponse([{ image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." } }]),
    );

    const result = await generateImageApi("a sunset", "fast", "16:9");

    expect(result.images).toHaveLength(1);
    expect(result.images[0].data).toBe("iVBORw0KGgoAAAANSUhEUgAA...");
    expect(result.images[0].mimeType).toBe("image/png");
  });

  it("handles multiple images in the response", async () => {
    mockCreate.mockReturnValue(
      mockResponse([
        { image_url: { url: "data:image/png;base64,aaaa" } },
        { image_url: { url: "data:image/jpeg;base64,bbbb" } },
      ]),
    );

    const result = await generateImageApi("multiple images", "fast", "1:1");

    expect(result.images).toHaveLength(2);
    expect(result.images[0].data).toBe("aaaa");
    expect(result.images[0].mimeType).toBe("image/png");
    expect(result.images[1].data).toBe("bbbb");
    expect(result.images[1].mimeType).toBe("image/jpeg");
  });

  // ── Multimodal (image editing) ──────────────────────────────────────

  it("sends multimodal content with image data URL when imageBuffer is provided", async () => {
    let createParams: any = null;
    mockCreate.mockImplementation((params: any) => {
      createParams = params;
      return mockResponse([
        { image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." } },
      ]);
    });

    const imageBuffer = Buffer.from("fake-image-binary-data");
    await generateImageApi("make it a sunset", "fast", "16:9", imageBuffer, "image/png");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(createParams.messages[0].content).toEqual([
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,ZmFrZS1pbWFnZS1iaW5hcnktZGF0YQ==" },
      },
      { type: "text", text: "make it a sunset" },
    ]);
  });

  it("sends text-only content when no imageBuffer is provided (backward compat)", async () => {
    let createParams: any = null;
    mockCreate.mockImplementation((params: any) => {
      createParams = params;
      return mockResponse([
        { image_url: { url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..." } },
      ]);
    });

    await generateImageApi("a sunset over mountains", "fast", "16:9");

    expect(createParams.messages).toEqual([{ role: "user", content: "a sunset over mountains" }]);
  });

  it("handles JPEG image buffer correctly", async () => {
    let createParams: any = null;
    mockCreate.mockImplementation((params: any) => {
      createParams = params;
      return mockResponse([{ image_url: { url: "data:image/png;base64,aaaa" } }]);
    });

    const imageBuffer = Buffer.from("jpeg-data");
    await generateImageApi("make it better", "best", "1:1", imageBuffer, "image/jpeg");

    expect(createParams.messages[0].content[0].image_url.url).toBe(
      "data:image/jpeg;base64,anBlZy1kYXRh",
    );
    expect(createParams.messages[0].content[1].text).toBe("make it better");
  });

  // ── Error handling ──────────────────────────────────────────────────

  it("throws when the SDK call fails", async () => {
    mockCreate.mockRejectedValue(new Error("API rate limit exceeded"));

    await expect(generateImageApi("a sunset", "fast", "16:9")).rejects.toThrow();
  });

  it("returns empty images array when the response has no images", async () => {
    mockCreate.mockReturnValue(mockResponse());

    const result = await generateImageApi("a sunset", "fast", "16:9");

    expect(result.images).toHaveLength(0);
  });

  it("throws when OPENROUTER_API_KEY is not set", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(generateImageApi("a sunset", "fast", "16:9")).rejects.toThrow(
      /OPENROUTER_API_KEY/,
    );
  });
});
