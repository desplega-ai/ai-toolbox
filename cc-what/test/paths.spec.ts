import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { config } from '../src/config'
import { forProject } from '../src/queries/sessions'
import { encodePath } from '../src/utils/paths'

describe('encodePath', () => {
	test('replaces slashes', () => {
		expect(encodePath('/Users/taras/code')).toBe('-Users-taras-code')
	})

	test('keeps existing dashes', () => {
		expect(encodePath('/Users/taras/ai-toolbox')).toBe(
			'-Users-taras-ai-toolbox',
		)
	})

	// Claude Code names ~/.claude/projects/<dir> by replacing every
	// non-alphanumeric character with '-', not only '/'.
	test('replaces dots', () => {
		expect(encodePath('/Users/x/.config/app')).toBe('-Users-x--config-app')
		expect(encodePath('/repo/.claude/worktrees/v1')).toBe(
			'-repo--claude-worktrees-v1',
		)
		expect(encodePath('/home/me/foo.v2')).toBe('-home-me-foo-v2')
	})

	test('replaces underscores and spaces', () => {
		expect(encodePath('/home/me/my_project')).toBe('-home-me-my-project')
		expect(encodePath('/Users/me/My Projects/app')).toBe(
			'-Users-me-My-Projects-app',
		)
	})
})

describe('forProject', () => {
	const originalProjectsDir = config.projectsDir
	let projectsDir: string

	beforeAll(() => {
		projectsDir = mkdtempSync(join(tmpdir(), 'cc-what-paths-'))
		// Directory name as Claude Code writes it for /Users/x/.config/app
		const dir = join(projectsDir, '-Users-x--config-app')
		mkdirSync(dir)
		writeFileSync(
			join(dir, 'sessions-index.json'),
			JSON.stringify({
				version: 1,
				entries: [
					{
						sessionId: 's1',
						fullPath: join(dir, 's1.jsonl'),
						fileMtime: 0,
						firstPrompt: 'hi',
						summary: '',
						messageCount: 2,
						created: '2026-01-01T00:00:00.000Z',
						modified: '2026-01-01T00:00:00.000Z',
						gitBranch: 'main',
						projectPath: '/Users/x/.config/app',
						isSidechain: false,
					},
				],
			}),
		)
		Object.assign(config, { projectsDir })
	})

	afterAll(() => {
		Object.assign(config, { projectsDir: originalProjectsDir })
		rmSync(projectsDir, { recursive: true, force: true })
	})

	test('finds sessions for a project path containing a dot', async () => {
		const entries = await forProject('/Users/x/.config/app')
		expect(entries.map((e) => e.sessionId)).toEqual(['s1'])
	})
})
