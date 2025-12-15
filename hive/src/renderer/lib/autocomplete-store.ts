import { create } from 'zustand';
import Fuse from 'fuse.js';

// Types
export interface CommandItem {
  name: string;
  description?: string;
  argumentHint?: string;
}

export interface AgentItem {
  name: string;
  description: string;
}

export interface FileItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
}

export type AutocompleteItem =
  | { type: 'command'; item: CommandItem }
  | { type: 'agent'; item: AgentItem }
  | { type: 'file'; item: FileItem };

// Loaded config types
interface LoadedCommand {
  name: string;
  description?: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
}

interface LoadedAgent {
  name: string;
  description?: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
}

// Store interface
interface AutocompleteState {
  // Raw data
  commands: CommandItem[];
  agents: AgentItem[];
  fileIndex: FileItem[];

  // Fuse instances for fuzzy search
  fileFuse: Fuse<FileItem> | null;

  // Actions
  setCommands: (commands: string[]) => void;
  setAgents: (agents: AgentItem[]) => void;
  setLoadedCommands: (commands: LoadedCommand[]) => void;
  setLoadedAgents: (agents: LoadedAgent[]) => void;
  setFileIndex: (files: FileItem[]) => void;
  clearFileIndex: () => void;

  // Search functions
  searchCommands: (query: string, limit?: number) => CommandItem[];
  searchAgents: (query: string, limit?: number) => AgentItem[];
  searchFiles: (query: string, limit?: number) => FileItem[];
}

// Default commands (common Claude Code commands)
const DEFAULT_COMMANDS: CommandItem[] = [
  { name: 'compact', description: 'Compact conversation history' },
  { name: 'clear', description: 'Clear conversation' },
  { name: 'help', description: 'Show help' },
  { name: 'bug', description: 'Report a bug' },
  { name: 'init', description: 'Initialize project' },
  { name: 'memory', description: 'Manage memory' },
  { name: 'model', description: 'Switch model' },
  { name: 'permissions', description: 'Manage permissions' },
  { name: 'cost', description: 'Show cost' },
  { name: 'doctor', description: 'Run diagnostics' },
  { name: 'review', description: 'Review code' },
  { name: 'pr-comments', description: 'Generate PR comments' },
  { name: 'mcp', description: 'MCP server management' },
  { name: 'vim', description: 'Toggle vim mode' },
  { name: 'terminal-setup', description: 'Setup terminal' },
  { name: 'config', description: 'Open config' },
  { name: 'logout', description: 'Logout' },
  { name: 'login', description: 'Login' },
];

// Default agents (Hive-specific)
const DEFAULT_AGENTS: AgentItem[] = [
  { name: 'qa-expert', description: 'Expert QA engineer for testing' },
  { name: 'codebase-analyzer', description: 'Analyzes codebase implementation' },
  { name: 'codebase-locator', description: 'Locates files and components' },
  { name: 'codebase-pattern-finder', description: 'Finds similar implementations' },
  { name: 'web-search-researcher', description: 'Researches questions via web' },
];

export const useAutocompleteStore = create<AutocompleteState>((set, get) => ({
  commands: DEFAULT_COMMANDS,
  agents: DEFAULT_AGENTS,
  fileIndex: [],
  fileFuse: null,

  setCommands: (commandNames) => {
    // Merge with defaults to preserve descriptions
    const defaultsMap = new Map(DEFAULT_COMMANDS.map(c => [c.name, c]));
    const commands: CommandItem[] = commandNames.map((name) => {
      const cleanName = name.startsWith('/') ? name.slice(1) : name;
      const existing = defaultsMap.get(cleanName);
      return existing || { name: cleanName };
    });
    set({ commands });
  },

  setAgents: (agents) => {
    set({ agents: [...DEFAULT_AGENTS, ...agents] });
  },

  setLoadedCommands: (loadedCommands) => {
    // Convert loaded commands to CommandItem format
    // Merge with defaults, loaded commands take precedence
    const loadedMap = new Map(
      loadedCommands.map((c) => [c.name, { name: c.name, description: c.description }])
    );

    // Start with loaded commands
    const commands: CommandItem[] = loadedCommands.map((c) => ({
      name: c.name,
      description: c.description,
    }));

    // Add defaults that aren't in loaded
    for (const def of DEFAULT_COMMANDS) {
      if (!loadedMap.has(def.name)) {
        commands.push(def);
      }
    }

    set({ commands });
  },

  setLoadedAgents: (loadedAgents) => {
    // Convert loaded agents to AgentItem format
    // Merge with defaults, loaded agents take precedence
    const loadedMap = new Map(
      loadedAgents.map((a) => [a.name, { name: a.name, description: a.description || '' }])
    );

    // Start with loaded agents
    const agents: AgentItem[] = loadedAgents.map((a) => ({
      name: a.name,
      description: a.description || '',
    }));

    // Add defaults that aren't in loaded
    for (const def of DEFAULT_AGENTS) {
      if (!loadedMap.has(def.name)) {
        agents.push(def);
      }
    }

    set({ agents });
  },

  setFileIndex: (files) => {
    const fuse = new Fuse(files, {
      keys: [
        { name: 'name', weight: 0.7 },
        { name: 'path', weight: 0.3 },
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });
    set({ fileIndex: files, fileFuse: fuse });
  },

  clearFileIndex: () => {
    set({ fileIndex: [], fileFuse: null });
  },

  searchCommands: (query, limit = 10) => {
    const { commands } = get();
    if (!query) return commands.slice(0, limit);

    const lowerQuery = query.toLowerCase();
    return commands
      .filter((cmd) => cmd.name.toLowerCase().includes(lowerQuery))
      .slice(0, limit);
  },

  searchAgents: (query, limit = 5) => {
    const { agents } = get();
    if (!query) return agents.slice(0, limit);

    const lowerQuery = query.toLowerCase();
    return agents
      .filter(
        (agent) =>
          agent.name.toLowerCase().includes(lowerQuery) ||
          agent.description.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  },

  searchFiles: (query, limit = 10) => {
    const { fileIndex, fileFuse } = get();
    if (!fileFuse) return [];
    if (!query) return fileIndex.slice(0, limit);

    return fileFuse.search(query, { limit }).map((result) => result.item);
  },
}));

// Hook to build file index for a project
export function useBuildFileIndex() {
  const setFileIndex = useAutocompleteStore((s) => s.setFileIndex);

  return async (projectPath: string) => {
    const files = await window.electronAPI.invoke<FileItem[]>(
      'fs:build-file-index',
      { projectPath }
    );
    setFileIndex(files);
    return files;
  };
}

// Hook to load commands from ~/.claude and project
export function useLoadCommands() {
  const setLoadedCommands = useAutocompleteStore((s) => s.setLoadedCommands);

  return async (projectPath: string) => {
    const commands = await window.electronAPI.invoke<LoadedCommand[]>(
      'claude:load-commands',
      { projectPath }
    );
    setLoadedCommands(commands);
    return commands;
  };
}

// Hook to load agents from ~/.claude and project
export function useLoadAgents() {
  const setLoadedAgents = useAutocompleteStore((s) => s.setLoadedAgents);

  return async (projectPath: string) => {
    const agents = await window.electronAPI.invoke<LoadedAgent[]>(
      'claude:load-agents',
      { projectPath }
    );
    setLoadedAgents(agents);
    return agents;
  };
}
