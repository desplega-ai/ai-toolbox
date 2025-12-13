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

// Copy public folder assets to dist
const publicDir = "./public";
const distDir = "./dist";

try {
  const files = await readdir(publicDir);
  for (const file of files) {
    await copyFile(join(publicDir, file), join(distDir, file));
    console.log(`Copied ${file} to dist/`);
  }
} catch (err) {
  console.error("Error copying public assets:", err);
}

console.log("Build complete!");
