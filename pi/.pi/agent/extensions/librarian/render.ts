/**
 * Librarian extension TUI renderers for tool call and result display.
 */

import { type Component, Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { renderSubagentResult, renderSubagentCall } from "@pi-ext/shared";

import type { LibrarianDetails } from "./index";

/** Render the librarian tool call with model tag and query preview. */
export function renderCall(
  args: { query: string; library?: string; focus?: string },
  theme: Theme,
  context: { lastComponent?: Component },
  model?: string,
): Text {
  const preview = args.query.length > 80 ? `${args.query.slice(0, 80)}...` : args.query;
  const extras: string[] = [];
  if (args.library) {
    extras.push(theme.fg("accent", args.library));
  }
  if (args.focus) {
    extras.push(theme.fg("muted", `· focus: ${args.focus}`));
  }

  return renderSubagentCall({
    preview,
    theme,
    context,
    toolName: "librarian",
    model,
    extras: extras.length > 0 ? extras : undefined,
  });
}

/** Render the librarian tool result with section-based expanded/collapsed views. */
export function renderResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: LibrarianDetails;
    isError?: boolean;
  },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Component {
  return renderSubagentResult({
    result,
    state,
    theme,
    toolName: "librarian",
    partialLabel: "researching",
    buildExpandedHeader: (d, t) => {
      const parts: string[] = [];
      const ld = d as LibrarianDetails;
      if (ld.query) parts.push(t.fg("muted", "Query: ") + t.fg("dim", String(ld.query)));
      if (ld.library)
        parts.push(t.fg("muted", ` · Library: `) + t.fg("accent", String(ld.library)));
      if (ld.focus) parts.push(t.fg("muted", ` · Focus: `) + t.fg("dim", String(ld.focus)));
      return parts.join("");
    },
  });
}
