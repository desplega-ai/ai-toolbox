import { spawnSync } from "node:child_process";
import { getEditor } from "../config/index.ts";

/**
 * Open a file in the user's editor
 * Blocks until the editor is closed
 */
export async function openInEditor(filePath: string): Promise<void> {
  const editor = await getEditor();

  // Use spawnSync to block until editor closes
  // This is needed for terminal editors like vim
  const result = spawnSync(editor, [filePath], {
    stdio: "inherit",
    shell: true,
  });

  if (result.error) {
    throw new Error(`Failed to open editor: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Editor exited with code ${result.status}`);
  }
}
