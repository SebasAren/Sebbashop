/**
 * Wiki Lint Extension — TUI renderers.
 */

import { type Component, Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { WikiLintDetails } from "./index";

/** Render the wiki_lint tool call. */
export function renderLintCall(
  args: { checks?: string[] },
  theme: Theme,
  context: { lastComponent?: Component },
): Text {
  let content = theme.fg("toolTitle", theme.bold("wiki_lint"));
  if (args.checks && args.checks.length > 0) {
    content += theme.fg("muted", ` [${args.checks.join(", ")}]`);
  } else {
    content += theme.fg("dim", " [all checks]");
  }

  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  text.setText(content);
  return text;
}

/** Render the wiki_lint tool result. */
export function renderLintResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: WikiLintDetails;
  },
  state: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Text {
  if (state.isPartial) {
    return new Text(theme.fg("warning", "Linting wiki..."), 0, 0);
  }

  const details = result.details;

  if (!details) {
    const content = result.content[0];
    if (content?.type === "text") {
      return new Text(theme.fg("error", (content.text ?? "").slice(0, 100)), 0, 0);
    }
    return new Text(theme.fg("error", "Wiki lint failed"), 0, 0);
  }

  const icon =
    details.totalIssues === 0
      ? theme.fg("success", "✓")
      : details.totalIssues <= 5
        ? theme.fg("warning", "⚠")
        : theme.fg("error", "✗");

  let text = `${icon} ${theme.fg("toolTitle", theme.bold("wiki_lint"))}`;
  text += theme.fg("dim", ` ${details.totalIssues} issue${details.totalIssues === 1 ? "" : "s"}`);
  text += theme.fg("dim", ` (${details.checksRun} check${details.checksRun === 1 ? "" : "s"})`);

  if (state.expanded) {
    for (const checkResult of details.results) {
      const checkIcon =
        checkResult.issues.length === 0 ? theme.fg("success", "✓") : theme.fg("warning", "⚠");
      text += `\n  ${checkIcon} ${checkResult.check}: ${checkResult.issues.length}`;
      for (const issue of checkResult.issues.slice(0, 5)) {
        text += `\n    ${theme.fg("dim", `• ${issue.message}`)}`;
      }
      if (checkResult.issues.length > 5) {
        text += `\n    ${theme.fg("muted", `... +${checkResult.issues.length - 5} more`)}`;
      }
    }
  }

  return new Text(text, 0, 0);
}
