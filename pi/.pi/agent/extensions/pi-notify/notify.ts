/**
 * Desktop notification helper.
 *
 * Sends GNOME desktop notifications via notify-send using spawnSync
 * with array args for shell safety. Silently handles missing notify-send
 * binary (ENOENT).
 */

import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "child_process";

export interface NotifyOptions {
  /** Icon name for the notification (default: "info") */
  icon?: string;
}

/**
 * Send a desktop notification via notify-send.
 *
 * @param spawnFn - Optional spawn function override for testing (defaults to real spawnSync)
 * @returns true if the notification was sent successfully, false if the
 *          notify-send binary is not found or exits with non-zero status.
 * @throws non-ENOENT errors from spawnSync
 */
export function notify(
  title: string,
  body: string,
  options: NotifyOptions = {},
  spawnFn: (
    cmd: string,
    args: readonly string[],
    opts?: SpawnSyncOptions,
  ) => SpawnSyncReturns<Buffer> = spawnSync,
): boolean {
  const icon = options.icon ?? "info";
  const args = ["--icon=" + icon, title, body];

  const opts: SpawnSyncOptions = {
    stdio: "inherit",
  };

  try {
    const result = spawnFn("notify-send", args, opts);
    // spawnSync may return an error in the result object instead of throwing
    if (result.error) {
      if (isENOENT(result.error)) {
        return false;
      }
      throw result.error;
    }
    return result.status === 0;
  } catch (err) {
    // Binary not found — silently ignore
    if (isENOENT(err)) {
      return false;
    }
    throw err;
  }
}

function isENOENT(err: unknown): boolean {
  return err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT";
}
