# Hive Release Guide

This guide covers everything needed to release signed, notarized macOS builds of Hive.

## One-Time Setup

### 1. Apple Developer Account Setup

You need an Apple Developer account ($99/year) with a Developer ID Application certificate.

#### Create Certificate

1. Open **Keychain Access** on your Mac
2. Go to **Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority**
3. Enter your email, leave CA Email empty, select "Saved to disk"
4. Save the `.certSigningRequest` file

5. Go to [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
6. Click **+** to create a new certificate
7. Select **Developer ID Application** (under Software section)
8. Upload your `.certSigningRequest` file
9. Download the `.cer` file
10. Double-click to install in Keychain Access

#### Verify Certificate

```bash
security find-identity -v -p codesigning
# Should show: "Developer ID Application: Your Name (TEAM_ID)"
```

Note your **Team ID** (10-character code in parentheses).

#### Create App-Specific Password

1. Go to [Apple ID Account](https://appleid.apple.com/account/manage)
2. Sign in with your Apple ID
3. Go to **Sign-In and Security > App-Specific Passwords**
4. Click **Generate an app-specific password**
5. Name it "Hive Notarization"
6. Save the generated password (format: `xxxx-xxxx-xxxx-xxxx`)

### 2. Local Environment Setup

Create `hive/.env.local` (DO NOT COMMIT):

```bash
export APPLE_ID="your-apple-id@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password
export APPLE_TEAM_ID="XXXXXXXXXX"            # 10-character Team ID
```

Add to `.gitignore` if not already there:
```
.env.local
```

### 3. GitHub Secrets Setup (for CI/CD)

#### Export Certificate as .p12

1. Open Keychain Access
2. Find "Developer ID Application: Your Name"
3. Right-click > Export
4. Save as `Certificates.p12` with a strong password

#### Encode for GitHub

```bash
base64 -i Certificates.p12 | pbcopy
# Copies base64 string to clipboard
```

#### Add Secrets to GitHub

Go to: `https://github.com/desplega-ai/ai-toolbox/settings/secrets/actions`

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `MACOS_CERTIFICATE` | Base64-encoded `.p12` (from clipboard) |
| `MACOS_CERTIFICATE_PASSWORD` | Password used when exporting `.p12` |
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Your 10-character Team ID |

Delete the `Certificates.p12` file after encoding.

---

## Releasing

### Automated Release (CI/CD)

Push a tag starting with `hive-v` to trigger automatic build and release:

```bash
cd hive

# 1. Update version in package.json
npm version patch  # or minor/major

# 2. Commit and tag
git add -A
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"
git tag "hive-v$(node -p "require('./package.json').version")"

# 3. Push (triggers GitHub Actions)
git push origin main --follow-tags
```

The workflow will:
1. Build the app
2. Sign with your Developer ID certificate
3. Notarize with Apple
4. Create a draft GitHub release with DMG and ZIP attached

Go to [GitHub Releases](https://github.com/desplega-ai/ai-toolbox/releases) to review and publish.

### Manual Release (Local)

For testing or when CI isn't available:

```bash
cd hive
source .env.local

# Create a GitHub token at https://github.com/settings/tokens
# Token needs: repo scope
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Build, sign, notarize, and upload to GitHub
pnpm run publish
```

### Local Build Only (No Upload)

To test the build without uploading:

```bash
cd hive
source .env.local

pnpm run make
```

Output will be in `out/make/`.

---

## Verification

### Verify Code Signing

```bash
codesign -dv --verbose=4 out/Hive-darwin-arm64/Hive.app
```

### Verify Notarization

```bash
spctl -a -v out/Hive-darwin-arm64/Hive.app
# Expected: "out/Hive-darwin-arm64/Hive.app: accepted"
```

### Test Installed App

1. Download DMG from GitHub Releases
2. Mount and drag to Applications
3. Launch - should open without "unidentified developer" warning

---

## Troubleshooting

### "No identity found for signing"
- Ensure certificate is installed in Keychain Access
- Run `security find-identity -v -p codesigning`

### Notarization fails with "Invalid credentials"
- Verify app-specific password (not your Apple ID password)
- Check Team ID is correct
- Ensure you've accepted latest agreements at developer.apple.com

### GitHub Action fails at certificate import
- Verify MACOS_CERTIFICATE is properly base64 encoded
- Check certificate password is correct
- Ensure certificate hasn't expired

### "App is damaged" on download
- Notarization may not have completed
- Try: `xattr -cr /Applications/Hive.app`
