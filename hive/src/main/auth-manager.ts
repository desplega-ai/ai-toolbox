import ElectronStore from 'electron-store';
import { app } from 'electron';
import path from 'path';

const HIVE_DIR = path.join(app.getPath('home'), '.hive');
const Store = (ElectronStore as unknown as { default: typeof ElectronStore }).default || ElectronStore;

type AuthMethod = 'claude-cli' | 'api-key';

interface AuthConfig {
  method: AuthMethod;
  apiKey?: string;
}

const authStore = new Store<{ auth: AuthConfig }>({
  name: 'auth',
  cwd: HIVE_DIR,
  defaults: {
    auth: { method: 'claude-cli' }
  }
});

export function getAuthEnvironment(): Record<string, string> {
  const config = authStore.get('auth');
  const env: Record<string, string> = {};

  // Copy relevant env vars
  if (process.env.PATH) env.PATH = process.env.PATH;
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.USER) env.USER = process.env.USER;
  if (process.env.SHELL) env.SHELL = process.env.SHELL;

  switch (config.method) {
    case 'claude-cli':
      // SDK inherits from CLI automatically
      break;
    case 'api-key':
      if (config.apiKey) {
        env.ANTHROPIC_API_KEY = config.apiKey;
      }
      break;
  }

  return env;
}

export function getAuthConfig(): AuthConfig {
  return authStore.get('auth');
}

export function setAuthConfig(config: AuthConfig): void {
  authStore.set('auth', config);
}

export function hasApiKey(): boolean {
  const config = authStore.get('auth');
  return config.method === 'api-key' && !!config.apiKey;
}
