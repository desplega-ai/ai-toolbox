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
	reasoningOutputTokens?: number;
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
	"../node_modules/ccusage/dist/cli.js",
	import.meta.url,
).pathname;
const CCUSAGE_SOURCES = ["claude", "codex", "opencode", "amp", "pi"] as const;
const ACTIVE_SESSION_SOURCES = ["claude", "codex"] as const;
const SELECTABLE_ACTION = "bash=/usr/bin/true terminal=false";

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
	directory?: string;
	agent?: string;
	source?: string;
	provider?: string;
	inputTokens: number;
	outputTokens: number;
	reasoningOutputTokens?: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	totalTokens?: number;
	totalCost: number;
	costUSD?: number;
	lastActivity?: string;
	models?: string[] | Record<string, unknown>;
	modelsUsed?: string[];
	sessionFile?: string;
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

interface ActiveSession {
	agent: string;
	projectName: string;
	sessionId: string;
	lastActivity: number;
	totalCost: number;
	inputTokens: number;
	outputTokens: number;
	reasoningOutputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	modelBreakdowns: Map<string, number>;
}

interface AgentUsage {
	agent: string;
	totalCost: number;
	inputTokens: number;
	outputTokens: number;
	reasoningOutputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	modelBreakdowns: Map<string, number>;
}

