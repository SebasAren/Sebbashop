-- Plugin spec for wt_review module
-- Provides <leader>gD keymap to open the wt_review session
return {
  {
    "ibhagwan/fzf-lua",
    optional = true,
    keys = {
      {
        "<leader>gD",
        function()
          require("wt_review").open()
        end,
        desc = "Worktree diff review (side-by-side)",
      },
    },
  },
}
