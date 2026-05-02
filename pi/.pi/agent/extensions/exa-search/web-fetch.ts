/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
/**
 * Web fetch tool — schema, types, and execute logic.
 *
 * The Exa SDK returns `any`-typed responses throughout, making these
 * lint rules unavoidably noisy. See pi-extensions.md §exa-js Typing.
 */

import Exa from "exa-js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@mariozechner/pi-coding-agent";

// ── Types ──────────────────────────────────────────────────────────────────

export interface WebFetchDetails {
  urls: string[];
  format: string;
  successCount: number;
  errorCount: number;
  truncated: boolean;
}

// ── Schema ─────────────────────────────────────────────────────────────────

import { Type } from "typebox";
import { StringEnum } from "@mariozechner/pi-ai";

export const WebFetchParams = Type.Object({
  urls: Type.Array(Type.String(), {
    description: "URLs to fetch parsed content from (1-5 URLs)",
    minItems: 1,
    maxItems: 5,
  }),
  format: Type.Optional(
    StringEnum(["text", "highlights", "summary"], {
      description:
        "Content format: text (full parsed page), highlights (key excerpts), summary (LLM-generated abstract). Default: text",
    }),
  ),
  query: Type.Optional(
    Type.String({
      description:
        "Query to focus content extraction. Used by 'highlights' and 'summary' modes to find relevant passages.",
    }),
  ),
  maxCharacters: Type.Optional(
    Type.Number({
      description: "Max characters per URL (default: 10000). Controls token usage and cost.",
    }),
  ),
});

// ── Execute ────────────────────────────────────────────────────────────────

export async function executeWebFetch(
  params: {
    urls: string[];
    format?: string;
    query?: string;
    maxCharacters?: number;
  },
  exa: Exa,
  signal?: AbortSignal,
  onUpdate?: (update: {
    content: Array<{ type: "text"; text: string }>;
    details: WebFetchDetails;
  }) => void,
) {
  const { urls, format = "text", query, maxCharacters = 10000 } = params;

  const urlList = urls.slice(0, 5);
  onUpdate?.({
    content: [{ type: "text" as const, text: `Fetching ${urlList.length} page(s)...` }],
    details: { urls: urlList, format, successCount: 0, errorCount: 0, truncated: false },
  });

  try {
    // Build content options based on format — cast to avoid generic inference issues
    // since format is dynamic and TypeScript can't resolve ContentsResultComponent
    const contentOptions: any = {};

    if (format === "text") {
      contentOptions.text = { maxCharacters };
    } else if (format === "highlights") {
      contentOptions.highlights = {
        query: query ?? "",
        numSentences: Math.ceil(maxCharacters / 200),
        highlightsPerUrl: 5,
      };
    } else if (format === "summary") {
      contentOptions.summary = {
        query: query ?? "",
      };
    }

    const response: any = await exa.getContents(urlList, contentOptions);

    if (signal?.aborted) {
      return {
        content: [{ type: "text" as const, text: "Fetch cancelled" }],
        details: { urls: urlList, format, successCount: 0, errorCount: 0, truncated: false },
      };
    }

    // Build error map from statuses — Status type lacks error field in types but API returns it
    const errorMap = new Map<string, string>();
    if (response.statuses) {
      for (const s of response.statuses) {
        if (s.status === "error") {
          errorMap.set(s.id, s.error?.tag || "unknown error");
        }
      }
    }

    // Format output
    let output = "";
    let successCount = 0;
    let errorCount = 0;

    for (const result of response.results) {
      const error = errorMap.get(result.id);
      if (error) {
        errorCount++;
        output += `## ${result.title ?? "Untitled"}\n`;
        output += `URL: ${result.url}\n`;
        output += `**Error: ${error}**\n\n`;
        continue;
      }

      successCount++;
      output += `## ${result.title ?? "Untitled"}\n`;
      output += `URL: ${result.url}\n`;
      if (result.publishedDate) output += `Published: ${result.publishedDate}\n`;
      if (result.author) output += `Author: ${result.author}\n`;
      output += "\n";

      if (format === "text" && result.text) {
        output += result.text;
      } else if (format === "highlights" && result.highlights?.length) {
        output += result.highlights.join("\n\n");
      } else if (format === "summary" && result.summary) {
        output += result.summary;
      } else {
        output += "(no content available)";
      }
      output += "\n\n";
    }

    // Apply truncation
    const truncation = truncateHead(output, {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: DEFAULT_MAX_BYTES,
    });

    let finalOutput = truncation.content;
    if (truncation.truncated) {
      finalOutput += `\n\n[Content truncated. Reduce maxCharacters or fetch fewer URLs for complete results.]`;
    }

    return {
      content: [{ type: "text" as const, text: finalOutput }],
      details: {
        urls: urlList,
        format,
        successCount,
        errorCount,
        truncated: truncation.truncated,
      } satisfies WebFetchDetails,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Exa getContents failed: ${errorMessage}`, { cause: error });
  }
}
