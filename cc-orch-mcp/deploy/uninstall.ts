#!/usr/bin/env bun

import { $ } from "bun";

await $`systemctl stop agent-swarm`.nothrow();
await $`systemctl disable agent-swarm`.nothrow();
await $`rm -f /etc/systemd/system/agent-swarm.service`;
await $`systemctl daemon-reload`;

console.log("Service removed. Data remains at /opt/agent-swarm");
