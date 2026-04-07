import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

// Build the web app
const webResult = await Bun.build({
  entrypoints: ["./web/index.html"],
  outdir: "./dist",
  minify: true,
  publicPath: "/",
});

if (!webResult.success) {
  console.error("Web build failed:", webResult.logs);
  process.exit(1);
}

console.log(`Web build: ${webResult.outputs.length} files`);

// Copy public/data/ to dist/data/ if it exists
const publicDataDir = join(import.meta.dir, "public/data");
const distDataDir = join(import.meta.dir, "dist/data");
const manifestFile = Bun.file(join(publicDataDir, "manifest.json"));

if (await manifestFile.exists()) {
  await mkdir(distDataDir, { recursive: true });
  await cp(publicDataDir, distDataDir, { recursive: true });
  console.log("Copied public/data/ → dist/data/");
} else {
  console.log("No public/data/manifest.json found — skipping data copy.");
}

console.log("Build complete!");
