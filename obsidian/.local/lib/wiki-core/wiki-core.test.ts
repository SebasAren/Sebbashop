import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  WIKI_DIR,
  RAW_DIR,
  IssueFrontmatter,
  parseFrontmatter,
  stringifyFrontmatter,
  readIssue,
  writeIssue,
} from "./index.ts";

// ── Constants ──

describe("constants", () => {
  test("WIKI_DIR ends with the wiki directory suffix", () => {
    expect(WIKI_DIR).toEndWith("/Documents/wiki/wiki");
  });

  test("RAW_DIR ends with the raw inbox suffix", () => {
    expect(RAW_DIR).toEndWith("/Documents/wiki/raw/inbox");
  });
});

// ── Frontmatter types ──

describe("IssueFrontmatter type shape", () => {
  test("has all required fields", () => {
    const fm: IssueFrontmatter = {
      type: "issue",
      status: "backlog",
      tags: ["bug"],
      created: "2026-04-27",
      project: "sebbaflow",
    };
    expect(fm.type).toBe("issue");
    expect(fm.status).toBe("backlog");
    expect(fm.tags).toEqual(["bug"]);
    expect(fm.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fm.project).toBe("sebbaflow");
  });

  test("blocked-by is optional", () => {
    const withBlocked: IssueFrontmatter = {
      type: "issue",
      status: "backlog",
      tags: [],
      created: "2026-04-27",
      project: "sebbaflow",
      "blocked-by": "[[other-issue]]",
    };
    expect(withBlocked["blocked-by"]).toBe("[[other-issue]]");

    const withoutBlocked: IssueFrontmatter = {
      type: "issue",
      status: "backlog",
      tags: [],
      created: "2026-04-27",
      project: "sebbaflow",
    };
    expect(withoutBlocked["blocked-by"]).toBeUndefined();
  });
});

// ── Frontmatter parsing ──

describe("parseFrontmatter", () => {
  test("parses full markdown with YAML frontmatter", () => {
    const md = `---
type: issue
status: backlog
tags: [bug, tmux]
created: 2026-04-27
blocked-by: "[[stow-issue]]"
project: sebbaflow
---

## Description
Something is broken

## Steps to Reproduce
1. Run command
2. See error

## Acceptance Criteria
- It works
`;

    const result = parseFrontmatter(md);
    expect(result.frontmatter.type).toBe("issue");
    expect(result.frontmatter.status).toBe("backlog");
    expect(result.frontmatter.tags).toEqual(["bug", "tmux"]);
    expect(result.frontmatter.created).toBe("2026-04-27");
    expect(result.frontmatter["blocked-by"]).toBe("[[stow-issue]]");
    expect(result.frontmatter.project).toBe("sebbaflow");
    expect(result.body).toContain("## Description");
    expect(result.body).toContain("Something is broken");
    expect(result.body).toContain("## Steps to Reproduce");
    expect(result.body).toContain("## Acceptance Criteria");
  });

  test("parses minimal frontmatter (no blocked-by, empty tags)", () => {
    const md = `---
type: issue
status: backlog
tags: []
created: 2026-04-27
project: sebbaflow
---

## Description
Just a test
`;

    const result = parseFrontmatter(md);
    expect(result.frontmatter.tags).toEqual([]);
    expect(result.frontmatter["blocked-by"]).toBeUndefined();
    expect(result.body).toContain("Just a test");
  });

  test("throws on missing frontmatter delimiters", () => {
    expect(() => parseFrontmatter("No frontmatter here")).toThrow();
  });

  test("throws on invalid YAML", () => {
    const md = "---\ninvalid: [unclosed\n---\nBody";
    expect(() => parseFrontmatter(md)).toThrow();
  });

  test("parses quoted values with YAML-special characters", () => {
    const md = `---
type: issue
status: backlog
tags: []
created: 2026-04-27
project: "project: with: colons"
---

Body
`;
    const result = parseFrontmatter(md);
    expect(result.frontmatter.project).toBe("project: with: colons");
  });

  test("parses blocked-by with plain string", () => {
    const md = `---
type: issue
status: backlog
tags: []
created: 2026-04-27
project: test
blocked-by: some-other-issue
---

Body
`;
    const result = parseFrontmatter(md);
    expect(result.frontmatter["blocked-by"]).toBe("some-other-issue");
  });

  test("throws on unknown frontmatter keys", () => {
    const md = `---
type: issue
status: backlog
tags: []
created: 2026-04-27
project: test
unknown-key: value
---

Body
`;
    expect(() => parseFrontmatter(md)).toThrow(/Unknown frontmatter key/);
  });

  test("throws on invalid status value", () => {
    const md = `---
type: issue
status: invalid
tags: []
created: 2026-04-27
project: test
---

Body
`;
    expect(() => parseFrontmatter(md)).toThrow(/Invalid status/);
  });

  test("throws on missing required field", () => {
    const md = `---
type: issue
status: backlog
tags: []
created: 2026-04-27
---

Body
`;
    expect(() => parseFrontmatter(md)).toThrow(/Invalid project/);
  });

  test("throws on invalid tags type", () => {
    const md = `---
type: issue
status: backlog
tags: not-an-array
created: 2026-04-27
project: test
---

Body
`;
    expect(() => parseFrontmatter(md)).toThrow(/Invalid tags/);
  });

  test("throws on invalid created format", () => {
    const md = `---
type: issue
status: backlog
tags: []
created: 04/27/2026
project: test
---

Body
`;
    expect(() => parseFrontmatter(md)).toThrow(/Invalid created/);
  });
});

