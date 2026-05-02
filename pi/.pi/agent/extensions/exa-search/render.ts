/**
 * Exa extension TUI renderers for both web_search and web_fetch tools.
 */

import { type Component, Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";

import type { WebSearchDetails } from "./web-search";
import type { WebFetchDetails } from "./web-fetch";

// ── web_search renderers ───────────────────────────────────────────────────

/** Render the web_search tool call. */
export function renderSearchCall(
  args: { query: string; type?: string; category?: string },
  theme: Theme,
  context: { lastComponent?: Component },
): Text {
  let content = theme.fg("toolTitle", theme.bold("web_search "));
  content += theme.fg("accent", `"${args.query}"`);
  if (args.type && args.type !== "auto") {
    content += theme.fg("muted", ` [${args.type}]`);
  }
  if (args.category) {
    content += theme.fg("dim", ` (${args.category})`);
  }
  // Reuse existing component if available to avoid duplicate renders
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  text.setText(content);
  return text;
}

/** Render the web_search tool result. */
export function renderSearchResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: WebSearchDetails;
  },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  // Handle streaming/partial results
  if (state.isPartial) {
    return new Text(theme.fg("warning", "Searching the web..."), 0, 0);
  }

  const details = result.details;

  // Error state
  if (!details) {
    const content = result.content[0];
    if (content?.type === "text") {
      return new Text(theme.fg("error", (content.text ?? "").slice(0, 100)), 0, 0);
    }
    return new Text(theme.fg("error", "Search failed"), 0, 0);
  }

  // No results
  if (details.resultCount === 0) {
    return new Text(theme.fg("dim", `No results for "${details.query}"`), 0, 0);
  }

  // Build compact display
  let text = theme.fg("success", `${details.resultCount} results`);
  text += theme.fg("dim", ` for "${details.query}"`);

  if (details.truncated) {
    text += theme.fg("warning", " (truncated)");
  }

  // In expanded view, show result titles and URLs
  if (state.expanded) {
    const content = result.content[0];
    if (content?.type === "text") {
      const lines = (content.text ?? "").split("\n");
      // Extract just the titles and URLs (lines starting with ### or URL:)
      const relevantLines = lines.filter(
        (line) =>
          line.startsWith("### ") || line.startsWith("URL: ") || line.startsWith("Published: "),
      );
      for (const line of relevantLines.slice(0, 30)) {
        if (line.startsWith("### ")) {
          text += `\n${theme.fg("accent", line)}`;
        } else if (line.startsWith("URL: ")) {
          text += `\n${theme.fg("dim", line)}`;
        } else {
          text += `\n${theme.fg("muted", line)}`;
        }
      }
      if (relevantLines.length > 30) {
        text += `\n${theme.fg("muted", "... (more results)")}`;
      }
    }
  }

  return new Text(text, 0, 0);
}

// ── web_fetch renderers ────────────────────────────────────────────────────

/** Render the web_fetch tool call. */
export function renderFetchCall(
  args: { urls?: string[]; format?: string },
  theme: Theme,
  context: { lastComponent?: Component },
): Text {
  const urlCount = args.urls?.length ?? 0;
  const first = args.urls?.[0] ?? "";
  const display =
    urlCount === 1 ? (first.length > 60 ? `${first.slice(0, 57)}...` : first) : `${urlCount} URLs`;
  let content = theme.fg("toolTitle", theme.bold("web_fetch ")) + theme.fg("accent", display);
  if (args.format && args.format !== "text") {
    content += theme.fg("muted", ` [${args.format}]`);
  }
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  text.setText(content);
  return text;
}

/** Render the web_fetch tool result. */
export function renderFetchResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: WebFetchDetails;
  },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  if (state.isPartial) {
    return new Text(theme.fg("warning", "Fetching pages..."), 0, 0);
  }

  const details = result.details;

  if (!details) {
    const content = result.content[0];
    if (content?.type === "text") {
      return new Text(theme.fg("error", (content.text ?? "").slice(0, 100)), 0, 0);
    }
    return new Text(theme.fg("error", "Fetch failed"), 0, 0);
  }

  const icon =
    details.errorCount > 0 && details.successCount === 0
      ? theme.fg("error", "✗")
      : theme.fg("success", "✓");

  let text = `${icon} ${theme.fg("toolTitle", theme.bold("web_fetch"))}`;
  text += theme.fg("dim", ` ${details.successCount}/${details.urls.length} fetched`);
  if (details.errorCount > 0) {
    text += theme.fg("error", ` (${details.errorCount} failed)`);
  }
  if (details.truncated) {
    text += theme.fg("warning", " (truncated)");
  }

  if (state.expanded) {
    const content = result.content[0];
    if (content?.type === "text") {
      const lines = (content.text ?? "").split("\n");
      const relevantLines = lines.filter(
        (line) => line.startsWith("## ") || line.startsWith("URL: "),
      );
      for (const line of relevantLines) {
        if (line.startsWith("## ")) {
          text += `\n${theme.fg("accent", line)}`;
        } else {
          text += `\n${theme.fg("dim", line)}`;
        }
      }
    }
  }

  return new Text(text, 0, 0);
}
