import tailwindcss from "bun-plugin-tailwind";

await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "./dist",
  minify: true,
  plugins: [tailwindcss],
});

console.log("Build complete!");
