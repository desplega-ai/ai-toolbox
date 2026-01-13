import { open } from "@tauri-apps/plugin-dialog";

export async function showFilePicker(): Promise<string | null> {
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
