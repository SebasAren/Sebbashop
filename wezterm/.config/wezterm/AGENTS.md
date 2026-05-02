# WezTerm — Agent Notes

## Setup

```bash
cd ~/dotfiles
stow wezterm
```

Requires WezTerm (install via `brew install wezterm` or package manager).

## Theme

- Color scheme: **Catppuccin Mocha** (matches Ptyxis profile `catppuccin-dynamic`)
- Tmux detection: tab bar is hidden when `$TMUX` is set (tmux manages windows)
- Tab bar uses Catppuccin Mocha palette with slightly varied backgrounds for depth

## Tmux-aware tab bar

The `window-focus-changed` event re-checks `$TMUX` so the tab bar adapts dynamically:

```lua
wezterm.on("window-focus-changed", function(window, _pane)
  window:set_config_overrides({
    enable_tab_bar = not tmux_is_running(),
  })
end)
```

If you start WezTerm without tmux, then start tmux inside it, the tab bar hides on next focus change.

## Key Bindings

WezTerm keys complement the tmux Alt-key scheme without conflicts:

| Key | Action |
|-----|--------|
| `Ctrl+=` | Increase font size |
| `Ctrl+-` | Decrease font size |
| `Ctrl+0` | Reset font size |

## Gotchas

- **`enable_tab_bar` is evaluated at startup**; dynamic updates rely on `set_config_overrides`
- **`window-focus-changed`** fires on every focus switch — `set_config_overrides` is lightweight, no perf concern
- WezTerm's `term = "xterm-256color"` works with tmux's `default-terminal "tmux-256color"` — tmux overrides the terminal type inside its sessions
- Avoid binding `Alt+{h,j,k,l}` in WezTerm — those are reserved for tmux pane navigation
