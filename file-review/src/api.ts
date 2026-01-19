/**
 * API Abstraction Layer for file-review
 *
 * This module provides a unified interface for backend calls that works in both
 * Tauri native mode (using invoke) and web server mode (using HTTP fetch).
 *
 * Detection: In Tauri mode, window.__TAURI_INTERNALS__ exists.
 * In web mode, we call /api/is-web-mode to confirm.
 */

import type { ReviewComment } from "./comments";
import type { AppConfig } from "./config";

// Response types for web API
interface InsertCommentResponse {
  content: string;
  id: string;
}

export interface QuitResponse {
  success: boolean;
  output: string;
  comments_count: number;
}

// Cache the mode detection result
let isWebModeCache: boolean | null = null;

/**
 * Check if running in Tauri mode
 */
export function isTauri(): boolean {
  return typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
}

/**
 * Check if running in web server mode
 * This is more reliable than just checking for Tauri absence
 */
export async function isWebMode(): Promise<boolean> {
  if (isWebModeCache !== null) {
    return isWebModeCache;
  }

  if (isTauri()) {
    isWebModeCache = false;
    return false;
  }

  // Try to call the web mode endpoint
  try {
    const response = await fetch("/api/is-web-mode");
    if (response.ok) {
      const result = await response.json();
      isWebModeCache = result === true;
      return isWebModeCache;
    }
  } catch {
    // If fetch fails, we're probably not in web mode
  }

  isWebModeCache = false;
  return false;
}

/**
 * Convert Tauri command name to HTTP endpoint
 * e.g., "get_version" -> "/api/version"
 */
function commandToEndpoint(cmd: string): string {
  // Map command names to endpoints
  const mapping: Record<string, string> = {
    get_version: "/api/version",
    get_current_file: "/api/current-file",
    read_file: "/api/read-file",
    write_file: "/api/write-file",
    set_current_file: "/api/set-current-file",
    is_stdin_mode: "/api/is-stdin-mode",
    load_config: "/api/config",
    save_config: "/api/config",
    parse_comments: "/api/parse-comments",
    insert_wrapped_comment: "/api/insert-wrapped-comment",
    insert_nextline_comment: "/api/insert-nextline-comment",
    remove_comment: "/api/remove-comment",
  };

  return mapping[cmd] || `/api/${cmd.replace(/_/g, "-")}`;
}

/**
 * Make an HTTP API call
 */
async function httpInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const endpoint = commandToEndpoint(cmd);

  // GET requests for read-only operations
  const getCommands = [
    "get_version",
    "get_current_file",
    "is_stdin_mode",
    "load_config",
  ];
  const isGet = getCommands.includes(cmd);

  if (isGet) {
    const response = await fetch(endpoint);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }
    return response.json();
  }

  // POST requests for write operations
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args || {}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

/**
 * Tauri invoke wrapper with proper typing
 */
async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/**
 * Unified API that routes to Tauri or HTTP based on environment
 */
export const API = {
  /**
   * Generic invoke function that works in both modes
   */
  async invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (isTauri()) {
      return tauriInvoke<T>(cmd, args);
    }
    return httpInvoke<T>(cmd, args);
  },

  // Specific API methods for better typing

  async getVersion(): Promise<string> {
    return this.invoke<string>("get_version");
  },

  async getCurrentFile(): Promise<string | null> {
    return this.invoke<string | null>("get_current_file");
  },

  async readFile(path: string): Promise<string> {
    return this.invoke<string>("read_file", { path });
  },

  async writeFile(path: string, content: string): Promise<void> {
    return this.invoke<void>("write_file", { path, content });
  },

  async setCurrentFile(path: string): Promise<void> {
    return this.invoke<void>("set_current_file", { path });
  },

  async isStdinMode(): Promise<boolean> {
    return this.invoke<boolean>("is_stdin_mode");
  },

  async loadConfig(): Promise<AppConfig> {
    return this.invoke<AppConfig>("load_config");
  },

  async saveConfig(config: AppConfig): Promise<void> {
    return this.invoke<void>("save_config", { config });
  },

  async parseComments(content: string): Promise<ReviewComment[]> {
    return this.invoke<ReviewComment[]>("parse_comments", { content });
  },

  async insertWrappedComment(
    content: string,
    startPos: number,
    endPos: number,
    text: string
  ): Promise<[string, string]> {
    if (isTauri()) {
      return tauriInvoke<[string, string]>("insert_wrapped_comment", {
        content,
        start_pos: startPos,
        end_pos: endPos,
        text,
      });
    }
    const result = await httpInvoke<InsertCommentResponse>(
      "insert_wrapped_comment",
      { content, start_pos: startPos, end_pos: endPos, text }
    );
    return [result.content, result.id];
  },

  async insertLineComment(
    content: string,
    lineStartPos: number,
    lineEndPos: number,
    text: string
  ): Promise<[string, string]> {
    if (isTauri()) {
      return tauriInvoke<[string, string]>("insert_nextline_comment", {
        content,
        line_start_pos: lineStartPos,
        line_end_pos: lineEndPos,
        text,
      });
    }
    const result = await httpInvoke<InsertCommentResponse>(
      "insert_nextline_comment",
      { content, line_start_pos: lineStartPos, line_end_pos: lineEndPos, text }
    );
    return [result.content, result.id];
  },

  async removeComment(content: string, commentId: string): Promise<string> {
    return this.invoke<string>("remove_comment", {
      content,
      comment_id: commentId,
    });
  },

  async revealInFinder(path: string): Promise<void> {
    if (!isTauri()) {
      // Not supported in web mode
      console.warn("revealInFinder not available in web mode");
      return;
    }
    return tauriInvoke<void>("reveal_in_finder", { path });
  },

  async getConfigPath(): Promise<string> {
    return this.invoke<string>("get_config_path_string");
  },

  async openConfigInEditor(): Promise<void> {
    if (!isTauri()) {
      console.warn("openConfigInEditor not available in web mode");
      return;
    }
    return tauriInvoke<void>("open_config_in_editor");
  },

  /**
   * Web mode only: Trigger quit and get final report
   */
  async quit(): Promise<QuitResponse> {
    if (isTauri()) {
      throw new Error("quit() is only available in web mode");
    }
    const response = await fetch("/api/quit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json();
  },
};

export default API;
