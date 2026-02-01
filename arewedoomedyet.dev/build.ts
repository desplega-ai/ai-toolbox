import tailwindcss from "bun-plugin-tailwind";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { join } from "node:path";

await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  publicPath: "/",
  plugins: [tailwindcss],
  define: {
    CONVEX_URL: JSON.stringify(process.env.CONVEX_URL || ""),
  },
});

// Copy public folder
const publicDir = "./public";
const distDir = "./dist";
try {
  await mkdir(join(distDir, "public"), { recursive: true });
  const files = await readdir(publicDir);
  for (const file of files) {
    await copyFile(join(publicDir, file), join(distDir, file));
    await copyFile(join(publicDir, file), join(distDir, "public", file));
  }
  console.log(`Copied ${files.length} public assets`);
} catch (err) {
  // public folder may not exist yet, that's fine
}

console.log("Build complete!");
