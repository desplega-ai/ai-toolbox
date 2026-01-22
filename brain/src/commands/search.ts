import chalk from "chalk";
import { Command } from "commander";
import { getBrainPath } from "../config/index.ts";
import { searchSemantic } from "../db/chunks.ts";
import { isDbInitialized } from "../db/client.ts";
import { searchFts } from "../db/entries.ts";
import { getEmbeddingProvider, isEmbeddingAvailable } from "../embeddings/openai.ts";
import { fzfSelect, isFzfAvailable } from "../utils/fzf.ts";

export const searchCommand = new Command("search")
  .alias("s")
  .description("Search brain entries")
  .argument("<query>", "Search query")
  .option("-e, --exact", "Use full-text search (FTS5) instead of semantic search")
  .option("-f, --fuzzy", "Interactive selection of results with fzf")
  .option("-n, --number <count>", "Number of results", "10")
  .action(async (query: string, options: { exact?: boolean; fuzzy?: boolean; number?: string }) => {
    const brainPath = await getBrainPath();
    if (!brainPath) {
      console.error(chalk.red("Error: Brain not initialized. Run 'brain init' first."));
      process.exit(1);
    }

    const dbReady = await isDbInitialized();
    if (!dbReady) {
      console.error(chalk.red("Error: Database not initialized. Run 'brain sync' first."));
      process.exit(1);
    }

    const limit = parseInt(options.number ?? "10", 10);

    if (options.exact) {
      // Full-text search
      const results = await searchFts(query, limit);

      if (results.length === 0) {
        console.log(chalk.yellow("No results found"));
        return;
      }

      console.log(chalk.dim(`Found ${results.length} results:\n`));

      for (const entry of results) {
        console.log(chalk.bold.cyan(entry.path));
        if (entry.title) {
          console.log(`  ${chalk.dim("Title:")} ${entry.title}`);
        }
        // Show snippet of content
        const snippet = entry.content?.slice(0, 150).replace(/\n/g, " ");
        if (snippet) {
          console.log(`  ${chalk.dim(snippet)}...`);
        }
        console.log();
      }
    } else {
      // Semantic search
      if (!isEmbeddingAvailable()) {
        console.error(chalk.red("Error: OPENAI_API_KEY required for semantic search"));
        console.error(chalk.dim("Use --exact for full-text search without API key"));
        process.exit(1);
      }

      // Generate query embedding
      const provider = getEmbeddingProvider();
      const queryEmbedding = await provider.embed(query);

      // Search
      const results = await searchSemantic(queryEmbedding, limit);

      if (results.length === 0) {
        console.log(chalk.yellow("No results found"));
        console.log(chalk.dim("Make sure you've run 'brain sync' to index your files"));
        return;
      }

      if (options.fuzzy) {
        // Interactive fzf selection
        const hasFzf = await isFzfAvailable();
        if (!hasFzf) {
          console.error(chalk.red("Error: fzf is required for --fuzzy option"));
          console.error(chalk.dim("Install fzf: brew install fzf"));
          process.exit(1);
        }

        // Deduplicate by entry path
        const seen = new Set<string>();
        const uniqueResults = results.filter((r) => {
          if (seen.has(r.entry.path)) return false;
          seen.add(r.entry.path);
          return true;
        });

        // Format for fzf
        const items = uniqueResults.map((r) => {
          const score = (r.score * 100).toFixed(1);
          const snippet = r.chunk.content.slice(0, 60).replace(/\n/g, " ");
          return `${r.entry.path}\t[${score}%]\t${snippet}`;
        });

        const selection = await fzfSelect(items, {
          prompt: "Select result > ",
          header: "PATH\tSCORE\tSNIPPET",
          height: "50%",
        });

        if (selection && selection.length > 0) {
          const selectedPath = selection[0]?.split("\t")[0];
          console.log(selectedPath);
        }
      } else {
        // Print results
        console.log(chalk.dim(`Found ${results.length} results:\n`));

        // Deduplicate by entry path for display
        const seen = new Set<string>();
        for (const result of results) {
          if (seen.has(result.entry.path)) continue;
          seen.add(result.entry.path);

          const score = (result.score * 100).toFixed(1);
          console.log(`${chalk.bold.cyan(result.entry.path)} ${chalk.dim(`[${score}%]`)}`);

          // Show chunk content as snippet
          const snippet = result.chunk.content.slice(0, 200).replace(/\n/g, " ");
          console.log(`  ${chalk.dim(snippet)}...`);
          console.log();
        }
      }
    }
  });
