import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export interface CommandDefinition {
  name: string;
  description?: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
}

export interface AgentDefinition {
  name: string;
  description?: string;
  source: 'user' | 'project' | 'plugin';
  pluginName?: string;
}

interface PluginConfig {
  enabledPlugins?: Record<string, boolean>;
}

/**
 * Parse YAML frontmatter from a markdown file
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const yaml = match[1];
  const result: Record<string, string> = {};

  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      result[key] = value;
    }
  }

  return result;
}

/**
 * Scan a directory for .md files and extract command/agent definitions
 */
async function scanDirectory(
  dirPath: string,
  type: 'command' | 'agent',
  source: 'user' | 'project' | 'plugin',
  pluginName?: string
): Promise<Array<CommandDefinition | AgentDefinition>> {
  const results: Array<CommandDefinition | AgentDefinition> = [];

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

      const filePath = path.join(dirPath, entry.name);
      const content = await fs.readFile(filePath, 'utf-8');
      const frontmatter = parseFrontmatter(content);

      // Base name is the filename without extension
      const baseName = entry.name.replace(/\.md$/, '');

      if (type === 'command') {
        // Plugin commands use format: <plugin-name>:<command>
        // e.g., base:create-plan
        const name = source === 'plugin' && pluginName
          ? `${pluginName.split('@')[0]}:${baseName}`
          : baseName;

        results.push({
          name,
          description: frontmatter.description,
          source,
          pluginName,
        } as CommandDefinition);
      } else {
        // For agents, prefer name from frontmatter
        const agentBaseName = frontmatter.name || baseName;

        // Plugin agents use format: <plugin-name>:<agent-name>
        // e.g., base:codebase-analyzer
        const name = source === 'plugin' && pluginName
          ? `${pluginName.split('@')[0]}:${agentBaseName}`
          : agentBaseName;

        results.push({
          name,
          description: frontmatter.description,
          source,
          pluginName,
        } as AgentDefinition);
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return results;
}

/**
 * Get enabled plugins from settings.json
 */
async function getEnabledPlugins(): Promise<string[]> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings: PluginConfig = JSON.parse(content);

    if (!settings.enabledPlugins) return [];

    return Object.entries(settings.enabledPlugins)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name);
  } catch {
    return [];
  }
}

/**
 * Scan plugin cache for commands/agents
 */
async function scanPlugins(
  type: 'command' | 'agent'
): Promise<Array<CommandDefinition | AgentDefinition>> {
  const results: Array<CommandDefinition | AgentDefinition> = [];
  const claudeDir = path.join(os.homedir(), '.claude');
  const pluginCacheDir = path.join(claudeDir, 'plugins', 'cache');

  const enabledPlugins = await getEnabledPlugins();

  try {
    // Iterate through org directories
    const orgs = await fs.readdir(pluginCacheDir, { withFileTypes: true });

    for (const org of orgs) {
      if (!org.isDirectory()) continue;

      const orgPath = path.join(pluginCacheDir, org.name);
      const plugins = await fs.readdir(orgPath, { withFileTypes: true });

      for (const plugin of plugins) {
        if (!plugin.isDirectory()) continue;

        // Check if plugin is enabled
        const pluginFullName = `${plugin.name}@${org.name}`;
        if (!enabledPlugins.includes(pluginFullName)) continue;

        const pluginPath = path.join(orgPath, plugin.name);
        const versions = await fs.readdir(pluginPath, { withFileTypes: true });

        // Get latest version (simple alphabetic sort, works for semver)
        const latestVersion = versions
          .filter((v) => v.isDirectory())
          .map((v) => v.name)
          .sort()
          .pop();

        if (!latestVersion) continue;

        const typeDir = type === 'command' ? 'commands' : 'agents';
        const scanPath = path.join(pluginPath, latestVersion, typeDir);

        const items = await scanDirectory(scanPath, type, 'plugin', pluginFullName);
        results.push(...items);
      }
    }
  } catch {
    // Plugin cache doesn't exist
  }

  return results;
}

/**
 * Load all commands from user, project, and plugin sources
 */
export async function loadCommands(projectDir?: string): Promise<CommandDefinition[]> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const results: CommandDefinition[] = [];

  // User commands
  const userCommands = await scanDirectory(
    path.join(claudeDir, 'commands'),
    'command',
    'user'
  );
  results.push(...(userCommands as CommandDefinition[]));

  // Project commands
  if (projectDir) {
    const projectCommands = await scanDirectory(
      path.join(projectDir, '.claude', 'commands'),
      'command',
      'project'
    );
    results.push(...(projectCommands as CommandDefinition[]));
  }

  // Plugin commands
  const pluginCommands = await scanPlugins('command');
  results.push(...(pluginCommands as CommandDefinition[]));

  return results;
}

/**
 * Load all agents from user, project, and plugin sources
 */
export async function loadAgents(projectDir?: string): Promise<AgentDefinition[]> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const results: AgentDefinition[] = [];

  // User agents
  const userAgents = await scanDirectory(
    path.join(claudeDir, 'agents'),
    'agent',
    'user'
  );
  results.push(...(userAgents as AgentDefinition[]));

  // Project agents
  if (projectDir) {
    const projectAgents = await scanDirectory(
      path.join(projectDir, '.claude', 'agents'),
      'agent',
      'project'
    );
    results.push(...(projectAgents as AgentDefinition[]));
  }

  // Plugin agents
  const pluginAgents = await scanPlugins('agent');
  results.push(...(pluginAgents as AgentDefinition[]));

  return results;
}
