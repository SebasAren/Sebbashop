/**
 * Context7 extension TUI renderers for both tools.
 */

import { type Component, Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";

import type { SearchDetails } from "./search";
import type { DocsDetails } from "./docs";

// ── context7_search renderers ──────────────────────────────────────────────

/** Render the context7_search tool call. */
export function renderSearchCall(
  args: { libraryName: string; query: string },
  theme: Theme,
  context: { lastComponent?: Component },
): Text {
  let content = theme.fg("toolTitle", theme.bold("context7_search "));
  content += theme.fg("accent", `"${args.libraryName}"`);
  content += theme.fg("dim", ` for "${args.query}"`);
  // Reuse existing component if available to avoid duplicate renders
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  text.setText(content);
  return text;
}

/** Render the context7_search tool result. */
export function renderSearchResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: SearchDetails;
  },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  if (state.isPartial) {
    return new Text(theme.fg("warning", "Searching Context7..."), 0, 0);
  }

  const details = result.details;

  if (!details) {
    const content = result.content[0];
    if (content?.type === "text") {
      return new Text(theme.fg("error", (content.text ?? "").slice(0, 100)), 0, 0);
    }
    return new Text(theme.fg("error", "Context7 search failed"), 0, 0);
  }

  if (details.resultCount === 0) {
    return new Text(theme.fg("dim", `No libraries found for "${details.libraryName}"`), 0, 0);
  }

  let text = theme.fg("success", `${details.resultCount} libraries`);
  text += theme.fg("dim", ` for "${details.libraryName}"`);

  if (state.expanded) {
    const content = result.content[0];
    if (content?.type === "text") {
      const lines = (content.text ?? "").split("\n");
      const relevantLines = lines.filter(
        (line) => line.startsWith("### ") || line.startsWith("- **ID**:"),
      );
      for (const line of relevantLines.slice(0, 20)) {
        if (line.startsWith("### ")) {
          text += `\n${theme.fg("accent", line)}`;
        } else {
          text += `\n${theme.fg("dim", line)}`;
        }
      }
      if (relevantLines.length > 20) {
        text += `\n${theme.fg("muted", "... (more results)")}`;
      }
    }
  }

  return new Text(text, 0, 0);
}

// ── context7_docs renderers ────────────────────────────────────────────────

/** Render the context7_docs tool call. */
export function renderDocsCall(
  args: { libraryId: string; query: string },
  theme: Theme,
  context: { lastComponent?: Component },
): Text {
  let content = theme.fg("toolTitle", theme.bold("context7_docs "));
  content += theme.fg("accent", `${args.libraryId}`);
  content += theme.fg("dim", ` for "${args.query}"`);
  // Reuse existing component if available to avoid duplicate renders
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  text.setText(content);
  return text;
}

/** Render the context7_docs tool result. */
export function renderDocsResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: DocsDetails;
  },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  if (state.isPartial) {
    return new Text(theme.fg("warning", "Fetching documentation..."), 0, 0);
  }

  const details = result.details;

  if (!details) {
    const content = result.content[0];
    if (content?.type === "text") {
      return new Text(theme.fg("error", (content.text ?? "").slice(0, 100)), 0, 0);
    }
    return new Text(theme.fg("error", "Context7 docs failed"), 0, 0);
  }

  if (details.snippetCount === 0) {
    return new Text(theme.fg("dim", `No docs for "${details.libraryId}"`), 0, 0);
  }

  let text = theme.fg("success", `${details.snippetCount} snippets`);
  text += theme.fg("dim", ` for ${details.libraryId}`);

  if (state.expanded) {
    const content = result.content[0];
    if (content?.type === "text") {
      const lines = (content.text ?? "").split("\n");
      const relevantLines = lines.filter(
        (line) => line.startsWith("### ") || line.startsWith("```"),
      );
      for (const line of relevantLines.slice(0, 15)) {
        if (line.startsWith("### ")) {
          text += `\n${theme.fg("accent", line)}`;
        } else if (line.startsWith("```")) {
          text += `\n${theme.fg("muted", line)}`;
        }
      }
      if (relevantLines.length > 15) {
        text += `\n${theme.fg("muted", "... (more snippets)")}`;
      }
    }
  }

  return new Text(text, 0, 0);
}
