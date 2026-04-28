/**
 * Terminal focus tracking via CSI ?1004 focus events.
 *
 * Uses XTerm's focus event protocol: ESC[?1004h enables reporting,
 * ESC[?1004l disables. The terminal sends ESC[I (focus in) when
 * the terminal gains focus and ESC[O (focus out) when it loses focus.
 *
 * Default state is "focused" (conservative — notify only when
 * explicitly known to be unfocused).
 */

interface StdinLike {
  setRawMode(mode: boolean): this;
  resume(): this;
  pause(): this;
  on(event: string, listener: (...args: any[]) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this;
}

let focused = true;
let dataListener: ((data: Buffer) => void) | null = null;

/**
 * Returns the current terminal focus state.
 * Defaults to `true` (focused) until a focus-out event is received.
 */
export function isFocused(): boolean {
  return focused;
}

/**
 * Enable terminal focus tracking.
 *
 * Writes the CSI ?1004h escape sequence to stdout and listens for
 * ESC[I (focus in) / ESC[O (focus out) events on stdin.
 *
 * Safe to call multiple times — subsequent calls are no-ops if
 * tracking is already active.
 */
export function enableFocusTracking(): void {
  if (dataListener) return; // Already tracking

  process.stdout.write("\x1b[?1004h");

  dataListener = (data: Buffer) => {
    // Focus events are single bytes after ESC[: ESC[I (0x49) / ESC[O (0x4f)
    // Check each byte — data may contain multiple escape sequences
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0x1b && i + 2 < data.length && data[i + 1] === 0x5b) {
        // ESC[ found, check next byte
        const cmd = data[i + 2];
        if (cmd === 0x49) {
          // ESC[I — focus in
          focused = true;
        } else if (cmd === 0x4f) {
          // ESC[O — focus out
          focused = false;
        }
      }
    }
  };

  const stdin = process.stdin as StdinLike;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on("data", dataListener);
}

/**
 * Disable terminal focus tracking.
 *
 * Writes the CSI ?1004l escape sequence to stdout. Does NOT clean up
 * the stdin listener — use `cleanup()` for full teardown.
 */
export function disableFocusTracking(): void {
  process.stdout.write("\x1b[?1004l");
}

/**
 * Full teardown of focus tracking.
 *
 * Removes the stdin data listener, restores raw mode, pauses stdin,
 * and writes the disable escape sequence.
 *
 * Safe to call multiple times.
 */
export function cleanup(): void {
  disableFocusTracking();

  if (dataListener) {
    const stdin = process.stdin as StdinLike;
    stdin.removeListener("data", dataListener);
    dataListener = null;
    focused = true; // Reset to default
  }

  try {
    const stdin = process.stdin as StdinLike;
    stdin.setRawMode(false);
    stdin.pause();
  } catch {
    // stdin may already be in a bad state, ignore
  }
}
