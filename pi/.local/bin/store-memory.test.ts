/**
 * store-memory tests — createMemoryNote library function
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryNote } from "./store-memory";

const TEST_DIR = mkdtempSync(join(tmpdir(), "store-memory-test-"));

afterAll(() => {
	if (existsSync(TEST_DIR)) {
		rmSync(TEST_DIR, { recursive: true });
	}
});

describe("createMemoryNote", () => {
	test("creates a markdown file in the output directory", () => {
		const filePath = createMemoryNote({
			title: "Test Observation",
			content: "This is a test observation about something interesting.",
			tags: ["test", "observation"],
			outputDir: TEST_DIR,
		});

		expect(filePath).toBeDefined();
		expect(filePath).toBeString();
		expect(existsSync(filePath)).toBe(true);
		expect(filePath).toStartWith(TEST_DIR);
		expect(filePath).toEndWith(".md");
	});

	test("file follows YYYY-MM-DD-descriptive-slug.md naming", () => {
		const filePath = createMemoryNote({
			title: "Custom Agent Architecture Insights",
			content: "Some content about agent architecture.",
			tags: ["agents"],
			outputDir: TEST_DIR,
		});

		const fileName = filePath.split("/").pop()!;
		// Pattern: YYYY-MM-DD-custom-agent-architecture-insights.md
		expect(fileName).toMatch(/^\d{4}-\d{2}-\d{2}-.+\.md$/);
		// Slug should be lowercase-hyphenated from the title
		const slugPart = fileName.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
		expect(slugPart).toMatch(/^[a-z0-9-]+$/);
		expect(slugPart).toContain("custom-agent-architecture");
	});

	test("frontmatter contains title field", () => {
		const filePath = createMemoryNote({
			title: "Frontmatter Title Test",
			content: "Body content here.",
			tags: ["test"],
			outputDir: TEST_DIR,
		});

  	const content = readFileSync(filePath, "utf8");
  	expect(content).toStartWith("---\n");
  	// JSON.stringify wraps in quotes and escapes special chars
  	expect(content).toMatch(/^title: "Frontmatter Title Test"$/m);
	});

	test("frontmatter contains created field as ISO 8601", () => {
		const filePath = createMemoryNote({
			title: "ISO Date Test",
			content: "Body content.",
			tags: ["test"],
			outputDir: TEST_DIR,
		});

		const content = readFileSync(filePath, "utf8");
		expect(content).toContain("created: ");
		// Extract the created value
		const match = content.match(/created: (.+)/);
		expect(match).not.toBeNull();
		const createdDate = new Date(match![1]);
		expect(createdDate instanceof Date && !isNaN(createdDate.getTime())).toBe(true);
	});

	test("frontmatter contains tags as array", () => {
		const filePath = createMemoryNote({
			title: "Tags Array Test",
			content: "Body content.",
			tags: ["agents", "architecture", "test"],
			outputDir: TEST_DIR,
		});

		const content = readFileSync(filePath, "utf8");
		expect(content).toContain("tags:");
		expect(content).toContain("- agents");
		expect(content).toContain("- architecture");
		expect(content).toContain("- test");
	});

	test("content body is written after frontmatter", () => {
		const filePath = createMemoryNote({
			title: "Content Body Test",
			content: "This is the main body of the observation.\n\nIt can contain multiple paragraphs.",
			tags: ["test"],
			outputDir: TEST_DIR,
		});

		const content = readFileSync(filePath, "utf8");
		// Content should come after the closing --- of frontmatter
		expect(content).toContain("---\n\nThis is the main body of the observation.");
		expect(content).toContain("It can contain multiple paragraphs.");
	});

	test("generates a unique slug for different titles", () => {
		const filePath1 = createMemoryNote({
			title: "First Unique Observation",
			content: "Content A.",
			tags: ["test"],
			outputDir: TEST_DIR,
		});
		const filePath2 = createMemoryNote({
			title: "Second Different Observation",
			content: "Content B.",
			tags: ["test"],
			outputDir: TEST_DIR,
		});

		// Different titles should produce different file paths (different slugs)
		expect(filePath1).not.toBe(filePath2);
	});

	test("handles empty tags array", () => {
		const filePath = createMemoryNote({
			title: "No Tags Test",
			content: "Content with no tags.",
			tags: [],
			outputDir: TEST_DIR,
		});

		const content = readFileSync(filePath, "utf8");
		expect(content).toMatch(/^tags: \[\]$/m);

		expect(existsSync(filePath)).toBe(true);
	});

	test("throws on empty title", () => {
		expect(() =>
			createMemoryNote({
				title: "",
				content: "Content",
				tags: [],
				outputDir: TEST_DIR,
			}),
		).toThrow("title must be a non-empty string");
	});

	test("throws on whitespace-only title", () => {
		expect(() =>
			createMemoryNote({
				title: "   ",
				content: "Content",
				tags: [],
				outputDir: TEST_DIR,
			}),
		).toThrow("title must be a non-empty string");
	});

	test("default outputDir resolves to ~/Documents/wiki/raw/inbox/", () => {
		// Verify the default path suffix without writing to a local-only path.
		// The outputDir default is tested via the real createMemoryNote behavior
		// using explicit outputDir in all other tests.
		const expectedSuffix = `${process.env.HOME}/Documents/wiki/raw/inbox`;

		let filePath = "";
		try {
			// Create the target dir if needed so the test doesn't fail on missing dir
			const inboxDir = expectedSuffix;
			if (!existsSync(inboxDir)) {
				mkdirSync(inboxDir, { recursive: true });
			}

			filePath = createMemoryNote({
				title: "Default Dir Test",
				content: "Testing default output directory.",
				tags: ["test"],
			});

			expect(filePath).toStartWith(expectedSuffix);
			expect(existsSync(filePath)).toBe(true);
		} finally {
			if (filePath && existsSync(filePath)) {
				rmSync(filePath);
			}
		}
	});
});