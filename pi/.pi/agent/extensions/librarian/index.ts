/**
 * Librarian Subagent — delegate documentation research to a separate model
 *
 * Creates an in-process AgentSession with web_search (Exa) and context7 tools
 * to research external documentation. The model is configurable via CHEAP_MODEL env var.
 */

import { type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type AgentSession,
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { CreateAgentSessionOptions } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

import { resolveRealCwd, runSubagent, getModel } from "@pi-ext/shared";

import { LIBRARIAN_SYSTEM_PROMPT } from "./constants";
import { renderCall, renderResult } from "./render";

// ── Session factory ────────────────────────────────────────────────────────

/** Shared auth/model infrastructure (created once, reused across subagent runs). */
let authStorage: AuthStorage | undefined;
let modelRegistry: ModelRegistry | undefined;
let settingsManager: SettingsManager | undefined;

function getSharedInfrastructure() {
  if (!authStorage) authStorage = AuthStorage.create();
  if (!modelRegistry) modelRegistry = ModelRegistry.create(authStorage);
  if (!settingsManager)
    settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  return { authStorage, modelRegistry, settingsManager };
}

/** Resolve a model name (e.g. "provider/model-id") to a Model object, or undefined. */
function resolveModel(modelName?: string): any {
  const name = modelName || getModel();
  if (!name) return undefined;

  const { modelRegistry } = getSharedInfrastructure();

  // Try "provider/model-id" format
  if (name.includes("/")) {
    const slashIdx = name.indexOf("/");
    const provider = name.slice(0, slashIdx);
    const modelId = name.slice(slashIdx + 1);
    return modelRegistry.find(provider, modelId);
  }

  // Try matching against all available models by id
  const all = modelRegistry.getAll();
  return all.find((m) => m.id === name);
}

/** Create an AgentSession for the librarian subagent with web research tools. */
async function createLibrarianSession(
  systemPrompt: string,
  cwd: string,
  modelName?: string,
): Promise<AgentSession> {
  const { authStorage, modelRegistry, settingsManager } = getSharedInfrastructure();

  // Use DefaultResourceLoader to discover extensions (exa-search, context7)
  // but skip built-in tools, skills, and prompts — librarian only needs
  // web_search, web_fetch, context7_search, context7_docs from extensions.
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
    // No additionalExtensionPaths — let DefaultResourceLoader discover
    // extensions from ~/.pi/agent/extensions/ and .pi/extensions/ normally
  });
  await loader.reload();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const model = resolveModel(modelName);

  const opts: CreateAgentSessionOptions = {
    cwd,
    // Explicitly allowlist only the extension tools the librarian needs.
    // This prevents the librarian subagent from calling itself (recursion)
    // and disables built-in filesystem tools that don't belong here.
    tools: [
      "web_search",
      "web_fetch",
      "context7_search",
      "context7_docs",
      "wiki_search",
      "wiki_read",
    ],
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
    resourceLoader: loader,
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  if (model) opts.model = model;

  const { session } = await createAgentSession(opts);
  return session;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface LibrarianDetails {
  model?: string;
  usedModel?: string;
  query?: string;
  library?: string;
  focus?: string;
  success?: boolean;
  usage?: { input: number; output: number; turns: number; cost: number; contextTokens: number };
  [key: string]: unknown;
}

// ── Tool parameters ────────────────────────────────────────────────────────

const LibrarianParams = Type.Object({
  query: Type.String({
    description: "What documentation or information to look for. Be specific about what you need.",
  }),
  library: Type.Optional(
    Type.String({
      description:
        "Specific library or framework name to search for (e.g., 'react', 'next.js', 'tanstack-query')",
    }),
  ),
  focus: Type.Optional(
    Type.String({
      description: "What to focus on: docs, examples, api, best-practices, or changelog",
    }),
  ),
  maxToolCalls: Type.Optional(
    Type.Number({ description: "Override the tool call limit (default: 60)" }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({ description: "Override timeout in ms (default: 240000)" }),
  ),
});

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "librarian",
    label: "Librarian",
    description: [
      "Delegate documentation research to a subagent with access to web search (Exa), library docs (Context7), and your personal wiki.",
      "Useful for looking up APIs, finding examples, checking best practices, reading external docs, and consulting your curated wiki knowledge.",
      "The librarian agent can search the web, fetch library documentation, and search/read pages from your personal wiki.",
      "You may call librarian up to 4 times in parallel to research different topics simultaneously.",
    ].join(" "),
    promptSnippet: "Research external documentation using web search and Context7",
    promptGuidelines: [
      "Use librarian when you need up-to-date documentation, API references, or examples from external sources.",
      "When relevant, the librarian can also search your personal wiki (wiki_search) and read curated pages (wiki_read).",
      "Prefer librarian over web_search directly when you need the agent to synthesize findings from multiple sources.",
      "Call librarian up to 4 times in parallel when researching multiple independent topics or libraries.",
      "Requires EXA_API_KEY and/or CONTEXT7_API_KEY environment variables to be set.",
      "Uses wiki at ~/Documents/wiki/ automatically if tools are available — no extra config needed.",
    ],
    parameters: LibrarianParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const realCwd = resolveRealCwd(ctx.cwd);
      // Build a focused query incorporating library and focus if provided
      let query = params.query;
      if (params.library) {
        query = `Research the ${params.library} library: ${query}`;
      }
      if (params.focus) {
        query += ` Focus on ${params.focus}.`;
      }
      query +=
        `\n\n[CRITICAL: Your final assistant turn MUST contain a plain-text message with ` +
        `## Sources, ## Documentation, ## Key Findings, and ## Recommendations sections. ` +
        `Stop calling tools once you have enough information and write the summary. ` +
        `A final turn with only tool calls is a failed response.]`;

      const maxToolCalls = params.maxToolCalls ?? 60;
      const timeoutMs = params.timeoutMs ?? 240_000;

      const result = await runSubagent({
        cwd: realCwd,
        query,
        systemPrompt: LIBRARIAN_SYSTEM_PROMPT,
        createSession: createLibrarianSession,
        timeoutMs,
        signal,
        onUpdate: onUpdate
          ? (update) => {
              onUpdate({
                content: [{ type: "text", text: update.text }],
                details: {
                  model: getModel(),
                  query: params.query,
                  recentCalls: update.recentCalls,
                },
              });
            }
          : undefined,
        loopDetection: true,
        maxToolCalls,
      });

      const isError = result.exitCode !== 0 || !!result.errorMessage;
      if (isError) {
        const errorMsg = result.errorMessage || result.stderr || result.output || "(no output)";
        // Provide helpful error for missing API keys
        if (errorMsg.includes("EXA_API_KEY") || errorMsg.includes("CONTEXT7_API_KEY")) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Librarian requires API keys. Set environment variables:\n` +
                  `  export EXA_API_KEY='your-key'          # For web search\n` +
                  `  export CONTEXT7_API_KEY='your-key'     # For library docs\n` +
                  `\nOriginal error: ${errorMsg}`,
              },
            ],
            details: {
              model: getModel(),
              query: params.query,
              usage: result.usage,
              success: false,
            },
          };
        }
        return {
          content: [{ type: "text", text: `Librarian failed: ${errorMsg}` }],
          details: {
            model: getModel(),
            query: params.query,
            usage: result.usage,
            success: false,
          },
        };
      }

      return {
        content: [{ type: "text", text: result.output || "(no output)" }],
        details: {
          model: getModel(),
          usedModel: result.model,
          query: params.query,
          library: params.library,
          focus: params.focus,
          usage: result.usage,
        },
      };
    },

    renderCall(args, theme, context) {
      return renderCall(args, theme, context, getModel());
    },

    renderResult(result, state, theme, context) {
      return renderResult(
        result as unknown as Parameters<typeof renderResult>[0],
        state,
        theme,
        context,
      );
    },
  });

  // Register /librarian command for interactive use
  pi.registerCommand("librarian", {
    description: "Research external documentation interactively",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify(
          "Usage: /librarian <query>  (e.g. /librarian how to use React Server Components)",
          "info",
        );
        return;
      }
      pi.sendUserMessage(`Use the librarian tool to research: ${args}`, {
        deliverAs: ctx.isIdle() ? undefined : "followUp",
      });
    },
  });
}
