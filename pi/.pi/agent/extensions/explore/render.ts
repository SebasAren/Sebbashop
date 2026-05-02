/**
 * Explore extension TUI renderers for tool call and result display.
 */

import { type Component, Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { renderSubagentResult, renderSubagentCall } from "@pi-ext/shared";

import type { ExploreDetails } from "./index";

/** Render the explore tool call with model tag and query preview. */
export function renderCall(
  args: { query: string; directory?: string; files?: string[]; thoroughness?: string },
  theme: Theme,
  context: { lastComponent?: Component },
  model?: string,
): Text {
  const preview = args.query.length > 80 ? `${args.query.slice(0, 80)}...` : args.query;
  const extras: string[] = [];
  if (args.directory) {
    extras.push(theme.fg("muted", `in ${args.directory}`));
  }
  if (args.files && args.files.length > 0) {
    extras.push(theme.fg("accent", `deepen: ${args.files.length} files`));
  }
  if (args.thoroughness && args.thoroughness !== "medium") {
    extras.push(theme.fg("muted", args.thoroughness));
  }

  return renderSubagentCall({
    preview,
    theme,
    context,
    toolName: "explore",
    model,
    extras,
  });
}

/** Render the explore tool result with section-based expanded/collapsed views. */
export function renderResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: ExploreDetails;
    isError?: boolean;
  },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  _context: unknown,
): Component {
  const _details = result.details;

  return renderSubagentResult({
    result,
    state,
    theme,
    toolName: "explore",
    partialLabel: "exploring",
    buildExpandedHeader: (d, t) => {
      const parts: string[] = [];
      if (d.query) parts.push(t.fg("muted", "Query: ") + t.fg("dim", String(d.query)));
      return parts.join(" ");
    },
  });
}
