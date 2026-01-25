#!/usr/bin/env bun
import { Command } from 'commander'
import { costs } from './queries/costs'
import { projects } from './queries/projects'
import { sessions } from './queries/sessions'
import { stats } from './queries/stats'

const program = new Command()

program
	.name('cc-what')
	.description('Claude Code Analytics CLI')
	.version('0.1.0')

// Stats commands
program
	.command('stats')
	.description('Show usage statistics')
	.option('-d, --daily', 'Show daily activity')
	.option('-m, --models', 'Show model usage')
	.option('-h, --hours', 'Show hourly distribution')
	.action(async (options) => {
		if (options.daily) {
			const daily = await stats.daily()
			const recent = daily.slice(-7)
			console.log('Daily Activity (last 7 days):')
			for (const d of recent) {
				console.log(
					`  ${d.date}: ${d.messageCount} messages, ${d.sessionCount} sessions, ${d.toolCallCount} tools`,
				)
			}
		} else if (options.models) {
			const models = await stats.models()
			console.log('Model Usage:')
			for (const [name, usage] of Object.entries(models)) {
				console.log(
					`  ${name}: ${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens.toLocaleString()} out`,
				)
			}
		} else if (options.hours) {
			const hours = await stats.byHour()
			console.log('Hourly Distribution:')
			for (let h = 0; h < 24; h++) {
				const count = hours[String(h)] || 0
				const bar = '█'.repeat(Math.ceil(count / 100))
				console.log(`  ${String(h).padStart(2, '0')}:00 ${bar} (${count})`)
			}
		} else {
			const totals = await stats.totals()
			const tokens = await stats.totalTokens()
			const totalCost = await costs.computedTotal()
			console.log('Overall Stats:')
			console.log(`  Sessions: ${totals.sessions}`)
			console.log(`  Messages: ${totals.messages}`)
			console.log(`  Input Tokens: ${tokens.input.toLocaleString()}`)
			console.log(`  Output Tokens: ${tokens.output.toLocaleString()}`)
			console.log(`  Cache Read: ${tokens.cacheRead.toLocaleString()}`)
			console.log(`  Total Cost: $${totalCost.toFixed(2)}`)
		}
	})

// Sessions commands
program
	.command('sessions')
	.description('List sessions')
	.option('-t, --today', "Show today's sessions")
	.option('-w, --week', "Show this week's sessions")
	.option('-r, --recent <n>', 'Show recent sessions', '10')
	.option('-p, --project <path>', 'Filter by project path')
	.action(async (options) => {
		let entries: Awaited<ReturnType<typeof sessions.today>>
		if (options.today) {
			entries = await sessions.today()
			console.log(`Sessions today: ${entries.length}`)
		} else if (options.week) {
			entries = await sessions.thisWeek()
			console.log(`Sessions this week: ${entries.length}`)
		} else if (options.project) {
			entries = await sessions.forProject(options.project)
			console.log(`Sessions for ${options.project}: ${entries.length}`)
		} else {
			const limit = Number.parseInt(options.recent, 10)
			entries = await sessions.recent(limit)
			console.log('Recent sessions:')
		}

		for (const e of entries.slice(0, 10)) {
			const summary = e.summary || e.firstPrompt.slice(0, 50)
			console.log(
				`  ${e.sessionId.slice(0, 8)} | ${e.created.slice(0, 10)} | ${summary}`,
			)
		}
	})

// Costs command
program
	.command('costs')
	.description('Show cost breakdown (computed from LiteLLM pricing)')
	.option('-d, --detailed', 'Show detailed breakdown per model')
	.action(async (options) => {
		const summary = await costs.summary()

		console.log('Cost Breakdown (computed from LiteLLM pricing)')
		console.log('==============================================\n')

		for (const { model, cost } of summary.byModel) {
			if (options.detailed) {
				console.log(`${model}:`)
				console.log(`  Input:        $${cost.input.toFixed(2)}`)
				console.log(`  Output:       $${cost.output.toFixed(2)}`)
				console.log(`  Cache Create: $${cost.cacheCreation.toFixed(2)}`)
				console.log(`  Cache Read:   $${cost.cacheRead.toFixed(2)}`)
				console.log(`  Total:        $${cost.total.toFixed(2)}`)
				console.log()
			} else {
				console.log(`  ${model}: $${cost.total.toFixed(2)}`)
			}
		}

		console.log('──────────────────────────────────────────────')
		console.log(`  TOTAL: $${summary.total.toFixed(2)}`)
	})

// Projects commands
program
	.command('projects')
	.description('List projects')
	.option('-m, --messages', 'Sort by message count')
	.option('-s, --sessions', 'Sort by session count')
	.option('-r, --recent', 'Sort by recent activity')
	.option('-n, --limit <n>', 'Number of projects to show', '10')
	.action(async (options) => {
		const limit = Number.parseInt(options.limit, 10)
		let projectList: Awaited<ReturnType<typeof projects.recent>>

		if (options.messages) {
			projectList = await projects.byMessageCount(limit)
		} else if (options.sessions) {
			projectList = await projects.bySessionCount(limit)
		} else {
			projectList = await projects.recent(limit)
		}

		console.log('Projects:')
		for (const p of projectList) {
			console.log(
				`  ${p.path} | ${p.sessionCount} sessions | ${p.messageCount} messages`,
			)
		}
	})

// Summary command (default)
program
	.command('summary', { isDefault: true })
	.description('Show summary of Claude Code usage')
	.action(async () => {
		const totals = await stats.totals()
		const todayActivity = await stats.todayActivity()
		const recentSessions = await sessions.recent(3)
		const totalCost = await costs.computedTotal()

		console.log('Claude Code Usage Summary')
		console.log('========================')
		console.log(
			`Total: ${totals.sessions} sessions, ${totals.messages} messages`,
		)
		console.log(
			`Cost: $${totalCost.toFixed(2)} (computed from LiteLLM pricing)`,
		)

		if (todayActivity) {
			console.log(
				`Today: ${todayActivity.messageCount} messages, ${todayActivity.sessionCount} sessions`,
			)
		}

		console.log('\nRecent Sessions:')
		for (const s of recentSessions) {
			const summary = s.summary || s.firstPrompt.slice(0, 60)
			console.log(`  ${s.created.slice(0, 10)} | ${summary}`)
		}
	})

program.parse()
