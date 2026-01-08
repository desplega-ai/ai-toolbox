import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	branchExists,
	createWorktree,
	findWorktreeByAlias,
	generateWorktreePath,
	getCurrentBranch,
	getGitRoot,
	listWorktrees,
	removeWorktree,
} from "../../src/utils/git.ts";

describe("create command integration", () => {
	let tempDir: string;
	let gitRoot: string;
	let defaultBranch: string;

	beforeAll(async () => {
		// Create temp directory and resolve symlinks (macOS /var -> /private/var)
		const rawTempDir = await mkdtemp(join(tmpdir(), "wts-test-"));
		tempDir = await realpath(rawTempDir);
		gitRoot = join(tempDir, "test-repo");

		// Initialize git repo
		await Bun.$`mkdir -p ${gitRoot}`;
		await Bun.$`git init`.cwd(gitRoot).quiet();
		await Bun.$`git config user.email "test@test.com"`.cwd(gitRoot).quiet();
		await Bun.$`git config user.name "Test User"`.cwd(gitRoot).quiet();

		// Create initial commit
		await Bun.$`touch README.md`.cwd(gitRoot);
		await Bun.$`git add .`.cwd(gitRoot).quiet();
		await Bun.$`git commit -m "Initial commit"`.cwd(gitRoot).quiet();

		// Get the default branch name (could be main or master depending on git config)
		defaultBranch = await getCurrentBranch(gitRoot);
	});

	afterAll(async () => {
		// Clean up temp directory
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("getGitRoot returns correct path", async () => {
		const root = await getGitRoot(gitRoot);
		// Resolve symlinks on both sides to handle macOS /var -> /private/var
		const resolvedRoot = root ? await realpath(root) : undefined;
		const resolvedGitRoot = await realpath(gitRoot);
		expect(resolvedRoot).toBe(resolvedGitRoot);
	});

	test("getGitRoot returns undefined outside git repo", async () => {
		const root = await getGitRoot(tmpdir());
		expect(root).toBeUndefined();
	});

	test("listWorktrees returns main worktree", async () => {
		const worktrees = await listWorktrees(gitRoot);
		expect(worktrees.length).toBeGreaterThanOrEqual(1);
		expect(worktrees[0]!.isMain).toBe(true);
	});

	test("createWorktree creates new worktree with new branch", async () => {
		const worktreePath = join(tempDir, "worktree-1");

		await createWorktree(
			worktreePath,
			{ newBranch: "feature-test", baseBranch: defaultBranch },
			gitRoot,
		);

		const worktrees = await listWorktrees(gitRoot);
		// Need to resolve symlinks in paths for comparison
		const created = worktrees.find((wt) => wt.branch === "feature-test");

		expect(created).toBeDefined();
		expect(created?.branch).toBe("feature-test");

		// Clean up
		await removeWorktree(created?.path ?? worktreePath, true, gitRoot);
	});

	test("createWorktree with existing branch", async () => {
		// First create a branch
		await Bun.$`git branch existing-branch`.cwd(gitRoot).quiet();

		const worktreePath = join(tempDir, "worktree-2");

		await createWorktree(worktreePath, { branch: "existing-branch" }, gitRoot);

		const worktrees = await listWorktrees(gitRoot);
		// Find by branch name instead of path to avoid symlink issues
		const created = worktrees.find((wt) => wt.branch === "existing-branch");

		expect(created).toBeDefined();
		expect(created?.branch).toBe("existing-branch");

		// Clean up
		await removeWorktree(created?.path ?? worktreePath, true, gitRoot);
	});

	test("branchExists returns true for existing branch", async () => {
		const exists = await branchExists(defaultBranch, gitRoot);
		expect(exists).toBe(true);
	});

	test("branchExists returns false for non-existent branch", async () => {
		const exists = await branchExists("non-existent-branch-xyz", gitRoot);
		expect(exists).toBe(false);
	});

	test("generateWorktreePath creates date-prefixed path", () => {
		const baseDir = "/test/base/.worktrees/project";
		const path = generateWorktreePath(baseDir, "my-feature");

		expect(path).toMatch(/^\/test\/base\/\.worktrees\/project\/\d{4}-\d{2}-\d{2}-my-feature$/);
	});

	test("findWorktreeByAlias finds worktree", async () => {
		// Create a worktree with date prefix to test alias parsing
		const today = new Date().toISOString().slice(0, 10);
		const worktreePath = join(tempDir, `${today}-alias-test`);

		await createWorktree(
			worktreePath,
			{ newBranch: "alias-test-branch" },
			gitRoot,
		);

		const found = await findWorktreeByAlias("alias-test", gitRoot);
		expect(found).toBeDefined();
		expect(found?.alias).toBe("alias-test");

		// Clean up
		await removeWorktree(worktreePath, true, gitRoot);
	});

	test("findWorktreeByAlias returns undefined for non-existent alias", async () => {
		const found = await findWorktreeByAlias("non-existent-xyz", gitRoot);
		expect(found).toBeUndefined();
	});
});
