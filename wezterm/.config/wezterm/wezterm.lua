-- WezTerm configuration
-- Theme: Catppuccin Mocha (matches Ptyxis palette)
-- Font: JetBrains Mono 14pt (system default is 16; 14 gives more room)
-- Tmux-aware: hides tab bar when tmux is running
--   (tmux handles window management; WezTerm shows tabs only in bare sessions)

local wezterm = require("wezterm")

-- ────────────────────────────────────────────
-- Tmux detection helpers
-- ────────────────────────────────────────────
local function tmux_is_running()
  return os.getenv("TMUX") ~= nil
end

local function update_tab_bar(window)
  window:set_config_overrides({
    enable_tab_bar = not tmux_is_running(),
  })
end

-- Re-check on focus changes (in case tmux starts/stops mid-session)
wezterm.on("window-focus-changed", function(window, _pane)
  update_tab_bar(window)
end)

-- ────────────────────────────────────────────
-- Color tweaks: Catppuccin Mocha tab bar
-- ────────────────────────────────────────────
local catppuccin_mocha = wezterm.color.get_builtin_schemes()["Catppuccin Mocha"]
catppuccin_mocha.tab_bar = {
  background = "#1e1e2e",
  active_tab = {
    bg_color = "#45475a",
    fg_color = "#cdd6f4",
  },
  inactive_tab = {
    bg_color = "#181825",
    fg_color = "#a6adc8",
  },
  inactive_tab_hover = {
    bg_color = "#313244",
    fg_color = "#cdd6f4",
  },
  new_tab = {
    bg_color = "#11111b",
    fg_color = "#a6adc8",
  },
  new_tab_hover = {
    bg_color = "#313244",
    fg_color = "#cdd6f4",
  },
}

-- ────────────────────────────────────────────
-- Key bindings (complement tmux, don't clash)
-- ────────────────────────────────────────────
local keys = {
  -- Font size (Ctrl+/-/0, not used by tmux prefix)
  { key = "=", mods = "CTRL", action = wezterm.action.IncreaseFontSize },
  { key = "-", mods = "CTRL", action = wezterm.action.DecreaseFontSize },
  { key = "0", mods = "CTRL", action = wezterm.action.ResetFontSize },

  -- Quick terminal (toggle a scratch terminal — Ctrl+`)
  { key = "`", mods = "CTRL|SHIFT", action = wezterm.action.QuickSelect },
}

-- ────────────────────────────────────────────
-- Config
-- ────────────────────────────────────────────
return {
  -- Catppuccin Mocha (with custom tab bar baked in)
  color_schemes = {
    ["Catppuccin Mocha (custom)"] = catppuccin_mocha,
  },
  color_scheme = "Catppuccin Mocha (custom)",

  -- Font: JetBrains Mono 14pt (system default is 16; 14 gives more room)
  font = wezterm.font("JetBrains Mono", { weight = "Regular" }),
  font_size = 14.0,

  -- Font features: enable ligatures
  harfbuzz_features = { "calt=1", "clig=1", "liga=1" },

  -- Window
  window_decorations = "RESIZE",
  window_background_opacity = 1.0,
  window_padding = { left = 4, right = 4, top = 2, bottom = 2 },
  adjust_window_size_when_changing_font_size = false,

  -- Cursor
  default_cursor_style = "BlinkingBlock",
  cursor_blink_rate = 600,

  -- Scrollback
  scrollback_lines = 10000,

  -- Tab bar
  enable_tab_bar = not tmux_is_running(),
  show_tab_index_in_tab_bar = true,
  switch_to_last_active_tab_when_closing_tab = true,

  -- Terminal identification (tmux compatibility)
  term = "xterm-256color",

  -- Key bindings
  keys = keys,

  -- IME support
  use_ime = true,

  -- Native window title
  window_close_confirmation = "AlwaysPrompt",
}
