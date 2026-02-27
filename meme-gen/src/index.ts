#!/usr/bin/env bun
/**
 * meme-gen — CLI tool for generating memes using the Imgflip API
 *
 * Usage:
 *   meme-gen generate --template "drake" --top "Writing tests" --bottom "Shipping to prod"
 *   meme-gen list
 *   meme-gen search "brain"
 *
 * Requires IMGFLIP_USERNAME and IMGFLIP_PASSWORD env vars.
 * Create a free account at https://imgflip.com/signup
 */

import { Command } from "commander";
import {
  generateMeme,
  downloadMeme,
  getTemplates,
  searchTemplates,
  findTemplate,
  TEMPLATE_ALIASES,
} from "./imgflip.js";
import { clearCache } from "./cache.js";

function getCredentials(): { username: string; password: string } {
  const username = process.env.IMGFLIP_USERNAME;
  const password = process.env.IMGFLIP_PASSWORD;

  if (!username || !password) {
    console.error(
      "Error: IMGFLIP_USERNAME and IMGFLIP_PASSWORD environment variables are required."
    );
    console.error("Create a free account at https://imgflip.com/signup");
    process.exit(1);
  }

  return { username, password };
}

const program = new Command();

program
  .name("meme-gen")
  .description("Generate memes using the Imgflip API")
  .version("0.1.0");

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

program
  .command("generate")
  .alias("gen")
  .description("Generate a meme from a template")
  .requiredOption("-t, --template <name>", "Template name, alias, or numeric ID")
  .option("--text <text>", "Text for a box (repeat for each box)", collect, [])
  .option("--top <text>", "Top text (shortcut for 2-box memes)")
  .option("--bottom <text>", "Bottom text (shortcut for 2-box memes)")
  .option("-o, --output <path>", "Save meme image to file")
  .option("--font <font>", "Font to use (impact or arial)", "impact")
  .action(async (opts) => {
    const creds = getCredentials();

    // Build texts array: prefer --text, fall back to --top/--bottom
    let texts: string[] = opts.text;
    if (texts.length === 0) {
      if (opts.top) texts.push(opts.top);
      if (opts.bottom !== undefined) texts.push(opts.bottom);
      if (texts.length === 0) {
        console.error("Error: Provide text with --text (repeat for each box) or --top/--bottom");
        process.exit(1);
      }
    }

    try {
      // Look up template to validate box_count
      const template = await findTemplate(opts.template);
      if (template.box_count > 0 && texts.length !== template.box_count) {
        console.error(
          `Warning: "${template.name}" expects ${template.box_count} text inputs, got ${texts.length}`
        );
      }

      const result = await generateMeme({
        username: creds.username,
        password: creds.password,
        templateName: opts.template,
        texts,
        font: opts.font,
      });

      console.log(result.url);

      if (opts.output) {
        await downloadMeme(result.url, opts.output);
        console.error(`Saved to ${opts.output}`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List available meme templates from the imgflip catalog")
  .option("-n, --limit <number>", "Number of templates to show", "25")
  .option("--aliases", "Show built-in template aliases (shortcuts)")
  .option("--refresh", "Force refresh the template cache")
  .action(async (opts) => {
    if (opts.aliases) {
      console.log("Built-in template aliases:\n");
      const seen = new Set<string>();
      for (const [alias, id] of Object.entries(TEMPLATE_ALIASES)) {
        if (!seen.has(id)) {
          console.log(`  ${alias.padEnd(28)} (ID: ${id})`);
          seen.add(id);
        }
      }
      return;
    }

    try {
      const templates = await getTemplates(opts.refresh);
      const limit = parseInt(opts.limit, 10);

      console.log(`Top ${Math.min(limit, templates.length)} meme templates:\n`);
      for (const t of templates.slice(0, limit)) {
        console.log(`  ${t.name.padEnd(35)} ID: ${t.id.padEnd(12)} boxes: ${t.box_count}`);
      }
      console.log(`\n(${templates.length} total — use --limit to show more)`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("search <query>")
  .description("Search for meme templates by name in the live catalog")
  .option("--refresh", "Force refresh the template cache")
  .action(async (query, opts) => {
    if (opts.refresh) {
      await clearCache();
    }

    try {
      const matches = await searchTemplates(query);

      if (matches.length === 0) {
        console.log(`No templates found matching "${query}"`);
        return;
      }

      console.log(`Found ${matches.length} templates matching "${query}":\n`);
      for (const t of matches.slice(0, 20)) {
        console.log(`  ${t.name.padEnd(35)} ID: ${t.id.padEnd(12)} boxes: ${t.box_count}`);
      }

      if (matches.length > 20) {
        console.log(`\n  ... and ${matches.length - 20} more`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("cache")
  .description("Manage the template cache")
  .option("--clear", "Clear the cached templates")
  .option("--refresh", "Refresh the cache from the API")
  .action(async (opts) => {
    if (opts.clear) {
      await clearCache();
      console.log("Template cache cleared.");
      return;
    }

    if (opts.refresh) {
      await clearCache();
      const templates = await getTemplates(true);
      console.log(`Cache refreshed: ${templates.length} templates loaded.`);
      return;
    }

    // Default: show cache status
    const { readCache } = await import("./cache.js");
    const cached = await readCache();
    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      const hours = Math.floor(age / (1000 * 60 * 60));
      const mins = Math.floor((age % (1000 * 60 * 60)) / (1000 * 60));
      console.log(`Cache: ${cached.templates.length} templates, age: ${hours}h ${mins}m`);
    } else {
      console.log("No cache found (will fetch on next command).");
    }
  });

program.parse();
