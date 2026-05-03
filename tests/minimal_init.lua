-- Minimal init for plenary test harness
-- Sets up runtime paths to load plenary and project modules

-- Add the project root and Neovim config lua dir to the runtime path
vim.cmd("set runtimepath+=./")
vim.cmd("set runtimepath+=./nvim/.config/nvim")

-- Add plenary to the runtime path
local plenary_path = vim.fn.expand("~/.local/share/nvim/lazy/plenary.nvim")
if vim.fn.isdirectory(plenary_path) == 1 then
  vim.cmd("set runtimepath+=" .. plenary_path)
  vim.cmd("runtime plugin/plenary.vim")
end

-- Set a project name for plenary to avoid Git conflicts
vim.env.PLENARY_TEST_MINIMAL_INIT = "1"
