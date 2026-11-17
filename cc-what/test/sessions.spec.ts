import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { config } from '../src/config'
import { query } from '../src/queries/sessions'

// 12 sessions, s01 newest ... s12 oldest. Only the 3 oldest have subagents.
const SESSION_COUNT = 12
const WITH_SUBAGENTS = ['s10', 's11', 's12']

function sessionId(i: number): string {
	return `s${String(i).padStart(2, '0')}`
}

describe('query().withSubagents().limit()', () => {
	const originalProjectsDir = config.projectsDir
	let projectsDir: string

	beforeAll(() => {
		projectsDir = mkdtempSync(join(tmpdir(), 'cc-what-sessions-'))
		const dir = join(projectsDir, '-repo')
		mkdirSync(dir)
		const entries = []
		for (let i = 1; i <= SESSION_COUNT; i++) {
			const id = sessionId(i)
			const created = new Date(Date.UTC(2026, 0, 31 - i)).toISOString()
			entries.push({
				sessionId: id,
				fullPath: join(dir, `${id}.jsonl`),
				fileMtime: 0,
				firstPrompt: id,
				summary: '',
				messageCount: 2,
				created,
				modified: created,
				gitBranch: 'main',
				projectPath: '/repo',
				isSidechain: false,
			})
			if (WITH_SUBAGENTS.includes(id)) {
				const subagents = join(dir, id, 'subagents')
				mkdirSync(subagents, { recursive: true })
				writeFileSync(join(subagents, 'agent-1.jsonl'), '')
			}
		}
		writeFileSync(
			join(dir, 'sessions-index.json'),
			JSON.stringify({ version: 1, entries }),
		)
		Object.assign(config, { projectsDir })
	})

	afterAll(() => {
		Object.assign(config, { projectsDir: originalProjectsDir })
		rmSync(projectsDir, { recursive: true, force: true })
	})

	test('returns sessions with subagents outside the first n rows', async () => {
		const result = await query().withSubagents().limit(10).get()
		expect(result.map((e) => e.sessionId)).toEqual(['s10', 's11', 's12'])
	})

	test('limit caps the number of sessions with subagents', async () => {
		const result = await query().withSubagents().limit(2).get()
		expect(result.map((e) => e.sessionId)).toEqual(['s10', 's11'])
	})

	test('withSubagents without limit returns all of them', async () => {
		const result = await query().withSubagents().get()
		expect(result.map((e) => e.sessionId)).toEqual(['s10', 's11', 's12'])
	})

	test('limit without withSubagents is unchanged', async () => {
		const result = await query().limit(3).get()
		expect(result.map((e) => e.sessionId)).toEqual(['s01', 's02', 's03'])
	})
})
