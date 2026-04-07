#!/usr/bin/env bun
import { Command } from "commander";
import pkg from "../package.json";
import { exportCommand } from "./commands/export.ts";
import { indexCommand } from "./commands/index-cmd.ts";
import { infoCommand } from "./commands/info.ts";
import { listCommand } from "./commands/list.ts";
import { searchCommand } from "./commands/search.ts";
import { serveCommand } from "./commands/serve.ts";
import { syncCommand } from "./commands/sync.ts";

const program = new Command();

program
  .name("thoughts-viz")
  .description(
    `${pkg.description} (v${pkg.version})

Parses markdown files in a thoughts directory, extracts cross-references
between them, and visualizes the connections as an interactive force graph.

Reference patterns detected:
  1. Frontmatter "related"     — related: ["other-file.md"]
  2. Frontmatter "supersedes"  — supersedes: ["old-file.md"]
  3. Frontmatter "research"    — research: thoughts/.../file.md
  4. Inline citations          — research: \`file.md:46-118\`
  5. Markdown links            — [text](./file.md)`,
  )
  .version(pkg.version, "-v, --version");

program.addCommand(serveCommand);
program.addCommand(indexCommand);
program.addCommand(exportCommand);
program.addCommand(infoCommand);
program.addCommand(searchCommand);
program.addCommand(listCommand);
program.addCommand(syncCommand);

program.parse();
