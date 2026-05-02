/**
 * Exa Web Search Extension
 *
 * Provides web search and fetch capabilities using the Exa API.
 * Search type: auto (balanced relevance and speed)
 * Content: highlights (compact, token-efficient)
 */

import Exa from "exa-js";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { WebSearchParams, executeWebSearch } from "./web-search";
import { WebFetchParams, executeWebFetch } from "./web-fetch";
import { renderSearchCall, renderSearchResult, renderFetchCall, renderFetchResult } from "./render";

export default function (pi: ExtensionAPI) {
  // Get API key from environment
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    console.warn(
      "[exa-search] EXA_API_KEY not set. Web search tool will not work. Set it via: export EXA_API_KEY='your-key'",
    );
  }

  const exa = apiKey ? new Exa(apiKey) : null;

  // ── web_search tool ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web using Exa. Returns relevant results with titles, URLs, and highlights. " +
      "Great for finding current information, documentation, news, and research.",
    promptSnippet: "Search the web for current information using Exa",
    promptGuidelines: [
      "Use this tool when you need current information not in your training data",
      "Use for finding documentation, tutorials, API references, and best practices",
      "Use to verify facts or get the latest news and developments",
      "Use 'category' filter when searching for specific content types (news, research papers, etc.)",
    ],
    parameters: WebSearchParams,

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (!exa) {
        throw new Error("EXA_API_KEY not set. Please set it via: export EXA_API_KEY='your-key'");
      }

      return executeWebSearch(params, exa, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      return renderSearchCall(args, theme, context);
    },

    renderResult(result, state, theme, _context) {
      return renderSearchResult(
        result as unknown as Parameters<typeof renderSearchResult>[0],
        state,
        theme,
      );
    },
  });

  // ── web_fetch tool ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch and parse web page content from URLs. Returns clean, LLM-ready content " +
      "(text, highlights, or summary). Use after web_search to read specific pages in detail, " +
      "or to fetch a known documentation URL directly.",
    promptSnippet: "Fetch and parse web page content from URLs",
    promptGuidelines: [
      "Use web_fetch after web_search to read the full content of relevant results",
      "Use web_fetch when you need detailed page content, not just search highlights",
      "Use 'highlights' format with a query for the most token-efficient extraction",
      "Use 'summary' format for quick overviews of long pages",
    ],
    parameters: WebFetchParams,

    async execute(_toolCallId, params, signal, onUpdate, _ctx) {
      if (!exa) {
        throw new Error("EXA_API_KEY not set. Please set it via: export EXA_API_KEY='your-key'");
      }

      return executeWebFetch(params, exa, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      return renderFetchCall(args, theme, context);
    },

    renderResult(result, state, theme, _context) {
      return renderFetchResult(
        result as unknown as Parameters<typeof renderFetchResult>[0],
        state,
        theme,
      );
    },
  });

  // Register a quick search command
  pi.registerCommand("search", {
    description: "Quick web search using Exa",
    handler: async (args, ctx) => {
      if (!args) {
        ctx.ui.notify("Usage: /search <query>", "warning");
        return;
      }
      pi.sendUserMessage(`Search the web for: ${args}`, { deliverAs: "followUp" });
    },
  });
}
