-- Display
-- REVIEW-TEST: small tweak for testing the review plugin
vim.o.termguicolors = true
vim.o.showmatch = true -- show matching brackets
vim.o.scrolloff = 3 -- always show 3 rows from edge of the screen
vim.o.laststatus = 3
vim.o.conceallevel = 2

-- Folds
vim.o.foldenable = true
vim.o.foldlevel = 99 -- limit folding to 4 levels
vim.o.foldlevelstart = 99
vim.o.foldcolumn = "1"

vim.o.list = false -- do not display white characters
vim.o.wrap = false --do not wrap lines even if very long
vim.o.eol = false -- show if there's no eol char
vim.o.showbreak = "↪" -- character to show when line is broken

-- Sidebar
vim.o.number = true -- line number on the left
vim.o.numberwidth = 4 -- always reserve 3 spaces for line number
vim.o.modelines = 0
vim.o.showcmd = true -- display command in bottom bar
vim.o.signcolumn = "yes:2"

-- Search
vim.o.incsearch = true -- starts searching as soon as typing, without enter needed
vim.o.ignorecase = true -- ignore letter case when searching
vim.o.smartcase = true -- case insentive unless capitals used in search
vim.o.matchtime = 2 -- delay before showing matching paren
vim.o.mps = vim.o.mps .. ",<:>"

-- White characters
vim.o.autoindent = true
vim.o.smartindent = true
-- REVIEW-TEST: widened from 2 to 4 for testing
vim.o.tabstop = 4 -- 1 tab = 4 spaces
vim.o.shiftwidth = 2 -- indentation rule
vim.o.formatoptions = "qnj1" -- q=comment, n=numbered lists, j=rm comment on join, 1=dont break 1-letter words
vim.o.expandtab = true -- expand tab to spaces

-- Commands mode
vim.o.wildmenu = true -- on TAB, complete options for system command
vim.o.wildignore = table.concat({
  "deps",
  ".svn",
  "CVS",
  ".git",
  ".hg",
  "*.o",
  "*.a",
  "*.class",
  "*.mo",
  "*.la",
  "*.so",
  "*.obj",
  "*.swp",
  "*.jpg",
  "*.png",
  "*.xpm",
  "*.gif",
  ".DS_Store",
  "*.aux",
  "*.out",
  "*.toc",
}, ",")

-- Split changes
vim.o.splitbelow = true -- when splitting horizontally, move coursor to lower pane
vim.o.splitright = true -- when splitting vertically, mnove coursor to right pane

-- Only show cursorline in the current window and in normal mode.
local cline = vim.api.nvim_create_augroup("cline", { clear = true })
vim.api.nvim_create_autocmd({ "WinLeave", "InsertEnter" }, {
  group = cline,
  callback = function()
    vim.o.cursorline = false
  end,
})
vim.api.nvim_create_autocmd({ "WinEnter", "InsertLeave" }, {
  group = cline,
  callback = function()
    vim.o.cursorline = true
  end,
})
