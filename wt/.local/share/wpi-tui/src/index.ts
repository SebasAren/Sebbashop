import {
  Container,
  Text,
  Spacer,
  TUI,
  ProcessTerminal,
  Input,
  type SelectItem,
  SelectList,
  type OverlayHandle,
} from "@mariozechner/pi-tui";
import { spawnSync } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

// ── ANSI helpers ──────────────────────────────────────────────────
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

// ── Config from environment ───────────────────────────────────────
const BRANCH = process.env.WPI_BRANCH ?? "";
const SOURCE_BRANCH = process.env.WPI_SOURCE_BRANCH ?? "";
const AGENT = process.env.WPI_AGENT ?? "pi";
const PI_ARGS = process.env.WPI_PI_ARGS
  ? process.env.WPI_PI_ARGS.split(" ").filter(Boolean)
  : [];
const DIRECTIVE_FILE = process.env.WPI_DIRECTIVE_FILE;
const HAS_BRANCH = Boolean(BRANCH);
const AGENT_LABEL = AGENT === "claude" ? "Claude" : "Pi";

// ── Current branch (may change as we switch worktrees) ────────────
function getCurrentBranch(): string {
  const result = spawnSync("git", ["branch", "--show-current"], {
    encoding: "utf-8",
    stdio: "pipe",
  });
  return (result.stdout ?? "").trim() || "???";
}

