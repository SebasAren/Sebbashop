/**
 * Schema definition for the fuzzy edit tool.
 * Matches the built-in edit tool schema for compatibility.
 */

import { Type } from "typebox";

export const replaceEditSchema = Type.Object(
  {
    oldText: Type.String({
      description:
        "Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.",
    }),
    newText: Type.String({ description: "Replacement text for this targeted edit." }),
  },
  { additionalProperties: false },
);

export const editSchema = Type.Object(
  {
    path: Type.String({ description: "Path to the file to edit (relative or absolute)" }),
    edits: Type.Array(replaceEditSchema, {
      description:
        "One or more targeted replacements. Each edit is matched against the original file, not incrementally. Do not include overlapping or nested edits.",
    }),
  },
  { additionalProperties: false },
);

/** Normalize legacy single-edit format (oldText/newText) to edits array */
export function prepareArguments(args: unknown): {
  path: string;
  edits: { oldText: string; newText: string }[];
} {
  if (!args || typeof args !== "object") return args as ReturnType<typeof prepareArguments>;
  const input = args as {
    path?: string;
    edits?: Array<{ oldText: string; newText: string }> | string;
    oldText?: unknown;
    newText?: unknown;
  };

  // Fix: some models serialize edits as a JSON string instead of an array.
  // Detect this and parse it before schema validation rejects it.
  if (typeof input.edits === "string") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      input.edits = JSON.parse(input.edits);
    } catch {
      // If parsing fails, let schema validation produce the error message
    }
  }

  if (typeof input.oldText !== "string" || typeof input.newText !== "string")
    return args as ReturnType<typeof prepareArguments>;
  const edits = [...(input.edits ?? [])];
  edits.push({ oldText: input.oldText, newText: input.newText });
  const { oldText: _, newText: __, ...rest } = input;
  return { ...rest, edits } as { path: string; edits: { oldText: string; newText: string }[] };
}
