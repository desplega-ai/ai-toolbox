#!/usr/bin/env bun

// <xbar.title>Claude Code Cost Tracker</xbar.title>
// <xbar.version>v1.0</xbar.version>
// <xbar.author>Taras</xbar.author>
// <xbar.desc>Display Claude Code usage costs in menu bar</xbar.desc>
// <xbar.dependencies>bun,ccusage</xbar.dependencies>

// <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
// <swiftbar.hideLastUpdated>false</swiftbar.hideLastUpdated>

import { $ } from "bun";

interface DailyEntry {
	date: string;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalCost: number;
	modelsUsed: string[];
	modelBreakdowns: Array<{
		modelName: string;
		inputTokens: number;
		outputTokens: number;
		cost: number;
	}>;
}

interface DailyResponse {
	daily: DailyEntry[];
}

interface SessionData {
	sessionId: string;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalCost: number;
	modelBreakdowns: Array<{
		modelName: string;
		cost: number;
	}>;
}

interface SessionResponse {
	sessions: SessionData[];
}

interface ActiveProject {
	projectPath: string;
	projectKey: string;
	projectName: string;
	lastActivity: number;
}

function formatCost(cost: number): string {
	return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) {
		return `${(tokens / 1_000_000).toFixed(1)}M`;
	}
	if (tokens >= 1_000) {
		return `${(tokens / 1_000).toFixed(1)}K`;
	}
	return tokens.toString();
}

function getCostColor(cost: number): string {
	if (cost <= 50) return "#F44336"; // red - low usage
	if (cost <= 100) return "#FF9800"; // orange - moderate usage
	return "#4CAF50"; // green - good usage
}

async function runCcusage(
	command: string,
): Promise<{ stdout: string; success: boolean }> {
	try {
		const result = await $`npx ccusage --json ${command}`.quiet();
		return { stdout: result.stdout.toString(), success: true };
	} catch {
		return { stdout: "", success: false };
	}
}