interface TokenUsageSummary {
	inputTokens: number;
	outputTokens: number;
	reasoningOutputTokens?: number;
	cacheCreationTokens?: number;
	cacheReadTokens?: number;
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

function selectable(params = ""): string {
	return params ? `${params} ${SELECTABLE_ACTION}` : SELECTABLE_ACTION;
}

function getCoreTokens(usage: TokenUsageSummary): number {
	return (
		usage.inputTokens + usage.outputTokens + (usage.reasoningOutputTokens ?? 0)
	);
}

function printTokenUsage(prefix: string, usage: TokenUsageSummary): void {
	console.log(
		`${prefix}Tokens: ${formatTokens(getCoreTokens(usage))} | ${selectable("color=#888888")}`,
	);
	console.log(
		`${prefix}Input: ${formatTokens(usage.inputTokens)} | ${selectable("color=#888888")}`,
	);
	console.log(
		`${prefix}Output: ${formatTokens(usage.outputTokens)} | ${selectable("color=#888888")}`,
	);
	if ((usage.reasoningOutputTokens ?? 0) > 0) {
		console.log(
			`${prefix}Reasoning: ${formatTokens(usage.reasoningOutputTokens ?? 0)} | ${selectable("color=#888888")}`,
		);
	}
	if ((usage.cacheCreationTokens ?? 0) > 0) {
		console.log(
			`${prefix}Cache Write: ${formatTokens(usage.cacheCreationTokens ?? 0)} | ${selectable("color=#888888")}`,
		);
	}
	if ((usage.cacheReadTokens ?? 0) > 0) {
		console.log(
			`${prefix}Cache Read: ${formatTokens(usage.cacheReadTokens ?? 0)} | ${selectable("color=#888888")}`,
		);
	}
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

function getEncodedProjectName(pathSegment: string): string | null {
	const homePrefix = process.env.HOME
		? `${pathToProjectKey(process.env.HOME)}-Documents-code-`
		: "";
	if (homePrefix && pathSegment.startsWith(homePrefix)) {
		return pathSegment.slice(homePrefix.length) || null;
	}

	return null;
}

function getProjectName(projectPath: string): string {
	const normalizedPath = projectPath.replace(/\\/g, "/");
	const segments = normalizedPath.split("/").filter(Boolean);
	const encodedProjectName = getEncodedProjectName(segments[0] ?? "");
	if (encodedProjectName) {
		const nestedName = segments.at(-1);
		return nestedName && nestedName !== segments[0]
			? `${encodedProjectName}/${nestedName}`
			: encodedProjectName;
	}

	if (normalizedPath.includes("/")) {
		return segments.at(-1) || projectPath;
	}

	return normalizedPath || projectPath;
}

function getSessionProjectPath(session: SessionData): string {
	return session.projectPath ?? session.project ?? session.directory ?? "";
}

function getSessionDisplayName(
	source: (typeof ACTIVE_SESSION_SOURCES)[number],
	session: SessionData,
): string {
	const projectPath = getSessionProjectPath(session);
	if (source !== "codex" || !/^\d{4}\/\d{2}\/\d{2}$/.test(projectPath)) {
		return getProjectName(projectPath || session.sessionId);
	}

	const sessionName =
		session.sessionFile ?? session.sessionId.split("/").at(-1);
	const sessionMatch = sessionName?.match(
		/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
	);
	return sessionMatch?.[1].slice(0, 8) ?? sessionName ?? session.sessionId;
}

async function getActiveSessions(minutesAgo = 30): Promise<ActiveSession[]> {
	const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	const cutoffTime = Date.now() - minutesAgo * 60 * 1000;

	const sourceResults = await Promise.all(
		ACTIVE_SESSION_SOURCES.map(async (source) => {
			const result = await runCcusage([
				source,
				"session",
				"--json",
				"--since",
				today,
				"--offline",
			]);
			if (!result.success || !result.stdout) return [];

			try {
				const parsed = JSON.parse(result.stdout) as SessionResponse;
				return getSessionEntries(parsed)
					.map((session) => {
						const lastActivity = session.lastActivity
							? new Date(session.lastActivity).getTime()
							: 0;
						const modelBreakdowns = new Map<string, number>();
						for (const breakdown of getModelCosts(session)) {
							modelBreakdowns.set(
								breakdown.model,
								(modelBreakdowns.get(breakdown.model) ?? 0) + breakdown.cost,
							);
						}

						return {
							agent: getEntryAgent({ ...session, agent: source }),
							projectName: getSessionDisplayName(source, session),
							sessionId: session.sessionId ?? session.session ?? "",
							lastActivity,
							totalCost: getEntryCost(session),
							inputTokens: session.inputTokens ?? 0,
							outputTokens: session.outputTokens ?? 0,
							reasoningOutputTokens: session.reasoningOutputTokens ?? 0,
							cacheCreationTokens: session.cacheCreationTokens ?? 0,
							cacheReadTokens: session.cacheReadTokens ?? 0,
							modelBreakdowns,
						};
					})
					.filter((session) => session.lastActivity >= cutoffTime);
			} catch {
				return [];
			}
		}),
	);

	return sourceResults.flat().sort((a, b) => b.lastActivity - a.lastActivity);
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
			reasoningOutputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			modelBreakdowns: new Map<string, number>(),
		};

		existing.totalCost += getEntryCost(entry);
		existing.inputTokens += entry.inputTokens ?? 0;
		existing.outputTokens += entry.outputTokens ?? 0;
		existing.reasoningOutputTokens += entry.reasoningOutputTokens ?? 0;
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
		const [dailyResult, activeSessions] = await Promise.all([
			runCcusageDaily(),
			getActiveSessions(30),
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
		const activeCount = activeSessions.length;
		const menuBarText =
			activeCount > 0
				? `(${activeCount}) ${formatCost(todayCost)}`
				: formatCost(todayCost);
		console.log(`${menuBarText} | color=${color} font=SF\\ Mono size=12`);

		// Dropdown separator
		console.log("---");

		// Active sessions section (if any)
		if (activeCount > 0) {
			console.log(
				`Active Sessions (${activeCount}): | ${selectable("size=14")}`,
			);
			for (const session of activeSessions) {
				console.log(
					`--${session.agent} ${session.projectName}: ${formatCost(session.totalCost)} | ${selectable("color=#888888")}`,
				);
				printTokenUsage("----", session);
				for (const [modelName, modelCost] of session.modelBreakdowns) {
					const shortModel = formatModelName(modelName);
					const suffix = modelCost > 0 ? `: ${formatCost(modelCost)}` : "";
					console.log(
						`----${shortModel}${suffix} | ${selectable("color=#666666 size=11")}`,
					);
				}
			}
			console.log("---");
		}

		// Today's summary
		console.log(`Today: ${formatCost(todayCost)} | ${selectable("size=14")}`);
		if (todayEntries.length > 1) {
			for (const agent of agentUsage) {
				console.log(
					`--${agent.agent}: ${formatCost(agent.totalCost)} | ${selectable("color=#888888")}`,
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
			const reasoningOutputTokens = todayEntries.reduce(
				(sum, entry) => sum + (entry.reasoningOutputTokens ?? 0),
				0,
			);
			const cacheCreationTokens = todayEntries.reduce(
				(sum, entry) => sum + (entry.cacheCreationTokens ?? 0),
				0,
			);
			const cacheReadTokens = todayEntries.reduce(
				(sum, entry) => sum + (entry.cacheReadTokens ?? 0),
				0,
			);
			printTokenUsage("--", {
				inputTokens,
				outputTokens,
				reasoningOutputTokens,
				cacheCreationTokens,
				cacheReadTokens,
			});
		}

		// Monthly summary
		console.log("---");
		console.log(
			`This Month: ${formatCost(monthCost)} | ${selectable("size=14")}`,
		);

		// Agent and model breakdown
		if (agentUsage.length > 0) {
			console.log("---");
			console.log(`Agents Used Today: | ${selectable()}`);
			for (const agent of agentUsage) {
				console.log(
					`--${agent.agent}: ${formatCost(agent.totalCost)} | ${selectable("color=#888888")}`,
				);
				printTokenUsage("----", agent);
				for (const [modelName, modelCost] of agent.modelBreakdowns) {
					const shortModel = formatModelName(modelName);
					const suffix = modelCost > 0 ? `: ${formatCost(modelCost)}` : "";
					console.log(
						`----${shortModel}${suffix} | ${selectable("color=#666666 size=11")}`,
					);
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
