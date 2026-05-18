#!/usr/bin/env bun

// <xbar.title>Coding Agent Cost Tracker</xbar.title>
// <xbar.version>v1.0</xbar.version>
// <xbar.author>Taras</xbar.author>
// <xbar.desc>Display coding agent usage costs in menu bar</xbar.desc>
// <xbar.dependencies>bun,ccusage</xbar.dependencies>

// <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
// <swiftbar.hideLastUpdated>false</swiftbar.hideLastUpdated>

interface DailyEntry {
	date?: string;
	period?: string;
	agent?: string;
	source?: string;
	provider?: string;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalTokens?: number;
	totalCost: number;
	costUSD?: number;
	modelsUsed: string[];
	models?: string[] | Record<string, unknown>;
	modelBreakdowns: Array<{
		modelName: string;
		inputTokens: number;
		outputTokens: number;
		cost: number;
		costUSD?: number;
	}>;
	breakdown?: Record<
		string,
		{
			inputTokens: number;
			outputTokens: number;
			cacheCreationTokens?: number;
			cacheReadTokens?: number;
			totalTokens?: number;
			costUSD?: number;
			totalCost?: number;
			cost?: number;
		}
	>;
}

const CCUSAGE_TIMEOUT_MS = 20_000;
const PACKAGE_DIR = new URL("..", import.meta.url).pathname;
const CCUSAGE_BIN = new URL(
	"../node_modules/ccusage/dist/index.js",
	import.meta.url,
).pathname;
const CCUSAGE_SOURCES = ["claude", "codex", "opencode", "amp", "pi"] as const;

interface DailyResponse {
	daily?: DailyEntry[];
	data?: DailyEntry[];
	totals?: UsageTotals;
	summary?: UsageTotals;
}

interface SessionData {
	sessionId: string;
	session?: string;
	projectPath?: string;
	project?: string;
	agent?: string;
	source?: string;
	provider?: string;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalTokens?: number;
	totalCost: number;
	costUSD?: number;
	lastActivity?: string;
	models?: string[];
	modelsUsed?: string[];
	modelBreakdowns: Array<{
		modelName: string;
		cost: number;
		costUSD?: number;
	}>;
	breakdown?: DailyEntry["breakdown"];
}

interface SessionResponse {
	sessions?: SessionData[];
	data?: SessionData[];
	totals?: UsageTotals;
	summary?: UsageTotals;
}

interface UsageTotals {
	inputTokens?: number;
	outputTokens?: number;
	cacheCreationTokens?: number;
	cacheReadTokens?: number;
	totalInputTokens?: number;
	totalOutputTokens?: number;
	totalCacheCreationTokens?: number;
	totalCacheReadTokens?: number;
	totalTokens?: number;
	totalCost?: number;
	totalCostUSD?: number;
}

interface ProjectSessionCost {
	totalCost: number;
	modelBreakdowns: Map<string, number>;
}

interface ActiveProject {
	projectPath: string;
	projectKey: string;
	projectName: string;
	lastActivity: number;
}

