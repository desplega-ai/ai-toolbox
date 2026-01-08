#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync } from "node:fs";

const PLUGIN_NAME = "cc-notch.5m.ts";
const SWIFTBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/SwiftBar/Plugins`;
const XBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/xbar/plugins`;

const SOURCE_PATH = new URL("../src/plugin.ts", import.meta.url).pathname;

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

	// Remove existing symlink if present
	try {
		await $`rm -f ${targetPath}`;
	} catch {
		// Ignore errors
	}

	// Create symlink
	await $`ln -s ${SOURCE_PATH} ${targetPath}`;

	// Make executable
	await $`chmod +x ${SOURCE_PATH}`;

	console.log(`Plugin installed to: ${targetPath}`);
	console.log(`\nThe plugin will refresh every 5 minutes.`);
	console.log(
		`If SwiftBar/xbar is running, it should appear in your menu bar shortly.`,
	);
}

main();
