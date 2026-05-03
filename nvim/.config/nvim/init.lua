require("config.lazy")

-- REVIEW-TEST: Added for testing the new review plugin
require("config.filetypes")
require("config.settings")
require("config.mappings")
require("config.lsp")
require("config.diagnostic")

-- Code review setup
require("review").setup({
  keys = {
    add = false,
    delete = false,
    list = false,
    save = false,
    clear = false,
  },
})

pcall(function()
  require("custom-settings")
end)
