/**
 * Wiki Stash Extension
 *
 * Persist knowledge from conversation into the Obsidian wiki without
 * interrupting the current conversation. A `/stash` command spawns a
 * subagent directly — the parent model is never involved.
 *
 * Uses the active model and full conversation context so the subagent
 * understands where the knowledge came from.
 *
 * Usage:
 *   /stash <knowledge>  — quick capture
 *   /stash              — shows usage hint
 */

import {
  type AgentSession,
  type ExtensionAPI,
  AuthStorage,
  BorderedLoader,
  convertToLlm,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  serializeConversation,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import type { CreateAgentSessionOptions } from "@mariozechner/pi-coding-agent";

import { resolveRealCwd, runSubagent } from "@pi-ext/shared";

import { STASH_SYSTEM_PROMPT } from "./constants";

// ── Shared infrastructure (reused across subagent runs) ────────────────────

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

/** Create an AgentSession for the wiki-stash subagent, using the given model. */
async function createStashSession(
  systemPrompt: string,
  cwd: string,
  modelName?: string,
): Promise<AgentSession> {
  const { authStorage, modelRegistry, settingsManager } = getSharedInfrastructure();

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    systemPromptOverride: () => systemPrompt,
    // No extensions or skills — keep the subagent focused
    additionalExtensionPaths: [],
  });
  await loader.reload();

  // Resolve model from name (passed through from parent session's ctx.model)
  let model: any;
  if (modelName) {
    if (modelName.includes("/")) {
      const slashIdx = modelName.indexOf("/");
      model = modelRegistry.find(modelName.slice(0, slashIdx), modelName.slice(slashIdx + 1));
    } else {
      model = modelRegistry.getAll().find((m) => m.id === modelName);
    }
  }

  const opts: CreateAgentSessionOptions = {
    cwd,
    // Tools the subagent needs to read/write wiki pages and search
    tools: ["read", "write", "edit", "bash", "grep", "find"],
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

// ── Default config ─────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOOL_CALLS = 20;

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("stash", {
    description: "Persist knowledge to wiki (non-interrupting)",
    handler: async (args, ctx) => {
      const knowledge = args.trim();
      if (!knowledge) {
        ctx.ui.notify("Usage: /stash <knowledge to persist>", "info");
        return;
      }

      // Get the active model
      const modelStr = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;

      // Serialize the full conversation
      let conversationText = "";
      try {
        const branch = ctx.sessionManager.getBranch();
        const messages = branch
          .filter((entry): entry is typeof entry & { type: "message" } => entry.type === "message")
          .map((entry) => entry.message);

        if (messages.length > 0) {
          const llmMessages = convertToLlm(messages);
          conversationText = serializeConversation(llmMessages);
        }
      } catch {
        // Context gathering is best-effort
      }

      // Build the query for the subagent
      const wikiDir = `${process.env.HOME}/Documents/wiki`;
      let query = `## Knowledge to persist\n\n${knowledge}`;

      if (conversationText) {
        query += `\n\n## Full conversation context\n\n${conversationText}`;
      }

      query += `\n\n[Constraints: max ${DEFAULT_MAX_TOOL_CALLS} tool calls, wiki at ${wikiDir}]`;

      // Run subagent with loading UI
      const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
        const loader = new BorderedLoader(tui, theme, "Stashing to wiki...");
        loader.onAbort = () => done(null);

        const doRun = async () => {
          const realCwd = resolveRealCwd(ctx.cwd);

          try {
            const subResult = await runSubagent({
              cwd: realCwd,
              query,
              model: modelStr,
              systemPrompt: STASH_SYSTEM_PROMPT,
              createSession: createStashSession,
              timeoutMs: DEFAULT_TIMEOUT_MS,
              loopDetection: true,
              maxToolCalls: DEFAULT_MAX_TOOL_CALLS,
            });

            const isError = subResult.exitCode !== 0 || !!subResult.errorMessage;
            if (isError) {
              const errorMsg =
                subResult.errorMessage || subResult.stderr || subResult.output || "(no output)";
              return `✗ stash failed: ${errorMsg}`;
            } else {
              return subResult.output || "(no output)";
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return `✗ stash error: ${message}`;
          }
        };

        doRun()
          .then(done)
          .catch(() => done(null));

        return loader;
      });

      // Show result notification
      if (result === null) {
        ctx.ui.notify("Stash cancelled.", "info");
      } else if (result.startsWith("✗")) {
        ctx.ui.notify(result, "error");
      } else {
        // Show first line as notification, full result available in loader
        const firstLine = result.split("\n").find((l: string) => l.trim()) || "Done";
        ctx.ui.notify(`✓ stash: ${firstLine}`, "info");
      }
    },
  });
}
