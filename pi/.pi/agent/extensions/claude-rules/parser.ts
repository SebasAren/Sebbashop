/**
 * YAML frontmatter parser for Claude rule files.
 *
 * Handles the flat key-value pairs and arrays that Claude Code uses.
 * Not a full YAML parser but sufficient for frontmatter fields:
 * `globs`|`paths` (string|string[]), `description` (string).
 */

/**
 * Parse an inline JSON-like array value: ["a", "b", "c"]
 */
export function parseInlineArray(value: string): string[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === "string");
  } catch {
    // Not valid JSON, fall through
  }
  return null;
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { frontmatter: Record<string, unknown>, body: string }.
 * Handles missing frontmatter gracefully.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const raw = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  // Minimal YAML parser — handles the flat key-value pairs and arrays that
  // Claude Code uses. Not a full YAML parser but sufficient for frontmatter.
  const lines = raw.split(/\r?\n/);
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    // Array item: - "value" or - 'value' or - value
    const arrayMatch = line.match(/^\s*-\s*(?:["'](.+?)["']|(.+))$/);
    if (arrayMatch && currentArray !== null) {
      currentArray.push((arrayMatch[1] ?? arrayMatch[2]).trim());
      continue;
    }

    // Key: value
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(?:["'](.+?)["']|(.+))?$/);
    if (kvMatch) {
      // Flush previous array
      if (currentKey && currentArray !== null) {
        frontmatter[currentKey] = currentArray;
      }

      currentKey = kvMatch[1];
      const value = kvMatch[2] ?? kvMatch[3];

      if (value === undefined || value === "") {
        // Start of a multi-line array
        currentArray = [];
      } else {
        // Try to parse as inline array first
        const inlineArray = parseInlineArray(value.trim());
        if (inlineArray) {
          frontmatter[currentKey] = inlineArray;
        } else {
          frontmatter[currentKey] = value.trim();
        }
        currentArray = null;
      }
      continue;
    }
  }

  // Flush last array
  if (currentKey && currentArray !== null) {
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter, body };
}