// ── Run command, handing terminal to subprocess ───────────────────
function runInteractive(
  tui: TUI,
  handle: OverlayHandle,
  command: string,
  args: string[],
  env?: Record<string, string>,
): number {
  handle.setHidden(true);
  tui.stop();
  process.stdout.write("\r\n");

  const result = spawnSync(command, args, {
    encoding: "utf-8",
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

  tui.start();
  handle.setHidden(false);
  tui.requestRender(true);

  return result.status ?? 1;
}

// ── Run wt with directive forwarding ──────────────────────────────
function runWt(tui: TUI, handle: OverlayHandle, args: string[]): number {
  const tmpFile = join(
    process.env.TMPDIR || "/tmp",
    `wpi-directive-${Date.now()}`,
  );
  writeFileSync(tmpFile, "");

  const result = runInteractive(tui, handle, "wt", args, {
    WORKTRUNK_DIRECTIVE_FILE: tmpFile,
  });

  // Forward directives to parent shell
  if (DIRECTIVE_FILE && existsSync(tmpFile)) {
    const content = readFileSync(tmpFile, "utf-8");
    if (content.trim()) {
      writeFileSync(DIRECTIVE_FILE, content, { flag: "a" });
    }
  }

  if (existsSync(tmpFile)) unlinkSync(tmpFile);
  return result;
}

// ── Run agent (pi or claude) via bash ─────────────────────────────
function runPi(
  tui: TUI,
  handle: OverlayHandle,
  extraArgs: string[] = [],
): number {
  const args = [...PI_ARGS, ...extraArgs];
  if (args.length > 0) {
    args.push(
      "IMPORTANT: Do NOT call 'wt merge' yourself. Only fix the code. The user will run the merge manually.",
    );
  }

  if (AGENT === "claude") {
    // claude doesn't use bash -c for @file syntax — pass args directly
    return runInteractive(tui, handle, "claude", ["--dangerously-skip-permissions", ...args]);
  }

  // Use bash -c so @file arguments are processed by pi's shell wrapper
  const cmd = `pi ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`;
  return runInteractive(tui, handle, "bash", ["-c", cmd]);
}

// ── Menu items ────────────────────────────────────────────────────
function buildMenuItems(): SelectItem[] {
  const items: SelectItem[] = [
    {
      value: "pi",
      label: AGENT_LABEL,
      description: `Launch ${AGENT} in '${getCurrentBranch()}'`,
    },
    {
      value: "review",
      label: "Review",
      description: `Diff review with nvim, then ${AGENT} if comments found`,
    },
  ];

  if (HAS_BRANCH) {
    items.push({
      value: "merge",
      label: "Merge",
      description: SOURCE_BRANCH
        ? `Squash-merge into '${SOURCE_BRANCH}'`
        : "Squash-merge into source branch",
    });
  }

  items.push({
    value: "exit",
    label: "Exit",
    description: HAS_BRANCH
      ? "Leave the wpi session (worktree is kept)"
      : "Leave the wpi session",
  });

  return items;
}

function theme() {
  return {
    selectedPrefix: (t: string) => cyan(t),
    selectedText: (t: string) => bold(t),
    description: (t: string) => dim(t),
    scrollInfo: (t: string) => dim(t),
    noMatch: (t: string) => dim(t),
  };
}

// ── Main ──────────────────────────────────────────────────────────
const terminal = new ProcessTerminal();
const tui = new TUI(terminal);
tui.start();

// Header
const header = new Container();
const headerBranch = BRANCH || getCurrentBranch();
header.addChild(
  new Text(
    `${bold("╲ wpi")} ${dim(`— ${headerBranch}`)} ${AGENT === "claude" ? dim("[claude]") : ""}`,
  ),
);
header.addChild(new Spacer(1));
header.addChild(new Text(dim("↑↓ Navigate  ↵ Select  Esc Quit")));
header.addChild(new Spacer(1));

// Status area for messages between actions
const statusContainer = new Container();

// Build menu
const menuItems = buildMenuItems();
const selectList = new SelectList(menuItems, menuItems.length, theme());

// Root container
const root = new Container();
root.addChild(header);
root.addChild(selectList);
root.addChild(new Spacer(1));
root.addChild(statusContainer);

const handle = tui.showOverlay(root, {
  anchor: "left-center",
  width: "80%",
  maxHeight: "90%",
});

tui.setFocus(selectList);

// ── Input mode for "Pi with prompt" ──────────────────────────────
let inputMode = false;
let inputCallback: ((value: string) => void) | null = null;
const inputField = new Input();
inputField.onEscape = () => {
  inputMode = false;
  tui.setFocus(selectList);
  tui.invalidate();
};
inputField.onSubmit = (value) => {
  inputMode = false;
  tui.setFocus(null);
  tui.invalidate();
  if (inputCallback) {
    inputCallback(value);
    inputCallback = null;
  }
};

// ── Status helper ─────────────────────────────────────────────────
function addStatus(message: string) {
  statusContainer.addChild(new Text(message));
  tui.invalidate();
}

// ── Refresh menu in-place ─────────────────────────────────────────
const menuRef: { current: SelectList } = { current: selectList };

function refreshMenu() {
  const items = buildMenuItems();
  const newList = new SelectList(items, items.length, theme());
  newList.onSelect = menuRef.current.onSelect;
  newList.onCancel = menuRef.current.onCancel;

  const idx = root.children.indexOf(menuRef.current);
  if (idx >= 0) root.children[idx] = newList;
  menuRef.current = newList;
  tui.setFocus(newList);
  tui.invalidate();
}

// ── Menu handler ──────────────────────────────────────────────────
selectList.onSelect = (item) => {
  const stage = item.value;

  switch (stage) {
    case "pi": {
      addStatus(yellow(`Starting ${AGENT}...`));
      runPi(tui, handle);
      addStatus(green(`✓ ${AGENT_LABEL} exited`));
      refreshMenu();
      break;
    }

    case "review": {
      // Step 1: Open nvim diff review
      const source = SOURCE_BRANCH || "main";
      const baseResult = spawnSync("git", ["merge-base", source, "HEAD"], {
        encoding: "utf-8",
        stdio: "pipe",
      });
      const mergeBase = (baseResult.stdout ?? "").trim();

      if (!mergeBase) {
        addStatus(red("✗ Could not determine merge base"));
        refreshMenu();
        break;
      }

      addStatus(yellow("Opening nvim diff review..."));
      runInteractive(
        tui,
        handle,
        "nvim",
        ["-c", `lua require('wt_review').open('${mergeBase}')`],
        { WPI_BASE_REF: mergeBase },
      );

      // Step 2: Check for review comments → feed to pi
      const reviewFile = ".code-review.md";
      if (existsSync(reviewFile) && readFileSync(reviewFile, "utf-8").trim()) {
        addStatus(yellow(`Review comments found — reopening ${AGENT}...`));
        runPi(tui, handle, [
          `@${reviewFile}`,
          "Apply these review comments. Fix each issue.",
        ]);
        unlinkSync(reviewFile);
        addStatus(green("✓ Review comments applied"));
      } else {
        if (existsSync(reviewFile)) unlinkSync(reviewFile);
        addStatus(green("✓ Review complete (no comments)"));
      }

      refreshMenu();
      break;
    }

    case "merge": {
      handleMerge(tui, handle);
      refreshMenu();
      break;
    }

    case "exit": {
      handle.hide();
      tui.stop();
      process.exit(0);
    }
  }
};

selectList.onCancel = () => {
  handle.hide();
  tui.stop();
  process.exit(0);
};

// ── Merge with retry-through-pi loop ──────────────────────────────
function handleMerge(tui: TUI, handle: OverlayHandle): void {
  const source = SOURCE_BRANCH || "";
  const currentBranch = getCurrentBranch();

  while (true) {
    addStatus(
      yellow(`Merging '${currentBranch}' → '${source || "default"}'...`),
    );

    // Stop TUI for the merge subprocess
    handle.setHidden(true);
    tui.stop();
    process.stdout.write("\r\n");

    const mergeArgs = ["merge", ...(source ? [source] : [])];
    const directiveTmp = join(
      process.env.TMPDIR || "/tmp",
      `wpi-directive-${Date.now()}`,
    );
    writeFileSync(directiveTmp, "");

    const mergeOutFile = `/tmp/wpi-merge-out-${Date.now()}`;
    writeFileSync(mergeOutFile, "");

    // stdin=inherit prevents hang, stdout/stderr captured to file for pi
    const mergeCmd = `wt ${mergeArgs.map((a) => `'${a.replace(/'/g, "'\''")}'`).join(" ")} > '${mergeOutFile}' 2>&1`;
    const result = spawnSync("bash", ["-c", mergeCmd], {
      encoding: "utf-8",
      stdio: ["inherit", "inherit", "inherit"],
      env: {
        ...process.env,
        WORKTRUNK_DIRECTIVE_FILE: directiveTmp,
      },
    });

    // Forward directives
    if (DIRECTIVE_FILE && existsSync(directiveTmp)) {
      const content = readFileSync(directiveTmp, "utf-8");
      if (content.trim()) {
        writeFileSync(DIRECTIVE_FILE, content, { flag: "a" });
      }
    }
    if (existsSync(directiveTmp)) unlinkSync(directiveTmp);

    // Restart TUI
    tui.start();
    handle.setHidden(false);
    tui.requestRender(true);

    if ((result.status ?? 1) === 0) {
      if (existsSync(mergeOutFile)) unlinkSync(mergeOutFile);
      handle.hide();
      tui.stop();
      process.stdout.write(
        `\r\n${green(`✓ Merged into '${source || "default"}'`)}\r\n`,
      );
      process.exit(0);
    }

    // Merge failed — pass wt merge output to pi
    addStatus(red(`✗ Merge failed (exit ${result.status})`));
    addStatus(dim(`Opening ${AGENT} to resolve...`));

    const mergeOutput = existsSync(mergeOutFile)
      ? readFileSync(mergeOutFile, "utf-8").trim()
      : "(no output captured)";

    const promptFile = `/tmp/wpi-merge-err-${Date.now()}`;
    writeFileSync(
      promptFile,
      `wt merge failed with exit code ${result.status}.

Output:
${mergeOutput}

Diagnose and fix the failure. Common causes:
- Test or lint failures in pre-merge hooks — fix the code
- Rebase conflicts — resolve conflicts and complete the rebase
- Uncommitted changes — commit or revert them

Do NOT run 'wt merge' yourself. Only fix the code. The user will retry.`,
    );

    runPi(tui, handle, [`@${promptFile}`]);
    unlinkSync(promptFile);
    if (existsSync(mergeOutFile)) unlinkSync(mergeOutFile);

    addStatus(green(`✓ ${AGENT_LABEL} exited — returning to menu`));
    addStatus(dim("Select Merge to retry"));
    return;
  }
}

// ── Custom render for input mode ──────────────────────────────────
const originalRender = root.render.bind(root);
root.render = function (width: number): string[] {
  const lines = originalRender(width);

  if (inputMode) {
    const inputLines = inputField.render(width);
    const promptLine = `${bold("Prompt:")} ${inputLines[0] || ""}`;
    const headerEnd = 4;
    if (lines.length > headerEnd) {
      lines.splice(headerEnd, lines.length - headerEnd, promptLine);
    }
  }

  return lines;
};

root.invalidate = function () {
  for (const child of root.children) {
    child.invalidate?.();
  }
  inputField.invalidate?.();
  tui.requestRender();
};

// ── Process signals ───────────────────────────────────────────────
process.on("SIGINT", () => {
  handle.hide();
  tui.stop();
  process.exit(0);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  handle.hide();
  tui.stop();
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  handle.hide();
  tui.stop();
  process.exit(1);
});
