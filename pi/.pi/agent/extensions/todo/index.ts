/**
 * Todo Extension - State management via session entries
 *
 * Registers a `todo` tool for the LLM to manage todos and a `/todos` command
 * for users to view the list in a TUI overlay. State is stored in tool result
 * details so it branches correctly with the conversation tree.
 */

import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "typebox";

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

interface TodoDetails {
  action: "list" | "add" | "toggle" | "clear";
  todos: Todo[];
  nextId: number;
  error?: string;
}

const TodoParams = Type.Object({
  action: StringEnum(["list", "add", "toggle", "clear"] as const),
  texts: Type.Optional(Type.Array(Type.String({ description: "Todo texts to add" }))),
  id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
});

class TodoListComponent {
  private todos: Todo[];
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(todos: Todo[], theme: Theme, onClose: () => void) {
    this.todos = todos;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const th = this.theme;

    lines.push("");
    const title = th.fg("accent", " Todos ");
    const headerLine =
      th.fg("borderMuted", "─".repeat(3)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 10)));
    lines.push(truncateToWidth(headerLine, width));
    lines.push("");

    if (this.todos.length === 0) {
      lines.push(
        truncateToWidth(`  ${th.fg("dim", "No todos yet. Ask the agent to add some!")}`, width),
      );
    } else {
      const done = this.todos.filter((t) => t.done).length;
      const total = this.todos.length;
      lines.push(truncateToWidth(`  ${th.fg("muted", `${done}/${total} completed`)}`, width));
      lines.push("");

      for (const todo of this.todos) {
        const check = todo.done ? th.fg("success", "✓") : th.fg("dim", "○");
        const id = th.fg("accent", `#${todo.id}`);
        const text = todo.done ? th.fg("dim", todo.text) : th.fg("text", todo.text);
        lines.push(truncateToWidth(`  ${check} ${id} ${text}`, width));
      }
    }

    lines.push("");
    lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export default function (pi: ExtensionAPI) {
  let todos: Todo[] = [];
  let nextId = 1;

  const reconstructState = (ctx: ExtensionContext) => {
    todos = [];
    nextId = 1;

    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "toolResult" || msg.toolName !== "todo") continue;

      const details = msg.details as TodoDetails | undefined;
      if (details) {
        todos = details.todos;
        nextId = details.nextId;
      }
    }
  };

  pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
  pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

  pi.registerTool({
    name: "todo",
    label: "Todo",
    description: "Manage a todo list. Actions: list, add (texts), toggle (id), clear.",
    parameters: TodoParams,

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      switch (params.action) {
        case "list":
          return {
            content: [
              {
                type: "text",
                text: todos.length
                  ? todos.map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`).join("\n")
                  : "No todos",
              },
            ],
            details: { action: "list", todos: [...todos], nextId } as TodoDetails,
          };

        case "add": {
          if (!params.texts?.length) {
            return {
              content: [{ type: "text", text: "Error: texts required for add" }],
              details: {
                action: "add",
                todos: [...todos],
                nextId,
                error: "texts required",
              } as TodoDetails,
            };
          }
          const added: Todo[] = [];
          for (const t of params.texts) {
            const newTodo: Todo = { id: nextId++, text: t, done: false };
            todos.push(newTodo);
            added.push(newTodo);
          }
          const summary =
            added.length === 1
              ? `Added todo #${added[0].id}: ${added[0].text}`
              : `Added ${added.length} todos:\n` +
                added.map((t) => `  #${t.id}: ${t.text}`).join("\n");
          return {
            content: [{ type: "text", text: summary }],
            details: { action: "add", todos: [...todos], nextId } as TodoDetails,
          };
        }

        case "toggle": {
          if (params.id === undefined) {
            return {
              content: [{ type: "text", text: "Error: id required for toggle" }],
              details: {
                action: "toggle",
                todos: [...todos],
                nextId,
                error: "id required",
              } as TodoDetails,
            };
          }
          const todo = todos.find((t) => t.id === params.id);
          if (!todo) {
            return {
              content: [{ type: "text", text: `Todo #${params.id} not found` }],
              details: {
                action: "toggle",
                todos: [...todos],
                nextId,
                error: `#${params.id} not found`,
              } as TodoDetails,
            };
          }
          todo.done = !todo.done;
          return {
            content: [
              { type: "text", text: `Todo #${todo.id} ${todo.done ? "completed" : "uncompleted"}` },
            ],
            details: { action: "toggle", todos: [...todos], nextId } as TodoDetails,
          };
        }

        case "clear": {
          const count = todos.length;
          todos = [];
          nextId = 1;
          return {
            content: [{ type: "text", text: `Cleared ${count} todos` }],
            details: { action: "clear", todos: [], nextId: 1 } as TodoDetails,
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown action: ${String(params.action)}` }],
            details: {
              action: "list",
              todos: [...todos],
              nextId,
              error: `unknown action: ${String(params.action)}`,
            } as TodoDetails,
          };
      }
    },

    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
      if (args.texts?.length) {
        text += ` ${theme.fg("dim", `${args.texts.length} item(s)`)} ${theme.fg("muted", args.texts.map((t: string) => `"${t}"`).join(", "))}`;
      }
      if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme, _context) {
      const details = result.details as TodoDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const todoList = details.todos;

      switch (details.action) {
        case "list": {
          if (todoList.length === 0) {
            return new Text(theme.fg("dim", "No todos"), 0, 0);
          }
          let listText = theme.fg("muted", `${todoList.length} todo(s):`);
          const display = expanded ? todoList : todoList.slice(0, 5);
          for (const t of display) {
            const check = t.done ? theme.fg("success", "✓") : theme.fg("dim", "○");
            const itemText = t.done ? theme.fg("dim", t.text) : theme.fg("muted", t.text);
            listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
          }
          if (!expanded && todoList.length > 5) {
            listText += `\n${theme.fg("dim", `... ${todoList.length - 5} more`)}`;
          }
          return new Text(listText, 0, 0);
        }

        case "add": {
          const rawText = result.content[0];
          const msg = rawText?.type === "text" ? rawText.text : "";
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
        }

        case "toggle": {
          const text = result.content[0];
          const msg = text?.type === "text" ? text.text : "";
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
        }

        case "clear":
          return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Cleared all todos"), 0, 0);
      }
    },
  });

  pi.registerCommand("todos", {
    description: "Show all todos on the current branch",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/todos requires interactive mode", "error");
        return;
      }

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new TodoListComponent(todos, theme, () => done());
      });
    },
  });
}
