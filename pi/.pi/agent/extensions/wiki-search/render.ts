/**
 * Wiki Search Extension — TUI renderers.
 */

import { type Component, Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { WikiSearchDetails } from "./index";

/** Render the wiki_search tool call. */
export function renderSearchCall(
  args: { query: string; semantic?: boolean; no_rerank?: boolean },
  theme: Theme,
  context: { lastComponent?: Component },
): Text {
  let content = theme.fg("toolTitle", theme.bold("wiki_search "));
  content += theme.fg("accent", `"${args.query}"`);
  if (args.semantic) {
    content += theme.fg("muted", " [semantic]");
  }
  if (args.no_rerank) {
    content += theme.fg("dim", " (no rerank)");
  }
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  text.setText(content);
  return text;
}

/** Render the wiki_search tool result. */
export function renderSearchResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: WikiSearchDetails;
  },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  if (state.isPartial) {
    return new Text(theme.fg("warning", "Searching wiki..."), 0, 0);
  }

  const details = result.details;

  if (!details) {
    const content = result.content[0];
    if (content?.type === "text") {
      return new Text(theme.fg("error", (content.text ?? "").slice(0, 100)), 0, 0);
    }
    return new Text(theme.fg("error", "Wiki search failed"), 0, 0);
  }

  const icon = details.resultCount > 0 ? theme.fg("success", "✓") : theme.fg("warning", "○");

  let text = `${icon} ${theme.fg("toolTitle", theme.bold("wiki_search"))}`;
  text += theme.fg("dim", ` ${details.resultCount} result${details.resultCount === 1 ? "" : "s"}`);
  if (details.semantic) {
    text += theme.fg("muted", " [semantic]");
  }
  if (!details.reranked) {
    text += theme.fg("dim", " (no rerank)");
  }

  if (state.expanded) {
    const content = result.content[0];
    if (content?.type === "text") {
      const lines = (content.text ?? "").split("\n");
      const relevantLines = lines.filter(
        (line) => line.startsWith("─── ") || line.startsWith("=== "),
      );
      for (const line of relevantLines.slice(0, 20)) {
        if (line.startsWith("─── ")) {
          text += `\n${theme.fg("accent", line)}`;
        } else {
          text += `\n${theme.fg("muted", line)}`;
        }
      }
      if (relevantLines.length > 20) {
        text += `\n${theme.fg("muted", "... (more results)")}`;
      }
    }
  }

  return new Text(text, 0, 0);
}
