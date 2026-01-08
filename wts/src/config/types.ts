/**
 * Global configuration stored at ~/.wts.json
 */
export interface GlobalConfig {
  /** Map of project name to project configuration */
  projects: Record<string, ProjectEntry>;
  /** Default settings applied to all projects */
  defaults: DefaultSettings;
}

/**
 * Entry for a tracked project in global config
 */
export interface ProjectEntry {
  /** Absolute path to the git repository root */
  path: string;
  /** When this project was registered */
  registeredAt: string;
}

/**
 * Default settings that can be overridden per-project
 */
export interface DefaultSettings {
  /** Base directory for worktrees (relative to git root) */
  worktreeDir: string;
  /** tmux window name template */
  tmuxWindowTemplate: string;
  /** Whether to auto-open tmux window on create */
  autoTmux: boolean;
  /** Whether to launch Claude Code on create */
  autoClaude: boolean;
}

/**
 * Local configuration stored at .wts-config.json in project root
 */
export interface LocalConfig {
  /** Override worktree directory */
  worktreeDir?: string;
  /** Override tmux window template */
  tmuxWindowTemplate?: string;
  /** Override auto-tmux setting */
  autoTmux?: boolean;
  /** Override auto-claude setting */
  autoClaude?: boolean;
  /** Setup script to run after worktree creation */
  setupScript?: string;
}

/**
 * Merged configuration for runtime use
 */
export interface ResolvedConfig {
  /** Project name (from git root folder name) */
  projectName: string;
  /** Git repository root path */
  gitRoot: string;
  /** Base directory for worktrees */
  worktreeDir: string;
  /** tmux window name template */
  tmuxWindowTemplate: string;
  /** Whether to auto-open tmux window */
  autoTmux: boolean;
  /** Whether to launch Claude Code */
  autoClaude: boolean;
  /** Setup script path (if configured) */
  setupScript?: string;
}

/**
 * Worktree information parsed from git worktree list
 */
export interface Worktree {
  /** Absolute path to worktree directory */
  path: string;
  /** HEAD commit SHA */
  head: string;
  /** Branch name (or detached HEAD) */
  branch: string;
  /** Whether this is the main worktree */
  isMain: boolean;
  /** Parsed alias from path (date prefix stripped) */
  alias?: string;
  /** Project name this worktree belongs to */
  projectName?: string;
}

/**
 * Default global configuration values
 */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  projects: {},
  defaults: {
    worktreeDir: ".worktrees",
    tmuxWindowTemplate: "{project}-{alias}",
    autoTmux: false,
    autoClaude: false,
  },
};
