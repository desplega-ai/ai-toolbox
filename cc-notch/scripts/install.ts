#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync } from "node:fs";

const PLUGIN_NAME = "cc-notch.5m.sh";
const LEGACY_PLUGIN_NAME = "cc-notch.5m.ts";
const SWIFTBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/SwiftBar/Plugins`;
const XBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/xbar/plugins`;

const SOURCE_PATH = new URL("../src/plugin.ts", import.meta.url).pathname;

async function findBunPath(): Promise<string | null> {
	// Try which bun first
	try {
		const result = await $`which bun`.quiet();
		const path = result.stdout.toString().trim();
		if (path && existsSync(path)) return path;
	} catch {
		// which failed, try fallback paths
	}

	// Fallback locations
	const fallbacks = [
		`${process.env.HOME}/.bun/bin/bun`,
		"/opt/homebrew/bin/bun",
		"/usr/local/bin/bun",
	];
	for (const p of fallbacks) {
		if (existsSync(p)) return p;
	}
	return null;
}

async function findPluginDir(): Promise<string | null> {
	// Check if SwiftBar app is installed
	const swiftbarAppExists =
		existsSync("/Applications/SwiftBar.app") ||
		existsSync(`${process.env.HOME}/Applications/SwiftBar.app`);

	if (swiftbarAppExists) {
		// Create the plugins directory if it doesn't exist
		await $`mkdir -p ${SWIFTBAR_PLUGINS_DIR}`;
		return SWIFTBAR_PLUGINS_DIR;
	}

	// Check if xbar app is installed
	const xbarAppExists =
		existsSync("/Applications/xbar.app") ||
		existsSync(`${process.env.HOME}/Applications/xbar.app`);

	if (xbarAppExists) {
		// Create the plugins directory if it doesn't exist
		await $`mkdir -p ${XBAR_PLUGINS_DIR}`;
		return XBAR_PLUGINS_DIR;
	}

	return null;
}

async function main() {
	console.log("Installing cc-notch plugin...\n");

	// Find bun path
	const bunPath = await findBunPath();
	if (!bunPath) {
		console.log("Could not find bun executable.");
		console.log("\nPlease install bun first:");
		console.log("  curl -fsSL https://bun.sh/install | bash");
		console.log("\nOr with Homebrew:");
		console.log("  brew install oven-sh/bun/bun");
		process.exit(1);
	}

	console.log(`Found bun at: ${bunPath}`);

	// Check if SwiftBar or xbar is installed
	const pluginDir = await findPluginDir();

	if (!pluginDir) {
		console.log("Neither SwiftBar nor xbar found.");
		console.log("\nPlease install SwiftBar first:");
		console.log("  brew install --cask swiftbar");
		console.log("\nOr install xbar:");
		console.log("  brew install --cask xbar");
		process.exit(1);
	}

	const targetPath = `${pluginDir}/${PLUGIN_NAME}`;
	const legacyPath = `${pluginDir}/${LEGACY_PLUGIN_NAME}`;

	// Remove existing plugin and legacy symlink if present
	try {
		await $`rm -f ${targetPath}`;
		await $`rm -f ${legacyPath}`;
	} catch {
		// Ignore errors
	}

	// Generate wrapper script with absolute bun path
	const wrapperContent = `#!/bin/bash
exec "${bunPath}" "${SOURCE_PATH}" "$@"
`;

	// Write wrapper script
	await Bun.write(targetPath, wrapperContent);

	// Make wrapper executable
	await $`chmod +x ${targetPath}`;

	// Also make source executable for direct development use
	await $`chmod +x ${SOURCE_PATH}`;

	console.log(`Plugin installed to: ${targetPath}`);
	console.log(`\nThe plugin will refresh every 5 minutes.`);
	console.log(
		`If SwiftBar/xbar is running, it should appear in your menu bar shortly.`,
	);
}

main();
