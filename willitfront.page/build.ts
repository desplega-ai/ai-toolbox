import tailwindcss from "bun-plugin-tailwind";
import { readdir, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

// Build the main app
await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  publicPath: "/",
  plugins: [tailwindcss],
});

// Copy public folder assets to dist (both root and /public/ for compatibility)
const publicDir = "./public";
const distDir = "./dist";
const distPublicDir = "./dist/public";

try {
  // Ensure dist/public exists
  await mkdir(distPublicDir, { recursive: true });

  const files = await readdir(publicDir);
  for (const file of files) {
    // Copy to root for hashed references
    await copyFile(join(publicDir, file), join(distDir, file));
    // Copy to /public/ for direct access
    await copyFile(join(publicDir, file), join(distPublicDir, file));
  }
  console.log(`Copied ${files.length} public assets to dist/ and dist/public/`);
} catch (err) {
  console.error("Error copying public assets:", err);
}

console.log("Build complete!");
