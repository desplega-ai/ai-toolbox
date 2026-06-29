# Playwright's official image ships Chromium + all OS deps, matched to the
# pinned playwright npm version (keep this tag in sync with package.json).
FROM mcr.microsoft.com/playwright:v1.61.1-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PORT=8080

WORKDIR /app

# Install runtime deps only (tsx + playwright). Browsers are already in the image,
# so PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD avoids a redundant download.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Entrypoint supervises two processes: a Chromium CDP server + the screenshot
# server that connects to it (both restart on failure).
CMD ["node", "scripts/supervisor.mjs"]
