#!/bin/bash
set -e

echo "🔧 Configuring GitHub authentication for worker agent..."

# Check for GITHUB_TOKEN env var
if [ -z "$GITHUB_TOKEN" ]; then
    echo "⚠️  Warning: GITHUB_TOKEN environment variable is not set"
    echo "   GitHub authentication will not be configured"
    exit 0
fi

# Authenticate with gh using the token
echo "🔐 Authenticating with GitHub CLI..."
echo "$GITHUB_TOKEN" | gh auth login --with-token

# Configure git to use gh as credential helper
echo "🔗 Configuring git credential helper..."
git config --global credential.helper '!gh auth git-credential'

# Set git user configuration
echo "👤 Setting git user configuration..."
git config --global user.email "worker-agent@desplega.ai"
git config --global user.name "Worker Agent"

echo "✅ GitHub authentication configured successfully!"

# Verify configuration
echo "📋 Verifying authentication..."
gh auth status
