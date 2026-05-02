import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getLastAssistantMessage } from "./getLastAssistantMessage";
import { htmlToPng } from "./htmlToPng";
import { markdownToHtml } from "./markdownToHtml";
import { copyToClipboard } from "./copyToClipboard";

export interface PipelineDeps {
  getLastAssistantMessage: typeof getLastAssistantMessage;
  htmlToPng: typeof htmlToPng;
  markdownToHtml: typeof markdownToHtml;
  copyToClipboard: typeof copyToClipboard;
}

interface HandlerContext {
  sessionManager: { getBranch: () => any[] };
  hasUI: boolean;
  ui: { notify: (message: string, level: "error" | "warning" | "info") => void };
}

function runExtract(ctx: HandlerContext, notifyNoUI: boolean, deps: PipelineDeps): Promise<void> {
  const entries = ctx.sessionManager.getBranch();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  const text = deps.getLastAssistantMessage(entries);

  if (!text) {
    ctx.ui.notify("No assistant message found to extract", "error");
    return Promise.resolve();
  }

  if (!ctx.hasUI) {
    if (notifyNoUI) {
      ctx.ui.notify("Extract requires interactive mode", "error");
    }
    return Promise.resolve();
  }

  ctx.ui.notify("Extracting last assistant message...", "info");

  return (async () => {
    try {
      const html = deps.markdownToHtml(text);
      const png = await deps.htmlToPng(html);
      deps.copyToClipboard(png);
      ctx.ui.notify("Message copied to clipboard", "info");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Extract failed: ${message}`, "error");
    }
  })();
}

/**
 * Create the extract-share extension with injectable pipeline dependencies.
 * Used by tests to provide mock implementations without `mock.module()`.
 */
export function createExtension(deps: PipelineDeps) {
  return function (pi: ExtensionAPI) {
    pi.registerCommand("extract", {
      description: "Take a screenshot of the last assistant message and copy to clipboard",
      handler: async (_args, ctx) => runExtract(ctx as HandlerContext, true, deps),
    });

    pi.registerShortcut("ctrl+shift+e", {
      description: "Take a screenshot of the last assistant message and copy to clipboard",
      handler: async (ctx) => runExtract(ctx as HandlerContext, false, deps),
    });
  };
}

export default function (pi: ExtensionAPI) {
  createExtension({
    getLastAssistantMessage,
    htmlToPng,
    markdownToHtml,
    copyToClipboard,
  })(pi);
}
