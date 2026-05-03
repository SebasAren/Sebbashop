-- wt_review — Worktree diff review with sidebar and annotations
--
-- Integrates with git_diff_review, review/init.lua, and the wt CLI.
-- Provides a file sidebar, side-by-side diff mode, and line-mapped
-- review comments for worktree-based code review.

local M = {}

--- Resolve the base ref for diffing.
--- Priority: arg > WPI_BASE_REF > WPI_BASE_BRANCH > wt config state default-branch
--- Then computes git merge-base with HEAD.
---@param ref? string Explicit ref passed by user
---@return string
function M.resolve_base_ref(ref)
  if ref and ref ~= "" then
    -- Use merge-base with HEAD to get a stable commit
    local ok, result = pcall(vim.fn.systemlist, "git merge-base " .. vim.fn.shellescape(ref) .. " HEAD")
    if ok and vim.v.shell_error == 0 and #result > 0 and result[1] ~= "" then
      return result[1]
    end
    return ref
  end

  -- Environment variables (set by wpi TUI)
  if vim.env.WPI_BASE_REF and vim.env.WPI_BASE_REF ~= "" then
    return vim.env.WPI_BASE_REF
  end
  if vim.env.WPI_BASE_BRANCH and vim.env.WPI_BASE_BRANCH ~= "" then
    local ok, result =
      pcall(vim.fn.systemlist, "git merge-base " .. vim.fn.shellescape(vim.env.WPI_BASE_BRANCH) .. " HEAD")
    if ok and vim.v.shell_error == 0 and #result > 0 and result[1] ~= "" then
      return result[1]
    end
    return vim.env.WPI_BASE_BRANCH
  end

  -- wt CLI: get the default branch
  local ok, result = pcall(vim.fn.systemlist, "wt config state default-branch 2>/dev/null")
  local base_branch = "main"
  if ok and vim.v.shell_error == 0 and #result > 0 and result[1] ~= "" then
    base_branch = result[1]
  end

  -- Compute merge-base with HEAD
  local ok2, result2 = pcall(vim.fn.systemlist, "git merge-base " .. vim.fn.shellescape(base_branch) .. " HEAD")
  if ok2 and vim.v.shell_error == 0 and #result2 > 0 and result2[1] ~= "" then
    return result2[1]
  end

  -- Final fallback
  return base_branch
end

--- Get list of changed files with diff stats (+N/-M) against a base ref.
--- Includes tracked changes, working tree changes, and untracked files.
---@param base_ref string
---@return {path:string, added:integer, deleted:integer}[]
function M.get_changed_files(base_ref)
  local stats = {} -- path -> {added, deleted}
  local paths = {} -- ordered paths for sorting

  local function add_or_update(path, added, deleted)
    if stats[path] then
      stats[path].added = stats[path].added + added
      stats[path].deleted = stats[path].deleted + deleted
    else
      table.insert(paths, path)
      stats[path] = { added = added, deleted = deleted }
    end
  end

  -- Tracked changes (committed since base)
  local ok1, result1 = pcall(vim.fn.systemlist, string.format("git diff --numstat %s HEAD -- .", base_ref))
  if ok1 and vim.v.shell_error == 0 then
    for _, line in ipairs(result1) do
      local added, deleted, path = line:match("^(%d+)\t(%d+)\t(.+)$")
      if path then
        add_or_update(path, tonumber(added), tonumber(deleted))
      end
    end
  end

  -- Working tree + staged changes vs base (includes unstaged edits)
  local ok2, result2 = pcall(vim.fn.systemlist, string.format("git diff --numstat %s -- .", base_ref))
  if ok2 and vim.v.shell_error == 0 then
    for _, line in ipairs(result2) do
      local added, deleted, path = line:match("^(%d+)\t(%d+)\t(.+)$")
      if path then
        add_or_update(path, tonumber(added), tonumber(deleted))
      end
    end
  end

  -- Untracked files (new files not yet in git)
  local ok3, result3 = pcall(vim.fn.systemlist, "git ls-files --others --exclude-standard -- .")
  if ok3 and vim.v.shell_error == 0 then
    for _, file in ipairs(result3) do
      if file ~= "" and not stats[file] then
        -- Count lines in the new file
        local lc_ok, lc_result = pcall(vim.fn.systemlist, "wc -l < " .. vim.fn.shellescape(file))
        local line_count = 1
        if lc_ok and vim.v.shell_error == 0 and #lc_result > 0 then
          line_count = tonumber(lc_result[1]) or 1
        end
        add_or_update(file, line_count, 0)
      end
    end
  end

  -- Sort by path
  table.sort(paths)

  -- Build result list
  local files = {}
  for _, path in ipairs(paths) do
    table.insert(files, {
      path = path,
      added = stats[path].added,
      deleted = stats[path].deleted,
    })
  end

  return files
