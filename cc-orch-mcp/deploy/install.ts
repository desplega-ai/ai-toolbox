#!/usr/bin/env bun

import { $ } from "bun";

const APP_DIR = "/opt/agent-swarm";
const SERVICE_FILE = "/etc/systemd/system/agent-swarm.service";
const SCRIPT_DIR = import.meta.dir;
const PROJECT_DIR = `${SCRIPT_DIR}/..`;

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
await $`chown -R www-data:www-data ${APP_DIR}`;

// Install systemd service
await $`cp ${SCRIPT_DIR}/agent-swarm.service ${SERVICE_FILE}`;
await $`systemctl daemon-reload`;
await $`systemctl enable agent-swarm`;

console.log("Installed. Edit /opt/agent-swarm/.env then run: systemctl start agent-swarm");
