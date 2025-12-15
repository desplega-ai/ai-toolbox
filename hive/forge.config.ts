import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { execSync } from 'node:child_process';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/better-sqlite3/**',
    },
    icon: './resources/icon',
    appBundleId: 'ai.desplega.hive',
    appCategoryType: 'public.app-category.developer-tools',
    extraResource: ['./resources/icon.png'],
    // macOS code signing
    osxSign: {},
    // macOS notarization (only when env vars are set)
    ...(process.env.APPLE_ID && {
      osxNotarize: {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD,
        teamId: process.env.APPLE_TEAM_ID,
      },
    }),
  },
  rebuildConfig: {},
  hooks: {
    /**
     * WORKAROUND: Electron Forge + Vite native modules bug
     *
     * Electron Forge 7.5.0+ with the Vite plugin has a known bug where modules
     * marked as `external` in vite.main.config.mjs are NOT included in the
     * packaged app, causing "Cannot find module" errors at runtime.
     *
     * This hook runs after Forge prunes devDependencies but before ASAR creation.
     * It reinstalls production dependencies (including transitive deps like
     * 'bindings' that native modules need) and rebuilds them for Electron.
     *
     * GitHub Issues:
     * - https://github.com/electron/forge/issues/3738
     * - https://github.com/electron/forge/issues/3917
     *
     * This workaround can be removed when Forge 8.0.0 is released with the fix.
     */
    packageAfterPrune: async (_config, buildPath) => {
      console.log('Installing production dependencies...');
      execSync('pnpm install --prod --ignore-scripts', {
        cwd: buildPath,
        stdio: 'inherit',
      });

      console.log('Rebuilding native modules for Electron...');
      execSync('pnpm exec electron-rebuild', {
        cwd: buildPath,
        stdio: 'inherit',
      });
    },
  },
  makers: [
    new MakerZIP({}, ['darwin']),
    new MakerDMG({
      format: 'ULFO',
    }),
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'desplega-ai',
          name: 'ai-toolbox',
        },
        draft: true,
        prerelease: false,
        generateReleaseNotes: true,
      },
    },
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.mjs',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mjs',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
  ],
};

export default config;