// ── Frontmatter stringify ──

describe("stringifyFrontmatter", () => {
  test("serializes frontmatter + body back to matching markdown", () => {
    const fm: IssueFrontmatter = {
      type: "issue",
      status: "in-progress",
      tags: ["bug"],
      created: "2026-04-27",
      project: "sebbaflow",
    };
    const body = "\n## Description\nTest\n";

    const result = stringifyFrontmatter(fm, body);
    // Re-parse and verify round-trip
    const parsed = parseFrontmatter(result);
    expect(parsed.frontmatter.status).toBe("in-progress");
    expect(parsed.body.trim()).toBe("## Description\nTest");
  });

  test("preserves blocked-by field", () => {
    const fm: IssueFrontmatter = {
      type: "issue",
      status: "backlog",
      tags: [],
      created: "2026-04-27",
      project: "sebbaflow",
      "blocked-by": "[[other-issue]]",
    };
    const body = "\n## Description\nBlocked\n";

    const result = stringifyFrontmatter(fm, body);
    const parsed = parseFrontmatter(result);
    expect(parsed.frontmatter["blocked-by"]).toBe("[[other-issue]]");
  });

  test("round-trips all field variations", () => {
    const fm: IssueFrontmatter = {
      type: "issue",
      status: "done",
      tags: ["bug", "has space", "has,comma"],
      created: "2026-01-01",
      project: "project: with colons",
      "blocked-by": "[[some-issue]]",
    };
    const body = "\n## Section\nContent\n";

    const result = stringifyFrontmatter(fm, body);
    const parsed = parseFrontmatter(result);
    expect(parsed.frontmatter).toEqual(fm);
  });

  test("omits blocked-by when undefined", () => {
    const fm: IssueFrontmatter = {
      type: "issue",
      status: "backlog",
      tags: [],
      created: "2026-04-27",
      project: "test",
    };

    const result = stringifyFrontmatter(fm, "\nBody\n");
    expect(result).not.toContain("blocked-by");
    const parsed = parseFrontmatter(result);
    expect(parsed.frontmatter["blocked-by"]).toBeUndefined();
  });
});

// ── File I/O ──

describe("readIssue / writeIssue", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wiki-core-io-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("writeIssue creates file with correct content", async () => {
    const fm: IssueFrontmatter = {
      type: "issue",
      status: "backlog",
      tags: ["test"],
      created: "2026-04-27",
      project: "sebbaflow",
    };
    const body = "\n## Description\nWrite test\n";

    writeIssue(tmpDir, "test-issue", fm, body);
    const filePath = join(tmpDir, "issues", "test-issue.md");
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("type: issue");
    expect(content).toContain("status: backlog");
    expect(content).toContain("Write test");
  });

  test("readIssue reads back what writeIssue wrote", () => {
    const fm: IssueFrontmatter = {
      type: "issue",
      status: "backlog",
      tags: ["roundtrip"],
      created: "2026-04-27",
      project: "sebbaflow",
      "blocked-by": "[[other-issue]]",
    };
    const body = "\n## Description\nRound-trip test\n";

    writeIssue(tmpDir, "round-trip", fm, body);
    const result = readIssue(tmpDir, "round-trip");

    expect(result.frontmatter.type).toBe("issue");
    expect(result.frontmatter.status).toBe("backlog");
    expect(result.frontmatter.tags).toEqual(["roundtrip"]);
    expect(result.frontmatter["blocked-by"]).toBe("[[other-issue]]");
    expect(result.frontmatter.project).toBe("sebbaflow");
    expect(result.body).toContain("Round-trip test");
  });

  test("readIssue throws for non-existent file", () => {
    expect(() => readIssue(tmpDir, "nonexistent")).toThrow();
  });
});
