import { describe, it, expect, mock } from "bun:test";

import { copyToClipboard } from "./copyToClipboard";

/**
 * Create a mock spawnSync that returns success by default.
 * Tests override with mockImplementation for specific scenarios.
 */
function mockSpawnSync() {
  return mock(
    (
      _cmd: string,
      _args: readonly string[],
      _options?: any,
    ): { status: number | null; error?: Error; signal?: string; stderr?: string } => ({
      status: 0,
      error: undefined,
    }),
  );
}

describe("copyToClipboard", () => {
  it("tries wl-copy with image/png type first", () => {
    const spawn = mockSpawnSync();
    const png = Buffer.from("fake-png-data");
    copyToClipboard(png, spawn);

    expect(spawn).toHaveBeenCalledWith("wl-copy", ["--type", "image/png"], {
      input: png,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
  });

  it("falls back to xclip when wl-copy is not found", () => {
    const spawn = mockSpawnSync();
    spawn.mockImplementation((_cmd: string, _args: readonly string[], _options?: any) => {
      if (_cmd === "wl-copy") return { status: null, error: new Error("ENOENT") };
      return { status: 0, error: undefined };
    });

    const png = Buffer.from("fake-png-data");
    copyToClipboard(png, spawn);

    expect(spawn).toHaveBeenCalledWith("xclip", ["-selection", "clipboard", "-t", "image/png"], {
      input: png,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
  });

  it("falls back to pbcopy when wl-copy and xclip are not found", () => {
    const spawn = mockSpawnSync();
    spawn.mockImplementation((_cmd: string, _args: readonly string[], _options?: any) => {
      if (_cmd === "wl-copy" || _cmd === "xclip") {
        return { status: null, error: new Error("ENOENT") };
      }
      return { status: 0, error: undefined };
    });

    const png = Buffer.from("fake-png-data");
    copyToClipboard(png, spawn);

    expect(spawn).toHaveBeenCalledWith("pbcopy", [], {
      input: png,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
    });
  });

  it("returns immediately when a utility succeeds", () => {
    const spawn = mockSpawnSync();

    const png = Buffer.from("fake-png-data");
    expect(() => copyToClipboard(png, spawn)).not.toThrow();
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("throws when a utility is killed by a signal", () => {
    const spawn = mockSpawnSync();
    spawn.mockImplementation(() => ({
      status: null,
      error: undefined,
      signal: "SIGKILL",
      stderr: Buffer.from(""),
    }));

    const png = Buffer.from("fake-png-data");
    expect(() => copyToClipboard(png, spawn)).toThrow("wl-copy was killed by signal SIGKILL");
  });

  it("throws when a utility exits with non-zero status", () => {
    const spawn = mockSpawnSync();
    spawn.mockImplementation(() => ({
      status: 1,
      error: undefined,
      stderr: Buffer.from("clipboard locked"),
    }));

    const png = Buffer.from("fake-png-data");
    expect(() => copyToClipboard(png, spawn)).toThrow("wl-copy failed (exit 1): clipboard locked");
  });

  it("throws a final error when no clipboard utility is available", () => {
    const spawn = mockSpawnSync();
    spawn.mockImplementation(() => ({
      status: null,
      error: new Error("ENOENT"),
    }));

    const png = Buffer.from("fake-png-data");
    expect(() => copyToClipboard(png, spawn)).toThrow(
      "No clipboard utility found. Install one of: wl-copy (wl-clipboard), xclip, or pbcopy.",
    );
  });
});
