# SebbaFlow

[![test](https://github.com/SebasAren/SebbaFlow/actions/workflows/test.yml/badge.svg)](https://github.com/SebasAren/SebbaFlow/actions/workflows/test.yml)
[![GNU Stow](https://img.shields.io/badge/managed%20with-GNU%20Stow-blue)](https://www.gnu.org/software/stow/)
[![mise](https://img.shields.io/badge/runtimes-mise-green)](https://mise.jdx.dev/)
[![Pi Agent](https://img.shields.io/badge/AI-Pi%20Agent%20Extensions-orange)](https://github.com/mariozechner/pi-coding-agent)

Linux workstation config, managed with [GNU Stow](https://www.gnu.org/software/stow/) for symlink-based installation.

Includes [Pi agent extensions](#pi-agent-extensions) that delegate codebase exploration and documentation lookup to cheaper models via subagents, and write notes to an Obsidian wiki between sessions.

## What's Inside

| Directory | Tool | Purpose |
|-----------|------|---------|
| `kitty/` | **Kitty** | GPU-accelerated terminal + native multiplexer (replaces tmux + Ghostty). Inline images in pi Just Work™ → [details](kitty/README.md) |
| `pi/` | **Pi Agent** | Coding assistant with 18 custom extensions (explore subagent, librarian, wiki integration, fuzzy edit, and more) |
| `nvim/` | Neovim | Lazy.nvim, 15 LSP servers, blink.cmp completion, CodeCompanion → [details](nvim/README.md) |
| `tmux/` | Tmux | (Legacy) Alt-based keybindings, Tokyo Night theme → [details](tmux/README.md) |
| `ghostty/` | Ghostty | (Legacy) GPU-accelerated terminal. Replaced by Kitty |
| `bashrc/` | Bash | Modular shell config: aliases, secrets, fzf, mise, worktrunk integration |
| `wt/` | Worktrunk | Git worktree management with AI-generated commit messages |
| `homebrew/` | Homebrew | `brew-sync` CLI + Brewfile for personal packages |
| `obsidian/` | Obsidian | Wiki search, issue tracker, and wiki maintenance tools |
| `bluefin-bashrc/` | Bash | Bluefin base `.bashrc` with inlined bling |
| `mise/` | mise | Runtime version manager (Python, Lua, Node, Bun) |

## Prerequisites

- **OS**: Linux (Fedora/RHEL preferred)
- **Shell**: Bash 4+
- **Git**: 2.30+
- **Homebrew** (Linuxbrew): installed to `/home/linuxbrew/.linuxbrew/`

## Quick Setup

### 1. Install runtimes with mise

```bash
mise install
```

This installs Python 3.12, Lua 5.4, Node, Bun, and tooling (ruff, StyLua, shellcheck, prettier) as defined in `mise.toml`.

### 2. Stow packages into `~/.config/`

GNU Stow creates symlinks from the repo to your home directory. Each top-level directory is a "package."

```bash
# Install specific tools
stow kitty nvim bashrc

# Install everything
stow */

# Dry run (see what would be linked)
stow -n nvim

# Uninstall a package
stow -D nvim
```

**How it works**: Stow mirrors the directory structure. `nvim/.config/nvim/` gets symlinked to `~/.config/nvim/`, so edits in the repo take effect immediately.

### 3. Set up Neovim

```bash
# Install plugins (headless)
nvim --headless "+Lazy! sync" +qa
```

LSP servers are managed by Mason (`:Mason` in Neovim). The config auto-installs servers on first use.

### 4. Set up shell secrets

Secrets (API keys) are resolved lazily via [Proton Pass CLI](https://proton.me/pass). Install it:

```bash
curl -fsSL https://proton.me/download/pass-cli/install.sh | bash
```

Then create `~/.secrets.tpl` from the template:

```bash
cp bashrc/.secrets.tpl ~/.secrets.tpl
# Edit to add your API keys
```

Secrets are only resolved when tools like `pi`, `nvim`, or `wt` actually need them — not on shell startup.

### 5. Install (legacy) Tmux plugins

On first launch, TPM auto-installs. If it doesn't:

```
prefix + I    # (Ctrl+a, then Shift+i)
```

Note: Kitty is the preferred terminal; tmux is kept for SSH fallback sessions only.

## Pi Agent Extensions

Custom extensions for the [Pi](https://github.com/mariozechner/pi-coding-agent) coding assistant, written in TypeScript/Bun. Each extension is a self-contained module registering tools, commands, and TUI renderers.

> **Full documentation**: [`pi/.pi/README.md`](pi/.pi/README.md)

### Extension Overview

| Extension | Purpose |
|-----------|---------|
| **explore** | Subagent-powered codebase reconnaissance with pre-search, file indexing, and semantic reranking |
| **librarian** | Documentation research subagent (Exa web search + Context7 library docs + personal wiki) |
| **wiki-stash** | Persist conversation knowledge to Obsidian wiki without interrupting the session |
| **fuzzy-edit** | Tab-aware fuzzy fallback for the edit tool |
| **wiki-search** | Hybrid BM25 + vector search with Cohere reranking over personal wiki |
| **wiki-read** | Scope-safe wiki page reader |
| **wiki-lint** | Structural health checks for the wiki |
| **todo** | Todo management with state persisted in session entries |
| **plan-mode** | Read-only mode toggleable via `/plan` |
| **tdd-tree** | TDD kickoff point labeling in the session tree |
| **context7** | Up-to-date library documentation lookup |
| **exa-search** | Web search and page fetch via Exa API |
| **git-checkpoint** | Git stash checkpoints at each turn |
| **worktree-scope** | Enforces git worktree boundaries |
| **claude-rules** | `.claude/rules/` parser with picomatch glob matching |
| **cache-control** | LLM cache hint injection |
| **cheap-clarify** | Cheap-model clarification subagent |
| **extract-share** | Extract and share assistant messages as PNG or markdown |

### Explore Subagent Architecture

The explore extension combines query planning, in-memory file indexing, semantic reranking, and a read-only subagent to answer codebase questions.

```
User query
  │
  ├─► Query Planner ─► intent (define|use|arch|change) + entities + scope hints
  │
  ├─► File Index (LRU-cached, per repo)
  │     ├─ git ls-files → symbol extraction → import graph
  │     └─ Multi-signal heuristic scoring
  │
  ├─► Cohere Reranker (synthetic docs, no raw content)
  │     └─ Tiered results: Highly (≥60%) / Probably (≥30%) / Mentioned (≥10%)
  │
  └─► Subagent (read-only: read, grep, find, ls, bash)
        └─ Structured output: Files Retrieved / Key Code / Summary
```

Supports parallel exploration (up to 4×), scout-then-deepen patterns, and real-time index invalidation on edits.

**Example:**

```
> explore "how does the worktree scope extension detect worktree boundaries?"

[PRE-SEARCH RESULTS]
Query analysis: arch | entities: worktree, scope, extension | scope: extensions/worktree-scope

## Highly Relevant (read these first)
1. `./worktree-scope/index.ts` — score 92% — exact entity: worktree, path entity: scope
2. `./shared/src/subagent.ts` — score 67% — import proximity

## Summary
The worktree-scope extension detects a git worktree by checking for a `.git` file
(rather than directory) at the repo root, then injects a system prompt snippet
enforcing write boundaries...
```

See [`pi/.pi/README.md`](pi/.pi/README.md) for the full architecture deep-dive, design decisions, and development guide.

## Architecture Decisions

### Why GNU Stow?

Stow is minimal and transparent — it just creates symlinks. No daemons, no complex state. The directory structure _is_ the config. This means:
- Git tracks everything naturally
- No build step or compilation
- Easy to add/remove packages (`stow -D pkg`)
- Works with any XDG-compliant tool

### Why mise instead of asdf/nvm/pyenv?

[mise](https://mise.jdx.dev/) is a single tool that replaces multiple version managers (nvm, pyenv, rbenv, etc.). It's fast, supports `.tool-versions` compatibility, and has built-in task running (`mise run format-lua`).

### Why Proton Pass for secrets?

Secrets should never be committed to git. Proton Pass CLI provides encrypted secret injection via templates (`~/.secrets.tpl`). The lazy resolution pattern in `.bashrc.d/secrets` means API keys are only fetched when a tool actually needs them, keeping shell startup fast.

### Why worktrunk (wt)?

Git worktrees let you work on multiple branches simultaneously without stashing or switching. Worktrunk wraps this workflow with:
- Automatic worktree creation/cleanup
- AI-generated conventional commit messages (via pi)
- Pre-commit hooks for formatting and linting
- Squash-merge by default for clean history

### Why subagents for exploration and research?

Running the main model (e.g. Claude) to grep through files burns tokens on output the parent doesn't need to see. The explore and librarian subagents delegate to a cheaper model (configurable via `CHEAP_MODEL`) with a focused toolset, returning a structured summary instead of raw tool output. This keeps the parent's context smaller and cuts token cost on reconnaissance work — the exact savings depend on model choice and query.

## Tool Details

### Neovim

→ **[Full details in `nvim/README.md`](nvim/README.md)**

Lazy.nvim with 15 LSP servers, blink.cmp completion (Codestral + Minuet-AI), conform.nvim formatting, nvim-dap debugging, and CodeCompanion.nvim AI coding.

### Tmux (Legacy)

→ **[Full details in `tmux/README.md`](tmux/README.md)**

Alt-based daily keybindings (no prefix for common ops), vi copy mode with `wl-copy`, Tokyo Night theme, worktrunk popup integration.

### Kitty

→ **[Full details in `kitty/README.md`](kitty/README.md)**

GPU-accelerated terminal that replaces both Ghostty and tmux. Provides native tabs/splits (no prefix needed — all Alt-based like tmux), Tokyo Night theme, and **native Kitty Graphics Protocol support** which makes pi inline images work without passthrough hacks.

### Shell (Bash)

Modular config in `bashrc/.bashrc.d/`. Each file handles one concern:

| File | Purpose |
|------|---------|
| `config` | Editor, fzf bindings |
| `alias` | Short aliases |
| `mise` | Activate mise runtime manager |
| `secrets` | Lazy Proton Pass integration |
| `tmux` | Auto-attach/create tmux sessions (skipped inside Kitty) |
| `wt` | Worktrunk shell integration (directive file pattern) |
| `wpi` | Worktree + Pi agent workflow |
| `fnox` | fnox reencryption helper |

**Key pattern — `wt` shell integration**: Worktrunk commands like `wt switch` need to change the shell's working directory. Since subprocesses can't modify their parent shell, `wt` writes a "directive file" that the shell wrapper sources after the command exits.

### Homebrew

Personal Homebrew packages tracked in a Brewfile, synced between machines via `brew-sync` (stowed to `~/.local/bin/`):

```bash
brew-sync              # export: regenerate Brewfile from installed packages
brew-sync install     # import: install packages from Brewfile
brew-sync full        # both: regenerate + install
```

On Bluefin, system packages from `/usr/share/ublue-os/homebrew/*.Brewfile` are excluded automatically.

### Worktrunk (wt)

Git worktree management. Config at `wt/.config/worktrunk/config.toml`.

**Commit messages**: Generated by pi (AI agent) via `generate-commit-msg.sh`. The hook feeds the diff to pi with conventional commit format instructions, falls back to a simple `chore: update N files` if pi fails.

**Merge workflow**: Squash-merge with rebase by default. `wt merge` verifies and cleans up the worktree after merging.

## Development

### Linting and Formatting

Run via mise tasks:

```bash
mise run format-lua     # Format Lua with StyLua
mise run lint-lua       # Lint Lua with luacheck
mise run format-python  # Format Python with ruff
mise run lint-python    # Lint Python with ruff
mise run lint-shell     # Lint shell scripts with shellcheck
```

### Testing

The TypeScript surface (Pi agent extensions and standalone CLIs) is covered by **535 tests across 49 files**, all running under [`bun test`](https://bun.sh/docs/cli/test) and executed on every push by GitHub Actions (see [`.github/workflows/test.yml`](.github/workflows/test.yml)).

| Location | Tests | Style |
|----------|-------|-------|
| `pi/.pi/agent/extensions/**/*.test.ts` | 471 | Unit tests co-located with source; `integration.test.ts` per extension covers load/register cycles |
| `pi/.local/bin/tdd-plan.test.ts` | 5 | End-to-end CLI tests via `execSync` against the `tdd-plan` binary |
| `pi/.local/bin/store-memory*.test.ts` | 18 | CLI tests for the `store-memory` skill binary |
| `obsidian/.local/lib/wiki-search/wiki-search.test.ts` | 41 | Unit tests with real filesystem fixtures for the `wiki-search` CLI |

**Run locally:**

```bash
# Pi extensions (typecheck + tests)
cd pi/.pi/agent/extensions
for dir in */; do [ -f "$dir/tsconfig.json" ] && npx tsc --noEmit -p "$dir/tsconfig.json"; done
bun test --parallel

# Standalone CLIs
bun test pi/.local/bin/tdd-plan.test.ts
bun test obsidian/.local/lib/wiki-search/wiki-search.test.ts
```

**Mocking conventions**: External SDKs (`exa-js`, `@upstash/context7-sdk`, `@mariozechner/pi-coding-agent`) are mocked via shared factories in `pi/.pi/agent/extensions/shared/src/test-mocks.ts` — tests never hit the network and need no API keys. See `.claude/rules/pi-extensions.md` for the full rationale.

### Pre-commit Checks

Run `mise run pre-commit` before committing — it executes format + lint + typecheck + tests. No git hook is auto-installed; the `wt step commit` workflow invokes it.

## Repository Structure

```
.
├── pi/.pi/                      # Pi agent
│   ├── agent/extensions/        # 18 custom extensions
│   └── README.md                # Extension documentation
├── kitty/.config/kitty/         # Kitty (terminal + multiplexer)
│   └── kitty.conf               # Main config
├── nvim/.config/nvim/           # Neovim
│   ├── lua/config/              # Core config (LSP, keymaps, diagnostics)
│   ├── lua/plugins/             # Plugin specs (Lazy.nvim)
│   └── lsp/                     # Per-server LSP configs
├── tmux/.config/tmux/           # Tmux (legacy)
│   ├── tmux.conf                # Main config
│   └── scripts/                 # Popup scripts (wt integration)
├── ghostty/.config/ghostty/     # Ghostty (legacy)
│   └── config.ghostty           # Ghostty config
├── bashrc/                      # Bash
│   ├── .bashenv                 # Global env vars
│   └── .bashrc.d/               # Modular sourced scripts
├── wt/.config/worktrunk/        # Worktrunk
├── homebrew/                    # brew-sync CLI + Brewfile
├── mise.toml                    # Runtime versions
├── .mise/tasks/                 # mise tasks (pre-commit, format, lint, test, etc.)
├── AGENTS.md                    # Agent-specific guide
└── CONVENTIONS.md               # Development conventions
```

## License

Personal configuration. Use at your own discretion.
