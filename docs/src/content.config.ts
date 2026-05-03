import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

const tools = defineCollection({
  loader: glob({
    base: "../",
    pattern: "{AGENTS.md,nvim/README.md,pi/.pi/README.md,obsidian/AGENTS.md,kitty/README.md}",
  }),
});

export const collections = { tools };
