/**
 * OpenRouter Image Generation API Client
 *
 * Calls OpenRouter chat completions endpoint (via OpenAI SDK) with image modality
 * and returns parsed image results.
 */

import OpenAI from "openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/";

interface ImageResult {
  data: string;
  mimeType: string;
}

export interface GenerateImageApiResult {
  images: ImageResult[];
}

/**
 * Build the message content for the chat completion request.
 *
 * When an image buffer is provided, returns a multimodal content array
 * with the image as a data URL followed by the text prompt.
 * When no image is provided, returns the prompt as a plain string.
 */
function buildMessageContent(
  prompt: string,
  imageBuffer?: Buffer,
  imageMimeType?: string,
): string | Array<{ type: string; image_url?: { url: string }; text?: string }> {
  if (imageBuffer && imageMimeType) {
    const base64 = imageBuffer.toString("base64");
    const dataUrl = `data:${imageMimeType};base64,${base64}`;
    return [
      { type: "image_url", image_url: { url: dataUrl } },
      { type: "text", text: prompt },
    ];
  }
  return prompt;
}

/**
 * Parse a data URL (e.g., "data:image/png;base64,iVBOR...") into
 * its MIME type and base64 data components.
 */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL format");
  }
  return { mimeType: match[1], data: match[2] };
}

/** OpenRouter extensions to the chat completion response. */
interface OpenRouterMessage {
  role: string;
  content: string;
  images?: Array<{ image_url?: { url?: string } }>;
}

interface OpenRouterResponse {
  choices?: Array<{ message?: OpenRouterMessage }>;
}

/**
 * Call the OpenRouter chat completions API to generate an image.
 *
 * Uses the OpenAI SDK pointed at OpenRouter's base URL. The SDK handles
 * authentication, request serialization, and response parsing. OpenRouter
 * returns generated images as data URLs in the `choices[].message.images[]`
 * field (non-standard extension to the chat completion response).
 *
 * @param prompt - Text description of the image to generate
 * @param model - Model identifier (e.g., "google/gemini-3.1-flash-image-preview")
 * @param aspectRatio - Aspect ratio string (e.g., "1:1", "16:9")
 * @param imageBuffer - Optional image buffer for editing (sends as multimodal input)
 * @param imageMimeType - MIME type of the image buffer (e.g., "image/png", "image/jpeg")
 * @returns Object containing an array of generated images with base64 data and MIME type
 */
export async function generateImageApi(
  prompt: string,
  model: string,
  aspectRatio: string,
  imageBuffer?: Buffer,
  imageMimeType?: string,
): Promise<GenerateImageApiResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY environment variable is not set. " +
        "Please set it to your OpenRouter API key.",
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: OPENROUTER_BASE_URL,
  });

  const content = buildMessageContent(prompt, imageBuffer, imageMimeType);

  // OpenRouter's image-generation models accept `modalities` and `image_config` as
  // chat completion extensions — these aren't part of the OpenAI SDK type because
  // they're not in the official OpenAI API spec. Build params as a plain object
  // and cast through unknown to the SDK's expected param type.
  const params: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content }],
    modalities: ["image", "text"],
    image_config: { aspect_ratio: aspectRatio },
  };
  const response = (await client.chat.completions.create(
    params as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as unknown as OpenRouterResponse;

  const images: ImageResult[] = [];

  // OpenRouter returns generated images in `choices[].message.images[]` (a non-standard
  // field on the chat completion response).
  const message: OpenRouterMessage | undefined = response.choices?.[0]?.message;

  if (message?.images && Array.isArray(message.images)) {
    for (const img of message.images) {
      const url = img?.image_url?.url;
      if (url && typeof url === "string") {
        const parsed = parseDataUrl(url);
        images.push({ data: parsed.data, mimeType: parsed.mimeType });
      }
    }
  }

  return { images };
}
