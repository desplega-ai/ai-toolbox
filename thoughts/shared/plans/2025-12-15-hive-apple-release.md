# Hive Apple Release Implementation Plan

## Overview

<!-- hive-comment(FJI43HQx0uIzZMSHHAaQj): okok? -->
Configure Hive for signed and notarized macOS distribution via GitHub Releases, with both automated CI/CD and manual release capabilities. Includes optional auto-update functionality.
<!-- hive-comment(FJI43HQx0uIzZMSHHAaQj) -->

<!-- hive-comment(dbujSCFnWN_CXN5Lksml-): lel -->
## Current State Analysis
<!-- hive-comment(dbujSCFnWN_CXN5Lksml-) -->

<!-- hive-comment(dbujSCFnWN_CXN5Lksml-): lel -->
**What exists:**
<!-- hive-comment(dbujSCFnWN_CXN5Lksml-) -->
<!-- hive-comment(2QeX044IEix6YBA6VmnKx): another one -->
- Electron Forge app with DMG/ZIP makers (`hive/forge.config.ts:17-22`)
<!-- hive-comment(2QeX044IEix6YBA6VmnKx) -->
<!-- hive-comment(2QeX044IEix6YBA6VmnKx): another one -->
- App bundle ID: `ai.desplega.hive`
<!-- hive-comment(2QeX044IEix6YBA6VmnKx) -->
<!-- hive-comment(2QeX044IEix6YBA6VmnKx): another one -->
- Icons ready in all formats (`hive/resources/`)
<!-- hive-comment(2QeX044IEix6YBA6VmnKx) -->
- Security fuses configured
- `publish` script exists in package.json

**What's missing:**
- GitHub publisher package
- Code signing configuration (`osxSign`)
- Notarization configuration (`osxNotarize`)
- GitHub Actions workflow
- GitHub secrets for CI/CD

## Desired End State

After completing this plan:
1. Running `pnpm run publish` locally creates a signed, notarized DMG and uploads it to GitHub Releases
2. Pushing a `hive-v*` tag triggers automated build and release
3. Users can download and run Hive without Gatekeeper warnings
4. (Optional) App checks for updates on launch and prompts users to update

### Verification:
- Download DMG from GitHub Releases
- Double-click to mount and drag to Applications
- Launch app - should open without "unidentified developer" warning
<!-- hive-comment(lPQQRnX6XgZ_IPvKI4rfN): do i need to install something for this? -->
- Run `codesign -dv --verbose=4 /Applications/Hive.app` to verify signature
<!-- hive-comment(lPQQRnX6XgZ_IPvKI4rfN) -->
<!-- hive-comment(0f0_tI4zmitAhvBbzoKEm): and for this? -->
- Run `spctl -a -v /Applications/Hive.app` to verify notarization
<!-- hive-comment(0f0_tI4zmitAhvBbzoKEm) -->

## What We're NOT Doing

- Mac App Store distribution (future consideration)
- Windows/Linux builds (macOS only for now)
- Custom update server (using GitHub Releases + update.electronjs.org)

## Implementation Approach

The plan follows this sequence:
1. Apple Developer Portal setup (certificates, identifiers)
2. Local environment configuration
3. Forge config updates for signing/notarization
4. GitHub publisher integration
5. GitHub Actions workflow for automated releases
6. (Optional) Auto-update functionality

---

## Phase 1: Apple Developer Portal Setup

### Overview
Create the necessary certificates and identifiers in Apple Developer Portal.

### Steps:

#### 1.1 Create Developer ID Application Certificate

1. Open **Keychain Access** on your Mac
2. Go to **Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority**
3. Enter your email, leave CA Email empty, select "Saved to disk"
4. Save the `.certSigningRequest` file