interface AgentUsage {
	agent: string;
	totalCost: number;
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	modelBreakdowns: Map<string, number>;
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

async function runCcusageDaily(): Promise<{
	stdout: string;
	success: boolean;
}> {
	const since = getCurrentMonthStart();
	const focusedResults = await Promise.all(
		CCUSAGE_SOURCES.map(async (source) => {
			const result = await runCcusage([
				source,
				"daily",
				"--json",
				"--offline",
				"--since",
				since,
			]);
			if (!result.success || !result.stdout) return [];

			try {
				const parsed = JSON.parse(result.stdout) as DailyResponse;
				return getDailyEntries(parsed).map((entry) => ({
					...entry,
					agent: source,
				}));
			} catch {
				return [];
			}
		}),
	);
	const focusedEntries = focusedResults.flat();
	if (focusedEntries.length > 0) {
		return {
			stdout: JSON.stringify({ daily: focusedEntries }),
			success: true,
		};
	}

	return runCcusage([
		"daily",
		"--json",
		"--breakdown",
		"--offline",
		"--since",
		since,
	]);
}

function getCurrentMonthStart(): string {
	const now = new Date();
	return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}01`;
}

function getTodayDate(): string {
	return new Date().toISOString().slice(0, 10);
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

async function getSessionCostsByProject(): Promise<
	Map<string, ProjectSessionCost>
> {
	const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	const projectMap = new Map<string, ProjectSessionCost>();

	try {
		const sessionResult = await runCcusage([
			"session",
			"--json",
			"--since",
			today,
			"--offline",
		]);
		if (!sessionResult.success) return projectMap;
		const stdout = sessionResult.stdout;
		const parsed = JSON.parse(stdout) as SessionResponse;
		const sessions = getSessionEntries(parsed);
		if (sessions.length > 0) {
			for (const session of sessions) {
				const key = session.projectPath ?? session.project;
				if (!key) continue;
				const existing = projectMap.get(key) ?? {
					totalCost: 0,
					modelBreakdowns: new Map<string, number>(),
				};
				existing.totalCost += getEntryCost(session);
				for (const breakdown of getModelCosts(session)) {
					existing.modelBreakdowns.set(
						breakdown.model,
						(existing.modelBreakdowns.get(breakdown.model) ?? 0) +
							breakdown.cost,
					);
				}
				projectMap.set(key, existing);
			}
		}
	} catch {
		// Return empty map on error
	}

	return projectMap;
}

async function runCcusage(args: string[]): Promise<{
	stdout: string;
	success: boolean;
}> {
	const proc = Bun.spawn([process.execPath, CCUSAGE_BIN, ...args], {
		cwd: PACKAGE_DIR,
		stdout: "pipe",
		stderr: "ignore",
		env: {
			...process.env,
			CCUSAGE_BUN_AUTO_RUN: "0",
		},
	});

	let timeout: Timer | undefined;
	const timeoutPromise = new Promise<"timeout">((resolve) => {
		timeout = setTimeout(() => resolve("timeout"), CCUSAGE_TIMEOUT_MS);
	});

	const exitPromise = proc.exited.then((code) =>
		code === 0 ? "success" : "failure",
	);
	const result = await Promise.race([exitPromise, timeoutPromise]);
	if (timeout) clearTimeout(timeout);

	if (result === "timeout") {
		proc.kill();
		return { stdout: "", success: false };
	}

	const stdout = await new Response(proc.stdout).text();
	return { stdout, success: result === "success" };
}

function getDailyEntries(response: DailyResponse): DailyEntry[] {
	if (Array.isArray(response.daily)) return response.daily;
	if (Array.isArray(response.data)) return response.data;
	if (Array.isArray(response)) return response;
	return [];
}

function getSessionEntries(response: SessionResponse): SessionData[] {
	if (Array.isArray(response.sessions)) return response.sessions;
	if (Array.isArray(response.data)) return response.data;
	if (Array.isArray(response)) return response;
	return [];
}

function getEntryCost(entry: DailyEntry | SessionData): number {
	return entry.totalCost ?? entry.costUSD ?? 0;
}

function getEntryAgent(entry: DailyEntry | SessionData): string {
	const raw = entry.agent ?? entry.source ?? entry.provider ?? "Claude";
	return raw
		.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getEntryDate(entry: DailyEntry): string {
	return entry.date ?? entry.period ?? "";
}

function getEntryModels(entry: DailyEntry | SessionData): string[] {
	if (Array.isArray(entry.models)) return entry.models;
	if (entry.models && typeof entry.models === "object") {
		return Object.keys(entry.models);
	}
	return entry.modelsUsed ?? [];
}

function getModelCosts(
	entry: DailyEntry | SessionData,
): Array<{ model: string; cost: number }> {
	const modelBreakdowns = entry.modelBreakdowns ?? [];
	if (modelBreakdowns.length > 0) {
		return modelBreakdowns.map((breakdown) => ({
			model: breakdown.modelName,
			cost: breakdown.cost ?? breakdown.costUSD ?? 0,
		}));
	}

	if (entry.breakdown) {
		return Object.entries(entry.breakdown).map(([model, breakdown]) => ({
			model,
			cost: breakdown.costUSD ?? breakdown.totalCost ?? breakdown.cost ?? 0,
		}));
	}

	return getEntryModels(entry).map((model) => ({ model, cost: 0 }));
}

function summarizeByAgent(entries: DailyEntry[]): AgentUsage[] {
	const agents = new Map<string, AgentUsage>();
	for (const entry of entries) {
		const agent = getEntryAgent(entry);
		const existing = agents.get(agent) ?? {
			agent,
			totalCost: 0,
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			modelBreakdowns: new Map<string, number>(),
		};

		existing.totalCost += getEntryCost(entry);
		existing.inputTokens += entry.inputTokens ?? 0;
		existing.outputTokens += entry.outputTokens ?? 0;
		existing.cacheCreationTokens += entry.cacheCreationTokens ?? 0;
		existing.cacheReadTokens += entry.cacheReadTokens ?? 0;

		for (const breakdown of getModelCosts(entry)) {
			existing.modelBreakdowns.set(
				breakdown.model,
				(existing.modelBreakdowns.get(breakdown.model) ?? 0) + breakdown.cost,
			);
		}

		agents.set(agent, existing);
	}

	return [...agents.values()].sort((a, b) => b.totalCost - a.totalCost);
}

function formatModelName(modelName: string): string {
	return modelName
		.replace(/^claude-/, "")
		.replace(/^openai\//, "")
		.replace(/^anthropic\./, "")
		.replace(/-20\d{6}/, "")
		.replace("-20", " ");
}

async function main() {
	try {
		// Fetch all data in parallel
		const [dailyResult, activeProjects, sessionCosts] = await Promise.all([
			runCcusageDaily(),
			getRecentlyActiveProjects(30),
			getSessionCostsByProject(),
		]);

		let todayCost = 0;
		let monthCost = 0;
		let todayEntries: DailyEntry[] = [];
		let agentUsage: AgentUsage[] = [];

		if (dailyResult.success && dailyResult.stdout) {
			const parsed = JSON.parse(dailyResult.stdout) as DailyResponse;
			const dailyData = getDailyEntries(parsed);
			const latestDate = getTodayDate();
			todayEntries = dailyData.filter(
				(day) => getEntryDate(day) === latestDate,
			);
			todayCost = todayEntries.reduce((sum, day) => sum + getEntryCost(day), 0);
			agentUsage = summarizeByAgent(todayEntries);

			// Calculate current calendar month total from daily data
			const currentMonth = new Date().toISOString().slice(0, 7); // "2026-01"
			monthCost = dailyData
				.filter((day) => getEntryDate(day).startsWith(currentMonth))
				.reduce((sum, day) => sum + getEntryCost(day), 0);
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
			console.log(`Active Claude Projects (${activeCount}): | size=14`);
			for (const project of activeProjects) {
				const projectCost = sessionCosts.get(project.projectKey);
				const cost = projectCost?.totalCost ?? 0;
				console.log(
					`--${project.projectName}: ${formatCost(cost)} | color=#888888`,
				);
				if (projectCost?.modelBreakdowns) {
					for (const [modelName, modelCost] of projectCost.modelBreakdowns) {
						const shortModel = formatModelName(modelName);
						console.log(
							`----${shortModel}: ${formatCost(modelCost)} | color=#666666 size=11`,
						);
					}
				}
			}
			console.log("---");
		}

		// Today's summary
		console.log(`Today: ${formatCost(todayCost)} | size=14`);
		if (todayEntries.length > 1) {
			for (const agent of agentUsage) {
				console.log(
					`--${agent.agent}: ${formatCost(agent.totalCost)} | color=#888888`,
				);
			}
		}
		if (todayEntries.length > 0) {
			const inputTokens = todayEntries.reduce(
				(sum, entry) => sum + (entry.inputTokens ?? 0),
				0,
			);
			const outputTokens = todayEntries.reduce(
				(sum, entry) => sum + (entry.outputTokens ?? 0),
				0,
			);
			const cacheReadTokens = todayEntries.reduce(
				(sum, entry) => sum + (entry.cacheReadTokens ?? 0),
				0,
			);
			console.log(
				`--Tokens: ${formatTokens(inputTokens + outputTokens)} | color=#888888`,
			);
			console.log(`--Input: ${formatTokens(inputTokens)} | color=#888888`);
			console.log(`--Output: ${formatTokens(outputTokens)} | color=#888888`);
			if (cacheReadTokens > 0) {
				console.log(
					`--Cache Read: ${formatTokens(cacheReadTokens)} | color=#888888`,
				);
			}
		}

		// Monthly summary
		console.log("---");
		console.log(`This Month: ${formatCost(monthCost)} | size=14`);

		// Agent and model breakdown
		if (agentUsage.length > 0) {
			console.log("---");
			console.log("Agents Used Today:");
			for (const agent of agentUsage) {
				console.log(
					`--${agent.agent}: ${formatCost(agent.totalCost)} | color=#888888`,
				);
				for (const [modelName, modelCost] of agent.modelBreakdowns) {
					const shortModel = formatModelName(modelName);
					const suffix = modelCost > 0 ? `: ${formatCost(modelCost)}` : "";
					console.log(`----${shortModel}${suffix} | color=#666666 size=11`);
				}
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
