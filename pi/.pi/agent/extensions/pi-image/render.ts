/**
 * Pi Image Generation Extension — TUI renderers.
 */

import { type Component, Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";

/** Parameters for the generate_image tool call. */
export interface GenerateImageCallArgs {
  prompt: string;
  quality?: string;
  aspect_ratio?: string;
}

/** Details in the generate_image tool result. */
export interface GenerateImageDetails {
  model: string;
  aspectRatio: string;
  sizeBytes: number;
  path: string;
}

/** Render the generate_image tool call. */
export function renderCall(
  args: GenerateImageCallArgs,
  theme: Theme,
  context: { lastComponent?: Component },
): Text {
  const quality = args.quality || "fast";
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  text.setText(
    theme.fg("toolTitle", theme.bold("Generate Image ")) +
      theme.fg("dim", args.prompt) +
      theme.fg("muted", ` [${quality}]`),
  );
  return text;
}

/** Render the generate_image tool result. */
export function renderResult(
  result: {
    content: Array<{ type: string; text?: string }>;
    details?: GenerateImageDetails;
  },
  _state: { expanded: boolean; isPartial: boolean },
  _theme: Theme,
  context: { lastComponent?: Component },
): Text {
  const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
  const d = result.details;
  if (d) {
    text.setText(`Generated: ${d.path} (${d.model}, ${d.aspectRatio}, ${d.sizeBytes} bytes)`);
  } else {
    text.setText("Generated image (no details)");
  }
  return text;
}