5. Go to [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
6. Click **+** to create a new certificate
7. Select **Developer ID Application** (under Software section)
8. Upload your `.certSigningRequest` file
9. Download the `.cer` file
10. Double-click to install in Keychain Access

#### 1.2 Verify Certificate Installation

```bash
# List available signing identities
security find-identity -v -p codesigning

# Should show something like:
# 1) ABCDEF123456... "Developer ID Application: Your Name (TEAM_ID)"
```

Note the **Team ID** (the 10-character code in parentheses) - you'll need this later.

#### 1.3 Create App-Specific Password for Notarization

1. Go to [Apple ID Account](https://appleid.apple.com/account/manage)
2. Sign in with your Apple ID
3. Go to **Sign-In and Security → App-Specific Passwords**
4. Click **Generate an app-specific password**
5. Name it "Hive Notarization"
6. Save the generated password securely (format: `xxxx-xxxx-xxxx-xxxx`)

#### 1.4 Find Your Team ID

```bash
# If you have Xcode installed:
xcrun altool --list-providers -u "your-apple-id@email.com" -p "app-specific-password"

# Or check Apple Developer Portal → Membership → Team ID
```

### Success Criteria:

#### Automated Verification:
- [ ] Certificate appears in keychain: `security find-identity -v -p codesigning | grep "Developer ID Application"`

#### Manual Verification:
- [ ] App-specific password generated and saved securely
- [ ] Team ID noted down

**Implementation Note**: Record these values - you'll need them:
- **Apple ID**: your email
- **App-Specific Password**: the generated password
- **Team ID**: 10-character identifier

---

## Phase 2: Install Dependencies and Configure Forge

### Overview
Install the GitHub publisher and configure code signing in Electron Forge.

### Changes Required:

#### 2.1 Install Publisher Package

```bash
cd hive
pnpm add -D @electron-forge/publisher-github
```

#### 2.2 (Optional) Install Auto-Update Package

```bash
cd hive
pnpm add update-electron-app
```

#### 2.3 Update forge.config.ts

**File**: `hive/forge.config.ts`

Replace the entire file with:

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
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
```

### Success Criteria:

#### Automated Verification:
- [ ] Dependencies installed: `pnpm list @electron-forge/publisher-github`
- [ ] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`

#### Manual Verification:
- [ ] `forge.config.ts` contains `osxSign` and `osxNotarize` configuration
- [ ] `publishers` array configured with GitHub repository

---

## Phase 3: Test Local Signed Build

### Overview
Verify code signing works locally before setting up CI/CD.

### Steps:

#### 3.1 Set Environment Variables

Create a local `.env.local` file (DO NOT COMMIT):

```bash
# hive/.env.local (add to .gitignore if not already)
export APPLE_ID="your-apple-id@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

#### 3.2 Build and Sign Locally

```bash
cd hive
source .env.local

# Build without publishing (to test signing)
pnpm run make
```

#### 3.3 Verify the Build

```bash
# Check code signature
codesign -dv --verbose=4 out/Hive-darwin-arm64/Hive.app

# Verify notarization (may take a few minutes on first build)
spctl -a -v out/Hive-darwin-arm64/Hive.app

# Expected output: "out/Hive-darwin-arm64/Hive.app: accepted"
```

### Success Criteria:

#### Automated Verification:
- [ ] Build completes: `pnpm run make` exits with code 0
- [ ] DMG created: `ls out/make/*.dmg`
- [ ] App signed: `codesign -v out/Hive-darwin-arm64/Hive.app` exits with code 0

#### Manual Verification:
- [ ] `spctl -a -v` shows "accepted" (notarization successful)
- [ ] App launches without Gatekeeper warning when copied to Applications

**Implementation Note**: First notarization can take 5-15 minutes. Subsequent builds are faster due to caching.

---

## Phase 4: GitHub Actions Workflow

### Overview
Create automated CI/CD workflow for releases.

### Changes Required:

#### 4.1 Create Workflow Directory

```bash
mkdir -p .github/workflows
```

#### 4.2 Create Release Workflow

**File**: `.github/workflows/hive-release.yml`

```yaml
name: Hive Release

on:
  push:
    tags:
      - 'hive-v*'

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
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Install dependencies
        working-directory: ./hive
        run: pnpm install

      - name: Import macOS certificates
        env:
          MACOS_CERTIFICATE: ${{ secrets.MACOS_CERTIFICATE }}
          MACOS_CERTIFICATE_PASSWORD: ${{ secrets.MACOS_CERTIFICATE_PASSWORD }}
        run: |
          echo $MACOS_CERTIFICATE | base64 --decode > certificate.p12
          security create-keychain -p "" build.keychain
          security default-keychain -s build.keychain
          security unlock-keychain -p "" build.keychain
          security import certificate.p12 -k build.keychain -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
          security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" build.keychain
          rm certificate.p12

      - name: Publish
        working-directory: ./hive
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: pnpm run publish
```

### Success Criteria:

#### Automated Verification:
- [ ] Workflow file exists: `ls .github/workflows/hive-release.yml`
- [ ] YAML syntax valid: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/hive-release.yml'))"`

#### Manual Verification:
- [ ] Workflow file contains all required secrets references
- [ ] Trigger configured for `hive-v*` tags

---

## Phase 5: Configure GitHub Secrets

### Overview
Add required secrets to GitHub repository for CI/CD.

### Steps:

#### 5.1 Export Certificate as .p12

```bash
# Open Keychain Access
# Find "Developer ID Application: Your Name"
# Right-click → Export
# Save as Certificates.p12 with a strong password
# Note the password - you'll need it for MACOS_CERTIFICATE_PASSWORD
```

#### 5.2 Encode Certificate for GitHub

```bash
base64 -i Certificates.p12 | pbcopy
# This copies the base64 string to clipboard
```

#### 5.3 Add Secrets to GitHub

Go to: `https://github.com/desplega-ai/ai-toolbox/settings/secrets/actions`

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `MACOS_CERTIFICATE` | Base64-encoded `.p12` (from step 5.2) |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting `.p12` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password from Phase 1 |
| `APPLE_TEAM_ID` | Your 10-character Team ID |

### Success Criteria:

#### Manual Verification:
- [ ] All 5 secrets added to GitHub repository settings
- [ ] Certificate file deleted from local machine after encoding

---

## Phase 6: (Optional) Auto-Updates

### Overview
Add automatic update checking so users are notified of new versions.

### Changes Required:

#### 6.1 Add Auto-Update to Main Process

**File**: `hive/src/main/index.ts`

Add near the top of the file, after imports:

```typescript
import updateElectronApp from 'update-electron-app';

// Check for updates (works with GitHub Releases)
updateElectronApp({
  updateInterval: '1 hour',
  notifyUser: true,
});
```

That's it - `update-electron-app` automatically:
- Detects your GitHub repository from package.json
- Checks for new releases
- Shows native macOS notification when update is available
- Downloads and installs update on user confirmation

### Success Criteria:

#### Automated Verification:
- [ ] Package installed: `pnpm list update-electron-app`
- [ ] TypeScript compiles: `cd hive && pnpm exec tsc --noEmit`

#### Manual Verification:
- [ ] App checks for updates on launch (visible in dev tools console)

---

## Phase 7: First Release

### Overview
Create the first release to verify everything works.

### Manual Release (Local):

```bash
cd hive
source .env.local

# Set GitHub token (create at https://github.com/settings/tokens)
# Token needs: repo scope (or just public_repo for public repos)
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Publish (builds, signs, notarizes, uploads)
pnpm run publish
```

### Automated Release (CI):

```bash
# Ensure version in package.json is correct
cd hive

# Create and push tag
git add -A
git commit -m "chore: prepare v0.1.0 release"
git tag hive-v0.1.0
git push origin main --follow-tags
```

### Success Criteria:

#### Automated Verification:
- [ ] GitHub Action completes successfully
- [ ] Release created at `https://github.com/desplega-ai/ai-toolbox/releases`

#### Manual Verification:
- [ ] DMG file attached to release
- [ ] ZIP file attached to release
- [ ] Download and install DMG - no Gatekeeper warning
- [ ] App launches and functions correctly

---

## Testing Strategy

### Automated Tests:
- TypeScript compilation: `pnpm exec tsc --noEmit`
- Local build: `pnpm run make`
- Code signature verification: `codesign -v`

### Manual Testing Steps:
1. Download release DMG from GitHub
2. Mount DMG and drag to Applications
3. Launch app from Applications folder
4. Verify no security warnings appear
5. Test core functionality works
6. (If auto-update enabled) Check for update notification with test release

---

## Release Workflow Summary

### For Regular Releases:

```bash
# 1. Update version
cd hive
npm version patch  # or minor/major

# 2. Commit and tag
git add -A
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"
git tag "hive-v$(node -p "require('./package.json').version")"

# 3. Push (triggers CI)
git push origin main --follow-tags

# 4. Review draft release on GitHub
# 5. Publish release when ready
```

### For Testing Locally:

```bash
cd hive
source .env.local
pnpm run make  # Build without publishing
# Test out/make/*.dmg
```

---

## Troubleshooting

### "No identity found for signing"
- Ensure certificate is installed in Keychain Access
- Run `security find-identity -v -p codesigning`

### Notarization fails with "Invalid credentials"
- Verify app-specific password (not Apple ID password)
- Check Team ID is correct
- Ensure Apple ID has accepted latest agreements at developer.apple.com

### GitHub Action fails at certificate import
- Verify MACOS_CERTIFICATE is properly base64 encoded
- Check certificate password is correct
- Ensure certificate hasn't expired

### "App is damaged" on download
- Notarization may not have completed - check Apple's notarization status
- Try: `xattr -cr /Applications/Hive.app`

---

## References

- [GitHub Publisher | Electron Forge](https://www.electronforge.io/config/publishers/github)
- [Signing macOS Apps | Electron Forge](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Auto Update | Electron Forge](https://www.electronforge.io/advanced/auto-update)
- [update-electron-app | GitHub](https://github.com/electron/update-electron-app)
- Related research: `thoughts/shared/research/2025-12-15-hive-release-deployment.md`