end

--- Format a file entry as a display line with diff stats.
--- Lines are padded to a fixed width for alignment.
---@param entry {path:string, added:integer, deleted:integer}
---@param path_width integer Width to pad path to
---@return string
local function format_file_line(entry, path_width)
  local path = entry.path
  local added = entry.added
  local deleted = entry.deleted

  -- Pad path for alignment
  local padded_path = path .. string.rep(" ", math.max(0, path_width - #path))
  local stats = string.format("+%d  -%d", added, deleted)

  return "  " .. padded_path .. "  " .. stats
end

--- Set up buffer-local keymaps for sidebar file cycling.
--- ]f moves cursor to next file (down), [f moves to previous file (up).
---@param bufnr integer
local function setup_sidebar_keymaps(bufnr)
  vim.keymap.set("n", "]f", function()
    local row = vim.api.nvim_win_get_cursor(0)[1]
    local last_line = vim.api.nvim_buf_line_count(bufnr)
    if row < last_line then
      vim.api.nvim_win_set_cursor(0, { row + 1, 0 })
    end
  end, { buffer = bufnr, desc = "Review: next file" })

  vim.keymap.set("n", "[f", function()
    local row = vim.api.nvim_win_get_cursor(0)[1]
    if row > 1 then
      vim.api.nvim_win_set_cursor(0, { row - 1, 0 })
    end
  end, { buffer = bufnr, desc = "Review: prev file" })
end

--- Track the sidebar buffer and window state
local sidebar = {
  bufnr = nil,
  winnr = nil,
}

--- Open the file sidebar showing changed files with diff stats.
--- Creates a new vertical split buffer with 'wtreview' filetype.
---@param changed_files {path:string, added:integer, deleted:integer}[]
function M.open_sidebar(changed_files)
  -- Sort by path
  table.sort(changed_files, function(a, b)
    return a.path < b.path
  end)
  -- Close existing sidebar if open
  if sidebar.bufnr and vim.api.nvim_buf_is_valid(sidebar.bufnr) then
    if sidebar.winnr and vim.api.nvim_win_is_valid(sidebar.winnr) then
      vim.api.nvim_win_close(sidebar.winnr, true)
    end
    pcall(vim.api.nvim_buf_delete, sidebar.bufnr, { force = true })
  end

  -- Calculate max path width for alignment
  local max_path = 0
  for _, entry in ipairs(changed_files) do
    if #entry.path > max_path then
      max_path = #entry.path
    end
  end
  local path_width = math.max(max_path, 20)

  -- Build content lines
  local lines = {}
  for _, entry in ipairs(changed_files) do
    table.insert(lines, format_file_line(entry, path_width))
  end

  -- Create new buffer
  local bufnr = vim.api.nvim_create_buf(false, true)
  sidebar.bufnr = bufnr

  -- Set buffer options
  vim.bo[bufnr].filetype = "wtreview"
  vim.bo[bufnr].bufhidden = "wipe"
  vim.bo[bufnr].buftype = "nofile"
  vim.bo[bufnr].modifiable = true

  -- Write content
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  vim.bo[bufnr].modifiable = false

  -- Create vertical split window
  local width = math.min(path_width + 20, math.floor(vim.o.columns * 0.3))
  vim.cmd("leftabove " .. width .. "vsplit")
  vim.api.nvim_win_set_buf(0, bufnr)
  sidebar.winnr = vim.api.nvim_get_current_win()

  -- Set window options
  vim.wo[sidebar.winnr].winfixwidth = true
  vim.wo[sidebar.winnr].cursorline = true
  vim.wo[sidebar.winnr].number = false
  vim.wo[sidebar.winnr].signcolumn = "no"

  -- Set up file cycling keymaps
  setup_sidebar_keymaps(bufnr)

  return bufnr
end

--- Open a side-by-side diff for a file against a base ref.
--- Shows the working tree version in the current window and the base
--- version in a vertical split with diff mode enabled.
---@param file_path string Path to the file (relative to repo root)
---@param base_ref string Base ref to diff against
function M.open_file_diff(file_path, base_ref)
  -- Get the base version content from git
  local cmd = "git show " .. base_ref .. ":" .. file_path
  local ok, base_content = pcall(vim.fn.systemlist, cmd)
  if not ok or vim.v.shell_error ~= 0 then
    -- New file: show empty. Use one empty line so diff has something to show
    base_content = { "" }
  end

  -- Open the working tree file in the current window
  vim.cmd("edit " .. vim.fn.fnameescape(file_path))
  local work_bufnr = vim.api.nvim_get_current_buf()
  local work_winnr = vim.api.nvim_get_current_win()
  vim.wo[work_winnr].diff = true

  -- Create a new buffer for the base version
  local base_bufnr = vim.api.nvim_create_buf(false, true)
  vim.bo[base_bufnr].filetype = "wtdiff"
  vim.bo[base_bufnr].buftype = "nofile"
  vim.bo[base_bufnr].bufhidden = "wipe"
  vim.bo[base_bufnr].modifiable = true
  vim.api.nvim_buf_set_lines(base_bufnr, 0, -1, false, base_content)
  vim.bo[base_bufnr].modifiable = false

  -- Open the base version in a vertical split to the left
  vim.cmd("leftabove vertical split")
  local base_winnr = vim.api.nvim_get_current_win()
  vim.api.nvim_win_set_buf(base_winnr, base_bufnr)
  vim.wo[base_winnr].diff = true
  vim.wo[base_winnr].scrollbind = true

  -- Go back to the working tree window and enable scrollbind
  vim.api.nvim_set_current_win(work_winnr)
  vim.wo[work_winnr].scrollbind = true

  -- Set up hunk navigation on both diff windows
  vim.keymap.set("n", "]h", function()
    pcall(function()
      require("gitsigns").next_hunk()
    end)
  end, { buffer = work_bufnr, desc = "Review: next hunk" })

  vim.keymap.set("n", "[h", function()
    pcall(function()
      require("gitsigns").prev_hunk()
    end)
  end, { buffer = work_bufnr, desc = "Review: prev hunk" })

  vim.keymap.set("n", "]h", function()
    pcall(function()
      require("gitsigns").next_hunk()
    end)
  end, { buffer = base_bufnr, desc = "Review: next hunk" })

  vim.keymap.set("n", "[h", function()
    pcall(function()
      require("gitsigns").prev_hunk()
    end)
  end, { buffer = base_bufnr, desc = "Review: prev hunk" })
end

--- Helper: call diff_filler for a specific buffer.
--- Neovim's diff_filler(lnum) operates on the current buffer only,
--- so we temporarily switch to the target buffer to get its value.
---@param bufnr integer
---@param lnum integer
---@return integer
local function diff_filler_for(bufnr, lnum)
  local cur_buf = vim.api.nvim_get_current_buf()
  vim.api.nvim_set_current_buf(bufnr)
  local result = vim.fn.diff_filler(lnum)
  vim.api.nvim_set_current_buf(cur_buf)
  return result
end

--- Map a line number from one diff buffer to another using diff filler alignment.
--- In a side-by-side diff, filler lines are empty lines inserted to align the two
--- buffers. This function converts a line number in the source buffer to the
--- corresponding line number in the destination buffer.
---@param src_bufnr integer Source buffer number
---@param dst_bufnr integer Destination buffer number
---@param src_lnum integer Line number in source buffer
---@return integer|nil Line number in destination buffer, or nil if no correspondence
function M.map_diff_line(src_bufnr, dst_bufnr, src_lnum)
  -- The display position accounts for filler lines inserted by the diff algorithm.
  -- Filler lines (empty alignment lines) only exist in one buffer; the display
  -- position is the same for corresponding content in both buffers.
  local src_display = src_lnum + diff_filler_for(src_bufnr, src_lnum)
  local dst_lines = vim.api.nvim_buf_line_count(dst_bufnr)

  for dst_lnum = 1, dst_lines do
    local dst_display = dst_lnum + diff_filler_for(dst_bufnr, dst_lnum)
    if dst_display == src_display then
      return dst_lnum
    elseif dst_display > src_display then
      -- Past the target; this display position is a filler in dst (no content)
      return nil
    end
  end

  return nil
end

--- Add a review comment, mapping line numbers from diff buffers to source lines.
--- When called from a wtdiff buffer (base version diff buffer), maps the cursor
--- position to the working tree file and delegates to review.add() with correct
--- source line numbers. When called from a normal buffer (including the working
--- tree diff buffer), passes the cursor line numbers directly to review.add().
function M.add_comment()
  local bufnr = vim.api.nvim_get_current_buf()
  local filetype = vim.bo[bufnr].filetype
  local cursor_lnum = vim.api.nvim_win_get_cursor(0)[1]

  if filetype == "wtdiff" then
    -- In the base version diff buffer — find the working tree partner
    for _, win in ipairs(vim.api.nvim_list_wins()) do
      if vim.api.nvim_win_is_valid(win) then
        local b = vim.api.nvim_win_get_buf(win)
        if vim.bo[b].buftype == "" and vim.wo[win].diff then
          -- Found the working tree partner buffer
          local work_lnum = M.map_diff_line(bufnr, b, cursor_lnum)
          if work_lnum then
            -- Switch to the working tree window and add comment there
            vim.api.nvim_set_current_win(win)
            vim.api.nvim_win_set_cursor(win, { work_lnum, 0 })
            require("review").add(work_lnum, work_lnum)
          else
            vim.notify("Cannot map this line to the working tree", vim.log.levels.WARN)
          end
          return
        end
      end
    end
    vim.notify("Cannot find working tree buffer for this diff", vim.log.levels.ERROR)
  else
    -- Normal buffer or working tree diff buffer: use current line directly
    require("review").add(cursor_lnum, cursor_lnum)
  end
end

--- Open a full wt_review session: sidebar + first file diff.
--- This is the main entry point for the wpi TUI integration.
---@param ref? string Base ref to diff against (optional, auto-detected via resolve_base_ref)
function M.open(ref)
  local base_ref = M.resolve_base_ref(ref)
  local files = M.get_changed_files(base_ref)

  if #files == 0 then
    vim.notify("No changed files to review", vim.log.levels.INFO)
    return
  end

  -- Open the sidebar
  M.open_sidebar(files)

  -- Move focus to the main editing area (next window after sidebar)
  vim.cmd("wincmd w")

  -- Open the first file in diff mode
  M.open_file_diff(files[1].path, base_ref)

  vim.notify(
    string.format(
      "WtReview: %d files changed vs %s\n]f next file \xb7 [f prev file \xb7 ]h next hunk \xb7 [h prev hunk",
      #files,
      base_ref
    ),
    vim.log.levels.INFO
  )
end

return M
