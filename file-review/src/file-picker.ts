import { isTauri } from "./api";

export async function showFilePicker(): Promise<string | null> {
  // File picker is not available in web mode
  if (!isTauri()) {
    return null;
  }

  // Dynamically import Tauri dialog plugin only when in Tauri mode
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    filters: [
      { name: "Markdown", extensions: ["md", "markdown"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (typeof selected === "string") {
    return selected;
  }
  return null;
}
