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
  findTemplateId,
  POPULAR_TEMPLATES,
} from "./imgflip.js";

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

program
  .command("generate")
  .alias("gen")
  .description("Generate a meme from a template")
  .requiredOption("-t, --template <name>", "Template name, alias, or numeric ID")
  .requiredOption("--top <text>", "Top text (first text box)")
  .option("--bottom <text>", "Bottom text (second text box)", "")
  .option("-o, --output <path>", "Save meme image to file")
  .option("--font <font>", "Font to use (impact or arial)", "impact")
  .action(async (opts) => {
    const creds = getCredentials();

    try {
      const result = await generateMeme({
        username: creds.username,
        password: creds.password,
        templateName: opts.template,
        topText: opts.top,
        bottomText: opts.bottom,
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
  .description("List available meme templates")
  .option("-n, --limit <number>", "Number of templates to show", "25")
  .option("--aliases", "Show built-in template aliases")
  .action(async (opts) => {
    if (opts.aliases) {
      console.log("Built-in template aliases:\n");
      const seen = new Set<string>();
      for (const [alias, id] of Object.entries(POPULAR_TEMPLATES)) {
        if (!seen.has(id)) {
          console.log(`  ${alias.padEnd(28)} (ID: ${id})`);
          seen.add(id);
        }
      }
      return;
    }

    try {
      const templates = await getTemplates();
      const limit = parseInt(opts.limit, 10);

      console.log(`Top ${limit} meme templates:\n`);
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
  .description("Search for meme templates by name")
  .action(async (query) => {
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

program.parse();
