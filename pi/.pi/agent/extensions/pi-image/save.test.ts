import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, readFileSync } from "node:fs";

// ── Helpers ────────────────────────────────────────────────────────────────

/** A tiny real PNG (1x1 transparent pixel, base64-encoded). */
const SMALL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const SMALL_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwB//9k=";

// ── Tests ──────────────────────────────────────────────────────────────────

describe("saveImageToTemp", () => {
  let savedFiles: string[] = [];

  beforeEach(() => {
    savedFiles = [];
  });

  afterEach(() => {
    for (const file of savedFiles) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("writes a file to /tmp/pi-img-<hash>.png for PNG mime type", async () => {
    const { saveImageToTemp } = await import("./save");
    const result = await saveImageToTemp(SMALL_PNG_BASE64, "image/png");

    // Check path pattern
    expect(result.path).toMatch(/^\/tmp\/pi-img-[a-f0-9]+\.png$/);
    // Check file exists
    expect(existsSync(result.path)).toBe(true);
    // Check size is non-zero
    expect(result.sizeBytes).toBeGreaterThan(0);
    // Check actual file size matches
    expect(result.sizeBytes).toBe(readFileSync(result.path).length);

    savedFiles.push(result.path);
  });

  it("writes a file to /tmp/pi-img-<hash>.jpg for JPEG mime type", async () => {
    const { saveImageToTemp } = await import("./save");
    const result = await saveImageToTemp(SMALL_JPEG_BASE64, "image/jpeg");

    expect(result.path).toMatch(/^\/tmp\/pi-img-[a-f0-9]+\.jpg$/);
    expect(existsSync(result.path)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);

    savedFiles.push(result.path);
  });

  it("outputs deterministic path for same input", async () => {
    const { saveImageToTemp } = await import("./save");
    const result1 = await saveImageToTemp(SMALL_PNG_BASE64, "image/png");
    const result2 = await saveImageToTemp(SMALL_PNG_BASE64, "image/png");

    expect(result1.path).toBe(result2.path);
    expect(result1.sizeBytes).toBe(result2.sizeBytes);

    savedFiles.push(result1.path);
  });

  it("outputs different paths for different input", async () => {
    const { saveImageToTemp } = await import("./save");
    const result1 = await saveImageToTemp(SMALL_PNG_BASE64, "image/png");
    const result2 = await saveImageToTemp(SMALL_JPEG_BASE64, "image/png");

    expect(result1.path).not.toBe(result2.path);

    savedFiles.push(result1.path);
    savedFiles.push(result2.path);
  });

  it("handles webp mime type", async () => {
    const { saveImageToTemp } = await import("./save");
    const result = await saveImageToTemp(SMALL_PNG_BASE64, "image/webp");

    expect(result.path).toMatch(/\.webp$/);
    expect(existsSync(result.path)).toBe(true);

    savedFiles.push(result.path);
  });

  it("writes correct binary content that can be decoded back", async () => {
    const { saveImageToTemp } = await import("./save");
    const result = await saveImageToTemp(SMALL_PNG_BASE64, "image/png");

    const writtenContent = readFileSync(result.path);
    const decoded = writtenContent.toString("base64");
    expect(decoded).toBe(SMALL_PNG_BASE64);

    savedFiles.push(result.path);
  });
});
