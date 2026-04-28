import { describe, it, expect, beforeEach, mock } from "bun:test";
import { spawnSync } from "child_process";

// --- Mocks ---

const mockSpawnSync = mock<typeof spawnSync>();

// Import after mock
const { notify } = await import("./notify");

// --- Helpers ---

function makeSpawnResult(opts: {
  status?: number;
  stdout?: string;
  stderr?: string;
  error?: Error;
}): ReturnType<typeof spawnSync> {
  return {
    status: opts.status ?? 0,
    signal: null,
    output: [null, Buffer.from(opts.stdout ?? ""), Buffer.from(opts.stderr ?? "")],
    stdout: Buffer.from(opts.stdout ?? ""),
    stderr: Buffer.from(opts.stderr ?? ""),
    pid: 1234,
    error: opts.error,
  } as unknown as ReturnType<typeof spawnSync>;
}

// --- Tests ---

describe("notify", () => {
  beforeEach(() => {
    mockSpawnSync.mockReset();
  });

  it("spawns notify-send with title and body args", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({}));

    notify("Test Title", "Test body message", {}, mockSpawnSync);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "notify-send",
      ["--icon=info", "Test Title", "Test body message"],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });

  it("includes --icon flag with the provided icon", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({}));

    notify("Alert", "Something happened", { icon: "dialog-warning" }, mockSpawnSync);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "notify-send",
      ["--icon=dialog-warning", "Alert", "Something happened"],
      expect.anything(),
    );
  });

  it("defaults to info icon when not specified", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({}));

    notify("Title", "Body", {}, mockSpawnSync);

    expect(mockSpawnSync).toHaveBeenCalledWith(
      "notify-send",
      ["--icon=info", "Title", "Body"],
      expect.anything(),
    );
  });

  it("returns true on successful notification", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));

    const result = notify("Title", "Body", {}, mockSpawnSync);

    expect(result).toBe(true);
  });

  it("returns false when notify-send exits with non-zero status", () => {
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 1 }));

    const result = notify("Title", "Body", {}, mockSpawnSync);

    expect(result).toBe(false);
  });

  it("returns false silently when notify-send binary is not found (ENOENT)", () => {
    const enoent = new Error("spawn notify-send ENOENT");
    (enoent as NodeJS.ErrnoException).code = "ENOENT";
    mockSpawnSync.mockReturnValue(makeSpawnResult({ error: enoent }));

    const result = notify("Title", "Body", {}, mockSpawnSync);

    expect(result).toBe(false);
    // Should not throw despite the error
  });

  it("re-throws non-ENOENT errors", () => {
    const genericError = new Error("Something else went wrong");
    mockSpawnSync.mockReturnValue(makeSpawnResult({ error: genericError }));

    expect(() => notify("Title", "Body", {}, mockSpawnSync)).toThrow("Something else went wrong");
  });

  it("escapes body text for shell safety using array args (not shell string)", () => {
    // Since spawnSync with array args is inherently safe, we verify
    // that the implementation uses array args (not shell: true or string command)
    mockSpawnSync.mockReset();
    mockSpawnSync.mockReturnValue(makeSpawnResult({ status: 0 }));

    const maliciousBody = "'; rm -rf /; '";
    notify("Title", maliciousBody, {}, mockSpawnSync);

    // Should pass body as a separate array element, not a shell-interpolated string
    const call = mockSpawnSync.mock.calls[0];
    expect(call).toBeDefined();
    const args = call[1] as string[];
    expect(args).toContain(maliciousBody);

    // Verify stdio is "inherit" (not a shell pipeline)
    const options = call[2] as Record<string, unknown>;
    expect(options).not.toHaveProperty("shell");
  });
});