function pathToProjectKey(projectPath: string): string {
	// Replace all slashes with dashes to match ccusage sessionId format
	return projectPath.replace(/\//g, "-");
}

function getProjectName(projectPath: string): string {
	return projectPath.split("/").pop() || projectPath;
}

async function getRecentlyActiveProjects(
	minutesAgo = 30,
): Promise<ActiveProject[]> {
	const historyPath = `${process.env.HOME}/.claude/history.jsonl`;
	const cutoffTime = Date.now() - minutesAgo * 60 * 1000;

	try {
		const file = Bun.file(historyPath);
		const text = await file.text();
		const lines = text.trim().split("\n");

		// Read last 200 lines to find recent activity
		const recentLines = lines.slice(-200);
		const projectMap = new Map<string, number>();

		for (const line of recentLines) {
			try {
				const entry = JSON.parse(line) as {
					project?: string;
					timestamp?: number;
				};
				if (entry.project && entry.timestamp && entry.timestamp >= cutoffTime) {
					const existing = projectMap.get(entry.project);
					if (!existing || entry.timestamp > existing) {
						projectMap.set(entry.project, entry.timestamp);
					}
				}
			} catch {
				// Skip malformed lines
			}
		}

		const activeProjects: ActiveProject[] = [];
		for (const [projectPath, lastActivity] of projectMap) {
			activeProjects.push({
				projectPath,
				projectKey: pathToProjectKey(projectPath),
				projectName: getProjectName(projectPath),
				lastActivity,
			});
		}

		// Sort by most recent activity
		return activeProjects.sort((a, b) => b.lastActivity - a.lastActivity);
	} catch {
		return [];
	}
}

async function getSessionCosts(): Promise<Map<string, SessionData>> {
	const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	const sessionMap = new Map<string, SessionData>();

	try {
		// Use npx to avoid bunx caching issues
		const result =
			await $`npx ccusage session --json --since ${today}`.quiet();
		const stdout = result.stdout.toString();
		const parsed = JSON.parse(stdout) as SessionResponse;
		if (parsed.sessions) {
			for (const session of parsed.sessions) {
				sessionMap.set(session.sessionId, session);
			}
		}
	} catch {
		// Return empty map on error
	}

	return sessionMap;
}

async function main() {
	try {
		// Fetch all data in parallel
		const [dailyResult, activeProjects, sessionCosts] = await Promise.all([
			runCcusage("daily"),
			getRecentlyActiveProjects(30),
			getSessionCosts(),
		]);

		let todayCost = 0;
		let monthCost = 0;
		let today: DailyEntry | undefined;

		if (dailyResult.success && dailyResult.stdout) {
			const parsed = JSON.parse(dailyResult.stdout) as DailyResponse;
			const dailyData = parsed.daily;
			// Data is sorted oldest first, get the most recent (last) entry for today
			today = dailyData[dailyData.length - 1];
			todayCost = today?.totalCost ?? 0;

			// Calculate current calendar month total from daily data
			const currentMonth = new Date().toISOString().slice(0, 7); // "2026-01"
			monthCost = dailyData
				.filter((day) => day.date.startsWith(currentMonth))
				.reduce((sum, day) => sum + day.totalCost, 0);
		}

		// Menu bar display with active session count
		const color = getCostColor(todayCost);
		const activeCount = activeProjects.length;
		const menuBarText =
			activeCount > 0
				? `(${activeCount}) ${formatCost(todayCost)}`
				: formatCost(todayCost);
		console.log(`${menuBarText} | color=${color} font=SF\\ Mono size=12`);

		// Dropdown separator
		console.log("---");

		// Active sessions section (if any)
		if (activeCount > 0) {
			console.log(`Active (${activeCount}): | size=14`);
			for (const project of activeProjects) {
				const sessionData = sessionCosts.get(project.projectKey);
				const cost = sessionData?.totalCost ?? 0;
				console.log(
					`--${project.projectName}: ${formatCost(cost)} | color=#888888`,
				);
				// Model breakdown for this session
				if (sessionData?.modelBreakdowns) {
					for (const breakdown of sessionData.modelBreakdowns) {
						const shortModel = breakdown.modelName
							.replace("claude-", "")
							.replace("-20", " ");
						console.log(
							`----${shortModel}: ${formatCost(breakdown.cost)} | color=#666666 size=11`,
						);
					}
				}
			}
			console.log("---");
		}

		// Today's summary
		console.log(`Today: ${formatCost(todayCost)} | size=14`);
		if (today) {
			console.log(
				`--Tokens: ${formatTokens(today.inputTokens + today.outputTokens)} | color=#888888`,
			);
			console.log(
				`--Input: ${formatTokens(today.inputTokens)} | color=#888888`,
			);
			console.log(
				`--Output: ${formatTokens(today.outputTokens)} | color=#888888`,
			);
			if (today.cacheReadTokens > 0) {
				console.log(
					`--Cache Read: ${formatTokens(today.cacheReadTokens)} | color=#888888`,
				);
			}
		}

		// Monthly summary
		console.log("---");
		console.log(`This Month: ${formatCost(monthCost)} | size=14`);

		// Model breakdown
		if (today?.modelBreakdowns && today.modelBreakdowns.length > 0) {
			console.log("---");
			console.log("Models Used Today:");
			for (const breakdown of today.modelBreakdowns) {
				const shortModel = breakdown.modelName
					.replace("claude-", "")
					.replace("-20", " ");
				console.log(
					`--${shortModel}: ${formatCost(breakdown.cost)} | color=#888888`,
				);
			}
		}

		// Actions
		console.log("---");
		console.log("Refresh | refresh=true");
		console.log(
			"Open ccusage | bash=/usr/bin/open param1=https://github.com/ryoppippi/ccusage terminal=false",
		);
	} catch (error) {
		console.log("Error | color=red");
		console.log("---");
		console.log(
			`Error: ${error instanceof Error ? error.message : "Unknown error"}`,
		);
		console.log("---");
		console.log("Refresh | refresh=true");
	}
}

main();
