/**
 * Image File Validation Utility
 *
 * Validates that an image file exists, has a supported format,
 * and returns its type + dimensions.
 */

import { readFileSync } from "node:fs";
import { imageSize } from "image-size";

/** Whitelist of supported image formats (lowercase, as returned by image-size). */
const SUPPORTED_TYPES = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export interface ValidationResult {
  type: string;
  width: number;
  height: number;
}

/**
 * Validate an image file at the given path.
 *
 * Reads the file, determines its type and dimensions via image-size,
 * and checks that the format is in the supported whitelist.
 *
 * @param filePath - Absolute or relative path to the image file
 * @returns Object with type, width, and height
 * @throws If the file does not exist, is not a valid image, or has an unsupported format
 */
export function validateImage(filePath: string): ValidationResult {
  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Image file not found: ${filePath}`, { cause: err });
    }
    throw err;
  }

  let dimensions: { width: number; height: number; type?: string };
  try {
    dimensions = imageSize(new Uint8Array(buffer));
  } catch (err) {
    throw new Error(`Unable to determine image type: ${filePath} is not a valid image`, {
      cause: err,
    });
  }

  const type = dimensions.type;
  if (!type || !SUPPORTED_TYPES.has(type.toLowerCase())) {
    throw new Error(
      `Unsupported image format${type ? `: ${type}` : ""}. Supported: png, jpg, jpeg, webp, gif`,
    );
  }

  return { type: type.toLowerCase(), width: dimensions.width, height: dimensions.height };
}
