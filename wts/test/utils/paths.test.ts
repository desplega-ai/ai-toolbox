import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import {
	formatPath,
	generateWorktreeDirName,
	getProjectName,
	parseWorktreeAlias,
} from "../../src/utils/paths.ts";

describe("getProjectName", () => {
	test("extracts project name from absolute path", () => {
		expect(getProjectName("/Users/test/code/my-project")).toBe("my-project");
	});

	test("extracts project name from nested path", () => {
		expect(getProjectName("/a/b/c/d/project-name")).toBe("project-name");
	});

	test("handles single segment path", () => {
		expect(getProjectName("/project")).toBe("project");
	});
});

describe("formatPath", () => {
	test("replaces home directory with ~", () => {
		const home = homedir();
		expect(formatPath(`${home}/code/project`)).toBe("~/code/project");
	});

	test("leaves non-home paths unchanged", () => {
		expect(formatPath("/var/log/test")).toBe("/var/log/test");
	});

	test("handles home directory itself", () => {
		const home = homedir();
		expect(formatPath(home)).toBe("~");
	});
});

describe("generateWorktreeDirName", () => {
	test("generates date-prefixed directory name", () => {
		const result = generateWorktreeDirName("feature-auth");
		// Should match YYYY-MM-DD-feature-auth pattern
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-feature-auth$/);
	});

	test("handles aliases with multiple hyphens", () => {
		const result = generateWorktreeDirName("my-cool-feature");
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-my-cool-feature$/);
	});
});

describe("parseWorktreeAlias", () => {
	test("extracts alias from date-prefixed name", () => {
		expect(parseWorktreeAlias("2024-01-08-feature-auth")).toBe("feature-auth");
	});

	test("handles alias with multiple hyphens", () => {
		expect(parseWorktreeAlias("2024-01-08-my-cool-feature")).toBe(
			"my-cool-feature",
		);
	});

	test("returns undefined for non-date-prefixed names", () => {
		expect(parseWorktreeAlias("feature-auth")).toBeUndefined();
	});

	test("returns undefined for partial date prefix", () => {
		expect(parseWorktreeAlias("2024-01-feature")).toBeUndefined();
	});

	test("returns undefined for date without alias", () => {
		expect(parseWorktreeAlias("2024-01-08")).toBeUndefined();
	});

	test("returns undefined for date with trailing hyphen only", () => {
		// The regex requires at least one character after the date prefix
		expect(parseWorktreeAlias("2024-01-08-")).toBeUndefined();
	});
});
