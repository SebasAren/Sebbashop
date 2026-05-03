-- Tests for wt_review module
-- RED: These tests will fail because wt_review module doesn't exist yet

describe("wt_review", function()
  it("loads the module without errors", function()
    -- This will fail because lua/wt_review/init.lua doesn't exist yet
    local wt_review = require("wt_review")
    assert.is.table(wt_review, "wt_review should be a table")
  end)

  describe("resolve_base_ref()", function()
    it("returns a non-empty string for the base ref", function()
      local wt_review = require("wt_review")
      assert.is.table(wt_review, "wt_review module should exist")

      local base_ref = wt_review.resolve_base_ref()
      assert.is.string(base_ref, "resolve_base_ref should return a string")
      assert.is_not.equals("", base_ref, "resolve_base_ref should not return empty string")
    end)

    it("returns the merge-base commit hash (not a branch name)", function()
      local wt_review = require("wt_review")
      local base_ref = wt_review.resolve_base_ref()

      -- A merge-base commit hash is 40 hex characters (or short 7+ chars)
      -- We check that it looks like a commit hash, not a branch name
      assert.matches("^[a-f0-9]+$", base_ref,
        "resolve_base_ref should return a commit hash, not a branch name")
    end)
  end)

  describe("get_changed_files(base_ref)", function()
    it("exists as a function on the module", function()
      local wt_review = require("wt_review")
      assert.is.table(wt_review, "wt_review module should exist")
      -- This will fail because get_changed_files doesn't exist yet
      assert.is.Function(wt_review.get_changed_files,
        "get_changed_files should be a function")
    end)

    it("returns a sorted list of changed files with +N/-M stats", function()
      local wt_review = require("wt_review")
      local base_ref = wt_review.resolve_base_ref()

      local files = wt_review.get_changed_files(base_ref)
      assert.is.table(files, "get_changed_files should return a table")
      -- Should be an array/list (not a dict)
      assert.is_not.equals(0, #files, "should have at least one changed file")

      -- Each entry should have path, added, deleted fields
      local first = files[1]
      assert.is.string(first.path, "each entry must have a path")
      assert.is.number(first.added, "each entry must have added count")
      assert.is.number(first.deleted, "each entry must have deleted count")

      -- Verify sorted order (alphabetical by path)
      for i = 2, #files do
        assert.is_true(
          files[i].path >= files[i - 1].path,
          string.format("files should be sorted by path: %s < %s",
            files[i].path, files[i - 1].path)
        )
      end
    end)

    it("includes untracked files in the result", function()
      local wt_review = require("wt_review")
      local base_ref = wt_review.resolve_base_ref()

      local files = wt_review.get_changed_files(base_ref)
      -- Untracked files should appear (like our new test files from step 1)
      local has_test_files = false
      for _, f in ipairs(files) do
        if vim.startswith(f.path, "tests/") then
          has_test_files = true
          break
        end
      end
      assert.is_true(has_test_files,
        "should include untracked test files")
    end)
  end)

  describe("open_sidebar(changed_files)", function()
    it("exists as a function on the module", function()
      local wt_review = require("wt_review")
      assert.is.Function(wt_review.open_sidebar,
        "open_sidebar should be a function")
    end)

    it("creates a new buffer with 'wtreview' filetype", function()
      local wt_review = require("wt_review")
      local files = {{
        path = "src/main.lua",
        added = 10,
        deleted = 3,
      }}

      local buf_count_before = #vim.api.nvim_list_bufs()
      wt_review.open_sidebar(files)
      local buf_count_after = #vim.api.nvim_list_bufs()

      -- Should have created at least one new buffer
      assert.is_true(buf_count_after > buf_count_before,
        "open_sidebar should create a new buffer")

      -- Find the new buffer with our filetype
      local found = false
      for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.api.nvim_buf_is_valid(bufnr) and vim.bo[bufnr].filetype == "wtreview" then
          found = true
          break
        end
      end
      assert.is_true(found, "No buffer with filetype 'wtreview' was created")
    end)

    it("renders file paths with +N/-M stats", function()
      local wt_review = require("wt_review")
      local files = {{
        path = "src/main.lua",
        added = 10,
        deleted = 3,
      }, {
        path = "README.md",
        added = 5,
        deleted = 0,
      }}

      wt_review.open_sidebar(files)

      -- Find the wtreview buffer and check its contents
      for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.api.nvim_buf_is_valid(bufnr) and vim.bo[bufnr].filetype == "wtreview" then
          local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
          local full = table.concat(lines, "\n")

          -- Should contain file paths
          assert.is_true(full:find("src/main%.lua") ~= nil, "should contain first file path")
          assert.is_true(full:find("README%.md") ~= nil, "should contain second file path")

          -- Should contain +N/-M stats
          assert.is_true(full:find("%+10") ~= nil, "should show plus 10 added")
          assert.is_true(full:find("%-3") ~= nil, "should show minus 3 deleted")
          assert.is_true(full:find("%+5") ~= nil, "should show plus 5 added")
          assert.is_true(full:find("%-0") ~= nil, "should show minus 0 deleted")

          return
        end
      end
      error("No buffer with filetype 'wtreview' was created")
    end)

    it("sorts files by path in the buffer", function()
      local wt_review = require("wt_review")
      local files = {{
        path = "zeta/file.txt",
        added = 1,
        deleted = 1,
      }, {
        path = "alpha/file.txt",
        added = 2,
        deleted = 2,
      }}

      wt_review.open_sidebar(files)

      for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.api.nvim_buf_is_valid(bufnr) and vim.bo[bufnr].filetype == "wtreview" then
          local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
          local content = table.concat(lines, "\n")

          -- Find positions of both files
          local alpha_pos = content:find("alpha/file%.txt")
          local zeta_pos = content:find("zeta/file%.txt")

          assert.is_not_nil(alpha_pos, "should contain alpha/file.txt")
          assert.is_not_nil(zeta_pos, "should contain zeta/file.txt")
          assert.is_true(alpha_pos < zeta_pos,
            "alpha/file.txt should appear before zeta/file.txt")

          return
        end
      end
      error("No buffer with filetype 'wtreview' was created")
    end)
  end)

  describe("open_file_diff(file_path, base_ref)", function()
    it("exists as a function on the module", function()
      local wt_review = require("wt_review")
      assert.is.Function(wt_review.open_file_diff,
        "open_file_diff should be a function")
    end)

    it("opens the working tree file in the current window", function()
      local wt_review = require("wt_review")
      local base_ref = wt_review.resolve_base_ref()

      local cur_buf_before = vim.api.nvim_get_current_buf()
      local cur_win_before = vim.api.nvim_get_current_win()

      wt_review.open_file_diff("tests/wt_review_spec.lua", base_ref)

      -- Current window should now show a working tree buffer
      local cur_buf = vim.api.nvim_get_current_buf()
      local cur_win = vim.api.nvim_get_current_win()

      -- Window should be the same or a new one
      assert.is_true(
        vim.api.nvim_win_is_valid(cur_win),
        "current window should be valid"
      )
      -- The buffer should be a normal file buffer (not nofile)
      assert.is_not.equals("nofile", vim.bo[cur_buf].buftype,
        "working tree buffer should not be nofile")
      -- Should be modifiable
      assert.is_true(vim.bo[cur_buf].modifiable,
        "working tree buffer should be modifiable")
    end)

    it("opens the base version in a vertical split with content from git show", function()
      local wt_review = require("wt_review")
      local base_ref = wt_review.resolve_base_ref()

      -- Get expected base content via git show (use a file that exists in base)
      local test_file = "nvim/.config/nvim/lua/git_diff_review/init.lua"
      local ok, expected_lines = pcall(vim.fn.systemlist,
        "git show " .. base_ref .. ":" .. test_file)
      assert.is_true(ok and vim.v.shell_error == 0,
        "git show should work on " .. test_file)

      local wins_before = vim.api.nvim_list_wins()
      wt_review.open_file_diff(test_file, base_ref)
      local wins_after = vim.api.nvim_list_wins()

      -- Should have created at least one new window (the diff split)
      assert.is_true(#wins_after >= #wins_before + 1,
        "open_file_diff should create a vertical split")

      -- Find a buffer with the base version content (marked by wtdiff filetype)
      local found_matching = false
      for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.api.nvim_buf_is_valid(bufnr) and vim.bo[bufnr].filetype == "wtdiff" then
          local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
          -- Check if any wtdiff buffer matches the expected content
          if #lines == #expected_lines and lines[1] == expected_lines[1] then
            found_matching = true
            break
          end
        end
      end
      assert.is_true(found_matching,
        "a buffer with filetype 'wtdiff' with matching git show content should exist")
    end)

    it("sets diff mode on both windows", function()
      local wt_review = require("wt_review")
      local base_ref = wt_review.resolve_base_ref()

      local test_file = "nvim/.config/nvim/lua/git_diff_review/init.lua"
      wt_review.open_file_diff(test_file, base_ref)

      -- Find windows showing diff buffers
      local diff_wins = 0
      for _, winnr in ipairs(vim.api.nvim_list_wins()) do
        if vim.api.nvim_win_is_valid(winnr) and vim.wo[winnr].diff then
          diff_wins = diff_wins + 1
        end
      end

      -- At least 2 windows should have diff enabled (working tree + base)
      assert.is_true(diff_wins >= 2,
        "at least 2 windows should have diff mode enabled")
    end)
  end)

  -- Helper: find the window displaying a buffer
  local function find_win_for_buf(bufnr)
    for _, win in ipairs(vim.api.nvim_list_wins()) do
      if vim.api.nvim_win_is_valid(win) and vim.api.nvim_win_get_buf(win) == bufnr then
        return win
      end
    end
    return nil
  end

  describe("navigation keymaps", function()
    describe("]f/[f sidebar file cycling", function()
      it("sets up buffer-local ]f and [f keymaps on the sidebar", function()
        local wt_review = require("wt_review")
        local files = {
          { path = "a.lua", added = 1, deleted = 0 },
          { path = "b.lua", added = 2, deleted = 1 },
          { path = "c.lua", added = 0, deleted = 3 },
        }
        local bufnr = wt_review.open_sidebar(files)

        -- Focus the sidebar window
        local sidebar_win = find_win_for_buf(bufnr)
        assert.is_not_nil(sidebar_win, "sidebar window should exist")
        vim.api.nvim_set_current_win(sidebar_win)

        -- Check ]f keymap on the sidebar buffer
        local map_next = vim.fn.maparg("]f", "n", false, true)
        assert.is.table(map_next, "]f should be mapped")
        assert.equals(1, map_next.buffer, "]f should be buffer-local")

        -- Check [f keymap on the sidebar buffer
        local map_prev = vim.fn.maparg("[f", "n", false, true)
        assert.is.table(map_prev, "[f should be mapped")
        assert.equals(1, map_prev.buffer, "[f should be buffer-local")
      end)

      it("]f moves cursor down one line in the sidebar", function()
        local wt_review = require("wt_review")
        local files = {
          { path = "a.lua", added = 1, deleted = 0 },
          { path = "b.lua", added = 2, deleted = 1 },
          { path = "c.lua", added = 0, deleted = 3 },
        }
        local bufnr = wt_review.open_sidebar(files)

        -- Focus the sidebar window
        local sidebar_win = find_win_for_buf(bufnr)
        assert.is_not_nil(sidebar_win, "sidebar window should exist")
        vim.api.nvim_set_current_win(sidebar_win)

        -- Cursor should start on line 1
        local row = vim.api.nvim_win_get_cursor(0)[1]
        assert.equals(1, row, "cursor should start at line 1")

        -- Execute the ]f mapping
        vim.cmd("normal ]f")

        local new_row = vim.api.nvim_win_get_cursor(0)[1]
        assert.equals(2, new_row, "cursor should move to line 2 after ]f")
      end)

      it("[f moves cursor up one line in the sidebar", function()
        local wt_review = require("wt_review")
        local files = {
          { path = "a.lua", added = 1, deleted = 0 },
          { path = "b.lua", added = 2, deleted = 1 },
          { path = "c.lua", added = 0, deleted = 3 },
        }
        local bufnr = wt_review.open_sidebar(files)

        -- Focus the sidebar window
        local sidebar_win = find_win_for_buf(bufnr)
        assert.is_not_nil(sidebar_win, "sidebar window should exist")
        vim.api.nvim_set_current_win(sidebar_win)

        -- Move down twice, then up once
        vim.cmd("normal ]f")
        vim.cmd("normal ]f")
        vim.cmd("normal [f")

        local row = vim.api.nvim_win_get_cursor(0)[1]
        assert.equals(2, row, "cursor should be at line 2 after down-down-up")
      end)

      it("]f at last file stays on last line", function()
        local wt_review = require("wt_review")
        local files = {
          { path = "a.lua", added = 1, deleted = 0 },
          { path = "b.lua", added = 2, deleted = 1 },
        }
        local bufnr = wt_review.open_sidebar(files)

        local sidebar_win = find_win_for_buf(bufnr)
        assert.is_not_nil(sidebar_win, "sidebar window should exist")
        vim.api.nvim_set_current_win(sidebar_win)

        -- Move past the last line
        vim.cmd("normal ]f")
        vim.cmd("normal ]f")
        vim.cmd("normal ]f")  -- Should stay on line 2

        local row = vim.api.nvim_win_get_cursor(0)[1]
        assert.equals(2, row, "cursor should stay on last line when at end")
      end)

      it("[f at first line stays on first line", function()
        local wt_review = require("wt_review")
        local files = {
          { path = "a.lua", added = 1, deleted = 0 },
          { path = "b.lua", added = 2, deleted = 1 },
        }
        local bufnr = wt_review.open_sidebar(files)

        local sidebar_win = find_win_for_buf(bufnr)
        assert.is_not_nil(sidebar_win, "sidebar window should exist")
        vim.api.nvim_set_current_win(sidebar_win)

        -- Try to go up from first line
        vim.cmd("normal [f")

        local row = vim.api.nvim_win_get_cursor(0)[1]
        assert.equals(1, row, "cursor should stay on first line when at start")
      end)
    end)

    describe("]h/[h hunk navigation", function()
      it("sets up ]h keymap that delegates to gitsigns via pcall on working tree buffer", function()
        local wt_review = require("wt_review")
        local base_ref = wt_review.resolve_base_ref()
        local test_file = "nvim/.config/nvim/lua/git_diff_review/init.lua"

        wt_review.open_file_diff(test_file, base_ref)

        -- Find the working tree buffer (has diff but not wtdiff filetype)
        local found_next = false
        local found_prev = false
        for _, winnr in ipairs(vim.api.nvim_list_wins()) do
          if vim.api.nvim_win_is_valid(winnr) and vim.wo[winnr].diff then
            local bufnr = vim.api.nvim_win_get_buf(winnr)
            if vim.bo[bufnr].filetype ~= "wtdiff" then
              vim.api.nvim_set_current_win(winnr)

              local map_next = vim.fn.maparg("]h", "n", false, true)
              if map_next and map_next.buffer == 1 then
                found_next = true
              end

              local map_prev = vim.fn.maparg("[h", "n", false, true)
              if map_prev and map_prev.buffer == 1 then
                found_prev = true
              end
            end
          end
        end

        assert.is_true(found_next, "]h keymap should exist on working tree buffer")
        assert.is_true(found_prev, "[h keymap should exist on working tree buffer")
      end)

      it("]h and [h callbacks use pcall for gitsigns (safe to call without gitsigns)", function()
        local wt_review = require("wt_review")
        local base_ref = wt_review.resolve_base_ref()
        local test_file = "nvim/.config/nvim/lua/git_diff_review/init.lua"

        wt_review.open_file_diff(test_file, base_ref)

        -- Find the working tree buffer and execute both mappings
        -- These should not error even without gitsigns because they use pcall
        for _, winnr in ipairs(vim.api.nvim_list_wins()) do
          if vim.api.nvim_win_is_valid(winnr) and vim.wo[winnr].diff then
            local bufnr = vim.api.nvim_win_get_buf(winnr)
            if vim.bo[bufnr].filetype ~= "wtdiff" then
              vim.api.nvim_set_current_win(winnr)

              -- Executing ]h/[h should not raise an error (pcall-protected)
              assert.has_no.errors(function()
                vim.cmd("normal ]h")
              end, "]h should not error even without gitsigns")

              assert.has_no.errors(function()
                vim.cmd("normal [h")
              end, "[h should not error even without gitsigns")
            end
          end
        end
      end)
    end)
  end)

  describe("review comment integration", function()
    -- Clean up diff state before each test to avoid "Cannot diff more than 8 buffers"
    before_each(function()
      pcall(vim.cmd, "diffoff!")
      -- Close all windows except the first one
      local wins = vim.api.nvim_list_wins()
      if #wins > 1 then
        for i = #wins, 2, -1 do
          if vim.api.nvim_win_is_valid(wins[i]) then
            pcall(vim.api.nvim_win_close, wins[i], true)
          end
        end
      end
    end)

    -- Helper: find the diff buffer pair (wtdiff and working tree)
    local function find_diff_pair()
      local wtdiff_bufnr = nil
      local work_bufnr = nil
      for _, b in ipairs(vim.api.nvim_list_bufs()) do
        if vim.api.nvim_buf_is_valid(b) then
          if vim.bo[b].filetype == "wtdiff" then
            wtdiff_bufnr = b
          elseif vim.bo[b].buftype == "" then
            -- Check if this buffer is in a diff window
            for _, w in ipairs(vim.api.nvim_list_wins()) do
              if vim.api.nvim_win_is_valid(w)
                and vim.api.nvim_win_get_buf(w) == b
                and vim.wo[w].diff then
                work_bufnr = b
                break
              end
            end
          end
        end
      end
      return wtdiff_bufnr, work_bufnr
    end

    describe("map_diff_line()", function()
      it("exports map_diff_line function on the module", function()
        local wt_review = require("wt_review")
        assert.is.Function(wt_review.map_diff_line,
          "map_diff_line should be a function")
      end)

      it("maps line 1 from wtdiff to working tree correctly", function()
        local wt_review = require("wt_review")
        local base_ref = wt_review.resolve_base_ref()
        local test_file = "nvim/.config/nvim/lua/git_diff_review/init.lua"

        wt_review.open_file_diff(test_file, base_ref)

        local wtdiff_bufnr, work_bufnr = find_diff_pair()
        assert.is_not_nil(wtdiff_bufnr, "should have a wtdiff buffer")
        assert.is_not_nil(work_bufnr, "should have a working tree diff buffer")

        local mapped = wt_review.map_diff_line(wtdiff_bufnr, work_bufnr, 1)
        assert.is_not_nil(mapped,
          "line 1 in base should map to a line in working tree")
        assert.equals(1, mapped,
          "first line of base version should map to first line of working tree")
      end)

      it("returns nil for lines beyond buffer bounds", function()
        local wt_review = require("wt_review")
        local base_ref = wt_review.resolve_base_ref()
        local test_file = "nvim/.config/nvim/lua/git_diff_review/init.lua"

        wt_review.open_file_diff(test_file, base_ref)

        local wtdiff_bufnr, work_bufnr = find_diff_pair()
        assert.is_not_nil(wtdiff_bufnr, "should have a wtdiff buffer")
        assert.is_not_nil(work_bufnr, "should have a working tree diff buffer")

        -- Check that mapping a line beyond either buffer's bounds returns nil
        local mapped = wt_review.map_diff_line(wtdiff_bufnr, work_bufnr, 999)
        assert.is_nil(mapped,
          "line beyond buffer bounds should return nil")
      end)
    end)

    describe("add_comment()", function()
      it("exports add_comment function on the module", function()
        local wt_review = require("wt_review")
        assert.is.Function(wt_review.add_comment,
          "add_comment should be a function")
      end)

      it("calls review.add() with correct line numbers from working tree buffer", function()
        local wt_review = require("wt_review")
        local review = require("review")

        -- Stub review.add to capture arguments
        local original_add = review.add
        local captured_start = nil
        local captured_end = nil
        review.add = function(line_start, line_end)
          captured_start = line_start
          captured_end = line_end
        end

        -- Focus a normal buffer (working tree file)
        local test_file = "nvim/.config/nvim/lua/git_diff_review/init.lua"
        vim.cmd("edit " .. vim.fn.fnameescape(test_file))
        vim.api.nvim_win_set_cursor(0, { 5, 0 })

        -- Call add_comment
        wt_review.add_comment()

        -- Should have called review.add with the current line (5)
        assert.is_not_nil(captured_start, "review.add should have been called")
        assert.equals(5, captured_start,
          "add_comment should pass correct line_start from normal buffer")
        assert.equals(5, captured_end,
          "add_comment should pass correct line_end from normal buffer")

        -- Restore original
        review.add = original_add
      end)

      it("does not error when called from wtdiff buffer", function()
        local wt_review = require("wt_review")
        local base_ref = wt_review.resolve_base_ref()
        local test_file = "nvim/.config/nvim/lua/git_diff_review/init.lua"

        wt_review.open_file_diff(test_file, base_ref)

        -- Focus the wtdiff window
        for _, w in ipairs(vim.api.nvim_list_wins()) do
          if vim.api.nvim_win_is_valid(w) then
            local b = vim.api.nvim_win_get_buf(w)
            if vim.bo[b].filetype == "wtdiff" then
              vim.api.nvim_set_current_win(w)
              break
            end
          end
        end

        -- Calling add_comment from a wtdiff buffer should not error
        assert.has_no.errors(function()
          wt_review.add_comment()
        end, "add_comment should not error from wtdiff buffer")
      end)
    end)
  end)

  describe("open(ref) — full review orchestration", function()
    it("exports open function on the module", function()
      local wt_review = require("wt_review")
      assert.is.Function(wt_review.open,
        "open should be a function on wt_review")
    end)

    it("open() creates sidebar + opens first file diff when called with a ref", function()
      local wt_review = require("wt_review")
      local base_ref = wt_review.resolve_base_ref()

      local buf_count_before = #vim.api.nvim_list_bufs()
      local win_count_before = #vim.api.nvim_list_wins()

      wt_review.open(base_ref)

      local buf_count_after = #vim.api.nvim_list_bufs()
      local win_count_after = #vim.api.nvim_list_wins()

      -- Should have created new buffers (sidebar + possibly diff)
      assert.is_true(buf_count_after > buf_count_before,
        "open() should create at least one new buffer")

      -- Should have created new windows (sidebar split + optionally diff split)
      assert.is_true(win_count_after > win_count_before,
        "open() should create new windows")

      -- Should have a sidebar buffer with wtreview filetype
      local found_sidebar = false
      for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.api.nvim_buf_is_valid(bufnr) and vim.bo[bufnr].filetype == "wtreview" then
          found_sidebar = true
          break
        end
      end
      assert.is_true(found_sidebar, "open() should create a sidebar buffer")

      -- Should have at least one window in diff mode (the file diff)
      local found_diff = false
      for _, winnr in ipairs(vim.api.nvim_list_wins()) do
        if vim.api.nvim_win_is_valid(winnr) and vim.wo[winnr].diff then
          found_diff = true
          break
        end
      end
      assert.is_true(found_diff, "open() should enable diff mode on at least one window")
    end)

    it("open() resolves the base ref when called without arguments", function()
      local wt_review = require("wt_review")

      -- Should not error when called with nil/empty
      assert.has_no.errors(function()
        wt_review.open()
      end, "open() should not error when called without arguments")

      -- Should still create sidebar
      local found_sidebar = false
      for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.api.nvim_buf_is_valid(bufnr) and vim.bo[bufnr].filetype == "wtreview" then
          found_sidebar = true
          break
        end
      end
      assert.is_true(found_sidebar, "open() without args should still create sidebar")
    end)
  end)

  describe("wpi TUI integration", function()
    it("wpi TUI source references wt_review instead of git_diff_review", function()
      -- Read the wpi TUI source file
      local tui_path = "wt/.local/share/wpi-tui/src/index.ts"
      local ok, lines = pcall(vim.fn.readfile, tui_path)
      assert.is_true(ok, "should be able to read " .. tui_path)

      local content = table.concat(lines, "\n")

      -- The TUI should use the new wt_review module
      -- Use plain string search (no magic chars for parens, brackets, etc.)
      local wt_pos = content:find("wt_review", 1, true)
      assert.is_not_nil(wt_pos,
        "wpi TUI source should contain 'wt_review'")

      -- The TUI should NOT reference the old git_diff_review module
      local old_pos = content:find("git_diff_review", 1, true)
      assert.is_nil(old_pos,
        "wpi TUI source should NOT contain 'git_diff_review'")
    end)

    it("wpi TUI passes WPI_BASE_REF environment variable", function()
      local tui_path = "wt/.local/share/wpi-tui/src/index.ts"
      local ok, lines = pcall(vim.fn.readfile, tui_path)
      assert.is_true(ok, "should be able to read " .. tui_path)

      local content = table.concat(lines, "\n")

      -- The TUI should still set WPI_BASE_REF for gitsigns compatibility
      assert.is_not_nil(
        content:find("WPI_BASE_REF"),
        "wpi TUI should still set WPI_BASE_REF env var"
      )
    end)
  end)
end)
