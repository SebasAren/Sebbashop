/**
 * Tests for image validation utility.
 *
 * Validates that image files exist, have a supported format,
 * and returns their type + dimensions.
 *
 * NOTE: We do NOT mock node:fs here. Using mock.module for node:fs globally
 * replaces ALL node:fs exports (statSync, readFileSync, writeFileSync, etc.)
 * for the entire test process, which breaks other extensions (worktree-scope)
 * that need the real fs module. Instead, we create real temp files and mock
 * only image-size to control its return values.
 */

import { describe, it, expect, mock, afterEach } from "bun:test";
import { existsSync, unlinkSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ── Mock image-size only ─────────────────────────────────────────────────

const mockImageSize =
  mock<(input: Uint8Array) => { width: number; height: number; type?: string }>();

mock.module("image-size", () => ({
  imageSize: mockImageSize,
  default: mockImageSize,
}));

// Import after mocks
import { validateImage } from "./validate";

// ── Test fixtures ─────────────────────────────────────────────────────────

/** Create a temp directory with a disposable file of the given content. */
function createTempFile(content: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-img-test-"));
  const filePath = join(dir, "test-file");
  writeFileSync(filePath, content);
  return filePath;
}

function cleanupTempFile(filePath: string) {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
    // Also clean up the parent temp dir
    const dir = filePath.substring(0, filePath.lastIndexOf("/"));
    try {
      const { rmdirSync } = require("node:fs");
      rmdirSync(dir);
    } catch {
      // ignore
    }
  } catch {
    // ignore cleanup errors
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("validateImage", () => {
  const tempFiles: string[] = [];

  afterEach(() => {
    mockImageSize.mockReset();
    for (const f of tempFiles) cleanupTempFile(f);
    tempFiles.length = 0;
  });

  it("returns type, width, and height for a valid PNG file", () => {
    const filePath = createTempFile(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52,
      ]),
    );
    tempFiles.push(filePath);
    mockImageSize.mockReturnValue({ width: 800, height: 600, type: "png" });

    const result = validateImage(filePath);

    expect(result).toEqual({ type: "png", width: 800, height: 600 });
    expect(mockImageSize).toHaveBeenCalledTimes(1);
  });

  it("returns type, width, and height for a valid JPEG file", () => {
    const filePath = createTempFile(Buffer.from([0xff, 0xd8, 0xff]));
    tempFiles.push(filePath);
    mockImageSize.mockReturnValue({ width: 1920, height: 1080, type: "jpg" });

    const result = validateImage(filePath);

    expect(result).toEqual({ type: "jpg", width: 1920, height: 1080 });
  });

  it("returns type, width, and height for a valid WEBP file", () => {
    const filePath = createTempFile(Buffer.from([0x52, 0x49, 0x46, 0x46]));
    tempFiles.push(filePath);
    mockImageSize.mockReturnValue({ width: 400, height: 300, type: "webp" });

    const result = validateImage(filePath);

    expect(result).toEqual({ type: "webp", width: 400, height: 300 });
  });

  it("returns type, width, and height for a valid GIF file", () => {
    const filePath = createTempFile(Buffer.from([0x47, 0x49, 0x46]));
    tempFiles.push(filePath);
    mockImageSize.mockReturnValue({ width: 128, height: 128, type: "gif" });

    const result = validateImage(filePath);

    expect(result).toEqual({ type: "gif", width: 128, height: 128 });
  });

  it("throws for unsupported format (SVG)", () => {
    const filePath = createTempFile(Buffer.from("<svg></svg>"));
    tempFiles.push(filePath);
    mockImageSize.mockReturnValue({ width: 100, height: 100, type: "svg" });

    expect(() => validateImage(filePath)).toThrow(/unsupported.*svg/i);
  });

  it("throws for unsupported format (BMP)", () => {
    const filePath = createTempFile(Buffer.from([0x42, 0x4d]));
    tempFiles.push(filePath);
    mockImageSize.mockReturnValue({ width: 100, height: 100, type: "bmp" });

    expect(() => validateImage(filePath)).toThrow(/unsupported.*bmp/i);
  });

  it("throws with clear message when file does not exist", () => {
    const missingPath = "/tmp/pi-img-test-nonexistent-file-12345";

    expect(() => validateImage(missingPath)).toThrow(/not found|does not exist|ENOENT/i);
  });

  it("throws when the file exists but image-size cannot parse it", () => {
    const filePath = createTempFile(Buffer.from("this is not an image file"));
    tempFiles.push(filePath);
    mockImageSize.mockImplementation(() => {
      throw new Error("Unable to determine image type");
    });

    expect(() => validateImage(filePath)).toThrow(/unable to determine|not a valid image/i);
  });

  it("throws when the file returns an undefined type from image-size", () => {
    const filePath = createTempFile(Buffer.from("some binary data"));
    tempFiles.push(filePath);
    mockImageSize.mockReturnValue({ width: 100, height: 100, type: undefined });

    expect(() => validateImage(filePath)).toThrow(/unsupported|not a valid image/i);
  });

  it("throws when image-size returns a type that is not in the whitelist", () => {
    const filePath = createTempFile(Buffer.from("tiff data"));
    tempFiles.push(filePath);
    mockImageSize.mockReturnValue({ width: 100, height: 100, type: "tiff" });

    expect(() => validateImage(filePath)).toThrow(/unsupported.*tiff/i);
  });
});
