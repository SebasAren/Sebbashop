/**
 * Pi Desktop Notification Extension
 *
 * Sends GNOME desktop notifications via notify-send when an agent
 * turn completes and the terminal window is not in focus. Uses CSI
 * ?1004 focus events to track terminal focus state.
 *
 * Falls back to always-notify if focus tracking is unavailable
 * (e.g., in non-interactive environments).
 */

import type {
  AgentEndEvent,
  ExtensionAPI,
  SessionShutdownEvent,
} from "@mariozechner/pi-coding-agent";
import { enableFocusTracking, isFocused, cleanup } from "./focus-tracker";
import { notify } from "./notify";

/** Format the notification body for a completed turn. */
export function formatNotificationBody(turnCount: number): string {
  return `Turn ${turnCount} complete`;
}

interface ExtensionDeps {
  notify: (title: string, body: string) => boolean;
  enableFocusTracking: () => void;
  isFocused: () => boolean;
  cleanup: () => void;
}

export default function (pi: ExtensionAPI, deps?: Partial<ExtensionDeps>): void {
  const {
    notify: notifyFn = notify,
    enableFocusTracking: enableFn = enableFocusTracking,
    isFocused: isFocusedFn = isFocused,
    cleanup: cleanupFn = cleanup,
  } = deps ?? {};
  let hasFocusTracking = true;

  try {
    enableFn();
  } catch {
    hasFocusTracking = false;
  }

  pi.on("agent_end", (event: AgentEndEvent): void => {
    // Skip notification if terminal has focus (and focus tracking worked)
    if (hasFocusTracking && isFocusedFn()) return;

    const turnCount = event.messages.length;
    notifyFn("Pi Agent", formatNotificationBody(turnCount));
  });

  pi.on("session_shutdown", (_event: SessionShutdownEvent): void => {
    cleanupFn();
  });
}
