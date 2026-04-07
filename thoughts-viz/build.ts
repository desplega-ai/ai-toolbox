// Build the web app
const webResult = await Bun.build({
  entrypoints: ["./web/index.html"],
  outdir: "./dist/web",
  minify: true,
  publicPath: "/",
});

if (!webResult.success) {
  console.error("Web build failed:", webResult.logs);
  process.exit(1);
}

console.log(`Web build: ${webResult.outputs.length} files`);

// Build the CLI
const cliResult = await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  target: "node",
  format: "esm",
});

if (!cliResult.success) {
  console.error("CLI build failed:", cliResult.logs);
  process.exit(1);
}

console.log("Build complete!");
