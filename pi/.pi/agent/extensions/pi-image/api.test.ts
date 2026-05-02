import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ── Setup mocked fetch ────────────────────────────────────────────────────

const ORIGINAL_FETCH = globalThis.fetch;
const mockFetch = mock<(url: string, options?: any) => Promise<Response>>();

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  mockFetch.mockReset();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.OPENROUTER_API_KEY;
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("generateImageApi", () => {
  it("sends a POST request to the OpenRouter chat completions endpoint", async () => {
    mockFetch.mockImplementation(async (_url, _options) => {
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
                    image_url: {
                      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { generateImageApi } = await import("./api");
    await generateImageApi("a sunset", "fast", "16:9");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Verify correct endpoint
    expect(mockFetch.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");
  });

  it("includes Authorization header with the API key", async () => {
    mockFetch.mockImplementation(async (_url, _options) => {
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
                    image_url: {
                      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { generateImageApi } = await import("./api");
    await generateImageApi("a sunset", "fast", "16:9");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer test-openrouter-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends model, prompt, modalities, and aspect ratio in the request body", async () => {
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
                    image_url: {
                      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { generateImageApi } = await import("./api");
    await generateImageApi("a sunset", "fast", "16:9");

    expect(requestBody.model).toBe("fast");
    expect(requestBody.messages[0].role).toBe("user");
    expect(requestBody.messages[0].content).toBe("a sunset");
    expect(requestBody.modalities).toEqual(["image"]);
    expect(requestBody.image_config).toEqual({ aspect_ratio: "16:9" });
  });

  it("returns images array with base64 data and mimeType", async () => {
    mockFetch.mockImplementation(async (_url, _options) => {
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
                    image_url: {
                      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const { generateImageApi } = await import("./api");
    const result = await generateImageApi("a sunset", "fast", "16:9");

    expect(result.images).toHaveLength(1);
    expect(result.images[0].data).toBe("iVBORw0KGgoAAAANSUhEUgAA...");
    expect(result.images[0].mimeType).toBe("image/png");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockImplementation(async () => {
      return new Response("Unauthorized", { status: 401 });
    });

    const { generateImageApi } = await import("./api");
    await expect(generateImageApi("a sunset", "fast", "16:9")).rejects.toThrow();
  });

  it("returns empty images array when response has no images", async () => {
    mockFetch.mockImplementation(async (_url, _options) => {
      return new Response(
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
      );
    });

    const { generateImageApi } = await import("./api");
    const result = await generateImageApi("a sunset", "fast", "16:9");

    expect(result.images).toHaveLength(0);
  });

  it("throws when OPENROUTER_API_KEY is not set", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { generateImageApi } = await import("./api");

    await expect(generateImageApi("a sunset", "fast", "16:9")).rejects.toThrow(
      /OPENROUTER_API_KEY/,
    );
  });
});
