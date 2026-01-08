import { describe, expect, test } from "bun:test";
import { parseWorktreeListOutput } from "../../src/utils/git.ts";

describe("parseWorktreeListOutput", () => {
	test("parses single main worktree", () => {
		const output = `worktree /Users/test/project
HEAD abc123def456
branch refs/heads/main
`;

		const result = parseWorktreeListOutput(output, "project");

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			path: "/Users/test/project",
			head: "abc123def456",
			branch: "main",
			isMain: true,
			alias: undefined,
			projectName: "project",
		});
	});

	test("parses multiple worktrees", () => {
		const output = `worktree /Users/test/project
HEAD abc123def456
branch refs/heads/main

worktree /Users/test/project/.worktrees/project/2024-01-08-feature-auth
HEAD def789abc012
branch refs/heads/feature-auth
`;

		const result = parseWorktreeListOutput(output, "project");

		expect(result).toHaveLength(2);
		expect(result[0]!.isMain).toBe(true);
		expect(result[0]!.branch).toBe("main");

		expect(result[1]!.isMain).toBe(false);
		expect(result[1]!.branch).toBe("feature-auth");
		expect(result[1]!.alias).toBe("feature-auth");
		expect(result[1]!.path).toBe(
			"/Users/test/project/.worktrees/project/2024-01-08-feature-auth",
		);
	});

	test("parses detached HEAD worktree", () => {
		const output = `worktree /Users/test/project
HEAD abc123def456
branch refs/heads/main

worktree /Users/test/project/.worktrees/project/2024-01-08-experiment
HEAD def789abc012
detached
`;

		const result = parseWorktreeListOutput(output);

		expect(result).toHaveLength(2);
		expect(result[1]!.branch).toBe("detached");
		expect(result[1]!.alias).toBe("experiment");
	});

	test("handles empty output", () => {
		const result = parseWorktreeListOutput("");
		expect(result).toHaveLength(0);
	});

	test("handles worktree without date prefix", () => {
		const output = `worktree /Users/test/project
HEAD abc123def456
branch refs/heads/main

worktree /Users/test/other-worktree
HEAD def789abc012
branch refs/heads/feature
`;

		const result = parseWorktreeListOutput(output);

		expect(result).toHaveLength(2);
		expect(result[1]!.alias).toBeUndefined();
	});
});
