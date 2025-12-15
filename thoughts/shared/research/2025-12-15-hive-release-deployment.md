---
date: 2025-12-15T12:00:00-08:00
researcher: Claude
git_commit: 6b4b2155cf0919ab041090eda7146fe45ead7472
branch: main
repository: desplega-ai/ai-toolbox
topic: "Hive Release and Deployment with GitHub"
tags: [research, hive, electron-forge, github-releases, code-signing, deployment]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
---

# Research: Hive Release and Deployment

**Date**: 2025-12-15T12:00:00-08:00
**Researcher**: Claude
**Git Commit**: 6b4b2155cf0919ab041090eda7146fe45ead7472
**Branch**: main
**Repository**: desplega-ai/ai-toolbox

## Research Question

How to release and deploy the Hive Electron app using GitHub releases.

## Summary

Hive uses Electron Forge with Vite plugin, configured for macOS with DMG and ZIP makers. To enable GitHub releases:

1. Install `@electron-forge/publisher-github`
2. Add publisher configuration to `forge.config.ts`
3. Create GitHub Actions workflow for automated releases
4. (Optional) Configure macOS code signing and notarization for public distribution

## Current Configuration

### Package.json Scripts

```json
{
  "scripts": {
    "start": "electron-forge start",
    "package": "electron-forge package",
    "make": "electron-forge make",
    "publish": "electron-forge publish"
  }
}
```

The `publish` script already exists and will work once the publisher is configured.

### Existing Forge Config

- **App Bundle ID**: `ai.desplega.hive`
- **Category**: Developer Tools
- **Makers**: ZIP (darwin), DMG
- **ASAR**: Enabled
- **Security Fuses**: Configured (RunAsNode disabled, cookie encryption, etc.)

## Implementation Steps

### Step 1: Install Publisher Package

```bash
cd hive
pnpm add -D @electron-forge/publisher-github
```

### Step 2: Update forge.config.ts

Add the publishers array to your existing config:

```typescript
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: './resources/icon',
    appBundleId: 'ai.desplega.hive',
    appCategoryType: 'public.app-category.developer-tools',
    extraResource: ['./resources/icon.png'],
    // Add for code signing (see Step 4)
    osxSign: {},
    ...(process.env.APPLE_ID && {
      osxNotarize: {
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_PASSWORD!,
        teamId: process.env.APPLE_TEAM_ID!,
      },
    }),
  },
  rebuildConfig: {},
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
          name: 'ai-toolbox',  // or separate 'hive' repo
        },
        draft: true,              // Review before publishing
        prerelease: false,
        generateReleaseNotes: true,
      },
    },
  ],
  plugins: [
    // ... existing plugins unchanged
  ],
};

export default config;
```

### Step 3: Create GitHub Actions Workflow

Create `.github/workflows/hive-release.yml`:

```yaml
name: Hive Release

on:
  push:
    tags:
      - 'hive-v*'  # Use prefix to distinguish from other projects in monorepo

permissions:
  contents: write

jobs:
  publish:
    runs-on: macos-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 9

      - name: Install dependencies
        working-directory: ./hive
        run: pnpm install

      # Optional: Import macOS certificates for code signing
      # - name: Import macOS certificates
      #   env:
      #     MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
      #     MACOS_CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
      #   run: |
      #     echo $MACOS_CERTIFICATE | base64 --decode > certificate.p12
      #     security create-keychain -p "" build.keychain
      #     security default-keychain -s build.keychain
      #     security unlock-keychain -p "" build.keychain
      #     security import certificate.p12 -k build.keychain -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
      #     security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" build.keychain
      #     rm certificate.p12

      - name: Publish
        working-directory: ./hive
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Optional: For notarization
          # APPLE_ID: ${{ secrets.APPLE_ID }}
          # APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          # APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: pnpm run publish
```

### Step 4: macOS Code Signing (Optional but Recommended)

For public distribution without "unidentified developer" warnings:

**Requirements:**
- Apple Developer Program membership ($99/year)
- Developer ID Application certificate
- App-specific password for notarization

**GitHub Secrets to Configure:**

| Secret | Description |
|--------|-------------|
| `MACOS_CERTIFICATE` | Base64-encoded `.p12` certificate |
| `MACOS_CERTIFICATE_PASSWORD` | Password for the `.p12` file |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password (NOT Apple ID password) |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

**To encode certificate:**
```bash
base64 -i Certificates.p12 | pbcopy
```

## Release Workflow

### Manual Release (Local)

```bash
cd hive

# 1. Bump version
npm version patch  # or minor, major

# 2. Set GitHub token
export GITHUB_TOKEN=your_personal_access_token

# 3. Publish
pnpm run publish
```

### Automated Release (CI)

```bash
# 1. Bump version in package.json
npm version patch

# 2. Create and push tag
git tag hive-v0.1.1
git push --follow-tags

# GitHub Actions will automatically build and create the release
```

## Publisher Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `repository` | `{owner, name}` | **Required**. GitHub repository |
| `draft` | `boolean` | Create as draft for review |
| `prerelease` | `boolean` | Mark as pre-release |
| `generateReleaseNotes` | `boolean` | Auto-generate from commits |
| `tagPrefix` | `string` | Tag prefix (default: `"v"`) |

## Alternative: Simple Local Build

For personal use without code signing:

```bash
cd hive
pnpm run make
# Output in ./out/make/
```

This creates:
- `out/make/zip/darwin/arm64/Hive-darwin-arm64-0.1.0.zip`
- `out/make/Hive-0.1.0-arm64.dmg`

## Code References

- `hive/package.json:7-13` - Build scripts
- `hive/forge.config.ts:1-56` - Forge configuration
- `hive/forge.config.ts:17-22` - Makers configuration

## Architecture Documentation

**Build Pipeline:**
1. `electron-forge package` - Creates `.app` bundle
2. `electron-forge make` - Creates DMG and ZIP distributables
3. `electron-forge publish` - Uploads to GitHub releases

**Security Configuration:**
- ASAR packaging enabled for source protection
- Electron Fuses configured for security hardening
- RunAsNode disabled to prevent code execution attacks

## Sources

- [GitHub Publisher | Electron Forge](https://www.electronforge.io/config/publishers/github)
- [Signing macOS Apps | Electron Forge](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Publishing and Updating | Electron](https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating)
- [@electron-forge/publisher-github | npm](https://www.npmjs.com/package/@electron-forge/publisher-github)

## Open Questions

1. Should Hive be released as a separate repository or within the ai-toolbox monorepo?
2. Is code signing needed for initial distribution (personal use vs public)?
3. Should auto-updates be implemented using `update.electronjs.org` or self-hosted?
