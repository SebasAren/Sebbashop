/**
 * OpenRouter Image Generation API Client
 *
 * Calls OpenRouter chat completions endpoint with image modality
 * and returns parsed image results.
 */

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

interface ImageResult {
  data: string;
  mimeType: string;
}

export interface GenerateImageApiResult {
  images: ImageResult[];
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

/**
 * Call the OpenRouter chat completions API to generate an image.
 *
 * @param prompt - Text description of the image to generate
 * @param model - Model identifier (e.g., "bytedance-research/seedream-4.5")
 * @param aspectRatio - Aspect ratio string (e.g., "1:1", "16:9")
 * @returns Object containing an array of generated images with base64 data and MIME type
 */
export async function generateImageApi(
  prompt: string,
  model: string,
  aspectRatio: string,
): Promise<GenerateImageApiResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY environment variable is not set. " +
        "Please set it to your OpenRouter API key.",
    );
  }

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: aspectRatio },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter image request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const images: ImageResult[] = [];

  const choices = data?.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = choices[0]?.message;
    if (message?.images && Array.isArray(message.images)) {
      for (const img of message.images) {
        const url = img?.image_url?.url;
        if (url && typeof url === "string") {
          const parsed = parseDataUrl(url);
          images.push({ data: parsed.data, mimeType: parsed.mimeType });
        }
      }
    }
  }

  return { images };
}
