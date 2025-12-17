#!/usr/bin/env bun

import { $ } from "bun";

const APP_DIR = "/opt/agent-swarm";
const SERVICE_FILE = "/etc/systemd/system/agent-swarm.service";
const SCRIPT_DIR = import.meta.dir;
const PROJECT_DIR = `${SCRIPT_DIR}/..`;

// Detect bun path
const bunPath = (await $`which bun`.text()).trim();
console.log(`Using bun at: ${bunPath}`);

// Copy project files
await $`mkdir -p ${APP_DIR}`;
await $`cp -r ${PROJECT_DIR}/src ${APP_DIR}/`;
await $`cp ${PROJECT_DIR}/package.json ${PROJECT_DIR}/bun.lock ${APP_DIR}/`;

// Install dependencies
await $`cd ${APP_DIR} && bun install --frozen-lockfile --production`;

// Create .env if not exists
const envFile = Bun.file(`${APP_DIR}/.env`);
if (!(await envFile.exists())) {
  await Bun.write(envFile, `PORT=3013
API_KEY=
`);
  console.log("Created .env - set API_KEY for authentication");
}

// Set ownership
await $`chown -R root:root ${APP_DIR}`;

// Install systemd service with detected bun path
const serviceContent = `[Unit]
Description=Agent Swarm MCP Server
After=network.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${APP_DIR}
ExecStart=${bunPath} run start:http
Restart=always
RestartSec=5
EnvironmentFile=${APP_DIR}/.env

[Install]
WantedBy=multi-user.target
`;

await Bun.write(SERVICE_FILE, serviceContent);
await $`systemctl daemon-reload`;
await $`systemctl enable agent-swarm`;
await $`systemctl restart agent-swarm`;

console.log("Installed and running. Edit /opt/agent-swarm/.env and restart if needed.");
