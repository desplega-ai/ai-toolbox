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
		const result = await $`bunx ccusage --json ${command}`.quiet();
		return { stdout: result.stdout.toString(), success: true };
	} catch {
		return { stdout: "", success: false };
	}
}

async function main() {
	try {
		const dailyResult = await runCcusage("daily");

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

		// Menu bar display
		const color = getCostColor(todayCost);
		console.log(
			`${formatCost(todayCost)} | color=${color} font=SF\\ Mono size=12`,
		);

		// Dropdown separator
		console.log("---");

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
