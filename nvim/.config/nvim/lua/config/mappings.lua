vim.keymap.set({ "v", "n" }, "<C-b>", ":noh<cr>:call clearmatches()<cr>")

-- keep search matches in the middle of the window
vim.keymap.set("n", "n", "nzzzv")
vim.keymap.set("n", "N", "Nzzzv")

-- Same when jumping around
vim.keymap.set("n", "g;", "g;zz")

-- Begining & End of line in Normal and visual mode
vim.keymap.set({ "v", "n" }, "H", "^")
vim.keymap.set({ "v", "n" }, "L", "g_")

-- Reselect visual block after indent/outdent
vim.keymap.set("v", "<", "<gv")
vim.keymap.set("v", ">", ">gv")

-- home and end line in command mode
vim.keymap.set("c", "<C-a>", "<Home>")
vim.keymap.set("c", "<C-d>", "<End>")

-- LSP key mappings (following Neovim defaults)
vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("UserLspConfig", {}),
  callback = function(ev)
    local opts = { buffer = ev.buf }

    -- Hover documentation
    vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)

    -- Go to definition/references
    vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
    vim.keymap.set("n", "gr", vim.lsp.buf.references, opts)

    -- Code actions
    vim.keymap.set("n", "<leader>ca", vim.lsp.buf.code_action, opts)
    vim.keymap.set("v", "<leader>ca", vim.lsp.buf.code_action, opts)

    -- Rename
    vim.keymap.set("n", "<leader>rn", vim.lsp.buf.rename, opts)

    -- Diagnostics
    vim.keymap.set("n", "<leader>e", vim.diagnostic.open_float, opts)
    vim.keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
    vim.keymap.set("n", "]d", vim.diagnostic.goto_next, opts)

    -- Workspace operations
    vim.keymap.set("n", "<leader>wa", vim.lsp.buf.add_workspace_folder, opts)
    vim.keymap.set("n", "<leader>wr", vim.lsp.buf.remove_workspace_folder, opts)
    vim.keymap.set("n", "<leader>wl", function()
      print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
    end, opts)
  end,
})

-- WtReview command (replaces GitDiffReview)
vim.api.nvim_create_user_command("WtReview", function(opts)
  require("wt_review").open(opts.args ~= "" and opts.args or nil)
end, { nargs = "?", desc = "Open worktree diff review with sidebar" })

-- Backward-compatible alias
vim.api.nvim_create_user_command("GitDiffReview", function(opts)
  require("wt_review").open(opts.args ~= "" and opts.args or nil)
end, { nargs = "?", desc = "Open diff review session (alias for WtReview)" })

-- Code review keymaps
vim.keymap.set("n", "<leader>ra", function()
  require("review").add(vim.fn.line("."), vim.fn.line("."))
end, { desc = "Review: add comment" })
vim.keymap.set("x", "<leader>ra", function()
  local start = vim.fn.getpos("v")[2]
  local stop = vim.fn.getpos(".")[2]
  if start > stop then
    start, stop = stop, start
  end
  vim.schedule(function()
    require("review").add(start, stop)
  end)
  return " "
end, { desc = "Review: add comment on selection", expr = true })
vim.keymap.set("n", "<leader>rd", function()
  require("review").delete()
end, { desc = "Review: delete comment" })
vim.keymap.set("n", "<leader>rl", function()
  require("review").list()
end, { desc = "Review: list comments" })
vim.keymap.set("n", "<leader>rx", function()
  require("review").clear()
end, { desc = "Review: clear all" })
