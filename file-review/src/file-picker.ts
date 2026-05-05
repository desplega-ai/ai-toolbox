import { isTauri } from "./api";

/**
 * Open the OS file picker, allowing multiple files. Returns an array of
 * absolute paths (possibly empty) — never null. In web mode, returns [].
 */
export async function showFilePicker(): Promise<string[]> {
  // File picker is not available in web mode
  if (!isTauri()) {
    return [];
  }

  // Dynamically import Tauri dialog plugin only when in Tauri mode
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: true,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (Array.isArray(selected)) {
    return selected;
  }
  // Fallback: shouldn't happen with multiple:true, but keep defensive.
  if (typeof selected === "string") {
    return [selected];
  }
  return [];
}
