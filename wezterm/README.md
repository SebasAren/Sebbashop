# WezTerm Configuration

Modern terminal emulator with GPU acceleration, configured to match the Ptyxis Catppuccin theme while working seamlessly with the existing tmux setup.

## Setup

```bash
stow wezterm
```

## Theme

- **Color scheme**: Catppuccin Mocha (matches Ptyxis `catppuccin-dynamic` palette)
- **Font**: JetBrains Mono 14pt (system default is 16pt; 14pt gives more screen real estate)

## Tmux Integration

WezTerm is **tmux-aware**:

1. **Tab bar auto-hides** when `$TMUX` is set — tmux manages windows/panes
2. **Tab bar reappears** in bare terminal sessions
3. **No keybinding conflicts** — WezTerm uses `Ctrl+` shortcuts; tmux uses `Alt+` for pane/window management

## Key Bindings

| Key | Action |
|-----|--------|
| `Ctrl+=` | Increase font size |
| `Ctrl+-` | Decrease font size |
| `Ctrl+0` | Reset font size |

## File Structure

```
wezterm/
└── .config/wezterm/
    ├── wezterm.lua    # Main config
    └── AGENTS.md      # Agent-facing notes
```
