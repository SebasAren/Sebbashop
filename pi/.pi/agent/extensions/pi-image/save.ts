/**
 * Image File Saving Utilities
 *
 * Decodes base64 image data and saves to /tmp/pi-img-<hash>.<ext>.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

export interface SaveImageResult {
  path: string;
  sizeBytes: number;
}

/**
 * Map a MIME type to a file extension.
 */
function mimeToExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mimeType] || "png";
}

/**
 * Decode base64 image data and save it to /tmp/pi-img-<hash>.<ext>.
 *
 * The filename is deterministically derived from a hash of the content,
 * so identical images reuse the same file.
 *
 * @param base64Data - Base64-encoded image data
 * @param mimeType - MIME type (e.g., "image/png", "image/jpeg")
 * @returns Object with the saved file path and size in bytes
 */
export function saveImageToTemp(base64Data: string, mimeType: string): SaveImageResult {
  const ext = mimeToExtension(mimeType);
  const hash = createHash("sha256").update(base64Data).digest("hex").slice(0, 16);
  const filePath = `/tmp/pi-img-${hash}.${ext}`;

  const buffer = Buffer.from(base64Data, "base64");
  writeFileSync(filePath, buffer);

  return { path: filePath, sizeBytes: buffer.length };
}
