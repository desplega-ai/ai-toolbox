#!/usr/bin/env bun

import { $ } from "bun";

const PLUGIN_NAME = "cc-notch.5m.ts";
const SWIFTBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/SwiftBar/Plugins`;
const XBAR_PLUGINS_DIR = `${process.env.HOME}/Library/Application Support/xbar/plugins`;

async function main() {
	console.log("Uninstalling cc-notch plugin...\n");

	let removed = false;

	// Try SwiftBar
	try {
		await $`rm -f ${SWIFTBAR_PLUGINS_DIR}/${PLUGIN_NAME}`;
		console.log(`Removed from SwiftBar plugins`);
		removed = true;
	} catch {
		// Ignore errors
	}

	// Try xbar
	try {
		await $`rm -f ${XBAR_PLUGINS_DIR}/${PLUGIN_NAME}`;
		console.log(`Removed from xbar plugins`);
		removed = true;
	} catch {
		// Ignore errors
	}

	if (removed) {
		console.log("\nPlugin uninstalled successfully");
	} else {
		console.log("Plugin was not found in any location");
	}
}

main();
